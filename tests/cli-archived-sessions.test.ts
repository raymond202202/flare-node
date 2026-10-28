import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { MemoryStore } from '../src/memory/store.js'
import { DatabaseSync as Database } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI = join(__dirname, '..', 'dist', 'cli', 'index.js')

const children: ChildProcess[] = []
let dir: string
let store: MemoryStore

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flare-archived-cli-'))
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
      env: {
        ...process.env,
        FLARE_HOME: dir,
      },
    })
    children.push(child)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

describe('flare archived-sessions', () => {
  it('列出归档会话（含预览与 ID，不含未归档）', async () => {
    const s1 = store.createSession('归档会话一')
    store.saveMessage(s1, { role: 'user', content: '第一条用户消息甲' })
    const s2 = store.createSession('归档会话二')
    store.saveMessage(s2, { role: 'user', content: '第二条用户消息乙' })
    const s3 = store.createSession('未归档会话')
    store.saveMessage(s3, { role: 'user', content: '不应出现' })
    store.archiveSession(s1)
    store.archiveSession(s2)

    const { code, stdout } = await runCli(['archived-sessions'])
    expect(code).toBe(0)
    expect(stdout).toContain('已归档会话')
    expect(stdout).toContain('第一条用户消息甲')
    expect(stdout).toContain('第二条用户消息乙')
    expect(stdout).toContain(s1.slice(0, 8))
    expect(stdout).toContain(s2.slice(0, 8))
    expect(stdout).not.toContain('未归档会话')
  }, 20000)

  it('空会话归档显示（空会话）', async () => {
    const s = store.createSession('空空')
    store.archiveSession(s)

    const { code, stdout } = await runCli(['archived-sessions'])
    expect(code).toBe(0)
    expect(stdout).toContain('（空会话）')
  }, 20000)

  it('--limit 1 只显示 1 个', async () => {
    const a = store.createSession('A')
    store.saveMessage(a, { role: 'user', content: '内容A' })
    const b = store.createSession('B')
    store.saveMessage(b, { role: 'user', content: '内容B' })
    store.archiveSession(a)
    store.archiveSession(b)

    const { code, stdout } = await runCli(['archived-sessions', '--limit', '1'])
    expect(code).toBe(0)
    const lines = stdout.trim().split('\n').filter((l) => !l.includes('已归档会话'))
    expect(lines.length).toBe(1)
  }, 20000)

  it('非法 limit 退出码 1', async () => {
    for (const bad of ['0', '51', 'abc']) {
      const { code, stderr } = await runCli(['archived-sessions', '--limit', bad])
      expect(code).toBe(1)
      expect(stderr).toContain('--limit')
    }
  }, 20000)

  it('无归档会话提示暂无归档会话', async () => {
    store.createSession('普通会话')

    const { code, stdout } = await runCli(['archived-sessions'])
    expect(code).toBe(0)
    expect(stdout).toContain('暂无归档会话')
  }, 20000)

  it('按更新时间倒序（最新在前）', async () => {
    const a = store.createSession('旧归档')
    store.saveMessage(a, { role: 'user', content: '旧内容' })
    const b = store.createSession('新归档')
    store.saveMessage(b, { role: 'user', content: '新内容' })
    store.archiveSession(a)
    store.archiveSession(b)

    const db = new Database(join(dir, 'flare.db'))
    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run('2026-08-12 10:00:00.100', a)
    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run('2026-08-12 10:00:01.200', b)
    db.close()

    const { code, stdout } = await runCli(['archived-sessions'])
    expect(code).toBe(0)
    const idxA = stdout.indexOf('旧归档')
    const idxB = stdout.indexOf('新归档')
    expect(idxA).toBeGreaterThan(-1)
    expect(idxB).toBeGreaterThan(-1)
    expect(idxB).toBeLessThan(idxA)
  }, 20000)
  it('--json 输出 JSON 结构化 { sessions } 四字段与 server 同构（v0.6.111）', async () => {
    const s1 = store.createSession('归档会话一')
    store.saveMessage(s1, { role: 'user', content: '第一条用户消息甲' })
    store.archiveSession(s1)
    const { code, stdout } = await runCli(['archived-sessions', '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(Array.isArray(parsed.sessions)).toBe(true)
    expect(parsed.sessions.length).toBeGreaterThanOrEqual(1)
    const hit = parsed.sessions.find((s: any) => s.id === s1)
    expect(hit).toBeDefined()
    expect(hit.title).toBe('归档会话一')
    expect(hit).toHaveProperty('updatedAt')
    expect(hit).toHaveProperty('preview')
    expect(hit.preview).toBe('第一条用户消息甲')
  }, 20000)
  it('--json 空库 → { sessions: [] } exit 0（不打印「暂无归档会话」）', async () => {
    store.createSession('普通会话')
    const { code, stdout } = await runCli(['archived-sessions', '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.sessions).toEqual([])
    expect(stdout).not.toContain('暂无归档会话')
  }, 20000)
  it('--json --limit 1 只输出 1 个归档会话', async () => {
    const a = store.createSession('A')
    store.saveMessage(a, { role: 'user', content: '内容A' })
    const b = store.createSession('B')
    store.saveMessage(b, { role: 'user', content: '内容B' })
    store.archiveSession(a)
    store.archiveSession(b)
    const { code, stdout } = await runCli(['archived-sessions', '--json', '--limit', '1'])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.sessions.length).toBe(1)
  }, 20000)
  it('--json preview 空白折叠 + 超长截断 120 字符（server 语义）', async () => {
    const s1 = store.createSession('长预览会话')
    store.saveMessage(s1, { role: 'user', content: '多  空白 内容' + 'X'.repeat(300) })
    store.archiveSession(s1)
    const { code, stdout } = await runCli(['archived-sessions', '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    const hit = parsed.sessions.find((s: any) => s.id === s1)
    expect(hit).toBeDefined()
    expect(hit.preview).toBe('多 空白 内容' + 'X'.repeat(113))
    expect(hit.preview.length).toBe(120)
  }, 20000)
  it('文本模式回归：--json 不存在时输出「已归档会话」且非 JSON', async () => {
    const s1 = store.createSession('归档会话一')
    store.saveMessage(s1, { role: 'user', content: '第一条用户消息甲' })
    store.archiveSession(s1)
    const { code, stdout } = await runCli(['archived-sessions'])
    expect(code).toBe(0)
    expect(stdout).toContain('已归档会话')
    expect(() => JSON.parse(stdout)).toThrow()
  }, 20000)
})
