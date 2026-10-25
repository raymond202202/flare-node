/**
 * Flare Agent 核心
 * 
 * Agent Loop：系统提示 → LLM 调用 → 解析工具调用 → 执行 → 反馈 → 继续
 * 参考：Hermes、Claude Code 的 agent loop 设计
 */

import { Message, LLMProvider, createProvider, createVisionProvider, buildImageContent, parseAttachments, type ContentPart, type ToolDefinition } from './llm.js'
import { createHash } from 'crypto'
import { getToolDefinitions, executeTool, type Tool } from '../tools/index.js'
import { getMemoryStore, MemoryStore } from '../memory/store.js'
import { trimContextMessages, summarizeTrimmedMessages } from './context.js'
import { truncateToolOutput, type ToolOutputPolicy } from './tool-output.js'
import { logger } from './logger.js'

export interface AgentConfig {
  systemPrompt?: string
  maxIterations?: number
  sessionId?: string
  model?: string
  /** M2: 注入工具集（含 execute）；缺省用 Flare 内置工具 */
  tools?: Tool[]
  /** M2: 独立记忆库路径（如 ~/.pulse/pulse-ai.db）；缺省用 Flare 默认库 */
  storage?: string
  /** M2: 身份话术——用户问"你是谁"时按此回答（如 "我是 pulse 助手…"） */
  identity?: string
  /** M2: Flare 介绍话术——用户追问"flare 是什么"时按此回答（品牌共生） */
  flareIntro?: string
  /** M3+: 视觉 LLM provider（消息含图片时用；缺省懒创建本地 VLM） */
  visionProvider?: LLMProvider
  /** 是否启用图片自动识别（默认 true；false 时忽略消息中的图片） */
  visionEnabled?: boolean
  /** 注入主 LLM provider（默认 createProvider()）；测试可注入 mock */
  llm?: LLMProvider
  /** 上下文自动裁剪条数上限（v0.6.17，默认 30）：迭代前超过则保留最近 N 条
   *  （含 tool_calls ↔ tool 配对保护；system 保底）。0 = 不按条数裁剪。 */
  maxContextMessages?: number
  /** 上下文自动裁剪 token 预算（v0.6.17，可选）：迭代前估算 tokens 超过则按预算
   *  裁剪（最近优先 + 配对保护 + system 保底；与 maxContextMessages 任一先到即停）。
   *  不配置则只按条数裁剪（行为与旧版一致）。 */
  maxContextTokens?: number
  /** 上下文压缩摘要（v0.6.19，默认 false）：裁剪时把丢弃的历史压缩成摘要消息
   *  （条数/角色分布/涉及工具/最后话题）而非直接丢弃——AI 保留话题连续性；
   *  纯启发式统计不调 LLM（零额外成本）；摘要可被下次裁剪识别并合并覆盖（不堆积）。 */
  contextSummarize?: boolean
  /** 工具输出治理策略（v0.6.34，可选）：按工具类型定制工具结果截断——探索型（read_file/
   *  search_files）留头尾、终端型（terminal）留尾部、默认前 maxOutputChars（失败前
   *  maxErrorChars）、省略标记可定制；缺省与旧版统一 slice 完全一致（零回归）。 */
  toolOutputPolicy?: ToolOutputPolicy
}

const DEFAULT_SYSTEM_PROMPT = `你是 Flare，一个通用能力的 AI Agent。
你的定位不局限于编程——你是用户的智能助手，可以完成各种任务，
也可以作为 AI 能力核心嵌入到其他产品中（如桌面应用的 AI 面板）。

## 你的能力
你可以使用各种工具来帮助用户完成任务：
- read_file：读取文件内容
- write_file：写/覆盖文件
- search_files：搜索文件
- terminal：执行终端命令（可以运行 node/npm/git/gh 等任何系统命令）

## 工作原则
1. 先理解用户需求，再行动
2. 使用工具完成任务，不要只描述
3. 每次工具调用后，根据结果决定下一步
4. 任务完成后，给用户一个清晰的总结
5. 代码要准确、安全，注意异常处理

## 探索型任务的正确模式
有些任务需要先收集大量信息才能回答（比如"读文档→对比代码→修改→推送"）。
这种任务你可以连续调用多个工具来收集信息，中间不需要每步都输出文字。
收集完所有信息后，再统一给用户一个完整的总结。

## 复杂任务的持续推进
复杂任务（如修改项目、推 GitHub）可能需要很多步骤：
1. 先探查现状（读文件、看目录）
2. 再执行修改（写文件、运行命令）
3. 最后验证（测试、git status）
只要任务还没完成，就继续调用工具推进，不要中途停下来等用户确认。

## 记忆
你的记忆存储在 ~/.flare/flare.db（SQLite 数据库），由你的记忆系统自动管理。
- 查看记忆：用户输入 /memory 或问你"你的记忆"时，回答基于你自己的记忆系统
- **绝对不要**去读取其他 AI 工具的记忆文件（如 ~/.hermes/memories/、~/.agents/、
  ~/.codebuddy/ 等目录）——那些是别的 AI 的记忆，不是你的
- 用户让你"记住"的内容（/remember）才会写入你的记忆

用中文回答用户的问题。`

