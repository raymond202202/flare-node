// vitest 专用垫片：Vite 5 的内置模块白名单不认识 node:sqlite，
// 会把 node:sqlite 去掉前缀后当普通包解析而报 "Failed to load url sqlite"。
// 这里用 Node 原生 require 拿真正的内置模块，绕开 Vite 解析器。
// 只影响测试；dist/ 运行时仍然是干净的 import { DatabaseSync } from 'node:sqlite'。
import { createRequire } from 'node:module'

const nodeRequire = createRequire(import.meta.url)
const mod = nodeRequire('node:sqlite') as {
  DatabaseSync: new (path: string) => unknown
}

export const DatabaseSync = mod.DatabaseSync
export default mod
