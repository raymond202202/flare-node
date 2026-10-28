import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// 项目原先没有 vitest 配置（全用默认值）。
// v0.6.163 起 store 改用 Node 内置的 node:sqlite，Vite 5 的内置模块白名单
// 不认识这个较新的模块，会把 node:sqlite 去掉前缀后当普通包解析
// （Failed to load url sqlite），所以把 node:sqlite 别名到一个 createRequire 垫片，
// 让 Node 自己加载真正的内置模块。仅影响测试，不影响 dist 产物。
const shim = fileURLToPath(new URL('./tests/helpers/node-sqlite-shim.ts', import.meta.url))

export default defineConfig({
  ssr: { external: ['node:sqlite'] },
  resolve: {
    alias: [{ find: /^node:sqlite$/, replacement: shim }],
  },
  test: {
    server: { deps: { external: ['node:sqlite'] } },
  },
})