export class Agent {
  private llm: LLMProvider
  private visionProvider: LLMProvider | null = null
  private config: AgentConfig
  private messages: Message[] = []
  private tools: ToolDefinition[] = []
  private toolExecutors: Map<string, Tool> = new Map()
  private store: MemoryStore
  /**
   * 消息对象 → store 自增 id（v0.6.35，apply_trim 上下文裁剪的 store 同步用）。
   * 只在构造时加载的历史消息建立映射；run/setContext 新增消息无映射（不参与删除）。
   * 依赖 trimContextMessages/suggestTrim 保留原对象引用（已确认 unshift/slice 均原引用）——
   * 数组重组后映射依然有效，因此无需改动 run 循环。
   */
  private storedIdByMsg = new Map<Message, number>()

  constructor(config: AgentConfig = {}) {
    this.llm = config.llm || createProvider()
    this.config = config
    if (config.visionProvider) {
      this.visionProvider = config.visionProvider
    }

    // M2: 注入工具集（config.tools 优先，缺省用内置）
    const injected = config.tools || []
    this.toolExecutors = new Map(injected.map(t => [t.definition.function.name, t]))
    this.tools = injected.length > 0 ? injected.map(t => t.definition) : getToolDefinitions()

    // M2: 独立记忆库（config.storage 优先，缺省用 Flare 全局单例）
    this.store = config.storage ? new MemoryStore(config.storage) : getMemoryStore()

    // 加载会话历史
    const store = this.store
    if (config.sessionId) {
      const history = store.getMessagesWithIds(config.sessionId)
      this.messages = history.map(h => h.message)
      // v0.6.35：建立消息对象 → store id 映射（apply_trim 裁剪后按 id 同步删除被裁消息）
      for (const h of history) this.storedIdByMsg.set(h.message, h.id)
      // 清理历史中不完整的 tool_calls 配对（尾部孤儿消息）
      this.cleanOrphanTail()
    }

    // M2: 身份 + flare 介绍注入系统提示（品牌共生话术）
    // P0（v0.6.29）：system 前缀稳定——稳定前缀（systemPrompt）独立、身份独立、记忆独立，
    // 记忆一变只影响最后一条 system 消息，稳定前缀 + 工具定义永远不变 → DeepSeek 前缀缓存不失效
    let basePrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT

    // 组装 system 消息序列：稳定前缀 → 身份 → 记忆（记忆动态变化不污染前缀）
    const sysMessages: Message[] = [{ role: 'system', content: basePrompt }]

    // 身份段（构建时确定，会话内不变；拆独立 system 消息放稳定前缀之后）
    if (config.identity || config.flareIntro) {
      let identityBlock = ''
      if (config.identity) {
        identityBlock += `\n\n## 你的身份\n当用户问"你是谁"、"你是什么助手"或"你叫什么"时，按以下话术回答（自然融入，不要生硬照抄）：\n${config.identity}`
      }
      if (config.flareIntro) {
        identityBlock += `\n\n## 关于 Flare\n当用户问"flare 是什么"、"你是由什么驱动的"、"flare 和你的关系"时，按以下话术回答（可稍作润色，保持核心信息）：\n${config.flareIntro}`
      }
      sysMessages.push({ role: 'system', content: identityBlock.trim() })
    }

    // 记忆段（动态：/remember 后变化；独立 system 消息放最后，缓存前缀不受影响）
    const memories = store.getAllMemories()
    if (memories.length > 0) {
      const memoryContext = memories.slice(0, 5).map(m => m.content).join('\n')
      sysMessages.push({ role: 'system', content: `## 关于这个用户\n${memoryContext}` })
    }

    this.messages = [...sysMessages, ...this.messages]
  }

  /**
   * 动态注入额外系统上下文（如宿主应用当前状态快照）
   * 不污染消息历史；重复调用会替换上一次的注入（避免累积）
   *
   * P0（v0.6.29）：作为**独立 system 消息追加到消息末尾**（动态区，历史之后）——
   * 宿主状态快照每轮变化只影响末尾 token，稳定前缀 + 身份 + 记忆 + 历史全部命中
   * DeepSeek 前缀缓存（旧版拼进第一条 system 会污染稳定前缀，缓存全失效）
   */
  setContext(extra: string) {
    const marker = '## 当前状态'
    // 查找已有注入（以 marker 开头的独立 system 消息）→ 替换；否则追加到末尾
    const existingIdx = this.messages.findIndex(
      m => m.role === 'system' && typeof m.content === 'string' && m.content.startsWith(marker)
    )
    if (!extra) {
      if (existingIdx >= 0) this.messages.splice(existingIdx, 1)
      return
    }
    const msg: Message = { role: 'system', content: `${marker}\n${extra}` }
    if (existingIdx >= 0) {
      this.messages[existingIdx] = msg
    } else {
      this.messages.push(msg)
    }
  }

