# flare v0.6.159 修复说明（#37）

## #37「探索型任务」被无进展保护误杀 → 33 秒就停，任务书大半没干

**实测**：把 fluxdl 的 R2-1 任务书（修「源已变更」后检查点没真作废）交给 v0.6.158：

```
$ flare chat -m 80 -q "$(cat /tmp/fluxdl任务书-r2-1.md)" > /tmp/flare_r21.log
...
  🔧 调用工具: read_file   （连续第 15 轮只读探索：read_file / search_files / terminal 看 git log）
❌ 连续多次工具调用均无进展，已自动停止。请简化任务后重试。
（本轮结束，用时 33s）
```

33 秒、189 行日志、**零文件修改**就退出了。任务本身没问题——它当时正在正常翻代码
（`fluxdl.py:390-589`、`:760-879`、`tests/test_p01_resume_fingerprint.py:98-177`，
每轮参数都不同），只是没在两次工具调用之间说人话。

## 原因

`src/core/agent.ts`：

```ts
if (!response.content) {
  noProgressCount++ // 工具调用没有伴随文本输出，算"无进展"
}
...
if (noProgressCount >= 15) { /* 中止 */ }
```

把「这一轮模型没输出文本」等同于「没有进展」。可是探索型任务的正常形态就是连续调工具、
不说话；只有 15 轮额度，翻几个大文件就用光了。反向也漏：真正原地打转时模型往往还在
碎碎念（有文本 → 每轮清零），反而不触发。

## 修复

计数口径换成**整批工具调用签名**：

```ts
const roundSignature = allCalls
  .map(tc => `${tc.function.name}:${tc.function.arguments || ''}`)
  .sort()
  .join('\u0001')
if (response.content) noProgressCount = 0
else if (roundSignature === lastRoundSignature) noProgressCount++
else noProgressCount = 0            // 换参数 = 有新动作
lastRoundSignature = roundSignature
if (noProgressCount >= 6) { /* 中止并 backfill tool 结果 */ }
```

- 只有「相邻两轮一模一样的调用批次」才累计 → 真正的原地打转；
- 换参数（哪怕仍然没有文本）一律清零 → 探索不再被误杀；
- 阈值 15 → 6：判定变准之后可以更早停，省 token；
- 中止文案改为「连续多轮以完全相同的工具调用重试且无文本进展」，并提示 `--continue` 可续。

与 #25 的分工：`countTrailingRepeats` 管「单个签名连续重复 4 次」，这里管「多调用批次
每轮一模一样」——后者旧版完全没覆盖。

## 测试

新增 `tests/flare-issues-37.test.ts`（2 例，脚本化 mock LLM）：

| 用例 | 断言要点 |
|---|---|
| 25 轮参数各不相同的只读探索 | 不出现「无进展」错误；`llm.calls === 26`（真的跑到底）；无悬空 `tool_call` |
| 同一批（2 个不同调用）重试 12 轮 | 出现「完全相同的工具调用」错误；`llm.calls <= 8`（第 6 轮即停）；无悬空 `tool_call` |

全量 `npx vitest run`：90 文件 / 1353 例全绿；`tsc -p tsconfig.json --noEmit` 无错。
