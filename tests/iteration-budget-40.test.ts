/**
 * #40（v0.6.161）：迭代预算解析 / CLI -m 暴露
 *
 * 回归前面两个坑：`-m abc` 静默变默认、`flare chat -m 200`（交互模式）完全没生效。
 * 这里把「解析」和「算预算」都当纯函数测，不依赖 commander / process.exit。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_ITERATIONS,
  HARD_MAX_ITERATIONS,
  parseMaxIterations,
  resolveBudget,
} from '../src/core/iteration-budget.js'

describe('#40 parseMaxIterations（-m 的入参校验）', () => {
  it('不传 / 空串 → 走默认（undefined）', () => {
    expect(parseMaxIterations(undefined)).toEqual({ ok: true, value: undefined })
    expect(parseMaxIterations('')).toEqual({ ok: true, value: undefined })
    expect(parseMaxIterations('   ')).toEqual({ ok: true, value: undefined })
  })

  it('正常整数原样通过（含两端空格）', () => {
    expect(parseMaxIterations('120')).toEqual({ ok: true, value: 120 })
    expect(parseMaxIterations(' 7 ')).toEqual({ ok: true, value: 7 })
    expect(parseMaxIterations('1')).toEqual({ ok: true, value: 1 })
  })

  it('非正整数必须报错，不静默回默认', () => {
    for (const bad of ['abc', '0', '-5', '1.5', 'NaN', '12abc', 'Infinity']) {
      const r = parseMaxIterations(bad)
      expect(r.ok, `${bad} 应判为非法`).toBe(false)
      if (!r.ok) expect(r.error).toContain('正整数')
    }
  })

  it('超硬上限削到 500 且带 warning（不静默）', () => {
    const r = parseMaxIterations('5000')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toBe(HARD_MAX_ITERATIONS)
      expect(r.warning).toContain(String(HARD_MAX_ITERATIONS))
    }
  })

  it('正好等于上限不报警', () => {
    const r = parseMaxIterations(String(HARD_MAX_ITERATIONS))
    expect(r).toEqual({ ok: true, value: HARD_MAX_ITERATIONS })
  })
})

describe('#40 resolveBudget（实际预算，永不为 NaN）', () => {
  let saved: string | undefined
  beforeEach(() => {
    saved = process.env.FLARE_MAX_ITERATIONS
    delete process.env.FLARE_MAX_ITERATIONS
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.FLARE_MAX_ITERATIONS
    else process.env.FLARE_MAX_ITERATIONS = saved
  })

  it('显式配置生效', () => {
    expect(resolveBudget(120)).toBe(120)
  })

  it('未配置 → 默认 50', () => {
    expect(resolveBudget(undefined)).toBe(DEFAULT_MAX_ITERATIONS)
  })

  it('非法配置一律回默认，绝不把 NaN 流进循环条件', () => {
    for (const bad of [Number.NaN, 0, -3, Number.POSITIVE_INFINITY]) {
      const v = resolveBudget(bad)
      expect(Number.isFinite(v), `${bad} → ${v}`).toBe(true)
      expect(v).toBe(DEFAULT_MAX_ITERATIONS)
    }
  })

  it('超上限夹到硬上限', () => {
    expect(resolveBudget(99999)).toBe(HARD_MAX_ITERATIONS)
  })

  it('环境变量优先于配置，且同样受边界约束', () => {
    process.env.FLARE_MAX_ITERATIONS = '200'
    expect(resolveBudget(80)).toBe(200)
    process.env.FLARE_MAX_ITERATIONS = '99999'
    expect(resolveBudget(80)).toBe(HARD_MAX_ITERATIONS)
    process.env.FLARE_MAX_ITERATIONS = 'abc'
    expect(resolveBudget(80)).toBe(80) // env 非法 → 退回显式配置
    process.env.FLARE_MAX_ITERATIONS = '-1'
    expect(resolveBudget(80)).toBe(80)
  })

  it('小数向下取整，不留小数迭代次数', () => {
    expect(resolveBudget(12.7)).toBe(12)
  })
})