  /**
   * 清理消息历史中的"孤儿"消息：
   * - assistant(tool_calls) 后面没有对应的 tool 响应 → 删除该 assistant
   * - 孤立的 tool 响应（前面没有 assistant(tool_calls) 配对）→ 删除
   * 
   * 这些消息发给 LLM 会导致 400 错误：
   * "assistant message with 'tool_calls' must be followed by tool messages"
   */
  private cleanOrphanTail() {
    const cleaned: Message[] = []

    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i]

      // 主循环遇到的 tool 消息都是"孤立"的（前面没有 assistant(tool_calls) 配对）：
      // 配对完整的 tool 响应已经被下面的 assistant 前瞻逻辑消费掉了。
      // 孤立 tool 会导致 LLM 400 错误，直接丢弃。
      if (msg.role === 'tool') {
        continue
      }

      // 普通消息（system/user/纯文本 assistant）：直接保留
      if (msg.role !== 'assistant' || !msg.tool_calls) {
        cleaned.push(msg)
        continue
      }

      // assistant(tool_calls)：检查后面是否有完整的 tool 响应配对
      const toolCallIds = new Set(msg.tool_calls.map(tc => tc.id))
      let j = i + 1
      // 收集后面的 tool 响应
      while (j < this.messages.length && this.messages[j].role === 'tool') {
        const toolMsg = this.messages[j]
        if (toolMsg.tool_call_id && toolCallIds.has(toolMsg.tool_call_id)) {
          toolCallIds.delete(toolMsg.tool_call_id)
        }
        j++
      }

