/**
 * Flare 引擎库入口（@flare/core）
 *
 * 导出 Flare 的 Agent 引擎公共 API，供外部应用（如 Pulse / StorySpire）集成：
 *   import { Agent, createProvider, Tool, MemoryStore } from 'flare-agent'
 *
 * CLI 是第一个消费者（src/cli/index.ts 从这里 import）。
 */

// ===== Agent 引擎 =====
export { Agent, type AgentConfig } from './core/agent.js'

// ===== LLM 抽象 =====
export {
  createProvider,
  createVisionProvider,
  OpenAIProvider,
  resolveProviderOptions,
  estimateCostUsd,
  extractUsageCache,
  type LLMProvider,
  type LLMResponse,
  type Message,
  type MessageRole,
  type ToolCall,
  type ToolDefinition,
  type ProviderOptions,
  type ResolvedProviderOptions,
} from './core/llm.js'

// ===== 多模态 / 图片识别（v0.4.0）=====
export {
  parseAttachments,
  buildImageContent,
  fileToDataUrl,
  resolveImagePath,
  isImageFile,
  IMAGE_EXTENSIONS,
  type ContentPart,
  type ParsedInput,
} from './core/llm.js'

export {
  tools,
  getToolDefinitions,
  executeTool,
  readFileTool,
  writeFileTool,
  searchFilesTool,
  terminalTool,
  type Tool,
  type ToolResult,
  type ToolExecutor,
} from './tools/index.js'

// ===== 网络工具集（M3：Pulse 网络专家）=====
export {
  networkTools,
  httpRequestTool,
  urlParseTool,
  responseAnalyzeTool,
} from './tools/network.js'

// ===== 写作工具集（M4：StorySpire 写作专家）=====
export {
  storyTools,
  storyToolDefinitions,
  getStoryToolDefinitions,
} from './tools/story.js'

// ===== 记忆检索工具（RAG，v0.5.1）=====
export {
  memorySearchTool,
  createMemorySearchTool,
  type MemorySearchScope,
  type MemorySearchArgs,
} from './tools/memory.js'

// ===== MCP 协议支持（v0.5.5）：外部 MCP 服务器工具桥接 =====
export { MCPClient } from './mcp/client.js'
export type { MCPClientOptions } from './mcp/client.js'
export { McpManager, loadMcpConfig } from './mcp/manager.js'
export type { McpManagerOptions } from './mcp/manager.js'
export { createMcpTools, mcpContentToText } from './tools/mcp.js'
export type { McpToolClient } from './tools/mcp.js'
export type {
  McpServerConfig,
  McpConfigFile,
  McpTool,
  McpContentItem,
  McpCallResult,
  McpServerStatus,
  McpResource,
  McpResourceContents,
  McpResourceInfo,
  McpResourceRef,
  McpResourceTemplate,
  McpResourceTemplateInfo,
  McpResourceTemplateRef,
  McpPromptRef,
  McpPrompt,
  McpPromptArgument,
  McpPromptMessage,
  McpPromptInfo,
  McpPromptResult,
  McpCompletionResult,
  McpToolRef,
  McpRoot,
  McpRootsResult,
  McpLogLevel,
  McpLogMessage,
  McpSamplingContent,
  McpSamplingMessage,
  McpModelPreferences,
  McpSamplingRequest,
  McpSamplingResult,
  McpProgressParams,
  McpCancelledParams,
  McpCallOptions,
} from './mcp/types.js'

// ===== MCP 服务器端（v0.5.8）：flare 工具集经 MCP 标准协议暴露给外部客户端 =====
export { MCPServer, toMcpTool, startMcpServer, MCP_LOG_LEVELS, MCP_DEFAULT_LOG_LEVEL, matchResourceTemplate } from './mcp/server.js'
export type { MCPServerOptions, McpResourceProvider } from './mcp/server.js'
// MCP HTTP transport（v0.6.3）：POST /mcp 同步 JSON-RPC，复用同一 MCPServer 核心
export { startMcpHttpServer } from './mcp/http.js'
export type { McpHttpServerOptions, McpHttpServerHandle } from './mcp/http.js'
// MCP HTTP 客户端（v0.6.4）：与 stdio MCPClient 接口对称，连 HTTP transport 服务器
export { MCPHttpClient } from './mcp/http-client.js'
export type { MCPHttpClientOptions } from './mcp/http-client.js'

