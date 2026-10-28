/**
 * 会话归档 API（v0.6.31 end_session / restore_session / list_archived_sessions）测试
 * 覆盖：MemoryStore 归档方法 + server 协议 e2e（真实子进程）
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { MemoryStore } from '../src/memory/store.js'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Server } from 'node:http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.join(__dirname, '..', 'dist', 'cli', 'index.js')

// ===== MemoryStore 单测 =====
let tempDir: string
let store: MemoryStore

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'flare-archive-test-'))
  store = new MemoryStore(join(tempDir, 'test.db'))
})

afterEach(() => {
  store.close()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('MemoryStore 会话归档', () => {
  it('archiveSession 标记归档 + 幂等（重复归档 false）', () => {
    const sid = store.createSession('归档测试')
    expect(store.archiveSession(sid)).toBe(true)
    expect(store.archiveSession(sid)).toBe(false) // 已归档幂等
    expect(store.getAllSessions().find(s => s.id === sid)!.archived).toBe(true)
  })

  it('archiveSession 会话不存在 → false 幂等不抛错', () => {
    expect(store.archiveSession('ghost')).toBe(false)
  })

  it('restoreSession 恢复归档 + 幂等（未归档 restore false）', () => {
    const sid = store.createSession('恢复测试')
    store.archiveSession(sid)
    expect(store.restoreSession(sid)).toBe(true)
    expect(store.restoreSession(sid)).toBe(false)
    expect(store.getAllSessions().find(s => s.id === sid)!.archived).toBe(false)
  })

  it('getRecentSessions 排除归档；listArchivedSessions 只列归档', () => {
    const active = store.createSession('活跃会话')
    const archived = store.createSession('归档会话')
    store.saveMessage(active, { role: 'user', content: '活跃首条' })
    store.saveMessage(archived, { role: 'user', content: '归档首条' })
    store.archiveSession(archived)

    const recent = store.getRecentSessions()
    expect(recent.map(r => r.id)).toContain(active)
    expect(recent.map(r => r.id)).not.toContain(archived)

    const listed = store.listArchivedSessions()
    expect(listed.map(r => r.id)).toContain(archived)
    expect(listed.map(r => r.id)).not.toContain(active)
    // 归档会话带首条 user 消息预览
    const row = listed.find(r => r.id === archived)!
    expect((row as any).first_user_msg).toBe('归档首条')
  })

  it('归档不删数据：消息/用量保留，可恢复继续使用', () => {
    const sid = store.createSession('数据保留')
    store.saveMessage(sid, { role: 'user', content: '你好' })
    store.logUsage(sid, 100, 50, 'mock')
    store.archiveSession(sid)
    // 消息仍在
    expect(store.getMessages(sid)).toHaveLength(1)
    // 用量统计仍在
    expect(store.getSessionUsage(sid).callCount).toBe(1)
    // 恢复后正常出现在最近
    store.restoreSession(sid)
    expect(store.getRecentSessions().map(r => r.id)).toContain(sid)
  })

  it('老库迁移（v0.6.31）：旧 sessions 无 archived 列 → 打开时自动补列', () => {
    store.close()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync: Database } = require('node:sqlite')
    const db = new Database(join(tempDir, 'test.db'))
    db.exec(`
      DROP TABLE IF EXISTS sessions;
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        title TEXT DEFAULT '新会话',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO sessions (id, title) VALUES ('old_s1', '老会话');
    `)
    db.close()

    const reopened = new MemoryStore(join(tempDir, 'test.db'))
    const all = reopened.getAllSessions()
    expect(all.find(s => s.id === 'old_s1')!.archived).toBe(false) // 老数据读 0 不报错
    expect(reopened.archiveSession('old_s1')).toBe(true) // 补列后可归档
    expect(reopened.getAllSessions().find(s => s.id === 'old_s1')!.archived).toBe(true)
    reopened.close()
  })
})

// ===== server 协议 e2e =====
let child: ChildProcess
let rl: Interface
let nextId = 0
let srvTempDir: string

/** mock LLM HTTP 服务器（OpenAI 兼容）：任意 POST /v1/chat/completions → 固定回复，快速稳定（P201，与 P181/P182/P186/P187 同款） */
let mockLlm: Server | undefined
let mockLlmUrl = ''

function request(msg: any, expectTypes: string[], timeout = 15000): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const msgs: any[] = []
    const timer = setTimeout(() => { cleanup(); reject(new Error(`超时（请求 ${JSON.stringify(msg).slice(0, 80)}）`)) }, timeout)
    const handler = (line: string) => {
      try {
        const parsed = JSON.parse(line)
        if (expectTypes.includes(parsed.type)) {
          msgs.push(parsed)
          cleanup()
          resolve(msgs)
        }
      } catch { /* 非 JSON 行忽略 */ }
    }
    const cleanup = () => { clearTimeout(timer); rl.removeListener('line', handler) }
    rl.on('line', handler)
    child.stdin!.write(JSON.stringify(msg) + '\n')
  })
}