      if (toolCallIds.size === 0) {
        // 配对完整：保留 assistant(tool_calls) + 对应的 tool 响应
        cleaned.push(msg)
        for (let k = i + 1; k < j; k++) {
          cleaned.push(this.messages[k])
        }
        i = j - 1
      } else {
        // 配对不完整：丢弃这个 assistant(tool_calls)（连同后面可能的部分 tool 响应）
        // 但保留它可能的文本内容（如果有）
        if (msg.content) {
          cleaned.push({ role: 'assistant', content: msg.content })
        }
        i = j - 1
      }
    }

    this.messages = cleaned
  }

  /**
   * 执行一次完整的 Agent 推理循环
   * 直到 LLM 不再调用工具或达到最大迭代次数
   *
   * @param userInput 用户输入（会自动识别其中的图片路径 / data URL）
   * @param attachments 显式图片附件（本地路径或 data URL；与自动识别合并）
   */
  async *run(userInput: string, attachments?: string[]): AsyncGenerator<{ type: 'text' | 'tool_call' | 'tool_result' | 'done' | 'error'; content: string; toolName?: string; args?: string }, void, unknown> {
    // 防御：清理内存中可能存在的孤儿消息（上次运行中途失败等）
    // #25：先补齐「悬空 tool_calls」再清理——旧做法是直接丢弃整对，等于把模型上一步
    // 干过什么从上下文里抹掉；续跑时它会重复劳动。补齐后上下文合法且不丢信息。
    this.repairDanglingToolCalls()
    this.cleanOrphanTail()

    // 自动识别图片（路径 / data URL）；显式 attachments 合并（去重）
    const parsed = parseAttachments(userInput)
    const seen = new Set<string>()
    const dedupe = (list: string[]) => list.filter(p => {
      if (seen.has(p)) return false
      seen.add(p)
      return true
    })
    const finalAttachments = dedupe([...(attachments || []), ...parsed.attachments])
    const hasImages = this.config.visionEnabled !== false && finalAttachments.length > 0
    const inputText = parsed.text || (hasImages ? '请描述这张图片' : userInput)

    // 构建用户消息（多模态：文本 + 图片）
    let content: string | ContentPart[]
    if (hasImages) {
      content = buildImageContent(inputText, finalAttachments)
      // 懒创建视觉 provider（仅在真正看图时初始化）
      if (!this.visionProvider) {
        try {
          // 运行时 /vision 切换的模型优先（存 settings 表）；否则 VISION_MODEL 或默认 3B
          const savedModel = this.store.getSetting('vision_model') || undefined
          this.visionProvider = createVisionProvider(savedModel)
        } catch (e: any) {
          yield { type: 'error', content: `视觉模型初始化失败: ${e.message}。请检查 ~/.flare/.env 的 VISION_* 配置。` }
          yield { type: 'done', content: '' }
          return
        }
      }
    } else {
      content = inputText
    }
    this.messages.push({ role: 'user', content })

    // 本轮使用的 provider：含图 → 视觉模型；否则主模型
    const provider = hasImages && this.visionProvider ? this.visionProvider : this.llm

    // 记录本轮消息的起始位置（用于会话保存）
    const turnStartIdx = this.messages.length - 1

    let iterations = 0
    // 复杂任务（读文档→改代码→推送）可能需要 20-40 次工具调用
    // v0.6.154：默认 30 → 50；硬上限 50 → 200（可用 FLARE_MAX_ITERATIONS 或配置覆盖）
    // 原因：30 次在真实多文件项目里会被"对抗工具缺陷"吃掉三分之一（见 FLARE问题记录.md #11），
    // 长任务被腰斩后用户只能重开会话、上下文全丢。上限提高后仍保留护栏，避免失控死循环。
    const HARD_MAX_ITERATIONS = 500
    const DEFAULT_MAX_ITERATIONS = 50
    const envMax = Number.parseInt(process.env.FLARE_MAX_ITERATIONS || '', 10)
    const configuredMax = Number.isFinite(envMax) && envMax > 0
      ? envMax
      : (this.config.maxIterations || DEFAULT_MAX_ITERATIONS)
    const maxIter = Math.max(1, Math.min(configuredMax, HARD_MAX_ITERATIONS))
    let noProgressCount = 0 // 连续「同一批工具调用签名原样重试且无文本输出」的次数
    let lastRoundSignature = '' // 上一轮工具调用的整体签名（#37）
    const recentToolSignatures: string[] = [] // 最近工具调用签名（检测死循环）
    // v0.6.155（#13）：记录本轮动作与最后一段文本——命中迭代上限时给出「已做/未做」清单，
    // 而不是一句「请简化你的请求」把长任务废掉（上下文其实都还在，能接着跑）。
    const turnActions: TurnAction[] = []
    let lastText = ''
    let budgetExhausted = false

    while (iterations < maxIter) {
      iterations++
      logger.debug(`迭代 #${iterations}/${maxIter}，上下文消息数: ${this.messages.length}`)

      // 截断消息上下文，防止内存暴涨
      this.trimContext()

      // 调用 LLM
      // #25：历史里可能残留「assistant.tool_calls 缺 tool 响应」（早期版本 break 了但已落库，
      // `--continue` 读回来仍是坏的）——上送前逐条补齐占位 tool 消息，否则必 400。
      this.repairDanglingToolCalls()
      // 视觉模型（Ollama qwen2.5vl）不支持 function calling——看图时纯对话，不传 tools
      const response = await provider.chat(this.messages, hasImages ? undefined : this.tools)
      logger.debug(`LLM 响应: model=${response.model}, content=${(response.content || '').length}字符, tool_calls=${response.tool_calls?.length || 0}`)

      // 记录 token 用量（如果 provider 返回了 usage）
      if (response.usage && (response.usage.prompt_tokens > 0 || response.usage.completion_tokens > 0)) {
        try {
          const store = this.store
          store.logUsage(
            this.config.sessionId || null,
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
            response.model,
            // P0（v0.6.29）：缓存命中/写入 + 成本估算（宿主可见缓存命中率）
            {
              cacheReadTokens: response.usage.cache_read_tokens,
              cacheWriteTokens: response.usage.cache_write_tokens,
              estimatedCostUsd: response.usage.estimated_cost_usd,
            }
          )
        } catch { /* 用量记录失败不影响主流程 */ }
      }
      
      // 保存助手响应
      this.messages.push({
        role: 'assistant',
        content: response.content || '',
        ...(response.tool_calls ? { tool_calls: response.tool_calls } : {}),
      })

      // 生成文本输出
      if (response.content) {
        noProgressCount = 0 // 有文本输出，重置计数器
        lastText = response.content
        yield { type: 'text', content: response.content }
      }

      // 处理工具调用
      if (response.tool_calls && response.tool_calls.length > 0) {
        const allCalls = response.tool_calls
        // #25：本批里「参数完全相同」的并行调用只执行第一次，其余去重（不是死循环）
        const batchSignatures = new Set<string>()
        let abortRun = false

        // #37：无进展判定改成「同一批工具调用签名原样重试」。
        // 旧版把「所有不带文本的工具调用」都算无进展，纯探索型任务（连续 read_file /
        // grep 翻代码，每次参数都不同）跑到第 15 轮被误杀——实测 33 秒中止，任务书里
        // 还有大半没干。真正卡死的特征是「参数一字不改地重试」，换参数就是有新动作。
        const roundSignature = allCalls
          .map(tc => `${tc.function.name}:${tc.function.arguments || ''}`)
          .sort()
          .join('\u0001')
        if (response.content) {
          noProgressCount = 0
        } else if (roundSignature === lastRoundSignature) {
          noProgressCount++
        } else {
          noProgressCount = 0
        }
        lastRoundSignature = roundSignature

        if (noProgressCount >= 6) {
          // #25：break 前必须补齐 tool 消息，否则下一条请求带 pending tool_calls → 400
          this.backfillToolResults(allCalls, '连续多轮以完全相同的工具调用重试且无文本进展，flare 已停止本轮；本条未执行。')
          yield { type: 'error', content: '连续多轮以完全相同的工具调用重试且无文本进展，已自动停止。上下文已保留，可换思路后 --continue 继续。' }
          break
        }

        // 限制每次工具调用的数量（允许并行 5 个）
        const MAX_PARALLEL_CALLS = 5
        const callsToProcess = allCalls.slice(0, MAX_PARALLEL_CALLS)
        // #25：被切掉的调用同样要回填 tool 消息，否则它们的 tool_call_id 悬空 → 400
        const skippedCalls = allCalls.slice(MAX_PARALLEL_CALLS)
        if (skippedCalls.length > 0) {
          this.backfillToolResults(
            skippedCalls,
            `单轮最多并行 ${MAX_PARALLEL_CALLS} 个工具调用，本条超出上限被跳过；需要时请重新发起。`
          )
          for (const tc of skippedCalls) {
            yield { type: 'tool_result', content: `未执行：超出单轮并行上限（${MAX_PARALLEL_CALLS}）`, toolName: tc.function.name }
          }
        }

        for (const tc of callsToProcess) {
          yield {
            type: 'tool_call',
            content: tc.function.name,
            toolName: tc.function.name,
            // 附上工具参数（应用侧可据此把请求写入 UI，如 Pulse 请求区标签页）
            args: tc.function.arguments || '',
          }

          // 解析工具参数：LLM 可能返回格式异常的 JSON，不能让它崩溃整个循环
          let args: Record<string, any>
          try {
            args = JSON.parse(tc.function.arguments)
            if (typeof args !== 'object' || args === null || Array.isArray(args)) {
              throw new Error('参数必须是 JSON 对象')
            }
          } catch (parseErr: any) {
            const errMsg = `工具「${tc.function.name}」的参数解析失败: ${parseErr.message}`
            turnActions.push({ name: tc.function.name, target: '(参数无法解析)', ok: false, error: parseErr.message })
            yield { type: 'tool_result', content: errMsg, toolName: tc.function.name }
            // 把错误喂回给 LLM，让它修正参数而不是崩溃
            this.messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: `错误: ${errMsg}`,
            })
            continue
          }
          
          // 死循环检测（#25）：签名 = 工具名 + 全量参数 SHA1。
          // 旧版只取 JSON 前 120 字符，长得像的两条不同命令（同一段 cd/heredoc 前缀）
          // 会被算成同一条 → 误报「重复调用工具」；且只在 4 次「合计出现」时判死，
          // 正常迭代里重跑同一命令（改一次跑一次测试）也会被误杀。
          const signature = toolSignature(tc.function.name, args)

          // 同一批并行调用里参数完全相同：视为重复提交，执行第一条即可，不当死循环
          if (batchSignatures.has(signature)) {
            const dupMsg = `未执行：与同一批内的另一个「${tc.function.name}」调用参数完全相同，已去重。`
            this.messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: dupMsg })
            yield { type: 'tool_result', content: dupMsg, toolName: tc.function.name }
            continue
          }
          batchSignatures.add(signature)

          recentToolSignatures.push(signature)
          // 只统计「连续尾部相同」：跨轮重复但仍带着不同中间步骤，不算卡死
          const repeatCount = countTrailingRepeats(recentToolSignatures, signature)
          if (repeatCount >= 4) {
            const reason = `连续 ${repeatCount} 次以完全相同的参数调用「${tc.function.name}」，判定为卡死循环，flare 已停止本轮；本条未执行。`
            // #25：停止前补齐本批所有尚未回填的 tool_call —— 否则历史里残留 pending
            // tool_calls，下一轮请求直接被上游拒为 400（本次事故的直接表现）。
            this.backfillToolResults(allCalls, reason)
            yield {
              type: 'error',
              content: `${reason}上下文与工具结果均已保留，可换参数/换思路后继续：flare chat --continue`,
            }
            abortRun = true
            break
          }

          // M2: 注入工具优先执行（应用自定义工具），否则回退内置 executeTool
          // v0.6.154：单个工具抛异常不再让整个 run() 崩掉 —— 转成失败结果交给模型自我修正。
          // 旧版这里裸奔，任何工具抛错都会从生成器逃逸；配合 server.ts 原本缺 catch，
          // 表现就是「流断掉、done 帧不发、前端永久卡在生成中」。
          let result: Awaited<ReturnType<typeof executeTool>>
          try {
            const injectedTool = this.toolExecutors.get(tc.function.name)
            result = injectedTool
              ? await injectedTool.execute(args)
              : await executeTool(tc.function.name, args)
          } catch (toolErr: any) {
            const msg = String(toolErr?.message || toolErr).slice(0, 500)
            result = { success: false, output: '', error: `工具执行抛异常: ${msg}` }
          }
          
          // 截断工具结果（防止上下文爆炸；v0.6.30 起按工具类型定制策略——
          // 读文件类留头尾、终端类留尾部，默认与旧版逐字符一致，控制流不变）
          // v0.6.34：策略可配置（AgentConfig.toolOutputPolicy）——缺省 undefined 等价默认策略（零回归）
          const truncatedOutput = truncateToolOutput(tc.function.name, result, this.config.toolOutputPolicy)

          yield {
            type: 'tool_result',
            content: truncatedOutput,
            toolName: tc.function.name,
          }

          // 将截断后的工具结果加入消息
          this.messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.function.name,
            content: result.success ? truncatedOutput : `错误: ${result.error?.slice(0, 500)}`,
          })
          turnActions.push({
            name: tc.function.name,
            target: actionTarget(tc.function.name, args),
            ok: !!result.success,
            error: result.success ? undefined : String(result.error || '').replace(/\s+/g, ' ').slice(0, 120),
          })
        }
        // #25：重复调用/死循环中止必须跳出整个 while —— 旧版这里的 break 只跳出 for，
        // 循环继续 → 带着半截 tool_calls 再发请求 → 上游 400，整轮报废。
        if (abortRun) break
        if (iterations >= maxIter) budgetExhausted = true
      } else {
        // 没有工具调用，对话结束
        break
      }
    }

    if (budgetExhausted) {
      yield { type: 'error', content: formatBudgetReport({ actions: turnActions, lastText, maxIter, sessionId: this.config.sessionId }) }
    }

    // 保存到会话：把本轮所有消息（从 turnStartIdx 开始）完整保存
    if (this.config.sessionId) {
      const store = this.store
      for (let i = turnStartIdx; i < this.messages.length; i++) {
        store.saveMessage(this.config.sessionId, this.messages[i])
      }
    }

    yield { type: 'done', content: '' }
  }

  /**
   * 安全地截断上下文，防止内存和 token 爆炸。
   * 保留 system prompt + 最近若干条消息，
   * 且保证不截断 tool_calls ↔ tool 响应的配对关系。
   *
   * 规则（v0.6.17 起委托 trimContextMessages 纯函数）：
   *   - 默认保留最近 30 条（maxContextMessages 可配）
   *   - maxContextTokens 配置后按 token 预算裁剪（最近优先 + 配对保护 + system 保底）
   *   - 从末尾往前找到最近的"完整对话轮次"边界：
   *     - 如果最后一条是 tool 响应，向前找到它的 tool_calls 一起保留
   *     - 如果有 assistant(tool_calls)+tool 配对，整对保留
   */
  private trimContext() {
    const base = {
      maxMessages: this.config.maxContextMessages ?? 30,
      maxTokens: this.config.maxContextTokens,
    }
    // v0.6.19：contextSummarize 开启时把丢弃历史压缩成摘要消息（纯启发式，AI 保留话题连续性）
    this.messages = this.config.contextSummarize
      ? summarizeTrimmedMessages(this.messages, base)
      : trimContextMessages(this.messages, base)
  }

  /**
   * 宿主显式执行上下文裁剪（v0.6.35，run 循环外独立 API）：按消息索引保留集立即裁剪内存上下文，
   * 并同步删除 store 中明确被裁的历史消息（重建 Agent 后裁剪依然生效）。
   *
   * 安全规则：
   *   - 开头连续 system 块（稳定前缀/身份/记忆）无条件保底，保持相对顺序
   *   - 非法索引（非整数/越界）宽松过滤；重复索引去重
   *   - 只删除「构造时加载且有映射」的被裁消息——run/setContext 新增（无映射）与内存未加载的
   *     store 消息不受影响（保守：不误删宿主仍可读的全量历史）
   *   - 失败（store 删除异常）不影响内存裁剪
   *
   * @param keepIndexes 保留的消息索引数组（相对 getMessages() 全量索引；建议来自
   *   suggestTrim / context_status 的 keepIndexes——配对保护由调用方保证）
   */
  applyTrim(keepIndexes: number[]): { keptCount: number; droppedCount: number } {
    const len = this.messages.length
    // 无合法索引（空数组或全非法）→ 保守不裁剪（返回现状；宿主误传空数组不清空上下文）
    const legal = (keepIndexes || []).filter(i => Number.isInteger(i) && i >= 0 && i < len)
    if (legal.length === 0) {
      return { keptCount: len, droppedCount: 0 }
    }
    const wanted = new Set<number>(legal)
    // 保底：开头连续 system 块（v0.6.29 多条 system：稳定前缀/身份/记忆）
    let sysBlockEnd = 0
    while (sysBlockEnd < len && this.messages[sysBlockEnd].role === 'system') {
      wanted.add(sysBlockEnd)
      sysBlockEnd++
    }
    const kept = this.messages.filter((_, i) => wanted.has(i))
    const keptSet = new Set(kept)
    // store 同步：删除有映射且不在保留集的消息（只删明确被裁的）
    const droppedIds: number[] = []
    for (const [msg, id] of this.storedIdByMsg) {
      if (!keptSet.has(msg)) droppedIds.push(id)
    }
    if (this.config.sessionId && droppedIds.length > 0) {
      try {
        this.store.deleteMessages(this.config.sessionId, droppedIds)
      } catch { /* store 删除失败不影响内存裁剪 */ }
    }
    // 清理映射（只保留保留集条目；Map 迭代中删除当前项安全）
    for (const msg of this.storedIdByMsg.keys()) {
      if (!keptSet.has(msg)) this.storedIdByMsg.delete(msg)
    }
    const droppedCount = this.messages.length - kept.length
    this.messages = kept
    return { keptCount: kept.length, droppedCount }
  }

  /**
   * 为「不发 tool 响应就中止」的批次补齐 tool 消息（#25）。
   *
   * OpenAI/DeepSeek 协议要求 assistant.tool_calls 里的每个 id 都有一条紧跟其后的
   * tool 消息；缺一条，下一次请求就是 400 invalid_request。flare 过去在
   * 「重复调用/无进展/超出并行上限」三条路径上直接 break，把半截 tool_calls 留在
   * 历史里——而且历史已经落库，连 `--continue` 都救不回来。
   *
   * 已存在的 tool 消息不重复插入（幂等）。
   */
  private backfillToolResults(calls: { id: string; function: { name: string } }[], reason: string): void {
    const answered = new Set<string>()
    for (const m of this.messages) {
      if (m.role === 'tool' && typeof (m as any).tool_call_id === 'string') {
        answered.add((m as any).tool_call_id)
      }
    }
    for (const tc of calls) {
      if (!tc?.id || answered.has(tc.id)) continue
      answered.add(tc.id)
      this.messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.function?.name,
        content: `未执行：${reason}`,
      } as Message)
    }
  }

  /**
   * 修复历史里的「悬空 tool_calls」（#25）。
   *
   * 协议要求 assistant.tool_calls 的每个 id 都紧跟一条 tool 消息。早期 flare 在
   * 重复调用/无进展中止时只 break，把没执行的 tool_calls 留在内存并落库；之后
   * `--continue` 把这段历史读回来，任何请求都是 400 invalid_request，整个会话报废。
   * 这里在上送前扫描：缺哪条补哪条（内容说明「未执行」），幂等、就地修改。
   */
  private repairDanglingToolCalls(): void {
    const repaired: Message[] = []
    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i]
      repaired.push(msg)
      const calls = (msg as any).tool_calls as Array<{ id?: string; function?: { name?: string } }> | undefined
      if (msg.role !== 'assistant' || !Array.isArray(calls) || calls.length === 0) continue

      // 收集紧随其后的 tool 消息（连续一段）
      const answered = new Set<string>()
      let j = i + 1
      while (j < this.messages.length && this.messages[j].role === 'tool') {
        const id = (this.messages[j] as any).tool_call_id
        if (id) answered.add(id)
        j++
      }
      for (const tc of calls) {
        if (!tc?.id || answered.has(tc.id)) continue
        answered.add(tc.id)
        repaired.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.function?.name,
          content: '未执行：该调用所在批次被中止，缺少执行结果（flare 自动补齐以保证上下文合法）。',
        } as Message)
      }
    }
    this.messages.length = 0
    this.messages.push(...repaired)
  }

  /** 获取当前消息列表 */
  getMessages(): Message[] {
    return this.messages
  }
}

