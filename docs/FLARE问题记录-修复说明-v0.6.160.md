# FLARE v0.6.160 修复说明

> 对应问题记录：`FLARE问题记录.md` 末尾一组 #33–#36
> 发布版本：v0.6.160（承接 v0.6.159）
> 验证方式：TypeScript 全量类型检查 + vitest 全量回归 + **生产安装产物实测**（`~/.flare/install`）

本版共 5 项改动，其中 4 项来自问题记录（#33–#36），第 5 项（#38）是在生产模式验证 #36 时
发现的既有崩溃点——只在 `npm run build` 后的 ESM 产物里出现，vitest 测不出来，必须装机才暴露。

---

## #33　迭代上限一到就停，正干到一半的任务被腰斩

**现象**：模型迭代次数用满后 Agent 直接收尾，即使这一轮还在连续产出有效改动（写文件、跑命令、
打补丁），也要重新发一次请求才能继续，编辑到一半的文件容易停在半成品状态。

**修法**（`src/core/agent.ts`）：
- 命中上限时先判定本轮是否仍在推进：新增导出函数 `hasProductiveProgress(actions: TurnAction[])`，
  取最近 10 次动作，统计 `ok && name ∈ {write_file, terminal, patch}` 的次数，`>= 2` 视为“仍在产出”。
  纯读文件、搜索、请示都不算推进。
- 仍在产出则**只延长一次**：`extended = min(max(maxIter + ceil(maxIter/2), maxIter + 10), HARD_MAX_ITERATIONS)`，
  并向用户 yield 一条提示：`…[预算延长] 已用满 X/Y 次模型迭代，但本轮仍在持续产出有效变更，
  自动延长到 Z 次（只延长一次）。无需重新发起，继续完成当前任务。…`
- `graceUsed` 一旦为真就不再延长，防止退化成无上限循环；判定为“没在推进”或已用过宽限，照旧收尾。

**效果**：该停的时候照样停（空转、反复试探的场景不受影响），正在收尾的任务不会因为差一两次迭代被切断。

---

## #34　语义性退出码被一律当成失败

**现象**：`grep` 没有匹配返回 1、`ferry translate` 的 2/3 是“需要人工确认/参数不足”这类正常分支，
但工具层只看“非零即失败”，把这些结果报成错误，模型于是去“修”一个本来没坏的东西——这是问题记录里
反复出现的错误归因来源。

**修法**（`src/tools/index.ts`，`execute` 工具）：
- 新增参数 `expectRc: number[]`：调用方显式声明“这些非零退出码算正常结果”。
- 命中时返回 `success: true`，输出尾部追加
  `[退出码 N 已按调用方声明视为正常结果（expectRc: [...]），未按失败处理]`，输出内容原样返回。
- 白名单是**精确匹配**，不是“有 expectRc 就放水”：未声明的非零码照旧走失败分支。
- 参数化设计而不是内置规则表：内置表迟早会和实际脚本对不上，声明式更可靠，也便于模型按场景自行判断。

**用法**：`{"command": "grep -c foo file", "expectRc": [1]}`

---

## #35　复合命令失败只说“退出码”，不知道是哪一段挂的

**现象**：`a && b | c` 失败后只报最后一个退出码，前面的段失败会被掩盖（`$?` 在管道里取的是末端命令的码）；
模型拿到的信息不足以定位，容易整体重跑甚至改错地方。

**修法**（`src/tools/index.ts`）：
1. **归因更细**：`describeFailureAttribution` 新增 `hasPipe` 判定，区分
   - 管道：`退出码只反映管道末端命令，前面段失败也会被掩盖`
   - 链式：`退出码只反映链上最后执行的那一段`
2. **逐段复查清单**：按段列出可直接粘贴的命令（最多 8 段，超出显示“（其余 N 段略）”），
   每段形如 `bash -c '<段>'; echo "rc=$?"`，段内单引号做 `'\''` 转义，段原文压空白并截断 70 字符。
   同时给出摘要 `复合命令共 N 段`。
3. **`$?` 陷阱提示**：命令里出现管道且含 `$?`/`PIPESTATUS` 而未开 `pipefail` 时，追加
   ``注意 `$?` 在管道里取的是末端命令的退出码，不是被测命令的——用 `${PIPESTATUS[0]}` ``。
4. **新增参数 `traceRc: boolean`**：置真时把各段**单独重跑一次**并报告每段退出码（`[逐段复查]` 段落，
   形如 `1. echo one → rc=0`）。风险段自动跳过，超时的命令不再追加重跑，避免雪上加霜。

