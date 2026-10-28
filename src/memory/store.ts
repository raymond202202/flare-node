/**
 * Flare 记忆系统
 * 
 * SQLite 存储，支持会话管理和 FTS5 全文搜索。
 * 参考：Hermes 的 SQLite + FTS5 设计
 */

import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { config } from '../core/config.js'
import { Message, estimateCostUsd } from '../core/llm.js'
import { detectProvider } from '../core/models.js'

const DB_PATH = join(config.flareHome, 'flare.db')

interface SessionRow {
  id: string
  title: string
  created_at: string
  updated_at: string
}

interface MemoryRow {
  id: number
  content: string
  type: string
  created_at: string
}

/** 相似记忆对（v0.6.121，findSimilarMemories 返回项；similarity 为 0~1 相似度） */
export interface SimilarMemoryPair {
  idA: number
  idB: number
  contentA: string
  contentB: string
  similarity: number
}

/**
 * 字符 3-gram 集合 Jaccard 相似度（v0.6.121，记忆去重检测面）
 *
 * 中文友好：按字符取连续 3 字子串集合（去除空白），相似度 = 交集大小 / 并集大小。
 * - 完全相同的文本 → 1
 * - 无共同 3-gram → 0
 * - 长度 < 3 的文本用整段作单个 gram（短串间仍可判同/异）
 */
export function trigramJaccard(a: string, b: string): number {
  const gramsA = trigrams(a)
  const gramsB = trigrams(b)
  if (gramsA.size === 0 && gramsB.size === 0) return 1
  if (gramsA.size === 0 || gramsB.size === 0) return 0
  let inter = 0
  for (const g of gramsA) {
    if (gramsB.has(g)) inter++
  }
  const union = gramsA.size + gramsB.size - inter
  return union === 0 ? 1 : inter / union
}

function trigrams(text: string): Set<string> {
  const t = (text || '').replace(/\s+/g, '')
  if (t.length < 3) return new Set(t ? [t] : [])
  const set = new Set<string>()
  for (let i = 0; i <= t.length - 3; i++) set.add(t.slice(i, i + 3))
  return set
}

/** P0（v0.6.29）：缓存/成本用量附加字段（logUsage 可选扩展，缺省行为与旧版一致） */
export interface UsageExtra {
  /** 缓存命中 input tokens（DeepSeek prompt_cache_hit_tokens / OpenAI cached_tokens） */
  cacheReadTokens?: number
  /** 缓存写入 tokens（Anthropic 风格；多数端点无） */
  cacheWriteTokens?: number
  /** 估算成本 USD（无法可靠估算的模型 null） */
  estimatedCostUsd?: number | null
}

/**
 * content 序列化：多模态数组（含图片）存 JSON，纯文本原样
 * 图片 part 用占位符替代——不把 base64 图片数据落库（防止 SQLite 膨胀、FTS 污染）
 */
export function serializeContent(content: Message['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content || '')
  const parts = content.map(p => {
    if (p && p.type === 'text') return p.text
    return '[图片]'
  })
  return JSON.stringify({ type: 'multimodal', parts })
}

/** content 反序列化：多模态 JSON → 拼接文本（图片已占位）；老数据字符串原样 */
export function deserializeContent(raw: string): Message['content'] {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.type === 'multimodal' && Array.isArray(parsed.parts)) {
      return parsed.parts.join('')
    }
    return raw
  } catch {
    return raw
  }
}

export class MemoryStore {
  /** v0.6.163: 换 node:sqlite（Node 内置，去掉 27 MB native 依赖与 ABI 坑） */
  private db: DatabaseSync
  private closed = false

  constructor(dbPath?: string) {
    const path = dbPath || DB_PATH
    // 自动创建父目录（node:sqlite 不会自动建目录；支持任意外部路径如 ~/.pulse/pulse-ai.db）
    try {
      const dir = dirname(path)
      if (dir && dir !== '.') mkdirSync(dir, { recursive: true })
    } catch { /* 目录创建失败不阻塞（DB 打开时会报错） */ }
    const isNew = !existsSync(path)
    this.db = new DatabaseSync(path)
    // 保持 better-sqlite3 的默认行为：并发写入等 5 s 再报 SQLITE_BUSY
    this.db.exec('PRAGMA busy_timeout = 5000')
    
    // 总是执行建表 + 迁移（CREATE TABLE IF NOT EXISTS 是幂等的，
    // migrate() 会为老库补充缺失的列）
    this.init()
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT DEFAULT '新会话',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        archived INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_call_id TEXT,
        name TEXT,
        tool_calls TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'note',
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- RAG（v0.5.1）：memories 中文全文检索索引（trigram tokenizer）
      -- 默认 unicode61 tokenizer 对中文检索效果差（整段 CJK 被当一个 token）；
      -- trigram 支持中文 3 字以上子串匹配（<3 字查询在代码里 LIKE 回退）
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content,
        content='memories',
        content_rowid='id',
        tokenize='trigram'
      );