/* ──────────────────── 工具调用去重签名（v0.6.157，#25） ──────────────────── */

/**
 * 工具调用签名：工具名 + 全量参数指纹。
 *
 * 旧版用 `JSON.stringify(args).slice(0, 120)` 当签名——对长命令（`cd … && python3 - <<'PY'`
 * 这类共享前缀）会截断成相同前缀，两条不同的 terminal 调用被判成「重复调用」而误杀整轮。
 * 这里改用全量参数的 SHA-256（16 位十六进制足够区分，且不把命令内容留在内存里比对）。
 */
export function toolSignature(toolName: string, args: unknown): string {
  let payload: string
  try {
    payload = stableStringify(args)
  } catch {
    payload = String(args)
  }
  const digest = createHash('sha256').update(payload).digest('hex').slice(0, 16)
  return `${toolName}:${digest}`
}

/** 键序稳定的 JSON（同一对象不同键序应得到同一签名） */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

/**
 * 尾部连续重复次数：从数组末尾往前数，有多少个连续元素等于 signature。
 *
 * 只统计「连续」是为了区分两种场景：
 *   - 模型卡死：同一命令连着发 4 次，中间没有任何别的动作 → 该停
 *   - 正常迭代：改一次代码跑一次测试，中间夹着 read_file/write_file → 不该停
 */
