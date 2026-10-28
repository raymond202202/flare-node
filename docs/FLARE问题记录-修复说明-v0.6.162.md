# v0.6.162 修复说明：命令级风险确认接进宿主协议（GUI 里能批准了）

> 对应问题：`#41`。上一版 v0.6.161 把「命中危险命令要确认」的规则补到 7 条（写 `/etc`、`find -delete`、
> `chown -R` 家目录、提权、`eval`…），但**只有命令行能用**。GUI 客户端起的是 `flare server`，
> 这条通道没接线，用户在客户端里既看不到弹窗、也没法批准。

## 1. 缺口到底是什么

flare 里有两套**互相独立**的确认通道：

| 通道 | 实现 | 管什么 | `server.ts` 接线 |
|---|---|---|---|
| 工具级确认门 | `core/confirm.ts` 的 `ConfirmationGate` + `wrapConfirmTools` | 「要不要调用这个工具」——按工具名（默认 `memory_save`） | ✅ 有（宿主弹窗正常） |
| 命令级风险确认 | `tools/risk.ts` 的 `setRiskConfirmer` | 「这条命令要不要执行」——按风险规则 id（`git-push`、`find-delete-recursive`…） | ❌ **只有 `src/cli/index.ts` 接了** |

`src/tools/index.ts` 的 terminal 工具在执行前调 `classifyCommand()` 分级：

- `block` → 直接拒绝（不变）；
- `confirm` → 取 `getRiskConfirmer()`：
  - **有确认器**（CLI 交互模式）→ 逐个问用户，可选允许一次 / 本会话 / 永久 / 拒绝 / 换个方案；
  - **没有确认器** → 走 `tools/index.ts` 的「无人值守」分支（v0.6.158 / #35 起已从「静默放行 + ⚠️」改为**默认拒绝**）。

GUI 恰好落在「没有确认器」这一侧。所以客户端里的表现是：

```
错误: 命令未执行：规则 find-delete-recursive（find -delete …）属于不可逆操作，
当前是无人值守模式（没有交互确认器），按安全默认拒绝。
确认要执行时，用以下任一方式显式放行：
  · flare chat --allow-risky ...
  · FLARE_ALLOW_RISKY=1 flare chat ...
```

**不是数据损坏风险**（v0.6.158 已保证不静默执行），而是**产品断裂**：让 GUI 用户去命令行加环境变量才能执行自己刚在界面上要求做的事。

## 2. 做法（只改内核，客户端零改动）

复用**已有的 `confirm` 事件通道**，不新增协议消息类型 —— 宿主协议仍是 `1.0`，GUI v0.5.0 一行不改就能弹窗。

`src/server.ts`：

1. **`buildRiskConfirmEvent()`**（纯函数，可单测）构造事件：
   ```json
   {"type":"confirm","sessionId":"…","id":"r_…","name":"terminal",
    "args":{"command":"…","rule":"find-delete-recursive","reason":"…"},
    "description":"⚠️ 风险命令（规则 find-delete-recursive）：…\n命令：find /tmp/x -delete"}
   ```
   - `name` 用 `terminal`（GUI 弹窗显示「AI 想调用工具『terminal』」）；
   - 真正的判断依据放在 `description` 里：GUI 只显示 `args` 的**键名**不显示值，所以命令本体必须写进说明；
   - 命令超过 240 字符截断，命中片段与整条命令不同时才附「命中片段」。
2. **`riskPending` 独立挂起表**（与工具级 `pendingConfirms` 分开）：id 前缀 `r_` 对工具级 `c_`，
   两套决策类型各自 `resolve`。混用一张表会让「工具确认的 deny」落到风险规则上。
3. **会话归属用 `AsyncLocalStorage` 传**：`RiskConfirmer` 签名里没有 `sessionId`，
   在 chat 处理时 `riskSessionAls.run(sessionId, …)` 包住整个 `agent.run()`，
   并发多会话时事件仍带对的那个 `sessionId`，弹窗不会派到别的会话。