beforeAll(async () => {
  srvTempDir = mkdtempSync(path.join(tmpdir(), 'flare-archive-srv-'))
  // P201：mock LLM 服务器（起在随机端口；与 cli-chat-session.test.ts P181 / server-default-params.test.ts
  // P182 / server.test.ts P186 / server-context-trim·server-tool-output-policy P187 同款）——根治本文件
  // chat e2e 真实调用偶发慢源（无 key fallback 本地模型 / ~/.flare/.env 注入真实 key 走远端网络）
  const http = await import('node:http')
  mockLlm = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url?.includes('/chat/completions')) {
      req.resume()
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({
        id: 'mock-chat-1',
        object: 'chat.completion',
        created: 1700000000,
        model: 'mock-model',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'mock 回复（P201 测试稳定性：不走真实模型）' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      }))
      return
    }
    res.statusCode = 404
    res.end('not found')
  })
  await new Promise<void>((resolve) => mockLlm!.listen(0, '127.0.0.1', resolve))
  const addr = mockLlm!.address()
  mockLlmUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/v1`

  const env: Record<string, string> = { ...process.env } as Record<string, string>
  delete env.DEEPSEEK_API_KEY
  delete env.OPENAI_API_KEY
  // P201：显式注入 mock 端点/模型（config 构造时 process.env 优先于 dotenv，测试子进程不继承真实凭据）
  env.LLM_BASE_URL = mockLlmUrl
  env.LLM_API_KEY = 'mock-key'
  env.DEFAULT_MODEL = 'mock-model'
  child = spawn(process.execPath, [CLI, 'server', '--storage', path.join(srvTempDir, 'test.db')], { env, stdio: ['pipe', 'pipe', 'pipe'] })
  rl = createInterface({ input: child.stdout! })
  // 等待 server 就绪
  await request({ id: ++nextId, type: 'ping' }, ['pong'])
})

afterAll(async () => {
  child.kill()
  rl.close()
  mockLlm?.close()
  rmSync(srvTempDir, { recursive: true, force: true })
})

describe('server 协议 end_session / restore_session / list_archived_sessions（v0.6.31）', () => {
  it('end_session → ok(archived:true)；recent_sessions 不再出现；list_archived_sessions 出现', async () => {
    const create = await request({ id: ++nextId, type: 'create_session', sessionId: 'arch1', title: '归档会话A' }, ['ok'])
    expect(create[0].type).toBe('ok')

    const end = await request({ id: ++nextId, type: 'end_session', sessionId: 'arch1' }, ['ok'])
    expect(end[0]).toMatchObject({ type: 'ok', sessionId: 'arch1', archived: true })

    // recent_sessions 不含归档会话
    const recent = await request({ id: ++nextId, type: 'recent_sessions' }, ['recent_sessions'])
    expect(recent[0].sessions.map((s: any) => s.id)).not.toContain('arch1')

    // list_archived_sessions 包含
    const archived = await request({ id: ++nextId, type: 'list_archived_sessions' }, ['archived_sessions'])
    expect(archived[0].sessions.map((s: any) => s.id)).toContain('arch1')

    // restore → 回到最近
    const restore = await request({ id: ++nextId, type: 'restore_session', sessionId: 'arch1' }, ['ok'])
    expect(restore[0]).toMatchObject({ type: 'ok', sessionId: 'arch1', restored: true })
    const recent2 = await request({ id: ++nextId, type: 'recent_sessions' }, ['recent_sessions'])
    expect(recent2[0].sessions.map((s: any) => s.id)).toContain('arch1')
    const archived2 = await request({ id: ++nextId, type: 'list_archived_sessions' }, ['archived_sessions'])
    expect(archived2[0].sessions.map((s: any) => s.id)).not.toContain('arch1')
  })

  it('end_session 数据保留：get_messages 仍可读', async () => {
    await request({ id: ++nextId, type: 'create_session', sessionId: 'arch2', title: '归档会话B' }, ['ok'])
    await request({ id: ++nextId, type: 'end_session', sessionId: 'arch2' }, ['ok'])
    // 归档后仍可读消息（不删数据）
    const msgs = await request({ id: ++nextId, type: 'get_messages', sessionId: 'arch2' }, ['messages'])
    expect(msgs[0].type).toBe('messages')
  })

  it('不存在的会话幂等：end/restore 返回 archived/restored false 不报错', async () => {
    const end = await request({ id: ++nextId, type: 'end_session', sessionId: 'ghost-arch' }, ['ok'])
    expect(end[0]).toMatchObject({ type: 'ok', sessionId: 'ghost-arch', archived: false })
    const restore = await request({ id: ++nextId, type: 'restore_session', sessionId: 'ghost-arch' }, ['ok'])
    expect(restore[0]).toMatchObject({ type: 'ok', sessionId: 'ghost-arch', restored: false })
  })

  it('end_session 后再次 chat 可重建 Agent 正常对话', async () => {
    // 归档后销毁缓存 Agent，chat 应重建（不报错；P201 注入 mock LLM 后生成必然成功 → 稳定 done）
    await request({ id: ++nextId, type: 'create_session', sessionId: 'arch3', title: '归档会话C' }, ['ok'])
    await request({ id: ++nextId, type: 'end_session', sessionId: 'arch3' }, ['ok'])
    const chat = await request({ id: ++nextId, type: 'chat', sessionId: 'arch3', message: '还在吗' }, ['done'], 15000)
    expect(chat[chat.length - 1]?.type).toBe('done')
  }, 15000)
})