// ===== 上下文可观测性（v0.5.6/v0.5.9/v0.6.17/v0.6.19）：token 估算 + 裁剪建议/自动裁剪/压缩摘要 =====
export {
  estimateTokens,
  estimateMessagesTokens,
  suggestTrim,
  trimContextMessages,
  summarizeTrimmedMessages,
  buildSummaryText,
  SUMMARY_MARKER,
  IMAGE_TOKEN_COST,
  MESSAGE_STRUCTURE_TOKENS,
  TOOL_CALL_STRUCTURE_TOKENS,
} from './core/context.js'
export type { TrimSuggestion, SuggestTrimOptions, TrimContextOptions, SummarizeOptions, TrimStats } from './core/context.js'

// ===== 工具输出治理（v0.6.30）：按工具类型定制工具结果截断策略 =====
export { truncateToolOutput, toolOutputKind, DEFAULT_ELLIPSIS, validateToolOutputPolicy } from './core/tool-output.js'
export type { ToolOutputPolicy, ToolOutputKind } from './core/tool-output.js'

// ===== 模型可观测性（v0.6.0）：本地 Ollama 模型列表查询（flare models 命令 / 宿主面板）=====
export {
  listOllamaModels,
  formatModelSize,
  OLLAMA_DEFAULT_BASE,
  detectProvider,
  inferModelCapabilities,
} from './core/models.js'
export type {
  OllamaModelInfo,
  OllamaModelsResult,
  ModelCapability,
} from './core/models.js'

// ===== 本地小模型路由（v0.6.134 混合模式）：任务复杂度分类 + 路由决策（纯函数，零网络）=====
export { classifyTaskComplexity, classifyTaskDetail, routeTaskModel } from './core/routing.js'
export type { TaskComplexity, TaskClassification, RouteTaskResult } from './core/routing.js'

// ===== 记忆系统 =====
export { MemoryStore, getMemoryStore, serializeContent, deserializeContent, trigramJaccard } from './memory/store.js'
export type { UsageExtra, SimilarMemoryPair } from './memory/store.js'

// ===== 配置（M2 将解耦为可注入；先导出保留现状）=====
export { config } from './core/config.js'

// ===== 专家配置（Expert Profile）=====
export type { ExpertProfile } from './types.js'
export { profileToConfig } from './types.js'

// ===== 工具确认机制（withConfirmation / ConfirmationGate）=====
export { withConfirmation, isDenied, ConfirmationGate } from './core/confirm.js'
export type {
  ConfirmDecision,
  Confirmer,
  ConfirmationGateOptions,
  ConfirmKeyValueStore,
  WithConfirmationOptions,
} from './core/confirm.js'
export { memoryStoreKv } from './core/confirm.js'

// ===== 宿主协议服务（Qt 等非 Node 宿主）=====
// v0.6.136：detectProvider 已从 core/models.js 直接导出（server.ts re-export 保持兼容，此处不再重复）
export { startHostServer, wrapConfirmTools, DEFAULT_CONFIRM_TOOLS, collectModelInfo, describeTools, buildConfirmEvent, buildRiskConfirmEvent, mapHostRiskDecision, RISK_CONFIRM_TOOL_NAME, RISK_CONFIRM_ID_PREFIX } from './server.js'
export type { HostServerOptions, ModelEndpointInfo, ModelInfoResponse, ToolMeta, ToolSourceSets, ConfirmEvent } from './server.js'

// ===== 命令风险分级（v0.6.155）：block / confirm / safe 三档 + shell 分段判定 =====
export {
  classifyCommand,
  parseCommandSegments,
  commandPlainText,
  detectFalseSuccess,
  setRiskConfirmer,
  getRiskConfirmer,
  setRiskAllowanceStore,
  isRiskRuleAllowed,
  allowRiskRule,
  revokeRiskRule,
  listRiskAllowed,
  resetRiskSession,
  allRuleIds,
} from './tools/risk.js'
export type { RiskLevel, RiskVerdict, RiskDecision, RiskConfirmInfo, RiskConfirmer, CommandSegment } from './tools/risk.js'
