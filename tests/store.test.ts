/**
 * MemoryStore 单元测试
 * 覆盖：CRUD、tool_calls 配对、FTS 触发器、用量记录
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryStore, trigramJaccard } from '../src/memory/store.js'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let tempDir: string
let store: MemoryStore

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'flare-test-'))
  store = new MemoryStore(join(tempDir, 'test.db'))
})

afterEach(() => {
  store.close()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('MemoryStore', () => {
  it('创建会话并保存/读取消息', () => {
    const sessionId = store.createSession('测试会话')
    expect(sessionId).toBeTruthy()

    store.saveMessage(sessionId, { role: 'user', content: '你好' })
    store.saveMessage(sessionId, { role: 'assistant', content: '你好！有什么可以帮你？' })

    const messages = store.getMessages(sessionId)
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toBe('你好')
    expect(messages[1].role).toBe('assistant')
  })

  it('保存并恢复 tool_call_id 配对', () => {
    const sessionId = store.createSession('工具测试')

    // assistant 带 tool_calls
    store.saveMessage(sessionId, {
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call_001',
        type: 'function',
        function: { name: 'read_file', arguments: '{"path":"/tmp/x"}' },
      }],
    })
    // tool 响应带 tool_call_id
    store.saveMessage(sessionId, {
      role: 'tool',
      tool_call_id: 'call_001',
      name: 'read_file',
      content: '文件内容',
    })

    const messages = store.getMessages(sessionId)
    expect(messages).toHaveLength(2)
    expect(messages[0].tool_calls?.[0].id).toBe('call_001')
    expect(messages[1].tool_call_id).toBe('call_001')
    expect(messages[1].name).toBe('read_file')
  })

  it('getRecentMessages：取最近 limit 条（时间正序返回，最后一条为最新消息）', () => {
    const sessionId = store.createSession('最近消息测试')
    for (let i = 1; i <= 5; i++) {
      store.saveMessage(sessionId, { role: 'user', content: `消息${i}` })
    }

    const recent = store.getRecentMessages(sessionId, 3)
    expect(recent).toHaveLength(3)
    // 正序返回：最早的是第 3 条，最后一条是最新的第 5 条
    expect(recent.map((m) => m.content)).toEqual(['消息3', '消息4', '消息5'])
  })

  it('getRecentMessages vs getMessages：同 limit 一个取最早一个取最近（差异明确）', () => {
    const sessionId = store.createSession('差异测试')
    for (let i = 1; i <= 4; i++) {
      store.saveMessage(sessionId, { role: 'user', content: `消息${i}` })
    }

    const oldest = store.getMessages(sessionId, 2)
    const recent = store.getRecentMessages(sessionId, 2)
    expect(oldest.map((m) => m.content)).toEqual(['消息1', '消息2'])
    expect(recent.map((m) => m.content)).toEqual(['消息3', '消息4'])
  })

  it('getRecentMessages：缺省 limit=50（少于 50 条全返回）；空会话幂等返回 []', () => {
    const sessionId = store.createSession('默认limit测试')
    store.saveMessage(sessionId, { role: 'user', content: '仅一条' })
    const all = store.getRecentMessages(sessionId)
    expect(all).toHaveLength(1)

    const empty = store.getRecentMessages('s-ghost-recent')
    expect(empty).toEqual([])
  })

  it('FTS 触发器同步索引', () => {
    const sessionId = store.createSession('FTS测试')
    store.saveMessage(sessionId, { role: 'user', content: 'flutter 是一个神奇的框架' })

    // 通过 FTS 表查询
    const rows = store['db'].prepare(
      "SELECT rowid FROM messages_fts WHERE messages_fts MATCH 'flutter'"
    ).all() as any[]
    expect(rows.length).toBeGreaterThan(0)
  })

  it('记忆 CRUD', () => {
    store.saveMemory('用户喜欢浅色主题', 'preference')
    const memories = store.getAllMemories()
    expect(memories).toHaveLength(1)
    expect(memories[0].content).toBe('用户喜欢浅色主题')

    const relevant = store.getRelevantMemories('浅色')
    expect(relevant.length).toBeGreaterThan(0)
  })

  it('用量记录与汇总', () => {
    store.logUsage('s1', 100, 50, 'deepseek-chat')
    store.logUsage('s1', 200, 80, 'deepseek-chat')
    store.logUsage('s2', 300, 120, 'deepseek-chat')

    const stats = store.getUsageStats()
    expect(stats.promptTokens).toBe(600)
    expect(stats.completionTokens).toBe(250)
    expect(stats.totalTokens).toBe(850)
    expect(stats.sessionCount).toBe(3)
  })

  it('用量汇总按模型分解（perModel，v0.6.18：成本核算/用量分布）', () => {
    store.logUsage('s1', 100, 50, 'deepseek-chat')
    store.logUsage('s1', 200, 80, 'deepseek-chat')
    store.logUsage('s2', 300, 120, 'qwen2.5:7b')
    store.logUsage('s3', 10, 5) // 无模型 → unknown

    const stats = store.getUsageStats()
    expect(stats.totalTokens).toBe(865)
    expect(stats.sessionCount).toBe(4)
    expect(Array.isArray(stats.perModel)).toBe(true)
    // 按调用次数降序：deepseek-chat(2) > qwen2.5:7b(1) = unknown(1)
    const names = stats.perModel.map((m: any) => m.model)
    expect(names[0]).toBe('deepseek-chat')
    expect(names).toContain('qwen2.5:7b')
    expect(names).toContain('unknown')
    const ds = stats.perModel.find((m: any) => m.model === 'deepseek-chat')!
    expect(ds.calls).toBe(2)
    expect(ds.promptTokens).toBe(300)
    expect(ds.completionTokens).toBe(130)
    expect(ds.totalTokens).toBe(430)
  })

  it('用量按 provider 拆分（perProvider，v0.6.136：本地 ollama vs 线上 deepseek/other）', () => {
    store.logUsage('s1', 100, 50, 'deepseek-chat')
    store.logUsage('s1', 200, 80, 'qwen2.5:7b') // 含 ':' → ollama（本地）
    store.logUsage('s2', 10, 5) // 无模型 → unknown → other（线上）

    const stats = store.getUsageStats()
    expect(Array.isArray(stats.perProvider)).toBe(true)
    // deepseek(150) > ollama(280) > other(15)：按 totalTokens 降序
    const providers = stats.perProvider.map((p: any) => p.provider)
    expect(providers[0]).toBe('ollama')
    expect(providers).toContain('deepseek')
    expect(providers).toContain('other')
    const local = stats.perProvider.find((p: any) => p.provider === 'ollama')!
    expect(local.totalTokens).toBe(280)
    expect(local.calls).toBe(1)
    const remote = stats.perProvider.find((p: any) => p.provider === 'deepseek')!
    expect(remote.totalTokens).toBe(150)
    // 汇总与 perModel 一致：perProvider 只是重新归并
    const sumTokens = stats.perProvider.reduce((s: number, p: any) => s + p.totalTokens, 0)
    expect(sumTokens).toBe(stats.totalTokens)
  })

  it('单会话用量按 provider 拆分（getSessionUsage.perProvider 与全局对称）', () => {
    store.logUsage('s1', 100, 50, 'deepseek-chat')
    store.logUsage('s1', 200, 80, 'qwen2.5:7b')

    const s1 = store.getSessionUsage('s1')
    expect(Array.isArray(s1.perProvider)).toBe(true)
    const local = s1.perProvider.find((p: any) => p.provider === 'ollama')!
    expect(local.totalTokens).toBe(280)
    expect(local.calls).toBe(1)
    const remote = s1.perProvider.find((p: any) => p.provider === 'deepseek')!
    expect(remote.totalTokens).toBe(150)
    expect(remote.calls).toBe(1)
  })

  it('单会话用量（getSessionUsage）：按 session_id 过滤汇总', () => {
    store.logUsage('s1', 100, 50, 'deepseek-chat')
    store.logUsage('s1', 200, 80, 'deepseek-chat')
    store.logUsage('s2', 300, 120, 'deepseek-chat')

    const s1 = store.getSessionUsage('s1')
    expect(s1.promptTokens).toBe(300)
    expect(s1.completionTokens).toBe(130)
    expect(s1.totalTokens).toBe(430)
    expect(s1.callCount).toBe(2)

    // 未记录的会话：全 0（不抛错，幂等）
    const none = store.getSessionUsage('no_such')
    expect(none.promptTokens).toBe(0)
    expect(none.completionTokens).toBe(0)
    expect(none.totalTokens).toBe(0)
    expect(none.callCount).toBe(0)
  })

  it('用量缓存/成本字段（v0.6.29 P0）：logUsage extra 落库 + 汇总', () => {
    store.logUsage('s1', 1000, 500, 'deepseek-chat', { cacheReadTokens: 800, cacheWriteTokens: 200, estimatedCostUsd: 0.001234 })
    store.logUsage('s1', 2000, 1000, 'deepseek-chat', { cacheReadTokens: 1500, estimatedCostUsd: 0.002 })

    const stats = store.getUsageStats()
    expect(stats.cacheReadTokens).toBe(2300)
    expect(stats.cacheWriteTokens).toBe(200)
    expect(stats.estimatedCostUsd).toBeCloseTo(0.003234, 6)
    // perModel 含缓存分解
    const ds = stats.perModel.find((m: any) => m.model === 'deepseek-chat')
    expect(ds).toBeTruthy()
    expect(ds!.cacheReadTokens).toBe(2300)
    // v0.6.131：perModel 分解补缓存写入（与汇总对称）
    expect(ds!.cacheWriteTokens).toBe(200)

    // 单会话汇总同样带缓存
    const s1 = store.getSessionUsage('s1')
    expect(s1.cacheReadTokens).toBe(2300)
    expect(s1.cacheWriteTokens).toBe(200)
    expect(s1.estimatedCostUsd).toBeCloseTo(0.003234, 6)
    // v0.6.131：单会话 perModel 同样带缓存写入
    const s1Chat = s1.perModel.find((m: any) => m.model === 'deepseek-chat')
    expect(s1Chat!.cacheWriteTokens).toBe(200)
  })

  it('缓存节省估算（v0.6.64）：cacheSavedUsd 命中价 vs 未命中价差值，无法定价模型不计入', () => {
    // deepseek-chat：命中 800+1500=2300 tokens → 节省 2300/1e6 * (0.27-0.07) = 0.00046
    store.logUsage('s1', 1000, 500, 'deepseek-chat', { cacheReadTokens: 800 })
    store.logUsage('s1', 2000, 1000, 'deepseek-chat', { cacheReadTokens: 1500 })
    // deepseek-reasoner：无命中 → 节省 0（命中 0）
    store.logUsage('s1', 300, 150, 'deepseek-reasoner')
    // 本地模型：无法定价（estimateCostUsd → null）→ 即使有命中也不计入
    store.logUsage('s2', 300, 120, 'qwen2.5:7b', { cacheReadTokens: 100 })

    const stats = store.getUsageStats()
    expect(stats.cacheSavedUsd).toBeCloseTo(0.00046, 6)
    // estimatedCostUsd 只反映实际成本，cacheSavedUsd 独立于它（命中价 vs 未命中价）
    expect(stats.cacheSavedUsd).toBeGreaterThan(0)

    // 单会话同口径：s1 命中 2300 → 0.00046；s2 无法定价 → 0
    const s1 = store.getSessionUsage('s1')
    expect(s1.cacheSavedUsd).toBeCloseTo(0.00046, 6)
    const s2 = store.getSessionUsage('s2')
    expect(s2.cacheSavedUsd).toBe(0)

    // perModel 每项带本模型节省（v0.6.65）：chat 0.00046、reasoner 0、qwen 0（无法定价）
    const chatPm = stats.perModel.find((m: any) => m.model === 'deepseek-chat')
    const reasonerPm = stats.perModel.find((m: any) => m.model === 'deepseek-reasoner')
    const qwenPm = stats.perModel.find((m: any) => m.model === 'qwen2.5:7b')
    expect(chatPm!.cacheSavedUsd).toBeCloseTo(0.00046, 6)
    expect(reasonerPm!.cacheSavedUsd).toBe(0)
    expect(qwenPm!.cacheSavedUsd).toBe(0)
  })

  it('单会话 perModel 分解（v0.6.52）：按模型分组 + 缓存命中，与 getUsageStats 对称', () => {
    store.logUsage('s1', 1000, 500, 'deepseek-chat', { cacheReadTokens: 400 })
    store.logUsage('s1', 200, 100, 'deepseek-reasoner')
    store.logUsage('s2', 900, 450, 'deepseek-chat') // 另一会话不影响 s1 分解

    const s1 = store.getSessionUsage('s1')
    expect(Array.isArray(s1.perModel)).toBe(true)
    expect(s1.perModel).toHaveLength(2)
    // deepseek-chat：1 次调用、1000 prompt、400 命中；deepseek-reasoner：1 次调用、无命中
    const chat = s1.perModel.find((m: any) => m.model === 'deepseek-chat')
    const reasoner = s1.perModel.find((m: any) => m.model === 'deepseek-reasoner')
    expect(chat).toBeTruthy()
    expect(chat!.calls).toBe(1)
    expect(chat!.promptTokens).toBe(1000)
    expect(chat!.cacheReadTokens).toBe(400)
    expect(chat!.totalTokens).toBe(1500)
    expect(reasoner).toBeTruthy()
    expect(reasoner!.cacheReadTokens).toBe(0)
    expect(reasoner!.totalTokens).toBe(300)
    // 分解合计与汇总一致
    expect(s1.perModel.reduce((a: number, m: any) => a + m.calls, 0)).toBe(s1.callCount)
    expect(s1.perModel.reduce((a: number, m: any) => a + m.cacheReadTokens, 0)).toBe(s1.cacheReadTokens)

    // 无用量的会话：perModel 空数组（幂等）
    const none = store.getSessionUsage('no_such')
    expect(none.perModel).toEqual([])
  })

  it('老库迁移（v0.6.29 P0）：旧 usage_log 无缓存列 → 打开时自动补列', () => {
    // 先关掉当前 store，手工建一个"老版本"库（usage_log 无 cache_read_tokens 等列）
    store.close()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync: Database } = require('node:sqlite')
    const db = new Database(join(tempDir, 'test.db'))
    db.exec(`
      DROP TABLE IF EXISTS usage_log;
      CREATE TABLE usage_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        model TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `)
    db.prepare('INSERT INTO usage_log (session_id, prompt_tokens, completion_tokens, model) VALUES (?, ?, ?, ?)')
      .run('s-old', 100, 50, 'deepseek-chat')
    db.close()

    // 重新打开 → migrate 自动补列
    const reopened = new MemoryStore(join(tempDir, 'test.db'))
    const stats = reopened.getUsageStats()
    expect(stats.promptTokens).toBe(100)
    expect(stats.cacheReadTokens).toBe(0) // 老数据无缓存 → 0（不报错）
    expect(stats.estimatedCostUsd).toBe(0)
    // 新写入带缓存字段正常
    reopened.logUsage('s-new', 500, 250, 'deepseek-chat', { cacheReadTokens: 300, estimatedCostUsd: 0.0005 })
    const stats2 = reopened.getUsageStats()
    expect(stats2.cacheReadTokens).toBe(300)
    expect(stats2.totalTokens).toBe(900)
    reopened.close()
  })

  it('老库迁移：缺少 tool_call_id 列时自动补充', () => {
    // 模拟旧库：先建表不带 tool_call_id
    const oldDb = store['db']
    oldDb.exec('DROP TABLE IF EXISTS messages')
    oldDb.exec(`CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)

    // 重新打开（触发 init + migrate）
    store.close()
    store = new MemoryStore(join(tempDir, 'test.db'))

    // 验证列已补充
    const cols = store['db'].prepare('PRAGMA table_info(messages)').all() as any[]
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('tool_call_id')
    expect(colNames).toContain('name')
  })
})

describe('MemoryStore 记忆检索增强（RAG, v0.5.1）', () => {
  it('searchMemories：trigram FTS 命中中文 3 字以上子串（bm25 排序）', () => {
    store.saveMemory('用户喜欢浅色主题，偏好深色模式', 'preference')
    store.saveMemory('flutter 是一个神奇的框架，用于跨平台开发', 'note')
    store.saveMemory('用户是 flare 引擎项目负责人', 'note')

    const hits = store.searchMemories('神奇的框架')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].content).toContain('神奇的框架')
  })

  it('searchMemories：FTS 结果按相关度排序（精确命中优先于部分命中）', () => {
    store.saveMemory('用户喜欢浅色主题', 'preference')
    store.saveMemory('浅色主题的护眼设置建议', 'note')
    store.saveMemory('今天天气不错', 'note')

    const hits = store.searchMemories('浅色主题')
    expect(hits.length).toBeGreaterThanOrEqual(2)
    // 第一个命中应该包含完整查询词（bm25 相关度更高）
    expect(hits[0].content).toContain('浅色主题')
  })

  it('searchMemories：2 字中文查询 LIKE 回退（trigram 需 3 字符）', () => {
    store.saveMemory('用户喜欢浅色主题', 'preference')
    store.saveMemory('flutter 框架', 'note')

    const hits = store.searchMemories('主题')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].content).toContain('主题')
  })

  it('searchMemories：FTS 无结果时 LIKE 兜底', () => {
    store.saveMemory('今天天气不错，适合出门散步', 'note')

    // FTS 命中不到（查询词在 trigram 索引外或特殊字符），LIKE 兜底
    const hits = store.searchMemories('天气')
    expect(hits.length).toBeGreaterThan(0)
  })

  it('searchMemories：空查询返回空', () => {
    store.saveMemory('任意记忆内容', 'note')
    expect(store.searchMemories('')).toEqual([])
    expect(store.searchMemories('   ')).toEqual([])
  })

  it('memories_fts 触发器：插入即入索引，删除即出索引', () => {
    const sid = store.createSession('fts-trigger')
    store.saveMessage(sid, { role: 'user', content: '占位消息' })
    store.saveMemory('触发器测试：龙族设定', 'note')
    expect(store.searchMemories('龙族设定').length).toBeGreaterThan(0)

    // 删除记忆 → FTS 同步删除
    const memId = (store.getAllMemories().find(m => m.content.includes('龙族设定')) as any).id
    store['db'].prepare('DELETE FROM memories WHERE id = ?').run(memId)
    expect(store.searchMemories('龙族设定').length).toBe(0)
  })

  it('老库回填：先有 memories 数据再建 FTS 也能检索', () => {
    // 模拟老库：直接建 memories 表（不带 FTS）+ 插入数据，然后重建 store
    store['db'].exec('DROP TABLE IF EXISTS memories_fts')
    store['db'].exec('DROP TRIGGER IF EXISTS memories_ai')
    store['db'].exec('DROP TRIGGER IF EXISTS memories_ad')
    store['db'].exec('DROP TRIGGER IF EXISTS memories_au')
    store['db'].prepare('INSERT INTO memories (content) VALUES (?)').run('回填测试：旧记忆数据')

    store.close()
    store = new MemoryStore(join(tempDir, 'test.db'))

    // 新库 init 时 FTS 建表 + 回填，老数据可检索
    const hits = store.searchMemories('回填测试')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].content).toContain('回填测试')
  })

  it('getMemoriesByType（v0.6.25）：按类型过滤 + limit 截断；空 type 列出全部；无匹配空数组', () => {
    store.saveMemory('用户偏好深色模式', 'preference')
    store.saveMemory('会议记录：Q3 目标', 'note')
    store.saveMemory('用户偏好浅色主题', 'preference')

    const prefs = store.getMemoriesByType('preference')
    expect(prefs).toHaveLength(2)
    expect(prefs.every((m) => m.type === 'preference')).toBe(true)
    // 时间倒序（最新在前）
    expect(prefs[0].content).toBe('用户偏好浅色主题')

    // limit 截断
    const one = store.getMemoriesByType('preference', 1)
    expect(one).toHaveLength(1)

    // 空 type → 列出全部
    const all = store.getMemoriesByType('')
    expect(all).toHaveLength(3)

    // 无匹配类型 → 幂等空数组
    expect(store.getMemoriesByType('ghost-type')).toEqual([])
  })

  it('searchMessages：trigram FTS 检索历史消息（中文 3 字以上）', () => {
    const sid = store.createSession('消息检索')
    store.saveMessage(sid, { role: 'user', content: '帮我调试 flutter 网络请求超时问题' })
    store.saveMessage(sid, { role: 'assistant', content: '好的，先看下请求配置和超时设置' })

    const hits = store.searchMessages('网络请求超时')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].content).toContain('网络请求超时')
    expect(hits[0].sessionId).toBe(sid)
    expect(hits[0].role).toBe('user')
  })

  it('searchMessages：2 字查询 LIKE 回退', () => {
    const sid = store.createSession('消息检索2')
    store.saveMessage(sid, { role: 'user', content: '今天讨论浅色主题设计' })

    const hits = store.searchMessages('主题')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].content).toContain('主题')
  })

  it('searchMessages：空查询返回空', () => {
    const sid = store.createSession('消息检索3')
    store.saveMessage(sid, { role: 'user', content: '内容' })
    expect(store.searchMessages('')).toEqual([])
  })

  it('searchMessages：消息触发器同步（插入即入 trigram 索引）', () => {
    const sid = store.createSession('消息触发器')
    store.saveMessage(sid, { role: 'user', content: '龙族故事设定：主角叫林澈' })

    const hits = store.searchMessages('龙族故事')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].content).toContain('林澈')
  })

  it('getRecentSessions：返回会话列表，preview = 该会话第一条 user 消息', () => {
    const a = store.createSession('会话A')
    const b = store.createSession('会话B')
    // 每条会话多条消息：预览应取第一条 user 消息（不是最新一条）
    store.saveMessage(b, { role: 'user', content: 'B 的第一条用户消息内容' })
    store.saveMessage(b, { role: 'assistant', content: 'B 回复' })
    store.saveMessage(b, { role: 'user', content: 'B 的第二条用户消息' })
    store.saveMessage(a, { role: 'user', content: 'A 的第一条用户消息' })

    const rows = store.getRecentSessions(10) as any[]
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const rowA = rows.find((r: any) => r.id === a)
    const rowB = rows.find((r: any) => r.id === b)
    expect(rowA?.first_user_msg).toBe('A 的第一条用户消息')
    // 预览是第一条 user 消息，不是最新一条（B 的最后一条 user 是"B 的第二条用户消息"）
    expect(rowB?.first_user_msg).toBe('B 的第一条用户消息内容')
  })

  it('getRecentSessions：limit 限制条数；空会话预览为空', () => {
    store.createSession('空会话')
    const rows = store.getRecentSessions(1) as any[]
    expect(rows.length).toBe(1)
    // 无消息的会话：preview 字段为空（null/undefined/空串均可）
    const empty = rows[0]
    expect(empty.first_user_msg === null || empty.first_user_msg === undefined || empty.first_user_msg === '').toBe(true)
  })
})

describe('MemoryStore.deleteSession', () => {
  it('删除会话：消息 / 用量记录一并清除，FTS 索引联动清理', () => {
    const sid = store.createSession('待删除会话')
    store.saveMessage(sid, { role: 'user', content: '龙族故事设定：主角叫林澈' })
    store.saveMessage(sid, { role: 'assistant', content: '好，记住了' })
    store.logUsage(sid, 10, 20, 'deepseek-chat')

    // 删除前 FTS 可命中
    expect(store.searchMessages('龙族故事').length).toBeGreaterThan(0)
    expect(store.getUsageStats().sessionCount).toBe(1)

    const ok = store.deleteSession(sid)
    expect(ok).toBe(true)

    // 会话记录 / 消息 / 用量全部清除
    expect(store.getAllSessions().some(s => s.id === sid)).toBe(false)
    expect(store.getMessages(sid)).toEqual([])
    expect(store.getUsageStats().sessionCount).toBe(0)
    // FTS 触发器已联动清索引，不再命中已删消息
    expect(store.searchMessages('龙族故事').some(h => h.sessionId === sid)).toBe(false)
  })

  it('删除不存在的会话返回 false（幂等，不抛错）', () => {
    expect(store.deleteSession('no_such_session')).toBe(false)
  })

  it('删除一个会话不影响其他会话', () => {
    const keep = store.createSession('保留会话')
    store.saveMessage(keep, { role: 'user', content: '天气怎么样' })
    const drop = store.createSession('丢弃会话')
    store.saveMessage(drop, { role: 'user', content: '待删除内容' })

    expect(store.deleteSession(drop)).toBe(true)

    const sessions = store.getAllSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(keep)
    expect(store.getMessages(keep)).toHaveLength(1)
    expect(store.searchMessages('待删除内容')).toEqual([])
  })
})

describe('MemoryStore.clearSessionMessages（v0.6.18 清空会话消息）', () => {
  it('清空指定会话消息：返回删除条数、会话记录保留、FTS 索引联动清理', () => {
    const sid = store.createSession('待清空会话')
    store.saveMessage(sid, { role: 'user', content: '龙族故事设定：主角叫林澈' })
    store.saveMessage(sid, { role: 'assistant', content: '好，记住了' })
    store.saveMessage(sid, { role: 'user', content: '继续写第二章' })

    // 清空前 FTS 可命中
    expect(store.searchMessages('龙族故事').some(h => h.sessionId === sid)).toBe(true)
    expect(store.getMessages(sid)).toHaveLength(3)

    const cleared = store.clearSessionMessages(sid)
    expect(cleared).toBe(3)

    // 消息清空但会话记录保留（区别于 deleteSession：会话仍在列表）
    expect(store.getMessages(sid)).toEqual([])
    expect(store.getAllSessions().some(s => s.id === sid)).toBe(true)
    // FTS 触发器联动清索引，不再命中已清空消息
    expect(store.searchMessages('龙族故事').some(h => h.sessionId === sid)).toBe(false)
  })

  it('清空一个会话不影响其他会话', () => {
    const keep = store.createSession('保留会话')
    store.saveMessage(keep, { role: 'user', content: '天气怎么样' })
    const drop = store.createSession('待清空会话')
    store.saveMessage(drop, { role: 'user', content: '这段会被清掉' })

    expect(store.clearSessionMessages(drop)).toBe(1)

    expect(store.getMessages(keep)).toHaveLength(1)
    expect(store.searchMessages('天气怎么样').some(h => h.sessionId === keep)).toBe(true)
    expect(store.getMessages(drop)).toEqual([])
  })

  it('空/不存在会话幂等返回 0，不抛错', () => {
    const sid = store.createSession('空会话')
    expect(store.clearSessionMessages(sid)).toBe(0)
    expect(store.clearSessionMessages('no_such_session')).toBe(0)
    // 清空后仍可继续写入（会话记录未删，无外键问题）
    store.saveMessage(sid, { role: 'user', content: '清空后再写' })
    expect(store.getMessages(sid)).toHaveLength(1)
  })
})

describe('MemoryStore 记忆删除（v0.5.4）', () => {
  it('deleteMemory：按 id 删除单条，FTS 索引联动清理（searchMemories 不再命中）', () => {
    store.saveMemory('用户喜欢浅色主题', 'preference')
    const rows = store.searchMemories('浅色主题')
    expect(rows.length).toBeGreaterThan(0)
    const id = rows[0].id

    expect(store.deleteMemory(id)).toBe(true)
    expect(store.getAllMemories()).toHaveLength(0)
    expect(store.searchMemories('浅色主题')).toEqual([])
  })

  it('deleteMemory：不存在的 id 返回 false（幂等，不抛错）', () => {
    expect(store.deleteMemory(99999)).toBe(false)
  })

  it('deleteMemory：删除一条不影响其他记忆', () => {
    store.saveMemory('要删除的记忆内容', 'note')
    store.saveMemory('保留的记忆内容', 'note')

    const rows = store.searchMemories('要删除的')
    expect(store.deleteMemory(rows[0].id)).toBe(true)

    const rest = store.getAllMemories()
    expect(rest).toHaveLength(1)
    expect(rest[0].content).toBe('保留的记忆内容')
  })

  it('deleteMemoriesByContent：按关键词批量删除，返回条数', () => {
    store.saveMemory('关于苹果的讨论', 'note')
    store.saveMemory('苹果种植技巧', 'note')
    store.saveMemory('香蕉的营养价值', 'note')

    const n = store.deleteMemoriesByContent('苹果')
    expect(n).toBe(2)
    expect(store.getAllMemories()).toHaveLength(1)
    expect(store.getAllMemories()[0].content).toBe('香蕉的营养价值')
  })

  it('deleteMemoriesByContent：无匹配返回 0；空关键词返回 0（不误删）', () => {
    store.saveMemory('唯一记忆', 'note')
    expect(store.deleteMemoriesByContent('不存在的词')).toBe(0)
    expect(store.deleteMemoriesByContent('')).toBe(0)
    expect(store.deleteMemoriesByContent('  ')).toBe(0)
    expect(store.getAllMemories()).toHaveLength(1)
  })

  it('deleteMemoriesByContent：删除后 searchMemories 不再命中（FTS 索引联动）', () => {
    store.saveMemory('flutter 网络请求超时排查记录', 'note')
    expect(store.searchMemories('网络请求超时').length).toBeGreaterThan(0)

    store.deleteMemoriesByContent('网络请求超时')
    expect(store.searchMemories('网络请求超时')).toEqual([])
  })
})

describe('trigramJaccard（v0.6.121 记忆去重检测面）', () => {
  it('完全相同文本 → 1', () => {
    expect(trigramJaccard('用户偏好浅色主题', '用户偏好浅色主题')).toBe(1)
  })
  it('完全无关文本 → 0（无共同 3-gram）', () => {
    expect(trigramJaccard('用户偏好浅色主题', '香蕉营养价值很高')).toBe(0)
  })
  it('近似文本 → 0~1 之间，共享内容越多越相似', () => {
    const a = '用户偏好浅色主题'
    const b = '用户偏好浅色主题，还喜欢极简风'
    const c = '用户偏好浅色主题，还喜欢极简风和简洁布局'
    const sab = trigramJaccard(a, b)
    const sac = trigramJaccard(a, c)
    const sbc = trigramJaccard(b, c)
    // a 是 b/c 的前缀（超集模式）：a-b ≈0.46 可检出，均不相等
    expect(sab).toBeGreaterThan(0)
    expect(sab).toBeLessThan(1)
    expect(sac).toBeGreaterThan(0)
    expect(sac).toBeLessThan(1)
    // b 与 c 共享前缀+后缀更多 → 相似度高于 a 与 c
    expect(sbc).toBeGreaterThan(sac)
  })
  it('空白差异不影响相似度（去除空白后比较）', () => {
    expect(trigramJaccard('用户 偏好 浅色', '用户偏好浅色')).toBe(1)
  })
  it('短文本（<3 字）退化：相同 → 1，不同 → 0', () => {
    expect(trigramJaccard('咖啡', '咖啡')).toBe(1)
    expect(trigramJaccard('咖啡', '茶')).toBe(0)
  })
  it('空串边界：双方为空 → 1，单方为空 → 0', () => {
    expect(trigramJaccard('', '')).toBe(1)
    expect(trigramJaccard('', '咖啡')).toBe(0)
  })
})

describe('MemoryStore.findSimilarMemories（v0.6.121 记忆去重检测面）', () => {
  it('检出重复/近似记忆对（idA < idB，相似度降序）', () => {
    store.saveMemory('用户偏好浅色主题', 'preference')
    store.saveMemory('用户偏好浅色主题，还喜欢极简风', 'preference')
    store.saveMemory('香蕉营养价值很高', 'note')
    const pairs = store.findSimilarMemories()
    expect(pairs.length).toBeGreaterThanOrEqual(1)
    for (const p of pairs) {
      expect(p.idA).toBeLessThan(p.idB)
      expect(p.similarity).toBeGreaterThanOrEqual(0.4)
    }
    // 近似记忆对（超集模式 ≈0.46）被检出；最高相似对按相似度降序排前
    const ab = pairs.find(p => p.contentA === '用户偏好浅色主题' && p.contentB === '用户偏好浅色主题，还喜欢极简风')
    expect(ab).toBeTruthy()
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i - 1].similarity).toBeGreaterThanOrEqual(pairs[i].similarity)
    }
  })
  it('完全重复记忆相似度 1 且被检出', () => {
    store.saveMemory('记住这个结论', 'note')
    store.saveMemory('记住这个结论', 'note')
    const pairs = store.findSimilarMemories()
    expect(pairs.length).toBe(1)
    expect(pairs[0].similarity).toBe(1)
    expect(pairs[0].idA).not.toBe(pairs[0].idB)
  })
  it('同秒批量插入乱序时 pair 恒满足 idA < idB（v0.6.141：created_at 秒级精度排序不稳定回归）', () => {
    // getAllMemories 按 created_at DESC（秒级精度）：同秒插入多条近似记忆时返回顺序不稳定，
    // mems[i].id 可能 > mems[j].id——findSimilarMemories 必须规范化交换保证契约（server.test.ts
    // 偶发失败源，flare 验收提示）。本用例在乱序发生时能捕获旧实现违反契约（修复后恒通过）
    const contents = ['批量同秒 用户偏好浅色主题', '批量同秒 用户偏好浅色主题，还喜欢极简风', '批量同秒 用户偏好浅色主题，喜欢极简风']
    for (let round = 0; round < 5; round++) {
      for (const c of contents) store.saveMemory(c, 'preference')
    }
    const pairs = store.findSimilarMemories()
    expect(pairs.length).toBeGreaterThanOrEqual(1)
    for (const p of pairs) {
      // 契约：idA < idB（无论 getAllMemories 返回顺序如何）
      expect(p.idA).toBeLessThan(p.idB)
    }
  })
  it('threshold 过滤：高于阈值才返回', () => {
    store.saveMemory('用户偏好浅色主题', 'note')
    store.saveMemory('用户偏好浅色主题，还喜欢极简风', 'note')
    store.saveMemory('香蕉营养价值很高', 'note')
    // 阈值 1 只保留完全重复 → 无
    expect(store.findSimilarMemories({ threshold: 1 })).toEqual([])
    // 阈值 0 全部（含近似对）
    const all = store.findSimilarMemories({ threshold: 0 })
    expect(all.length).toBeGreaterThanOrEqual(1)
  })
  it('limit 截断返回数量', () => {
    for (let i = 0; i < 5; i++) store.saveMemory('相同记忆内容' + (i % 2), 'note')
    const pairs = store.findSimilarMemories({ limit: 2 })
    expect(pairs.length).toBeLessThanOrEqual(2)
  })
  it('空库返回空数组', () => {
    expect(store.findSimilarMemories()).toEqual([])
  })
  it('无相似记忆返回空数组（默认阈值）', () => {
    store.saveMemory('苹果的营养价值', 'note')
    store.saveMemory('香蕉的种植技巧', 'note')
    expect(store.findSimilarMemories()).toEqual([])
  })
})