export function countTrailingRepeats(signatures: string[], signature: string): number {
  let n = 0
  for (let i = signatures.length - 1; i >= 0; i--) {
    if (signatures[i] !== signature) break
    n++
  }
  return n
}

/* ────────────────────────── 迭代预算收尾（v0.6.155，#13） ────────────────────────── */

/** 一轮里的一次工具动作（用于耗尽预算时汇报「已做 / 卡在哪」） */
export interface TurnAction {
  name: string
  target: string
  ok: boolean
  error?: string
}

/** 从工具参数里取一个短目标描述（命令/路径/查询），便于人读 */
export function actionTarget(toolName: string, args: Record<string, any> | undefined): string {
  if (!args || typeof args !== 'object') return ''
  const pick = ['command', 'path', 'file_path', 'filePath', 'pattern', 'query', 'url', 'name', 'repo']
  for (const k of pick) {
    const v = args[k]
    if (typeof v === 'string' && v.trim()) {
      return v.replace(/\s+/g, ' ').trim().slice(0, 80)
    }
  }
  return ''
}

/**
 * 命中迭代上限时的收尾文案。
 *
 * 设计依据（FLARE问题记录 #13）：一句「请简化你的请求后重试」等于把长任务判死——
 * 上下文、工具结果、已完成步骤都还在，用户真正需要的是「停在哪、怎么接着跑」。
 * 因此这里输出：续跑命令 + 本轮动作摘要（按工具聚合，含最后失败原因）+ 最后一段模型文本。
 */
