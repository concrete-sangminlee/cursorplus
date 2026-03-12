/**
 * AI-powered code completion engine for Orion IDE.
 * Provides intelligent, multi-line ghost text completions similar to GitHub Copilot.
 * Supports multiple AI backends, FIM prompt formatting, caching, cancellation,
 * partial accept, inline diff preview, and smart triggering heuristics.
 */

import { create } from 'zustand'
import type { AIProvider } from './aiProviders'
import { getProviderConfigs, AI_MODELS } from './aiProviders'
import { countTokens, type ModelFamily } from './tokenizer'

/* ── Types ─────────────────────────────────────────────── */

export type CompletionStatus = 'idle' | 'gathering-context' | 'requesting' | 'streaming' | 'ready' | 'error' | 'cancelled' | 'rate-limited'
export type CompletionDismissReason = 'escape' | 'typing' | 'cursor-move' | 'focus-lost' | 'new-request' | 'manual'
export type AcceptMode = 'full' | 'line' | 'word'

export interface CursorPosition { line: number; column: number; offset: number }

export interface CompletionContext {
  fileContent: string
  prefix: string
  suffix: string
  filePath: string
  languageId: string
  cursor: CursorPosition
  imports: string[]
  openFilesContext: OpenFileSnippet[]
  currentLine: string
  indentLevel: number
  indentUnit: string
}

export interface OpenFileSnippet {
  filePath: string
  languageId: string
  content: string
  relevance: number
}

export interface CompletionResult {
  text: string
  lines: string[]
  provider: AIProvider
  model: string
  promptTokens: number
  completionTokens: number
  latencyMs: number
  totalTimeMs: number
  completionId: string
  timestamp: number
}

export interface CompletionCacheEntry {
  contextHash: string
  result: CompletionResult
  hitCount: number
  createdAt: number
  lastAccessedAt: number
}

export interface InlineDiffSegment { type: 'equal' | 'insert'; text: string }

export interface GhostTextState {
  text: string
  lines: string[]
  acceptedLineIndex: number
  acceptedWordCount: number
  remainingText: string
  diffSegments: InlineDiffSegment[]
  anchorLine: number
  anchorColumn: number
}

export interface CompletionTelemetryEvent {
  type: 'shown' | 'accepted' | 'partially-accepted' | 'dismissed' | 'error'
  completionId: string
  provider: AIProvider
  model: string
  languageId: string
  promptTokens: number
  completionTokens: number
  latencyMs: number
  acceptMode?: AcceptMode
  dismissReason?: CompletionDismissReason
  linesAccepted?: number
  totalLines?: number
  timestamp: number
}

export interface CompletionTelemetrySummary {
  totalShown: number
  totalAccepted: number
  totalPartiallyAccepted: number
  totalDismissed: number
  totalErrors: number
  acceptanceRate: number
  averageLatencyMs: number
  totalPromptTokens: number
  totalCompletionTokens: number
  byLanguage: Record<string, { shown: number; accepted: number; rate: number }>
  byProvider: Record<string, { shown: number; accepted: number; rate: number; avgLatency: number }>
}

export interface RateLimitState {
  requestCount: number
  windowStart: number
  maxRequestsPerWindow: number
  windowDurationMs: number
  quotaTokensUsed: number
  quotaTokensLimit: number
}

export interface LanguageCompletionConfig {
  enabled: boolean
  triggerCharacters?: string[]
  stopSequences?: string[]
  maxLines?: number
  promptTemplate?: string
}

export interface AICompletionSettings {
  enabled: boolean
  provider: AIProvider
  modelId: string
  debounceMs: number
  temperature: number
  maxCompletionTokens: number
  maxContextTokens: number
  multiLine: boolean
  maxCompletionLines: number
  commentToCode: boolean
  languageOverrides: Record<string, LanguageCompletionConfig>
  showInlineDiff: boolean
  autoDismissMs: number
  cacheMaxEntries: number
  cacheTtlMs: number
  rateLimitPerMinute: number
  dailyTokenQuota: number
}

export interface FIMPrompt {
  prompt: string
  prefix: string
  suffix: string
  tokenCount: number
}

/* ── FIM Token Formats ─────────────────────────────────── */

const FIM_TOKENS: Record<string, { prefix: string; suffix: string; middle: string }> = {
  anthropic: { prefix: '<|fim_prefix|>', suffix: '<|fim_suffix|>', middle: '<|fim_middle|>' },
  openai: { prefix: '<|fim_prefix|>', suffix: '<|fim_suffix|>', middle: '<|fim_middle|>' },
  ollama_codellama: { prefix: '<PRE> ', suffix: ' <SUF>', middle: ' <MID>' },
  ollama_deepseek: { prefix: '<|fim▁begin|>', suffix: '<|fim▁hole|>', middle: '<|fim▁end|>' },
  ollama_qwen: { prefix: '<fim_prefix>', suffix: '<fim_suffix>', middle: '<fim_middle>' },
  ollama_default: { prefix: '<|fim_prefix|>', suffix: '<|fim_suffix|>', middle: '<|fim_middle|>' },
}

/* ── Language-aware Prompts ────────────────────────────── */

const LANGUAGE_PROMPTS: Record<string, string> = {
  typescript: 'You are an expert TypeScript developer. Follow TypeScript best practices, use proper types, and prefer functional patterns.',
  typescriptreact: 'You are an expert React/TypeScript developer. Use React 19 patterns, proper hooks, and TypeScript strict typing.',
  javascript: 'You are an expert JavaScript developer. Use modern ES2024+ syntax, async/await, and clean functional patterns.',
  javascriptreact: 'You are an expert React/JavaScript developer. Use modern React patterns with hooks and functional components.',
  python: 'You are an expert Python developer. Follow PEP 8, use type hints, and prefer Pythonic idioms.',
  rust: 'You are an expert Rust developer. Prioritize memory safety, use idiomatic patterns, handle errors with Result types.',
  go: 'You are an expert Go developer. Follow Go conventions, handle errors explicitly, and keep code simple.',
  java: 'You are an expert Java developer. Follow Java conventions and handle exceptions properly.',
  cpp: 'You are an expert C++ developer. Use modern C++20/23 features, RAII patterns, avoid undefined behavior.',
  c: 'You are an expert C developer. Follow C best practices, manage memory carefully, validate all inputs.',
  csharp: 'You are an expert C# developer. Use modern C# features, async/await, and LINQ where appropriate.',
  swift: 'You are an expert Swift developer. Use Swift idioms, value types, and protocol-oriented programming.',
  kotlin: 'You are an expert Kotlin developer. Use Kotlin idioms, coroutines, and null-safety features.',
  ruby: 'You are an expert Ruby developer. Follow Ruby idioms and conventions.',
  php: 'You are an expert PHP developer. Use modern PHP 8+ features and follow PSR standards.',
  html: 'You are an expert HTML developer. Write semantic, accessible HTML following WCAG guidelines.',
  css: 'You are an expert CSS developer. Use modern CSS features, custom properties, and logical properties.',
  sql: 'You are an expert SQL developer. Write efficient, well-structured queries.',
}