      CREATE TABLE IF NOT EXISTS usage_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        model TEXT,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost_usd REAL,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content,
        content='messages',
        content_rowid='id'
      );

      -- RAG（v0.5.1）：历史消息中文全文检索索引（trigram tokenizer）
      -- 老表 messages_fts 用默认 tokenizer，中文检索效果差（整段 CJK 当一个 token）；
      -- 新增 trigram 表做中文子串匹配（不动老表，避免迁移风险）
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts_trigram USING fts5(
        content,
        content='messages',
        content_rowid='id',
        tokenize='trigram'
      );

      -- FTS 同步触发器：messages 表 INSERT/DELETE 时同步索引
      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
        INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
      END;

      -- memories_fts 同步触发器（RAG）：INSERT/DELETE/UPDATE 时同步索引
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
        INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
      END;

      -- messages_fts_trigram 同步触发器（RAG）：INSERT/DELETE/UPDATE 时同步索引
      CREATE TRIGGER IF NOT EXISTS messages_fts_trigram_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts_trigram(rowid, content) VALUES (new.id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS messages_fts_trigram_ad AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts_trigram(messages_fts_trigram, rowid, content) VALUES('delete', old.id, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS messages_fts_trigram_au AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts_trigram(messages_fts_trigram, rowid, content) VALUES('delete', old.id, old.content);
        INSERT INTO messages_fts_trigram(rowid, content) VALUES (new.id, new.content);
      END;

      CREATE INDEX IF NOT EXISTS idx_messages_session 
        ON messages(session_id, created_at);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `)

    // 老库迁移：检查是否有 tool_call_id / name 列
    this.migrate()

    // RAG 回填：老库升级时已有数据但 trigram FTS 表刚创建为空 → rebuild 索引
    try {
      const ftsMem = (this.db.prepare('SELECT count(*) AS c FROM memories_fts').get() as any)?.c || 0
      const memCount = (this.db.prepare('SELECT count(*) AS c FROM memories').get() as any)?.c || 0
      if (memCount > 0 && ftsMem === 0) {
        this.db.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')")
      }
      const ftsMsg = (this.db.prepare('SELECT count(*) AS c FROM messages_fts_trigram').get() as any)?.c || 0
      const msgCount = (this.db.prepare('SELECT count(*) AS c FROM messages').get() as any)?.c || 0
      if (msgCount > 0 && ftsMsg === 0) {
        this.db.exec("INSERT INTO messages_fts_trigram(messages_fts_trigram) VALUES('rebuild')")
      }
    } catch { /* FTS 回填失败不阻塞（检索时 LIKE 回退） */ }
  }

  /** 老版本数据库迁移：补充缺失的列 */
  private migrate() {
    const cols = this.db.prepare('PRAGMA table_info(messages)').all() as any[]
    const colNames = cols.map(c => c.name)
    if (!colNames.includes('tool_call_id')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN tool_call_id TEXT')
    }
    if (!colNames.includes('name')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN name TEXT')
    }
    // P0（v0.6.29）：usage_log 补缓存/成本列（老库升级，ALTER 幂等）
    const ucols = this.db.prepare('PRAGMA table_info(usage_log)').all() as any[]
    const ucolNames = ucols.map(c => c.name)
    if (!ucolNames.includes('cache_read_tokens')) {
      this.db.exec('ALTER TABLE usage_log ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0')
    }
    if (!ucolNames.includes('cache_write_tokens')) {
      this.db.exec('ALTER TABLE usage_log ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0')
    }
    if (!ucolNames.includes('estimated_cost_usd')) {
      this.db.exec('ALTER TABLE usage_log ADD COLUMN estimated_cost_usd REAL')
    }

    // v0.6.31：sessions 补 archived 列（会话归档 API，老库升级 ALTER 幂等）
    const scols = this.db.prepare('PRAGMA table_info(sessions)').all() as any[]
    const scolNames = scols.map(c => c.name)
    if (!scolNames.includes('archived')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
    }
  }

  /** 创建新会话 */
  createSession(title?: string): string {
    const id = `flare_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const stmt = this.db.prepare(
      'INSERT INTO sessions (id, title) VALUES (?, ?)'
    )
    stmt.run(id, title || '新会话')
    return id
  }

  /** 列出所有会话（含消息数），按更新时间倒序 */
  getAllSessions(): { id: string; title: string; createdAt: string; updatedAt: string; messageCount: number; archived: boolean }[] {
    const rows = this.db.prepare(`
      SELECT s.id, s.title, s.created_at, s.updated_at, s.archived,
             (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
      FROM sessions s
      ORDER BY s.updated_at DESC
    `).all() as any[]
    return rows.map(r => ({
      id: r.id,
      title: r.title || '新会话',
      createdAt: r.created_at || '',
      updatedAt: r.updated_at || '',
      messageCount: Number(r.message_count) || 0,
      archived: Number(r.archived) === 1,
    }))
  }

  /** 按标题/消息内容搜索会话（v0.6.43）：LIKE 匹配标题或会话内消息内容（DISTINCT 去重），结构同 getAllSessions，按更新时间倒序 */
  searchSessions(query: string, limit = 20): { id: string; title: string; createdAt: string; updatedAt: string; messageCount: number; archived: boolean }[] {
    const q = (query || '').trim()
    if (!q) return []
    const rows = this.db.prepare(`
      SELECT DISTINCT s.id, s.title, s.created_at, s.updated_at, s.archived,
             (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      WHERE s.title LIKE ? OR m.content LIKE ?
      ORDER BY s.updated_at DESC LIMIT ?
    `).all(`%${q}%`, `%${q}%`, limit) as any[]
    return rows.map(r => ({
      id: r.id,
      title: r.title || '新会话',
      createdAt: r.created_at || '',
      updatedAt: r.updated_at || '',
      messageCount: Number(r.message_count) || 0,
      archived: Number(r.archived) === 1,
    }))
  }

  /**
   * 归档会话（v0.6.31）：标记 archived=1，会话数据保留（消息/用量都在），
   * 从「最近会话」隐藏但可 listArchivedSessions 找回 / restoreSession 恢复。
   * 返回是否真的标记了（会话不存在返回 false，幂等不抛错）。
   */
  archiveSession(sessionId: string): boolean {
    const res = this.db.prepare(
      'UPDATE sessions SET archived = 1, updated_at = datetime(\'now\') WHERE id = ? AND archived = 0'
    ).run(sessionId)
    return res.changes > 0
  }

  /** 恢复归档会话（v0.6.31）：标记 archived=0，重新出现在最近会话。不存在幂等返回 false。 */
  restoreSession(sessionId: string): boolean {
    const res = this.db.prepare(
      'UPDATE sessions SET archived = 0, updated_at = datetime(\'now\') WHERE id = ? AND archived = 1'
    ).run(sessionId)
    return res.changes > 0
  }

  /** 列出归档会话（v0.6.31，结构同 getRecentSessions 含首条 user 消息预览），按更新时间倒序 */
  listArchivedSessions(limit = 50): SessionRow[] {
    return this.db.prepare(
      `SELECT s.id, s.title, s.updated_at,
        (SELECT content FROM messages m
         WHERE m.session_id = s.id AND m.role = 'user'
         ORDER BY m.id LIMIT 1) as first_user_msg
       FROM sessions s
       WHERE s.archived = 1
       ORDER BY s.updated_at DESC LIMIT ?`
    ).all(limit) as unknown as SessionRow[]
  }

  /** 更新会话标题（UPSERT：会话记录不存在时同时创建，避免 UPDATE 0 行） */
  updateSessionTitle(sessionId: string, title: string) {
    this.db.prepare(`
      INSERT INTO sessions (id, title, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = datetime('now')
    `).run(sessionId, title)
  }

  /**
   * 删除会话（含消息、用量记录）
   *
   * 会话清理：宿主管理会话列表 / 清除隐私数据时使用。
   * - 删除顺序：messages（DELETE 触发器自动清 messages_fts / messages_fts_trigram 索引）→ usage_log → sessions
   * - 事务原子删除：任一失败整体回滚，不残留半删状态
   * - 返回是否真的删除了会话记录（会话不存在返回 false）
   */
  deleteSession(sessionId: string): boolean {
    // node:sqlite 没有 .transaction() 高阶包装，手写 BEGIN/COMMIT/ROLLBACK（全项目仅此 1 处）
    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
      this.db.prepare('DELETE FROM usage_log WHERE session_id = ?').run(sessionId)
      const res = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
      this.db.exec('COMMIT')
      return Number(res.changes) > 0
    } catch (e) {
      try { this.db.exec('ROLLBACK') } catch { /* 已回滚 */ }
      throw e
    }
  }

  /**
   * 清空会话消息（保留会话记录与用量统计；返回删除条数；FTS 触发器联动清索引）。
   * v0.6.18：宿主"清空对话（保留会话）"数据源——与 deleteSession（整个会话删除）区分。
   */
  clearSessionMessages(sessionId: string): number {
    const res = this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
    // 清空后刷新会话 updated_at（会话仍在最近列表，排序反映清空操作；空/不存在会话幂等）
    this.db.prepare("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?").run(sessionId)
    return Number(res.changes) || 0
  }

  /** 保存消息到会话 */
  saveMessage(sessionId: string, message: Message) {
    // 自动创建会话（幂等）：外部应用传固定 sessionId（如 pulse-ai）时，
    // 首次写入若不创建 sessions 记录会触发 FOREIGN KEY constraint failed
    this.db.prepare(
      'INSERT OR IGNORE INTO sessions (id, title) VALUES (?, ?)'
    ).run(sessionId, '新会话')

    const stmt = this.db.prepare(
      'INSERT INTO messages (session_id, role, content, tool_call_id, name, tool_calls) VALUES (?, ?, ?, ?, ?, ?)'
    )
    stmt.run(
      sessionId,
      message.role,
      serializeContent(message.content),
      message.tool_call_id || null,
      message.name || null,
      message.tool_calls ? JSON.stringify(message.tool_calls) : null
    )

    // 更新会话时间
    this.db.prepare(
      'UPDATE sessions SET updated_at = datetime(\'now\') WHERE id = ?'
    ).run(sessionId)
  }

  /** 获取会话消息历史（最早 limit 条，时间正序） */
  getMessages(sessionId: string, limit = 50): Message[] {
    const rows = this.db.prepare(
      'SELECT role, content, tool_call_id, name, tool_calls FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?'
    ).all(sessionId, limit) as any[]

    return rows.map(r => ({
      role: r.role as Message['role'],
      content: deserializeContent(r.content || ''),
      ...(r.tool_call_id ? { tool_call_id: r.tool_call_id } : {}),
      ...(r.name ? { name: r.name } : {}),
      ...(r.tool_calls ? { tool_calls: JSON.parse(r.tool_calls) } : {}),
    }))
  }

  /**
   * 获取会话消息历史（含自增 id，v0.6.35）——结构同 getMessages（最早 limit 条，时间正序）。
   * 宿主/Agent 执行上下文裁剪（apply_trim）时需要 id 才能在 store 精确定位被裁消息。
   */
  getMessagesWithIds(sessionId: string, limit = 50): { id: number; message: Message }[] {
    const rows = this.db.prepare(
      'SELECT id, role, content, tool_call_id, name, tool_calls FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?'
    ).all(sessionId, limit) as any[]

    return rows.map(r => ({
      id: Number(r.id),
      message: {
        role: r.role as Message['role'],
        content: deserializeContent(r.content || ''),
        ...(r.tool_call_id ? { tool_call_id: r.tool_call_id } : {}),
        ...(r.name ? { name: r.name } : {}),
        ...(r.tool_calls ? { tool_calls: JSON.parse(r.tool_calls) } : {}),
      },
    }))
  }

  /**
   * 按 id 删除会话消息（v0.6.35）——上下文裁剪的 store 同步（apply_trim 只删明确被裁的；
   * 空数组/不存在幂等返回 0；FTS 触发器联动清索引）。
   */
  deleteMessages(sessionId: string, ids: number[]): number {
    if (!ids || ids.length === 0) return 0
    const uniq = [...new Set(ids)]
    const placeholders = uniq.map(() => '?').join(',')
    const res = this.db.prepare(
      `DELETE FROM messages WHERE session_id = ? AND id IN (${placeholders})`
    ).run(sessionId, ...uniq)
    return Number(res.changes) || 0
  }

  /**
   * 获取会话**最近**的消息（v0.6.21）：时间倒序取最近 limit 条后反转回正序返回——
   * 宿主面板\"最近对话/当前上下文\"数据源（区别于 getMessages 取最早 limit 条，
   * 长会话下 getMessages 看到的是开头而非最新内容）。空/不存在会话幂等返回 []。
   */
  getRecentMessages(sessionId: string, limit = 50): Message[] {
    // 同秒插入多条时 created_at 相同——用自增 id 作次级排序（id 越大越新），顺序确定
    const rows = this.db.prepare(
      'SELECT role, content, tool_call_id, name, tool_calls FROM messages WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT ?'
    ).all(sessionId, limit) as any[]

    return rows.reverse().map(r => ({
      role: r.role as Message['role'],
      content: deserializeContent(r.content || ''),
      ...(r.tool_call_id ? { tool_call_id: r.tool_call_id } : {}),
      ...(r.name ? { name: r.name } : {}),
      ...(r.tool_calls ? { tool_calls: JSON.parse(r.tool_calls) } : {}),
    }))
  }

  /**
   * 全文检索历史消息（RAG，v0.5.1）
   *
   * 按关键词在 messages_fts_trigram（trigram tokenizer）中检索历史对话，
   * bm25 相关度排序。用于"找回旧对话"——宿主导航、Agent 按主题回忆等。
   * - 查询 ≥3 个字符：FTS 精确子串匹配（中文友好）
   * - 查询 <3 个字符：LIKE 回退
   * - 返回：content（消息内容）+ sessionId + role + createdAt（消息时间）
   */
  searchMessages(query: string, limit = 10): { sessionId: string; role: string; content: string; createdAt: string }[] {
    const q = (query || '').trim()
    if (!q) return []

    if ([...q].length >= 3) {
      try {
        const rows = this.db.prepare(
          `SELECT m.session_id, m.role, m.content, m.created_at, bm25(messages_fts_trigram) AS score
           FROM messages_fts_trigram
           JOIN messages m ON m.id = messages_fts_trigram.rowid
           WHERE messages_fts_trigram MATCH ?
           ORDER BY score ASC, m.created_at DESC
           LIMIT ?`
        ).all(`"${q.replace(/"/g, '""')}"`, limit) as any[]
        if (rows.length > 0) {
          return rows.map(r => ({
            sessionId: r.session_id,
            role: r.role,
            content: String(deserializeContent(r.content || '')),
            createdAt: r.created_at || '',
          }))
        }
      } catch { /* FTS 失败 → LIKE 回退 */ }
    }

    // 短查询 / FTS 无结果：LIKE 回退
    try {
      const rows = this.db.prepare(
        `SELECT session_id, role, content, created_at
         FROM messages
         WHERE content LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`
      ).all(`%${q}%`, limit) as any[]
      return rows.map(r => ({
        sessionId: r.session_id,
        role: r.role,
        content: String(deserializeContent(r.content || '')),
        createdAt: r.created_at || '',
      }))
    } catch {
      return []
    }
  }

  /** 获取最近会话（v0.6.31：排除归档会话） */
  getRecentSessions(limit = 10): SessionRow[] {
    // 为每个会话取第一条 user 消息作为标题（人类可读，用于区分会话）
    return this.db.prepare(
      `SELECT s.id, s.title, s.updated_at,
        (SELECT content FROM messages m
         WHERE m.session_id = s.id AND m.role = 'user'
         ORDER BY m.id LIMIT 1) as first_user_msg
       FROM sessions s
       WHERE s.archived = 0
       ORDER BY s.updated_at DESC LIMIT ?`
    ).all(limit) as unknown as SessionRow[]
  }

  /** 保存持久记忆 */
  saveMemory(content: string, type = 'note') {
    this.db.prepare(
      'INSERT INTO memories (content, type) VALUES (?, ?)'
    ).run(content, type)
  }

  /**
   * 删除单条持久记忆（按 id）
   *
   * - 记忆删除（v0.5.4）：memories 的 DELETE 触发器自动清 memories_fts 索引
   * - 返回是否真的删除了（id 不存在返回 false，幂等不抛错）
   */
  deleteMemory(id: number): boolean {
    const res = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id)
    return res.changes > 0
  }

  /**
   * 按内容关键词批量删除记忆（LIKE 匹配，v0.5.4）
   *
   * 用于 CLI /forget <关键词>、宿主按主题清理记忆。
   * - 返回删除条数（0 = 无匹配）
   * - FTS 索引由 DELETE 触发器联动清理（删除后 searchMemories 不再命中）
   */
  deleteMemoriesByContent(query: string): number {
    const q = (query || '').trim()
    if (!q) return 0
    const res = this.db.prepare('DELETE FROM memories WHERE content LIKE ?').run(`%${q}%`)
    return Number(res.changes)
  }

  /** 记录一次 LLM 调用的 token 用量（v0.6.29 起支持缓存/成本附加字段） */
  logUsage(sessionId: string | null, promptTokens: number, completionTokens: number, model?: string, extra?: UsageExtra) {
    this.db.prepare(
      `INSERT INTO usage_log (session_id, prompt_tokens, completion_tokens, model, cache_read_tokens, cache_write_tokens, estimated_cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sessionId,
      promptTokens,
      completionTokens,
      model || null,
      extra?.cacheReadTokens || 0,
      extra?.cacheWriteTokens || 0,
      extra?.estimatedCostUsd != null ? extra.estimatedCostUsd : null
    )
  }

  /**
   * 估算「缓存命中省下的成本」（v0.6.64，方向① prompt caching 基建深化）：
   * 对每个模型分别按 estimateCostUsd 算「未命中成本 - 命中成本」差值并求和——
   * 定价只依赖 model + prompt/completion/cacheRead 三个 token 数且线性，perModel 聚合后计算精确；
   * 无法定价的模型（estimateCostUsd 返回 null，如本地 Ollama）跳过不计入（贡献 0）。
   * 纯函数不触网；返回 6 位四舍五入 USD（无可定价模型时 0）。
   */
  private estimateCacheSavedUsd(rows: { model: string; promptTokens: number; completionTokens: number; cacheReadTokens: number }[]): number {
    let saved = 0
    for (const m of rows) {
      const miss = estimateCostUsd(m.model, m.promptTokens, m.completionTokens, 0)
      const hit = estimateCostUsd(m.model, m.promptTokens, m.completionTokens, m.cacheReadTokens)
      if (miss !== null && hit !== null) saved += miss - hit
    }
    return Math.round(saved * 1e6) / 1e6
  }

  /**
   * 按 provider 聚合 perModel 分解（v0.6.136，方向② usage 按 provider 拆分统计）：
   * 本地（ollama）vs 线上（deepseek/openai/other）token 分别统计——混合模式成本收益评估。
   * 纯函数：perModel 已按模型聚合，此处按 detectProvider 再归并（无网络、无额外查询）。
   */
  private groupByProvider(perModel: { model: string; calls: number; promptTokens: number; completionTokens: number; cacheReadTokens: number; cacheWriteTokens: number; totalTokens: number; cacheSavedUsd: number }[]) {
    const map = new Map<string, {
      provider: string
      calls: number
      promptTokens: number
      completionTokens: number
      cacheReadTokens: number
      cacheWriteTokens: number
      totalTokens: number
      cacheSavedUsd: number
    }>()
    for (const m of perModel) {
      const p = detectProvider(m.model)
      const g = map.get(p) || {
        provider: p,
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        cacheSavedUsd: 0,
      }
      g.calls += m.calls
      g.promptTokens += m.promptTokens
      g.completionTokens += m.completionTokens
      g.cacheReadTokens += m.cacheReadTokens
      g.cacheWriteTokens += m.cacheWriteTokens
      g.totalTokens += m.totalTokens
      g.cacheSavedUsd = Math.round((g.cacheSavedUsd + m.cacheSavedUsd) * 1e6) / 1e6
      map.set(p, g)
    }
    return [...map.values()].sort((a, b) => b.totalTokens - a.totalTokens)
  }

  /** 汇总 token 用量（v0.6.18 起含 perModel 按模型分解；v0.6.29 起含缓存/成本汇总；v0.6.64 起含缓存节省估算） */
  getUsageStats() {
    const row = this.db.prepare(
      `SELECT
         COALESCE(SUM(prompt_tokens), 0) as promptTokens,
         COALESCE(SUM(completion_tokens), 0) as completionTokens,
         COALESCE(SUM(cache_read_tokens), 0) as cacheReadTokens,
         COALESCE(SUM(cache_write_tokens), 0) as cacheWriteTokens,
         COALESCE(SUM(estimated_cost_usd), 0) as estimatedCostUsd,
         COUNT(*) as sessionCount
       FROM usage_log`
    ).get() as any
    // 按模型分组（v0.6.18）：每个模型的调用次数 + token 分解（成本核算/用量分布）
    const rows = this.db.prepare(
      `SELECT COALESCE(model, 'unknown') as model,
              COUNT(*) as calls,
              COALESCE(SUM(prompt_tokens), 0) as promptTokens,
              COALESCE(SUM(completion_tokens), 0) as completionTokens,
              COALESCE(SUM(cache_read_tokens), 0) as cacheReadTokens,
              COALESCE(SUM(cache_write_tokens), 0) as cacheWriteTokens
       FROM usage_log
       GROUP BY model
       ORDER BY calls DESC`
    ).all() as any[]
    const perModel = rows.map((m) => ({
      model: m.model,
      calls: m.calls,
      promptTokens: m.promptTokens,
      completionTokens: m.completionTokens,
      cacheReadTokens: m.cacheReadTokens,
      // v0.6.131：perModel 分解补缓存写入（与汇总 cacheWriteTokens 对称——观测首轮写入成本）
      cacheWriteTokens: m.cacheWriteTokens,
      totalTokens: m.promptTokens + m.completionTokens,
      // v0.6.65：本模型缓存节省（同口径单模型差值；无法定价 → 0）
      cacheSavedUsd: this.estimateCacheSavedUsd([m]),
    }))
    return {
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheWriteTokens: row.cacheWriteTokens,
      estimatedCostUsd: row.estimatedCostUsd,
      // v0.6.64：缓存命中省下的成本（未命中价 vs 命中价的差；无法定价模型不计入）
      cacheSavedUsd: this.estimateCacheSavedUsd(perModel),
      totalTokens: row.promptTokens + row.completionTokens,
      sessionCount: row.sessionCount,
      perModel,
      // v0.6.136：按 provider 拆分（本地 ollama vs 线上 deepseek/openai/other——混合模式成本收益评估）
      perProvider: this.groupByProvider(perModel),
    }
  }

  /** 单个会话的 token 用量（v0.6.17）：按 session_id 过滤 usage_log（宿主面板"本会话用量"数据源；v0.6.29 含缓存；v0.6.52 含 perModel 按模型分解） */
  getSessionUsage(sessionId: string) {
    const row = this.db.prepare(
      `SELECT
         COALESCE(SUM(prompt_tokens), 0) as promptTokens,
         COALESCE(SUM(completion_tokens), 0) as completionTokens,
         COALESCE(SUM(cache_read_tokens), 0) as cacheReadTokens,
         COALESCE(SUM(cache_write_tokens), 0) as cacheWriteTokens,
         COALESCE(SUM(estimated_cost_usd), 0) as estimatedCostUsd,
         COUNT(*) as callCount
       FROM usage_log WHERE session_id = ?`
    ).get(sessionId) as any
    // 按模型分组（v0.6.52）：本会话每个模型的调用次数 + token 分解（与 getUsageStats.perModel 对称，
    // 宿主面板"本会话用量"可看每个模型的缓存命中分布，无需从全局统计里筛）
    const rows = this.db.prepare(
      `SELECT COALESCE(model, 'unknown') as model,
              COUNT(*) as calls,
              COALESCE(SUM(prompt_tokens), 0) as promptTokens,
              COALESCE(SUM(completion_tokens), 0) as completionTokens,
              COALESCE(SUM(cache_read_tokens), 0) as cacheReadTokens,
              COALESCE(SUM(cache_write_tokens), 0) as cacheWriteTokens
       FROM usage_log
       WHERE session_id = ?
       GROUP BY model
       ORDER BY calls DESC`
    ).all(sessionId) as any[]
    const perModel = rows.map((m) => ({
      model: m.model,
      calls: m.calls,
      promptTokens: m.promptTokens,
      completionTokens: m.completionTokens,
      cacheReadTokens: m.cacheReadTokens,
      // v0.6.131：本会话 perModel 分解补缓存写入（与 getUsageStats.perModel 对称）
      cacheWriteTokens: m.cacheWriteTokens,
      totalTokens: m.promptTokens + m.completionTokens,
      // v0.6.65：本模型缓存节省（同口径单模型差值；无法定价 → 0）
      cacheSavedUsd: this.estimateCacheSavedUsd([m]),
    }))
    return {
      sessionId,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheWriteTokens: row.cacheWriteTokens,
      estimatedCostUsd: row.estimatedCostUsd,
      // v0.6.64：本会话缓存命中省下的成本（与 getUsageStats.cacheSavedUsd 同口径）
      cacheSavedUsd: this.estimateCacheSavedUsd(perModel),
      totalTokens: row.promptTokens + row.completionTokens,
      callCount: row.callCount,
      perModel,
      // v0.6.136：按 provider 拆分（与 getUsageStats.perProvider 对称）
      perProvider: this.groupByProvider(perModel),
    }
  }

  /**
   * 全文检索记忆（RAG，v0.5.1）
   *
   * 优先用 memories_fts（trigram tokenizer）做中文全文检索 + bm25 相关度排序：
   * - 查询 ≥3 个字符：FTS 精确子串匹配
   * - 查询 <3 个字符（如 2 字中文）：trigram 无法匹配，LIKE 回退
   * - FTS 异常 / 无结果：LIKE 兜底（不静默失败）
   */
  searchMemories(query: string, limit = 5): MemoryRow[] {
    const q = (query || '').trim()
    if (!q) return []

    // ≥3 字符：FTS trigram 检索（bm25 排序，值越小越相关）
    if ([...q].length >= 3) {
      try {
        const rows = this.db.prepare(
          `SELECT m.*, bm25(memories_fts) AS score
           FROM memories_fts
           JOIN memories m ON m.id = memories_fts.rowid
           WHERE memories_fts MATCH ?
           ORDER BY score ASC
           LIMIT ?`
        ).all(`"${q.replace(/"/g, '""')}"`, limit) as unknown as (MemoryRow & { score: number })[]
        if (rows.length > 0) {
          return rows.map(({ score, ...m }) => m)
        }
      } catch { /* FTS 失败 → LIKE 回退 */ }
    }

    // 短查询 / FTS 无结果：LIKE 回退
    try {
      return this.db.prepare(
        'SELECT * FROM memories WHERE content LIKE ? ORDER BY created_at DESC LIMIT ?'
      ).all(`%${q}%`, limit) as unknown as MemoryRow[]
    } catch {
      return []
    }
  }

  /** 获取相关记忆（RAG 增强版：FTS 全文检索 + 相关度排序） */
  getRelevantMemories(query: string, limit = 5): MemoryRow[] {
    return this.searchMemories(query, limit)
  }

  /**
   * 查找相似记忆对（v0.6.121，记忆去重第一步——检测面，只读）
   *
   * 两两比较全部记忆的内容相似度（trigramJaccard），返回相似度 ≥ threshold 的对，
   * 按相似度降序。宿主/用户据此发现重复/近似记忆，再决定是否手动删除
   * （配合 deleteMemory / deleteMemoriesByContent；自动合并留后续候选）。
   * - threshold：0~1，默认 0.4（中文字符 3-gram 交集占比；「用户偏好浅色主题」vs
   *   「用户偏好浅色主题，还喜欢极简风」≈0.46 可检出，完全重复 = 1.0）
   * - limit：最多返回对数量（默认 20）；每对 idA < idB 不重复
   */
  findSimilarMemories(options: { threshold?: number; limit?: number } = {}): SimilarMemoryPair[] {
    const threshold = options.threshold ?? 0.4
    const limit = options.limit ?? 20
    const mems = this.getAllMemories()
    const pairs: SimilarMemoryPair[] = []
    for (let i = 0; i < mems.length; i++) {
      for (let j = i + 1; j < mems.length; j++) {
        const similarity = trigramJaccard(mems[i].content, mems[j].content)
        if (similarity >= threshold) {
          // 规范化 idA < idB（v0.6.141）：getAllMemories 按 created_at DESC（秒级精度）排序，
          // 同秒插入多条记忆时顺序不稳定——mems[i].id 可能 > mems[j].id，导致 pair 违反
          // 「每对 idA < idB」契约（server.test.ts 偶发失败源，flare 验收提示）。交换保证契约恒成立
          const [a, b] = mems[i].id <= mems[j].id ? [mems[i], mems[j]] : [mems[j], mems[i]]
          pairs.push({
            idA: a.id,
            idB: b.id,
            contentA: a.content,
            contentB: b.content,
            similarity,
          })
        }
      }
    }
    pairs.sort((a, b) => b.similarity - a.similarity)
    return pairs.slice(0, limit)
  }

  /** 获取所有记忆 */
  getAllMemories(): MemoryRow[] {
    return this.db.prepare(
      'SELECT * FROM memories ORDER BY created_at DESC'
    ).all() as unknown as MemoryRow[]
  }

  /** 按类型获取记忆（v0.6.25）：WHERE type = ? 过滤（如 preference 偏好 / note 笔记），
   *  空 type 等价列出全部（与 getAllMemories 一致）；空/无匹配类型幂等返回 [] */
  getMemoriesByType(type: string, limit = 50): MemoryRow[] {
    const t = (type || '').trim()
    if (!t) return this.getAllMemories().slice(0, limit)
    // 同秒插入用自增 id 次级排序保证顺序确定（与 getRecentMessages v0.6.21 同模式）
    return this.db.prepare(
      'SELECT * FROM memories WHERE type = ? ORDER BY created_at DESC, id DESC LIMIT ?'
    ).all(t, limit) as unknown as MemoryRow[]
  }

  /** 读取运行时设置（key-value，如看图模型切换） */
  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
    return row ? row.value : null
  }

  /** 写入运行时设置；value 为空串表示删除（回默认） */
  setSetting(key: string, value: string) {
    if (!value) {
      this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
      return
    }
    this.db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    ).run(key, value)
  }

  close() {
    // better-sqlite3 的 close() 是幂等的；node:sqlite 重复 close 会抛 "database is not open"，
    // 这里保持幂等语义（多处收尾/异常路径可能都调一次）
    if (this.closed) return
    this.closed = true
    try { this.db.close() } catch { /* 已关闭，忽略 */ }
  }
}

// 单例
let _store: MemoryStore | null = null

export function getMemoryStore(): MemoryStore {
  if (!_store) {
    _store = new MemoryStore()
  }
  return _store
}
