/**
 * AI provider abstraction layer.
 * Supports multiple AI backends: Anthropic, OpenAI, Ollama, Google, and custom endpoints.
 * Provides unified interface for completion, chat, and embedding.
 */

/* ── Types ─────────────────────────────────────────────── */

export type AIProvider = 'anthropic' | 'openai' | 'ollama' | 'google' | 'azure' | 'custom'

export interface AIModelConfig {
  provider: AIProvider
  modelId: string
  name: string
  maxTokens: number
  contextWindow: number
  supportsStreaming: boolean
  supportsVision: boolean
  supportsFunctionCalling: boolean
  costPer1kInput?: number
  costPer1kOutput?: number
}

export interface AIProviderConfig {
  provider: AIProvider
  apiKey?: string
  baseUrl?: string
  organization?: string
  defaultModel: string
  maxRetries: number
  timeout: number
  headers?: Record<string, string>
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function'
  content: string
  name?: string
  images?: string[]
}

export interface CompletionRequest {
  messages: ChatMessage[]
  model?: string
  maxTokens?: number
  temperature?: number
  topP?: number
  topK?: number
  stop?: string[]
  stream?: boolean
  tools?: ToolDefinition[]
}

export interface CompletionResponse {
  id: string
  content: string
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  finishReason: 'stop' | 'length' | 'tool_use' | 'error'
  toolCalls?: ToolCall[]
}