/* ── Smart Triggering Data ─────────────────────────────── */

const SUPPRESS_AFTER_TOKENS = [';', '{', '}', '(', ')', '[', ']', ',', ':', '?', '!', '&&', '||', '??', '=>', '->']

const STRING_CONTEXT_PATTERNS: RegExp[] = [
  /(?:^|[^\\])"(?:[^"\\]|\\.)*$/,
  /(?:^|[^\\])'(?:[^'\\]|\\.)*$/,
  /(?:^|[^\\])`(?:[^`\\]|\\.)*$/,
  /"""[\s\S]*$/,
  /'''[\s\S]*$/,
]

const COMMENT_CONTEXT_PATTERNS: Record<string, RegExp[]> = {
  default: [/\/\/[^\n]*$/, /\/\*[\s\S]*?(?!\*\/)$/],
  python: [/#[^\n]*$/, /"""[\s\S]*?(?!""")$/],
  ruby: [/#[^\n]*$/, /=begin[\s\S]*?(?!=end)$/],
  html: [/<!--[\s\S]*?(?!-->)$/],
  css: [/\/\*[\s\S]*?(?!\*\/)$/],
}

const COMMENT_LINE_PATTERNS: Record<string, RegExp> = {
  default: /^\s*\/\/\s*.+/, python: /^\s*#\s*.+/, ruby: /^\s*#\s*.+/,
  lua: /^\s*--\s*.+/, html: /^\s*<!--\s*.+/, css: /^\s*\/\*\s*.+/, sql: /^\s*--\s*.+/,
}

/* ── Utility Functions ─────────────────────────────────── */

let _completionIdCounter = 0
function generateCompletionId(): string {
  return `cmp_${Date.now()}_${++_completionIdCounter}`
}

function hashContext(prefix: string, suffix: string, filePath: string): string {
  let hash = 0
  const str = `${filePath}::${prefix.slice(-500)}::${suffix.slice(0, 200)}`
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return `ctx_${hash.toString(36)}`
}

function extractImports(content: string, languageId: string): string[] {
  const imports: string[] = []
  const lines = content.split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    const isImport =
      /^import\s/.test(t) ||
      /^(const|let|var)\s.*=\s*require\(/.test(t) ||
      (languageId === 'python' && /^from\s.*import\s/.test(t)) ||
      (languageId === 'rust' && /^use\s/.test(t)) ||
      (languageId === 'csharp' && /^using\s/.test(t)) ||
      ((languageId === 'c' || languageId === 'cpp') && /^#include\s/.test(t))
    if (isImport) { imports.push(t); continue }
    if (imports.length > 0 && !/^\s*(\/\/|\/\*|\*|#|--|$)/.test(t)) break
  }
  return imports
}

function detectIndentation(content: string): { unit: string; size: number } {
  const lines = content.split('\n').filter(l => l.trim().length > 0).slice(0, 50)
  let tabCount = 0, spaceCount = 0, fourSpace = 0, twoSpace = 0
  for (const line of lines) {
    if (line.startsWith('\t')) tabCount++
    else if (line.startsWith('  ')) {
      spaceCount++
      const m = line.match(/^( +)/)
      if (m) { if (m[1].length % 4 === 0) fourSpace++; else if (m[1].length % 2 === 0) twoSpace++ }
    }
  }
  if (tabCount > spaceCount) return { unit: '\t', size: 1 }
  const size = fourSpace >= twoSpace ? 4 : 2
  return { unit: ' '.repeat(size), size }
}

function getLeadingWhitespace(line: string): number {
  const m = line.match(/^(\s*)/)
  return m ? m[1].length : 0
}

function isInsideString(text: string): boolean {
  const recent = text.slice(-200)
  return STRING_CONTEXT_PATTERNS.some(p => p.test(recent))
}

function isInsideComment(text: string, lang: string): boolean {
  const recent = text.slice(-300)
  return (COMMENT_CONTEXT_PATTERNS[lang] ?? COMMENT_CONTEXT_PATTERNS.default).some(p => p.test(recent))
}

function isCommentLine(line: string, lang: string): boolean {
  return (COMMENT_LINE_PATTERNS[lang] ?? COMMENT_LINE_PATTERNS.default).test(line)
}

function shouldSuppressTrigger(text: string): boolean {
  const trimmed = text.trimEnd()
  if (!trimmed) return false
  return SUPPRESS_AFTER_TOKENS.some(t => trimmed.endsWith(t))
}

function computeInlineDiffSegments(existing: string, completion: string): InlineDiffSegment[] {
  const segments: InlineDiffSegment[] = []
  if (!existing) {
    if (completion) segments.push({ type: 'insert', text: completion })
    return segments
  }
  let commonLen = 0
  const maxLen = Math.min(existing.length, completion.length)
  while (commonLen < maxLen && existing[commonLen] === completion[commonLen]) commonLen++
  if (commonLen > 0) segments.push({ type: 'equal', text: existing.slice(0, commonLen) })
  const remaining = completion.slice(commonLen)
  if (remaining) segments.push({ type: 'insert', text: remaining })
  return segments
}

function getModelFamily(provider: AIProvider, modelId: string): ModelFamily {
  if (provider === 'anthropic') return 'claude'
  if (provider === 'google') return 'gemini'
  if (provider === 'openai') return modelId.includes('gpt-4') || modelId.startsWith('o') ? 'gpt4' : 'gpt3.5'
  if (provider === 'ollama') return modelId.includes('mistral') ? 'mistral' : 'llama'
  return 'gpt4'
}

function getFIMTokens(provider: AIProvider, modelId: string) {
  if (provider === 'ollama') {
    if (modelId.includes('codellama')) return FIM_TOKENS.ollama_codellama
    if (modelId.includes('deepseek')) return FIM_TOKENS.ollama_deepseek
    if (modelId.includes('qwen')) return FIM_TOKENS.ollama_qwen
    return FIM_TOKENS.ollama_default
  }
  return FIM_TOKENS[provider] ?? FIM_TOKENS.openai
}

/* ── Completion Cache ──────────────────────────────────── */

export class CompletionCache {
  private entries = new Map<string, CompletionCacheEntry>()
  constructor(private maxEntries = 100, private ttlMs = 300_000) {}

  get(contextHash: string): CompletionResult | null {
    const entry = this.entries.get(contextHash)
    if (!entry) return null
    if (Date.now() - entry.createdAt > this.ttlMs) { this.entries.delete(contextHash); return null }
    entry.hitCount++
    entry.lastAccessedAt = Date.now()
    return entry.result
  }

  set(contextHash: string, result: CompletionResult): void {
    if (this.entries.size >= this.maxEntries) this.evictOldest()
    this.entries.set(contextHash, { contextHash, result, hitCount: 0, createdAt: Date.now(), lastAccessedAt: Date.now() })
  }

  has(contextHash: string): boolean {
    const entry = this.entries.get(contextHash)
    if (!entry) return false
    if (Date.now() - entry.createdAt > this.ttlMs) { this.entries.delete(contextHash); return false }
    return true
  }

  invalidate(contextHash: string): void { this.entries.delete(contextHash) }
  clear(): void { this.entries.clear() }
  get size(): number { return this.entries.size }

  getStats(): { size: number; totalHits: number; oldestMs: number } {
    let totalHits = 0, oldest = Date.now()
    this.entries.forEach(entry => {
      totalHits += entry.hitCount
      if (entry.createdAt < oldest) oldest = entry.createdAt
    })
    return { size: this.entries.size, totalHits, oldestMs: this.entries.size > 0 ? Date.now() - oldest : 0 }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null, oldestTime = Infinity
    this.entries.forEach((entry, key) => {
      if (entry.lastAccessedAt < oldestTime) { oldestTime = entry.lastAccessedAt; oldestKey = key }
    })
    if (oldestKey) this.entries.delete(oldestKey)
  }

  prune(): number {
    const now = Date.now()
    let pruned = 0
    const toDelete: string[] = []
    this.entries.forEach((entry, key) => { if (now - entry.createdAt > this.ttlMs) toDelete.push(key) })
    toDelete.forEach(key => { this.entries.delete(key); pruned++ })
    return pruned
  }
}

/* ── Telemetry Tracker ─────────────────────────────────── */

export class CompletionTelemetry {
  private events: CompletionTelemetryEvent[] = []
  private maxEvents = 5000
  private flushCallbacks: Array<(events: CompletionTelemetryEvent[]) => void> = []

  record(event: CompletionTelemetryEvent): void {
    this.events.push(event)
    if (this.events.length > this.maxEvents) this.events = this.events.slice(-this.maxEvents)
  }

  trackShown(result: CompletionResult, languageId: string): void {
    this.record({ type: 'shown', completionId: result.completionId, provider: result.provider, model: result.model, languageId, promptTokens: result.promptTokens, completionTokens: result.completionTokens, latencyMs: result.latencyMs, timestamp: Date.now() })
  }

  trackAccepted(result: CompletionResult, languageId: string, mode: AcceptMode, linesAccepted: number): void {
    this.record({ type: mode === 'full' ? 'accepted' : 'partially-accepted', completionId: result.completionId, provider: result.provider, model: result.model, languageId, promptTokens: result.promptTokens, completionTokens: result.completionTokens, latencyMs: result.latencyMs, acceptMode: mode, linesAccepted, totalLines: result.lines.length, timestamp: Date.now() })
  }

  trackDismissed(result: CompletionResult, languageId: string, reason: CompletionDismissReason): void {
    this.record({ type: 'dismissed', completionId: result.completionId, provider: result.provider, model: result.model, languageId, promptTokens: result.promptTokens, completionTokens: result.completionTokens, latencyMs: result.latencyMs, dismissReason: reason, timestamp: Date.now() })
  }

  trackError(provider: AIProvider, model: string, languageId: string, latencyMs: number): void {
    this.record({ type: 'error', completionId: generateCompletionId(), provider, model, languageId, promptTokens: 0, completionTokens: 0, latencyMs, timestamp: Date.now() })
  }

  getSummary(sinceMs?: number): CompletionTelemetrySummary {
    const cutoff = sinceMs ? Date.now() - sinceMs : 0
    const relevant = this.events.filter(e => e.timestamp >= cutoff)
    const shown = relevant.filter(e => e.type === 'shown')
    const accepted = relevant.filter(e => e.type === 'accepted')
    const partial = relevant.filter(e => e.type === 'partially-accepted')
    const dismissed = relevant.filter(e => e.type === 'dismissed')
    const errors = relevant.filter(e => e.type === 'error')
    const totalLatency = shown.reduce((s, e) => s + e.latencyMs, 0)

    const byLanguage: Record<string, { shown: number; accepted: number; rate: number }> = {}
    const byProvider: Record<string, { shown: number; accepted: number; rate: number; avgLatency: number }> = {}

    for (const event of relevant) {
      if (!byLanguage[event.languageId]) byLanguage[event.languageId] = { shown: 0, accepted: 0, rate: 0 }
      if (event.type === 'shown') byLanguage[event.languageId].shown++
      if (event.type === 'accepted') byLanguage[event.languageId].accepted++

      if (!byProvider[event.provider]) byProvider[event.provider] = { shown: 0, accepted: 0, rate: 0, avgLatency: 0 }
      if (event.type === 'shown') byProvider[event.provider].shown++
      if (event.type === 'accepted') byProvider[event.provider].accepted++
    }
    for (const lang of Object.values(byLanguage)) lang.rate = lang.shown > 0 ? lang.accepted / lang.shown : 0
    for (const prov of Object.keys(byProvider)) {
      const p = byProvider[prov]
      p.rate = p.shown > 0 ? p.accepted / p.shown : 0
      const pl = shown.filter(e => e.provider === prov)
      p.avgLatency = pl.length > 0 ? pl.reduce((s, e) => s + e.latencyMs, 0) / pl.length : 0
    }

    return {
      totalShown: shown.length, totalAccepted: accepted.length, totalPartiallyAccepted: partial.length,
      totalDismissed: dismissed.length, totalErrors: errors.length,
      acceptanceRate: shown.length > 0 ? accepted.length / shown.length : 0,
      averageLatencyMs: shown.length > 0 ? totalLatency / shown.length : 0,
      totalPromptTokens: relevant.reduce((s, e) => s + e.promptTokens, 0),
      totalCompletionTokens: relevant.reduce((s, e) => s + e.completionTokens, 0),
      byLanguage, byProvider,
    }
  }

  onFlush(callback: (events: CompletionTelemetryEvent[]) => void): () => void {
    this.flushCallbacks.push(callback)
    return () => { const i = this.flushCallbacks.indexOf(callback); if (i >= 0) this.flushCallbacks.splice(i, 1) }
  }

  flush(): void {
    if (this.events.length === 0) return
    const batch = [...this.events]
    for (const cb of this.flushCallbacks) { try { cb(batch) } catch { /* swallow */ } }
  }

  clear(): void { this.events = [] }
  get eventCount(): number { return this.events.length }
}

/* ── Rate Limiter ──────────────────────────────────────── */

export class CompletionRateLimiter {
  private state: RateLimitState

  constructor(maxPerMinute = 20, dailyTokenQuota = 0) {
    this.state = { requestCount: 0, windowStart: Date.now(), maxRequestsPerWindow: maxPerMinute, windowDurationMs: 60_000, quotaTokensUsed: 0, quotaTokensLimit: dailyTokenQuota }
  }

  canMakeRequest(): boolean {
    this.maybeResetWindow()
    if (this.state.requestCount >= this.state.maxRequestsPerWindow) return false
    if (this.state.quotaTokensLimit > 0 && this.state.quotaTokensUsed >= this.state.quotaTokensLimit) return false
    return true
  }

  recordRequest(tokensUsed: number): void {
    this.maybeResetWindow()
    this.state.requestCount++
    this.state.quotaTokensUsed += tokensUsed
  }

  getTimeUntilNextSlot(): number {
    this.maybeResetWindow()
    if (this.state.requestCount < this.state.maxRequestsPerWindow) return 0
    return this.state.windowDurationMs - (Date.now() - this.state.windowStart)
  }

  getQuotaUsage(): { used: number; limit: number; percentage: number } {
    return { used: this.state.quotaTokensUsed, limit: this.state.quotaTokensLimit, percentage: this.state.quotaTokensLimit > 0 ? (this.state.quotaTokensUsed / this.state.quotaTokensLimit) * 100 : 0 }
  }

  resetQuota(): void { this.state.quotaTokensUsed = 0 }

  updateLimits(maxPerMinute: number, dailyTokenQuota: number): void {
    this.state.maxRequestsPerWindow = maxPerMinute
    this.state.quotaTokensLimit = dailyTokenQuota
  }

  private maybeResetWindow(): void {
    if (Date.now() - this.state.windowStart >= this.state.windowDurationMs) {
      this.state.requestCount = 0
      this.state.windowStart = Date.now()
    }
  }
}

/* ── FIM Prompt Builder ────────────────────────────────── */

export class FIMPromptBuilder {
  /** Build a fill-in-the-middle prompt, managing token budget by trimming prefix/suffix. */
  static build(ctx: CompletionContext, provider: AIProvider, modelId: string, maxContextTokens: number): FIMPrompt {
    const family = getModelFamily(provider, modelId)
    const fim = getFIMTokens(provider, modelId)
    const importText = ctx.imports.length > 0 ? ctx.imports.join('\n') + '\n' : ''
    const importTokens = countTokens(importText, family)
    const available = maxContextTokens - importTokens - 50
    const suffixBudget = Math.floor(available * 0.2)
    const prefixBudget = available - suffixBudget

    let prefix = ctx.prefix
    if (countTokens(prefix, family) > prefixBudget) {
      const lines = prefix.split('\n')
      while (countTokens(lines.join('\n'), family) > prefixBudget && lines.length > 1) lines.shift()
      prefix = lines.join('\n')
    }

    let suffix = ctx.suffix
    if (countTokens(suffix, family) > suffixBudget) {
      const lines = suffix.split('\n')
      while (countTokens(lines.join('\n'), family) > suffixBudget && lines.length > 1) lines.pop()
      suffix = lines.join('\n')
    }

    // Build open-files context snippets if budget allows
    let openFilesText = ''
    const ofBudget = Math.max(0, prefixBudget - countTokens(prefix, family) - 100)
    if (ofBudget > 50 && ctx.openFilesContext.length > 0) {
      const sorted = [...ctx.openFilesContext].sort((a, b) => b.relevance - a.relevance)
      for (const file of sorted) {
        const snippet = `// From: ${file.filePath}\n${file.content}\n\n`
        if (countTokens(openFilesText + snippet, family) <= ofBudget) openFilesText += snippet
      }
    }

    const langComment = `// File: ${ctx.filePath} (${ctx.languageId})\n`
    const fullPrefix = openFilesText + langComment + importText + prefix
    const prompt = `${fim.prefix}${fullPrefix}${fim.suffix}${suffix}${fim.middle}`
    return { prompt, prefix: fullPrefix, suffix, tokenCount: countTokens(prompt, family) }
  }

  /** Build a chat-style prompt for providers that don't support FIM natively. */
  static buildChatPrompt(ctx: CompletionContext, maxContextTokens: number, settings: AICompletionSettings): { system: string; user: string; tokenCount: number } {
    const langPrompt = LANGUAGE_PROMPTS[ctx.languageId] ?? ''
    const isComment = isCommentLine(ctx.currentLine, ctx.languageId)
    const family = getModelFamily(settings.provider, settings.modelId)

    const system = [
      'You are an AI code completion assistant integrated into the Orion IDE.',
      langPrompt,
      'Complete the code at the cursor position marked with <CURSOR>.',
      'Output ONLY the completion text, nothing else. No explanations, no markdown.',
      settings.multiLine ? `Provide up to ${settings.maxCompletionLines} lines if appropriate.` : 'Provide a single-line completion.',
      isComment && settings.commentToCode ? 'The user just wrote a comment. Suggest the implementation described by the comment.' : '',
    ].filter(Boolean).join(' ')

    const importText = ctx.imports.length > 0 ? `// Imports:\n${ctx.imports.join('\n')}\n\n` : ''
    const budget = maxContextTokens - countTokens(system, family) - 100
    let prefix = ctx.prefix, suffix = ctx.suffix
    const prefixBudget = Math.floor(budget * 0.7)
    const suffixBudget = budget - prefixBudget

    if (countTokens(prefix, family) > prefixBudget) {
      const lines = prefix.split('\n')
      while (countTokens(lines.join('\n'), family) > prefixBudget && lines.length > 1) lines.shift()
      prefix = lines.join('\n')
    }
    if (countTokens(suffix, family) > suffixBudget) {
      const lines = suffix.split('\n')
      while (countTokens(lines.join('\n'), family) > suffixBudget && lines.length > 1) lines.pop()
      suffix = lines.join('\n')
    }

    const user = `${importText}${prefix}<CURSOR>${suffix}`
    return { system, user, tokenCount: countTokens(system + user, family) }
  }
}

/* ── Completion Provider Interface ─────────────────────── */

export interface ICompletionProvider {
  readonly id: string
  readonly name: string
  readonly provider: AIProvider
  isAvailable(): Promise<boolean>
  complete(context: CompletionContext, settings: AICompletionSettings, signal: AbortSignal): Promise<CompletionResult>
  completeStream(context: CompletionContext, settings: AICompletionSettings, signal: AbortSignal, onChunk: (chunk: string) => void): Promise<CompletionResult>
}

/* ── SSE Stream Reader (shared by providers) ───────────── */

async function readSSEStream(
  response: Response, signal: AbortSignal, onChunk: (chunk: string) => void,
  extractDelta: (parsed: any) => string | undefined,
): Promise<{ fullText: string; firstChunkTime: number }> {
  let fullText = '', firstChunkTime = 0
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  if (!reader) return { fullText, firstChunkTime }

  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (signal.aborted) { reader.cancel(); break }
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
      try {
        const delta = extractDelta(JSON.parse(line.slice(6)))
        if (delta) { if (!firstChunkTime) firstChunkTime = Date.now(); fullText += delta; onChunk(delta) }
      } catch { /* ignore */ }
    }
  }
  return { fullText, firstChunkTime }
}

/* ── Built-in Providers ────────────────────────────────── */

class AnthropicCompletionProvider implements ICompletionProvider {
  readonly id = 'anthropic-completion'
  readonly name = 'Anthropic'
  readonly provider: AIProvider = 'anthropic'

  async isAvailable(): Promise<boolean> { return Boolean(getProviderConfigs().anthropic?.apiKey) }

  private getHeaders() {
    const c = getProviderConfigs().anthropic
    return { 'Content-Type': 'application/json', 'x-api-key': c.apiKey || '', 'anthropic-version': '2023-06-01', ...c.headers }
  }

  private getUrl() { return `${getProviderConfigs().anthropic.baseUrl || 'https://api.anthropic.com'}/v1/messages` }

  async complete(ctx: CompletionContext, settings: AICompletionSettings, signal: AbortSignal): Promise<CompletionResult> {
    const start = Date.now()
    const { system, user, tokenCount: promptTokens } = FIMPromptBuilder.buildChatPrompt(ctx, settings.maxContextTokens, settings)
    const resp = await fetch(this.getUrl(), { method: 'POST', headers: this.getHeaders(), signal, body: JSON.stringify({ model: settings.modelId, max_tokens: settings.maxCompletionTokens, temperature: settings.temperature, system, messages: [{ role: 'user', content: user }], stop_sequences: ['\n\n\n', '```'] }) })
    if (!resp.ok) throw new Error(`Anthropic API error: ${resp.status} ${resp.statusText}`)
    const data = await resp.json()
    const text = (data.content?.[0]?.text || '').trimEnd()
    return { text, lines: text.split('\n'), provider: 'anthropic', model: settings.modelId, promptTokens, completionTokens: data.usage?.output_tokens ?? countTokens(text, 'claude'), latencyMs: Date.now() - start, totalTimeMs: Date.now() - start, completionId: generateCompletionId(), timestamp: Date.now() }
  }

  async completeStream(ctx: CompletionContext, settings: AICompletionSettings, signal: AbortSignal, onChunk: (chunk: string) => void): Promise<CompletionResult> {
    const start = Date.now()
    const { system, user, tokenCount: promptTokens } = FIMPromptBuilder.buildChatPrompt(ctx, settings.maxContextTokens, settings)
    const resp = await fetch(this.getUrl(), { method: 'POST', headers: this.getHeaders(), signal, body: JSON.stringify({ model: settings.modelId, max_tokens: settings.maxCompletionTokens, temperature: settings.temperature, stream: true, system, messages: [{ role: 'user', content: user }], stop_sequences: ['\n\n\n', '```'] }) })
    if (!resp.ok) throw new Error(`Anthropic API error: ${resp.status} ${resp.statusText}`)
    const { fullText, firstChunkTime } = await readSSEStream(resp, signal, onChunk, (e) => e.type === 'content_block_delta' ? e.delta?.text : undefined)
    const text = fullText.trimEnd()
    return { text, lines: text.split('\n'), provider: 'anthropic', model: settings.modelId, promptTokens, completionTokens: countTokens(text, 'claude'), latencyMs: (firstChunkTime || Date.now()) - start, totalTimeMs: Date.now() - start, completionId: generateCompletionId(), timestamp: Date.now() }
  }
}

class OpenAICompletionProvider implements ICompletionProvider {
  readonly id = 'openai-completion'
  readonly name = 'OpenAI'
  readonly provider: AIProvider = 'openai'

  async isAvailable(): Promise<boolean> { return Boolean(getProviderConfigs().openai?.apiKey) }

  private getHeaders() {
    const c = getProviderConfigs().openai
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c.apiKey || ''}`, ...(c.organization ? { 'OpenAI-Organization': c.organization } : {}), ...c.headers }
  }

  private getUrl() { return `${getProviderConfigs().openai.baseUrl || 'https://api.openai.com'}/v1/chat/completions` }

  private buildBody(settings: AICompletionSettings, system: string, user: string, stream = false) {
    return { model: settings.modelId, max_tokens: settings.maxCompletionTokens, temperature: settings.temperature, stream, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], stop: ['\n\n\n', '```'] }
  }

  async complete(ctx: CompletionContext, settings: AICompletionSettings, signal: AbortSignal): Promise<CompletionResult> {
    const start = Date.now()
    const { system, user, tokenCount: promptTokens } = FIMPromptBuilder.buildChatPrompt(ctx, settings.maxContextTokens, settings)
    const resp = await fetch(this.getUrl(), { method: 'POST', headers: this.getHeaders(), signal, body: JSON.stringify(this.buildBody(settings, system, user)) })
    if (!resp.ok) throw new Error(`OpenAI API error: ${resp.status} ${resp.statusText}`)
    const data = await resp.json()
    const text = (data.choices?.[0]?.message?.content || '').trimEnd()
    return { text, lines: text.split('\n'), provider: 'openai', model: settings.modelId, promptTokens: data.usage?.prompt_tokens ?? promptTokens, completionTokens: data.usage?.completion_tokens ?? countTokens(text, 'gpt4'), latencyMs: Date.now() - start, totalTimeMs: Date.now() - start, completionId: generateCompletionId(), timestamp: Date.now() }
  }

  async completeStream(ctx: CompletionContext, settings: AICompletionSettings, signal: AbortSignal, onChunk: (chunk: string) => void): Promise<CompletionResult> {
    const start = Date.now()
    const { system, user, tokenCount: promptTokens } = FIMPromptBuilder.buildChatPrompt(ctx, settings.maxContextTokens, settings)
    const resp = await fetch(this.getUrl(), { method: 'POST', headers: this.getHeaders(), signal, body: JSON.stringify(this.buildBody(settings, system, user, true)) })
    if (!resp.ok) throw new Error(`OpenAI API error: ${resp.status} ${resp.statusText}`)
    const { fullText, firstChunkTime } = await readSSEStream(resp, signal, onChunk, (e) => e.choices?.[0]?.delta?.content)
    const text = fullText.trimEnd()
    return { text, lines: text.split('\n'), provider: 'openai', model: settings.modelId, promptTokens, completionTokens: countTokens(text, 'gpt4'), latencyMs: (firstChunkTime || Date.now()) - start, totalTimeMs: Date.now() - start, completionId: generateCompletionId(), timestamp: Date.now() }
  }
}

class OllamaCompletionProvider implements ICompletionProvider {
  readonly id = 'ollama-completion'
  readonly name = 'Ollama (Local)'
  readonly provider: AIProvider = 'ollama'

  private getBaseUrl() { return getProviderConfigs().ollama?.baseUrl || 'http://localhost:11434' }

  async isAvailable(): Promise<boolean> {
    try { return (await fetch(`${this.getBaseUrl()}/api/version`, { signal: AbortSignal.timeout(2000) })).ok } catch { return false }
  }

  async complete(ctx: CompletionContext, settings: AICompletionSettings, signal: AbortSignal): Promise<CompletionResult> {
    const start = Date.now()
    const fimPrompt = FIMPromptBuilder.build(ctx, 'ollama', settings.modelId, settings.maxContextTokens)
    const resp = await fetch(`${this.getBaseUrl()}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ model: settings.modelId, prompt: fimPrompt.prompt, stream: false, options: { temperature: settings.temperature, num_predict: settings.maxCompletionTokens, stop: ['\n\n\n', '<|endoftext|>', '<|end|>'] } }) })
    if (!resp.ok) throw new Error(`Ollama API error: ${resp.status} ${resp.statusText}`)
    const data = await resp.json()
    const text = (data.response || '').trimEnd()
    return { text, lines: text.split('\n'), provider: 'ollama', model: settings.modelId, promptTokens: data.prompt_eval_count ?? fimPrompt.tokenCount, completionTokens: data.eval_count ?? countTokens(text, 'llama'), latencyMs: Date.now() - start, totalTimeMs: Date.now() - start, completionId: generateCompletionId(), timestamp: Date.now() }
  }

  async completeStream(ctx: CompletionContext, settings: AICompletionSettings, signal: AbortSignal, onChunk: (chunk: string) => void): Promise<CompletionResult> {
    const start = Date.now()
    const fimPrompt = FIMPromptBuilder.build(ctx, 'ollama', settings.modelId, settings.maxContextTokens)
    const resp = await fetch(`${this.getBaseUrl()}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ model: settings.modelId, prompt: fimPrompt.prompt, stream: true, options: { temperature: settings.temperature, num_predict: settings.maxCompletionTokens, stop: ['\n\n\n', '<|endoftext|>', '<|end|>'] } }) })
    if (!resp.ok) throw new Error(`Ollama API error: ${resp.status} ${resp.statusText}`)
    // Ollama uses NDJSON, not SSE
    let fullText = '', firstChunkTime = 0
    const reader = resp.body?.getReader()
    const decoder = new TextDecoder()
    if (reader) {
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (signal.aborted) { reader.cancel(); break }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try { const e = JSON.parse(line); if (e.response) { if (!firstChunkTime) firstChunkTime = Date.now(); fullText += e.response; onChunk(e.response) } } catch { /* ignore */ }
        }
      }
    }
    const text = fullText.trimEnd()
    return { text, lines: text.split('\n'), provider: 'ollama', model: settings.modelId, promptTokens: fimPrompt.tokenCount, completionTokens: countTokens(text, 'llama'), latencyMs: (firstChunkTime || Date.now()) - start, totalTimeMs: Date.now() - start, completionId: generateCompletionId(), timestamp: Date.now() }
  }
}

/* ── Provider Registry ─────────────────────────────────── */

const builtInProviders: ICompletionProvider[] = [new AnthropicCompletionProvider(), new OpenAICompletionProvider(), new OllamaCompletionProvider()]
const customProviders = new Map<string, ICompletionProvider>()

export function registerCompletionProvider(provider: ICompletionProvider): () => void {
  customProviders.set(provider.id, provider)
  return () => { customProviders.delete(provider.id) }
}

export function getCompletionProvider(providerType: AIProvider): ICompletionProvider | undefined {
  const customs = Array.from(customProviders.values())
  const custom = customs.find(p => p.provider === providerType)
  if (custom) return custom
  return builtInProviders.find(p => p.provider === providerType)
}

export function getAllCompletionProviders(): ICompletionProvider[] {
  return [...builtInProviders, ...Array.from(customProviders.values())]
}

/* ── Settings Persistence ──────────────────────────────── */

const DEFAULT_SETTINGS: AICompletionSettings = {
  enabled: true, provider: 'anthropic', modelId: 'claude-sonnet-4-6', debounceMs: 300,
  temperature: 0.1, maxCompletionTokens: 256, maxContextTokens: 4096,
  multiLine: true, maxCompletionLines: 15, commentToCode: true,
  languageOverrides: {}, showInlineDiff: true, autoDismissMs: 0,
  cacheMaxEntries: 100, cacheTtlMs: 300_000, rateLimitPerMinute: 20, dailyTokenQuota: 0,
}

const SETTINGS_KEY = 'orion:ai-completion-settings'

function loadSettings(): AICompletionSettings {
  try { const s = localStorage.getItem(SETTINGS_KEY); if (s) return { ...DEFAULT_SETTINGS, ...JSON.parse(s) } } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(settings: AICompletionSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* ignore */ }
}

/* ── Completion Engine ─────────────────────────────────── */

export class AICodeCompletionEngine {
  private cache: CompletionCache
  private telemetry: CompletionTelemetry
  private rateLimiter: CompletionRateLimiter
  private abortController: AbortController | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null
  private settings: AICompletionSettings
  private lastContextHash = ''
  private _isDisposed = false

  constructor(settings?: Partial<AICompletionSettings>) {
    this.settings = { ...loadSettings(), ...settings }
    this.cache = new CompletionCache(this.settings.cacheMaxEntries, this.settings.cacheTtlMs)
    this.telemetry = new CompletionTelemetry()
    this.rateLimiter = new CompletionRateLimiter(this.settings.rateLimitPerMinute, this.settings.dailyTokenQuota)
  }

  /** Trigger a debounced completion request. Cancels any in-flight request. */
  trigger(context: CompletionContext): void {
    if (this._isDisposed || !this.settings.enabled || !this.isLanguageEnabled(context.languageId)) return
    if (!this.shouldTrigger(context)) return
    this.cancelPending()
    const store = useAICompletionStore.getState()
    this.debounceTimer = setTimeout(() => {
      this.executeCompletion(context).catch(err => {
        if (err.name !== 'AbortError') { console.warn('[AICodeCompletion] Error:', err.message); store.setStatus('error'); store.setError(err.message) }
      })
    }, this.settings.debounceMs)
    store.setStatus('idle')
  }

  /** Execute completion immediately without debouncing. */
  async triggerImmediate(context: CompletionContext): Promise<CompletionResult | null> {
    if (this._isDisposed || !this.settings.enabled) return null
    this.cancelPending()
    return this.executeCompletion(context)
  }

  /** Cancel any pending or in-flight completion. */
  cancelPending(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
    if (this.abortController) { this.abortController.abort(); this.abortController = null }
    if (this.autoDismissTimer) { clearTimeout(this.autoDismissTimer); this.autoDismissTimer = null }
  }

  /** Accept the current ghost text (full, line, or word). Returns accepted text or null. */
  accept(mode: AcceptMode = 'full'): string | null {
    const store = useAICompletionStore.getState()
    const { ghostText: ghost, currentResult: result } = store
    if (!ghost || !result) return null

    if (mode === 'full') {
      const text = ghost.remainingText
      this.telemetry.trackAccepted(result, store.languageId, 'full', ghost.lines.length - ghost.acceptedLineIndex)
      store.clearGhostText()
      return text
    }

    if (mode === 'line') {
      const idx = ghost.acceptedLineIndex
      if (idx >= ghost.lines.length) { store.clearGhostText(); return null }
      let text = ghost.lines[idx]
      if (idx < ghost.lines.length - 1) text += '\n'
      const nextIdx = idx + 1
      if (nextIdx >= ghost.lines.length) {
        this.telemetry.trackAccepted(result, store.languageId, 'line', 1)
        store.clearGhostText()
      } else {
        const remaining = ghost.lines.slice(nextIdx).join('\n')
        store.setGhostText({ ...ghost, acceptedLineIndex: nextIdx, remainingText: remaining, diffSegments: computeInlineDiffSegments('', remaining) })
        this.telemetry.trackAccepted(result, store.languageId, 'line', 1)
      }
      return text
    }

    // mode === 'word'
    const wordMatch = ghost.remainingText.match(/^(\s*\S+)/)
    if (!wordMatch) { store.clearGhostText(); return null }
    const accepted = wordMatch[1]
    const newRemaining = ghost.remainingText.slice(accepted.length)
    if (!newRemaining) {
      this.telemetry.trackAccepted(result, store.languageId, 'word', 0)
      store.clearGhostText()
    } else {
      const newLines = newRemaining.split('\n')
      store.setGhostText({ ...ghost, acceptedWordCount: ghost.acceptedWordCount + 1, remainingText: newRemaining, lines: newLines, acceptedLineIndex: 0, diffSegments: computeInlineDiffSegments('', newRemaining) })
      this.telemetry.trackAccepted(result, store.languageId, 'word', 0)
    }
    return accepted
  }

  /** Dismiss the current ghost text. */
  dismiss(reason: CompletionDismissReason = 'manual'): void {
    const store = useAICompletionStore.getState()
    if (store.currentResult) this.telemetry.trackDismissed(store.currentResult, store.languageId, reason)
    store.clearGhostText()
    store.setStatus('idle')
    this.cancelPending()
  }

  /** Update engine settings. */
  updateSettings(partial: Partial<AICompletionSettings>): void {
    this.settings = { ...this.settings, ...partial }
    saveSettings(this.settings)
    if (partial.cacheMaxEntries !== undefined || partial.cacheTtlMs !== undefined) this.cache = new CompletionCache(this.settings.cacheMaxEntries, this.settings.cacheTtlMs)
    if (partial.rateLimitPerMinute !== undefined || partial.dailyTokenQuota !== undefined) this.rateLimiter.updateLimits(this.settings.rateLimitPerMinute, this.settings.dailyTokenQuota)
    useAICompletionStore.getState().setSettings(this.settings)
  }

  getSettings(): AICompletionSettings { return { ...this.settings } }
  getTelemetry(): CompletionTelemetry { return this.telemetry }
  getTelemetrySummary(sinceMs?: number): CompletionTelemetrySummary { return this.telemetry.getSummary(sinceMs) }

  getRateLimitState(): { canRequest: boolean; waitMs: number; quota: { used: number; limit: number; percentage: number } } {
    return { canRequest: this.rateLimiter.canMakeRequest(), waitMs: this.rateLimiter.getTimeUntilNextSlot(), quota: this.rateLimiter.getQuotaUsage() }
  }

  getCacheStats(): { size: number; totalHits: number; oldestMs: number } { return this.cache.getStats() }
  clearCache(): void { this.cache.clear() }

  dispose(): void {
    this._isDisposed = true
    this.cancelPending()
    this.cache.clear()
    this.telemetry.flush()
  }

  /* ── Private ───────────────────────────────────── */

  private isLanguageEnabled(languageId: string): boolean {
    const override = this.settings.languageOverrides[languageId]
    return override !== undefined ? override.enabled : true
  }

  private shouldTrigger(ctx: CompletionContext): boolean {
    const { prefix, currentLine, languageId } = ctx
    // Empty line: only trigger for comment-to-code
    if (!currentLine.trim()) {
      if (this.settings.commentToCode) {
        const lines = prefix.split('\n')
        if (lines.length >= 2 && isCommentLine(lines[lines.length - 2], languageId)) return true
      }
      return false
    }
    if (isInsideString(prefix)) return false
    if (isInsideComment(prefix, languageId)) {
      if (this.settings.commentToCode && isCommentLine(currentLine, languageId)) return true
      return false
    }
    if (shouldSuppressTrigger(currentLine.trimEnd())) return false
    if (currentLine.trim().length < 2) return false
    return true
  }

  private async executeCompletion(ctx: CompletionContext): Promise<CompletionResult | null> {
    const store = useAICompletionStore.getState()

    if (!this.rateLimiter.canMakeRequest()) {
      store.setStatus('rate-limited')
      store.setError(`Rate limited. Try again in ${Math.ceil(this.rateLimiter.getTimeUntilNextSlot() / 1000)}s`)
      return null
    }

    const contextHash = hashContext(ctx.prefix, ctx.suffix, ctx.filePath)
    if (contextHash === this.lastContextHash && store.ghostText) return store.currentResult
    this.lastContextHash = contextHash

    const cached = this.cache.get(contextHash)
    if (cached) { this.presentResult(cached, ctx); return cached }

    this.abortController = new AbortController()
    const signal = this.abortController.signal
    store.setStatus('gathering-context')
    store.setLanguageId(ctx.languageId)

    const provider = getCompletionProvider(this.settings.provider)
    if (!provider) { store.setStatus('error'); store.setError(`No provider for: ${this.settings.provider}`); return null }

    store.setStatus('requesting')

    try {
      let result: CompletionResult
      const modelConfig = AI_MODELS.find(m => m.modelId === this.settings.modelId)

      if (modelConfig?.supportsStreaming) {
        store.setStatus('streaming')
        result = await provider.completeStream(ctx, this.settings, signal, (chunk) => {
          const currentGhost = store.ghostText
          const text = (currentGhost?.text ?? '') + chunk
          const lines = text.trimEnd().split('\n')
          if (lines.length > this.settings.maxCompletionLines) { this.abortController?.abort(); return }
          store.setGhostText({ text: text.trimEnd(), lines, acceptedLineIndex: 0, acceptedWordCount: 0, remainingText: text.trimEnd(), diffSegments: computeInlineDiffSegments('', text.trimEnd()), anchorLine: ctx.cursor.line, anchorColumn: ctx.cursor.column })
        })
      } else {
        result = await provider.complete(ctx, this.settings, signal)
      }

      if (!result.text || !result.text.trim()) { store.setStatus('idle'); return null }
      if (result.lines.length > this.settings.maxCompletionLines) { result.lines = result.lines.slice(0, this.settings.maxCompletionLines); result.text = result.lines.join('\n') }
      if (!this.settings.multiLine && result.lines.length > 1) { result.lines = [result.lines[0]]; result.text = result.lines[0] }

      this.rateLimiter.recordRequest(result.promptTokens + result.completionTokens)
      this.cache.set(contextHash, result)
      this.presentResult(result, ctx)
      return result
    } catch (err: any) {
      if (err.name === 'AbortError') { store.setStatus('cancelled'); return null }
      store.setStatus('error')
      store.setError(err.message || 'Unknown completion error')
      this.telemetry.trackError(this.settings.provider, this.settings.modelId, ctx.languageId, 0)
      return null
    }
  }

  private presentResult(result: CompletionResult, ctx: CompletionContext): void {
    const store = useAICompletionStore.getState()
    const existingText = ctx.suffix.split('\n')[0] || ''
    store.setCurrentResult(result)
    store.setGhostText({
      text: result.text, lines: result.lines, acceptedLineIndex: 0, acceptedWordCount: 0,
      remainingText: result.text,
      diffSegments: this.settings.showInlineDiff ? computeInlineDiffSegments(existingText, result.text) : [{ type: 'insert', text: result.text }],
      anchorLine: ctx.cursor.line, anchorColumn: ctx.cursor.column,
    })
    store.setStatus('ready')
    this.telemetry.trackShown(result, ctx.languageId)
    if (this.settings.autoDismissMs > 0) {
      if (this.autoDismissTimer) clearTimeout(this.autoDismissTimer)
      this.autoDismissTimer = setTimeout(() => this.dismiss('manual'), this.settings.autoDismissMs)
    }
  }
}

/* ── Context Gatherer ──────────────────────────────────── */

/** Build a CompletionContext from raw editor state. */
export function gatherCompletionContext(
  fileContent: string, filePath: string, languageId: string, cursorOffset: number,
  openFiles?: Array<{ path: string; content: string; languageId: string }>,
): CompletionContext {
  const prefix = fileContent.slice(0, cursorOffset)
  const suffix = fileContent.slice(cursorOffset)
  const linesBeforeCursor = prefix.split('\n')
  const line = linesBeforeCursor.length - 1
  const column = linesBeforeCursor[linesBeforeCursor.length - 1].length
  const currentLine = linesBeforeCursor[linesBeforeCursor.length - 1]
  const imports = extractImports(fileContent, languageId)
  const indent = detectIndentation(fileContent)

  const openFilesContext: OpenFileSnippet[] = []
  if (openFiles) {
    for (const file of openFiles) {
      if (file.path === filePath) continue
      const fileImports = extractImports(file.content, file.languageId)
      const shared = imports.filter(imp => fileImports.some(fi => fi.includes(imp.split(' ').pop()?.replace(/['"`;]/g, '') || '')))
      const relevance = Math.min(1, shared.length * 0.2 + 0.1)
      openFilesContext.push({ filePath: file.path, languageId: file.languageId, content: file.content.split('\n').slice(0, 50).join('\n'), relevance })
    }
    openFilesContext.sort((a, b) => b.relevance - a.relevance)
    openFilesContext.splice(3)
  }

  return { fileContent, prefix, suffix, filePath, languageId, cursor: { line, column, offset: cursorOffset }, imports, openFilesContext, currentLine, indentLevel: getLeadingWhitespace(currentLine), indentUnit: indent.unit }
}

/* ── Zustand Store ─────────────────────────────────────── */

export interface AICompletionStoreState {
  status: CompletionStatus
  ghostText: GhostTextState | null
  currentResult: CompletionResult | null
  error: string | null
  languageId: string
  settings: AICompletionSettings
  setStatus: (status: CompletionStatus) => void
  setGhostText: (ghost: GhostTextState | null) => void
  clearGhostText: () => void
  setCurrentResult: (result: CompletionResult | null) => void
  setError: (error: string | null) => void
  setLanguageId: (languageId: string) => void
  setSettings: (settings: AICompletionSettings) => void
  updateSettings: (partial: Partial<AICompletionSettings>) => void
  reset: () => void
}

const initialStoreState = {
  status: 'idle' as CompletionStatus,
  ghostText: null as GhostTextState | null,
  currentResult: null as CompletionResult | null,
  error: null as string | null,
  languageId: 'plaintext',
  settings: loadSettings(),
}

export const useAICompletionStore = create<AICompletionStoreState>((set, get) => ({
  ...initialStoreState,
  setStatus: (status) => set({ status, error: status === 'error' ? get().error : null }),
  setGhostText: (ghostText) => set({ ghostText }),
  clearGhostText: () => set({ ghostText: null, currentResult: null }),
  setCurrentResult: (currentResult) => set({ currentResult }),
  setError: (error) => set({ error }),
  setLanguageId: (languageId) => set({ languageId }),
  setSettings: (settings) => set({ settings }),
  updateSettings: (partial) => { const next = { ...get().settings, ...partial }; saveSettings(next); set({ settings: next }) },
  reset: () => set({ ...initialStoreState, settings: get().settings }),
}))

/* ── Keyboard Handlers ─────────────────────────────────── */

export interface CompletionKeyBindings {
  acceptFull: string
  dismiss: string
  acceptWord: string
  acceptLine: string
}

const DEFAULT_KEYBINDINGS: CompletionKeyBindings = {
  acceptFull: 'Tab', dismiss: 'Escape', acceptWord: 'Ctrl+ArrowRight', acceptLine: 'Ctrl+Shift+ArrowRight',
}

/** Create a keyboard event handler for completion interactions. */
export function createCompletionKeyHandler(
  engine: AICodeCompletionEngine,
  onAccept: (text: string) => void,
  keybindings?: Partial<CompletionKeyBindings>,
): (event: KeyboardEvent) => boolean {
  const bindings = { ...DEFAULT_KEYBINDINGS, ...keybindings }

  return (event: KeyboardEvent): boolean => {
    if (!useAICompletionStore.getState().ghostText) return false
    const key = [event.ctrlKey || event.metaKey ? 'Ctrl' : '', event.shiftKey ? 'Shift' : '', event.altKey ? 'Alt' : '', event.key].filter(Boolean).join('+')

    if (key === bindings.acceptFull) { const t = engine.accept('full'); if (t) { event.preventDefault(); event.stopPropagation(); onAccept(t); return true } }
    if (key === bindings.dismiss) { engine.dismiss('escape'); event.preventDefault(); return true }
    if (key === bindings.acceptWord) { const t = engine.accept('word'); if (t) { event.preventDefault(); event.stopPropagation(); onAccept(t); return true } }
    if (key === bindings.acceptLine) { const t = engine.accept('line'); if (t) { event.preventDefault(); event.stopPropagation(); onAccept(t); return true } }
    return false
  }
}

/* ── Singleton Engine Instance ─────────────────────────── */

let _engineInstance: AICodeCompletionEngine | null = null

export function getCompletionEngine(): AICodeCompletionEngine {
  if (!_engineInstance) _engineInstance = new AICodeCompletionEngine()
  return _engineInstance
}

export function resetCompletionEngine(): void {
  _engineInstance?.dispose()
  _engineInstance = null
}
