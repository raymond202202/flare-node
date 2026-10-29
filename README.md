# Flare 🔥

> ## 📦 本仓已归档为 Node/TypeScript 历史存档
>
> **主线已迁移到 Go 引擎：[`raymond202202/flare`](https://github.com/raymond202202/flare)**
> 用户侧不再需要 Node.js。本仓（原 `raymond202202/flare`，2026-10 改名为 `flare-node`）保留源码与历史，不再接受功能更新。
> GUI 客户端见 [`raymond202202/flare-client`](https://github.com/raymond202202/flare-client)。

> **Let your inspiration flare** — 让你的灵感燃起来。
>
> 🧠 **由 AI 构建** — 本项目由 AI 智能体（Hermes Agent by Nous Research）在人类指导下开发，并由 Flare 自身持续迭代进化。

**flare 的目标是成为你唯一需要的 AI 助理。** 兼容 OpenAI / DeepSeek 等多种 LLM。

![Node](https://img.shields.io/badge/Node-22-339933) ![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6) ![SQLite](https://img.shields.io/badge/SQLite-FTS5-003B57) ![License](https://img.shields.io/badge/License-MIT-yellow)

---

[English](#english) | [中文](#中文)

---

## 中文

### 快速开始

```bash
# 安装依赖
npm install

# 构建
npm run build

# 安装到本地（项目目录与安装目录分离）
sh scripts/install.sh

# 交互模式
flare

# 单次查询
flare chat -q "帮我写一个 FastAPI 服务"
```

### FreeBSD

FreeBSD 的 base 系统里**没有** node / npm / python / bash，先装依赖（`better-sqlite3` 是原生模块，需要 python3 + base 自带的 clang 编译）：

```sh
# 以 root 执行（或 pkg install 到自己的前缀）
pkg install -y node22 python3
```

之后步骤同上，用 POSIX shell 跑安装脚本即可（脚本本身不依赖 bash）：

```sh
sh scripts/install.sh
```

- 默认 shell 是 `/bin/sh`（Almquist 派生，无 `[[ ]]` / 数组 / 花括号扩展），Flare 执行命令时按 `/bin/bash` → `/usr/local/bin/bash` → `/bin/zsh` → `/bin/sh` 的顺序自动挑可用的那个
- 平台识别：`process.platform === 'freebsd'` 时 ferry 翻译默认走 `freebsd` 方言（`pkg` / `sysrc` / `service` / `ifconfig`）

### 架构

```
src/
├── cli/          # CLI 入口和命令（交互模式 + 单次查询）
├── core/
│   ├── agent.ts  # Agent 核心循环：系统提示 → LLM → 工具 → 反馈 → 继续
│   ├── config.ts # 配置管理：从 .env 和环境变量读取
│   └── llm.ts    # LLM 抽象层：支持 OpenAI / DeepSeek / 兼容 API
├── tools/
│   └── index.ts  # 工具系统：read_file / write_file / search_files / terminal
├── memory/
│   └── store.ts  # 记忆系统：SQLite + FTS5 全文搜索
└── skills/       # 技能系统（预留）
```

### 核心能力

#### 🤖 Agent 循环

```
用户输入
    ↓
加载记忆 + 会话历史
    ↓
调用 LLM（Function Calling）
    ├──→ 有工具调用 → 执行工具 → 反馈 → 继续
    └──→ 无工具调用 → 生成回复 → 输出
    ↓
保存到记忆数据库
```

#### 🛠️ 工具系统

| 工具 | 说明 | 参数 |
|------|------|------|
| `read_file` | 读取文件内容，带行号 | path, offset?, limit? |
| `write_file` | 写入/覆盖文件 | path, content |
| `search_files` | 搜索文件内容或文件名 | pattern, path?, maxResults? |
| `terminal` | 执行终端命令 | command, timeout? |
| `memory_search` | 检索持久记忆/历史消息（RAG） | query, scope?, limit? |
| `memory_save` | 保存持久记忆（用户明确要求记住时） | content, type? |

#### 🧠 记忆系统

基于 SQLite 的持久化记忆，支持：

- **会话管理**：多会话隔离，自动保存对话历史
- **全文搜索**：FTS5 引擎，高效检索历史消息
- **持久记忆**：跨会话记住用户偏好和上下文

### 安装体系

Flare 采用 **项目目录与安装目录分离** 的架构：

```
~/flare园地/flare/          # 📁 项目代码（TypeScript 源码）
    ├── src/                # 源代码
    ├── package.json
    └── scripts/install.sh  # 安装脚本

~/.flare/install/           # 📁 安装目录（构建产物）
    ├── dist/               # 编译后的 JS
    ├── bin/flare           # 启动入口
    └── node_modules/

~/.flare/                   # 📁 数据目录（运行时数据）
    ├── .env                # API Key 等敏感配置
    └── flare.db            # 记忆数据库
```

**迭代流程：**

```bash
# 1. 修改源码
# 2. 构建
npm run build
# 3. 安装到本地
bash scripts/install.sh
# 4. 验证
flare chat -q "你好"
```

### 配置

复制 `.env.example` 为 `.env` 并填入 API Key：

```bash
cp .env.example ~/.flare/.env
```

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | — |
| `OPENAI_API_KEY` | OpenAI API 密钥 | — |
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | — |
| `DEFAULT_MODEL` | 默认模型 | `deepseek-chat` |
| `OPENAI_BASE_URL` | 自定义 API 地址 | 自动检测 |
| `LLM_BASE_URL` | 主模型 API 地址覆盖（不设时按模型名自动检测：deepseek/gpt/本地 Ollama） | 自动检测 |
| `LLM_API_KEY` | 主模型 API 密钥覆盖 | 自动检测 |
| `VISION_MODEL` | 视觉模型（看图时用，可 /vision 切换） | `qwen2.5vl:3b` |
| `VISION_BASE_URL` | 视觉模型 API 地址（本地 Ollama） | `http://localhost:11434/v1` |
| `VISION_API_KEY` | 视觉模型 API 密钥 | `ollama` |
| `FLARE_HOME` | 数据目录 | `~/.flare` |

### CLI 命令

| 命令 | 说明 |
|------|------|
| `flare` | 交互模式（默认） |
| `flare chat` | 交互模式 |
| `flare chat --context-summarize` | 交互模式开启上下文压缩摘要（裁剪时把丢弃历史压缩成摘要消息，AI 保留话题连续性；v0.6.19） |
| `flare chat -q "问题"` | 单次查询模式 |
| `flare chat -q "问题" -i 图片.png` | 单次查询附带图片 |
| `flare chat -q "问题" --session <会话ID>` | 续聊已有会话（单次查询追加到该会话历史；缺省新建「单次查询」会话；会话不存在 exit 1 不触发生成；已归档会话续聊给黄色提示不拦截 v0.6.129；v0.6.128） |
| `flare server [--profile --storage --mcp --confirm-tools --confirm-timeout --max-tokens --temperature --max-context-messages --max-context-tokens --context-summarize --tool-output-policy]` | 宿主协议服务（stdin/stdout JSON Lines，供 Qt 等宿主调用；v0.6.1 起写回类工具经确认门；v0.6.5 起 --max-tokens/--temperature 设 chat 默认采样参数；v0.6.17 起 --max-context-messages/--max-context-tokens 设默认上下文自动裁剪；v0.6.19 起 --context-summarize 默认开启上下文压缩摘要；v0.6.34 起 --tool-output-policy 设默认工具输出治理策略） |
| `flare mcp-server [-t 工具名,...] [--http [--port <端口>] [--http-auth-token-env <VAR>]] [--bridge-resources] [--bridge-prompts] [--bridge-tools]` | MCP stdio 服务器：把 flare 工具集暴露给其他 AI 客户端（v0.5.8；v0.6.3 起 --http 起 HTTP transport；v0.6.28/0.6.37/0.6.47 起可透传外部 MCP 服务器资源/提示词/工具；v0.6.69 起 --http-auth-token-env 从环境变量读 Bearer 鉴权 token） |
| `flare mcp call <服务器> <工具> [JSON参数]` | 调用 MCP 服务器工具（stdio 或 HTTP transport；服务器名查 `~/.flare/mcp.json`，`--url` 直连 HTTP 端点，v0.6.6；`--header <k:v>` 可重复附加鉴权请求头，v0.6.68；--json 结构化输出（`{ server, tool, success, error?, output }` 与 server mcp_call 回包同构，工具级失败输出 `{ success:false, error }` 且 exit 1）v0.6.115；非 text 内容项（image/audio/resource）输出占位描述、structuredContent 无文本时 JSON 兜底（v0.6.117）） |
| `flare log-level <服务器> <级别>` | 设置 MCP 服务器日志级别阈值（logging/setLevel，v0.6.83；级别 debug/info/notice/warning/error/critical/alert/emergency 按严重程度升序；stdio/HTTP transport 通用；`--url` 直连 HTTP 端点，`--header <k:v>` 附加鉴权请求头 v0.6.68） |
| `flare messages <会话ID>` | 查看指定会话的消息历史（--limit N 1~500 默认 50；--recent 从最新开始；--json 结构化输出（与 server get_messages 回包同构 { sessionId, messages, ...(recent?{recent:true}:{}) }，宿主/脚本程序化消费，空会话输出 messages:[]）v0.6.107；已归档会话文本模式标题带（已归档）标记 v0.6.130；v0.6.84） |
| `flare models` | 查看可用模型：配置的主/视觉模型（settings 优先，含解析端点）+ 本地 Ollama 已拉取模型（--json 结构化输出（与 server models 回包同构 `{ configured, ollama }`，configured.main/vision 为 ModelEndpointInfo 同款 model/baseURL/hasApiKey/provider，vision 未配置 → null，ollama 不可达 ok:false 不崩）v0.6.112；v0.6.0） |
| `flare search <关键词>` | 跨会话搜索标题/消息内容（--limit N 1~100 默认 20；--json 结构化输出（与 server search_sessions 回包同构 `{ query, sessions }`，含 id/title/createdAt/updatedAt/messageCount/archived；空结果 `{ query, sessions: [] }`）v0.6.111；v0.6.85） |
| `flare search-messages <关键词>` | 全文搜索历史消息内容（--limit N 1~100 默认 10；--json 结构化输出（与 server search_messages 回包同构 `{ query, results }`，含 sessionId/role/content/createdAt，content 不截断不折叠；空结果 `{ query, results: [] }`）v0.6.110；v0.6.86） |
| `flare sessions` | 查看最近会话列表（--limit N 1~50 默认 10；--json 结构化输出（与 server list_sessions 回包同构 { sessions }，宿主/脚本程序化消费，空库输出 sessions:[]）v0.6.108；v0.6.87） |
| `flare rename <会话ID> <标题>` | 重命名会话（写操作：仅修改标题；title 非空必填；与 server rename_session 对称；v0.6.97） |
| `flare create-session <会话ID> [标题]` | 显式创建会话（写操作：UPSERT 幂等——已存在则更新标题；title 缺省「新会话」；与 server create_session 对称；v0.6.127） |
| `flare delete-session <会话ID>` | 整体删除会话（写操作：删除会话及其全部消息与用量统计，不可恢复；不存在幂等 exit 1；与 server delete_session 对称；v0.6.99） |
| `flare clear-session <会话ID>` | 清空会话全部消息（写操作：仅删除该会话消息，保留会话记录与用量；不存在幂等 exit 0；与 server clear_session 对称；v0.6.99） |
| `flare archived-sessions` | 查看归档会话列表（--limit N 1~50 默认 10；--json 结构化输出（与 server archived_sessions 回包同构 `{ sessions }`，含 id/title/updatedAt/preview，preview 截断 120 字符；空库 `{ sessions: [] }`）v0.6.111；v0.6.88） |
| `flare restore <会话ID>` | 恢复归档会话（写操作：仅修改 archived 标记，数据保留；与 server restore_session 对称；v0.6.96） |
| `flare end-session <会话ID>` | 归档会话（写操作：仅修改 archived 标记，消息与用量保留，从最近会话隐藏；空 id exit 1、不存在或已归档幂等 exit 1；与 server end_session 对称；v0.6.101） |
| `flare usage` | 查看 token 用量统计（全局汇总 + perModel 分解；--session <会话ID> 只看单会话；含缓存命中/写入/节省；--json 结构化输出（与 server get_usage/session_usage stats 同构，宿主/脚本程序化消费，空库/无记录输出零值 stats）v0.6.106；v0.6.89） |
| `flare context-status [<会话ID>]` | 查看会话上下文占用（消息数 + 估算 tokens；--budget N 正整数附裁剪建议；--json 结构化输出（与 server context_status 同构，含 suggestion.keepIndexes 供 trim 程序化消费）v0.6.104；v0.6.90） |
| `flare trim <会话ID> [--budget <tokens>]` \| `[--keep <索引列表>]` | 执行上下文裁剪（写操作：保留开头 system 块 + 最近消息，store 同步删除被裁消息、重建会话后依然生效；--budget 正整数，缺省用会话 maxContextTokens 或 16000；--keep 精确裁剪：逗号分隔整数或 JSON 数组索引列表（与 context-status --json 的 suggestion.keepIndexes 同一索引空间），与 --budget 互斥；空 id/会话不存在或无消息/非法 budget/非法或越界 keep 各 exit 1、未超预算或全索引保留幂等 exit 0；与 server apply_trim、交互 /trim 对称；v0.6.105 增 --keep；v0.6.103） |
| `flare memories [<关键词>]` | 查看持久记忆（无关键词列出全部；带关键词全文搜索；--kind 按类型过滤；--limit 1~100 默认 50；--json 结构化输出（与 server get_memories 回包同构 `{ memories }`，含 id/content/type/created_at，content 不截断不折叠；空库 `{ memories: [] }`）v0.6.109；v0.6.91；**--similar 记忆相似度检测（去重检测面，v0.6.121）**：两两比对内容相似度显示近似记忆对（文本 `#idA ↔ #idB 相似度 X.XX`；--threshold 调阈值 0~1 默认 0.4 非法 exit 1；--json 输出 `{ threshold, pairs }`；无相似/空库 exit 0；纯只读不删除） |
| `flare remember <内容> [--kind <类型>]` | 保存持久记忆（写操作：默认类型 note；--kind 指定如 preference；空内容 exit 1；与 server remember、交互 /remember 对称；v0.6.100） |
| `flare delete-memory <记忆ID>` / `--content <关键词>` | 删除持久记忆（写操作：按 id 删单条（不存在 exit 1）或 --content 按关键词批量删（幂等 exit 0）；非法 id exit 1；与 server delete_memory、交互 /forget 对称；v0.6.100） |
| `flare tools` | 查看可用工具清单（内置；含 [确认] 门标注；--json 结构化输出；v0.6.92） |
| `flare config` | 查看运行配置（只读；数据目录/主模型/视觉模型/确认门/MCP 服务器清单；--json 结构化输出；不含任何密钥；v0.6.93） |
| `flare confirm-status` | 查看确认门放行状态（只读；确认名单/跨会话持久化放行/本会话放行；--json 结构化输出；v0.6.94） |
| `flare confirm-allow <工具> [--session]` | 放行确认工具（写操作：无需等 confirm 事件；默认 always 跨会话持久化，--session 仅本进程内；与 server confirm_allow 对称；v0.6.98） |
| `flare confirm-revoke <工具>` | 撤销工具放行（写操作：会话级 + 持久化同步清除，恢复每次确认；未放行幂等 exit 0；与 server confirm_revoke 对称；v0.6.98） |
| `flare ping` | 健康检查（进程存活即 pong；--json 结构化输出；不依赖任何初始化，只读；与 server ping 对称；v0.6.95） |
| `flare version` | 输出引擎版本（只读：flare v<版本>；--json 输出 { engine }；不依赖任何初始化；与 server version 引擎字段对称；v0.6.102） |
| `flare mcp status` | 查看配置的 MCP 服务器（名称 + 传输类型 + 端点/命令 + [auth] 鉴权标记；--json 结构化输出 v0.6.80；v0.6.6/v0.6.70） |
| `flare mcp resources <服务器> [--read <uri>]` | 查看/读取 MCP 服务器暴露的资源（--json 结构化输出（列表 `{ server, resources, templates }` 与 server mcp_resources 回包同构；--read `{ server, uri, contents }` 与 mcp_read_resource 同构，空数组结构稳定可解析）v0.6.113；v0.6.10） |
| `flare mcp prompts <服务器> [--get <名称>]` | 查看/渲染 MCP 服务器暴露的提示词（--json 结构化输出（列表 `{ server, prompts }` 与 server mcp_prompts 回包同构；--get `{ server, prompt, description?, messages }` 与 mcp_get_prompt 同构）v0.6.113；v0.6.10） |
| `flare mcp tools <服务器>` | 查看 MCP 服务器暴露的工具清单（--json 结构化输出（`{ server, tools }` 与 server mcp_tools 回包同构）v0.6.113；v0.6.59） |
| `flare mcp complete <服务器> <提示词> <参数> [前缀]` | 请求 MCP 服务器提示词参数补全候选（--json 结构化输出（`{ server, prompt, argument, value?, values, total?, hasMore? }` 与 server mcp_complete 回包同构，空候选 `{ values: [] }` 合法 JSON exit 0）v0.6.114；v0.6.60） |
| `flare mcp connect <服务器>` | 动态连接 MCP 服务器（stdio 或 HTTP transport；按名连接并打印摘要：transport/target/工具数/资源/模板/提示词 + [auth] 标记（不输出 token）；成功 exit 0、未配置/连接失败 exit 1；与 server mcp_connect、交互 /mcp connect 对称；单次命令进程内连接随进程退出释放；v0.6.120） |
| `flare mcp disconnect <服务器>` | 动态断开 MCP 服务器（stdio 或 HTTP transport；已断开/未连接幂等 exit 0、未配置 exit 1；与 server mcp_disconnect、交互 /mcp disconnect 对称；v0.6.120） |
| `flare cache-check [--model <模型>] [--json] [--rounds <N>]` | prompt caching 验收：连续两轮调用验证第二轮 cache_read_tokens > 0（v0.6.45；v0.6.48 起 --json 结构化输出供宿主/CI 消费；v0.6.54 起 --rounds 2~5 多轮连续命中验收；v0.6.75 起多轮 savedUsd 累加所有命中轮；v0.6.76 起 --json/输出含 runSavedUsd 每轮节省明细；v0.6.78 起基准轮命中带残留缓存诊断；v0.6.79 起每轮命中率百分比；v0.6.116 起 --json 含 hitRatio 末轮命中率与 runHitRatios 每轮命中率（与文本模式同口径四舍五入，promptTokens=0 或失败轮 null）；v0.6.132 起文本模式每轮含缓存写入（与 usage 观测面对称）；v0.6.139 起模型行带 provider 标注 + 预期命中片段规模，本地 ollama 模型提示无服务端缓存计费；v0.6.142 起含命中片段构成诊断 hitSegmentNote） |
| `flare route [<任务文本>...]` | 任务复杂度路由决策（只读，纯函数零调用；简单任务 → 本地模型省钱，复杂任务 → 主模型保质量；文本输出 `简单/复杂任务 → 模型（provider）` + 特征 + 原因 + 本地/主模型；--json 结构化输出（单任务 `{ tier, feature, model, provider, reason, localModel, mainModel }`；批量 `{ results: [...], summary: { total, tierCounts, featureCounts }, localModel, mainModel }`）；v0.6.135；v0.6.140 起批量多参数 + stdin 管道读取；v0.6.143 起分类命中特征能力标签；v0.6.144 起批量汇总特征分布统计） |

交互模式命令：

| 命令 | 功能 |
|------|------|
| `/help` | 显示帮助 |
| `/image <路径> <问题>` | 显式看图 |
| `/vision [3b\|7b\|default]` | 切换看图模型（3b 快速 ~4s / 7b 质量 30-60s） |
| `/model [模型名\|default]` | 切换主模型（如 `/model qwen2.5:7b` 本地 Ollama，`/model deepseek-chat` 远端） |
| `/model list` | 查看本地 Ollama 可用模型（v0.6.9） |
| `/mcp` | 查看 MCP 服务器状态（`~/.flare/mcp.json` 配置，v0.5.5） |
| `/mcp connect <name>` | 连接 MCP 服务器并注入其工具（v0.5.5） |
| `/mcp disconnect <name>` | 断开 MCP 服务器（v0.5.5） |
| `/mcp resources [name]` | 查看已桥接资源/模板（v0.6.26，外部 MCP 服务器暴露的资源） |
| `/mcp prompts [name]` | 查看已桥接提示词（v0.6.36，外部 MCP 服务器暴露的提示词） |
| `/mcp tools [name]` | 查看已桥接工具（v0.6.58，外部 MCP 服务器暴露的工具名/描述） |
| `/mcp read <server> <uri>` | 读取外部 MCP 资源内容（v0.6.39，resources/read 代理） |
| `/mcp render <server> <prompt> [k=v ...]` | 渲染外部 MCP 提示词（v0.6.39，prompts/get 代理） |
| `/mcp complete <server> <prompt> <argument> [value]` | 提示词参数补全候选（v0.6.57，completion/complete 代理） |
| `/mcp call <server> <tool> [JSON参数]` | 调用外部 MCP 工具（v0.6.41，tools/call 代理） |
| `/mcp log-level <server> <level>` | 设置服务器日志级别阈值（v0.6.124，logging/setLevel 代理；级别 debug/info/notice/warning/error/critical/alert/emergency 按严重程度升序） |
| `/allow` | 查看已放行的确认工具（标注范围：本会话/跨会话持久化，v0.6.7/v0.6.10） |
| `/allow add <工具名> [session\|always]` | 显式放行（默认本会话；always 跨会话持久化，v0.6.10） |
| `/allow revoke <工具名>` | 撤销放行（恢复每次确认，v0.6.7） |
| `/tools` | 查看当前 Agent 可用工具清单（含确认门标注 ⚠需确认 与来源，v0.6.11） |
| `/memory` | 查看持久记忆；带关键词全文搜索（v0.6.25）；`/memory similar [阈值]` 检测相似记忆对（默认阈值 0.4，可传 0~1 阈值如 `/memory similar 0.6`，只读不删除，v0.6.123/125） |
| `/remember` | 保存一条记忆（如: /remember 用户喜欢浅色主题） |
| `/forget` | 删除记忆（如: /forget 浅色主题，删除包含该关键词的记忆） |
| `/usage` | 查看 token 用量（v0.6.17 起含本会话用量行；v0.6.49 起含缓存命中；v0.6.65 起含缓存节省金额；v0.6.131 起含缓存写入） |
| `/context` | 查看当前会话上下文占用（消息数/估算 tokens，v0.5.6；超预算提示 /trim，v0.6.46） |
| `/trim [预算tokens]` | 智能裁剪上下文（v0.6.46：system 保底 + 最近消息 + 配对保护；缺省用配置预算） |
| `/sessions` | 查看最近会话；带关键词搜索会话（如: `/sessions 缓存`，按标题/消息内容，v0.6.44） |
| `/search <关键词>` | 跨会话搜索历史对话（按标题/消息内容，v0.6.24） |
| `/archived` | 查看归档会话（v0.6.32，`/archive` 归档的会话） |
| `/archive [会话ID]` | 归档会话（缺省当前会话；数据保留，`/restore` 可恢复） |
| `/restore <会话ID>` | 恢复归档会话 |
| `/clear` | 清屏 |
| `/exit` | 退出 |

> 💡 **看图**：对话里直接发图片路径也会自动识别（如 `看看这张图 ~/Pictures/a.png`），
> 自动切换到本地视觉模型（VLM），图片不出本机。支持引号路径、data URL（未来 GUI 贴截图）。

---

---

## English

**Flare's goal is to be the only AI assistant you need.** Compatible with OpenAI / DeepSeek and more LLMs.

> 🧠 **Built by AI** — This project was developed by AI agents (Hermes Agent by Nous Research) under human guidance, and continuously evolves through Flare's own iteration.

### Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Install locally (project dir separated from install dir)
sh scripts/install.sh

# Interactive mode
flare

# Single query
flare chat -q "Write a FastAPI service for me"
```

### FreeBSD

The FreeBSD base system ships **no** node / npm / python / bash. Install the prerequisites first (`better-sqlite3` is a native module and needs python3 + the clang in base):

```sh
# as root
pkg install -y node22 python3
```

Then the usual steps work under a POSIX shell (the install script does not need bash):

```sh
sh scripts/install.sh
```

- The default shell is `/bin/sh` (Almquist-derived: no `[[ ]]`, no arrays, no brace expansion). Flare picks the shell for command execution in the order `/bin/bash` → `/usr/local/bin/bash` → `/bin/zsh` → `/bin/sh`
- Platform detection: when `process.platform === 'freebsd'`, ferry translation defaults to the `freebsd` dialect (`pkg` / `sysrc` / `service` / `ifconfig`)

### Architecture

```
src/
├── cli/          # CLI entry & commands (interactive + single query)
├── core/
│   ├── agent.ts  # Agent loop: system prompt → LLM → tools → feedback → continue
│   ├── config.ts # Configuration: read from .env and environment variables
│   └── llm.ts    # LLM abstraction: OpenAI / DeepSeek / compatible APIs
├── tools/
│   └── index.ts  # Tool system: read_file / write_file / search_files / terminal
├── memory/
│   └── store.ts  # Memory system: SQLite + FTS5 full-text search
└── skills/       # Skill system (reserved)
```

### Core Capabilities

#### 🤖 Agent Loop

```
User Input
    ↓
Load Memories + Session History
    ↓
Call LLM (Function Calling)
    ├──→ Tool call detected → Execute tool → Feedback → Continue
    └──→ No tool call → Generate response → Output
    ↓
Save to Memory Database
```

#### 🛠️ Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `read_file` | Read file contents with line numbers | path, offset?, limit? |
| `write_file` | Write / overwrite files | path, content |
| `search_files` | Search files by content or name | pattern, path?, maxResults? |
| `terminal` | Execute terminal commands | command, timeout? |

#### 🧠 Memory System

SQLite-based persistent memory with:

- **Session management**: Multi-session isolation, auto-save conversation history
- **Full-text search**: FTS5 engine for efficient history retrieval
- **Persistent memory**: Cross-session user preferences and context

### Installation Architecture

Flare uses a **project/install directory separation** pattern:

```
~/flaregarden/flare/          # 📁 Project code (TypeScript source)
    ├── src/                  # Source code
    ├── package.json
    └── scripts/install.sh    # Install script

~/.flare/install/             # 📁 Install directory (build artifacts)
    ├── dist/                 # Compiled JS
    ├── bin/flare             # Entry point
    └── node_modules/

~/.flare/                     # 📁 Data directory (runtime data)
    ├── .env                  # Sensitive config like API Keys
    └── flare.db              # Memory database
```

**Iteration workflow:**

```bash
# 1. Modify source code
# 2. Build
npm run build
# 3. Install locally
bash scripts/install.sh
# 4. Verify
flare chat -q "Hello"
```

### Configuration

Copy `.env.example` to `.env` and fill in your API Key:

```bash
cp .env.example ~/.flare/.env
```

| Config | Description | Default |
|--------|-------------|---------|
| `DEEPSEEK_API_KEY` | DeepSeek API key | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `DEFAULT_MODEL` | Default model | `deepseek-chat` |
| `OPENAI_BASE_URL` | Custom API endpoint | Auto-detect |
| `LLM_BASE_URL` | Main model API endpoint override (auto-detect: deepseek/gpt/local Ollama) | Auto-detect |
| `LLM_API_KEY` | Main model API key override | Auto-detect |
| `FLARE_HOME` | Data directory | `~/.flare` |

### CLI Commands

| Command | Description |
|---------|-------------|
| `flare` | Interactive mode (default) |
| `flare chat` | Interactive mode |
| `flare chat -q "question"` | Single query mode |

Interactive mode commands:

| Command | Function |
|---------|----------|
| `/help` | Show help |
| `/memory` | View persistent memories (`/memory <keyword>` searches memories, v0.6.25; `/memory similar [threshold]` detects similar/duplicate memory pairs, default threshold 0.4, optional 0~1 value like `/memory similar 0.6`, read-only, v0.6.123/125) |
| `/search <关键词>` | Search chat history across sessions (v0.6.24) |
| `/remember` | Save a memory (e.g. /remember user likes light theme) |
| `/forget` | Delete memories by keyword (e.g. /forget light theme) |
| `/sessions` | View recent sessions; `/sessions <keyword>` searches sessions by title/content (v0.6.44) |
| `/trim [budgetTokens]` | Smart context trim (v0.6.46: keeps stable system prefix + recent messages) |
| `/clear` | Clear screen |
| `/exit` | Exit |

### Changelog / Release Notes

## v0.6.144（2026-08-15）
- ✨ **route 批量汇总特征分布统计（混合模式路由决策可视化深化）**：批量路由汇总补任务构成统计——
  文本模式「汇总」行下新增「特征分布:」行（按分类命中能力标签分组计数，如
  `简单特征词（分类/抽取/摘要/翻译/格式化等） 1 · 复杂特征词（分析/推理/创作/算法等） 1`）；
  `--json` 批量输出新增 `summary: { total, tierCounts, featureCounts }` 字段（程序化消费任务
  构成，结构向后兼容——新增字段不破坏既有消费）
- 实现：src/cli/index.ts route 批量展示层（纯展示/统计，核心路由零改动）
- 测试：cli-route.test.ts 更新 2 处断言（文本模式特征分布行 + --json summary 分组统计）
- 文档：README Changelog 条目 + USAGE.md 单次命令补 summary + docs/multi-model.md 查询面同步 +
  package.json/package-lock.json 0.6.143 → 0.6.144
- 纯外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.143（2026-08-15）
- ✨ **route 分类命中特征能力标签（混合模式路由决策可视化深化）**：新增 `classifyTaskDetail(text)`
  纯函数（与 `classifyTaskComplexity` 同一规则集，额外返回命中的能力标签）；`RouteTaskResult` 新增
  `feature` 字段（代码特征 / 复杂特征词 / 长文本 / 简单特征词 / 默认）——`flare route` 文本模式新增
  「特征:」行展示「为什么这样路由」，`--json` 单任务与批量 `results[].feature` 同步透传（结构向后
  兼容，新增字段不破坏既有消费）；宿主可据此做路由统计/审计
- 实现：src/core/routing.ts（classifyTaskDetail + feature 字段）、src/index.ts 导出、
  src/cli/index.ts route 展示层（纯展示）
- 测试：routing.test.ts 补 classifyTaskDetail 五档 + 判定一致性 + routeTaskModel feature 断言
  （+7 用例）；cli-route.test.ts 补文本/JSON/批量 feature 断言（+0 用例，更新 4 处）
- 文档：README Changelog 条目 + USAGE.md 单次命令补 feature + docs/multi-model.md 查询面同步 +
  package.json/package-lock.json 0.6.142 → 0.6.143
- 纯外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.142（2026-08-15）
- ✨ **cache-check 命中片段构成诊断（prompt caching 基建深化）**：`CacheCheckResult` 新增
  `hitSegmentNote`（基于末轮命中率的人类可读说明，四档：完整命中 / 部分命中（预期，稳定前缀命中、
  user 消息尾部每次变化不参与）/ 未命中 / 命中率不可计算）——帮助理解「命中率 <100% 属正常」：
  cache-check 的 prompt = 稳定 system 前缀 + 每次变化的 user 消息，服务端按前缀缓存，命中的是
  稳定前缀部分；CLI 文本模式新增「命中片段:」行展示诊断，--json 同步透传（结构向后兼容）
- 实现：src/core/cache-check.ts 结果与序列化补字段（成功/失败分支都赋值，失败路径 null → 不可计算）；
  src/cli/index.ts cache-check 文本模式展示行（纯展示层）
- 测试：cache-check.test.ts 补 1 用例（完整/部分/未命中/失败四档 + JSON 透传）+ 既有 JSON 断言更新
- 文档：README Changelog 条目 + docs/flare-token-architecture.md 补诊断说明 + package.json/
  package-lock.json 0.6.141 → 0.6.142
- 纯外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.141（2026-08-15）
- 🐛 **findSimilarMemories 相似对规范化 idA < idB（测试稳定性修复，flare 验收提示的偶发失败源）**：
  `getAllMemories()` 按 `created_at DESC`（秒级精度）排序，同秒插入多条记忆时返回顺序不稳定——
  旧实现直接取 `mems[i].id / mems[j].id`，可能产生 `idA > idB` 的相似对，违反「每对 idA < idB」
  契约（server.test.ts 共享库残留重复记忆时偶发失败）。修复：构造 pair 时按 id 比较交换
  （`[a, b] = mems[i].id <= mems[j].id ? ... : ...`），保证契约恒成立，内容与 id 同步交换
- 测试：store.test.ts 补 1 用例（同秒批量插入 15 条近似记忆，断言所有 pair idA < idB 恒成立——
  乱序发生时能捕获旧实现违反契约，修复后恒通过）
- 文档：README Changelog 条目 + package.json/package-lock.json 0.6.140 → 0.6.141
- 纯外围修复：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.140（2026-08-15）
- ✨ **route 命令支持批量多参数 + stdin 管道读取（路由决策可视化深化，混合模式方向候选④）**：
  单任务行为不变（文本/--json 输出与 v0.6.135 完全一致，向后兼容）；新增两个批量入口——
  `flare route "任务1" "任务2" ...`（多个位置参数逐个决策，文本模式带序号 + 汇总行
  「共 N 个任务 · 简单 X · 复杂 Y」，--json 输出 `{ results: [{ task, tier, model, provider, reason }], localModel, mainModel }`）
  与 `echo "任务文本" | flare route`（无位置参数且 stdin 非 TTY 时从管道/重定向读取整体文本决策；
  终端交互不阻塞，仍无内容 → 用法提示 exit 1）
- 实现：src/cli/index.ts route 命令 `.argument('[text...]')` variadic 改造 + stdin 读取分支
  （`process.stdin.isTTY` 守卫 + `readFileSync(0)` 带 try/catch）；纯展示/入口层，routeTaskModel
  核心零改动
- 测试：cli-route.test.ts 补 4 用例（批量文本模式序号+汇总 / 批量 --json results 数组结构 /
  stdin 管道读取单任务保持原结构 / stdin 空白用法提示）+ 更新 2 既有用例（缺参/空白参显式 end
  stdin 以匹配管道 EOF 语义）+ 批量含空白参数过滤
- 文档：README Changelog 条目 + USAGE.md 单次命令补批量与管道用法 + docs/multi-model.md 查询面
  同步 + package.json/package-lock.json 0.6.139 → 0.6.140
- 纯外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.139（2026-08-15）
- ✨ **cache-check 补 provider 标注 + 预期命中片段规模（prompt caching 基建深化 + 混合模式观测面）**：
  `CacheCheckResult` 新增 `provider`（detectProvider(model)：本地 ollama vs 线上 deepseek/openai/other）
  与 `prefixChars`（构造的稳定 system 前缀字符数——「预期命中内容片段」规模：cache-check 命中的就是
  两次调用逐字节一致的稳定前缀）；CLI 文本模式模型行补 provider 标签（如 `deepseek-chat（线上 deepseek）`）、
  新增「预期命中片段」行，**本地 ollama 模型补语义提示**（无服务端缓存计费，cache_read_tokens 通常为 0
  属预期而非缓存故障，避免混合模式下误报失败）；--json 同步透传 provider/prefixChars（结构向后兼容，
  新增字段不破坏既有宿主/CI 消费）
- 实现：src/core/cache-check.ts 结果与序列化补两字段（复用 P192 上移的 detectProvider，models.ts 零依赖
  无循环）；src/cli/index.ts cache-check 文本模式两行展示 + ollama 语义提示（纯展示层）
- 测试：cache-check.test.ts 补 2 用例 + 既有断言更新（deepseek/openai/ollama/other 四 provider 标注、
  prefixChars 范围、JSON 透传、失败路径 other）
- 文档：README Changelog 条目 + package.json/package-lock.json 0.6.138 → 0.6.139
- 纯外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.138（2026-08-15）
- ✨ **usage 按提供方缓存观测深化（prompt caching 基建深化 + 混合模式成本收益）**：`按提供方:`
  区块（交互 `/usage` + 单次 `flare usage` 全局/--session 三处）provider 行补缓存命中/写入子行
  （与 perModel 子行对称：命中 tokens（命中率%）+ 节省金额、写入 tokens）——混合模式下可见
  本地 ollama 无缓存计费 vs 线上 deepseek 缓存节省，成本收益评估更完整
- 实现：src/cli/index.ts 新增 `providerCacheLines(p)` 辅助函数（返回缩进行数组；无命中/写入 →
  空数组行不变化），三处 perProvider 循环复用；store 层 groupByProvider 已聚合缓存字段（P192），
  展示层补全即可，--json 与 server 回包结构不变
- 测试：cli-usage.test.ts 补 2 用例（全局 provider 缓存子行 + --session 分支同口径）；
  prompt-caching.test.ts 补 1 用例（交互 /usage provider 缓存子行）
- 文档：README Changelog 条目 + package.json/package-lock.json 0.6.137 → 0.6.138
- 纯外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.137（2026-08-15）
- ✨ **ollama 模型发现增强：models 命令展示本地模型能力标签**：新 `inferModelCapabilities(name)`
  （src/core/models.ts 纯函数，零网络：含 vl/vision/llava → 视觉；r1/reasoner → 推理；
  embed/bge → 嵌入；coder/code → 代码；默认文本）；CLI `flare models` 文本模式与交互
  `/model list` 的本地 Ollama 列表每行补能力标签（如 `qwen2.5vl:3b  [视觉]`、
  `qwen2.5:7b  [文本]`）；--json 与 server models 回包结构不变（能力标签为展示层推导，不加协议字段）。
  同时 index.ts 导出 detectProvider 收敛到 core/models.js 单一来源（server.ts re-export 保持兼容）
- 测试：models.test.ts 补 6 用例（视觉/推理/嵌入/代码/默认文本/vl 命名变体）
- 文档：README Changelog 条目 + package.json/package-lock.json 0.6.136 → 0.6.137
- 纯外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.136（2026-08-15）
- ✨ **usage 按 provider 拆分统计（混合模式成本收益评估）**：store `getUsageStats`/`getSessionUsage`
  新增 `perProvider` 分解（按 `detectProvider` 把 perModel 归并为 provider 组：本地 ollama vs 线上
  deepseek/openai/other，含 calls/token 分解，纯内存归并无额外查询）；CLI 交互 `/usage` 与单次
  `flare usage`（全局 + --session 分支）文本模式补「按提供方:」区块（`本地 ollama: X tokens（N 次调用）`/
  `线上 deepseek: ...`）；--json 与 server get_usage/session_usage 自动透传 perProvider 字段。
  同时 **detectProvider 上移到 src/core/models.ts**（v0.6.9 起在 server.ts，现供 store/routing 复用，
  server.ts re-export 保持对外 API 不变），routing.ts 的 providerOf 副本删除改为复用——消除 P190
  flare 验收提示的技术债
- 测试：store.test.ts 补 2 用例（全局 perProvider 拆分 + 汇总一致 / 单会话对称）；cli-usage.test.ts
  补 2 用例（全局按提供方 / --session 同口径）；prompt-caching.test.ts 补 1 用例（交互 /usage 按提供方）
- 文档：README Changelog 条目 + package.json/package-lock.json 0.6.135 → 0.6.136
- 纯外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.135（2026-08-15）
- ✨ **任务复杂度路由接入面：CLI 单次命令 `flare route "<任务文本>"`（混合模式本地小模型路由查询面）**：
  P190 的纯函数路由决策（`routeTaskModel`）实操化——文本模式输出 `简单任务/复杂任务 → 模型（provider）` +
  原因 + 本地/主模型（配置 `LOCAL_MODEL` 后简单任务指向本地模型省钱）；`--json`/`-j` 结构化输出
  `{ tier, model, provider, reason, localModel, mainModel }`；缺/空参数给用法提示 + exit 1（不崩溃）。
  **纯函数零调用**：不触发生成、不创建会话（与 server models 同级只读），不改 Agent.run 核心循环
- 测试：新 tests/cli-route.test.ts 8 用例（简单→本地 / 复杂→主模型 / --json 结构 / 复杂 --json /
  未配置 LOCAL_MODEL 回退主模型 + localModel null / 缺参用法 / 空白参用法 / -j 等价）
- 文档：README Changelog 条目 + USAGE.md 单次命令补 route + multi-model.md 查询面补 CLI route +
  package.json/package-lock.json 0.6.134 → 0.6.135
- 纯外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.134（2026-08-15）
- ✨ **本地小模型路由起步（混合模式方向，最高优先级）：任务复杂度路由纯函数 + 本地路由模型配置查询面**：
  新 `src/core/routing.ts` 提供 `classifyTaskComplexity`（规则/启发式任务复杂度分类：代码特征/复杂特征词/
  长文本 → complex；简单特征词/短文本 → simple，**零网络、零 LLM 调用**）与 `routeTaskModel`（simple →
  本地路由模型省钱，complex → 主模型保质量；纯决策不发起调用）。配置新增 `LOCAL_MODEL` / `LOCAL_BASE_URL` /
  `LOCAL_API_KEY`（Ollama 命名如 qwen2.5:7b 自动走本地端点）。查询面三层对称：CLI `flare models` 文本模式
  补「本地路由」行（未配置给提示）+ `--json` 与 server models 回包同构补 `configured.local`（未配置 null）；
  server 协议 `models` 响应补 `configured.local`。**路由是外围增强，不改 Agent.run 核心循环**——编排循环
  不能被小模型替代，路由决策由宿主/CLI 在调用 provider 前按需使用
- 测试：新 tests/routing.test.ts（分类规则 6 类 + 路由决策 5 类）；server-models.test.ts 补 2 用例
  （local 未配置 null / 已配置端点信息）；cli-models.test.ts 补 1 用例（--json 与文本模式 local 同口径）
- 文档：docs/multi-model.md 补混合模式章节（背景/配置/路由规则表/查询面/宿主集成）+ host-protocol.md
  models 响应补 configured.local + README Changelog 条目 + package.json 0.6.133 → 0.6.134
- 纯外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.133（2026-08-15）
- ✨ **`flare messages --help` 描述同步归档标记能力（文档对称小步）**：
  `messages` 命令 description 补「已归档会话文本模式标题带（已归档）标记，v0.6.130」——P176 装机后
  README 命令表已同步该能力，唯独 CLI `--help` 描述仍停留在旧文案（v0.6.84/v0.6.107），帮助面与
  文档不对称；本版补齐（纯展示层 description 文本，零逻辑改动）
- 纯 CLI 外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.132（2026-08-14）
- ✨ **`flare cache-check` 文本模式每轮补「缓存写入」观测（prompt caching 基建深化，与 usage 观测面对称）**：
  cache-check 每轮用量快照 `CacheCallUsage` 早已采集 `cacheWriteTokens`（且 `--json` 结构化输出带
  `runs[].cacheWriteTokens`），唯独文本模式每轮行只显示 prompt/命中/节省——首轮 miss 基准的「写入量」
  （建立缓存的输入量）无展示，与 v0.6.131 usage 补缓存写入后的观测面不对称。本版补齐：每轮行追加
  ` · 写入 X tokens`（>0 才显示，零写入输出不变、向后兼容；与 usage 缓存写入行同口径）
- 测试：cache-check.test.ts 既有用例覆盖 runCacheCheck/cacheCheckToJson 数据层（cacheWriteTokens 早已
  断言），文本格式改动零风险；README 命令表 cache-check 行 + Changelog 条目 + package.json 0.6.132
- 纯 CLI 外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.131（2026-08-14）
- ✨ **`/usage` 与 `flare usage` 文本模式补「缓存写入」观测行（prompt caching 基建深化，观测面对称）**：
  用量统计早已落库 `cache_write_tokens`（v0.6.29 P0）且 `--json` 结构化输出也带 `cacheWriteTokens` 字段，
  唯独**文本模式**只显示缓存命中、不显示缓存写入——用户/宿主看 `/usage` 只能看到「命中省了多少」，
  看不到「首轮建立缓存写了多少输入」（DeepSeek 每次新前缀都会产生 cache_write_tokens，是缓存机制的另一半）。
  本版补齐：总览行 + 全局/本会话 perModel 子行都补 `缓存写入: X tokens`（>0 才显示，零写入输出不变，
  与命中行对称）；**store 分解同步补 `cacheWriteTokens` 字段**（getUsageStats/getSessionUsage 的
  perModel 项此前只带 cacheReadTokens，--json 消费 perModel 拿不到写入量）
- 测试：store.test.ts 补 perModel cacheWriteTokens 断言（全局 + 单会话）；cli-usage.test.ts 追加 4 用例
  （全局缓存写入行 / 无写入不出现 / --session 分支写入行 / perModel 子行写入）；prompt-caching.test.ts 追加
  2 用例（/usage 交互有写入显示 / 无写入不出现）
- 文档：README 命令表 usage 行与 /usage 行补缓存写入说明 + Changelog 条目
- 纯外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.130（2026-08-14）
- ✨ **`flare messages <会话ID>` 已归档会话文本模式标题带（已归档）标记**：search/sessions 命令展示会话时已带
  `（已归档）` 标记（search line 2362 口径），唯独 messages 命令查看指定会话消息时无归档提示——宿主/脚本
  直接查归档会话消息时无从知晓该会话已归档（从最近列表隐藏）。本版补齐：文本模式标题行 `💬 会话 <id>（已归档）`，
  与 search/sessions 的 arch 标记同口径（chalk.gray）；**--json 不加字段**（保持与 server get_messages 回包
  同构 `{ sessionId, messages }`，程序化消费结构不变）；空会话/未归档会话行为不变
- 测试（tests/cli-messages.test.ts 追加 3 用例）：已归档会话文本模式标题带（已归档）标记（含消息内容正常显示）/
  已归档会话 --json 不加 archived 字段（与 server 回包同构）/ 未归档会话不出现（已归档）标记（回归）
- 文档：README 命令表 messages 行补归档标记说明 + Changelog 条目
- 纯 CLI 外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.129（2026-08-14）
- ✨ **`flare chat -q "…" --session <会话ID>` 续聊已归档会话给黄色提示（不拦截）**：v0.6.128 续聊面装机后，`getAllSessions` 含 archived 会话（P173 观察点①「归档会话也可续聊，是否拦截可留后续」）——本版补齐决策：**提示不拦截**，与 server chat 同语义（getAgent 加载归档会话历史不检查 archived，宿主协议 chat 带归档 sessionId 本就允许续聊）；CLI 侧增加可见性——指定会话已归档时 stderr 黄色提示「该会话已归档（续聊将追加到归档会话，最近列表不可见；flare restore <会话ID> 可恢复）」后继续进入生成，exit code 不受影响
- 测试（tests/cli-chat-session.test.ts 追加 1 用例 + 既有用例补回归断言）：续聊已归档会话 → 黄色提示出现（含已归档说明与 restore 提示）+ 不误杀（「不存在」错误不出现）+ 提示后继续进入生成（「思考中」出现，证明不拦截）+ 会话保持归档状态与标题不变（提示不改写 archived 标记）；非归档会话续聊不出现「已归档」提示（回归）
- 文档：README 命令表 chat --session 行补已归档提示说明 + Changelog 条目
- 纯 CLI 外围增强：零 agent.ts 改动（Agent.run 核心循环零触碰）、零 push、零敏感信息

## v0.6.128（2026-08-14）
- ✨ **`flare chat -q "…" --session <会话ID>` 续聊已有会话（单次查询续聊面）**：此前 `chat -q` 每次新建「单次查询」会话，宿主/脚本无法把单次查询追加到已有会话（续聊只能用交互模式或 server 协议 chat 带 sessionId）——本版补齐：`-s, --session <会话ID>` 指定已有会话，Agent 构造自动加载历史（`getMessagesWithIds`，零 run 循环改动），问答续接该会话上下文；缺省行为不变（新建「单次查询」会话）；**会话不存在 → exit 1 + 提示（不触发生成）**，宿主/脚本传错 ID 不静默新建会话
- 测试（新建 tests/cli-chat-session.test.ts，3 用例）：--help 含 --session 说明（命令注册完整）/ 会话不存在 exit 1 快速返回不触发生成 / 预建会话续聊校验通过不误杀（seed 会话标题不变）
- 文档：README 命令表补 chat --session 行 + Changelog 条目

## v0.6.127（2026-08-14）
- ✨ **CLI 单次命令 `flare create-session <会话ID> [标题]`（会话管理单次命令面闭合）**：server 协议 `create_session`（宿主显式建会话）是会话管理接口中唯一缺 CLI 对称的——delete-session/clear-session（v0.6.99）、restore（v0.6.96）、rename（v0.6.97）、end-session（v0.6.101）均有，唯独「创建」语义缺失。本版补齐：`flare create-session <会话ID> [标题]` 显式创建会话（写操作：UPSERT 幂等——已存在则更新标题，与 server create_session 同语义；title 缺省「新会话」，首尾空格 trim；空会话 ID exit 1）；`set_context` 为进程内存操作（单次命令进程退出即失、无持久意义）不入此列
- 测试（新建 tests/cli-create-session.test.ts，6 用例）：带标题创建（exit 0 + 输出 + store 落库）/ 缺省标题「新会话」/ 标题空格 trim / UPSERT 幂等（已存在更新标题不报错）/ 空 ID exit 1 不写库 / 数据往返（create 后 getRecentSessions 可见）
- 文档：README 命令表补 create-session 行 + Changelog 条目

## v0.6.126（2026-08-14）
- ✨ **`/help` 的 `/memory` 行同步 `/memory similar [阈值]`**：v0.6.125 交互命令支持可选阈值但 `/help` 说明行仍停留在 v0.6.123 旧文案（P168 只更新了用法提示分支）——本版补齐：`/help` 显示 `/memory similar [阈值] 检测相似记忆对（默认 0.4，v0.6.123/125）`；`/help` 测试断言同步（`/memory similar [阈值]` + 版本标注）

## v0.6.125（2026-08-14）
- ✨ **交互命令 `/memory similar [阈值]`（可选相似度阈值，与单次命令 `memories --similar --threshold` 对称）**：v0.6.123 交互入口只支持默认阈值 0.4，无法调高/调低检出灵敏度（单次命令 v0.6.121 已有 `--threshold`）——本版补齐：`/memory similar <0~1>` 或 `/memory --similar <0~1>` 传阈值（如 `/memory similar 0.6` 只检更相似的记忆对）；阈值非法（非数字/越界 0~1）输出用法提示不崩溃；输出行显示当前阈值（`相似记忆（N 对，阈值 X）` / `未发现相似记忆（阈值 X）`）；缺省行为与 v0.6.123 逐字一致（默认 0.4，回归由测试保证）；`/help` 与命令表同步

## v0.6.124（2026-08-14）
- ✨ **交互命令 `/mcp log-level <server> <level>` + server 协议 `mcp_log_level`（log-level 三层对称收官）**：库层 `McpManager.setLogLevel`（v0.6.83）+ CLI 单次命令 `flare log-level`（v0.6.83）已有，唯独交互模式与宿主协议面缺失——本版补齐：交互会话内直接设日志级别（无需退出到 shell；8 级枚举与 CLI 同款校验，非法级别提示可选值；stdio/HTTP transport 通用）；宿主经协议 `{ type: "mcp_log_level", server, level }` 程序化控制日志推送级别（响应 `{ type: "mcp_log_level", server, level }`，缺 server/缺 level/非法 level 回 error 含提示；未连接/未配置服务器回 error 不崩）；`/help` 与命令表同步

## v0.6.123（2026-08-14）
- ✨ **交互命令 `/memory similar`（记忆去重检测面交互入口）**：交互模式可检测重复/近似记忆对——与单次命令 `flare memories --similar`（v0.6.121）同源（`MemoryStore.findSimilarMemories`，默认阈值 0.4）；显示 `#idA ↔ #idB 相似度 X.XX` + 内容截断 + `/forget` 删除提示；`/memory --similar` 等价别名；`/help` 同步

## v0.6.122（2026-08-14）
- ✨ **server 协议 `find_similar_memories` 接口（记忆去重检测面协议口）**：宿主（Pulse/StorySpire 等非 Node 宿主）经宿主协议消费记忆相似度检测——与 `MemoryStore.findSimilarMemories`（v0.6.121 store 层）同源，宿主面板可程序化发现重复/近似记忆后自行决定是否 `delete_memory` 清理（自动合并/摘要留后续候选）。请求 `{ type: "find_similar_memories", threshold?, limit? }`（threshold 可选 0~1 默认 0.4、limit 可选 1~100 默认 20，非法回 error 含提示）；响应 `{ type: "similar_memories", threshold, pairs }`（pairs 含 idA/idB/contentA/contentB/similarity，idA < idB 不重复、按相似度降序）；**纯只读不生成不删除**
- 测试（server.test.ts 追加 4 用例）：检出重复/近似对（超集模式 ≈0.46 ≥ 0.4、无关记忆不参与、idA<idB 降序）/ threshold 0.9 过滤空 + limit 1 限量 / 空库空 pairs 幂等 / 参数校验（threshold -1/1.5/abc、limit 0/101/abc 回 error 含提示）
- 文档：docs/host-protocol.md 请求类型列表 + 13.5 章节 + 响应汇总表 similar_memories 行同步

## v0.6.121（2026-08-14）
- ✨ **记忆相似度检测（`MemoryStore.findSimilarMemories` + `flare memories --similar`，记忆去重检测面）**：memory-rag「后续候选」记忆去重的第一步——宿主/用户此前无法发现重复/近似记忆（只能全部列出人工比对）。本版新增：`trigramJaccard` 纯函数（字符 3-gram 集合 Jaccard 相似度，中文友好，去除空白，<3 字短文本退化整段比较）库导出；`MemoryStore.findSimilarMemories({ threshold?, limit? })` 两两比较全部记忆内容相似度，返回 `SimilarMemoryPair[]`（idA/idB/contentA/contentB/similarity，idA < idB 不重复，按相似度降序，默认阈值 0.4 / limit 20）；CLI `flare memories --similar [--threshold <0~1>]` 显示相似记忆对（文本模式 `#idA ↔ #idB 相似度 X.XX` + 内容截断；`--json` 输出 `{ threshold, pairs }` 结构化），`--threshold` 非法（非数字/越界）exit 1，无相似对/空库「未发现相似记忆」exit 0；**纯只读不删除**（发现后由宿主决定是否 deleteMemory / deleteMemoriesByContent；自动合并摘要留后续候选）
- 测试（store.test.ts 追加 12 用例 + cli-memories.test.ts 追加 6 用例）：trigramJaccard 纯函数 6（完全相同 1 / 完全无关 0 / 近似 0~1 且共享越多越相似 / 空白差异不影响 / 短文本退化 / 空串边界）+ findSimilarMemories 6（近似对检出且 idA<idB 降序 / 完全重复 1 / threshold 过滤 / limit 截断 / 空库 / 无相似空数组）+ CLI e2e 6（文本模式对显示 / 无相似对 exit 0 / 空库 exit 0 / --json 结构 / --threshold 调高无结果 / 非法阈值 exit 1）

## v0.6.120（2026-08-14）
- ✨ **CLI 单次命令 `flare mcp connect <server>` / `flare mcp disconnect <server>`（MCP 控制面收官）**：server 协议 mcp_connect/mcp_disconnect（v0.6.56）与交互式 /mcp connect/disconnect（v0.5.5）此前均已有，唯独 CLI 单次命令形态缺失——宿主/脚本非交互场景无法按需连接/断开配置的 MCP 服务器（`mcp status --connect` 只能「全部连接」）。本版补齐：`connect` 按名连接（stdio 或 HTTP transport）并打印摘要（transport/target/工具数/资源/模板/提示词 + [auth] 标记，与交互式 /mcp connect 同构，**只标记不输出 token**）；`--timeout <ms>` 接线到 McpManager.httpTimeoutMs（HTTP 单请求超时）；成功 exit 0、未配置/连接失败 exit 1；`disconnect` 按名断开——已断开/未连接幂等 exit 0（单次命令进程内无持久连接，与 clear-session「不存在幂等 exit 0」同口径）、未配置 exit 1；单次命令进程内连接在命令完成后显式 closeAll 释放（否则 stdio 子进程继承管道会让 CLI 进程挂住，与 mcp call 的 client.close() 同因）
- 测试（新建 tests/cli-mcp-connect-disconnect.test.ts，8 用例）：HTTP 连接摘要（[HTTP] + 端点 + 工具数）/ stdio 连接摘要（工具数 + 资源/模板/提示词数）/ HTTP 配 headers → [auth] 标记且**输出绝不含 token 明文**（密钥隔离铁律测试化）/ 未配置 exit 1 / 连接失败（端点不可达）exit 1 / **--timeout 接线验证（静默服务器不响应 → 800ms 快速超时 exit 1，而非默认 15s 挂住）** / disconnect 已配置未连接幂等 exit 0 / disconnect 未配置 exit 1

## v0.6.119（2026-08-14）
- ✨ **交互式 `/mcp call` 回包统一复用 `mcpContentToText`（第四层同口径收官）**：CLI 交互命令（`src/cli/index.ts` handleSlashCommand `/mcp call` 分支）此前仍是内联 `content.filter(type === 'text')` 提取（只取 text）——本版改为复用 v0.6.117 纯函数 `mcpContentToText(res.content, res.structuredContent)`：交互会话内调 MCP 工具的非 text 内容（image/audio/resource 占位描述）与 `structuredContent` JSON 兜底不再静默丢失，与 `createMcpTools`（工具桥）/CLI `mcp call`（单次命令）/server `mcp_call`（宿主协议）**四层同口径**（同一纯函数）；纯 text 行为与旧版逐字一致（回归由测试保证）；P150/P151 全库搜索内联 filter 变体的收官
- 交互命令测试补 3 用例（mcp-command.test.ts）：rich 模式（text+image+audio+resource）占位描述且**绝不含 base64 明文** / 空 content + structuredContent JSON 兜底 / 非 text isError 占位作失败信息（base64 零泄漏）

## v0.6.118（2026-08-14）
- ✨ **server 协议 `mcp_call` 回包统一复用 `mcpContentToText`**：宿主协议（`flare server --mcp`）的 `mcp_call` 响应 `output`/`error` 字段此前与 CLI/工具桥不同口径（内联只提取 `type === 'text'`）——本版改为复用 v0.6.117 的纯函数 `mcpContentToText`（`src/server.ts` import + 替换内联 filter 提取）：宿主经协议拿 MCP 工具的非 text 内容（image/audio/resource 占位描述）与 `structuredContent` JSON 兜底，与 `createMcpTools`/CLI `mcp call` **三层同口径**；纯 text 行为与旧版逐字一致（回归由测试保证）
- server 协议测试补 2 用例（server-mcp-resources.test.ts）：rich 模式 mcp_call output 含占位描述且绝不含 base64 明文 + 纯 text 回归逐字一致

## v0.6.117（2026-08-14）
- ✨ **MCP 工具桥非 text 内容项处理（`mcpContentToText` 纯函数）**：`createMcpTools` 与 CLI `flare mcp call` 此前只提取 `content` 中 `type === 'text'` 项——MCP 工具返回 `image`/`audio`/`resource` 等非 text 内容时被**静默丢弃**（AI 只看到「无文本输出」），`structuredContent`（2025-06-18 协议结构化返回）也完全未处理；本版补齐——新库导出纯函数 `mcpContentToText(content, structuredContent?)`：text 项原文提取（多项按序拼接，与旧行为逐字一致）、image/audio 输出占位描述 `[图片/音频 mimeType: X, 数据 N 字符]`（**绝不含 base64 明文**，避免大体积/敏感二进制灌进上下文）、resource 输出 `[资源 uri: X mimeType: Y]` 占位（短 text 附内容、blob 绝不输出）、未知类型 `[内容类型: X]` 占位（不再静默丢弃）；content 全空且 structuredContent 存在 → JSON 序列化兜底（超 4000 字符截断 + 省略标记，循环引用安全）；`createMcpTools` 桥接输出与 CLI `mcp call` 文本模式/`--json` 的 `output` 字段统一复用该函数（同口径）
- 安全设计：非 text 二进制（image/audio 的 data、resource 的 blob）只输出占位描述不含明文——既防上下文 token 膨胀，也避免把敏感二进制数据回显给模型/宿主

## v0.6.116（2026-08-13）
- ✨ **`flare cache-check --json` 增加命中率字段（hitRatio / runHitRatios）**：prompt caching 验收结构化输出补齐命中率观测——`hitRatio`（末轮 cache_read_tokens / prompt_tokens × 100，四舍五入，promptTokens=0 或失败 → null）+ `runHitRatios`（每轮命中率数组，与 runs 对齐）；与 CLI 文本模式（v0.6.79 每轮命中率百分比）及 /usage 命中率观测面完全同口径，宿主/CI 消费 `--json` 时可程序化判定缓存效率（此前文本模式有百分比、--json 没有，是不对称缺口）；文本模式与退出码语义完全不变
- prompt caching 验收工具程序化观测面补齐（v0.6.48 --json 结构 → v0.6.54 rounds/runs → v0.6.76 runSavedUsd → 本版 hitRatio/runHitRatios，宿主可同时按命中量/命中率/节省三视角判定）

## v0.6.115（2026-08-13）
- ✨ **`flare mcp call` 增加 `--json` 结构化输出**：外部 MCP 服务器工具调用命令程序化收官——输出 `{ server, tool, success, error?, output }` 与 server `mcp_call` 回包完全同构（不带 type 包装；error 仅在工具级失败时携带）；成功 → exit 0，工具级失败（isError）→ `{ success:false, error }` 合法 JSON 且 **exit 1**（脚本可同时按 stdout JSON 与退出码判断）；无文本输出 → `{ output: "" }` success:true exit 0（不打印「无文本输出」兜底）；`-j` 短选项等价；只打印 JSON 不混彩色；文本模式与退出码语义完全不变
- CLI 只读命令 --json 系列外部 MCP 面全量收官（v0.6.113 mcp resources/prompts/tools、v0.6.114 mcp complete、本版 mcp call——执行类也程序化可消费）

## v0.6.114（2026-08-13）
- ✨ **`flare mcp complete` 增加 `--json` 结构化输出**：外部 MCP 服务器提示词参数补全命令程序化收官——输出 `{ server, prompt, argument, value?, values, total?, hasMore? }` 与 server `mcp_complete` 回包完全同构（不带 type 包装；value 仅在传入时携带、total/hasMore 仅在服务器返回时携带，均与 server 回包 `...(value ? { value } : {})` 同款可选字段语义）；空候选输出 `{ values: [] }` 合法 JSON exit 0（不打印「无补全候选」提示，脚本可解析）；`-j` 短选项等价；只打印 JSON 不混彩色；文本模式与退出码语义完全不变
- CLI 只读命令 --json 系列外部 MCP 面补齐最后一环（v0.6.113 已覆盖 mcp resources/prompts/tools 及 --read/--get 模式；本版补 mcp complete），并补齐 README CLI 命令摘要表缺失的 `flare mcp complete` 行

## v0.6.113（2026-08-13）
- ✨ **`flare mcp resources/prompts/tools` 增加 `--json` 结构化输出**：外部 MCP 服务器查看类命令程序化收官——resources 列表 `{ server, resources, templates }`（直连客户端同时取 resources/list + resources/templates/list）与 server mcp_resources 回包 servers[].resources/.templates 同构；`--read` `{ server, uri, contents }` 与 mcp_read_resource 同构；prompts 列表 `{ server, prompts }` 与 mcp_prompts 同构；`--get` `{ server, prompt, description?, messages }` 与 mcp_get_prompt 同构；tools 列表 `{ server, tools }`（含 inputSchema）与 mcp_tools 同构；空数组结构稳定可解析；只打印 JSON 不混彩色；文本模式与退出码语义完全不变
- CLI 只读命令 --json 系列扩展至外部 MCP 面（此前已覆盖 usage/messages/models/sessions/context-status/tools/config/version/ping/mcp status/cache-check/memories/search-messages/search/archived-sessions/confirm-status；本版补 mcp resources/prompts/tools 及 --read/--get 模式）

## v0.6.112（2026-08-13）
- ✨ **`flare models` 增加 `--json` 结构化输出**：与 server models 回包完全同构（`{ configured, ollama }`，不带 type 包装）；宿主/脚本可直接程序化消费可用模型清单（configured.main/vision 为 ModelEndpointInfo 同款 model/baseURL/hasApiKey/provider，vision 未配置 → null 与 server 语义一致，ollama 不可达 ok:false 不崩）；只打印 JSON 不混彩色；文本模式与退出码语义完全不变
- 📋 **README CLI 命令摘要表补齐 `flare models` 行**（此前唯一未入表的查看类命令），并同步 --json 能力；只读命令 --json 系列至此覆盖 usage/messages/models/sessions/context-status/tools/config/version/ping/mcp status/cache-check/memories/search-messages/search/archived-sessions/confirm-status

## v0.6.111（2026-08-13）
- ✨ **`flare search` 增加 `--json` 结构化输出**：与 server search_sessions 回包完全同构（`{ query, sessions }`，不带 type 包装）；宿主/脚本可直接程序化消费跨会话搜索命中（--limit 语义与文本模式一致，按更新时间倒序）；每项为 store 原始行（id/title/createdAt/updatedAt/messageCount/archived，含归档标记）；空结果输出 `{ query, sessions: [] }`（结构稳定可解析）；只打印 JSON 不混彩色；文本模式与退出码语义完全不变
- ✨ **`flare archived-sessions` 增加 `--json` 结构化输出**：与 server archived_sessions 回包完全同构（`{ sessions }`，不带 type 包装）；宿主/脚本可直接程序化消费归档会话列表（--limit 语义与文本模式一致）；每项为 server 同款映射（id/title/updatedAt/preview，title 默认'新会话'、preview 空白折叠 + 截断 120 字符）；空库输出 `{ sessions: [] }`（结构稳定可解析）；只打印 JSON 不混彩色；文本模式与退出码语义完全不变
- 会话搜索面程序化收官（文本 search/archived-sessions、server search_sessions/archived_sessions 结构化 → CLI search/archived-sessions --json 结构化；CLI 只读命令 --json 系列至此覆盖 usage/messages/sessions/context-status/tools/config/version/ping/mcp status/cache-check/memories/search-messages/search/archived-sessions/confirm-status）

## v0.6.110（2026-08-13）
- ✨ **`flare search-messages` 增加 `--json` 结构化输出**：与 server search_messages 回包完全同构（`{ query, results }`，不带 type 包装）；宿主/脚本可直接程序化消费历史消息全文搜索结果（--limit 语义与文本模式一致）；每项为 store 原始行（sessionId/role/content/createdAt，content 不截断不折叠）；空结果输出 `{ query, results: [] }`（结构稳定可解析）；只打印 JSON 不混彩色；文本模式与退出码语义完全不变
- 消息搜索只读面程序化收官（文本 search-messages、server search_messages 结构化 → CLI search-messages --json 结构化）

## v0.6.109（2026-08-13）
- ✨ **`flare memories` 增加 `--json` 结构化输出**：与 server get_memories 回包完全同构（`{ memories }`，不带 type 包装）；宿主/脚本可直接程序化消费持久记忆（--kind/关键词搜索/--limit 语义与文本模式一致）；每项为 store 原始行（id/content/type/created_at，content 不截断不折叠）；空库输出 `{ memories: [] }`（结构稳定可解析）；只打印 JSON 不混彩色；文本模式与退出码语义完全不变
- 记忆只读面程序化收官（文本 memories、server get_memories 结构化 → CLI memories --json 结构化）

## v0.6.108（2026-08-13）
- ✨ **`flare sessions` 增加 `--json` 结构化输出**：与 server list_sessions 回包同构（`{ sessions }`，不带 type 包装）；宿主/脚本可直接程序化消费最近会话列表（--limit 语义与文本模式一致，按更新时间倒序）；空库输出 `{ sessions: [] }`（结构稳定可解析）；每项为 store 原始行（id/title/updated_at/first_user_msg，不截断预览）；只打印 JSON 不混彩色；文本模式与退出码语义完全不变
- 会话列表只读面程序化收官（文本 sessions、server list_sessions 结构化 → CLI sessions --json 结构化）

## v0.6.107（2026-08-13）
- ✨ **`flare messages <会话ID>` 增加 `--json` 结构化输出**：与 server get_messages 回包完全同构（`{ sessionId, messages, ...(recent ? { recent: true } : {}) }`，不带 type 包装）；宿主/脚本可直接程序化消费会话消息内容（--limit/--recent 语义与文本模式一致）；空会话输出 `{ sessionId, messages: [] }`（结构稳定可解析）；content 为 store 反序列化后的实际形态（字符串；多模态图片已折叠为 [图片] 占位）；只打印 JSON 不混彩色；文本模式与退出码语义完全不变
- 会话只读面程序化收官（文本 messages、server get_messages 结构化 → CLI messages --json 结构化）

## v0.6.106（2026-08-13）
- ✨ **`flare usage` 增加 `--json` 结构化输出**：与 server get_usage/session_usage 回包 stats 完全同构（全局：promptTokens/completionTokens/cacheReadTokens/cacheWriteTokens/estimatedCostUsd/cacheSavedUsd/totalTokens/sessionCount/perModel；--session 追加 sessionId/callCount）；宿主/脚本可直接程序化消费 token 用量与缓存命中/节省数据；空库/无记录也输出零值 stats（结构稳定可解析）；只打印 JSON 不混彩色；文本模式与退出码语义完全不变
- token 用量观测面程序化收官（文本 /usage、CLI usage 文本、server get_usage/session_usage 结构化 → CLI usage --json 结构化，prompt caching P0 观测面闭环）

## v0.6.105（2026-08-13）
- ✨ **`flare trim <会话ID>` 增加 `--keep <索引列表>` 精确裁剪模式**：直接按调用方给定的消息索引保留集执行裁剪，与 `context-status --json` 的 suggestion.keepIndexes 配对形成「建议 → 精确执行」闭环（脚本可把 keepIndexes 直接喂给 `trim --keep`）；`--keep` 接受逗号分隔整数（`--keep "0,1,5,6"`）或 JSON 数组字面量（`--keep "[0,1,5,6]"`），与 `--budget` 互斥（同时提供 exit 1）；索引校验 0 ≤ i < 消息总数（含开头 system 前缀，与 context-status --json 同一索引空间），空列表/非整数/越界各 exit 1；沿用 applyTrim 的 system 块保底与 store 同步删除语义（重建会话后裁剪依然生效）；全索引保留时幂等 exit 0
- 上下文管理「查看建议 → 精确执行」闭环完成（context-status --json 输出 keepIndexes → trim --keep 原样消费）

## v0.6.104（2026-08-13）
- ✨ **`flare context-status [<会话ID>]` 增加 `--json` 结构化输出**：与 server context_status 回复结构完全同构（sessionId / messageCount / estimatedTokens / 可选 suggestion{keepIndexes, droppedCount, estimatedKeptTokens, estimatedDroppedTokens}）；--json 模式用 Agent 数据源（含开头 system 前缀，与 server 同一索引空间），--budget 建议的 keepIndexes 可直接供 `flare trim`（v0.6.103）程序化消费；无 --budget 时不输出 suggestion；文本模式与退出码语义完全不变
- 上下文管理「查看建议 → 执行裁剪」闭环的自动化基础（context-status --json 输出建议 → trim 执行）

## v0.6.103（2026-08-13）
- ✨ **新增 `flare trim <会话ID> [--budget <tokens>]` 单次命令**：执行上下文裁剪（写操作：保留开头 system 块 + 最近消息，store 同步删除被裁消息、重建会话后裁剪依然生效；--budget 正整数校验，缺省用会话级 maxContextTokens 或 16000；空 id / 会话不存在或无消息 / 非法 budget 各 exit 1，未超预算幂等 exit 0），与 server apply_trim、交互 /trim 对称
- 与 `flare context-status`（v0.6.90 查看占用 + 裁剪建议）配对形成「查看建议 → 执行裁剪」闭环；上下文裁剪执行接口单次命令形态首例（宿主/脚本场景此前无裁剪执行的非交互入口）

## v0.6.102（2026-08-13）
- ✨ **新增 `flare version [--json]` 单次命令**：输出引擎版本（只读：`flare v<版本>`；--json 输出 `{ engine }` 供宿主/脚本程序化消费；不依赖任何初始化，与 server version 引擎字段对称、与 ping 同类）
- 宿主/脚本版本查询入口（此前 CLI 无版本查询命令）；与 ping 配对构成「健康探测 + 版本协商」只读探测面

## v0.6.101（2026-08-13）
- ✨ **新增 `flare end-session <会话ID>` 单次命令**：归档会话（写操作：仅修改 archived 标记，消息与用量全部保留，从「最近会话」隐藏、archived-sessions 可见；空 id exit 1；不存在或已归档幂等 exit 1），与 server end_session 对称
- 会话归档管理闭环单次命令（查看 archived-sessions v0.6.87 → 归档 end-session → 恢复 restore v0.6.96）；归档写操作接口单次命令形态首例

## v0.6.100（2026-08-13）
- ✨ **新增 `flare remember <内容> [--kind <类型>]` 单次命令**：保存持久记忆（写操作：默认类型 note，--kind 指定如 preference；内容 trim 后为空 exit 1；成功「已记住」exit 0），与 server remember、交互 /remember 对称
- ✨ **新增 `flare delete-memory <记忆ID>` / `flare delete-memory --content <关键词>` 单次命令**：删除持久记忆（写操作：按 id 删单条——非法 id（非正整数）exit 1、不存在 exit 1、成功 exit 0；--content 按关键词批量删——输出删除条数、无匹配幂等 exit 0；id 与 --content 同时提供以 id 为准），与 server delete_memory、交互 /forget 对称
- 记忆管理闭环单次命令（查看 v0.6.91 memories → 保存 remember → 删除 delete-memory）；记忆写操作接口单次命令形态首例（memories 表无外键、FTS 由 DELETE 触发器联动清理，低风险不触发生成）

## v0.6.99（2026-08-13）
- ✨ **新增 `flare delete-session <会话ID>` 单次命令**：整体删除会话（写操作：删除会话及其全部消息与用量统计，事务原子、不可恢复；空 id exit 1、不存在幂等 exit 1），与 server delete_session 对称
- ✨ **新增 `flare clear-session <会话ID>` 单次命令**：清空会话全部消息（写操作：仅删除该会话消息，保留会话记录与用量，FTS 触发器联动清索引；空 id exit 1、不存在幂等 exit 0），与 server clear_session 对称
- 破坏性会话管理写操作单次命令系列（restore v0.6.96 / rename v0.6.97 / confirm-allow+revoke v0.6.98 延续）；delete 与 clear 语义对比：delete 移除会话记录，clear 保留会话仅清消息
> 中文条目 / Chinese entries · English summary for each version
## v0.6.98（2026-08-13）
- ✨ **新增 `flare confirm-allow <工具> [--session]` 单次命令**：放行确认工具（写操作：无需等 confirm 事件；**默认 always 跨会话持久化**——单次命令进程内会话级放行恒为空（每次运行都是新 ConfirmationGate 实例，allowSession 仅进程内存、结束即失，与 v0.6.94 confirm-status 语义一致），`--session` 仅本进程内有效；空工具名 exit 1），与 server confirm_allow 对称
- ✨ **新增 `flare confirm-revoke <工具>` 单次命令**：撤销工具放行（写操作：会话级 + always 持久化同步清除，恢复每次确认；未放行幂等 exit 0；空工具名 exit 1），与 server confirm_revoke 对称
- 与 `flare confirm-status`（v0.6.94 只读查看）配对形成闭环：查看 → 放行 → 撤销；写操作接口单次命令系列第三例（restore v0.6.96 / rename v0.6.97）
> 中文条目 / Chinese entries · English summary for each version
## v0.6.97（2026-08-13）
- ✨ **新增 `flare rename <会话ID> <标题>` 单次命令**：重命名会话（写操作：仅修改标题；title 非空必填，空标题 exit 1；UPSERT 语义与 server 一致），与 server rename_session 对称
> 中文条目 / Chinese entries · English summary for each version
## v0.6.96（2026-08-13）
- ✨ **新增 `flare restore <会话ID>` 单次命令**：恢复归档会话（写操作：仅修改 archived 标记，数据保留，不触发生成；不存在/未归档幂等 exit 1），与 server restore_session 对称
> 中文条目 / Chinese entries · English summary for each version
## v0.6.95（2026-08-12）
- ✨ **新增 `flare ping` 单次命令**：健康检查（进程存活即 pong；--json 结构化输出；不依赖任何初始化，只读），与 server ping 对称
> 中文条目 / Chinese entries · English summary for each version
## v0.6.94（2026-08-12）
- ✨ **新增 `flare confirm-status` 单次命令**：查看确认门放行状态（确认名单 + 跨会话持久化放行 + 本会话放行；--json 结构化输出；只显示工具名不含任何密钥），与 server confirm_status 对称（只读）
> 中文条目 / Chinese entries · English summary for each version
## v0.6.93（2026-08-12）
- ✨ **新增 `flare config` 单次命令**：查看运行配置（数据目录/主模型/视觉模型/确认门/MCP 服务器清单；--json 结构化输出；不含任何密钥），与 server get_config 对称（只读）
## v0.6.92（2026-08-12）
- ✨ **新增 `flare tools` 单次命令**：查看可用工具清单（内置工具 + 确认门标注；--json 结构化输出），与 server tools 对称（只读）
## v0.6.91（2026-08-12）
- ✨ **新增 `flare memories` 单次命令**：查看持久记忆（无关键词列出全部；带关键词全文搜索；--kind 按类型过滤；--limit 1~100 默认 50），与 server get_memories 对称（只读）
## v0.6.90（2026-08-12）
- ✨ **新增 `flare context-status` 单次命令**：查看会话上下文占用（消息数 + 估算 tokens；--budget N 附裁剪建议），与 server context_status 对称（只读）
## v0.6.89（2026-08-12）
- ✨ **新增 `flare usage` 单次命令**：token 用量统计（全局汇总 + perModel 分解；--session <会话ID> 只看单会话；含缓存命中/节省），与 server get_usage/session_usage 对称（只读）

## v0.6.88（2026-08-12）
- ✨ **新增 `flare archived-sessions` 单次命令**：归档会话列表（首条 user 消息预览，与 server list_archived_sessions 对称；只读）

## v0.6.87（2026-08-12）
- ✨ **新增 `flare sessions` 单次命令**：最近会话列表（首条 user 消息预览，与 server recent_sessions 对称）
- ✨ **新增 `flare search-messages` 单次命令**：消息级全文搜索历史消息（FTS5 trigram + 短查询 LIKE 回退），与 server search_messages 对称



#### v0.6.85 (2026-08-12) — `flare search` 命令（跨会话搜索）
- ✨ **新增 `flare search <关键词>` 命令**：与 server search_sessions 对称的跨会话搜索入口——LIKE 匹配会话标题或会话内任意消息内容，找回「聊过什么但忘了哪个会话」（交互式 /sessions <关键词> 已有 v0.6.44，本轮补单次命令）。
- - `--limit N`（1~100 默认 20，非法退出码 1）；结果按更新时间倒序，带（已归档）标记与消息数。
- - 🧪 **全绿**（新增 6 用例：标题命中 / 内容命中 / 无匹配 / --limit / 非法 limit / 归档标记），tsc 0 错误，**零 agent.ts 改动**
#### v0.6.84 (2026-08-12) — `flare messages` 命令（查看指定会话消息历史）
- ✨ **新增 `flare messages <会话ID>` 命令**：与 server get_messages 对称的只读查看入口——默认取最早 limit 条（长会话看开头），`--recent` 从最新一条往回显示（看最近内容）。
- `--limit N`（1~500 默认 50，非法退出码 1）；空会话友好提示；内容 200 字符截断 + 角色图标。
- 🧪 **全绿**（新增 6 用例：默认最早 / --recent / --limit / 非法 limit / 空会话 / 截断+图标），tsc 0 错误，**零 agent.ts 改动**
#### v0.6.83 (2026-08-12) — `flare log-level` 命令（MCP logging/setLevel 桥接，stdio/HTTP 通用）

- ✨ **新增 `flare log-level <服务器> <级别>` 命令**：把库层 MCP 客户端的 logging 能力
-  （v0.6.13 起 client.ts/http-client.ts 已有 setLogLevel）暴露给 CLI——连接 stdio/HTTP
-  transport 服务器后用 logging/setLevel 设置日志级别阈值（8 级：
-  debug/info/notice/warning/error/critical/alert/emergency，按严重程度升序）。
-  低于该级别的 notifications/message 日志不再推送。
- - **CLI 侧先校验合法级别**：与 MCP_LOG_LEVELS 一致 8 级；不合法直接报错（退出码 1）而非千里发请求。
- - 支持 `--url` 直连 HTTP 端点（跳过配置查找）、`--config` 自定义配置文件、`--header` 附加鉴权头。
- - `McpManager.setLogLevel(server, level)`：未连接服务器 → 清晰 reject（/未连接/），不崩进程。
- - server.ts `logging/setLevel` 已有实现（628 行）——CLI 只是桥接，零 MCP 协议改动。
- - README Changelog + 版本号 0.6.83
- - 🧪 **884/884 全绿**（新增 7 用例：manager stdio/HTTP setLogLevel 送达 + 未连接 reject；CLI
-   合法 8 级全过 / 非法级别退出码 1 / 未配置退出码 1），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.82 (2026-08-12) — README 命令表补齐 cache-check v0.6.78/79 能力（文档对称）

- ✨ **README 命令表 `flare cache-check` 行补 v0.6.78/79 能力**（纯文档，零代码变更）：
-  v0.6.78/79 的能力（基准轮残留缓存诊断、每轮命中率百分比）在命令行摘要表未同步——用户从
-  README 看不到；本轮补齐（与 v0.6.74/0.6.77/0.6.81 纯文档先例一致）
- - README Changelog + 版本号 0.6.82
- - 🧪 **877/877 全绿**（纯文档改动，无代码变更），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.81 (2026-08-12) — README/docs 同步 mcp status --json（文档对称，纯文档）

- ✨ **README 命令表 `flare mcp status` 行 + docs/mcp.md CLI 章节补 `--json`**（纯文档，
-  零代码变更）：v0.6.80 的 --json 能力在命令表/文档未同步——用户从 README/docs 看不到
-  结构化输出入口；本轮补齐（与 v0.6.74/0.6.77 纯文档先例一致）
- - README Changelog + 版本号 0.6.81
- - 🧪 **877/877 全绿**（纯文档改动，无代码变更），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.80 (2026-08-12) — `flare mcp status --json` 结构化输出（方向② 外围增强）

- ✨ **`flare mcp status` 支持 `--json` 结构化输出**（host/脚本程序化消费）：
- - 输出与 server mcp_status 同源的 `McpServerStatus[]`（name/transport/target/connected/
-  toolCount/auth 等；auth 只传布尔不传 token，JSON 不泄漏鉴权信息）
- - `--connect` 语义保留（先连接再输出真实状态）；未配置 → `[]`（稳定形状，退出码 0）
- - 人类可读输出不变（向后兼容）；只打印 JSON 不混彩色
- - README Changelog + 版本号 0.6.80
- - 🧪 **877/877 全绿**（新增 2 用例：--json 字段齐全 + auth 布尔不泄漏 token；无配置 → []），
-   tsc 0 错误，**零 agent.ts 改动**

#### v0.6.79 (2026-08-12) — cache-check 人类可读输出命中率百分比（prompt caching 基建深化）

- ✨ **`cache-check` 每轮行加命中率百分比**：`命中 896 tokens（75%）`（prompt 为 0 时不显示）：
- - 与 /usage 的命中率观测面对称（v0.6.49 起 /usage 显示百分比、cache-check 只有绝对量）——
-  用户一眼看出前缀命中比例（DeepSeek 服务端缓存通常部分命中，非 100%）
- - 纯显示层改动（核心判定/--json 结构不变）；--json 消费方仍用 runs 自算百分比
- - README Changelog + 版本号 0.6.79
- - 🧪 **875/875 全绿**（显示层改动，无逻辑变更），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.78 (2026-08-12) — cache-check 基准轮命中诊断（prompt caching 基建深化）

- ✨ **`cache-check` 基准轮（第 1 轮）已命中时 detail 追加诊断提示**：
-  真实场景：<5min 内重跑 cache-check 时服务端残留缓存会让「miss 基准」实际已命中——
-  此前用户看到基准轮命中会困惑；本轮追加 `（诊断：基准轮已有 X tokens 命中——服务端残留缓存
-  或此前 <5min 用过同前缀，miss 基准可能不纯，节省估算偏保守）`
- - 判定逻辑不变（ok/命中量/节省估算均不受影响）；基准轮未命中 → 无提示（与旧版一致）
- - --json 的 detail 字段同样携带诊断（宿主可消费）
- - README Changelog + 版本号 0.6.78
- - 🧪 **875/875 全绿**（新增 2 用例：基准轮命中 → 诊断提示 + runSavedUsd[0]>0；基准轮未命中 →
-   无提示向后兼容），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.77 (2026-08-12) — README 命令行摘要表补齐 cache-check v0.6.75/76 能力（文档对称）

- ✨ **README 命令表 `flare cache-check` 行补 v0.6.75/76 能力**（纯文档，零代码变更）：
-  v0.6.75/76 的能力在 README 命令行摘要表未同步——用户从 README 看不到多轮 savedUsd 累加与
-  runSavedUsd 每轮节省明细；本轮补齐（与 v0.6.74 纯文档先例一致）
- - README Changelog + 版本号 0.6.77
- - 🧪 **873/873 全绿**（纯文档改动，无代码变更），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.76 (2026-08-12) — cache-check 每轮节省明细 runSavedUsd（prompt caching 基建深化）

- ✨ **`cache-check` 新增每轮节省明细 `runSavedUsd`**（与 runs 对齐，第 i 项 = 第 i+1 轮
-  miss 价 − hit 价；无法定价 → null；基准/未命中轮为 0）：
- - `--json` 输出新增 `runSavedUsd` 字段（宿主/CI 可逐轮看省钱分布，非只看到总节省）
- - 人类可读输出每轮行尾追加 `（节省 $X.XXXXXX）`（>0 才显示，与总节省同口径）
- - 总节省 `savedUsd` 语义不变（v0.6.75 起累加所有命中轮）；向后兼容
- - README Changelog + 版本号 0.6.76
- - 🧪 **873/873 全绿**（新增 2 用例 + 1 断言：多轮每轮明细精确相等且总节省 = 明细和；无法定价
-   全部 null；--json 含 runSavedUsd），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.75 (2026-08-12) — cache-check 多轮验收 savedUsd 累加所有命中轮（prompt caching 基建深化）

- ✨ **`cache-check --rounds >2` 时 `savedUsd` 从「只算最后一轮」改为「累加所有命中轮」**：
-  修复此前多轮验收时宿主/CI 消费 `--json` 看到的总节省被低估（第 2..N-1 轮的节省漏算）；
-  rounds=2（默认）时只有一个命中轮，结果与旧版完全一致（向后兼容）
- - 未命中轮不计节省（该轮无命中价差）；任一轮无法定价 → 整体 null（语义不变）
- - README Changelog + 版本号 0.6.75
- - 🧪 **871/871 全绿**（新增 2 用例：3 轮两命中 → 总节省 ≈ 2×单轮；中间轮 miss → 只累加命中轮），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.74 (2026-08-12) — README 命令行摘要表补齐 v0.6.54/68/69/70 能力（文档对称）

- ✨ **README 命令表补 `mcp-server --http/--http-auth-token-env`、`mcp call --header`、
-  `mcp status [auth]`、`cache-check --rounds`**（纯文档，零代码变更）：
-  v0.6.54/68/69/70 的能力在 README 命令行摘要表未同步——用户从 README 看不到多轮验收、
-  HTTP 服务端鉴权、--header 鉴权头、状态 [auth] 标记等入口；本轮补齐（与 v0.6.62 纯文档先例一致）
- - `flare mcp-server` 行：`--http` + `--http-auth-token-env <VAR>`（v0.6.3/0.6.69）
- - `flare mcp call` 行：`--header <k:v>` 可重复鉴权头（v0.6.68）
- - `flare mcp status` 行：`[auth]` 鉴权标记（v0.6.70）
- - `flare cache-check` 行：`--rounds <N>` 多轮验收（v0.6.54）
- - README Changelog + 版本号 0.6.74
- - 🧪 **868/868 全绿**（纯文档改动，无代码变更），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.73 (2026-08-12) — get_config 的 mcpServers 带 auth 鉴权标记（方向③ MCP 增强，v0.6.70 配置视角对称）

- ✨ **server `get_config` 响应 `mcpServers` 每项补 `auth` 标记**（src/server.ts + 测试）：
-  v0.6.70 给运行态 `mcp_status` 加了 auth，但**配置视角的 `get_config.mcpServers` 仍只有
-  name/transport**——宿主「设置/关于」面板看不出哪些服务器配了鉴权（只能翻 mcp.json）；本轮补齐
-  （纯外围，零 agent.ts 改动）
- - **`mcpServers[].auth`**：HTTP transport 配了 `headers` → `true`（只传布尔不传 token，与
-  mcp_status 同源；stdio/未配置 → 缺省 undefined，向后兼容）
- - docs/host-protocol.md（§get_config mcpServers auth 说明）+ README Changelog + 版本号 0.6.73
- - 🧪 **868/868 全绿**（新增 1 用例：--mcp 配 HTTP url+headers → get_config mcpServers 带
-  auth:true 且不含 token、stdio 无 auth），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.72 (2026-08-12) — `/mcp connect` 摘要带 [auth] 鉴权标记（方向③ MCP 增强，v0.6.70 对称补齐）

- ✨ **CLI `/mcp connect` 摘要补 `[auth]` 标记**（src/cli/index.ts + 测试）：
-  v0.6.70 给 `/mcp` 状态行与 `flare mcp status` 加了 [auth]，但 **connect 成功摘要仍只有
-  [stdio]/[HTTP] + 目标**——连接配了鉴权头的 HTTP 服务器后看不到鉴权标记；本轮对称补齐
-  （纯外围，零 agent.ts 改动）
- - **connect 摘要**：`已连接 <name> [HTTP][auth] <url>（N 个 MCP 工具…）`——auth 与 /mcp 状态行
-  **同源**（都来自 `McpManager.status()`），只显示标记不显示 token
- - docs/mcp.md（connect 摘要示例补 [auth]）+ README Changelog + 版本号 0.6.72
- - 🧪 **867/867 全绿**（新增 1 用例：connect 摘要 [HTTP][auth] 透传显示完整 + 不含 token），
-  tsc 0 错误，**零 agent.ts 改动**

#### v0.6.71 (2026-08-12) — host-protocol.md `--mcp` 配置文档补齐 url/headers/timeoutMs（方向③ 收尾，纯文档）

- ✨ **docs/host-protocol.md 启动章节 `--mcp` 配置补 url/headers/timeoutMs 说明**（纯文档，零代码变更）：
-  `McpServerConfig` 的 `url`（v0.6.6）/ `headers`（v0.6.67）/ `timeoutMs` 扩展后，`flare server
-  --mcp`（`mcpManager.setConfig`）早已自动支持，但**宿主文档示例仍停在 name/command/args/env**——
-  宿主开发者不知道可配 HTTP transport + 鉴权头；本轮补齐（与 v0.6.62 纯文档先例一致）
- - `--mcp` 配置项说明：`url` → HTTP 直连（不 spawn）；`headers` → HTTP 鉴权头（仅 url 模式，
-  stdio 用 `env`）；`timeoutMs` → 单服务器超时覆盖；示例含 stdio + HTTP 鉴权双服务器
- - README Changelog + 版本号 0.6.71
- - 🧪 **866/866 全绿**（纯文档改动，无代码变更），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.70 (2026-08-12) — MCP 连接状态带 auth 鉴权标记（方向③ MCP 增强，v0.6.67~69 鉴权闭环的观测面收尾）

- ✨ **`McpServerStatus.auth` + server `mcp_status` 透传 + CLI `/mcp` / `flare mcp status` 显示 `[auth]`**（src/mcp/types.ts + src/mcp/manager.ts + src/cli/index.ts + 测试）：
-  v0.6.67~69 建好了客户端↔服务端鉴权，但**观测面缺失**——宿主面板/CLI 看不出哪些服务器配了
-  鉴权（只能翻 mcp.json）；本轮补状态标记（纯外围，零 agent.ts 改动）
- - **`status().auth`**：HTTP transport 配置了 `headers` → `true`；**只传布尔不传 token**
-  （安全：状态观测不泄漏凭据）；stdio/未配置 → 缺省 undefined（向后兼容）
- - **server `mcp_status`** 直接透传 status()（协议自动带 `auth`）——宿主面板可显示「鉴权」徽标
- - **CLI**：交互 `/mcp` 与 `flare mcp status` 状态行 HTTP 后追加黄色 `[auth]` 标记
- - docs/host-protocol.md（§16 auth 字段说明）+ README Changelog + 版本号 0.6.70
- - 🧪 **866/866 全绿**（新增 2 用例：manager status auth=true/缺省 undefined + CLI status 显示
-  [auth] 且不显示 token 值），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.69 (2026-08-12) — MCP HTTP transport 服务端 Bearer 鉴权（方向③ MCP 增强，与 v0.6.67/68 客户端鉴权闭环）

- ✨ **`startMcpHttpServer({ authToken })` + `flare mcp-server --http-auth-token-env <VAR>`**（src/mcp/http.ts + src/cli/index.ts + 测试）：
-  v0.6.67/68 只解决了「flare 连受保护服务器」——**flare 自己当 HTTP 服务器时仍全开放**
-  （仅 127.0.0.1 兜底），跨机/半可信网络暴露 flare 原生工具（terminal 等）风险高；本轮补齐服务端
-  侧（纯外围，零 agent.ts 改动），客户端↔服务端鉴权形成完整闭环
- - **库层**：`McpHttpServerOptions.authToken`——设置后所有请求必须带 `Authorization: Bearer
-  <token>`，不匹配 → `401` + `-32001 Unauthorized`（不进入协议处理）；不设置 → 匿名照常（向后兼容）
- - **CLI**：`flare mcp-server --http --http-auth-token-env FLARE_MCP_TOKEN`——从环境变量读
-  token（**不落命令行**，避免 shell history 泄漏）；环境变量未设置 → 报错退出码 1；启动日志标注
-  「Bearer 鉴权已启用」
- - docs/mcp.md（HTTP 服务器 Bearer 鉴权 + CLI 用法）+ README Changelog + 版本号 0.6.69
- - 🧪 **864/864 全绿**（新增 7 用例：服务端 401 无 token/错误 token/正确 token 200/未设置向后兼容 +
-  CLI e2e --http-auth-token-env 401→200 + 客户端闭环带 headers 成功/不带 401 reject），tsc 0 错误，
-  **零 agent.ts 改动**

#### v0.6.68 (2026-08-12) — CLI mcp 单次命令 `--header` 鉴权请求头（方向③ MCP 增强，与 v0.6.67 对称）

- ✨ **`flare mcp call/resources/prompts/tools/complete` 全部支持 `--header <k:v>`（可重复）**（src/cli/index.ts + 测试）：
-  v0.6.67 给库层（`MCPHttpClientOptions.headers`）和配置层（`McpServerConfig.headers`）补了
-  鉴权头，但 **CLI 单次命令侧未对称**——`--url` 直连远程受保护 HTTP 服务器时仍无法带 token，
-  必须临时改配置文件；本轮补齐（纯外围，零 agent.ts 改动）
- - **`--header "Authorization: Bearer <token>"`**：5 个单次命令全部支持（可重复收集多个键）；
-  `--url` 直连与配置路径都生效；与配置 `headers` 合并时 **CLI 优先**（覆盖同名键）
- - **非法格式**（缺冒号/空键）→ 退出码 1 + `--header 格式应为 key:value` 用法提示（不崩溃）
- - docs/mcp.md（CLI 章节 --header 示例）+ README Changelog + 版本号 0.6.68
- - 🧪 **857/857 全绿**（新增 3 用例：call --url --header 服务器收到 Authorization / 可重复
-  --header 与配置 headers 合并 CLI 优先 / 非法格式退出码 1），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.67 (2026-08-12) — MCP HTTP transport 鉴权请求头支持（方向③ MCP 增强）

- ✨ **`MCPHttpClient({ headers })` + `McpServerConfig.headers` + `McpManager.connect` 透传（src/mcp/http-client.ts + src/mcp/types.ts + src/mcp/manager.ts + 测试）**：
-  v0.6.4 起的 HTTP transport 客户端**只能匿名访问**——`postJson` 硬编码 Content-Type/
-  Content-Length，无法携带 `Authorization: Bearer <token>` 等鉴权头；真实世界远程 MCP 服务器
-  （HTTP transport 主要价值）几乎都需要鉴权，否则 `flare mcp call --url` 远程调用必失败；本轮补齐
-  （纯外围，零 agent.ts 改动）
- - **客户端**：`MCPHttpClientOptions.headers`（每次 POST 都携带，含 initialize/通知/清单/调用；
-  Content-Length 以实际字节为准强制覆盖——用户传入不可信）；不传 → 行为与旧版完全一致（向后兼容）
- - **配置**：`~/.flare/mcp.json` 的 servers 项加 `headers`（如 `{ "Authorization": "Bearer <token>" }`）——
-  `McpManager.connect` 透传；stdio 模式忽略（env 已覆盖子进程环境变量）
- - docs/mcp.md（McpManager 接入 headers 说明）+ README Changelog + 版本号 0.6.67
- - 🧪 **854/854 全绿**（新增 3 用例：客户端 headers 全请求携带 / 无 headers 不发送向后兼容 /
-  manager 配置 headers 透传 + 桥接工具执行带鉴权），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.66 (2026-08-12) — /help 同步 /usage 描述（方向① prompt caching 基建深化，观察面对齐）

- ✨ **`/help` 的 `/usage` 行补「含缓存命中/节省」说明（src/cli/index.ts + 测试）**：
-  v0.6.64/65 给 /usage 加了缓存节省显示但 /help 描述还停在「查看 token 用量」——用户从帮助
-  入口看不到该能力；本轮同步（纯外围，零 agent.ts 改动）
- - README Changelog + 版本号 0.6.66
- - 🧪 **851/851 全绿**（新增 1 断言：/help 含 /usage + 「缓存命中/节省」），tsc 0 错误，
-  **零 agent.ts 改动**

#### v0.6.65 (2026-08-12) — /usage perModel 行带缓存节省金额（方向① prompt caching 基建深化，对称补齐）

- ✨ **perModel 每项带 `cacheSavedUsd` + CLI 子行显示节省（src/memory/store.ts + src/cli/index.ts + 测试）**：
-  v0.6.64 只给了汇总级节省（总览行/本会话行），**perModel 行只有命中量**——多模型场景看不出
-  「哪个模型吃到了缓存的钱」；本轮对称补齐（纯外围，零 agent.ts 改动）
- - **store 层**：`getUsageStats()` / `getSessionUsage()` 的 perModel 每项新增 `cacheSavedUsd`
-  （同口径单模型差值，复用 `estimateCacheSavedUsd([m])`；无法定价 → 0）——宿主面板 perModel
-  列表可直接显示每个模型的缓存节省
- - **CLI /usage**：总览与本会话的 perModel「缓存命中」子行行尾追加 `（节省 $X.XXXX）`（>0 才显示；
-  本地模型命中子行无节省后缀，向后兼容；汇总行/本会话行格式不变）
- - docs/host-protocol.md（§9 / §9.1 perModel 项说明）+ README Changelog + 版本号 0.6.65
- - 🧪 **850/850 全绿**（新增 1 用例：perModel 子行带节省金额（总览+本会话，reasoner 无命中无
-  子行）；store 缓存节省用例补 perModel 项断言 chat/reasoner/qwen），tsc 0 错误，
-  **零 agent.ts 改动**

#### v0.6.64 (2026-08-12) — usage 统计带缓存节省金额估算（方向① prompt caching 基建深化）

- ✨ **`cacheSavedUsd`：运行期用量统计量化「缓存命中省了多少钱」（src/memory/store.ts + src/cli/index.ts + src/server.ts + 测试）**：
-  /usage 已显示缓存命中 tokens（v0.6.29/42）但看不到**价值**——cache-check 单次验收有 savedUsd
-  （v0.6.45）而运行期统计缺失；宿主面板只看到命中量、不知道命中价 vs 未命中价的差距；本轮补齐
-  （纯外围，零 agent.ts 改动）
- - **store 层**：`getUsageStats()` / `getSessionUsage()` 新增 `cacheSavedUsd`——按 perModel 逐模型
-  用 `estimateCostUsd` 算「未命中成本 − 命中成本」差值求和（定价线性，聚合后计算精确）；无法定价的
-  模型（本地 Ollama）跳过不计入；无命中/无定价 → 0（幂等）
- - **server 协议**：`get_usage` / `session_usage` 透传 `cacheSavedUsd`（fallback 补 0）——宿主面板可显示
-  「缓存已节省 $X」
- - **CLI /usage**：总览缓存命中行下追加 `缓存节省: $X.XXXX`；本会话行追加 ` · 缓存节省 $X.XXXX`
-  （>0 才显示；本地模型命中只显示命中量不显示节省，向后兼容）
- - docs/host-protocol.md（§9 / §9.1 响应结构 + cacheSavedUsd 说明）+ README Changelog + 版本号 0.6.64
- - 🧪 **849/849 全绿**（新增 3 用例：store 缓存节省差值求和+无法定价不计入 / CLI 总览+本会话行节省
-  显示 / 本地模型命中不显示节省；server e2e 补 2 断言透传 cacheSavedUsd=0），tsc 0 错误，
-  **零 agent.ts 改动**

#### v0.6.63 (2026-08-12) — MCP 子命令提示对称补齐（方向③ MCP 增强）

- ✨ **交互 `/mcp resources`/`/mcp prompts` 分支提示补 tools 入口（src/cli/index.ts + 测试）**：
-  v0.6.61 只补了 `/mcp` 状态行与 `flare mcp status` 的提示，但 **resources/prompts 两个子命令的
-  尾部提示行仍只有 resources/prompts/connect**——用户看完资源/提示词后不知道还能看工具清单；
-  本轮补齐（纯外围，零 agent.ts 改动）：两个分支提示行均加 `/mcp tools [name] 查看工具`
- - README Changelog + 版本号 0.6.63
- - 🧪 **846/846 全绿**（新增 2 断言：/mcp resources 分支提示含 tools / /mcp prompts 分支提示含
-  tools），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.62 (2026-08-12) — MCP 单次命令文档补齐（方向③ MCP 增强）

- ✨ **docs/mcp.md 单次命令章节补 tools/complete 用法**：
-  v0.6.59/v0.6.60 补了 `flare mcp tools`/`flare mcp complete` 命令，但**单次命令文档示例没跟上**
-  （章节标题仍只列 call/status/resources/prompts，示例缺 tools/complete）；本轮补齐（纯文档，
-  零 agent.ts 改动）：标题加 tools/complete；示例加 `flare mcp tools <server>`（配合 call 使用）
-  与 `flare mcp complete <server> <prompt> <argument> [value]`（前缀收窄示例）
- - README Changelog + 版本号 0.6.62
- - 🧪 **846/846 全绿**（纯文档改动，无代码变更），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.61 (2026-08-12) — MCP 命令提示面补全（方向③ MCP 增强）

- ✨ **提示文本补全（src/cli/index.ts + 测试）**：
-  v0.6.58~v0.6.60 连补工具清单/参数补全入口，但**两处提示文本没跟上**——交互 `/mcp` 状态行提示
-  只有 resources/prompts/connect/disconnect（缺 tools）、`flare mcp status` 提示行只有 call 和
-  status --connect（缺 tools/complete）；本轮补齐（纯外围，零 agent.ts 改动）：
- - **交互 `/mcp` 状态行提示**：加 `/mcp tools [name] 查看工具`
- - **`flare mcp status` 提示行**：加 `mcp tools <服务器> 查看工具` + `mcp complete <服务器>
-  <提示词> <参数> 补全候选`
- - README Changelog + 版本号 0.6.61
- - 🧪 **846/846 全绿**（新增 2 断言：/mcp 状态行提示含 tools / mcp status 提示含 tools+complete），
-  tsc 0 错误，**零 agent.ts 改动**

#### v0.6.60 (2026-08-12) — CLI 单次命令 `flare mcp complete` 参数补全（方向③ MCP 增强）

- ✨ **单次命令补参数补全（src/cli/index.ts + 测试）**：
-  v0.6.57 给交互模式（`/mcp complete`）和 server 协议（`mcp_complete`）补了提示词参数补全，
-  但**一次性命令侧未对称**——`flare mcp call/resources/prompts/tools` 都有，唯独没有
-  「渲染提示词前先看参数候选值」的入口；本轮补齐（纯外围，零 agent.ts 改动）：
- - **`flare mcp complete <server> <prompt> <argument> [value]`**：请求服务器 `completion/complete`
-  返回候选列表（数量/总数 + hasMore 标记），带 `value` 前缀收窄；与 `flare mcp call/resources/
-  prompts/tools` 同构（`--url` 直连 HTTP / `--config` 查配置 stdio 或 HTTP / `--timeout`）；
-  无候选友好提示；未知引用（协议错误）→ 退出码 1 + 错误提示不崩溃；未配置服务器 → 退出码 1
- - docs/mcp.md（单次命令 complete 说明）+ README Changelog + 版本号 0.6.60
- - 🧪 **846/846 全绿**（842 + 4 新增 mcp-cli-call.test.ts：候选显示 4/4 / 前缀收窄 1/1 / 未知引用
-  退出码 1 / 未配置服务器退出码 1），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.59 (2026-08-12) — CLI 单次命令 `flare mcp tools` 工具清单（方向③ MCP 增强）

- ✨ **单次命令补工具清单（src/cli/index.ts + 测试）**：
-  v0.6.58 给交互模式（`/mcp tools`）和 server 协议（`mcp_tools`）补了工具清单，但**一次性命令
-  侧未对称**——`flare mcp call/resources/prompts` 都有，唯独没有「先看有哪些工具」的入口；
-  本轮补齐（纯外围，零 agent.ts 改动）：
- - **`flare mcp tools <server>`**：列出服务器 `tools/list` 暴露的工具（名称 + 描述，含数量），
-  与 `flare mcp resources`/`prompts` 同构（`--url` 直连 HTTP / `--config` 查配置 stdio 或 HTTP /
-  `--timeout`）；空清单友好提示；未配置服务器 → 退出码 1 + 错误提示；提示行引导
-  `flare mcp call <服务器> <工具> [JSON参数]` 调用
- - docs/mcp.md（单次命令 tools 说明）+ README Changelog + 版本号 0.6.59
- - 🧪 **842/842 全绿**（839 + 3 新增 mcp-cli-call.test.ts：HTTP --url 直连列工具名+描述 / stdio
-  --config mock 子进程真实 3 工具（echo_text/add_numbers/fail_tool）/ 未配置服务器退出码 1），
-  tsc 0 错误，**零 agent.ts 改动**

#### v0.6.58 (2026-08-12) — MCP 工具清单查看 `mcp_tools`（方向③ MCP 增强）

- ✨ **工具清单桥接到三层（src/mcp/manager.ts + src/mcp/types.ts + src/server.ts + src/cli/index.ts + 测试）**：
-  `mcp_resources`（v0.6.26）/`mcp_prompts`（v0.6.36）都有清单接口（按服务器分组透传元数据），
-  唯独**工具只有 `mcp_status` 的 toolCount 数量**——宿主面板看不到已连接服务器暴露了哪些工具
-  （名称/描述），无法在 `mcp_call` 前发现可用工具；本轮对称补齐（纯外围，零 agent.ts 改动）：
- - **`McpManager.getAllToolsRef()`**：已连接服务器的工具引用并集（含来源服务器名 + 名称/描述，
-  与 getAllResources/getAllPrompts 同构；未连接返回空数组幂等不抛错）
- - **server 协议 `mcp_tools`**：按服务器分组返回 `{name, connected, toolCount, tools:[{name,
-  description?, server}], error?}`（与 mcp_resources/mcp_prompts 同形状）；等待启动连接落定；
-  只读不触发生成、不创建会话
- - **CLI `/mcp tools [name]`**：显示 `🔧 name — 描述` 清单（数量 + 全部/单服务器过滤）；无工具
-  友好提示；hooks 未提供 tools → 提示不可用（向后兼容旧宿主）；/help + 用法提示更新
- - docs/host-protocol.md（§16.9 mcp_tools + 请求类型清单 + 响应表）+ docs/mcp.md + README Changelog
-  + 版本号 0.6.58
- - 🧪 **839/839 全绿**（830 + 9 新增：manager getAllToolsRef（含来源/名称/描述/未连接空数组）/
-  server mcp_tools e2e（mock 子进程真实返回 3 工具清单 + 描述 + 来源 + 与 mcp_call 闭环调用）/
-  CLI /mcp tools（清单显示/无描述不崩/单服务器过滤/无工具提示/hooks 缺失兼容/用法含 tools/
-  /help 注册）），tsc 0 错误，**零 agent.ts 改动**

#### v0.6.57 (2026-08-12) — MCP 提示词参数补全桥接 `mcp_complete`（方向③ MCP 增强）

- ✨ **提示词参数补全 completion/complete 桥接到三层（src/mcp/manager.ts + src/server.ts + src/cli/index.ts + 测试）**：
-  MCP 协议 `completion/complete`（提示词参数补全候选）在客户端层 v0.6.11 已实现（MCPClient/
-  MCPHttpClient.completePrompt），但 **McpManager / server 协议 / CLI 都没透传**——宿主渲染提示词
-  （mcp_get_prompt）时对带补全声明的参数拿不到候选值；本轮三层对称补齐（纯外围，零 agent.ts 改动）：
- - **McpManager.completePrompt(name, promptName, argumentName, value)**：代理转发某服务器
-  completion/complete；服务器未连接 → reject 清晰错误（与 callTool/getPrompt 同模式）
- - **server 协议 `mcp_complete`**：`{server, prompt, argument, value?}` → 返回
-  `{values[], total?, hasMore?}`（候选值/总数/是否更多；缺参数 error 含用法；未知引用透传协议错误不崩）
- - **CLI `/mcp complete <server> <prompt> <argument> [value]`**：显示补全候选列表（数量 + 前缀收窄）；
-  无候选/未知引用/缺参数友好提示不崩溃；hooks 未提供 completePrompt → 提示不可用（向后兼容旧宿主）
- - mock MCP server 补 `completion/complete` 响应（summarize 的 topic 参数按前缀建议候选）
- - docs/host-protocol.md（§16.8 mcp_complete + 请求类型清单 + 响应表）+ README Changelog + 版本号 0.6.57
- - 🧪 **830/830 全绿**（821 + 9 新增：manager completePrompt 代理（4 候选/前缀收窄/未知引用 reject/未连接
-  reject）/ server mcp_complete（缺参数 error / mock 子进程真实返回候选+前缀收窄+未知引用 error）/ CLI
-  /mcp complete（候选显示/前缀收窄/无候选/未知引用/缺参数用法/hooks 缺失兼容）），tsc 0 错误，
-  **零 agent.ts 改动**

#### v0.6.56 (2026-08-12) — server 协议 `mcp_connect`/`mcp_disconnect` 动态管理 MCP 连接（方向③ MCP 增强，控制面补齐）

- ✨ **宿主协议补 MCP 控制面（src/server.ts + 测试）**：
-  `mcp_status` 只能**观测**（启动时后台连接、失败可见错误），但宿主（Pulse/StorySpire）无法让
-  「配置了但启动时未连上/想按需连接」的服务器连上、也无法按需断开——本轮补齐（纯外围，零
-  agent.ts 改动）：
- - **`mcp_connect`**：`{server}` → 代理转发 `McpManager.connect`（**幂等**：已连接直接返回已有
-  工具）；响应与 `mcp_status` **同源**（`connected`/`toolCount`/`transport`/`target` + 已连接时
-  资源/模板/提示词数）——连接后宿主立即可见连到哪种传输、连到哪；成功**清空缓存 Agent**
-  （下次 chat 重建并入新工具，与 CLI `/mcp connect` onChanged 语义一致）
- - **`mcp_disconnect`**：`{server}` → 断开并清缓存（工具从 Agent 工具集移除）；未连接 → `disconnected:false`
-  幂等不回 error；等待启动连接落定（与 mcp_status 一致，断开的是真实连接）
- - 错误路径：缺 `server` / 服务器未配置 → error 含用法（服务不崩）
- - docs/host-protocol.md（§16.6/16.7 + 请求类型清单 + 响应表）+ README Changelog + 版本号 0.6.56
- - 🧪 **821/821 全绿**（816 + 5 新增 server.test.ts：connect 缺 server error / 未配置 error /
-  disconnect 缺 server error / 未连接 disconnected:false / **闭环**——真实 mock MCP 子进程
-  断开→status 未连接→重连→已连接+工具数 3+transport stdio+target 含脚本路径→error 清空→幂等重连），
-  tsc 0 错误，**零 agent.ts 改动**

#### v0.6.55 (2026-08-12) — `/mcp connect` 摘要带传输类型标记（方向③ MCP 增强，观测面补齐）

- ✨ **CLI 交互 `/mcp connect` 摘要补 `[stdio]`/`[HTTP]` + 目标（src/cli/index.ts + 测试）**：
-  v0.6.50 给 `/mcp` 状态行加了 transport/target（`[stdio]`/`[HTTP]` + 端点/命令），但 `/mcp connect`
-  成功摘要仍是旧格式 `已连接 X（N 个 MCP 工具）`——连接成功后看不到刚连的是哪种传输、连到哪；
-  本轮对称补齐（纯外围，零 agent.ts 改动）：
- - **connect 摘要**：`已连接 <name> [stdio|HTTP] <target>（N 个 MCP 工具[ · 资源/模板/提示词数]）`
-  ——transport/target 与 `/mcp` 状态行**同源**（都来自 `McpManager.status()`），连接后立即可见
-  传输类型与连接目标；旧形状 status（缺字段）降级默认 `[stdio]` 不崩溃
- - docs/mcp.md（交互模式 connect 摘要说明）+ README Changelog + 版本号 0.6.55
- - 🧪 **816/816 全绿**（815 + 1 新增 mcp-command.test.ts：connect 摘要 stdio 带 [stdio]+命令目标 /
-  HTTP 带 [HTTP]+端点 url，透传显示完整 + onChanged 计数），tsc 0 错误，**零 agent.ts 改动**
- - **冒烟实测**（真实 McpManager + in-process HTTP 服务器）：connect 后 status() 返回
-  transport=http target=端点 url（CLI 组装同源数据），SMOKE PASS

#### v0.6.54 (2026-08-12) — cache-check `--rounds` 多轮连续命中验收（方向① prompt caching 基建深化，验收升级）

- ✨ **`runCacheCheck` 支持 rounds 多轮 + CLI `cache-check --rounds <N>`（src/core/cache-check.ts +
-  src/cli/index.ts + 测试）**：
-  v0.6.45 的两轮验收只能证明「某一次」前缀命中——服务端缓存是否**持续稳定**（连续多轮都命中）
-  无法验证（偶发命中一次也会误判 PASS）；本轮升级（纯外围，零 agent.ts 改动）：
- - **`runCacheCheck(llm, { rounds? })`**：第 1 轮为 miss 基准，第 2..N 轮**全部**命中才算 ok
-  （默认 2——两轮行为与旧版逐字段一致，零回归；合法范围 2~5，非法回退 2 不崩）
- - **结果新增 `rounds` + `runs`**（每轮用量快照数组，含基准轮）：`first`=基准、`second`=最后一轮
-  （旧字段语义保留——host 侧旧消费逻辑不破坏）；`--json` 同步输出 rounds/runs
- - **CLI `cache-check --rounds <N>`**：显示每一轮命中（第一轮标注 miss 基准）；多轮中断时
-  detail 指出中断轮次（`第 N 轮 cache_read_tokens = 0（连续命中中断…）`）；`--rounds` 非法
-  （非 2~5 整数）→ 退出码 1 + 用法提示
- - docs/flare-token-architecture.md（多轮验收说明）+ README Changelog + 版本号 0.6.54
- - 🧪 **815/815 全绿**（811 + 4 新增 cache-check.test.ts：rounds 3 全命中 ok + rounds/runs 快照 +
-  前缀逐字节一致 + user 递增 / 第 3 轮中断 ok:false + 中断轮次 / rounds 非法回退 2（1/6/1.5/NaN）
-  / JSON 含 rounds/runs），tsc 0 错误，**零 agent.ts 改动**；冒烟实测真实 DeepSeek API：
-  `cache-check --rounds 3` → 三轮 prompt 971 全部命中 896 tokens → ✅ PASS（连续 2 轮命中，
-  服务端缓存跨进程持续稳定）；`--rounds 99` → 退出码 1 + 用法提示，SMOKE PASS

#### v0.6.53 (2026-08-12) — CLI `/usage` 本会话 perModel 子行（方向① prompt caching 基建深化，观测面闭环）

- ✨ **`/usage` sessionId 分支显示本会话 perModel 分解（src/cli/index.ts + 测试）**：
-  v0.6.52 给协议 `session_usage` 补了 perModel（宿主侧），但 **CLI `/usage` 的本会话行仍是单行汇总**
-  （`本会话: N tokens · 缓存命中`）——CLI 交互模式看不到「本会话哪个模型吃到缓存」；本轮对称补齐
-  （纯外围，零 agent.ts 改动）：
- - **本会话行下追加 perModel 子行**：`模型 <name>: N tokens（M 次调用）` + 有命中追加缩进子行
-  `缓存命中: N tokens（R%）`（命中率按该模型本会话 promptTokens 算）——与总览 perModel 行
-  （v0.6.42）同模式；无命中模型不显示子行；**本会话维度隔离**（其他会话的用量不混入）
- - **向后兼容**：perModel 为空/旧 store 无该字段 → 不显示子行（与 v0.6.49 输出一致）
- - README Changelog + 版本号 0.6.53
- - 🧪 **811/811 全绿**（810 + 1 新增 prompt-caching.test.ts：本会话双模型 chat 命中 400/1000=40%
-  子行 + reasoner 无命中不显示 + 其他会话 s2 不混入（1,800 汇总 / 1,500 chat / 300 reasoner）），
-  tsc 0 错误，**零 agent.ts 改动**；冒烟实测真实 MemoryStore + dist CLI：/usage 带 sessionId →
-  本会话行 1,800 tokens · 缓存命中 400 + 子行 模型 deepseek-chat: 1,500 tokens（1 次调用）+ 缓存命中
-  400 tokens（40%）、模型 deepseek-reasoner: 300 tokens（1 次调用），SMOKE PASS

#### v0.6.52 (2026-08-12) — session_usage 带 perModel 按模型分解（方向① prompt caching 基建深化，观测面补齐）

- ✨ **`getSessionUsage` perModel + server `session_usage` 透传（src/memory/store.ts + src/server.ts +
-  测试）**：
-  v0.6.42 给全局 `getUsageStats` 加了 perModel（CLI /usage perModel 行显示缓存命中），但**本会话级
-  `getSessionUsage` 只有汇总**（prompt/completion/cacheRead/callCount）——宿主面板"本会话用量"
-  看不到**哪个模型**吃到缓存（多模型场景只能从全局统计里手工筛）；本轮补齐（纯外围，零 agent.ts
-  改动）：
- - **`getSessionUsage` 新增 `perModel`**：按模型分组（`model`/`calls`/`promptTokens`/`completionTokens`/
-  `cacheReadTokens`/`totalTokens`，按调用次数降序）——与 getUsageStats.perModel **同形状**（host 侧
-  渲染逻辑可直接复用）；分解合计与汇总一致（calls/cacheReadTokens 可核对）；无用量会话返回
-  `perModel: []`（幂等不抛错）
- - **server 协议 `session_usage`**：stats 透传 perModel（fallback 默认对象补 `perModel: []`）——
-  宿主面板"本会话用量"直接显示每个模型的缓存命中分布，与 get_usage 对称
- - docs/host-protocol.md（§9.1 响应结构示例 + perModel 说明）+ README Changelog + 版本号 0.6.52
- - 🧪 **810/810 全绿**（809 + 1 新增 store.test.ts：getSessionUsage perModel 双模型分解 +
-  缓存命中隔离（s2 不影响 s1）/ 分解合计与汇总一致 / 无用量空数组；server.test.ts 既有
-  session_usage 用例补 perModel 数组断言），tsc 0 错误，**零 agent.ts 改动**
- - **冒烟实测**（真实 MemoryStore + dist CLI 子进程）：session_usage → stats.perModel
-  `[{model:'deepseek-chat', calls:1, cacheReadTokens:400, ...}]`，SMOKE PASS

#### v0.6.51 (2026-08-12) — CLI `mcp status` 统一走 `status()` + `--connect` 真实连接状态（方向③ MCP 增强，观测面补齐）

- ✨ **`flare mcp status [--connect]`（src/cli/index.ts + 测试）**：
-  v0.6.50 给 `McpServerStatus` 补了 transport/target（CLI /mcp 与 server mcp_status 同源），但 CLI
-  一次性命令 `flare mcp status` 仍**自己拼配置行**（不显示连接状态/工具数）——两处输出形状不一致；
-  本轮统一走 `McpManager.status()`（纯外围，零 agent.ts 改动）：
- - **统一输出**：`●/○ 连接标记 + 传输类型（HTTP/stdio）+ 端点/命令 + （已连接）N 个工具 + [错误]`
-  （未连接也显示——配置即可见；连接失败服务器的错误在 status() 的 error 字段红字可见）
- - **`--connect` 选项**：先连接全部配置服务器再显示（`Promise.allSettled` 容错——失败不阻塞其余，
-  与 server mcp_status 等待连接落定同语义），CLI 一次性命令可看真实连接状态与工具数
- - docs/mcp.md（status/--connect 用法）+ README Changelog + 版本号 0.6.51
- - 🧪 **809/809 全绿**（808 + 1 新增 mcp-cli-call.test.ts：status --connect 真实 HTTP 服务器
-  ●+1 个工具；既有 status 测试补 ○ 未连接断言），tsc 0 错误，
-  **零 agent.ts 改动**；冒烟实测真实 dist CLI + in-process HTTP 服务器：status（未连接）○ +
-  端点 url；status --connect ● + 1 个工具，SMOKE PASS

#### v0.6.50 (2026-08-12) — MCP 连接状态带传输类型/端点（方向③ MCP 增强，HTTP transport 观测面补齐）

- ✨ **`McpServerStatus.transport` / `.target` + CLI /mcp + server mcp_status（src/mcp/types.ts +
-  src/mcp/manager.ts + src/cli/index.ts + 测试）**：
-  `mcp_status`（v0.5.5）只有 name/connected/toolCount，宿主面板**无法区分 stdio/HTTP 两种连接
-  方式、看不到端点/命令**（配了 url 的 HTTP transport 服务器与 stdio 服务器长得一样）；本轮补齐
-  （纯外围，零 agent.ts 改动）：
- - **`transport: 'stdio' | 'http'`**（配置 url 走 http，command 走 stdio）+ **`target`**（http 为
-  端点 url，stdio 为 command + args）——`McpManager.status()` 直接填充（CLI /mcp 与 server
-  `mcp_status` 同源，宿主面板可区分两种连接并直接展示连接目标）
- - **CLI 交互模式 `/mcp`**：状态行显示 `[stdio]`/`[HTTP]` 标记 + 目标端点/命令（未连接也显示——
-  配置即可见）；旧形状 status（缺字段）降级默认 `[stdio]` 不崩溃
- - docs/host-protocol.md（§16 mcp_status 响应结构含 transport/target 示例）+ docs/mcp.md +
-  README Changelog + 版本号 0.6.50
- - 🧪 **808/808 全绿**（806 + 2 新增 mcp-command.test.ts：/mcp 显示 [stdio]+命令目标 / [HTTP]+端点
-  url（未连接也显示）/ 旧形状 status 缺字段默认 stdio 不崩溃；mcp-manager 既有测试补 transport/target
-  断言（stdio=stdio+target 含 MOCK_SERVER 路径、HTTP=http+target=端点 url）），tsc 0 错误，
-  **零 agent.ts 改动**

#### v0.6.49 (2026-08-12) — CLI `/usage` 本会话行缓存命中显示（方向① prompt caching 基建深化，观测面补齐）

- ✨ **CLI `/usage` 本会话行追加缓存命中（src/cli/index.ts + 测试）**：
-  v0.6.42 给总行 + perModel 行加了缓存命中，但**本会话行**（sessionId 分支）仍是旧格式
-  `N tokens（M 次调用）`——宿主看「当前会话吃了多少缓存」只能自己从 get_usage 算；本轮补齐
-  （纯 CLI 外围，零 agent.ts 改动）：`getSessionUsage` 本就含 cacheReadTokens，CLI 侧有命中时
-  追加 `· 缓存命中 N tokens（R%）`（命中率按本会话 promptTokens 算）；无命中不追加（与旧版
-  输出兼容）
- - 📚 README Changelog + 版本号 0.6.49
- - 🧪 **806/806 全绿**（804 + 2 新增 tests/prompt-caching.test.ts：本会话行命中显示（sessionId
-  透传、命中 400/1000=40%、另一会话 s2 不影响统计）；本会话无命中不追加段（不显示「缓存命中 0」）），
-  tsc 0 错误，**零 agent.ts 改动**
- - **冒烟实测**（真实 MemoryStore + dist handleSlashCommand）：/usage 带 sessionId → 本会话行
-  `本会话: 1,500 tokens（1 次调用） · 缓存命中 400 tokens（40%）`（与总行/perModel 行 40% 一致），
-  SMOKE PASS

#### v0.6.48 (2026-08-12) — `flare cache-check --json` 结构化输出（方向① prompt caching 基建深化，宿主/CI 程序化验收）

- ✨ **`cache-check --json`（src/core/cache-check.ts + src/cli/index.ts + 测试）**：
-  v0.6.45 验收工具只有人类可读输出，宿主/CI **无法程序化消费**验收结果（面板要显示「缓存健康度」、
-  CI 要断言「命中才放行」只能解析彩色文本）；本轮补 `cacheCheckToJson` 纯函数 + CLI `-j/--json`
-  （纯外围，零 agent.ts 改动）：
- - **`cacheCheckToJson(r)`**（库级导出，纯函数不触网/不读密钥）：序列化全部结构化字段
-  （ok/model/hitTokens/savedUsd/detail + first/second 两轮用量快照）
- - **CLI**：`flare cache-check --json` 只打印纯 JSON（不混入彩色/人类可读行，宿主直接
-  `JSON.parse`），**exit code 语义保留**（ok → 0，未命中/调用失败 → 1，CI 可直接断言）；与
-  `--model` 可组合；`--help` 注册
- - 📚 README Changelog + CLI 命令表 + 版本号 0.6.48
- - 🧪 **804/804 全绿**（802 + 2 新增 tests/cache-check.test.ts：命中结果 JSON 合法 + 全部结构化
-  字段（首字符即 `{` 无前缀行、ok/hitTokens/detail/savedUsd/first/second 逐字段断言）；失败结果
-  也结构化（ok:false + detail + model 空 + savedUsd null，不抛异常）），tsc 0 错误，
-  **零 agent.ts 改动**

#### v0.6.47 (2026-08-12) — CLI `mcp-server --bridge-tools`（外部 MCP 工具透传 flare 自身 MCPServer，与 v0.6.28/0.6.37 --bridge-resources/--bridge-prompts 对称）

- ✨ **CLI `flare mcp-server --bridge-tools`（src/cli/index.ts + 测试）**：
-  MCP 三大列表（tools/resources/prompts）中资源/提示词已能透传（v0.6.28/0.6.37），唯独**工具**还
-  不能——外部 MCP 服务器工具只能注入 Agent（库级 getAllTools），无法经 flare 自身 MCPServer 暴露给
-  其他 AI 客户端；本轮补齐（纯外围 CLI，零 agent.ts 改动）
- - **新 flag**：`mcp-server --bridge-tools`（与 `--bridge-resources` / `--bridge-prompts` 可同时用；
-  `--config` 共用）——连接 ~/.flare/mcp.json 全部服务器（Promise.allSettled 容错，与资源透传同分支
-  共用连接），把 `McpManager.getAllTools()` 返回的 flare Tool 代理（createMcpTools 包装）并入工具集：
-  **工具并集 = 内置（-t 收窄）+ 外部透传**（stdio 与 `--http` 双传输都支持）；**调用实时代理转发**——
-  客户端 `tools/call` 经 flare 转发到外部服务器（内容往返，isError 原样透传）；同名工具保留原名、
-  以先注册者为准（可用 `-t` 收窄内置避免冲突）
- - **能力声明**：透传不改变 initialize 能力声明（工具能力本就默认声明）；无配置/连接失败 → 提示 +
-  仅暴露 flare 自身工具（不中断，与资源透传无配置降级一致）
- - 📚 docs/mcp.md（工具透传章节 + 嵌套循环风险同资源透传）+ README Changelog + 版本号 0.6.47
- - 🧪 **802/802 全绿**（800 + 2 新增 tests/mcp-cli-server.test.ts：--bridge-tools 真实子进程全链路——
-  外部 mock 服务器（echo_text/add_numbers/fail_tool）经 flare 透传：listTools 并集 9 个（6 内置 + 3
-  外部）+ callTool 代理转发往返（add_numbers → 5、echo_text → echo: hi）；无配置降级（仅 6 内置工具，
-  不中断）），tsc 0 错误，**零 agent.ts 改动**
- - **冒烟实测**（真实 dist CLI 0.6.47 子进程 + 真实 mock 服务器 + 真实 MCPClient）：serverInfo flare
-  0.6.47 → 工具集并集 `read_file...memory_save, echo_text, add_numbers, fail_tool`（9 个）→
-  callTool add_numbers `{a:2,b:3}` → `5` → echo_text → `echo: hi` → fail_tool → isError true
-  「出错了」，SMOKE PASS

#### v0.6.46 (2026-08-12) — CLI `/trim` 智能裁剪 + `/context` 裁剪提示（方向④ suggestTrim 宿主接线 CLI 侧）

- ✨ **CLI `/trim [预算tokens]` + `/context` 超预算提示（src/cli/index.ts + 测试）**：
-  方向④「suggestTrim 宿主接线」server 侧早已闭环（v0.6.35 apply_trim），但 **CLI 交互模式
-  缺裁剪入口**——上下文超预算时只能 `/clear`（清空全部），无法外科手术式裁剪；本轮补齐
-  （纯 CLI 外围 + hooks 参数，零 agent.ts 改动）：
-  `ContextTrimHooks`（handleSlashCommand 新增可选参数，宿主注入）：`suggest()` 返回建议
-  删除量（suggestTrim 纯函数：system 保底 + 最近优先 + tool_calls↔tool 配对）、`apply(budget?)`
-  执行裁剪（agent.applyTrim）；CLI 交互模式接线真实 Agent（budget 缺省取 config
-  maxContextTokens，默认 16000，reserveForOutput 1024）
- - **`/context`**：超预算时追加 `💡 可裁剪: 建议删 N 条消息（约 X tokens）——/trim 执行
-  智能裁剪`（预算内/无 hooks 不显示，零回归）；**`/trim [budgetTokens]`**：执行智能裁剪
-  显示 `保留 N 条，删除 M 条`；预算内显示「无需裁剪」；非法预算（abc/0/-5/1.5）用法提示
-  不调用；无 hooks 降级「裁剪不可用」不崩溃；`/help` 注册
- - 🧪 **800/800 全绿**（789 + 11 新增 tests/trim-command.test.ts：/trim 缺省预算调 apply
-  （undefined 透传）+ 成功显示 / 显式预算 8000 透传 / 4 种非法预算用法提示不调 apply /
-  无 hooks 降级 / apply 返回 null 降级 / 预算内无需裁剪 / 不触发命令不调 apply / help 注册；
-  /context 超预算显示可裁剪提示（含建议删 5 条 + 8,800 tokens + /trim 指引）/ 预算内不显示 /
-  无 contextTrim 零回归），tsc 0 错误，**零 agent.ts 改动**
- - **冒烟实测**（真实 MemoryStore + Agent + dist handleSlashCommand 接线同款 hooks）：
-  /trim 300 → `✅ 已智能裁剪: 保留 2 条，删除 4 条`（真实 suggestTrim/applyTrim 全链路：
-  system 保底 + 最新消息保留，store 同步删除被裁消息——重建 Agent 后仍 2 条）；
-  /trim abc → 用法提示，SMOKE PASS

#### v0.6.45 (2026-08-12) — `flare cache-check` prompt caching 验收工具（方向① P0 验收自动化）

- ✨ **`flare cache-check`（src/core/cache-check.ts + src/cli/index.ts + 测试）**：
-  P0 验收标准是「连续两轮调用（间隔 <5min）第二轮 cache_read_tokens > 0」，但此前只能靠
-  宿主/开发者手工对比 /usage——本轮把验收自动化（纯外围，零 agent.ts 改动）：
-  `runCacheCheck(llm?)`（库级导出，llm 依赖注入）构造**稳定长前缀**（约 1.2K 字符重复块，
-  模拟真实会话稳定 system 前缀）连续两次调用（仅末尾 user 内容不同）——第一轮 miss 基准、
-  第二轮期望命中；兼容 DeepSeek `prompt_cache_hit_tokens` 与 OpenAI
-  `prompt_tokens_details.cached_tokens` 两种格式（复用 extractUsageCache）；DeepSeek 系列按
-  命中价 vs 未命中价估算节省成本；**调用失败不抛**（返回 ok:false + 原因，CLI 报错不崩）
- - **CLI**：`flare cache-check [--model <模型>]`——显示模型/两轮 prompt 与命中量/估算节省/
-  ✅ PASS 或 ⚠️ 未命中（exit 1）；`--help` 注册；真实调用走 ~/.flare/.env 配置密钥
-  （本地诊断，不输出任何密钥）
- - docs/flare-token-architecture.md 验收标准 + README Changelog + 版本号 0.6.45
- - 🧪 **788/788 全绿**（781 + 7 新增 tests/cache-check.test.ts：第二轮命中（DeepSeek 格式）
-  → ok:true + 命中量 + **前缀逐字节一致断言**（两次 system 相同、仅 user 数字不同、前缀长度
-  >500 字符）/ OpenAI cached_tokens 格式兼容 / 未命中 ok:false + 外部因素 detail / 第一次
-  调用失败不抛 / 第二次调用失败不抛 / DeepSeek 节省成本 > 0 / 无法定价模型 savedUsd null），
-  tsc 0 错误，**零 agent.ts 改动**
- - **冒烟实测**（真实 DeepSeek API + dist CLI）：flare cache-check → 模型
-  deepseek-v4-flash、prompt 971 → 第二轮命中 896 tokens → ✅ PASS（真实缓存命中，P0
-  验收通过；两轮均命中说明缓存跨进程持久，前缀已写入服务端），SMOKE PASS

#### v0.6.44 (2026-08-12) — CLI `/sessions <关键词>` 会话搜索（server search_sessions 的 CLI 对称）

- ✨ **CLI `/sessions <关键词>`（src/cli/index.ts + 测试）**：
-  v0.6.43 给 server 协议补了 `search_sessions`（按标题/消息内容搜索会话），但 **CLI 交互模式
-  没有对称入口**——`/search`（v0.6.24）只搜**消息**，`/sessions` 只能**全量**列出最近会话，
-  「记不清哪个会话聊过 X」时无从下手；本轮补齐（纯 CLI 外围，零 agent.ts 改动）：
-  `/sessions <关键词>` 调用 store.searchSessions（与协议同源）——按**标题或会话内任意消息
-  内容** LIKE 匹配，显示 `[时间] 标题（N 条消息）`（formatSessionTime 复用 /sessions 时间
-  格式；归档会话带 `（已归档）` 标记仍可搜到）；无匹配友好提示「未找到包含「kw」的会话」；
-  `/sessions`（无关键词）走原 switch 分支**逐字符零回归**（最近会话列表）
- - 🧪 **781/781 全绿**（774 + 7 新增 tests/session-search-cli.test.ts：按标题匹配显示
-  标题+消息数 / 按消息内容匹配（标题不含关键词也命中）/ 归档标记 / 无匹配提示 / 空白关键词
-  用法提示 / 无关键词原行为零回归（未走搜索分支）/ /help 注册），tsc 0 错误，
-  **零 agent.ts 改动**
- - **冒烟实测**（真实 MemoryStore + handleSlashCommand）：/sessions 集成 →
-  `[今天 02:39] flutter 集成指南 (1 条消息)`；/sessions 前缀稳定 → 普通标题命中；归档会话带
-  （已归档）；无匹配/空白关键词提示，SMOKE PASS

#### v0.6.43 (2026-08-12) — server 协议 `search_sessions`（按标题/消息内容搜索会话）

- ✨ **`search_sessions` 会话搜索（src/memory/store.ts + src/server.ts + 测试）**：
-  宿主面板搜索框数据源——`list_sessions` 只能全量列出，无法按关键词过滤；`search_messages`
-  （v0.6.24）返回**消息级**结果，缺**会话级**搜索；本轮补齐（纯外围，零 agent.ts 改动）：
-  `MemoryStore.searchSessions(query, limit=20)` LIKE 匹配**会话标题或会话内任意消息内容**
-  （DISTINCT 去重，一会话多条命中只出现一次；结构同 getAllSessions 含消息数/归档标记，
-  按更新时间倒序；空 query 返回空数组不误搜全部）；server 协议 `search_sessions {query,
-  limit?}` → `{type:'search_sessions', query, sessions:[...]}`——query 必填（缺省 error 含
-  用法）、limit 1~100 整数（非法 error 含提示）、无匹配返回空数组不报错；只读不触发生成
- - 🧪 **774/774 全绿**（760 + 14 新增 tests/session-search.test.ts：MemoryStore 单测 8——
-  标题 LIKE 匹配（中文）/ 消息内容匹配（标题不含关键词也命中+messageCount）/ DISTINCT 去重 /
-  空·空白 query 空数组 / 无匹配空数组 / limit 收窄 / updated_at 倒序（秒级粒度 sleep 越过）/
-  结构同 getAllSessions+归档不过滤；server e2e 6——真实子进程 + 预置 DB（不走 chat/LLM）：
-  标题匹配闭环 / 内容匹配闭环 / 无匹配空数组 / 缺 query error 含用法 / limit 非法
-  （0/-1/1.5/abc/101）error / limit 收窄多命中生效），tsc 0 错误，**零 agent.ts 改动**
- - **冒烟实测**（真实 dist CLI 子进程 + 预置 DB）：search_sessions `{query:'集成'}` →
-  `flutter 集成指南` 命中（messageCount 1）；`{query:'前缀稳定'}` → 两个会话命中（limit 1
-  收窄为 1）；缺 query / limit 0 → error 含用法，SMOKE PASS

#### v0.6.42 (2026-08-12) — CLI `/usage` perModel 缓存命中显示（prompt caching 基建深化）

- ✨ **CLI `/usage` 按模型分解显示缓存命中（src/cli/index.ts + 测试）**：
-  v0.6.29 P0 已回传 cache_read_tokens（总行显示命中率），getUsageStats.perModel 也早已聚合
-  cacheReadTokens，但 **CLI `/usage` 的 perModel 行只显示 totalTokens + calls**——多模型场景
-  （如 chat + reasoner 混合）无法看到每个模型的缓存命中分布；本轮补齐（纯 CLI 外围，零
-  agent.ts 改动）：`模型 <name>: N tokens（M 次调用）` 行下，有缓存命中的模型追加缩进子行
-  `缓存命中: N tokens（R%）`（命中率按该模型 promptTokens 计算）；无命中不显示子行（与旧版
-  输出兼容）；总命中率/成本行照旧
- - 🧪 **760/760 全绿**（759 + 1 新增 tests/prompt-caching.test.ts：两个模型——deepseek-chat
-  有命中 400/1000=40% 显示命中子行，deepseek-reasoner 无命中不显示子行、总命中率 400/1200=33%
-  照旧），tsc 0 错误，**零 agent.ts 改动**
- - **冒烟实测**（真实 MemoryStore + dist CLI）：/usage 输出 perModel 行带
-  `缓存命中: 400 tokens（40%）`，总行 `缓存命中: 400 tokens（33%）`，SMOKE PASS

#### v0.6.41 (2026-08-12) — CLI 交互模式 `/mcp call`（直接调用外部 MCP 工具）

- ✨ **CLI 交互模式 `/mcp call` 子命令（src/cli/index.ts + 测试）**：
-  v0.6.40 给 server 协议补了 `mcp_call`（宿主能直接调用外部 MCP 工具），但 **CLI 交互模式的
-  `/mcp` 还没有 call 子命令**（v0.6.39 补了 read/render，call 缺）——本轮对称补齐
-  （纯 CLI 外围，零 agent.ts 改动）：
- - **`/mcp call <server> <tool> [JSON参数]`**：调用已连接服务器的工具（`tools/call` 代理，与
-  协议 `mcp_call` 同源）——`/mcp call mock add_numbers {"a":2,"b":3}` 直接显示工具返回（文本
-  内容提取拼接）；工具级失败（isError）显示失败信息；**非法 JSON 参数提示不调用**（`参数必须是
-  JSON 对象`）；未知工具/未连接错误输出不崩溃
- - `McpCommandHooks` 新增可选 `callTool?`（旧 hooks 形状向后兼容——未提供时友好提示不可用，
-  不崩溃）；`/help` 注册一行；用法提示更新
- - 📚 docs/mcp.md（交互模式 call 说明）+ README Changelog + 版本号 0.6.41
- - 🧪 **759/759 全绿**（752 + 7 新增 tests/mcp-command.test.ts：call 成功显示工具返回（代理
-  转发 + 参数透传）/ 工具级失败 isError 失败输出不崩溃 / 非法 JSON 参数提示不调用 / 缺 tool
-  用法提示不调用 / 未连接错误不崩溃 / 旧 hooks 无 callTool 降级 / 用法错误提示含 call），tsc 0
-  错误，**零 agent.ts 改动**

#### v0.6.40 (2026-08-12) — server 协议 mcp_call（宿主直接调用外部 MCP 工具）

- ✨ **McpManager.callTool + server 协议 `mcp_call`（src/mcp/manager.ts + server.ts + 测试）**：
-  宿主已能**列** MCP 工具（`tools` 请求，`source:"mcp"` 标注）、读资源（mcp_read_resource）、
-  渲染提示词（mcp_get_prompt），但**无法经协议直接调用外部 MCP 工具**——MCP 三大列表的
-  「清单 → 操作」闭环缺最后一环；本轮补齐（纯外围，零 agent.ts 改动）：
- - **`McpManager.callTool(name, toolName, args?)`**：代理调用某服务器工具（tools/call）——
-  与 readResource/getPrompt 同模式：未连接服务器 reject 清晰错误「MCP 服务器未连接: <name>」；
-  工具级失败（isError）原样透传不抛；stdio 与 HTTP transport 双传输（McpToolClient 最小接口）
- - **server 协议 `mcp_call {server, tool, args?}`** → `{type:'mcp_call', server, tool,
-  success:true, output}`——文本内容提取拼接；工具级失败 → `success:false` + `error`（服务不崩）；
-  缺参 error 含用法；未知工具/协议层错误透传外部服务器错误；不触发生成、不创建会话、等待后台
-  连接落定
- - 📚 docs/host-protocol.md（请求类型列表 + §16.5 新章节 + 响应表）+ docs/mcp.md（三大列表操作
-  闭环说明）+ README Changelog + 版本号 0.6.40
- - 🧪 **752/752 全绿**（745 + 7 新增：manager 2——callTool 成功参数透传 + 工具级失败 isError
-  透传 + 未知工具 reject + 未连接 reject / HTTP transport 调用闭环；server e2e 5——成功参数透传
-  真实子进程闭环 / 工具级失败 success:false+error / 未知工具 error 透传 / 缺 server·tool error
-  含用法 / 未连接 error），tsc 0 错误，**零 agent.ts 改动**
- - **冒烟实测**（真实 dist CLI 0.6.40 + 真实 mock 服务器）：mcp_call
-  `{server:'mock', tool:'add_numbers', args:{a:2,b:3}}` → `success:true, output:'5'`；
-  fail_tool → `success:false, error:'出错了'`；ghost_tool/未连接 → error，SMOKE PASS

#### v0.6.39 (2026-08-12) — CLI 交互模式 `/mcp read` / `/mcp render`（资源内容读取 + 提示词渲染）

- ✨ **CLI 交互模式两个 /mcp 子命令（src/cli/index.ts + 测试）**：
-  v0.6.38 给 server 协议补了 `mcp_read_resource` / `mcp_get_prompt`（宿主能读资源内容/渲染
-  提示词），但 **CLI 交互模式的 `/mcp` 还只能列清单**（`/mcp resources` / `/mcp prompts`
-  只显示元数据）——本轮对称补齐（纯 CLI 外围，零 agent.ts 改动）：
- - **`/mcp read <server> <uri>`**：读取已连接服务器的资源内容（`resources/read` 代理，与协议
-  `mcp_read_resource` 同源）——直接显示 `📄 uri [mimeType]` + 内容文本；服务器未连接/未知资源
-  错误输出不崩溃
- - **`/mcp render <server> <prompt> [k=v ...]`**：渲染已连接服务器的提示词（`prompts/get` 代理，
-  与协议 `mcp_get_prompt` 同源）——直接显示 `💬 role: text` 消息序列 + 可选描述；`k=v` 传提示词
-  参数（如 `/mcp render mock summarize topic=flare`）；未知提示词错误输出不崩溃
- - `McpCommandHooks` 新增可选 `readResource?` / `renderPrompt?`（旧 hooks 形状向后兼容——
-  未提供时友好提示不可用，不崩溃）；`/help` 注册两行；用法提示更新
- - 📚 docs/mcp.md（交互模式 read/render 说明）+ README Changelog + 版本号 0.6.39
- - 🧪 **745/745 全绿**（735 + 10 新增 tests/mcp-command.test.ts：/mcp read 成功显示内容（代理
-  转发 + mimeType）/ 未连接错误不崩溃 / 缺 uri 用法提示不调用 / 旧 hooks 无 readResource 降级；
-  /mcp render 成功显示消息 / k=v 参数透传 + 描述展示 / 未知提示词错误不崩溃 / 缺 prompt 用法
-  提示不调用 / 旧 hooks 无 renderPrompt 降级；用法错误提示含 read/render），tsc 0 错误，
-  **零 agent.ts 改动**

#### v0.6.38 (2026-08-12) — server 协议 MCP 资源内容读取 + 提示词渲染代理（mcp_read_resource / mcp_get_prompt）

- ✨ **server 协议两个只读代理接口（src/server.ts + 测试）**：
-  v0.6.26 `mcp_resources` 与 v0.6.36 `mcp_prompts` 只提供外部 MCP 服务器的资源/提示词**清单**
-  （元数据），宿主（如 Qt 面板）**无法经协议取资源真实内容 / 渲染提示词**——文档只能指到
-  库级 McpManager.readResource/getPrompt，宿主协议用不上；本轮补齐「列表 → 读取/渲染」闭环：
- - **`mcp_read_resource {server, uri}`** → `{type:'mcp_read_resource', server, uri, contents:
-   [{uri, mimeType?, text}]}`——代理转发 `resources/read`（McpManager.readResource），宿主面板
-  可展示外部资源内容/把资源喂给 AI；缺参 error 含用法；服务器未连接 error「MCP 服务器未连接:
-  <name>」；未知资源/读取失败透传外部服务器错误（服务不崩）
- - **`mcp_get_prompt {server, prompt, args?}`** → `{type:'mcp_get_prompt', server, prompt,
-  description?, messages:[{role, content:{type:'text',text}}]}`——代理转发 `prompts/get`
-  （McpManager.getPrompt），宿主可把外部提示词注入对话/展示；`args` 按服务器 arguments 声明
-  补全（可选，非对象忽略）；缺参 error 含用法；未连接/未知提示词 error（服务不崩）
- - 两者都只读：不触发生成、不创建会话；等待启动时的后台连接落定（与 mcp_status 一致）；
-  **零 agent.ts 改动**（纯 server 协议 + 测试 + 文档）
- - 📚 docs/host-protocol.md（请求类型列表 + §16.3/§16.4 新章节 + 响应表）+ README Changelog + 版本号 0.6.38
- - 🧪 **735/735 全绿**（726 + 9 新增 tests/server-mcp-resources.test.ts：mcp_read_resource 成功闭环
-  （真实子进程 + 真实 mock 服务器，contents 内容往返）/ 未知资源 error 透传 / 缺 server·uri error
-  含用法 / 未连接 error；mcp_get_prompt 成功渲染闭环（greet 无参）/ 带参数渲染（summarize +
-  topic 补全 + description）/ 未知提示词 error / 缺 server·prompt error / 未连接 error），tsc 0 错误，
-  **零 agent.ts 改动**
- - **冒烟实测**（真实 dist CLI 子进程 + 真实 mock 服务器）：mcp_read_resource
-  `{server:'mock', uri:'memory://preferences'}` → contents `[{uri, mimeType:'text/plain',
-  text:'主题: 浅色'}]`；mcp_get_prompt `{server:'mock', prompt:'summarize',
-  args:{topic:'flare 引擎'}}` → description「总结内容」+ messages「请总结关于「flare 引擎」的内容」；
-  未知资源/未知提示词/未连接均 error，SMOKE PASS

#### v0.6.37 (2026-08-12) — CLI `mcp-server --bridge-prompts`（外部 MCP 提示词透传 flare 自身 MCPServer，与 v0.6.28 --bridge-resources 对称）
- ✨ **CLI `flare mcp-server --bridge-prompts`（src/cli/index.ts + 测试）**：
-  v0.6.28 的 `--bridge-resources` 只透传外部 MCP 服务器的资源/模板；v0.6.36 补齐了 McpManager 的
-  prompts 桥接（getAllPrompts/getPrompt）——本轮把外部**提示词**也经 flare 自身 MCPServer 暴露给
-  客户端（prompts 是 MCP 三大列表之一，与资源同样值得透传）：
- - **新 flag**：`mcp-server --bridge-prompts`（与 `--bridge-resources` 可同时用；`--config` 共用）——
-  连接 ~/.flare/mcp.json 全部服务器（Promise.allSettled 容错），把 `getAllPrompts()` 包装成
-  `McpPrompt[]` 注入 MCPServer（stdio 与 `--http` 双传输都支持）：元数据（name/description/
-  arguments 参数声明）原样透传，`render(args)` **按 prompt 名找到所属服务器代理转发 prompts/get**
-  （与资源读取代理转发同模式；服务器断开/未知 prompt 返回空消息，不中断请求）
- - **能力声明**：有透传提示词时 `initialize` 声明 `capabilities.prompts`（客户端可探测）；无配置/无
-  prompts → 仅暴露 flare 自身能力（提示词空列表，不中断，与 --bridge-resources 无配置降级一致）
- - 📚 docs/mcp.md（--bridge-prompts 说明 + 透传规则）+ README Changelog + 版本号 0.6.37
- - 🧪 **726/726 全绿**（724 + 2 新增 tests/mcp-cli-server.test.ts：--bridge-prompts 真实子进程
-  全链路——外部 prompts 服务器（新 fixture mcp-flare-server-prompts-bridge.ts，greet + summarize
-  带参数）经 flare 透传：initialize prompts 能力声明 + listPrompts 元数据/参数透传 + getPrompt
-  渲染代理转发（greet 内容往返 + summarize 带 topic 参数补全）+ flare 自身工具照常；无配置降级
-  （prompts 空 + 工具照常，不中断）），tsc 0 错误，**零 agent.ts 改动**
- - **冒烟实测**（真实 dist CLI 子进程 + 真实外部 prompts 服务器 + 真实 MCPClient）：serverInfo
-  flare → capabilities.prompts 声明 → listPrompts `[{greet 打招呼},{summarize 总结内容,
-  arguments:[topic]}]` → getPrompt(greet)「你好」→ getPrompt(summarize,{topic:'flare 引擎'})
-  「请总结关于「flare 引擎」的内容」→ tools 6 个照常，SMOKE PASS

#### v0.6.36 (2026-08-12) — MCP prompts 桥接（外部 MCP 提示词真实可见，与 v0.6.26 资源桥接对称）
- ✨ **McpManager prompts 桥接（src/mcp/manager.ts + types.ts + server.ts + cli/index.ts）**：
-  客户端侧（v0.6.2）与服务器侧（v0.6.2 prompts 暴露）早已支持 prompts，但 **McpManager 连接外部
-  MCP 服务器时只桥接工具/资源/模板，不拉取提示词**——宿主/CLI 看不到外部服务器暴露的 prompts；
-  本轮补齐与 v0.6.26 资源桥接对称的 prompts 桥接：
- - **连接时拉取**：`connect` 与 resources/templates 并行拉取 `prompts/list`（safeListPrompts 容错——
-  服务器无 prompts 能力/请求失败静默降级为空数组，不阻塞连接，与资源桥接同风格）
- - **`getAllPrompts()`**：全部已连接服务器的提示词并集（`McpPromptRef` 含来源 server 名，库导出）；
-  **`getPrompt(name, promptName, args?)`**：代理渲染某服务器提示词（prompts/get）；服务器未连接 →
-  reject 清晰错误「MCP 服务器未连接: <name>」；stdio 与 HTTP transport 双传输都支持
-  （McpPromptClient 最小接口，与 McpResourceClient 同模式）
- - **status 带 promptCount**（已连接服务器；无 prompts 能力为 0，新增可选字段旧断言零回归）；
-  disconnect 提示词随连接清理
- - **server 协议 `mcp_prompts`**（只读，不触发生成、不创建会话）：`{type:'mcp_prompts'}` →
-  `{type:'mcp_prompts', servers:[{name, connected, toolCount, prompts?, error?}]}`——宿主面板
-  「外部 MCP 提示词」数据源（与 mcp_resources 对称）；mcp_status 同步带 promptCount
- - **CLI**：`/mcp` 状态行已连接显示 `（N 个工具 · M 资源 · K 模板 · P 提示词）`；`/mcp prompts
-  [name]` 子命令列出已桥接提示词（`✨ name（参数: a, b）— 描述`；无提示词友好提示；hooks 未提供
-  prompts 方法回退提示向后兼容旧宿主）；connect 摘要带提示词数；/help 注册
- - 📚 docs/host-protocol.md 请求类型列表 + 新章节（mcp_prompts 响应结构）+ docs/mcp.md（prompts
-  桥接子章节）+ README Changelog + 版本号 0.6.36
- - 🧪 **724/724 全绿**（711 + 13 新增：manager 5——stdio 桥接带来源+参数声明+promptCount /
-  getPrompt 代理渲染+未知 reject+未连接 reject / disconnect 清理 / 无 prompts 能力降级 0 /
-  HTTP transport 拉取+渲染闭环；server e2e 2——mcp_prompts 真实子进程闭环+参数透传 / mcp_status
-  promptCount；CLI 6——状态行带提示词数 / prompts 无参列出 / prompts 过滤单服务器 / 无提示词友好 /
-  旧 hooks 无 prompts 方法回退 / 用法含 prompts），tsc 0 错误，**零 agent.ts 改动**
- - **冒烟实测**（真实 dist CLI 子进程 + 真实 stdio mock 服务器）：`/mcp` 状态行
-  `● mock（3 个工具 · 2 资源 · 1 模板 · 2 提示词）`；`/mcp prompts` 列出
-  `✨ greet — 打招呼` + `✨ summarize（参数: topic）— 总结内容`；`/mcp prompts mock` 过滤单服务器；
-  server 协议 mcp_prompts 返回 2 条带来源（server:'mock'），SMOKE PASS

#### v0.6.35 (2026-08-11) — 上下文裁剪执行 API（apply_trim：suggestTrim 建议 → 服务器执行闭环）
- ✂️ **server 协议 `apply_trim`（src/server.ts + core/agent.ts + memory/store.ts）**：
-  context_status 此前只返回裁剪**建议**（keepIndexes）宿主却无法实际执行（set_context 只能追加状态
-  快照）——本轮补「建议 → 执行」闭环，宿主一条请求真正瘦身上下文：
- - **`Agent.applyTrim(keepIndexes)`（run 循环外独立 API）**：按索引保留集立即裁剪内存上下文——
-  开头连续 system 块（稳定前缀/身份/记忆）无条件保底保持相对顺序；非法索引（非整数/越界）宽松
-  过滤、重复去重；**空数组/全非法保守不裁剪**（误传不清空上下文）；store 同步只删「构造时加载且
-  有映射」的被裁消息（run/setContext 新增与内存未加载的 store 消息不受影响，不误删全量历史）；
-  store 删除失败不影响内存裁剪
- - **零 run 循环改动**：`storedIdByMsg`（消息对象 → store id）映射只在构造时建立，依赖
-  trimContextMessages/suggestTrim **保留原对象引用**（unshift/slice 均原引用，已确认）——数组重组后
-  映射依然有效，无需在 run 循环任何 push 点插桩
- - **store 层**：`getMessagesWithIds`（含自增 id，结构同 getMessages）/ `deleteMessages(sessionId,
-  ids)`（只删明确指定的，幂等）——重建 Agent 后裁剪依然生效（上下文持久瘦身）
- - **双模式**：`{keepIndexes}` 回传 context_status 建议索引立即执行；`{budgetTokens,
-  reserveForOutput?}` 服务器按 suggestTrim 计算并执行（配对保护由 suggestTrim 保证）；两者任一必填，
-  非法值（keepIndexes 非整数/负数/越界、budgetTokens 非正整数、reserveForOutput 负数）回 error 含
-  用法，不触发生成；响应带 keptCount/droppedCount/messageCount/estimatedKeptTokens/
-  estimatedDroppedTokens（宿主面板可展示裁剪效果）
- - 📚 docs/host-protocol.md 请求类型列表 + 新章节（apply_trim 双模式示例 + 响应结构）+
-  README Changelog + 版本号 0.6.35
- - 🧪 **711/711 全绿**（699 + 12 新增 tests/apply-trim.test.ts：store 3——getMessagesWithIds 结构
-  与 getMessages 一致+limit+空会话幂等 / deleteMessages 只删指定+空数组·不存在幂等；Agent 集成 5——
-  保底 system+按索引保留 / store 同步（重建后裁剪生效）/ 非法索引过滤+重复去重+空数组保守 /
-  无 sessionId 只裁内存不崩 / 多 system 块（身份+记忆形态）整块保底相对顺序；server e2e 4——
-  参数校验（无参/keepIndexes 非法/budgetTokens 非法/reserveForOutput 非法）/ budgetTokens 模式
-  （suggestTrim 裁剪+store 同步 get_messages 验证）/ keepIndexes 模式（执行+幂等）/ reserve 合法路径），
-  tsc 0 错误，**零 agent.ts run 循环改动**
- - **冒烟实测**：真实 dist CLI 子进程 + 预置历史会话——context_status messageCount 4 →
-  apply_trim budgetTokens:1 → ok keptCount 2 droppedCount 2 → get_messages 被裁消息消失（仅剩最新）；
-  keepIndexes 越界/负数/budgetTokens 0 → error 含用法，SMOKE PASS

#### v0.6.34 (2026-08-11) — 工具输出治理策略可配置化（AgentConfig + server 协议 + CLI）
- 🎛️ **工具输出治理策略全链路可配置（src/core/tool-output.ts + core/agent.ts + server.ts + cli/index.ts）**：
-  v0.6.30 的按工具类型截断（探索型留头尾/终端型留尾部/长度预算/省略标记）策略此前是硬编码默认值——
-  宿主无法按产品场景定制（如长日志终端型多留尾部、读文件少留头部）。本轮打通全链路：
- - **库级**：`AgentConfig.toolOutputPolicy`（可选）——run 循环截断表达式一行参数化
-  （`truncateToolOutput(name, result, this.config.toolOutputPolicy)`），缺省 undefined 等价默认策略
-  （与旧版逐字符一致零回归），控制流零改动
- - **server 协议**：chat 请求带 `toolOutputPolicy`（对象，字段全部可选：maxOutputChars /
-  maxErrorChars / headChars / tailChars / ellipsis；未知字段忽略）——非法值（非对象/字符数字段非
-  正整数/ellipsis 非字符串）回 error 含字段名，不触发生成；`validateToolOutputPolicy` 纯函数
-  （库导出，单测覆盖）协议与 CLI 共用单一策略形状来源；策略变化经 ctxOptsChanged 同机制自动重建
-  Agent 立即生效（JSON 序列化比较，字段顺序稳定可复现）；`HostServerOptions.defaultToolOutputPolicy`
-  + CLI `flare server --tool-output-policy '<json>'` server 级默认（chat 未指定时应用，请求优先）；
-  `get_config` 回显 `defaultToolOutputPolicy`（只读，不含密钥）
- - 📚 docs/host-protocol.md chat 参数表 + get_config 响应 + README Changelog/CLI 表 + 版本号 0.6.34
- - 🧪 **699/699 全绿**（681 + 18 新增：validateToolOutputPolicy 纯函数 7——合法完整对象归一化 /
-  null·undefined 空策略 / 非对象 fail / 四整数字段非法值（0/-1/1.5/非数字）fail 含字段名 /
-  数字字符串可转（对齐 Number 转换风格）/ ellipsis 非字符串 fail / 未知字段忽略+空对象 ok；
-  Agent 集成 2——终端型策略可配置（maxOutputChars/tailChars/ellipsis 生效，tool_result 事件与
-  LLM 上下文同策略治理）/ 默认工具 maxOutputChars 预算生效；server e2e 9——version 启动不崩 /
-  get_config 回显默认策略 / 非法非对象 / maxOutputChars 0 / headChars 'abc' / ellipsis 数字 /
-  合法请求覆盖默认流程完整 / 空对象等价缺省 / 不带应用 server 默认），tsc 0 错误，
-  **run 循环零改动**（仅截断表达式参数化）；另修 server-context-trim.test.ts 既有 chat e2e
-  vitest 超时放宽 45s（dotenv 注入真实 key 走远端 API 网络慢超默认 5s，与 server.test.ts 同模式）
- - **冒烟实测**：真实 dist CLI 子进程 `server --tool-output-policy '{"maxOutputChars":800,"tailChars":200}'`
-  ——version 0.6.34、get_config 回显默认策略、chat 非法 maxOutputChars(0) → 「toolOutputPolicy 的
-  maxOutputChars 必须是正整数」error、合法请求事件流完整，SMOKE PASS
- - EN: Tool-output policy is now fully configurable end-to-end — `AgentConfig.toolOutputPolicy`,
-   host-protocol `chat` param `toolOutputPolicy` (validated by exported pure fn
-   `validateToolOutputPolicy`; invalid values error without generation), CLI server default
-   `--tool-output-policy '<json>'`, and `get_config` echo; missing policy keeps the exact legacy
-   uniform slice behavior (zero regression). 699/699 green, zero Agent.run control-flow changes.

#### v0.6.33 (2026-08-11) — terminal 工具错误信息带退出码/信号（失败可诊断）
- 🖥️ **terminalTool 失败诊断（src/tools/index.ts）**：命令失败时错误信息带退出码
-  `（退出码 N）`（execSync error.status，如 127 命令不存在、1 一般错误）或信号
-  `（信号 SIGTERM，可能超时）`（超时/被信号终止场景，status 非数值时）；无退出码无信号时
-  输出与旧版完全一致（零回归）——AI 看到退出码可判断失败性质（命令不存在 vs 语法错误 vs 超时），
-  与 v0.6.30 终端型输出治理（留尾部）互补；危险命令拦截等前置逻辑不变
- 📚 README Changelog + 版本号 0.6.33
- 🧪 **681/681 全绿**（677 + 4 新增 tests/terminal-exitcode.test.ts：成功路径零回归 / exit 3 →
-  「退出码 3」/ 命令不存在 → 127 / exit 0 成功不误报），tsc 0 错误，零 agent.ts 改动
- **冒烟实测**：真实库调用 terminalTool——`exit 3` →「命令执行失败（退出码 3）」、
-  不存在命令 →「（退出码 127）」、`echo` 成功输出、`exit 0` success:true，SMOKE PASS

#### v0.6.32 (2026-08-11) — CLI 会话归档命令：/archived /archive /restore（端侧对称接线）
- 🗄️ **CLI 接线 v0.6.31 归档 API（src/cli/index.ts）**：`/archived` 列出归档会话（结构同 /sessions
-  含首条消息预览 + 会话ID + 友好时间，空归档友好提示）；`/archive [会话ID]` 归档（缺省归档当前
-  会话——handleSlashCommand 既有 sessionId 参数；数据保留可恢复）；`/restore <会话ID>` 恢复
-  （无参时列出归档会话 + 用法提示）；三者均幂等安全（不存在/已归档/已恢复黄色提示不报错）——
-  与 server 协议 end_session / restore_session / list_archived_sessions 语义对称；`/help` 注册
- 📚 README Changelog + 版本号 0.6.32
- 🧪 **677/677 全绿**（664 + 13 新增 tests/session-archive-cli.test.ts：/archive 指定 id 归档成功
-  （recent 隐藏 + 进归档 + 数据保留）/ 缺省归档当前会话 / 无参无 sessionId 用法提示 / 不存在幂等 /
-  重复归档幂等；/restore 恢复成功回最近 / 无参列出 + 用法 / 无归档用法提示 / 不存在幂等；/archived
-  列出含预览 + id / 无归档提示 / 只列归档不列活跃；/help 注册三行）；另修 v0.6.31 遗留的
-  session-archive e2e chat 测试 vitest 超时放宽到 45s（dotenv 注入真实 key 走远端 API 网络慢时
-  超默认 5s，与 server.test.ts chat 测试同模式），tsc 0 错误，零 agent.ts 改动
- **冒烟实测**：真实 dist server 子进程 + CLI 命令组合——create_session → /archive 归档 →
-  /archived 列出 → /restore 恢复 → /sessions 重新出现，SMOKE PASS（见 flare-progress.md）

#### v0.6.31 (2026-08-11) — 会话归档 API：server 协议 end_session / restore_session / list_archived_sessions
- 📦 **会话归档（src/memory/store.ts + server.ts）**：sessions 表加 `archived` 列（新库直接建 +
  老库 migrate 自动补列，幂等）——`archiveSession` / `restoreSession`（幂等：不存在 false 不抛错）、
  `listArchivedSessions`（结构同 recent_sessions 含首条 user 消息预览）、`getRecentSessions` 排除归档、
  `getAllSessions` 每项带 `archived` 布尔（增量字段向后兼容）
- 🔌 **server 协议**：`end_session {sessionId?}` → `{type:'ok', archived:true}`（数据保留、从最近会话
  隐藏、销毁缓存 Agent，下次 chat 重建）；`restore_session` → 恢复；`list_archived_sessions` →
  `archived_sessions` 清单（只读不触发生成）；宿主面板「归档/已归档/恢复」完整闭环，与
  delete_session（整个删除）语义清晰区分
- 📚 docs/host-protocol.md §25.1 + 请求类型列表 + README Changelog + 版本号 0.6.31
- 🧪 **664/664 全绿**（654 + 10 新增 tests/session-archive.test.ts：store 单测 6——归档标记+重复幂等 /
  不存在幂等 / 恢复+未归档幂等 / recent 排除归档 + listArchived 只列归档（含预览）/ 归档不删数据
  （消息+用量保留可恢复继续用）/ 老库迁移补列不报错可归档；server e2e 4——end→recent 隐藏→
  list_archived 出现→restore 回最近 / end 后数据保留 get_messages 仍可读 / 不存在会话幂等 /
  end 后 chat 重建 Agent 正常流程），tsc 0 错误，零 agent.ts 改动

#### v0.6.30 (2026-08-11) — 工具输出治理：按工具类型定制截断（读文件留头尾、终端留尾部）
- ✂️ **`truncateToolOutput` 纯函数（src/core/tool-output.ts，库导出）**：原来 run 循环对所有工具统一
  `output.slice(0, 2000)`——探索型工具（read_file/search_files）长输出只留头部**尾部丢掉**（AI 常需
  看文件结尾/匹配列表末尾）、终端型工具（terminal）输出最有价值的**结果/报错在尾部**却先被裁掉。
  现在按工具类型定制：**探索型留头尾**（头部 1200 + 省略标记（含被省略字符数）+ 尾部 700，总长
  严格 ≤ 预算）、**终端型留尾部**（尾部 2000 + 省略标记在前）；其他工具走默认（与旧版 slice
  逐字符一致，零回归）；`maxOutputChars/maxErrorChars/headChars/tailChars/ellipsis` 全可配；
  `toolOutputKind` 分类纯函数 + `ToolOutputPolicy` 类型库导出
- 🔌 **Agent.run 调用点一行等价替换**：`truncateToolOutput(tc.function.name, result)`——控制流零改动，
  默认策略与旧版逐字符一致（既有断言覆盖）；失败分支仍为错误信息前 1000 字符
- 📚 README Changelog + 版本号 0.6.30
- 🧪 **654/654 全绿**（630 + 24 新增 tests/tool-output.test.ts：分类 3——探索型/终端型/默认；默认策略
  6——成功 2000 与旧版 slice 逐字符一致/短输出原样/失败 1000 一致/error 缺省/成功 output 缺省/
  可配上限；探索型 5——短输出原样/长输出留头尾+省略数+不超预算/search_files 同策略/可配头尾/
  失败分支；终端型 4——短输出/留尾部+省略标记在前/可配 tailChars/失败分支；省略标记 3——无占位符
  直接使用/自定义 {omitted} 替换/默认含占位符；**Agent 集成 3**——read_file 超长输出进上下文
  （tool_result 事件 + LLM 消息均留头尾带省略标记）/默认工具超长输出仍前 2000 零回归/terminal
  超长输出留尾部），tsc 0 错误，run 循环仅截断表达式一行替换（控制流不变）

#### v0.6.29 (2026-08-11) — prompt caching 基建 P0：system 前缀稳定 + usage 缓存回传
- 🧱 **system 前缀稳定（P0-1，src/core/agent.ts 构造函数 + context.ts）**：原来记忆拼进 system 前缀，
  记忆一变整条 system 变 → DeepSeek 前缀缓存全失效（50 倍差价）。现在 system 拆成**独立消息序列**：
  稳定前缀（systemPrompt，永远不变）→ 身份段（identity/flareIntro，独立 system）→ 记忆段
  （「关于这个用户」，独立 system）——记忆变化只影响最后一条 system，稳定前缀 + 工具定义永远命中缓存；
  `setContext` 宿主状态快照改为**独立 system 消息追加到消息末尾**（动态区，历史之后），重复调用替换、
  清空移除，不再污染稳定前缀；`trimContextMessages`/`suggestTrim` 改为**开头连续 system 块全保底**
  （身份/记忆不因裁剪丢失；末尾「当前状态」不挪位按最近优先保留）；`summarizeTrimmedMessages` 摘要
  紧随开头 system 块之后；全部纯函数改动 + 构造拆消息，**run 循环零改动**
- 💰 **usage 回传增强（P0-2，src/core/llm.ts + memory/store.ts + server.ts + cli）**：`LLMResponse.usage`
  新增 `cache_read_tokens`（DeepSeek prompt_cache_hit_tokens / OpenAI cached_tokens 双格式兼容）/
  `cache_write_tokens`（Anthropic 风格）；`estimateCostUsd` 纯函数按模型定价估算成本（deepseek-chat
  $0.27/$0.07/$1.10 每 M，命中价 ≈1/4 未命中价；reasoner 更高；本地/未知模型 null）；`extractUsageCache`
  提取纯函数；usage_log 表加列（cache_read/cache_write/estimated_cost_usd）+ **老库自动迁移补列**；
  `logUsage` 可选 extra 参数（缺省与旧版完全一致）；`getUsageStats`/`getSessionUsage`/`perModel` 汇总
  缓存与成本；server 协议 get_usage/session_usage 透传；CLI `/usage` 显示缓存命中行（tokens + 命中率）
  与估算成本
- 📚 docs/flare-token-architecture.md 落地状态更新（P0-1/P0-2 已实施，验收标准）+ docs/host-protocol.md
  §9 usage 响应示例 + README Changelog + 版本号 0.6.29
- 🧪 新增 25 项测试（llm 12：estimateCostUsd 6——命中/部分命中/reasoner/未知 null/封顶防御；extractUsageCache
  6——DeepSeek/OpenAI 双格式/共存优先/cache_write/无字段/负数防御；store 2——logUsage extra 落库+汇总、
  老库迁移补列不报错；agent 3——身份独立 system 消息/前缀稳定（记忆变化首条 system 不变）/setContext
  末尾独立+替换+清空；context 4——trim 多 system 全保底/末尾当前状态不挪位/极小预算保底/单 system 零回归、
  suggestTrim 多 system 对称+keepSystem:false、summarize 摘要紧随 system 块；CLI 2——/usage 缓存行+命中率+成本、
  无缓存零回归）；**630/630 全绿**（605 + 25），tsc 0 错误，run 循环零改动
- 🔥 冒烟实测：estimateCostUsd 1M 未命中 $1.37 vs 全命中 $1.17（缓存省钱可见）；记忆变化重建 Agent 稳定前缀
  逐字节一致；logUsage 带缓存落库 getUsageStats/getSessionUsage 往返正确；setContext 追加末尾独立 system，
  SMOKE PASS

#### v0.6.28 (2026-08-11) — 外部 MCP 资源透传（动态资源提供器）
- 🧩 **`MCPServer` 动态资源提供器 `resourceProvider`（src/mcp/server.ts）**：resources 除构造时注入的静态
  列表外，可挂动态提供器——`resources/list` 实时合并（静态优先、同 uri 去重）、`resources/read` 代理读取
  （文本包成 contents / 数组原样透传）；提供器抛错 → 降级（列表空 / 读取 Unknown resource -32602），
  请求不中断；动态 uri 同样可订阅/退订；有提供器时 `capabilities.resources` 声明 subscribe + listTemplates
- 🔀 **CLI `flare mcp-server --bridge-resources`**：连接 ~/.flare/mcp.json 全部外部 MCP 服务器，把外部
  资源/模板透传给 flare 自身 MCPServer 的客户端（宿主）——外部资源经 flare 中转暴露，读取实时代理转发
  （stdio 与 --http 双传输都支持；提示走 stderr 不污染协议通道；未配置服务器安全提示 + 仅暴露自身资源）
- 📚 docs/mcp.md 资源透传章节（接线示例 + 嵌套循环风险说明）+ README Changelog + 版本号 0.6.28
- 🧪 新增 12 项测试（MCPServer 10：列表合并异步/静态优先去重 / 提供器抛错·非数组降级 / 模板合并 /
  读取文本包 contents·数组透传 / 未知·抛错 -32602 / 静态优先读 / 动态订阅退订 / initialize 声明 +
  无提供器零回归；**真实互通 e2e**——MCPClient ↔ 带提供器的真实子进程：合并列表 + 动态读取闭环 +
  未知 reject 连接不断；CLI 2：--bridge-resources 全链路透传（资源/模板/读取往返/工具不受影响）、
  无配置降级）；**605/605 全绿**（593 + 12），tsc 0 错误，零 agent.ts 改动

#### v0.6.27 (2026-08-11) — confirm 事件带工具描述（宿主弹窗确认流程打磨）
- 🪟 **server 协议 `confirm` 事件带 `description`（src/server.ts）**：工具定义有描述时（如 `memory_save` 的
  「保存一条持久记忆…」）随事件带上——宿主确认弹窗可展示说明行「AI 想做什么」，而非只有工具名+参数；
  工具无描述（如宿主注入的空描述工具）不输出该字段（JSON.stringify 丢 undefined，**向后兼容**：旧宿主忽略未知字段）
- 🎨 **CLI 终端确认弹窗同样带描述**：`formatConfirmPrompt` 可选第三参描述（说明行截断 80 字符）；
  交互模式 confirmer 实时查内置 + MCP 工具描述（/mcp connect 后新工具也生效）；缺省行为与旧版完全一致（零回归）
- 🧩 **`buildConfirmEvent` 纯函数库导出**（构造 confirm 事件，可单测）；`ConfirmEvent` 类型
- 📚 docs/host-protocol.md §17 + 确认流章节 + 事件表（confirm 行 description?）+ README Changelog + 版本号 0.6.27
- 🧪 新增 9 项测试（buildConfirmEvent 4：带描述字段完整 / 无描述序列化后无 key / 空描述视为无 / args 归一 {}；
  CLI 5：formatConfirmPrompt 说明行 + 超长截断 + 缺省无说明行（与旧版一致）、terminalConfirmer 带描述透传 ask /
  缺省无说明行）；**593/593 全绿**（584 + 9），tsc 0 错误，零 agent.ts 改动
- 🔥 冒烟实测（真实 server 子进程 + mock OpenAI 端点）：场景1——AI 调 `memory_save` → confirm 事件带完整
  描述（`保存一条持久记忆…`）；场景2——`--confirm-tools host_write` + 宿主注入空描述工具 → confirm 事件
  **无 description 字段**（向后兼容）；两场景均以 done 正常收尾，SMOKE PASS
- EN: `confirm` events now optionally carry the tool `description` (populated from tool definitions at agent
  build time) so host confirmation dialogs can show what the AI intends to do; CLI terminal confirm prompts
  show the same description line. Tools without a description omit the field (backward compatible).
  593/593 green, zero Agent.run changes.

#### v0.6.26 (2026-08-11) — McpManager 资源桥接 + server 协议 mcp_resources
- 📦 **McpManager 资源桥接（src/mcp/manager.ts）**：连接外部 MCP 服务器时除桥接工具外，同时拉取
  `resources/list` + `resources/templates/list`（容错——服务器无资源能力/请求失败静默降级为空数组，
  不阻塞连接）——外部服务器暴露的资源/动态资源模板**真实暴露**给宿主（此前只桥接工具，资源完全没消费）
- 🔍 **新增 `getAllResources()` / `getAllResourceTemplates()` / `readResource(name, uri)`**：带来源
  （`server` 名）的资源与模板并集 + 代理读取资源内容（未连接服务器 reject 清晰错误）；`status()`
  已连接时带 `resourceCount`/`templateCount`（可选字段，向后兼容）；`disconnect` 随连接清理
- 🖥️ **server 协议 `mcp_resources`（src/server.ts）**：宿主查看已连接 MCP 服务器的资源/模板清单
  （按服务器分组，每项含来源）；只读、不触发生成、不创建会话；等待启动时后台连接落定（与 mcp_status 一致）
- 🎨 **CLI `/mcp` 状态行增强 + `/mcp resources [name]` 子命令 + connect 摘要带资源数**：已连接服务器显示
  `（N 个工具 · M 资源 · K 模板）`；`/mcp resources [name]` 列出已桥接资源/模板（uri + 描述；
  带 name 过滤单服务器；无资源友好提示；旧 hooks 未提供 resources 方法时安全降级提示）；
  `/mcp connect` 摘要带 `（N 个 MCP 工具 · M 个资源 · K 个模板）`
- 📚 docs/host-protocol.md §16.1 新章节 + 请求类型列表 + README Changelog + 版本号 0.6.26
- 🧪 新增 14 项测试（McpManager 5：connect 资源桥接（mock 服务器 2 资源+1 模板+status 计数）/ readResource
  代理读取+未知 uri reject+未连接 reject / disconnect 随连接清理 / 无资源能力服务器空数组不阻塞 /
  HTTP transport 资源拉取+读取闭环；server 协议 e2e 2——mcp_resources 真实子进程返回资源/模板清单、
  mcp_status 带 resourceCount/templateCount；CLI /mcp 7——状态行资源数、/mcp resources 无参列出全部、
  带 name 过滤、无资源提示、旧 hooks 降级、用法提示含 resources、connect 摘要带资源数透传）；
  **584/584 全绿**（583 + 1），tsc 0 错误，零 agent.ts 改动
- EN: `McpManager` now bridges external MCP servers' `resources/list` + `resources/templates/list` on
  connect (previously only tools were consumed) — `getAllResources()` / `getAllResourceTemplates()` /
  `readResource(name, uri)` + new host-protocol request `mcp_resources` expose them to hosts;
  `/mcp` status shows resource/template counts + new `/mcp resources [name]` subcommand.
  584/584 green, zero Agent.run changes.

#### v0.6.25 (2026-08-11) — MCP 列表变化通知补齐 prompts/list_changed + CLI /memory 关键词搜索
- 📢 **MCPServer.notifyPromptListChanged()（src/mcp/server.ts）**：MCP 标准列表变化通知**第三块对称补齐**
  （v0.6.20 只做了 tools/resources，漏了 prompts）——提示词**列表**动态变化（运行中新增/移除 prompt）时
  推送 `notifications/prompts/list_changed`（无 id、无 params，客户端无需响应）；已关闭/写失败静默忽略
- 📥 **MCPClient 新增 `onPromptsChanged` 回调（src/mcp/client.ts）**：收到 `notifications/prompts/list_changed`
  触发（无参，建议回调内重新拉取 prompts/list 刷新清单）；未配置静默忽略不干扰后续请求；与
  onToolsChanged/onResourcesChanged 独立互不干扰——三者同构，协议标准全覆盖
- 🔍 **CLI `/memory <关键词>` 搜索记忆（src/cli/index.ts）**：原来 `/memory` 只能列出全部、`/search` 只搜
  消息——现在 `/memory <关键词>` 复用 `store.searchMemories`（FTS5 trigram，中文友好）全文搜索持久记忆，
  与 /search 对称；无关键词仍列出全部（零回归），无结果友好提示；`/help` 注册
- 📚 docs/mcp.md 列表变化通知章节更新（三通知同文档、示例含 prompts）+ README CLI 表/Changelog + 版本号 0.6.25
- 🧪 新增 7 项测试（MCPServer 2：notifyPromptListChanged 推送结构（无 id/params）/ 三者独立互不干扰；
  **真实互通 e2e**——fixture 的 notify_changed 工具改为推送三个通知，客户端三回调各收到 2 次且连接不断；
  MCPClient list-changed 模式断言并入 prompts、已关闭静默并入既有用例；**/memory 搜索 5**——列出全部 /
  关键词 FTS 命中（不相关不出现）/ 无记忆提示 / 无结果提示 / help 注册）；
  **567/567 全绿**（562 + 5），tsc 0 错误，零 agent.ts 改动
- EN: added `MCPServer.notifyPromptListChanged()` + `MCPClient.onPromptsChanged` — the missing third
  MCP standard list-changed notification (prompts), completing the v0.6.20 tools/resources pair;
  plus CLI `/memory <keyword>` full-text memory search. 567/567 green, zero Agent.run changes.

#### v0.6.24 (2026-08-11) — server 协议 search_messages 全文搜索 + CLI /search / host-protocol search_messages + CLI /search
- 🔍 **server 协议 `search_messages`（src/server.ts）**：宿主面板"搜索历史对话"数据源——复用记忆库
  FTS5 trigram 全文索引（bm25 相关度排序、中文友好；短查询 <3 字自动 LIKE 回退），**跨全部会话**
  检索（与 get_usage 全局统计同风格，只读不触发生成）：`{query, limit?}` →
  `{ type:'search_results', query, results:[{sessionId,role,content,createdAt}] }`；`query` 必填
  （缺失/空白回 error 含用法提示）、`limit` 1~100 整数默认 10（非法回 error 含提示）、无结果空数组
  幂等不报错
- 💬 **CLI 交互 `/search <关键词>`（src/cli/index.ts）**：跨会话搜索历史对话（找回旧对话），
  显示命中消息的角色/时间/内容截断；无关键词用法提示、无结果友好提示；`/help` 注册
- 📚 docs/host-protocol.md §5.1 新章节 + 请求类型列表 + README Changelog + 版本号 0.6.24
- 🧪 新增 8 项测试（server e2e 4：缺 query/空白 error / 非法 limit（0/-1/101/非数字）/ 合法路径空结果
  幂等 / **数据往返**——测试进程写入临时库消息后协议可搜索到（含 sessionId/role/content 断言）/
  不相关内容不命中；CLI /search 4：命中列表跨会话 / 无关键词用法提示 / 无结果提示 / help 注册）；
  共 **558/558 全绿**（550 + 8），tsc 0 错误，零 agent.ts 改动
- EN: new host-protocol request `search_messages` (FTS5 full-text search across all sessions,
  bm25-ranked, Chinese-friendly) + interactive CLI `/search`. 558/558 green, zero Agent.run changes.
- 🩺 **MCPClient.ping()（src/mcp/client.ts）**：与既有 `MCPHttpClient.ping()` 对齐（此前 stdio 客户端
  接口不对称）——发 MCP 标准 `ping` 请求（服务器回空 result 即存活），成功返回 `true`，断开/超时/
  协议错误 reject；无状态保活探测不干扰后续请求。MCPServer dispatch 早已支持 `ping`（零服务器改动）
- 📚 docs/mcp.md 编程方式章节补 ping 健康检查示例（stdio/HTTP 对称声明）
- 🧪 新增 2 项测试（MCPClient ping 真实互通——mock 服务器 ping 往返 + ping 后连接仍可用 / close 后
  reject）；**560/560 全绿**（558 + 2），tsc 0 错误，零 agent.ts 改动
- EN: added `MCPClient.ping()` (stdio) to match `MCPHttpClient.ping()` — standard MCP health-check,
  returns true on empty-result, rejects on disconnect/timeout. 560/560 green, zero Agent.run changes.

#### v0.6.23 (2026-08-11) — completion/complete 并入资源模板候选 / resource-template candidates in ref/resource completion
- 🎯 **ref/resource 补全增强（src/mcp/server.ts）**：`completion/complete`（ref/resource）候选从**仅静态
  资源 uri** 扩展为**静态资源 + 资源模板 uriTemplate**（v0.6.22 模板协议的自然衔接）：客户端输入 uri
  前缀（如 `memory://`）时同时建议静态资源（`memory://preferences`）与动态资源形态
  （`memory://{noteId}`）——静态在前、模板在后；仅模板前缀命中只回模板候选；空匹配空候选不报错。
  零 agent.ts 改动
- 📚 docs/mcp.md 资源模板章节「与 completion 的关系」更新（v0.6.23 起并入模板候选）
  + README Changelog + 版本号 0.6.23
- 🧪 新增 1 项测试（completion ref/resource 并入模板候选：静态+模板合并顺序 / 仅模板命中 / 空匹配空候选）；
  共 **550/550 全绿**（549 + 1），tsc 0 错误，零 agent.ts 改动
- EN: `completion/complete` (`ref/resource`) now suggests **resource-template URI templates** in addition
  to static resource URIs (static first, templates second) — typing `memory://` surfaces both
  `memory://preferences` and `memory://{noteId}`. 550/550 green, zero Agent.run changes.

#### v0.6.22 (2026-08-11) — MCP 资源模板：resources/templates/list + matchResourceTemplate / MCP resource templates (resources/templates/list + matchResourceTemplate)
- 📐 **服务器侧（src/mcp/server.ts）**：`MCPServerOptions.resourceTemplates?: McpResourceTemplate[]`——
  **动态资源**（uri 含变量，如 `memory://{noteId}` 的记忆条目）无法在 `resources/list` 逐条列出时，
  注入模板声明其形态（RFC 6570 风格 `{var}` 占位）；dispatch 新增标准方法 `resources/templates/list`
  → 返回模板元数据（`uriTemplate`/`name`/`description?`/`mimeType?`），**未注入返回空列表**（方法始终
  可用不报错）；有模板时 `capabilities.resources` 声明 `{ subscribe: true, listTemplates: true }`
  （仅静态资源无模板仍为 `{ subscribe: true }`，缺省行为与旧版完全一致零回归）
- 🔍 **纯函数 `matchResourceTemplate(uri, template)`**（库导出）：判断 uri 是否匹配某模板——模板编译为
  正则（`{var}` 捕获组；`path`/`uri` 类变量允许任意字符含 `/`，其余单段不含 `/`），匹配返回模板对象、
  不匹配返回 `null`；宿主可校验动态资源 uri 合法性/生成模板候选 uri
- 👂 **客户端消费**：`MCPClient.listResourceTemplates()` / `MCPHttpClient.listResourceTemplates()`
  → 模板数组（stdio / HTTP 同构；与 listResources 一致，非数组容错 []）；HTTP transport 复用
  handleMessage 核心自动支持（无需额外改动）
- 📚 docs/mcp.md 资源模板章节（含与 completion/complete 的定位差异：静态资源可枚举、动态资源靠模板发现）
  + README Changelog + 版本号 0.6.22
- 🧪 新增 8 项测试（MCPServer 5：templates/list 返回注入模板含可选字段 / 未注入空列表 / capabilities
  声明 listTemplates（有模板+仅资源无模板+仅模板三种形状）/ matchResourceTemplate 纯函数单段变量·path
  含 /·不匹配 null / **resources/templates 真实互通 e2e**——真实 MCPServer 子进程静态资源+动态模板，
  客户端 listResources+listResourceTemplates+readResource 闭环连接不断；MCPClient 1：listResourceTemplates
  解析；MCPHttpClient 2：HTTP 消费闭环 + 未注入模板零回归）；共 **549/549 全绿**（541 + 8），
  tsc 0 错误，零 agent.ts 改动
- EN: `MCPServerOptions.resourceTemplates` exposes **dynamic resource URI templates** (e.g.
  `memory://{noteId}`) via the standard `resources/templates/list` (empty list when none; `listTemplates:
  true` in `capabilities.resources` only when templates exist — otherwise unchanged). New pure
  `matchResourceTemplate(uri, template)` matches URIs against a template (`{var}` groups; `path`/`uri`
  variables allow `/`). `MCPClient`/`MCPHttpClient.listResourceTemplates()` consume it (stdio + HTTP).
  549/549 green, zero Agent.run changes.

#### v0.6.21 (2026-08-11) — get_messages 分页：limit + recent 最近消息 / get_messages paging (limit + recent)
- 📖 **server 协议 `get_messages` 增强（src/server.ts + memory/store.ts）**：可选 `limit`
  （1~500 整数，默认 50，非法回 error 含用法提示不触发生成）+ `recent`（布尔）——`recent:true`
  返回**最近** limit 条（宿主面板\"最近对话/当前上下文\"数据源；长会话下默认取最早 limit 条看不到
  最新内容），响应带 `recent:true` 标记；缺省行为与旧版完全一致（最早 50 条，向后兼容零回归）
- 🗃️ **`MemoryStore.getRecentMessages(sessionId, limit=50)`**（新方法）：`ORDER BY created_at DESC,
  id DESC` 取最近 limit 条后反转回正序返回（同秒插入用自增 id 次级排序保证顺序确定）——与
  getMessages（最早 limit 条）差异明确；空/不存在会话幂等返回 []
- 📚 docs/host-protocol.md §5 参数表 + README Changelog + 版本号 0.6.21
- 🧪 新增 7 项测试（store 单测 3：最近 limit 条正序返回 / 与 getMessages 取最早差异明确 / 缺省 50+
  空会话幂等；server e2e 4：limit 合法路径不破坏 / recent 标记透传 / 非法 limit（0/-1/501/非数字）
  全 error 含提示）；共 **542/542 全绿**（535 + 7），tsc 0 错误，零 agent.ts 改动
- EN: `get_messages` now accepts `limit` (1–500, default 50, invalid → error) and `recent:true`
  (return the **latest** N messages, `recent` echoed in response) via new `MemoryStore.getRecentMessages`
  (desc by created_at + id, reversed to chronological) — hosts can load the most recent context instead
  of the oldest 50. Backward compatible. 542/542 green, zero Agent.run changes.

#### v0.6.20 (2026-08-11) — MCP 列表变化通知：tools/list_changed + resources/list_changed / MCP list-changed notifications (tools + resources)
- 🔔 **服务器侧（src/mcp/server.ts）**：`MCPServer.notifyToolListChanged()` / `notifyResourceListChanged()`
  ——工具集/资源列表**动态变化**（运行中新增或移除）时推送 MCP 标准通知 `notifications/tools/list_changed`
  / `notifications/resources/list_changed`（无 id、无 params，客户端无需响应）：客户端收到后应重新拉取
  tools/list / resources/list 刷新清单；与 v0.6.15 的 `resources/updated`（订阅的单个资源**内容**变化）
  互补——updated 面向已订阅 uri，list_changed 面向**列表整体**、无需订阅（所有已连接客户端收到）；
  服务器已关闭 / 写失败 → 静默忽略（不抛错）
- 👂 **客户端侧（src/mcp/client.ts）**：`MCPClient` 选项新增 `onToolsChanged()` / `onResourcesChanged()`
  回调——收到对应通知触发（无参，建议回调内重新 listTools/listResources）；未配置静默忽略不干扰后续
  请求；两个回调独立只配置其一互不影响（与 onLog/onResourceUpdated/onProgress 同风格）
- 📚 docs/mcp.md 列表变化通知章节（含与 resources/updated 的定位差异 + HTTP transport 无推送通道的
  传输差异如实记录，MCPHttpClient 不提供回调不假装支持）+ README Changelog + 版本号 0.6.20
- 🧪 新增 8 项测试（MCPServer 5：notifyToolListChanged 推送结构 / notifyResourceListChanged 推送结构 /
  两者独立互不干扰 / 已关闭静默 / **list_changed 真实互通 e2e**——真实 MCPServer 子进程 callTool
  notify_changed → 客户端 onToolsChanged+onResourcesChanged 各收到 2 次且连接不断；MCPClient 3：
  两个回调各触发 / 只配其一互不干扰 / 未配置忽略不抛错）；共 **535/535 全绿**（527 + 8），
  tsc 0 错误，零 agent.ts 改动
- EN: New `MCPServer.notifyToolListChanged()` / `notifyResourceListChanged()` push the standard MCP
  `notifications/tools/list_changed` / `notifications/resources/list_changed` (no id/params) when the
  tool/resource **lists** change dynamically, and `MCPClient` gains `onToolsChanged` / `onResourcesChanged`
  callbacks so hosts can re-fetch tools/list & resources/list — complementary to the per-uri
  `resources/updated` subscription (content change) from v0.6.15. HTTP transport documented as
  push-incapable (no SSE). 535/535 green, zero Agent.run changes.

#### v0.6.19 (2026-08-10) — 上下文压缩摘要：裁剪掉的历史压缩成摘要 / Context summarization: trimmed history compressed into a summary message
- 🧩 **上下文压缩摘要（src/core/context.ts + agent.ts + server.ts + cli）**：`AgentConfig` 新增
  `contextSummarize`（默认 false）——开启后迭代前裁剪把**丢弃的历史压缩成摘要消息**而非直接丢弃
  （AI 保留话题连续性）：纯函数 `summarizeTrimmedMessages(messages, opts)`（在 trimContextMessages
  基础上：未裁剪返回原引用零拷贝；裁剪后摘要紧随 system 之后）+ `buildSummaryText`（纯启发式统计
  **不调 LLM**：被压缩条数 + 角色分布 user/assistant/tool + 估算 tokens + 涉及工具去重列表 +
  最后话题（最新被裁消息内容片段））；**摘要链防堆积**——摘要以 `[历史摘要]` 标记开头，下次裁剪
  无论旧摘要在保留区还是丢弃区都被识别合并覆盖（新摘要含\"更早历史\"行，多次裁剪不越滚越大）
- ⚙️ **server 协议透传**：chat 请求带 `contextSummarize`（布尔，非法值 error 不触发生成）；
  `HostServerOptions.defaultContextSummarize` + CLI `flare server --context-summarize` server 级
  默认（chat 未指定时应用，请求优先；ctxOptsChanged 同机制自动重建 Agent）；
  `get_config` 回显 `defaultContextSummarize`（只读，不含密钥）
- 📚 docs/context-observability.md 摘要章节 + docs/host-protocol.md chat 参数表 + README Changelog/CLI 表 + 版本号 0.6.19
- 🧪 新增 20 项测试（trimContextMessages 摘要纯函数 13：未裁剪原引用 / 摘要紧随 system+含条数统计 /
  角色分布+涉及工具去重 / 最后话题最新被裁 / 摘要链防堆积（丢弃区+保留区旧摘要合并覆盖） / maxChars
  截断 / role=user / includeTail:false / 无 system 摘要放最前 / maxTools 限制 / buildSummaryText 2；
  Agent 集成 2：contextSummarize 生效 / 缺省 false 零回归；server e2e 5：默认值不破坏启动 / 非法
  contextSummarize error / 缺省应用默认 / 合法透传流程完整 / get_config 回显）；共 **526/526 全绿**
  （506 + 20），tsc 0 错误，**run 循环零改动**（仅 trimContext 私有方法体委托 + AgentConfig 新字段）
- 🖥️ **CLI 交互模式接入（src/cli/index.ts）**：`flare chat --context-summarize` 开启交互模式压缩摘要
  （makeAgent 构造 Agent 时传 contextSummarize；长会话裁剪后 AI 保留话题连续性）；+1 测试
  （chat --help 输出含 flag 说明）→ **527/527 全绿**（526 + 1）
- EN: When enabled (`contextSummarize`, default off), `summarizeTrimmedMessages` replaces
  trimmed-away history with a compact heuristic summary message (counts, role distribution,
  estimated tokens, involved tools, last topic) instead of dropping it entirely — no LLM call,
  summary chain de-duplicated via a `[历史摘要]` marker so repeated trims don't accumulate;
  exposed via host protocol `chat` (per-request), `--context-summarize` server default and
  `get_config` echo. 526/526 green, zero Agent.run changes.

#### v0.6.18 (2026-08-10) — server 协议 rename_session/clear_session 会话管理 / Session rename & clear via host protocol (rename_session + clear_session)
- 📊 **server 协议 `rename_session`（src/server.ts）**：`{ sessionId, title }`——宿主面板"重命名会话"
  专用接口（与 create_session 创建语义分离）：title 非空必填（空白裁剪判空，缺失/空白回 error 含用法
  提示，不触发生成）；复用 `MemoryStore.updateSessionTitle`（UPSERT——会话不存在自动创建，与
  create_session 同语义）；响应 `ok` 回显 `title`，recent_sessions/list_sessions 立即反映新标题
- 🧹 **server 协议 `clear_session`（src/server.ts + memory/store.ts）**：`{ sessionId }`——面板"清空对话"
  按钮数据源：清空会话全部消息（`MemoryStore.clearSessionMessages` 返回删除条数 `cleared`，FTS 触发器
  联动清索引），**保留会话记录与用量**（区别于 delete_session 整个删除）；同时销毁缓存 Agent（内存
  上下文同步清空，下次 chat 重建干净会话）；空/不存在会话 `cleared:0` 幂等
- ⚙️ **server 协议 `get_config`（src/server.ts）**：`{}` → `config` 响应——面板"设置/关于"数据源：
  确认门配置（名单/超时）、默认采样参数（defaultMaxTokens/defaultTemperature）、默认上下文裁剪参数
  （defaultMaxContextMessages/defaultMaxContextTokens）、工具超时、namespace、storage、MCP 服务器清单
  （名称+传输类型）；只读不触发生成、**不含任何密钥**
- 📊 **用量按模型分解（memory/store.ts + cli）**：`getUsageStats()` 新增 `perModel`（GROUP BY model：
  调用次数 + token 分解，按次数降序，无模型归 unknown）——宿主成本核算/用量分布数据源（get_usage
  协议响应透传）；CLI `/usage` 显示每个模型的用量行
- 📚 docs/host-protocol.md §23/§24/§25 + 请求类型列表 + 响应表 ok 行/config 行/usage 行 + README Changelog + 版本号 0.6.18
- 🧪 新增 10 项测试（server e2e：rename_session 重命名成功且 recent_sessions 反映新标题 / 缺 title·空白
  title error / 不存在会话 UPSERT 幂等 / clear_session 保留会话+消息清空 / clear_session 幂等 cleared:0 /
  get_config 结构完整 / get_usage perModel 数组结构；store 单测：清空指定会话+FTS 联动 / 不影响其他会话 /
  空会话幂等+清空后可继续写入 / 用量按模型分解；CLI /usage perModel 行）；共 **506/506 全绿**（496 + 10），
  tsc 0 错误，零 agent.ts 改动
- EN: New `rename_session` (rename an existing session, `title` required, UPSERT semantics),
  `clear_session` (wipe a session's messages, keep the session record & usage, `cleared` count),
  `get_config` (read-only server runtime config for settings/about UIs, no secrets) host-protocol requests,
  and per-model usage breakdown (`perModel` in get_usage stats + CLI /usage lines) for cost accounting.
  506/506 green.

#### v0.6.17 (2026-08-10) — 上下文自动裁剪：trimContext 支持 token 预算 / Context auto-trim by token budget (Agent.trimContext + trimContextMessages)
- 🧩 **Agent 上下文自动裁剪（src/core/agent.ts + context.ts）**：`AgentConfig` 新增 `maxContextMessages`
  （条数上限，默认 30）/ `maxContextTokens`（token 预算，可选）——迭代前 `trimContext()` 自动按预算
  裁剪，宿主免手动 set_context；**不配置则行为与旧版完全一致**（保留最近 30 条，零回归）
- 🧩 **纯函数 `trimContextMessages(messages, { maxMessages?, maxTokens? })`（src/core/context.ts）**：
  与 suggestTrim（宿主建议、不保证配对）不同，这是 Agent 内部安全裁剪——**保证不拆散
  tool_calls ↔ tool 响应配对**（LLM 收到拆散配对会 400）：system 保底（token 计入预算）+
  最近优先 + 配对链（tool/assistant(tool_calls)）无条件保留 + 极小预算仍保底最新一条 +
  `maxMessages:0` = 关闭条数裁剪（仅按 token）；未超限返回原数组引用（零拷贝）；默认 30 条
  行为与原 trimContext 逐条等价（原 30 行逻辑整体替换为委托，调用点/循环结构不动）
- 🧩 **server 协议透传（src/server.ts + cli/index.ts）**：chat 请求带 `maxContextMessages` /
  `maxContextTokens`（非负整数/正整数校验，非法回 error 不触发生成；变化自动重建 Agent 立即生效，
  与 model/采样参数同机制）；`flare server --max-context-messages <n> / --max-context-tokens <n>`
  设置 server 级默认（chat 未指定时应用，请求优先）；`HostServerOptions` 对应默认字段
- 📊 **server 协议 `session_usage`（src/server.ts + memory/store.ts）**：单个会话 token 用量查询
  （`MemoryStore.getSessionUsage(sessionId)` 按 session_id 过滤 usage_log，返回 prompt/completion/
  total + callCount；无记录全 0 幂等）——宿主面板"本会话用量/成本"数据源（区别于 get_usage 全局汇总）
- 🖥️ **CLI `/usage` 增强（src/cli/index.ts）**：显示本会话用量行（`getSessionUsage` 按会话过滤：
  tokens + 调用次数）；`handleSlashCommand` 新增可选 `sessionId` 参数（缺省不显示，向后兼容）
- 📚 docs/context-observability.md 自动裁剪章节 + docs/host-protocol.md chat 参数表/§9.1 + README Changelog + 版本号 0.6.17
- 🧪 新增 27 项测试：trimContextMessages 纯函数 11（空/零拷贝/默认 30 条/maxMessages 可配/0 关闭条数/
  token 预算/极小预算保底/system 保底/token+条数取紧/配对保护/tail tool 连带配对）+ Agent 集成 5
  （默认零回归 30 条/maxContextMessages 生效/0 不裁/预算裁剪/极小预算保底最新输入）+ server e2e 6
  （默认值不破坏启动/不带参数应用默认/非法 maxContextMessages·负数·非法 maxContextTokens·0/合法透传
  流程完整）+ session_usage 2（store 按会话过滤+无记录幂等 / 协议响应结构+缺省 default）+ CLI /usage 3
  （无记录提示/带 sessionId 显示本会话行+按会话过滤/缺省不显示）；共 **496/496 全绿**（469 + 27）
- EN: Context auto-trim — `AgentConfig.maxContextMessages` / `maxContextTokens` drive the iteration-time
  `trimContext()`; new pure `trimContextMessages()` (system kept + newest-first + tool_calls pairing
  protection + tiny-budget keeps latest input, zero-copy when under limit). Chat protocol passes
  `maxContextMessages` / `maxContextTokens` through, `flare server` gains the matching defaults, a new
  `session_usage` request reports per-session token usage, and CLI `/usage` shows the current session's
  line. 496/496 tests green.

#### v0.6.16 (2026-08-10) — MCP progress + cancelled 通知协议闭环 / MCP progress & cancellation notifications (notifications/progress + notifications/cancelled)
- 🧩 **MCP progress 通知协议（src/mcp/server.ts + client.ts + http-client.ts + types.ts）**：服务器处理
  **长请求**（耗时工具调用）期间推送进度——`MCPServer.notifyProgress(progress?, total?, message?)` 发
  `notifications/progress`（无 id，客户端无需响应）；关联方式：客户端在请求 `_meta.progressToken`
  指定令牌（`callTool(name, args?, options?)` 第三参，向后兼容），服务器推送时原样回传
- 🧩 **服务器侧活动令牌机制**：请求带 `_meta.progressToken` → 处理期间记录为活动令牌，`notifyProgress`
  用它推送（串行队列保证同一时刻只有一个活动请求，令牌不串）；无活动令牌 / 已关闭 / 写失败 → 静默忽略
- 🧩 **客户端侧**：`MCPClient` 新增 `onProgress` 回调选项（收到 `notifications/progress` 转发
  `{ progressToken, progress?, total?, message? }`；未配置忽略不干扰后续请求）；`callTool` 带
  `progressToken` 时请求携带 `_meta`（不带则行为与旧版一致）
- 🧩 **MCP cancelled 通知协议**：`MCPClient.notifyCancelled(requestId, reason?)` / `MCPHttpClient.notifyCancelled`
  发 `notifications/cancelled`（超时/用户取消后礼貌告知服务器）；服务器收到 → 若 `requestId` 命中 pending
  （服务器→客户端请求如 `requestRoots` / `requestSample` 等待响应中）→ reject 并清理（不悬挂，含 reason）；
  未知/已完成请求 → 静默忽略（连接不断）
- 📌 **传输差异（文档记录）**：HTTP transport 共用 handleMessage 核心，请求带 `_meta.progressToken`
  可识别、`notifications/cancelled` 正常处理（202）；但无 SSE 推送通道，`notifyProgress` 客户端收不到
  （与 logging/resources 订阅一致）；stdio 串行队列下取消通知通常排在慢请求之后到达——cancelled 的
  主要价值是协议完整性与超时后的礼貌告知，对 pending 请求的取消真实生效
- 📚 docs/mcp.md progress + cancelled 协议章节 + README Changelog + 版本号 0.6.16
- 🧪 新增 15 项测试：MCPServer 7（带 token 推送结构含无 id / 无 token 静默 / 请求完成清除 / 已关闭静默 /
  cancelled 取消 pending reject / 未知 requestId 静默后续正常 + **真实互通 e2e**——真实 MCPServer 子进程
  callTool 带 progressToken ↔ 工具执行中 notifyProgress 3 次 → 客户端 onProgress 收到全部进度）+
  MCPClient 5（onProgress 转发 progress-notify 模式 / 无回调忽略 / 不带 options 无 _meta / notifyCancelled
  发送含 reason + 不带 reason / close 后静默）+ MCPHttpClient 3（callTool 透传 progressToken / notifyCancelled
  202 / close 后静默）；共 469/469；零 agent.ts 改动
- EN: MCP progress notifications — `MCPServer.notifyProgress()` pushes `notifications/progress` while handling a
  request carrying `_meta.progressToken`; `MCPClient` gains `onProgress` and `callTool(name, args, { progressToken })`
  (HTTP client passes the token through but can't receive pushes — no SSE). Cancellation — `notifyCancelled(requestId,
  reason?)` sends `notifications/cancelled`; the server rejects matching pending requests (roots/sampling) instead of
  hanging, silently ignoring unknown ids. 469/469 tests, zero agent.ts changes.

#### v0.6.15 (2026-08-10) — MCP resources 订阅闭环：subscribe/unsubscribe + 资源更新通知 / MCP resource subscriptions (resources/subscribe + notifications/resources/updated)
- 🧩 **MCP resources 订阅协议（src/mcp/server.ts + client.ts + http-client.ts）**：客户端订阅资源后，
  服务器资源变化时推送更新通知——resources 闭环的最后一块（v0.6.1 暴露 + v0.6.6 消费 + 本轮订阅）
- 🧩 **服务器侧**：`MCPServer` 新增 `resources/subscribe` / `resources/unsubscribe`（未知/缺 uri → `-32602`，
  重复订阅幂等、未订阅退订幂等）+ `notifyResourceUpdated(uri)` 推送 `notifications/resources/updated`
  （**仅向已订阅该 uri 的客户端推送**；未订阅/未知资源/已关闭/写失败 → 静默不抛错）；
  capabilities.resources 升级声明 `{ subscribe: true }`（此前 `{}`，客户端可据此探测订阅能力）
- 🧩 **客户端侧**：`MCPClient` 新增 `subscribeResource(uri)` / `unsubscribeResource(uri)` +
  `onResourceUpdated` 回调选项（收到 `notifications/resources/updated` 自动转发 uri；未配置忽略不干扰后续请求）；
  handleNotification 通知分流扩展（message 日志 / resources/updated 更新互不干扰）
- 📌 **传输差异（文档记录）**：HTTP transport（startMcpHttpServer）共用 handleMessage 核心，subscribe/unsubscribe
  一请求一响应正常；但无 SSE 长连接，服务器 `notifyResourceUpdated` 推送客户端收不到（与 roots/logging 一致）——
  MCPHttpClient 同样可订阅但收不到更新通知，文档如实记录
- 📚 docs/mcp.md resources 订阅章节 + README Changelog + 版本号 0.6.15
- 🧪 新增 15 项测试：MCPServer 9（subscribe 成功+记录/未知 uri -32602/缺 uri+重复幂等/unsubscribe 成功+幂等/
  unsubscribe 未知 -32602/notify 已订阅推送含无 id/未订阅+未知不推送/已关闭静默 + **真实互通 e2e**——真实 MCPServer
  子进程 subscribe → bump 工具触发 notifyResourceUpdated → 客户端 onResourceUpdated 收到、unsubscribe 后不再收到）+
  MCPClient 5（subscribe/unsubscribe 请求/未知 uri reject/onResourceUpdated 转发 res-update 模式/无回调忽略不影响/
  close 后 reject）+ MCPHttpClient 1（HTTP subscribe/unsubscribe + 服务器记录 + 传输差异不抛错）；共 454/454；零 agent.ts 改动
- EN: MCP resource subscriptions — `MCPServer` handles `resources/subscribe` / `resources/unsubscribe`
  (unknown uri → -32602, idempotent) and pushes `notifications/resources/updated` via `notifyResourceUpdated(uri)`
  only to subscribed clients (silent otherwise); `MCPClient` gains `subscribeResource` / `unsubscribeResource` and
  an `onResourceUpdated` callback (HTTP client subscribes but can't receive pushes — no SSE); capabilities.resources
  now advertises `{ subscribe: true }`; 454/454 tests, zero agent.ts changes.

#### v0.6.14 (2026-08-10) — MCP sampling 协议闭环：服务器→客户端请求 LLM 采样 / MCP sampling (server-initiated LLM sampling via client)
- 🧩 **MCP sampling 协议（src/mcp/types.ts + client.ts + server.ts）**：MCP sampling 让服务器（自身无模型）
  请求**客户端（宿主应用）代为调用 LLM** 生成内容——方向与 roots 一致（服务器→客户端请求），
  复用 v0.6.12 建立的主动请求通道
- 🧩 **服务器侧**：`MCPServer.requestSample(request, timeoutMs?)` 发 `sampling/createMessage` 请求——
  参数含 `messages`（必填，至少一条）/ `systemPrompt` / `temperature` / `maxTokens`（必填）/
  `stopSequences` / `modelPreferences`（hints + cost/speed/intelligence 优先级）/ `includeContext` / `metadata`；
  等待客户端响应（带超时，默认 15s，`requestTimeoutMs` 可配）；客户端回 error / 超时 / 已关闭 → reject（不悬挂）；
  响应缺 `content.text` → reject（采样结果必须有内容，与 roots 容错 `[]` 不同）；请求缺 messages → 立即 reject
- 🧩 **客户端侧**：`MCPClient` 新增 `sampling` 回调选项——配置后 `initialize` 声明 `capabilities.sampling`
  （未配置不声明，缺省兼容）；服务器发 `sampling/createMessage` 请求 → 回调自动执行并回传结果（支持异步）；
  回调抛错 → 回 `-32603`（客户端不崩）；未配置回调却收到请求 → 回 `-32601`（协议错误，连接不断）
- 📌 **传输差异（文档记录）**：HTTP transport（startMcpHttpServer）一请求一响应、无服务器→客户端通道，
  不提供 `requestSample`（stdio 专属）；MCPHttpClient 无 SSE 长连接也不声明 sampling 能力——与 roots 一致
- 🛡️ **安全**：sampling 是客户端主动授权能力——只有配置了 `sampling` 回调的客户端才会响应，
  服务器无法强制客户端调用模型
- 📚 docs/mcp.md sampling 协议章节 + README Changelog + 版本号 0.6.14
- 🧪 新增 13 项测试：MCPServer 7（发起+解析响应含 model/stopReason / 客户端 error reject / 缺 content reject /
  缺 messages 立即 reject / 超时 reject 后服务器仍可用 / 已关闭 reject / 真实互通 e2e——真实 MCPServer 子进程
  requestSample ↔ MCPClient sampling 回调，含未配置回调回 -32601 e2e）+ MCPClient 6（配置回调声明能力+闭环 /
  未配置不声明 / 无回调回 -32601 连接不断 / 回调抛错 -32603 / 异步回调 / 请求参数完整透传）；共 439/439；零 agent.ts 改动
- 🔬 冒烟实测：真实 stdio 子进程闭环——客户端带 sampling 回调连接真实 MCPServer，requestSample 拿到
  确定性采样文本（含 model 回显）；不带回调的客户端服务器收到 -32601 不悬挂
- EN: MCP sampling round-trip — `MCPServer.requestSample()` sends `sampling/createMessage` to ask the
  **client (host app)** to generate content via its own LLM (timeout-safe, rejects on missing content),
  and `MCPClient` gains a `sampling` callback that declares `capabilities.sampling` and auto-answers
  server-initiated sampling requests (async supported, errors → -32603, unconfigured → -32601);
  stdio-only like roots; 439/439 tests, zero agent.ts changes.

#### v0.6.13 (2026-08-10) — MCP logging 协议：日志级别设置 + 服务器日志推送 / MCP logging (logging/setLevel + notifications/message)
- 🧩 **MCP logging 协议特性（src/mcp/server.ts + client.ts + http-client.ts）**：`MCPServer` 缺省声明
  `capabilities.logging`（`logging:false` 可关闭，不声明）——客户端 `logging/setLevel` 设置日志级别阈值
  （8 级 debug→emergency，非法级别 `-32602` 含合法值提示）；`sendLog(level, data, logger?)` 推送
  `notifications/message` 通知（低于阈值丢弃；未设置默认 info；logging 关闭 / 服务器已关闭静默忽略）
- 🧩 **客户端消费**：`MCPClient` 新增 `onLog` 回调选项（接收服务器日志通知，无回调忽略不干扰后续请求）+
  `setLogLevel(level)`；通知分发与响应/服务器请求分流（无 id + method → 通知通道）；`MCPHttpClient.setLogLevel`
  对称支持（HTTP 一请求一响应：可设置但无 SSE 长连接，收不到日志推送——文档如实记录）；
  `McpLogLevel`/`McpLogMessage`/`MCP_LOG_LEVELS`/`MCP_DEFAULT_LOG_LEVEL` 库导出
- 📚 docs/mcp.md logging 协议章节 + README Changelog + 版本号 0.6.13
- 🧪 新增 13 项测试：MCPServer 8（缺省声明 / logging:false 不声明 / setLevel 合法+阈值生效 / 非法级别 -32602 /
  默认 info 阈值 / logging:false 丢弃 / 已关闭不抛错 / logging 真实互通 e2e——真实子进程 sendLog → onLog 收到
  info+warning+error 且 debug 被过滤）+ MCPClient 4（setLogLevel 请求 / close 后 reject / onLog 转发结构 /
  无 onLog 忽略不干扰）+ MCPHttpClient 1（capabilities 声明 + setLogLevel 成功）；共 426/426；零 agent.ts 改动
- 🔬 冒烟实测：真实 stdio 子进程闭环——capabilities.logging `{}`、setLogLevel('info') 后收到
  info/warning/error（debug 被过滤，含 logger 标注）；HTTP 服务器 capabilities.logging + setLogLevel 成功
- EN: MCP logging support — `MCPServer` declares `capabilities.logging`, honors `logging/setLevel`
  (8-level threshold, invalid level → -32602) and pushes `notifications/message` via `sendLog()`
  (below-threshold dropped, default info); `MCPClient` gains `onLog` + `setLogLevel()` (notifications
  routed separately from responses/server-requests), HTTP client symmetric `setLogLevel` (set-only,
  no push channel); 426/426 tests.

#### v0.6.12 (2026-08-10) — MCP roots 协议闭环：客户端暴露根目录 + 服务器主动请求 / MCP roots round-trip (client exposure + server-initiated request)
- 🧩 **MCP roots 协议（src/mcp/types.ts + client.ts + server.ts）**：roots 是客户端暴露给服务器的命名空间/
  根目录（方向与 resources 相反）——`MCPClient` 新增 `roots` 选项：配置后 `initialize` 声明
  `capabilities.roots`（`{ listChanged: true }`；未配置不声明，缺省兼容）+ 服务器主动发 `roots/list` 请求时
  **自动响应**注入的 roots（未知方法回 `-32601`，连接不断）+ `notifyRootsChanged()` 发
  `notifications/roots/list_changed` 通知（roots 变化告知服务器）
- 🧩 **MCPServer 新增主动请求能力 `requestRoots(timeoutMs?)`**：v0.6.12 起服务器可向客户端发请求
  （为未来 sampling 等服务器→客户端请求打基础）——发 `roots/list` 等待客户端响应（带超时，默认 15s，
  `MCPServerOptions.requestTimeoutMs` 可配）；客户端回 error / 超时 / 服务器已关闭 → reject（不悬挂）；
  响应缺 roots 或非数组 → 容错返回 `[]`（与客户端宽松解析一致）；`McpRoot`/`McpRootsResult` 类型库导出
- 📌 **传输差异（文档记录）**：HTTP transport（startMcpHttpServer）是"一请求一响应"同步子集，无服务器→
  客户端通道，故不提供 `requestRoots`（stdio 专属）；MCPHttpClient 无 SSE 长连接也不声明 roots 能力
- 📚 docs/mcp.md roots 协议章节 + README Changelog + 版本号 0.6.12
- 🧪 新增 11 项测试：MCPServer requestRoots 5（发起+解析客户端响应 / 客户端 error reject / 响应非数组容错
  [] / 超时 reject 后服务器仍可用 / 已关闭 reject）+ roots 真实互通 e2e（真实 MCPServer 子进程 requestRoots ↔
  真实 MCPClient 带 roots 注入）+ MCPClient 5（配置 roots 声明+getter / 未配置不声明 / 服务器 roots/list
  请求自动响应 / notifyRootsChanged 通知 / close 后不抛错）；共 412/412；零 agent.ts 改动
- EN: MCP roots round-trip — `MCPClient` exposes configured roots (declares `capabilities.roots`, answers
  server-initiated `roots/list`, sends `notifications/roots/list_changed` via `notifyRootsChanged()`), and
  `MCPServer` gains its first server→client request `requestRoots()` (timeout-safe, tolerant parsing),
  verified end-to-end over real stdio subprocesses; stdio-only (HTTP transport has no server→client channel).

#### v0.6.11 (2026-08-10) — MCP 参数补全 completion/complete + server 协议 tools 工具清单 / MCP completion capability + tool listing over the host protocol
- 🧩 **MCP `completion/complete` 协议特性（src/mcp/server.ts + client.ts + http-client.ts）**：prompt 新增可选
  `complete(argumentName, value)` 回调——客户端交互式输入参数时（如宿主面板提示词表单）向服务器请求候选值；
  `initialize` 在任一 prompt 有回调（或注入了资源）时声明 `capabilities.completions`（缺省不声明，兼容探测）
- 🧩 **`completion/complete` 服务器端**：`ref/prompt` 按回调返回候选 / `ref/resource` 按已暴露资源 uri 前缀建议 /
  无回调的 prompt 返回空候选（不报错）；未知 prompt / 缺 ref → `-32602`，回调抛错 → `-32603`（服务器不崩）；
  响应 `{ completion: { values, total, hasMore } }`——stdio（MCPServer）与 HTTP（startMcpHttpServer）共用同一核心
- 🧩 **客户端消费**：`MCPClient.completePrompt` / `MCPHttpClient.completePrompt(name, argumentName, value)` →
  `{ values }`（stdio/HTTP 同构，与服务器暴露对称闭环）；`McpCompletionResult` 类型库导出
- 🎛️ **server 协议新增 `tools` 请求（src/server.ts）**：宿主面板查询当前会话 Agent 可用工具清单（只读、不触发生成）——
  每项 `name`/`description`/`parameters` + `confirmed`（是否经确认门，命中 confirmTools 名单）+ `source`
  （host 宿主代理 / profile 专家配置 / mcp 外部 MCP / builtin 内置回退）；`confirmTools` 确认名单配置回显；
  纯函数 `describeTools` 库导出（宿主可复用）；chat 带宿主工具后 tools 查询反映该会话真实工具集
- 🎛️ **CLI 交互 `/tools` 命令（src/cli/index.ts）**：查看当前 Agent 可用工具清单——内置 + MCP 工具，
  每项名称/来源（内置/MCP）+ 描述 + `⚠需确认` 标注（写回类工具执行前弹窗确认，与 /allow 呼应）——
  复用 `describeTools` 纯函数；`handleSlashCommand` 新增可选 `toolsInfo` 回调（向后兼容，未提供提示不可用）
- 📚 docs/mcp.md 参数补全章节 + docs/host-protocol.md §22 + 请求类型列表 + 响应表 + README CLI 表/Changelog + 版本号 0.6.11
- 🧪 新增 17 项测试：completion/complete 服务器端 5（ref/prompt 候选 / 异步+空匹配 / ref/resource uri 前缀 /
  无回调空候选+未知 prompt+缺 ref / capabilities 声明含资源不声明）+ stdio e2e 消费闭环 + HTTP e2e 消费闭环 +
  describeTools 单测 5（元数据+确认标注 / 来源判定 / host 优先 / 空名单关闭 / 缺省字段）+ server e2e 3（默认内置
  清单+确认标注 / 指定 sessionId / chat 带宿主工具后 host 来源）+ /tools 命令 4（无回调提示 / 列表+标注 / 空清单 /
  help 含说明）；共 401/401；零 agent.ts 改动
- EN: MCP prompts gain the standard `completion/complete` capability (optional `complete` callback per prompt,
  `ref/resource` URI-prefix suggestions, `capabilities.completions` declared when available) consumed by
  `completePrompt()` on both stdio and HTTP clients; the host protocol gains `tools` (read-only listing of the
  session's tool set with confirmation-gate annotation and source host/profile/mcp/builtin, backed by exported
  `describeTools`); interactive CLI gains `/tools` (current tool list with confirm markers); 401/401 tests.

#### v0.6.10 (2026-08-10) — CLI /allow 增强 + server confirm_allow：确认门显式放行 / Explicit confirmation-gate grants (CLI + host protocol)
- 🎛️ **`/allow add <工具名> [session|always]`（src/cli/index.ts）**：显式放行确认工具，无需等 AI 触发确认弹窗——缺省
  `session` 本会话内不再确认；`always` 跨会话持久化（写入全局库 settings 表，新会话/新实例也放行）；非法模式/缺参/
  无 allow 回调（旧 hooks）各有清晰提示，未知子命令仍回用法
- 🔍 **`/allow` 列出带范围标注（v0.6.10）**：`（本会话）` 会话级 / `（跨会话持久化）` always / `（会话+持久化）` 两者——
  `AllowGateHooks` 新增可选 `allow(name, mode)` / `listDetailed()`（未提供则回退旧 `list()`，向后兼容）；
  注入点用 `gate.allowSession/allowAlways` + `listAllowed/listAlwaysAllowed` 实现
- 🎛️ **server 协议新增 `confirm_allow`（src/server.ts）**：宿主面板显式放行确认工具（`{tool, mode?}`，mode 缺省
  `session` / `always` 跨会话持久化；缺 tool / 非法 mode 回 error 含提示）——与 `confirm_status`（查询）/
  `confirm_revoke`（撤销）组成确认门管理闭环；`mode=always` 当前会话内也放行（allowedTools 可见），持久化部分
  由 alwaysAllowed 体现
- 🎛️ **CLI `flare mcp resources <服务器> [--read <uri>]`（src/cli/index.ts）**：查看 MCP 服务器暴露的资源（复用
  `listResources`/`readResource`，stdio/HTTP 均可，`--url`/`--config`/`--timeout` 同 mcp call）——与 mcp call/status
  组成完整命令组；未暴露资源友好提示、未知 uri 协议错误退出码 1
- 🎛️ **CLI `flare mcp prompts <服务器> [--get <名称>]`（src/cli/index.ts）**：查看/渲染 MCP 服务器暴露的提示词（复用
  `listPrompts`/`getPrompt`，`--get` 渲染 + `--args` JSON 可选；未知提示词协议错误退出码 1）——mcp 命令组完整闭环
  （call/status/resources/prompts）
- 📚 docs/confirmation.md CLI 章节 + docs/host-protocol.md §21 + 确认门管理章节 + 响应表 + docs/mcp.md CLI 章节 +
  README CLI 表/Changelog + 版本号 0.6.10
- 🧪 新增 20 项测试（tests/cli-confirm.test.ts 9 + tests/server.test.ts 4 + tests/mcp-cli-call.test.ts 7）：/allow 范围标注
  （会话级/持久化/两者+新会话持久化）/ 无 listDetailed 回退旧行为 / add 缺省 session 不写持久化 / add session / add always
  持久化+跨实例生效 / add 缺参 / 非法模式 / 无 allow 回调 / add 后 revoke 双清 + confirm_allow 缺 tool error / 非法 mode
  error / 缺省 mode session 放行 status 可见 / mode=always 持久化+revoke 撤销 + mcp resources 列表元数据 / --read 读取 /
  未知 uri 退出码 1 / 未配置服务器退出码 1 + mcp prompts 列表元数据 / --get 渲染 / 未知提示词退出码 1；共 384/384；
  零 agent.ts 改动
- EN: Interactive CLI `/allow add <tool> [session|always]` explicitly grants a confirm tool without waiting for a prompt
  (session-scoped by default, `always` persists to the global store); `/allow` listing annotates scope (session/persisted/
  both) via new optional AllowGateHooks.allow/listDetailed with backward-compatible fallback; host protocol gains
  `confirm_allow` completing the gate-management trio with confirm_status/confirm_revoke; new `flare mcp resources` /
  `flare mcp prompts` CLIs list/read/renders server resources and prompts over stdio or HTTP; 384/384 tests.

#### v0.6.9 (2026-08-10) — server 协议 models 接口：可切换模型查询 / Model availability over the host protocol
- 🎛️ **server 协议新增 `models` 请求（src/server.ts）**：宿主面板查询可切换模型（只读、不触发生成、不创建会话）——
  `configured.main` 当前主模型端点信息（`model` / `baseURL` 解析后端点 / `hasApiKey` 密钥是否配置 /
  `provider` 推断 ollama|deepseek|openai|other）、`configured.vision` 视觉模型（`VISION_MODEL` 配置，未配置 null）、
  `ollama` 本地 Ollama 已拉取模型列表（复用 `listOllamaModels`）——宿主"可切换模型"下拉的数据源
- 🔍 **纯逻辑可测（src/server.ts 导出）**：`detectProvider(model)` 模型名 → provider 类型推断（与
  `resolveProviderOptions` 自动检测规则一致）；`collectModelInfo(fetchImpl?)` 收集 configured + ollama（fetch 可注入
  mock）——库导出
- 🛡️ **降级安全**：Ollama 未启动/不可达 → `ollama.ok:false` + `error`（服务不崩、其余字段照常）；主模型为 Claude 系列
  （不支持）→ `configured.main.error` 明确报错不抛异常；全程零 agent.ts 改动
- 📚 docs/host-protocol.md §20 + 响应表 + 请求类型列表 + README Changelog + 版本号 0.6.9
- 🧪 新增 10 项测试（tests/server-models.test.ts）：detectProvider 4（ollama 冒号命名/deepseek/gpt·o1·o3/other）+
  collectModelInfo 5（Ollama 可达解析/视觉模型配置/不可达 ok:false/HTTP 500/Claude 主模型 error 不抛）+ server e2e 1
  （真实子进程 models 响应结构完整、Ollama 不可达不崩），共 362/362；零 agent.ts 改动
- 🎛️ **CLI 交互 `/model list`（src/cli/index.ts）**：列出本地 Ollama 可用模型（复用 `listOllamaModels`，含模型大小、
  当前主模型标记）+ 显示当前主模型；Ollama 不可达友好提示不崩；`/help` 与裸 `/model` 帮助同步说明
- 🧪 随 P21 再增 2 项测试（tests/model-command.test.ts：/model list 输出合法且不写 main_model / list 不当模型名），
  共 364/364；零 agent.ts 改动
- EN: New host-protocol request `models` returns the configured main/vision model endpoints (model, resolved baseURL,
  hasApiKey, provider) plus the local Ollama model list — read-only, degrades gracefully when Ollama is unreachable;
  detectProvider/collectModelInfo exported and unit-tested; interactive `/model list` shows local Ollama models;
  364/364 tests.

#### v0.6.8 (2026-08-10) — server 协议确认门管理：confirm_status / confirm_revoke / Confirmation-gate management over the host protocol
- 🎛️ **server 协议新增 `confirm_status` / `confirm_revoke`（src/server.ts）**：宿主随时查询/撤销确认门放行——
  `confirm_status {sessionId}` 返回确认名单配置（`confirmTools`）+ 放行名单（`allowedTools` 完整合并 /
  `sessionAllowed` 会话级 / `alwaysAllowed` 持久化），只读不创建会话；`confirm_revoke {tool}` 撤销该工具放行
  （会话级 + always 持久化同步清除，恢复每次确认）/ `{resetSession:true}` 清空会话级放行（不影响 always）；
  参数缺失回 error（含用法提示）、无放行记录幂等 ok
- 🔍 **`ConfirmationGate` 新增名单查询方法（src/core/confirm.ts）**：`listAlwaysAllowed(candidates)`（KV store 无法
  枚举 key，按候选名单逐个查询持久化 always）/ `listAllAllowed(candidates)`（会话级 + always 合并去重，含非候选的
  显式会话级放行）——库导出（类方法随类导出）
- 📚 docs/host-protocol.md §18/§19 + 确认门管理章节 + 响应表 + README Changelog + 版本号 0.6.8
- 🧪 新增 12 项测试（ConfirmationGate 名单查询 7：无 store always 退化/持久化命中/候选过滤/合并去重/非候选会话级并入/
  revoke 同步清除/空候选 + server 协议 e2e 5：confirm_status 默认配置+空名单/指定 sessionId/confirm_revoke 缺参 error/
  幂等 ok+随后 status 仍空/resetSession），共 352/352；零 agent.ts 改动
- EN: New host-protocol requests `confirm_status` (query confirmation-gate state: confirmTools + session/always allow
  lists, read-only) and `confirm_revoke` (revoke one tool, or resetSession to clear session-level grants, idempotent);
  ConfirmationGate gains listAlwaysAllowed/listAllAllowed; 352/352 tests.

#### v0.6.7 (2026-08-09) — CLI 交互模式接入 ConfirmationGate / ConfirmationGate wired into interactive CLI
- 🔐 **交互模式确认门（src/cli/index.ts）**：AI 调用写回类工具（`memory_save`）执行前**终端内确认弹窗**——`[y] 允许一次 / [s] 本次会话允许 / [a] 总是允许 / [n] 拒绝（默认）`；`allow_session` 会话记忆、`always` 持久化到全局库 settings 表（跨会话记住）；确认期间暂停火焰动画 + 恢复终端回显（readline 读一行），决策后反馈一行结果并继续 Agent 流；`ConfirmationGate` 超时安全 deny 继承
- 🛡️ **防绕过**：交互模式始终显式传工具集（内置 + MCP）再经 `wrapConfirmTools` 包装——避免 Agent 回退内置工具绕过确认门（与 server 端 v0.6.1 同机制）；默认名单 `CLI_CONFIRM_TOOLS = ['memory_save']`（与 server `DEFAULT_CONFIRM_TOOLS` 一致）
- 🎛️ **`/allow` 命令**：查看已放行的确认工具（含 always 持久化）/ `/allow revoke <工具名>` 撤销放行（恢复每次确认）；`handleSlashCommand` 新增可选 `allowGate` hooks（向后兼容）
- 🔧 **可测性**：新增纯函数 `parseConfirmAnswer`（输入→决策，未知/空安全 deny）/ `formatConfirmPrompt`（确认 UI 文案，参数 JSON 截断 120 字符）/ `terminalConfirmer`（可注入 ask/onPause/onResume/onFeedback 的终端确认流程）——库导出
- 📚 README CLI 表 + Changelog + docs/confirmation.md CLI 交互章节 + 版本号 0.6.7
- 🧪 新增 23 项测试（parseConfirmAnswer 4：y/s/a 全别名 + 空/未知 deny / formatConfirmPrompt 3：摘要/超长截断/无参数 / terminalConfirmer 4：决策流转/空 deny/ask 抛错安全 deny/always 反馈 / Gate×terminal 集成 5：allow_once 每次确认/deny 拒绝/allow_session 会话记忆/always 跨实例持久化+revoke/默认名单 / /allow 命令 7：无 hooks/列出/空名单/revoke 成功/revoke 未放行/未知子命令/help），共 340/340；零 agent.ts 改动
- 🔥 **冒烟实测**：本机 Ollama qwen2.5:7b 真实触发——AI 调 memory_save → 确认弹窗（含参数摘要）→ 输入 y →「已允许本次执行」→ 工具真实写入 → AI 回复，事件链完整
- EN: The interactive CLI now routes write-back tools (memory_save) through ConfirmationGate with an in-terminal prompt (allow once/session/always/deny); allow_session is per-session, always persists to the global store's settings table; new /allow command lists and revokes granted tools; 340/340 tests.

#### v0.6.6 (2026-08-09) — MCP HTTP 接入 McpManager + CLI `flare mcp call` + resources 客户端消费 / MCP HTTP wired into McpManager + `flare mcp call` + MCP resources client
- 🔌 **McpManager 支持 HTTP transport 服务器（src/mcp/manager.ts + src/mcp/types.ts）**：`McpServerConfig` 新增 `url`（HTTP 端点）与 `timeoutMs`（可选）——配了 `url` 走 `MCPHttpClient` 直连，否则按 `command` stdio spawn；`McpManager({ httpTimeoutMs })` 全局超时可配；`createMcpTools` 参数放宽为 `McpToolClient` 接口（stdio/HTTP 传输无关）；配置同时有 url 与 command 时 url 优先；既无 url 也无 command 抛清晰错误；CLI 交互 `/mcp`、`flare server --mcp` 自动继承
- 🎯 **CLI `flare mcp call <服务器> <工具> [JSON参数]` + `flare mcp status`（src/cli/index.ts）**：一键调用 MCP 服务器工具——服务器名查 `~/.flare/mcp.json` 配置（url → HTTP / command → stdio），`--url` 直连 HTTP 端点跳过配置，`--config <path>` 指定配置，`--timeout <ms>` 调超时；参数为 JSON 对象（缺省 `{}`）；工具级失败/协议错误/未配置服务器 → 退出码 1 + 明确错误信息；`mcp status` 列出配置服务器（名称 + 传输类型 + 端点/命令）
- 🌐 **MCP resources 客户端消费（src/mcp/client.ts + src/mcp/http-client.ts）**：stdio 与 HTTP 客户端新增 `listResources()`（元数据 uri/name/description/mimeType）/ `readResource(uri)`（内容列表，未知 uri 协议错误 reject）——与 MCPServer resources 暴露（v0.6.1）对称闭环；`McpResourceInfo` 类型库导出；mock fixture 支持 resources
- 📚 docs/mcp.md McpManager HTTP 接入 + CLI mcp call/status 章节 + resources 客户端消费 + README CLI 表/Changelog + 版本号 0.6.6
- 🧪 新增 18 项测试（McpManager×HTTP 5：配置 url 连接桥接+真实执行/HTTP 不可达错误记录/无 url 无 command 报错/disconnect/url 优先 + CLI mcp call/status e2e 9：--url 直连/配置 url/配置 command stdio/无参数兜底/未配置服务器/非法 JSON/未知工具/status 列表/status 空配置 + resources 消费 4：stdio 元数据/stdio 读取/stdio 未知 uri/HTTP 闭环），共 317/317；零 agent.ts 改动
- EN: McpServerConfig gains `url` so McpManager connects to HTTP-transport servers via MCPHttpClient (stdio still via command); new `flare mcp call <server> <tool> [json]` CLI to invoke MCP tools over either transport, plus `flare mcp status`; MCP clients now consume resources (listResources/readResource) over both transports; 317/317 tests.

#### v0.6.5 (2026-08-09) — server 默认采样参数 / Server default sampling params (--max-tokens/--temperature)
- 🎛️ **`flare server --max-tokens <n> --temperature <n>`（src/cli/index.ts + src/server.ts）**：server 级默认采样参数——chat 请求未指定 `maxTokens`/`temperature` 时应用（CLI 一次配置，宿主免每请求传参）；请求带参数则请求优先（可覆盖默认）；默认值非法回 error 不触发生成；`HostServerOptions.defaultMaxTokens/defaultTemperature` 库可用
- 📚 README CLI 表 + Changelog + 版本号 0.6.5
- 🧪 新增 4 项测试（spawn 带默认参数的 server e2e：version 协商正常/chat 不带参数应用默认流程完整/非法 maxTokens 请求校验优先/合法请求参数覆盖默认），共 299/299；零 agent.ts 改动
- EN: flare server accepts --max-tokens/--temperature as server-level sampling defaults applied when a chat request omits them (per-request values still win); HostServerOptions extended; 299/299 tests.

#### v0.6.4 (2026-08-09) — context_status 预算建议 + MCP HTTP 客户端 / Budget-trim suggestion + MCP HTTP client
- 🧮 **server 协议 `context_status` 预算建议（src/server.ts）**：请求可选带 `budgetTokens`（正整数）与 `reserveForOutput`（非负）——响应附 `suggestion` 字段（`keepIndexes` 建议保留的消息索引、`droppedCount`、`estimatedKeptTokens`/`estimatedDroppedTokens`）；复用 `suggestTrim` 纯函数（system 保底 + 最近优先），宿主按索引裁剪后回 `set_context` 即可生效（零 agent.ts 改动）；非法值回 error 不触发生成
- 🌐 **MCPHttpClient（src/mcp/http-client.ts）**：HTTP transport 消费端——与 stdio `MCPClient` 接口完全一致（`initialize`/`listTools`/`callTool`/`listPrompts`/`getPrompt`/`ping`/`close`），零依赖 node:http 每请求独立 POST；`initialize` 后自动发 initialized 通知（202）；JSON-RPC error / 非 200 / 无响应体 → reject（含原因）；超时默认 15s；库导出 + docs/mcp.md HTTP 客户端章节（与 P11 服务器端对称闭环）
- 📚 docs/host-protocol.md §10.1 预算建议 + docs/mcp.md + README Changelog + 版本号 0.6.4
- 🧪 新增 13 项测试（server 协议 3：带预算返回 suggestion 结构/非法 budgetTokens 0·负·非整数·abc 回 error/非法 reserveForOutput 回 error + MCPHttpClient 10：握手/工具列表/执行成功与工具级失败/未知工具 -32602/prompts 消费闭环/ping/服务器关闭 reject/close 后拒绝/非法 URL/404 路径），共 295/295；零 agent.ts 改动
- EN: context_status now accepts budgetTokens/reserveForOutput and returns a trim suggestion (keepIndexes via suggestTrim) for hosts to self-manage context; new MCPHttpClient — HTTP-transport twin of the stdio MCPClient (same API, zero-dep POST /mcp); 295/295 tests.

#### v0.6.3 (2026-08-09) — chat 采样参数透传 / Sampling control passthrough (maxTokens + temperature)
- 🎛️ **server 协议 chat 新增 `maxTokens` / `temperature`（src/server.ts）**：宿主每请求可指定最大输出 token 数与采样温度——透传到 LLM 请求体（`max_tokens` / `temperature`）；非法值（maxTokens 非正整数、temperature 超出 0~2）直接回 error 不触发生成；同一会话采样参数变化自动重建 Agent（与切换 model 同机制，历史从记忆库恢复）
- 🔌 **`ProviderOptions` 扩展（src/core/llm.ts）**：`maxTokens` / `temperature` 可选字段，`OpenAIProvider.chat`/`chatStream` 请求体透传（仅显式传入时携带，缺省不传保持服务端默认）；库导出类型自动覆盖
- 📚 docs/host-protocol.md chat 请求参数表 + README Changelog + 版本号 0.6.3
- 🧪 新增 10 项测试（provider 请求体透传 5：chat/chatStream/缺省不传/temperature 0 不丢失 + server 协议 5：非法 maxTokens/temperature 回 error、合法值流程完整），共 272/272；零 agent.ts 改动
- EN: chat protocol now accepts maxTokens/temperature and passes them to the LLM request body (max_tokens/temperature) — invalid values error out before generation; ProviderOptions extended; 272/272 tests.
- 🌐 **MCP HTTP transport（src/mcp/http.ts）**：`startMcpHttpServer`——零依赖 node:http，`POST /mcp` 同步 JSON-RPC（与 stdio 同一 `MCPServer.handleMessage` 核心）；有 id 请求 → 200 + 响应、通知 → 202 空体、非法 JSON → 400 parse error、非 POST → 404；默认仅监听 127.0.0.1（安全默认）；CLI `flare mcp-server --http --port <port>` 一键起 HTTP 服务器；docs/mcp.md HTTP transport 章节
- 🧪 MCP HTTP transport 10 项测试（握手/工具列表/工具真实执行/未知工具 -32602/未知方法 -32601/非法 JSON/通知 202/404/并发响应不串扰/CLI --http e2e），共 282/282；零 agent.ts 改动
- EN: MCP HTTP transport — startMcpHttpServer (zero-dep node:http, POST /mcp synchronous JSON-RPC reusing the same MCPServer core as stdio); CLI flag --http; 282/282 tests.

#### v0.6.2 (2026-08-09) — MCP prompts 真实暴露 / Real MCP prompts (prompts/list + prompts/get)
- 📜 **MCPServer `prompts` 选项（src/mcp/server.ts）**：注入提示词模板（name/description/arguments/render 支持异步）——
  `prompts/list` 返回真实元数据（客户端探测清单）、`prompts/get` 按客户端 arguments 渲染消息序列
  `{ description?, messages: [{ role, content }] }`（未知 name -32602、render 抛错 -32603 服务器不崩）；
  注入后 initialize capabilities 声明 `prompts`（缺省不声明，v0.5.9 空列表兼容）
- 🤝 **MCPClient 消费 prompts（src/mcp/client.ts）**：`listPrompts()` 元数据 + `getPrompt(name, args?)` 渲染——
  与 MCPServer 对称闭环（未知 name 协议错误 reject）；`McpPrompt`/`McpPromptArgument`/`McpPromptMessage`/`McpPromptInfo`/
  `McpPromptResult` 类型库导出；docs/mcp.md 提示词暴露章节 + 客户端用法
- 🧪 新增 11 项测试（MCPServer 6：prompts/list 真实元数据 / prompts/get 参数渲染+description 透传 / 异步 render / 未知 name -32602 /
  render 抛错 -32603 不崩 / capabilities 声明与缺省 + MCPClient 5：listPrompts 元数据 / getPrompt 渲染 / 未知 name reject /
  **prompts 真实互通 e2e**（MCPClient↔MCPServer 子进程，含无 prompts 缺省兼容）），共 **262/262 全绿**，tsc 0 错误，零 agent.ts 改动
- EN: MCPServer now exposes real prompts — inject templates with declared arguments; `prompts/list` returns
  metadata and `prompts/get` renders messages (async render supported; unknown name -32602, render error -32603
  without crashing). MCPClient can consume prompts too (`listPrompts`/`getPrompt`), closing the loop.
  262/262 tests, zero agent.ts changes.

#### v0.6.1 (2026-08-09) — CLI/server 接入 ConfirmationGate：宿主弹窗确认流程 / Host-prompt confirmation flow (ConfirmationGate wired into server)
- 🚪 **server 协议 `confirm` 事件 + `confirm_result` 请求（src/server.ts）**：AI 调用需确认工具时，服务发
  `{"type":"confirm","sessionId","id","name","args"}` → 宿主弹窗让用户决策 → 宿主回
  `{"type":"confirm_result","id","decision"}`（`allow_once`/`allow_session`/`always`/`deny`/`alternative`）——
  写回类工具（默认 `memory_save`）经确认门：用户知情授权后才落库
- 🧠 **记忆化 + 持久化 + 超时全继承 ConfirmationGate**：`allow_session` 按会话记忆（跨模型重建保留）；`always` 持久化到
  记忆库 settings 表（`memoryStoreKv` 适配器，跨会话记住）；宿主未在时限内回 `confirm_result` 按安全默认 deny（超时标记）
- 🧩 **`wrapConfirmTools` 纯函数 + `DEFAULT_CONFIRM_TOOLS`**：名单过滤（命中包装/未命中原样/空名单关闭）；库导出
  （宿主可复用 gate + 名单）；`HostServerOptions.confirmTools` / `confirmTimeoutMs` 可配
- ⌨️ **CLI `flare server` 新参数**：`--confirm-tools <a,b,c>`（逗号分隔名单，空串关闭）`--confirm-timeout <ms>`
- 📦 **MCPServer resources 真实暴露（src/mcp/server.ts）**：`resources` 选项注入资源（uri/name/description/mimeType/read 支持异步）——
  `resources/list` 返回真实元数据、`resources/read` 返回内容（未知 uri -32602、read 抛错 -32603 服务器不崩）；
  注入后 initialize capabilities 声明 `resources`（缺省不声明，v0.5.9 空列表兼容）；`McpResource` 类型库导出
- 🧪 新增 18 项测试（wrapConfirmTools 名单过滤 5：含内置工具集防绕过回归 + Agent×确认门集成 4：allow_once/deny/allow_session 记忆化/超时 deny
  + e2e 协议校验 3：缺 id/非法 decision/未知 id 静默不崩 + MCP resources 6：真实列表/同步读/异步读/未知 uri/read 抛错/capabilities 声明），共 **251/251 全绿**，tsc 0 错误，零 agent.ts 改动
- EN: Server now wires ConfirmationGate — AI calls to write-back tools (memory_save by default) emit a `confirm` event;
  the host shows a prompt and replies `confirm_result` (allow_once/session/always/deny/alternative). Session memory,
  always-persistence (settings KV), and timeout-safety all inherited. `wrapConfirmTools`/`DEFAULT_CONFIRM_TOOLS` exported.
  MCPServer also exposes real resources (resources/list + resources/read, async read supported).
  251/251 tests, zero agent.ts changes.

#### v0.6.0 (2026-08-09) — 宿主会话/模型可观测性增强 / Host session & model observability
- **协议 `recent_sessions`（src/server.ts）**：会话列表 + 首条 user 消息预览（`preview`，最多 120 字符）——
  `{"type":"recent_sessions","limit":5}`，宿主会话面板展示"最近会话 + 预览"用；`limit` 默认 10 上限 50；复用
  `MemoryStore.getRecentSessions`（此前仅 CLI /sessions 使用）；`docs/host-protocol.md` 4.1 节同步
- **`flare models` 命令（src/cli/index.ts）**：查看可用模型——配置的主模型（settings 优先）/ 视觉模型（含解析端点）
  + 本地 Ollama 已拉取模型列表（`/api/tags`，大小/时间；Ollama 不可达/超时友好降级不报错）
- **库导出 `listOllamaModels` / `formatModelSize`（src/core/models.ts）**：宿主可查询本地可用模型（面板展示可切换项）；
  零依赖（Node 18+ 全局 fetch），`fetchImpl` 可注入（测试/宿主替换）
- 测试：221 基线 + 4（recent_sessions 协议/store）+ 7（models）= **232/232 全绿**，tsc 0 错误，零 agent.ts 改动

#### v0.5.9 (2026-08-09) — 上下文裁剪建议：suggestTrim 纯函数 / Context trim suggestion (suggestTrim)
- ✂️ **`suggestTrim(messages, budgetTokens, opts?)`（src/core/context.ts，纯函数）**：按 token 预算给出"保留哪些消息"的建议——**system 保底**（首条 role=system 始终保留，AI 需要系统提示）+ **最近优先**（从最新消息向前收集直到接近预算）+ **预算极小保底最新一条**（AI 必须能看到用户最新输入才能回复）+ `reserveForOutput`（为模型输出预留 tokens）+ `keepSystem:false` 可关；返回 `{ keep, droppedCount, estimatedKeptTokens, estimatedDroppedTokens }`
- 🧩 **宿主自管理上下文的地基**：Pulse/StorySpire 面板可自行按预算裁剪再发给引擎（不修改 Agent 内部状态，零 agent.ts 改动）；库导出 `suggestTrim` + 类型
- 📚 docs/context-observability.md 新增"按预算裁剪上下文"章节（宿主用法示例）+ README Changelog + 版本号 0.5.9
- 🧪 新增 9 项测试（空输入/预算充足全保留/最近优先/system 保底/极小预算保底/reserve 预留/keepSystem 关闭/统计一致性/负预算健壮），共 220/220；零 agent.ts 改动
- EN: suggestTrim — pure function suggesting which messages to keep within a token budget (system kept, newest-first, minimum-1 newest fallback, reserveForOutput). Lets hosts manage context without touching Agent internals. 220/220 tests.

#### v0.5.8 (2026-08-09) — MCP 服务器端：flare 工具集暴露为 MCP stdio 服务器 / MCP server side (flare as MCP server)
- 🖥️ **MCPServer（src/mcp/server.ts，零依赖手写）**：与 MCPClient 对称——把 flare 工具集（内置 6 工具，或注入专家/MCP 桥接工具）经 MCP 标准 stdio 协议暴露给外部 AI 客户端（Claude Desktop/Cursor/自研 MCP 客户端）或宿主进程复用；覆盖核心子集 `initialize`/`notifications/initialized`/`tools/list`/`tools/call`/`ping`，与 MCPClient 完全互通
- 🔒 **安全继承**：暴露的是 flare 原生工具，危险命令黑名单/路径保护/记忆边界照常生效（e2e 验证 `rm -rf /` 仍被拦截）；未知方法 -32601、未知工具 -32602、JSON 解析错误 -32700 全部按 JSON-RPC 规范返回
- ⏱️ **串行响应队列**：请求按到达顺序响应（慢工具不导致乱序）；工具执行异常/失败 → `isError` 标记（协议层不中断，服务器不崩）
- 🧩 输入/输出可注入（`write`/`input`）——测试与嵌入式使用不限于 stdin/stdout；`toMcpTool` 工具定义映射 + `startMcpServer` 便捷工厂；库导出
- 🧪 新增 14 项测试（握手/列工具/成功/失败/未知工具/未知方法/ping/parse error/通知忽略/自定义注入/串行顺序/close 幂等/toMcpTool 映射/**MCPClient↔MCPServer 真实子进程互通**），共 208/208；零 agent.ts 改动
- EN: MCPServer — flare now also serves its tools as an MCP stdio server (initialize/tools/list/tools/call/ping, zero-dependency NDJSON JSON-RPC, fully interoperable with MCPClient). Safety inherited (dangerous-command blacklist still active), serialized responses, injectable IO. E2E test: MCPClient connects to flare-as-server. 208/208 tests.

#### v0.5.7 (2026-08-09) — 工具确认机制完善：ConfirmationGate 记忆化 + 超时 / Confirmation gate: session memory + always persistence + timeout
- 🚪 **有状态确认门 `ConfirmationGate`（src/core/confirm.ts）**：`allow_session` 记忆化（本会话内同一工具不再重复确认，按 `sessionId` 隔离）+ `always` 持久化（注入 KV store 跨会话记住，MemoryStore settings 表天然满足，官方适配器 `memoryStoreKv(store)`）+ 确认超时（默认 30s，confirmer 超时/抛错按安全默认 deny 处理，超时结果带 `timeout:true` 标记）+ 管理方法（`allowSession`/`allowAlways`/`revoke`/`isAllowed`/`listAllowed`/`resetSession`）——宿主弹窗确认一次即可，会话内放行、明确"总是允许"则持久化，超时安全兜底
- 🔄 **`withConfirmation` 向后兼容增强**：原签名 `(tool, confirmer)` 行为不变（每次确认）；新增第三参 `(tool, confirmer, { store, sessionId, timeoutMs, timeoutDecision })` 委托 gate；`ToolResult` 新增可选 `timeout?: boolean`（仅超时拒绝时出现）
- 📚 docs/confirmation.md（决策规则/管理放行名单/持久化安全提示/向后兼容）+ README 同步 + 版本号 0.5.7
- 🧪 新增 14 项测试（记忆化 9 + 超时 4 + MemoryStore 集成 1），共 194/194；零 agent.ts 改动
- EN: ConfirmationGate — allow_session session-memory (per sessionId), always persistence (KV store, memoryStoreKv adapter for MemoryStore settings), confirmation timeout (safety deny + timeout flag), revoke/list/reset management. withConfirmation stays backward-compatible with optional 3rd arg. 194/194 tests.

#### v0.5.6 (2026-08-09) — 上下文可观测性：token 估算 + context_status + /context / Context observability (token estimation)
- 🧮 **token 估算纯函数（src/core/context.ts，零依赖）**：`estimateTokens(text)`——CJK 1 字符≈1 token、非 CJK 4 字符≈1 token（贴近 OpenAI cl100k 启发式）；`estimateMessagesTokens(messages)`——消息结构 +4、tool_calls +3、图片 ≈85 token/张；`@flare/core` 导出（宿主可直接用于成本预估/上下文管理）
- 🖥️ **server 协议 `context_status`**：只读返回 `{ messageCount, estimatedTokens }`（用 Agent 的 public getMessages()，零 agent.ts 改动）——宿主 AI 面板显示上下文占用/接近上限提醒；host-protocol.md 同步
- ⌨️ **CLI `/context` 命令**：显示当前会话上下文占用（消息数 + 估算 tokens），/help 同步
- 📚 docs/context-observability.md（token 估算说明 + 宿主用法）+ README CLI 表
- 🧪 新增 19 项测试（context 估算 12 + server 协议 2 + /context 命令 5），共 180/180；零 agent.ts 改动
- EN: Context observability — pure token estimation (estimateTokens/estimateMessagesTokens), server context_status (messageCount + estimatedTokens, read-only), CLI /context. Foundation for future token-budget context trimming. 180/180 tests.

#### v0.5.5 (2026-08-09) — MCP 协议支持：连接外部 MCP 服务器 / MCP protocol support (external MCP servers)
- 🔌 **MCP stdio 客户端（零依赖手写）**：`MCPClient`——spawn 子进程 + initialize 握手 + tools/list + tools/call + close，NDJSON JSON-RPC 行协议（不引入 @modelcontextprotocol/sdk），请求超时/错误响应/进程退出全部有兜底
- 🧩 **MCP 工具桥**：`createMcpTools(client)` 把 MCP 工具（inputSchema）桥接为 flare `Tool[]`（execute → tools/call，isError → success:false，协议错误包装不抛出）——外部 MCP 生态（filesystem/github/数据库等）直接进入 Agent 工具集
- 📁 **McpManager + 配置**：`~/.flare/mcp.json`（`{ "servers": [{ "name", "command", "args", "env" }] }`），`McpManager` 管理多服务器连接/断开/工具并集
- ⌨️ **CLI `/mcp` 命令**：`/mcp` 查看状态（● 已连接 + 工具数）/ `/mcp connect <name>` 连接并注入工具 / `/mcp disconnect <name>` 断开（重建会话生效，内置工具保留）
- 🖥️ **server `--mcp <config.json>` + `mcp_status` 请求**：宿主协议服务启动时连接外部 MCP 服务器（工具并入每个会话的 Agent 工具集，与宿主代理工具/专家工具并存），`mcp_status` 让宿主面板诊断连接状态
- 📚 docs/mcp.md（MCP 集成指南：配置/CLI/宿主协议/自定义服务器）+ host-protocol.md 同步 + README CLI 表
- 🧪 新增 32 项测试（client 8 + tools 6 + manager 9 + /mcp 命令 8 + server 2），共 161/161；零 agent.ts 改动
- EN: MCP protocol support — zero-dependency stdio MCP client (NDJSON JSON-RPC), tool bridge into Agent toolset, McpManager + ~/.flare/mcp.json, CLI /mcp, server --mcp + mcp_status. External MCP servers (filesystem/github/db) now usable from flare. 161/161 tests.

#### v0.5.4 (2026-08-09) — 记忆生命周期闭环 + server 记忆接口修复 / Memory lifecycle + server store fix
- 🐛 **修复 server 记忆访问字段错位**：`(agent as any).memoryStore` → `(agent as any).store`（Agent 字段是 `private store`）——修复前 delete_session 从不真正删除（deleted 恒 false，隐私数据删不掉）、list_sessions/get_messages 恒返回空、get_usage 恒为 0（旧测试只断言形状，全部空过）；协议测试改用临时隔离库 + 数据往返断言（create_session → delete_session deleted:true/false），同类问题不再漏网
- 🆕 **server `create_session` 请求**：宿主显式建会话（带标题，UPSERT 幂等）
- 💾 **memory_save 工具**：AI 能真正落库用户明确要求记住的内容（`createMemorySaveTool(store)` 宿主可绑定独立库；已加入内置工具集，description 约束"仅用户明确要求时保存"）——RAG 里程碑补齐"只读不写"缺口
- 🗑️ **记忆删除**：`MemoryStore.deleteMemory(id)` 单条删除 + `deleteMemoriesByContent(关键词)` 批量删除（FTS 触发器联动清索引）；CLI `/forget <关键词>` 命令
- 🖥️ **server 记忆接口**：`remember`（保存）/ `get_memories`（列出或 trigram 搜索）/ `delete_memory`（按 id 或关键词）——宿主面板记忆管理/隐私清理
- 📚 host-protocol.md 完整同步（create_session/remember/get_memories/delete_memory + 响应表）+ docs/memory-rag.md 记忆生命周期
- 🧪 新增 22 项测试（store 6 + memory-tool 6 + /forget 4 + server 6），共 129/129
- EN: Memory lifecycle closed loop — memory_save tool (AI can persist), /forget + deleteMemory (users can remove), server remember/get_memories/delete_memory, create_session. Critical fix: server store field mismatch made delete_session/list_sessions/get_messages/get_usage silently no-op. 129/129 tests.

#### v0.5.3 (2026-08-09) — 宿主协议完善：版本协商 + 会话清理 / Host protocol: version + delete_session
- 🖥️ **server `version` 请求**：返回 `{ protocol, engine }`——宿主启动时协商协议版本（`HOST_PROTOCOL_VERSION`，与引擎版本独立）、读取引擎版本（package.json，不硬编码）
- 🗑️ **server `delete_session` 请求**：宿主清理会话（含消息/token 用量/FTS 索引联动删除），回 `ok` + `deleted` 标志（幂等，会话不存在返回 `false`）
- 📊 **server `get_usage` 请求**：宿主读取 token 用量统计（`{ promptTokens, completionTokens, totalTokens, sessionCount }`，只读不生成）——成本监控/AI 面板显示用量
- 🗄️ **MemoryStore.deleteSession(sessionId)**：事务原子删除（messages → usage_log → sessions），返回是否删除成功
- 📚 host-protocol.md 协议文档完整同步（请求/响应表）
- 🧪 新增 6 项测试（store 3 + server 3），共 107/107
- EN: Host protocol now supports version negotiation (protocol + engine version), delete_session (privacy cleanup) and get_usage (token stats). MemoryStore.deleteSession with FTS index cleanup. 107/107 tests.

#### v0.5.2 (2026-08-09) — 多模型 provider 增强：本地 Ollama 主模型 / Multi-model provider (local Ollama main model)
- 🧭 **模型路由（LLM 模型自动检测）**：模型名含 `:`（Ollama 命名，如 `qwen2.5:7b`/`llama3.1:8b`/`deepseek-r1:7b`）自动走本地 Ollama（`http://localhost:11434/v1`，apiKey `ollama`）——文本对话也可 0 成本/隐私/离线跑本地模型；deepseek/gpt 自动检测保持；claude 明确报错保持；新增 `LLM_BASE_URL` / `LLM_API_KEY` 通用覆盖；`createProvider({ model })` 支持指定主模型
- 🔄 **CLI `/model` 命令**：运行时切换主模型（`/model qwen2.5:7b` 本地 Ollama / `/model deepseek-chat` 远端 / `/model` 查看 / `/model default` 回默认），持久化 settings 表，切换后自动重建会话使新模型立即生效；单次查询同样生效
- 🧪 新增 19 项测试（模型路由 13 + /model 命令 6），共 100/100
- EN: Multi-model provider — auto-route Ollama local models (name with `:`), LLM_BASE_URL/LLM_API_KEY overrides, CLI /model runtime switch persisted in settings. 100/100 tests.

#### v0.5.1 (2026-08-09) — 记忆检索增强（RAG）/ Memory retrieval (RAG)
- 🧠 **memories_fts trigram 全文检索**：`MemoryStore.searchMemories(query)` 中文 3 字以上子串匹配 + bm25 相关度排序（默认 unicode61 tokenizer 中文检索差，trigram 解决）；`getRelevantMemories` 同步升级；老库自动回填索引
- 💬 **历史消息检索**：新增 `messages_fts_trigram`（不动老表）+ `searchMessages(keyword)` 按主题找回旧对话（含 sessionId/role/时间）
- 🔎 **memory_search 工具**：AI 可主动检索记忆与历史消息（`createMemorySearchTool(store)` 宿主可绑定独立库，如 `~/.pulse/pulse-ai.db`）；已加入内置工具集，CLI 默认可用
- 🧪 新增 19 项测试（FTS 检索/排序/2 字回退/触发器/老库回填/工具），共 79/79
- EN: Memory retrieval (RAG) — trigram FTS for Chinese, memories + messages search, memory_search tool. 79/79 tests.

#### v0.5.0 (2026-08-02) — 写作工具集 + StorySpire 专家模板（M4）/ Writing tools + StorySpire expert profile (M4)
- ✨ **写作工具集 `src/tools/story.ts`**：5 个标准写作工具定义（story_get_story / story_get_chapter / story_list_chapters / story_create_chapter / story_update_chapter），宿主应用注入执行器对接真实数据（同 Pulse pulse_* 模式）
- 🧑‍🏫 **写作专家模板 `examples/storyspire/expert.ts`**：品牌话术"我是 story 助手，是集成到 storyspire 里的 flare 写作专家" + 写作提示词（起草/续写/润色/大纲）
- 📚 **集成指南 `docs/storyspire-integration.md`**：主进程接入、工具注入、IPC 桥、key 安全
- 🧪 新增 11 项测试（工具 schema/品牌话术/占位执行器），共 49/49
- EN: Writing toolset (story_*) + StorySpire expert profile template. 49/49 tests.

#### v0.4.3 (2026-08-02) — 修复图片识别粘连 + 回答消失 / Fixed path detection + answer persistence
- 🐛 **parseAttachments 支持粘连中文/标点的路径**：`识别这张图：/home/...png`（无空格）之前整句被当 token 验证失败 → 消息误走 DeepSeek 文本（它只能装 OCR 硬啃）。现在提取路径部分（从 ~/、./、../、/ 起点截取）验证存在性，识别成功且保留前缀提示文本
- 🐛 **Agent 回答不再消失**：运行结束后 renderFrame 清掉输出区只留输入行（回答随重绘消失）。现在回答保留在屏幕，输入行动态定位到回答下方
- 🧪 新增 2 项测试（粘连路径识别/前缀保留），共 38/38
- EN: Path detection now handles Chinese/punctuation-adjacent paths (no space needed). Agent answers persist on screen after completion instead of vanishing on redraw. 38/38 tests.

#### v0.4.2 (2026-08-02) — 看图提速：默认 3B + /vision 切换 / Faster vision: 3B default + /vision switch
- ⚡ 看图默认模型改为 **qwen2.5vl:3b**：模型加载后单张 ~4 秒（7B 是 30-60 秒），日常 OCR/截图流畅
- 🔀 新增 `/vision` 命令：`/vision 3b|fast`（快速）/ `/vision 7b|quality`（质量）/ `/vision default`（回 .env 默认）；切换持久化到 settings 表，无需改 .env 重启
- 🗄️ MemoryStore 新增 settings 表（key-value getSetting/setSetting）
- EN: Default vision model now 3B (~4s/image after load vs 7B's 30-60s). New /vision command switches fast/quality modes at runtime, persisted in DB.

#### v0.4.1 (2026-08-02) — 修复 fcitx5 中文输入消息丢失 / Fixed IME input loss
- 🐛 LineInput Enter 延迟 200ms 提交（IME 防抖）：fcitx5 确认候选的 Enter 不再抢先提交半截内容；pending 期间有字符到达自动续等；连按两次 Enter 立即提交
- 🐛 parseAttachments 引号/裸路径只在文件真实存在时剥离（避免 `"hello.png"` 这类文本被误吞）
- 🧪 新增防误吞测试（36/36）
- EN: Fixed Chinese IME input loss (fcitx5) — Enter debounce before submit. Quoted non-existent paths no longer stripped. 36/36 tests.

#### v0.4.0 (2026-08-02) — 本地视觉能力 / Local vision (VLM)
- 👁️ **多模态支持**：`Message.content` 支持 `string | ContentPart[]`（text + image_url），OpenAI 兼容格式
- 🖼️ **自动识别图片**：对话中直接发图片路径（`看看这张图 xxx.png`）自动附加并切换本地视觉模型；支持 `~` 展开、引号路径（含空格）、data URL（未来 GUI 贴截图）
- 🧠 **视觉 / 文本双模型**：普通对话走默认模型（DeepSeek），看图自动走本地 VLM（`VISION_MODEL`/`VISION_BASE_URL`/`VISION_API_KEY` 配置，默认 qwen2.5vl:7b @ localhost:11434），图片不出本机
- ⌨️ 新命令 `/image <路径> <问题>`（显式看图）+ `chat -q -i <图片>`（单次模式带图）
- 🗄️ 会话存储兼容：多模态 content 序列化存取，图片数据不落库（`[图片]` 占位，防 SQLite 膨胀）
- 🧪 新增视觉单测 16 项（parseAttachments 自动识别 / buildImageContent / 序列化往返），共 35/35
- ⚠️ 已知：Ollama qwen2.5vl 不支持 function calling——看图时纯对话（不传 tools）
- EN: Local vision support — auto-detect image paths in chat, route to local VLM (qwen2.5vl:7b via Ollama), multimodal message type, /image command, image data not persisted. 35/35 tests.

#### v0.3.0 (2026-08-01) — 引擎库化 + 专家模式 / Engine as a library + Expert Profile
- 📦 **M1 flare-core 抽离**：新增库入口 `src/index.ts`，导出 `Agent` / `createProvider` / `Tool` / `MemoryStore` / `ExpertProfile`；package.json exports（`.` 与 `./core` 指向引擎，`./cli` 保留 CLI）；CLI 变第一个消费者
- 🧩 **M2 Expert Profile 机制**：`Agent` 支持注入工具集（`tools`）、独立记忆库（`storage`）、身份话术（`identity` / `flareIntro` 品牌共生）；工具可单独 import（read/write/search/terminal）
- 🧪 新增专家模式单测 4 项（工具注入 / 内置缺省 / 身份话术 / 存储隔离），共 14/14
- ✅ 外部项目验证：`import { Agent } from 'flare-agent'` 编译 + 运行通过
- EN: Engine extracted as importable library (@flare/core) with Expert Profile mechanism — tool injection, isolated storage, brand identity. 14/14 tests.

#### v0.2.20 (2026-08-01) — 常驻火焰动画（方案A定稿）/ Persistent flame animation
- 🔥 常驻渲染循环：火焰永久跳动，动画期间可正常打字输入（帧模式 LineInput）
- 🎨 方案 A 融合版定稿：逐字符渐变（相邻字母不同色）+ 整体 sin 呼吸（5s 周期，安静起伏）
- 📐 布局：顶部空行 + FLARE + 标语 + 提示语固定 + prompt 呼吸色
- 🏷️ tag v0.2.20 = fa4a853（最终版）；中间迭代（粒子/常驻/方案A/流动渐变）保留在历史
- EN: Persistent flame animation — breathing gradient (final plan A), typing works during animation. Tagged v0.2.20.

#### v0.2.19 (2026-08-01) — 火焰粒子动画启动画面 / Flame particle animation
- 🔥 启动画面：粒子火焰 + 整体呼吸动画（火苗与文字重叠燃烧，约 5 秒）
- 🎨 视觉令牌抽离（FLAME_TOKENS：色阶/渐变/动画参数），CLI 与未来桌面/嵌入版多端复用
- 📄 flame-banner.ts 模块化：静态招牌 + 动画分离；非 TTY / 窄终端自动降级静态
- 🏷️ tag v0.2.19 = a48e400（粒子动画里程碑）

#### v0.2.18 (2026-08-01) — 方向键移动光标 / Arrow key cursor movement
- 🎯 LineInput 支持 ←/→ 光标移动（中文/emoji 按字移动）、↑/↓ 历史记录、中间插入、退格删光标前
- EN: Arrow keys move cursor; up/down browse history; ANSI absolute positioning

#### v0.2.17 (2026-08-01) — 修复方向键输入乱码 / Fixed arrow key gibberish
- 🐛 方向键转义序列被拆成字符输入（出现 [D 乱码），改为整体识别忽略
- EN: Arrow key escape sequences were split into characters; now skipped as a whole

#### v0.2.16 (2026-08-01) — 英文 README 补 Built by AI / Built by AI note in EN README
- 📝 英文 README 补上"Built by AI"说明（与中文对应）
- EN: Added "Built by AI" note to the English README

#### v0.2.15 (2026-08-01) — Changelog 双语化 / Bilingual changelog
- 📝 Changelog 每个版本标题双语 + 英文概要，补齐 v0.2.5~v0.2.14
- EN: Bilingual changelog with English summary per version

#### v0.2.14 (2026-08-01) — README 定位文案更新 / Updated README positioning
- 📝 中文定位改为"flare 的目标是成为你唯一需要的 AI 助理"
- EN: Tagline updated to "flare's goal is to be the only AI assistant you need"

#### v0.2.13 (2026-08-01) — 修复两个 bug / Fixed two bugs
- 🐛 修复 `/remember` 命令永远"未知命令"（switch 精确匹配 bug，改为前缀匹配）
- 🐛 修复非 TTY 启动交互模式崩溃（友好提示退出）
- EN: Fixed `/remember` command never matching; fixed crash when stdin is not a TTY

#### v0.2.12 (2026-08-01) — /sessions 人类可读化 / Human-readable sessions
- ✨ 会话标题改为第一条用户消息，时间友好化（今天 HH:MM / 昨天 / M月D日）
- EN: Session list now shows first user message as title with friendly timestamps

#### v0.2.11 (2026-08-01) — 修复多轮会话 prompt 重复 / Fixed duplicate prompt
- 🐛 resume() 和 readLine() 都画 prompt，一轮后出现两个 `🔥 flare>`；统一由 readLine() 绘制
- EN: Fixed double prompt after each turn (resume no longer draws prompt)

#### v0.2.10 (2026-07-31) — 提示语布局 / Hint layout
- ✨ 提示语与标语隔一行、与 prompt 紧邻
- EN: Blank line between hint and tagline; prompt sits right below hint

#### v0.2.9 (2026-07-31) — FLARE 与标语间空行 / Blank line in banner
- ✨ Banner 两行内容之间加空行
- EN: Added blank line between FLARE and the tagline

#### v0.2.8 (2026-07-31) — Banner 上方空行 / Blank line above banner
- ✨ 启动时 Banner 上方留一行空格
- EN: Added blank line above the banner

#### v0.2.7 (2026-07-31) — Banner 去边框 / Borderless banner
- 🎨 移除边框，纯渐变文字；"再见！✨"改为火焰亮黄
- EN: Removed banner border; farewell message now flame yellow

#### v0.2.6 (2026-07-31) — 逐字符火焰渐变 / Per-character flame gradient
- 🎨 Banner 每个字母独立渐变（红→橙→黄），上下边框渐变，标语加火把 🔥
- EN: Every letter in the banner has its own flame gradient; torch emoji added

#### v0.2.5 (2026-07-31) — 火焰色系全面换装 / Flame color scheme
- 🔥 Banner/prompt/草稿/工具/答卷分隔线全部改为红橙黄火焰色系
- EN: Full flame color scheme (red-orange-yellow) across CLI UI

#### v0.2.4 (2026-07-31) — 根治长输入折行重复 / Fixed long-input duplication

- 🎯 **弃用 Node readline，自研输入行（line-input.ts）**：readline 对中文/emoji 的宽度计算不可靠（ANSI 码算进长度、中文按 1 列算），折行重绘时清行不干净导致文字重复
- ✅ 输入时逐字符 echo，终端自然折行（宽度由终端计算，永远正确）
- ✅ 退格重绘用正确的 wcwidth（中文/emoji 算 2 列，ANSI 剥离），基于退格前宽度上移清除
- ✅ 已用 pyte 终端模拟器验证：长输入、退格、跨行删除三种场景最终显示均无重复
- EN: Replaced buggy Node readline with a custom input line; verified with pyte terminal emulator

#### v0.2.3 (2026-07-31) — 答卷分隔线亮紫色 / Purple answer separator

- 🎨 答卷分隔线从暗灰色改为亮紫色 `#6d4aff`（品牌色）
- EN: Answer separator changed to brand purple #6d4aff

#### v0.2.2 (2026-07-31) — 终端视觉分层 / Visual layering

- 🎨 **草稿/答卷视觉分层**：工具调用过程用灰色边框弱化（`🔧` 黄色 + `┌─│└─` 边框 + `💭` 灰色草稿），最终答案用分隔线框出、正常颜色突出
- 🐛 **read_file / write_file / search_files 支持 `~` 展开**（之前只有 terminal 支持）
- EN: Draft/answer visual layering; ~ expansion for all file tools

#### v0.2.1 (2026-07-31) — AI 记忆隔离修复 / AI memory isolation

- 🐛 **修复 Flare 误读其他 AI 记忆**：search_files 跳过 `~/.hermes`、`~/.agents`、`~/.codebuddy`、`~/.claude` 等目录
- 🧠 **系统提示明确记忆边界**：Flare 的记忆在 `~/.flare/flare.db`，禁止读取其他 AI 的记忆文件
- EN: search_files skips other AI tools' dirs; system prompt defines memory boundary

#### v0.2.0 (2026-07-31) — 安全与健壮性大版本 / Security & robustness

- 🔒 **危险命令黑名单**：拦截 `rm -rf /`、fork bomb、`curl|bash`、格式化磁盘等毁灭性命令
- 🔒 **文件路径保护**：拒绝写入 `/etc/`、`.ssh/`、`.git/` 等系统关键位置
- 🛡️ **工具参数 JSON.parse 保护**：LLM 返回非法 JSON 不再崩溃，错误喂回给 LLM 修正
- 🧠 **记忆写入**：新增 `/remember` 命令，记忆系统可写可读
- 📊 **Token 用量追踪**：新增 `/usage` 命令，记录每次 LLM 调用的 token 消耗
- 🔁 **API 重试**：网络抖动/限流自动重试（3次，指数退避）
- 🖥️ **平台兼容**：Windows 跳过 stty；Agent 崩溃也保证恢复终端（try/finally）
- 📁 **原子写入**：write_file 先写临时文件再 rename，不损坏原文件
- 🔍 **搜索优化**：大文件只匹配文件名，跳过 node_modules/.git/dist
- 🧪 **单元测试**：10 个测试覆盖 store/agent 核心逻辑
- 🐛 修复 joinPath（用 path.join）、claude 模型检测、DEBUG 日志、--max-iterations 参数
- EN: Dangerous command blacklist, path protection, /remember memory, /usage tokens, API retry, atomic writes, 10 unit tests

#### v0.1.2 (2026-07-31) — Agent 健壮性修复 / Agent robustness fixes

- 🐛 **修复 Agent 迭代限制过紧**：迭代上限从 10 提升到 30（上限 50，与 Hermes 对齐），复杂任务（读文档→改代码→推送）不再中途停止
- 🐛 **改进死循环检测**：从"连续 5 次无文本输出即停止"改为"同一工具同参数重复 4 次才停止"，探索型任务（连续读文件收集信息）不再被误杀
- 🐛 **修复终端回显重复**：isRunning + `rl.pause()` + `stty -echo` 真正落地，长输入换行不再文字重复
- 🐛 **修复 `~` 展开**：terminal 工具改用 bash 执行，`cd ~/xxx` 不再失败
- 🐛 **修复会话历史 tool_calls 配对丢失**：messages 表新增 `tool_call_id`/`name` 列 + 老库自动迁移，多轮对话不再报 400 错误
- 🐛 **修复 .env 加载优先级**：`~/.flare/.env` 优先，本地 `.env` 不覆盖已有配置
- ✨ **上下文保留提升**：trimContext 保留 12 → 30 条消息，覆盖更长工具调用链
- EN: Iteration limit 10→30, smarter loop detection, tool_call pairing fix, .env priority fix

#### v0.1.1 (2026-07-30) — 回显修复 / Echo fix

- 🐛 修复 CLI 交互模式输入重复回显问题（Agent 运行时暂停输入监听）
- EN: Fixed duplicated echo while Agent is running

#### v0.1.0 (2026-07-30) — 初次发布 / Initial release

- 🎉 初次发布：CLI 交互/单次查询、Agent 循环、LLM 抽象、工具系统、SQLite 记忆
- EN: Initial release: CLI interactive/single query, Agent loop, LLM abstraction, tools, SQLite memory

### License

MIT
