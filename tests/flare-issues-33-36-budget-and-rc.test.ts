/**
 * FLARE问题记录 #33 / #34 / #35 / #36 回归测试（v0.6.160）
 *
 * 编号以 FLARE问题记录.md 最末一组条目为准（2026-10-28 实测，见文档 1086–1212 行）：
 *   #33 迭代上限在「健康推进中途」硬停     → 有产出时自动延长一次
 *   #34 业务退出码（ferry 2/3、grep 1）被报成失败 → expectRc + 语义提示
 *   #35 复合命令只报最后一段 rc            → 逐段复查清单 + traceRc 实测各段
 *   #36 write_file 写坏的脚本要跑起来才暴露 → 写入当刻做语法自检
 *
 * 注意：tests/flare-issues-33-36.test.ts 是文档早期编号（端口占用/无人值守/断点摘要），
 * 与本文编号不同源，两者互不影响。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { terminalTool, writeFileTool } from '../src/tools/index.js'
import { Agent, hasProductiveProgress } from '../src/core/agent.js'
import type { Message, LLMResponse } from '../src/core/llm.js'

type Call = { name: string; args: Record<string, unknown> }

class ScriptedLLM {
  calls = 0
  constructor(private readonly script: Call[][]) {}
  async chat(messages: Message[]): Promise<LLMResponse> {
    this.calls++
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
  async *chatStream() { yield '' }
}

async function drain(agent: Agent): Promise<Array<{ type: string; content?: string }>> {
  const events: Array<{ type: string; content?: string }> = []
  for await (const ev of agent.run('测试')) events.push(ev as never)
  return events
}

describe('#34 语义化退出码：expectRc 声明后不再报失败', () => {
  let dir: string
  let oldPath: string | undefined

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'flare-6160-ferry-'))
    // 造一个行为真实的 ferry：translate 返回 2（近似等价，业务上成功）
    const ferry = join(dir, 'ferry')
    writeFileSync(ferry, '#!/bin/sh\ncase "$1" in\n  translate) echo "approximate: 2 处需人工确认"; exit 2;;\nesac\nexit 0\n')
    chmodSync(ferry, 0o755)
    oldPath = process.env.PATH
    process.env.PATH = `${dir}:${oldPath}`
  })

  afterEach(() => {
    if (oldPath === undefined) delete process.env.PATH
    else process.env.PATH = oldPath
    rmSync(dir, { recursive: true, force: true })
  })

  it('expectRc: [2] → 退出码 2 视为正常结果，输出原样返回', async () => {
    const r = await terminalTool.execute({ command: 'ferry translate mv x', expectRc: [2] })
    expect(r.success).toBe(true)
    expect(r.output).toContain('approximate')
    expect(r.output).toContain('已按调用方声明视为正常结果')
  })

  it('不声明 expectRc → 仍按失败报，但点名「2 是业务语义」并给出修法', async () => {
    const r = await terminalTool.execute({ command: 'ferry translate mv x' })
    expect(r.success).toBe(false)
    expect(r.error).toContain('命令执行失败（退出码 2）')
    expect(r.error).toContain('业务语义')
    expect(r.error).toContain('expectRc: [2]')
  })

  it('grep 无匹配（退出码 1）被点名，不让人去改代码', async () => {
    const r = await terminalTool.execute({ command: 'grep -c zzz_not_there /dev/null' })
    expect(r.success).toBe(false)
    expect(r.error).toContain('退出码 1 对 grep')
  })

  it('未声明的其他非零码不受影响（白名单是精确匹配，不是「有 expectRc 就放水」）', async () => {
    const r = await terminalTool.execute({ command: 'sh -c "exit 3"', expectRc: [2] })
    expect(r.success).toBe(false)
    expect(r.error).toContain('退出码 3')
  })
})

describe('#35 复合命令失败归因：逐段复查清单 + traceRc', () => {
  it('失败文案直接给出可粘贴的逐段复查命令', async () => {
    const r = await terminalTool.execute({ command: 'echo one && exit 7' })
    expect(r.success).toBe(false)
    expect(r.error).toContain('复合命令共 2 段')
    expect(r.output).toContain('逐段复查')
    expect(r.output).toContain("bash -c 'echo one'")
    expect(r.output).toContain('rc=$?')
  })

  it('traceRc:true → 真实重跑各段并报出每段 rc，指出最早失败段', async () => {
    const r = await terminalTool.execute({ command: 'echo one && false', traceRc: true })
    expect(r.success).toBe(false)
    expect(r.output).toContain('[逐段复查]')
    expect(r.output).toContain('rc=0')
    expect(r.output).toContain('2. false → rc=1')
    expect(r.output).toContain('最早失败的段')
  })

  it('风险段在 traceRc 下被跳过，不会把危险命令跑第二遍', async () => {
    const r = await terminalTool.execute({ command: 'rm -rf /var/tmp/flare-never-exist && false', traceRc: true })
    expect(r.success).toBe(false)
    expect(r.output).toContain('跳过')
  })

  it('单段命令不产生归因噪音', async () => {
    const r = await terminalTool.execute({ command: 'exit 4' })
    expect(r.success).toBe(false)
    expect(r.output).not.toContain('复合命令归因')
  })
})

describe('#36 write_file 写入当刻做语法自检', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'flare-6160-syntax-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('语法正确的 .py → 提示自检通过', async () => {
    const p = join(dir, 'ok.py')
    const r = await writeFileTool.execute({ path: p, content: 'def f(x):\n    return x + 1\n' })
    expect(r.success).toBe(true)
    expect(r.output).toContain('语法自检通过')
  })

  it('坏 .py → 当场报出语法错误与行号（文件仍落盘）', async () => {
    const p = join(dir, 'bad.py')
    // 真实病例（记录 #36）：双层插值把 f-string 写坏
    const r = await writeFileTool.execute({ path: p, content: 'notes.append(f"...拼成 {suffix}..."\nx = (1,\n' })
    expect(r.success).toBe(true)
    expect(r.output).toContain('语法自检未通过')
    expect(r.output).toMatch(/line \d+/)
    expect(existsSync(p)).toBe(true)
    expect(readFileSync(p, 'utf-8')).toContain('notes.append')
  })

  it('坏 .json → JSON.parse 报错（最常见的静默坏文件）', async () => {
    const p = join(dir, 'bad.json')
    const r = await writeFileTool.execute({ path: p, content: '{"a": 1,}' })
    expect(r.success).toBe(true)
    expect(r.output).toContain('语法自检未通过')
    expect(r.output).toContain('JSON.parse')
  })

  it('坏 .sh → bash -n 报错', async () => {
    const p = join(dir, 'bad.sh')
    const r = await writeFileTool.execute({ path: p, content: 'if [ 1 -eq 1 ]; then\n  echo hi\n' })
    expect(r.success).toBe(true)
    expect(r.output).toContain('语法自检未通过')
    expect(r.output).toContain('bash -n')
  })

  it('无关扩展名不做检查（零噪音）', async () => {
    const p = join(dir, 'notes.md')
    const r = await writeFileTool.execute({ path: p, content: '# 标题\n{未闭合的花括号\n' })
    expect(r.success).toBe(true)
    expect(r.output).not.toContain('语法自检')
  })
})

describe('#33 迭代上限：有实质产出时延长一次', () => {
  let tempDir: string
  let originalHome: string | undefined

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'flare-6160-budget-'))
    originalHome = process.env.FLARE_HOME
    process.env.FLARE_HOME = tempDir
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    if (originalHome === undefined) delete process.env.FLARE_HOME
    else process.env.FLARE_HOME = originalHome
  })

  it('hasProductiveProgress：成功写文件/执行命令算推进，只读不算', () => {
    const ok = (name: string) => ({ name, target: 'x', ok: true })
    expect(hasProductiveProgress([ok('write_file'), ok('write_file')])).toBe(true)
    expect(hasProductiveProgress([ok('terminal'), ok('patch')])).toBe(true)
    expect(hasProductiveProgress([ok('read_file'), ok('search_files')])).toBe(false)
    expect(hasProductiveProgress([{ ...ok('write_file'), ok: false }, ok('read_file')])).toBe(false)
    // 只看最近 10 次：早期有写、最近只在读 → 不续命
    expect(hasProductiveProgress([ok('write_file'), ok('write_file'), ...Array.from({ length: 10 }, () => ok('read_file'))])).toBe(false)
  })

  it('用满上限但仍在写文件 → 自动延长，任务跑到自然收尾', async () => {
    const script: Call[][] = Array.from({ length: 4 }, (_, i) => [
      { name: 'write_file', args: { path: join(tempDir, `f${i}.txt`), content: `step ${i}` } },
    ])
    const llm = new ScriptedLLM(script)
    const agent = new Agent({ llm: llm as never, maxIterations: 3, autoConfirm: true })

    const events = await drain(agent)
    const extended = events.find(e => String(e.content || '').includes('预算延长'))
    expect(extended).toBeTruthy()
    // 3 轮用满后延长，第 4 轮写文件，第 5 轮文本收尾
    expect(llm.calls).toBe(5)
    const budgetErr = events.find(e => e.type === 'error' && String(e.content).includes('迭代上限'))
    expect(budgetErr).toBeUndefined()
  })

  it('用满上限但只在读文件 → 不延长，照旧报预算耗尽', async () => {
    const script: Call[][] = Array.from({ length: 4 }, (_, i) => [
      { name: 'read_file', args: { path: join(tempDir, `nope-${i}.py`) } },
    ])
    const llm = new ScriptedLLM(script)
    const agent = new Agent({ llm: llm as never, maxIterations: 2, autoConfirm: true })

    const events = await drain(agent)
    expect(events.find(e => String(e.content || '').includes('预算延长'))).toBeUndefined()
    const budgetErr = events.find(e => e.type === 'error' && String(e.content).includes('迭代上限'))
    expect(budgetErr).toBeTruthy()
  })

  it('延长只给一次：第二轮用满仍会停', async () => {
    // 每个文件都越写越多 → 一直是 health 推进，但延长只允许一次
    const script: Call[][] = Array.from({ length: 30 }, (_, i) => [
      { name: 'write_file', args: { path: join(tempDir, `g${i}.txt`), content: `step ${i}` } },
    ])
    const llm = new ScriptedLLM(script)
    const agent = new Agent({ llm: llm as never, maxIterations: 2, autoConfirm: true })

    const events = await drain(agent)
    const extended = events.filter(e => String(e.content || '').includes('预算延长'))
    expect(extended.length).toBe(1)
    const budgetErr = events.find(e => e.type === 'error' && String(e.content).includes('迭代上限'))
    expect(budgetErr).toBeTruthy()
    // 延长后上限 = max(2+50%, 2+10) = 12，跑到 12 次即停，不会无限续
    expect(llm.calls).toBeLessThanOrEqual(13)
  })
})
