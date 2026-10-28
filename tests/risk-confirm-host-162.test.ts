/**
 * v0.6.162：命令级风险确认接线到宿主弹窗（server 侧）
 *
 * 缺口背景：#35/v0.6.158 把「无人值守 + confirm 档」从「静默放行」改成「默认拒绝」，
 * 但 `setRiskConfirmer` 只在 `src/cli/index.ts` 接线。GUI 起的是 `flare server`，
 * 拿不到确认器 → 用户在客户端里既无法批准，也看不到具体是哪条命令被拦。
 *
 * 本文件只测纯函数（不启动 server、不触网）：
 *  - buildRiskConfirmEvent：事件构造（伪工具名 / 说明文案 / 截断 / 命中片段）
 *  - mapHostRiskDecision：决策映射（含未知值兜底 deny）
 *  - 与工具级确认门的隔离：id 前缀与决策类型不复用（防串线）
 */
import { describe, it, expect } from 'vitest'
import {
  buildRiskConfirmEvent,
  mapHostRiskDecision,
  RISK_CONFIRM_TOOL_NAME,
  RISK_CONFIRM_ID_PREFIX,
  buildConfirmEvent,
  type RiskConfirmInfo,
} from '../src/index.js'

const info = (over: Partial<RiskConfirmInfo> = {}): RiskConfirmInfo => ({
  command: 'git push --force origin master',
  rule: 'git-force-push',
  level: 'confirm',
  reason: '强制推送会改写远端历史',
  ...over,
})

describe('buildRiskConfirmEvent（v0.6.162 风险确认事件）', () => {
  it('复用 confirm 事件通道：type/sessionId/id/name/args 齐全', () => {
    const evt = buildRiskConfirmEvent('s1', 'r_abc', info())
    expect(evt.type).toBe('confirm')
    expect(evt.sessionId).toBe('s1')
    expect(evt.id).toBe('r_abc')
    expect(evt.name).toBe(RISK_CONFIRM_TOOL_NAME)
    expect(evt.args).toEqual({
      command: 'git push --force origin master',
      rule: 'git-force-push',
      reason: '强制推送会改写远端历史',
    })
  })

  it('说明里同时给出规则与命令本体（宿主只显示键名也能判断）', () => {
    const evt = buildRiskConfirmEvent('s1', 'r_abc', info())
    expect(evt.description).toContain('git-force-push')
    expect(evt.description).toContain('强制推送会改写远端历史')
    expect(evt.description).toContain('git push --force origin master')
  })

  it('长命令截断到 240 字符，避免弹窗被撑爆', () => {
    const evt = buildRiskConfirmEvent('s1', 'r_abc', info({ command: 'x'.repeat(500) }))
    const line = (evt.description || '').split('\n').find((l) => l.startsWith('命令：')) || ''
    // 「命令：」3 字符 + 240 + 省略号
    expect(line.length).toBeLessThanOrEqual(3 + 240 + 1)
    expect(line.endsWith('…')).toBe(true)
  })

  it('命中片段与整条命令不同才输出（整条命中时不要重复一遍）', () => {
    const same = buildRiskConfirmEvent('s1', 'r_1', info())
    expect(same.description).not.toContain('命中片段')

    const part = buildRiskConfirmEvent('s1', 'r_2', info({
      command: 'mkdir -p /tmp/x && rm -rf /tmp/x',
      segment: 'rm -rf /tmp/x',
    }))
    expect(part.description).toContain('命中片段：rm -rf /tmp/x')
  })

  it('空 reason 不产生 "undefined" 字样', () => {
    const evt = buildRiskConfirmEvent('s1', 'r_3', info({ reason: '' }))
    expect(evt.description).not.toContain('undefined')
  })
})

describe('mapHostRiskDecision（v0.6.162 宿主决策 → 风险决策）', () => {
  it('五个合法决策一一对应', () => {
    expect(mapHostRiskDecision('allow_once')).toBe('allow_once')
    expect(mapHostRiskDecision('allow_session')).toBe('allow_session')
    expect(mapHostRiskDecision('always')).toBe('always')
    expect(mapHostRiskDecision('alternative')).toBe('alternative')
    expect(mapHostRiskDecision('deny')).toBe('deny')
  })

  it('未知/空值一律 deny（安全默认，绝不当成允许）', () => {
    for (const v of ['', 'yes', 'ok', 'ALLOW_ONCE', 'allow', 'undefined', 'null']) {
      expect(mapHostRiskDecision(v)).toBe('deny')
    }
  })
})

describe('两套确认通道隔离（防串线）', () => {
  it('风险确认 id 前缀与工具级确认门不同', () => {
    expect(RISK_CONFIRM_ID_PREFIX).toBe('r_')
    const toolEvt = buildConfirmEvent('s1', 'c_abc', 'memory_save', { content: 'hi' }, '保存记忆')
    expect(toolEvt.id.startsWith(RISK_CONFIRM_ID_PREFIX)).toBe(false)
    expect(toolEvt.name).not.toBe(RISK_CONFIRM_TOOL_NAME)
  })

  it('风险事件带 description 且 name 固定为 terminal（宿主弹窗可读）', () => {
    const evt = buildRiskConfirmEvent('s1', `${RISK_CONFIRM_ID_PREFIX}x`, info())
    expect(evt.description).toBeTruthy()
    expect(evt.name).toBe('terminal')
  })
})