**注意**：`traceRc` 是真实重复执行，带副作用的命令（写文件、发请求）要看清楚再用；默认关闭。

---

## #36　写坏的脚本要等到运行时才报错

**现象**：`write_file` 写进一个语法错的 `.py`/`.json`/`.sh`，工具回“已写入”，错误要等到下一步执行才暴露，
中间白跑一轮甚至几轮。

**修法**（`src/tools/index.ts`）：新增 `checkSyntaxAfterWrite(filePath, content)`，写入当刻做**零副作用**检查：
- `.json` → `JSON.parse`
- `.py` → `python3 -c "import ast; ast.parse(...)"`（不生成 `__pycache__`）
- `.sh`/`.bash` → `bash -n`
- 其它扩展名不检查

约定：超过 1MB 跳过（避免拖慢写入）；检查器不存在时静默跳过（返回 `null`）；单次 `timeout: 5000`；
失败只取 `stderr+stdout` 前 6 行。**检查失败不影响文件已落盘的事实**，只是把错误和行号立刻回给模型。
输出为 `已写入 <path>` + `\n语法自检通过（<checker>）` 或 `\n⚠️ 语法自检未通过（<checker>）：…`。

---

## #38　ESM 产物里 `require()` 直接崩（生产验证中发现）

**现象**：本版 #36 在 vitest 里全绿，装到 `~/.flare/install` 后 `write_file` 却回
`写入失败: require is not defined`，文件根本没写。原因是项目是 ESM（`package.json` 的 `"type": "module"` +
`tsc` 的 `module: NodeNext`），而新代码在函数体里写了 `require('node:child_process')`。
vitest 走 Vite 转译并注入 CJS interop，所以测不出来；只有在真实 ESM 运行时才炸。

顺查全仓库，同类隐患还有两处，一并修掉：

| 位置 | 影响 |
| --- | --- |
| `src/tools/index.ts` `checkSyntaxAfterWrite` | 本版新增，`write_file` 直接失败（所有写入） |
| `src/tools/index.ts` `describePortConflict` | 端口占用诊断一触发就抛错，真实原因被 `require is not defined` 顶掉 |
| `src/cli/index.ts` 续跑摘要 | 在 `try/catch` 内，静默降级——续跑时永远不显示工作区未提交改动/HEAD |

**修法**：三处改为文件顶部 `import`（`spawnSync`、`execFileSync` 合并进已有的 `child_process` import），
不再依赖 TypeScript 偶然注入的 `createRequire` shim。构建后 `dist/tools/index.js` 中
`createRequire` 计数为 0，代码路径上不再有 `require()` 调用。

**教训（已写进代码注释）**：这些点在 CI/vitest 里是看不见的，发布前必须装机跑一遍关键路径。

---

## 验证记录（2026-10-28）

1. **类型检查**：`npx tsc -p tsconfig.json --noEmit` → `RC=0`，零错误。
2. **全量回归**：`npx vitest run` → 91 个测试文件、1370 个用例全部通过；
   新增 `tests/flare-issues-33-36-budget-and-rc.test.ts` 覆盖 #33–#36（含脚本化 LLM 驱动迭代预算场景）。
3. **生产安装产物实测**（`~/.flare/install/dist`，非 dev 环境）：
   - `#34`：`grep -c` 无匹配 + `expectRc: [1]` → `success: true` 且带“已按调用方声明视为正常结果”；
     不声明时 `success: false` 且错误提示点名 grep 的语义退出码。
   - `#35`：`echo one && false` + `traceRc: true` → 输出含 `[逐段复查]` 与各段 `rc=0`。
   - `#36`：写坏 `.py` → 提示“语法自检未通过”且文件仍落盘；写正常 `.py` → “语法自检通过”。
   - `#38`：端口占用场景实测（先占 8911 再起第二个服务）→ 返回端口占用诊断（`ss -ltnp` 实时结果 +
     `kill <pid>` 建议），不再出现 `require is not defined`。
4. `flare version` → `flare v0.6.160`（`~/.flare/install/package.json` 版本同步）。

---

## 风险与回滚

- `expectRc` 是纯新增参数，不声明时行为与 v0.6.159 完全一致。
- `traceRc` 默认关闭；开启会真实重跑各段，带副作用命令需人工确认。
- 语法自检只读、超时 5s、>1MB 跳过，失败不改变写入结果。
- `hasProductiveProgress` 只放宽一次上限，且封顶 `HARD_MAX_ITERATIONS`。
- 回滚：`~/.flare/install/dist.bak.<时间戳>` 为升级前产物，`rsync -a --delete` 反向覆盖即可；
  源码备份 `~/flare-src-before-<时间戳>.tgz`。
