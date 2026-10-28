/** 迭代预算：常量与解析（#40 / v0.6.161）
 *
 * 抽出来的原因：硬上限 500 原来在 agent.ts 和 cli/index.ts 各写一份，改一处另一处就漂移；
 * 而预算是「越界就失控」的参数，解析必须集中且可测。
 *
 * 三条硬规则：
 *  - 非法值（NaN / 0 / 负数 / 小数 / 非数字串）一律回默认，永不让 NaN 流进循环条件；
 *  - 超硬上限削到 500，并给出 warning 由调用方展示，不静默；
 *  - 环境变量 FLARE_MAX_ITERATIONS 优先于配置（便于不改调用方临时提额）。
 */
export const HARD_MAX_ITERATIONS = 500
export const DEFAULT_MAX_ITERATIONS = 50

export type ParsedMaxIterations =
  | { ok: true; value: number | undefined; warning?: string }
  | { ok: false; error: string }

/** 解析命令行 `-m/--max-iterations` 的原始字符串 */
export function parseMaxIterations(raw: string | number | undefined | null): ParsedMaxIterations {
  if (raw === undefined || raw === null) return { ok: true, value: undefined }
  const s = String(raw).trim()
  if (s === '') return { ok: true, value: undefined }
  const n = Number(s)
  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, error: `需要正整数，收到 "${raw}"` }
  }
  if (n > HARD_MAX_ITERATIONS) {
    return { ok: true, value: HARD_MAX_ITERATIONS, warning: `${n} 超出硬上限，已按 ${HARD_MAX_ITERATIONS} 执行` }
  }
  return { ok: true, value: n }
}

/** 算出本轮实际预算：env > 显式配置 > 默认，边界一律夹在 [1, HARD_MAX_ITERATIONS] */
export function resolveBudget(configured?: number): number {
  const env = Number.parseInt(process.env.FLARE_MAX_ITERATIONS || '', 10)
  const base: unknown = Number.isFinite(env) && env > 0 ? env : configured
  const n = Number(base)
  const safe = Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_ITERATIONS
  return Math.max(1, Math.min(Math.floor(safe), HARD_MAX_ITERATIONS))
}
