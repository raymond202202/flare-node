import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { DatabaseSync as Database } from 'node:sqlite'
import { MemoryStore } from '../src/memory/store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI = join(__dirname, '..', 'dist', 'cli', 'index.js')

const children: ChildProcess[] = []
let dir: string
let store: MemoryStore

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flare-msg-cli-'))
  store = new MemoryStore(join(dir, 'flare.db'))
})

afterEach(() => {
  store.close()
  for (const c of children.splice(0)) c.kill()
  rmSync(dir, { recursive: true, force: true })
})

function runCli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, FLARE_HOME: dir },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.push(child)
    let out = ''
    let err = ''
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { err += d.toString() })
    child.on('close', (code) => resolve({ code, stdout: out, stderr: err }))
  })
}

function seedMessages(sid: string, n: number) {
  for (let i = 1; i <= n; i++) {
    store.saveMessage(sid, { role: i % 3 === 0 ? 'assistant' : 'user', content: `msg-${String(i).padStart(3, '0')}` })
  }
  const db = new Database(join(dir, 'flare.db'))
  const rows = db.prepare('SELECT id FROM messages WHERE session_id = ? ORDER BY id ASC').all(sid) as { id: number }[]
  const upd = db.prepare('UPDATE messages SET created_at = ? WHERE id = ?')
  rows.forEach((r, i) => upd.run(`2026-01-01 00:00:${String(i % 60).padStart(2, '0')}.${String(Math.floor(i / 60)).padStart(3, '0')}`, r.id))
  db.close()
}

describe('flare messages（v0.6.84）', () => {
  it('默认取最早 limit 条（标题「前 50 条消息」，含第 1 条、不含第 60 条）', async () => {
    seedMessages('s1', 60)
    const { code, stdout } = await runCli(['messages', 's1'])
    expect(code).toBe(0)
    expect(stdout).toContain('前 50 条消息')
    expect(stdout).toContain('msg-001')
    expect(stdout).not.toContain('msg-060')
  }, 20000)

  it('--recent 取最近 limit 条（标题「最近 50 条消息」，含最新内容）', async () => {
    seedMessages('s2', 60)
    const { code, stdout } = await runCli(['messages', 's2', '--recent'])
    expect(code).toBe(0)
    expect(stdout).toContain('最近 50 条消息')
    expect(stdout).toContain('msg-060')
    expect(stdout).not.toContain('msg-001')
  }, 20000)

  it('--limit 3 只显示 3 条', async () => {
    seedMessages('s3', 5)
    const { code, stdout } = await runCli(['messages', 's3', '--limit', '3'])
    expect(code).toBe(0)
    expect(stdout).toContain('前 3 条消息')
    expect(stdout).toContain('msg-001')
    expect(stdout).toContain('msg-003')
    expect(stdout).not.toContain('msg-004')
  }, 20000)

  it('非法 --limit（0/501/abc）→ 退出码 1 + 错误提示含 1~500', async () => {
    for (const bad of ['0', '501', 'abc']) {
      const { code, stderr } = await runCli(['messages', 'sx', '--limit', bad])
      expect(code).toBe(1)
      expect(stderr).toContain('1~500')
    }
  }, 20000)

  it('空会话 → 友好提示「暂无消息」，退出码 0', async () => {
    const { code, stdout } = await runCli(['messages', 'ghost'])
    expect(code).toBe(0)
    expect(stdout).toContain('暂无消息')
  }, 20000)

  it('已归档会话 → 文本模式标题带（已归档）标记（v0.6.130，与 search/sessions 命令 arch 标记对称）', async () => {
    seedMessages('s-arch', 3)
    store.archiveSession('s-arch')
    const { code, stdout } = await runCli(['messages', 's-arch'])
    expect(code).toBe(0)
    expect(stdout).toContain('已归档')
    expect(stdout).toContain('会话 s-arch（已归档）')
    expect(stdout).toContain('msg-001')
  }, 20000)

  it('已归档会话 --json → 不加 archived 字段（与 server get_messages 回包同构，v0.6.130）', async () => {
    seedMessages('s-archj', 3)
    store.archiveSession('s-archj')
    const { code, stdout } = await runCli(['messages', 's-archj', '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.sessionId).toBe('s-archj')
    expect(parsed.messages.length).toBe(3)
    // 结构同构：不含归档标注字段（server get_messages 回包无 archived）
    expect(parsed).not.toHaveProperty('archived')
  }, 20000)

  it('未归档会话 → 文本模式不出现（已归档）标记（回归）', async () => {
    seedMessages('s-live', 3)
    const { code, stdout } = await runCli(['messages', 's-live'])
    expect(code).toBe(0)
    expect(stdout).not.toContain('已归档')
    expect(stdout).toContain('会话 s-live 前 3 条消息')
  }, 20000)

  it('超长内容 200 字符截断 + 角色图标（🧑 user / 🤖 assistant）', async () => {
    const sid = 'long'
    store.saveMessage(sid, { role: 'user', content: 'u'.repeat(300) })
    store.saveMessage(sid, { role: 'assistant', content: [{ type: 'text', text: 'a'.repeat(300) }] })
    const { code, stdout } = await runCli(['messages', sid, '--limit', '10'])
    expect(code).toBe(0)
    expect(stdout).toContain('🧑 user:')
    expect(stdout).toContain('🤖 assistant:')
    expect(stdout).not.toContain('u'.repeat(300))
    expect(stdout).not.toContain('a'.repeat(300))
  }, 20000)

  it('--json 默认：输出 { sessionId, messages } 结构化回包（v0.6.107）', async () => {
    seedMessages('s1', 5)
    const { code, stdout } = await runCli(['messages', 's1', '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.sessionId).toBe('s1')
    expect(parsed.messages.length).toBe(5)
    expect(parsed.messages[0].content).toContain('msg-001')
  }, 20000)

  it('--json --limit 3：只返回 3 条消息', async () => {
    seedMessages('s2', 5)
    const { code, stdout } = await runCli(['messages', 's2', '--limit', '3', '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.messages.length).toBe(3)
  }, 20000)

  it('--json --recent：取最近 limit 条，时间正序返回', async () => {
    seedMessages('s3', 60)
    const { code, stdout } = await runCli(['messages', 's3', '--recent', '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.recent).toBe(true)
    expect(parsed.messages.length).toBe(50)
    expect(parsed.messages[parsed.messages.length - 1].content).toContain('msg-060')
    expect(parsed.messages[0].content).not.toContain('msg-001')
  }, 20000)

  it('--json 空会话：输出 { sessionId, messages: [] }', async () => {
    const { code, stdout } = await runCli(['messages', 'ghost', '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.messages.length).toBe(0)
    expect(parsed.sessionId).toBe('ghost')
  }, 20000)

  it('--json 多模态 content：store 层图片折叠为占位符（hi[图片]，图像只读回原始部分，保证输出有效 JSON）', async () => {
    store.saveMessage('m1', { role: 'assistant', content: [{ type: 'text', text: 'hi' }, { type: 'image', image_url: 'http://example.com/img.png' }] })
    const { code, stdout } = await runCli(['messages', 'm1', '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.messages[0].content).toBe('hi[图片]')
    expect(typeof parsed.messages[0].content).toBe('string')
  }, 20000)
})