export interface StreamChunk {
  id: string
  delta: string
  finishReason?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface EmbeddingRequest {
  input: string | string[]
  model?: string
}

export interface EmbeddingResponse {
  embeddings: number[][]
  model: string
  usage: { totalTokens: number }
}

/* ── Available Models ─────────────────────────────────── */

export const AI_MODELS: AIModelConfig[] = [
  // Anthropic
  { provider: 'anthropic', modelId: 'claude-opus-4-6', name: 'Claude Opus 4.6', maxTokens: 16384, contextWindow: 200000, supportsStreaming: true, supportsVision: true, supportsFunctionCalling: true, costPer1kInput: 0.015, costPer1kOutput: 0.075 },
  { provider: 'anthropic', modelId: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', maxTokens: 16384, contextWindow: 200000, supportsStreaming: true, supportsVision: true, supportsFunctionCalling: true, costPer1kInput: 0.003, costPer1kOutput: 0.015 },
  { provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', maxTokens: 8192, contextWindow: 200000, supportsStreaming: true, supportsVision: true, supportsFunctionCalling: true, costPer1kInput: 0.001, costPer1kOutput: 0.005 },

  // OpenAI
  { provider: 'openai', modelId: 'gpt-4o', name: 'GPT-4o', maxTokens: 16384, contextWindow: 128000, supportsStreaming: true, supportsVision: true, supportsFunctionCalling: true, costPer1kInput: 0.005, costPer1kOutput: 0.015 },
  { provider: 'openai', modelId: 'gpt-4o-mini', name: 'GPT-4o mini', maxTokens: 16384, contextWindow: 128000, supportsStreaming: true, supportsVision: true, supportsFunctionCalling: true, costPer1kInput: 0.00015, costPer1kOutput: 0.0006 },
  { provider: 'openai', modelId: 'o3', name: 'o3', maxTokens: 100000, contextWindow: 200000, supportsStreaming: true, supportsVision: true, supportsFunctionCalling: true, costPer1kInput: 0.01, costPer1kOutput: 0.04 },
  { provider: 'openai', modelId: 'o4-mini', name: 'o4-mini', maxTokens: 100000, contextWindow: 200000, supportsStreaming: true, supportsVision: true, supportsFunctionCalling: true, costPer1kInput: 0.0011, costPer1kOutput: 0.0044 },

  // Google
  { provider: 'google', modelId: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', maxTokens: 65536, contextWindow: 1000000, supportsStreaming: true, supportsVision: true, supportsFunctionCalling: true, costPer1kInput: 0.00125, costPer1kOutput: 0.005 },
  { provider: 'google', modelId: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', maxTokens: 65536, contextWindow: 1000000, supportsStreaming: true, supportsVision: true, supportsFunctionCalling: true, costPer1kInput: 0.00015, costPer1kOutput: 0.0006 },

  // Ollama (local)
  { provider: 'ollama', modelId: 'llama3.3', name: 'Llama 3.3 70B', maxTokens: 8192, contextWindow: 128000, supportsStreaming: true, supportsVision: false, supportsFunctionCalling: true },
  { provider: 'ollama', modelId: 'codellama', name: 'Code Llama 34B', maxTokens: 4096, contextWindow: 16384, supportsStreaming: true, supportsVision: false, supportsFunctionCalling: false },
  { provider: 'ollama', modelId: 'deepseek-coder-v2', name: 'DeepSeek Coder V2', maxTokens: 8192, contextWindow: 128000, supportsStreaming: true, supportsVision: false, supportsFunctionCalling: true },
  { provider: 'ollama', modelId: 'qwen2.5-coder', name: 'Qwen 2.5 Coder', maxTokens: 8192, contextWindow: 32768, supportsStreaming: true, supportsVision: false, supportsFunctionCalling: false },
]

/* ── Provider Storage ─────────────────────────────────── */

const PROVIDER_CONFIG_KEY = 'orion:ai-providers'

export function getProviderConfigs(): Record<AIProvider, AIProviderConfig> {
  try {
    const stored = localStorage.getItem(PROVIDER_CONFIG_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}

  return {
    anthropic: { provider: 'anthropic', defaultModel: 'claude-sonnet-4-6', maxRetries: 3, timeout: 60000 },
    openai: { provider: 'openai', defaultModel: 'gpt-4o', maxRetries: 3, timeout: 60000 },
    ollama: { provider: 'ollama', baseUrl: 'http://localhost:11434', defaultModel: 'llama3.3', maxRetries: 2, timeout: 120000 },
    google: { provider: 'google', defaultModel: 'gemini-2.5-pro', maxRetries: 3, timeout: 60000 },
    azure: { provider: 'azure', defaultModel: 'gpt-4o', maxRetries: 3, timeout: 60000 },
    custom: { provider: 'custom', baseUrl: '', defaultModel: '', maxRetries: 2, timeout: 60000 },
  }
}

export function saveProviderConfig(provider: AIProvider, config: Partial<AIProviderConfig>): void {
  const configs = getProviderConfigs()
  configs[provider] = { ...configs[provider], ...config }
  localStorage.setItem(PROVIDER_CONFIG_KEY, JSON.stringify(configs))
}

export function getActiveProvider(): AIProvider {
  try {
    return (localStorage.getItem('orion:active-ai-provider') as AIProvider) || 'anthropic'
  } catch {
    return 'anthropic'
  }
}

export function setActiveProvider(provider: AIProvider): void {
  localStorage.setItem('orion:active-ai-provider', provider)
}

/* ── API Abstraction ──────────────────────────────────── */

const api = () => (window as any).api

export async function complete(request: CompletionRequest): Promise<CompletionResponse> {
  const provider = getActiveProvider()
  const config = getProviderConfigs()[provider]

  const model = request.model || config.defaultModel

  try {
    const result = await api()?.aiComplete?.({
      provider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model,
      messages: request.messages,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      topP: request.topP,
      stop: request.stop,
      tools: request.tools,
    })

    return {
      id: result?.id || `resp-${Date.now()}`,
      content: result?.content || '',
      model,
      usage: {
        inputTokens: result?.usage?.inputTokens || 0,
        outputTokens: result?.usage?.outputTokens || 0,
        totalTokens: (result?.usage?.inputTokens || 0) + (result?.usage?.outputTokens || 0),
      },
      finishReason: result?.finishReason || 'stop',
      toolCalls: result?.toolCalls,
    }
  } catch (err: any) {
    throw new AIError(provider, err.message || 'Completion failed', err.status)
  }
}

export async function* streamComplete(request: CompletionRequest): AsyncGenerator<StreamChunk> {
  const provider = getActiveProvider()
  const config = getProviderConfigs()[provider]
  const model = request.model || config.defaultModel

  const streamId = await api()?.aiStreamStart?.({
    provider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model,
    messages: request.messages,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
    stop: request.stop,
    stream: true,
  })

  if (!streamId) throw new AIError(provider, 'Failed to start stream')

  while (true) {
    const chunk = await api()?.aiStreamNext?.(streamId)
    if (!chunk) break
    if (chunk.error) throw new AIError(provider, chunk.error)
    if (chunk.done) break

    yield {
      id: streamId,
      delta: chunk.delta || '',
      finishReason: chunk.finishReason,
    }
  }
}

export async function embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
  const provider = getActiveProvider()
  const config = getProviderConfigs()[provider]

  const result = await api()?.aiEmbed?.({
    provider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: request.model || 'text-embedding-3-small',
    input: request.input,
  })

  return {
    embeddings: result?.embeddings || [],
    model: request.model || 'text-embedding-3-small',
    usage: { totalTokens: result?.usage?.totalTokens || 0 },
  }
}

/* ── Convenience Functions ────────────────────────────── */

export async function generateCode(prompt: string, language: string, context?: string): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are an expert ${language} programmer. Generate clean, production-quality code. Only output the code, no explanations.`,
    },
  ]

  if (context) {
    messages.push({ role: 'user', content: `Context:\n\`\`\`${language}\n${context}\n\`\`\`` })
  }

  messages.push({ role: 'user', content: prompt })

  const response = await complete({ messages, maxTokens: 4096, temperature: 0.2 })

  // Extract code from response
  const codeMatch = response.content.match(/```(?:\w+)?\n([\s\S]*?)```/)
  return codeMatch ? codeMatch[1].trim() : response.content.trim()
}

export async function explainCode(code: string, language: string): Promise<string> {
  const response = await complete({
    messages: [
      { role: 'system', content: 'Explain the following code concisely. Focus on what it does, not how.' },
      { role: 'user', content: `\`\`\`${language}\n${code}\n\`\`\`` },
    ],
    maxTokens: 1024,
    temperature: 0.3,
  })

  return response.content
}

export async function suggestFix(code: string, error: string, language: string): Promise<string> {
  const response = await complete({
    messages: [
      { role: 'system', content: `You are a ${language} debugging expert. Fix the error in the code. Only output the fixed code.` },
      { role: 'user', content: `Error: ${error}\n\nCode:\n\`\`\`${language}\n${code}\n\`\`\`` },
    ],
    maxTokens: 4096,
    temperature: 0.1,
  })

  const codeMatch = response.content.match(/```(?:\w+)?\n([\s\S]*?)```/)
  return codeMatch ? codeMatch[1].trim() : response.content.trim()
}

export async function generateCommitMessage(diff: string): Promise<string> {
  const response = await complete({
    messages: [
      { role: 'system', content: 'Generate a concise conventional commit message for this diff. Format: type(scope): description. No body needed.' },
      { role: 'user', content: `Diff:\n${diff.slice(0, 4000)}` },
    ],
    maxTokens: 200,
    temperature: 0.3,
  })

  return response.content.trim()
}

export async function reviewCode(code: string, language: string): Promise<string> {
  const response = await complete({
    messages: [
      { role: 'system', content: 'Review the following code. Focus on bugs, security issues, performance problems, and maintainability. Be concise.' },
      { role: 'user', content: `\`\`\`${language}\n${code}\n\`\`\`` },
    ],
    maxTokens: 2048,
    temperature: 0.4,
  })

  return response.content
}

/* ── Cost Estimation ──────────────────────────────────── */

export function estimateCost(inputTokens: number, outputTokens: number, modelId?: string): number {
  const model = AI_MODELS.find(m => m.modelId === (modelId || getProviderConfigs()[getActiveProvider()].defaultModel))
  if (!model?.costPer1kInput || !model?.costPer1kOutput) return 0

  return (inputTokens / 1000) * model.costPer1kInput + (outputTokens / 1000) * model.costPer1kOutput
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${(cost * 100).toFixed(2)}c`
  return `$${cost.toFixed(4)}`
}

/* ── Token Usage Tracking ─────────────────────────────── */

const USAGE_KEY = 'orion:ai-usage'

interface UsageRecord {
  date: string
  provider: AIProvider
  model: string
  inputTokens: number
  outputTokens: number
  cost: number
  requests: number
}

export function trackUsage(provider: AIProvider, model: string, inputTokens: number, outputTokens: number): void {
  try {
    const date = new Date().toISOString().split('T')[0]
    const records: UsageRecord[] = JSON.parse(localStorage.getItem(USAGE_KEY) || '[]')

    const existing = records.find(r => r.date === date && r.provider === provider && r.model === model)
    if (existing) {
      existing.inputTokens += inputTokens
      existing.outputTokens += outputTokens
      existing.cost += estimateCost(inputTokens, outputTokens, model)
      existing.requests++
    } else {
      records.push({
        date,
        provider,
        model,
        inputTokens,
        outputTokens,
        cost: estimateCost(inputTokens, outputTokens, model),
        requests: 1,
      })
    }

    // Keep last 90 days
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const filtered = records.filter(r => r.date >= cutoff.toISOString().split('T')[0])

    localStorage.setItem(USAGE_KEY, JSON.stringify(filtered))
  } catch {}
}

export function getUsageHistory(days = 30): UsageRecord[] {
  try {
    const records: UsageRecord[] = JSON.parse(localStorage.getItem(USAGE_KEY) || '[]')
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return records.filter(r => r.date >= cutoff.toISOString().split('T')[0])
  } catch {
    return []
  }
}

export function getTotalUsage(days = 30): { totalTokens: number; totalCost: number; totalRequests: number } {
  const records = getUsageHistory(days)
  return {
    totalTokens: records.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0),
    totalCost: records.reduce((sum, r) => sum + r.cost, 0),
    totalRequests: records.reduce((sum, r) => sum + r.requests, 0),
  }
}

/* ── Error Type ───────────────────────────────────────── */

export class AIError extends Error {
  constructor(
    public provider: AIProvider,
    message: string,
    public status?: number,
  ) {
    super(message)
    this.name = 'AIError'
  }
}

/* ── Model Helpers ────────────────────────────────────── */

export function getModelsForProvider(provider: AIProvider): AIModelConfig[] {
  return AI_MODELS.filter(m => m.provider === provider)
}

export function getModelById(modelId: string): AIModelConfig | undefined {
  return AI_MODELS.find(m => m.modelId === modelId)
}

export function getDefaultModel(): AIModelConfig {
  const provider = getActiveProvider()
  const config = getProviderConfigs()[provider]
  return AI_MODELS.find(m => m.modelId === config.defaultModel) || AI_MODELS[0]
}

export function isLocalModel(modelId: string): boolean {
  const model = getModelById(modelId)
  return model?.provider === 'ollama'
}
