/**
 * FLARE问题记录 #37 回归测试（v0.6.159）
 *
 * 现场：给 flare 一份「修 fluxdl 的 R2-1」任务书，它老老实实连续 read_file / grep 翻代码
 * （每轮参数都不同，纯探索），33 秒后被打断：
 *   ❌ 连续多次工具调用均无进展，已自动停止。请简化任务后重试。
 *
 * 旧判定（v0.6.158 及以前）：只要某一轮工具调用「没有伴随文本输出」就 noProgress++，
 * 累计 15 次即中止。探索型任务的正常形态就是不说话连续调工具，于是被误杀；而真正
 * 卡死的特征其实是「一模一样的工具调用反复重试」——那件事 #25 的 countTrailingRepeats
 * 只覆盖了单个签名，跨轮的多调用批次没覆盖。
 *
 * 新判定：按「整批调用签名」比较，只有相邻两轮签名完全相同才计数，阈值 6。
 * 换参数 = 有新动作，一律清零。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Agent } from '../src/core/agent.js'
import type { Message, LLMResponse } from '../src/core/llm.js'

type Call = { name: string; args: Record<string, unknown> }

/** 按预设序列吐出工具调用；序列耗尽后返回纯文本（正常收尾） */
class ScriptedLLM {
  calls = 0
  lastMessages: Message[] = []
  constructor(private readonly script: Call[][]) {}
  async chat(messages: Message[]): Promise<LLMResponse> {
    this.calls++
    this.lastMessages = JSON.parse(JSON.stringify(messages))
    const batch = this.script[this.calls - 1]
    if (!batch) {
      return { content: '做完了', model: 'mock', usage: { prompt_tokens: 1, completion_tokens: 1 } } as unknown as LLMResponse
    }
    return {
      content: '',
      model: 'mock',
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      tool_calls: batch.map((c, i) => ({
        id: `call_${this.calls}_${i}`,
        type: 'function',
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    } as unknown as LLMResponse
  }
  async *chatStream() {
    yield ''
  }
}

/** 断言：每条 assistant.tool_calls 的 id 都有对应的 tool 消息 */
function danglingIds(messages: Message[]): string[] {
  const missing: string[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as any
    if (m.role !== 'assistant' || !Array.isArray(m.tool_calls)) continue
    const answered = new Set<string>()
    for (let j = i + 1; j < messages.length && messages[j].role === 'tool'; j++) {
      const id = (messages[j] as any).tool_call_id
      if (id) answered.add(id)
    }
    for (const tc of m.tool_calls) if (tc?.id && !answered.has(tc.id)) missing.push(tc.id)
  }
  return missing
}

async function drain(agent: Agent): Promise<Array<{ type: string; content?: string }>> {
  const events: Array<{ type: string; content?: string }> = []
  for await (const ev of agent.run('测试')) events.push(ev as never)
  return events
}

describe('#37 探索型任务不该被判成「无进展」', () => {
  let tempDir: string
  let originalHome: string | undefined

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'flare-issues-37-'))
    originalHome = process.env.FLARE_HOME
    process.env.FLARE_HOME = tempDir
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    if (originalHome === undefined) delete process.env.FLARE_HOME
    else process.env.FLARE_HOME = originalHome
  })

  it('连续 25 轮「参数各不相同」的只读探索 → 不触发无进展中止', async () => {
    // 每轮读不同文件、跑不同 grep，全程不带文本输出 —— 正是被误杀的形态
    const script: Call[][] = Array.from({ length: 25 }, (_, i) => [
      { name: 'read_file', args: { path: `/tmp/explore-${i}.py`, offset: i * 40 + 1, limit: 120 } },
      { name: 'search_files', args: { pattern: `needle-${i}`, path: '/tmp', target: 'content' } },
    ])
    const llm = new ScriptedLLM(script)
    const agent = new Agent({ llm: llm as never, maxIterations: 30, autoConfirm: true })

    const events = await drain(agent)
    const noProgress = events.find(e => e.type === 'error' && String(e.content).includes('无进展'))
    expect(noProgress).toBeUndefined()
    // 探索真的跑完了 25 轮 + 1 轮收尾
    expect(llm.calls).toBe(26)
    expect(danglingIds(agent.getMessages())).toEqual([])
  })

  it('整批签名一字不改地重试 6 轮 → 停止，且无悬空 tool_call', async () => {
    // 两个不同调用组成同一批：单个签名不连续重复（#25 的规则不触发），
    // 但整批一模一样 —— 这才是「原地打转」的特征。
    const batch: Call[] = [
      { name: 'read_file', args: { path: '/tmp/same.py' } },
      { name: 'search_files', args: { pattern: 'same', path: '/tmp' } },
    ]
    const llm = new ScriptedLLM(Array.from({ length: 12 }, () => batch))
    const agent = new Agent({ llm: llm as never, maxIterations: 30, autoConfirm: true })

    const events = await drain(agent)
    const err = events.find(e => e.type === 'error' && String(e.content).includes('完全相同的工具调用'))
    expect(err).toBeTruthy()
    expect(llm.calls).toBeLessThanOrEqual(8)
    expect(danglingIds(agent.getMessages())).toEqual([])
  })
})