4. **`confirm_result` 分流**：先查工具级挂起表，再查风险挂起表；决策经 `mapHostRiskDecision()` 显式映射，
   未知值一律 `deny`（安全默认）。
5. **超时按 deny**：`confirmTimeoutMs + 5000` 未回 → deny，界面卡住绝不自动放行不可逆操作。
6. **`setRiskAllowanceStore`**：server 也注入记忆库 kv，这样将来宿主发 `allow_session`/`always` 能真正持久化。
7. **开关**：`HostServerOptions.riskConfirm`（默认 true）+ CLI `flare server --no-risk-confirm`。
   无人值守脚本可关掉，回到 v0.6.158 的「默认拒绝」，**不因为这次改动多等 30 秒超时**。

## 3. 兼容性

- 协议版本 `HOST_PROTOCOL_VERSION` 保持 `'1.0'`：只是复用既有 `confirm` / `confirm_result` 消息，
  字段都是旧的。旧宿主忽略未知字段这一套本来就在用（v0.6.27 的 `description` 同理）。
- GUI v0.5.0 无需重装：`chatwidget.cpp` 对 `confirm` 事件按 `FlareEvent::Confirm` 统一处理，
  不按工具名白名单过滤，`description` 已有展示位。
- 客户端只发 `allow_once` / `deny`（弹窗两个按钮）；内核侧对 `allow_session` / `always` / `alternative`
  也已就位，将来客户端加「本会话允许」按钮不用再改内核。

## 4. 验证（全部用已安装产物，不是 dev 路径）

单元/回归：
- `npx tsc --noEmit` → 0 错
- `npx vitest run` → **94 files / 1408 tests 全绿**（新增 `tests/risk-confirm-host-162.test.ts` 9 用例：
  事件构造、截断、命中片段、空 reason、五个决策映射 + 未知值兜底 deny、两套通道 id 前缀隔离）

真机探针（`python3` 起 `~/.flare/install/bin/flare server`，走真实模型与真实工具，三独立会话）：

| 场景 | 操作 | 实测结果 |
|---|---|---|
| A 默认 | 命中 `find-delete-recursive` → 回 `deny` | 收到 `[confirm] id=r_mvs6php0_kblj name=terminal`，说明含规则与命令；命令**未执行**（目录文件仍在）；`done` 帧正常 |
| B 默认 | 同样命中 → 回 `allow_once` | 收到风险 confirm 事件；命令**真的执行**（探针目录被 `find -delete` 删空）；`done` 正常 |
| C `--no-risk-confirm` | 不发确认器 | **没有**任何 `r_` 事件；直接回「无人值守默认拒绝」；命令未执行 |

装机：
- `flare version` → `flare v0.6.162`；`flare version --json` → `{"engine":"0.6.162"}`
- `rsync -a --delete dist/ ~/.flare/install/dist/`，`~/.flare/install/package.json` 的 `version` 单独改为 `0.6.162`

## 5. 回滚

```bash
# 代码
git -C ~/hermes-projects/flare checkout v0.6.161 -- src/server.ts src/cli/index.ts src/index.ts
# 装机（用本轮动手前的备份）
rm -rf ~/.flare/install/dist && cp -a ~/flare-install-dist-before-<时间戳> ~/.flare/install/dist
# 并把 ~/.flare/install/package.json 的 version 改回 0.6.161
```

## 6. 已知边界（没做的）

- GUI 弹窗目前只有「允许 / 拒绝」两个按钮，没有「本会话允许」「永久允许」——内核已支持，
  客户端要加需要改界面（属于客户端 v0.5.x 的活，内核不必再动）。
- 弹窗文案是内核给的 `description`，客户端不解析规则 id；规则名对普通用户仍偏技术化，
  后续可在 `risk.ts` 里给每条规则补一句人话，`description` 直接复用。
- `flare server` 是**进程级单例**接线（`setRiskConfirmer` 是模块级单例）：一个进程只服务一个宿主，
  这符合现有部署形态；若将来一个进程服务多个宿主，需要改成按连接注入。