export function formatBudgetReport(input: {
  actions: TurnAction[]
  lastText: string
  maxIter: number
  sessionId?: string
}): string {
  const { actions, lastText, maxIter, sessionId } = input
  const lines: string[] = []
  lines.push(`已达本轮迭代上限（${maxIter} 次模型迭代），自动停止。上下文与工具结果均已保留，可直接续跑：`)
  lines.push(`  flare chat --continue              # 接着这个会话继续（不重跑已完成步骤）`)
  lines.push(`  flare chat --continue -m ${Math.min(maxIter * 2, 500)}         # 或本轮给更大预算（上限 500）`)
  if (sessionId) lines.push(`  flare chat -s ${sessionId}          # 指定会话显式续聊`)
  lines.push(`  （一次迭代可批量执行最多 5 个工具调用，所以工具调用数会多于迭代数）`)

  if (actions.length > 0) {
    lines.push('')
    lines.push(`本轮执行摘要（共 ${actions.length} 次工具调用）：`)
    const byTool = new Map<string, TurnAction[]>()
    for (const a of actions) {
      const arr = byTool.get(a.name) || []
      arr.push(a)
      byTool.set(a.name, arr)
    }
    for (const [name, arr] of byTool) {
      const okCount = arr.filter((a) => a.ok).length
      const failCount = arr.length - okCount
      const last = arr[arr.length - 1]
      const lastDesc = last.target ? `（最近：${last.target}）` : ''
      lines.push(`  ${failCount === 0 ? '✓' : '✗'} ${name} ×${arr.length}${lastDesc}${failCount > 0 ? ` — 失败 ${failCount} 次` : ''}`)
      const lastErr = [...arr].reverse().find((a) => !a.ok && a.error)
      if (lastErr?.error) lines.push(`      最后失败原因：${lastErr.error}`)
    }
  } else {
    lines.push('')
    lines.push('本轮没有留下任何工具调用（模型停在思考阶段）。')
  }

  const clue = lastText.replace(/\s+/g, ' ').trim()
  if (clue) {
    lines.push('')
    lines.push(`未完成线索（模型最后一段话）：${clue.slice(0, 200)}${clue.length > 200 ? '…' : ''}`)
  }
  return lines.join('\n')
}
