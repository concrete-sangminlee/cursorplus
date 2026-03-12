/**
 * AI-powered code completion engine for Orion IDE.
 * Provides intelligent, multi-line ghost text completions similar to GitHub Copilot.
 * Supports multiple AI backends, FIM prompt formatting, caching, cancellation,
 * partial accept, inline diff preview, and smart triggering heuristics.
 */

import { create } from 'zustand'
import type { AIProvider, AIProviderConfig, AIModelConfig } from './aiProviders'
import { getProviderConfigs, getActiveProvider, AI_MODELS } from './aiProviders'
import { countTokens, type ModelFamily } from './tokenizer'

/* ── Types ─────────────────────────────────────────────── */

export type CompletionStatus =
  | 'idle'
  | 'gathering-context'
  | 'requesting'
  | 'streaming'
  | 'ready'
  | 'error'
  | 'cancelled'
  | 'rate-limited'

export type CompletionDismissReason =
  | 'escape'
  | 'typing'
  | 'cursor-move'
  | 'focus-lost'
  | 'new-request'
  | 'manual'

export type AcceptMode = 'full' | 'line' | 'word'

export interface CursorPosition {
  line: number
  column: number
  offset: number
}

export interface CompletionContext {
  /** Full content of the active file */
  fileContent: string
  /** Text before the cursor */
  prefix: string
  /** Text after the cursor */
  suffix: string
  /** Current file path */
  filePath: string
  /** Detected language ID */
  languageId: string
  /** Cursor position */
  cursor: CursorPosition
  /** Import statements extracted from the file */
  imports: string[]
  /** Content snippets from other open files */
  openFilesContext: OpenFileSnippet[]
  /** The line the cursor is on */
  currentLine: string
  /** Number of leading whitespace characters on current line */
  indentLevel: number
  /** Indentation string (spaces or tab) for this file */
  indentUnit: string
}

export interface OpenFileSnippet {
  filePath: string
  languageId: string
  /** Relevant excerpt (e.g., first 50 lines or surrounding context) */
  content: string
  /** Relevance score 0-1 based on import/usage overlap */
  relevance: number
}

export interface CompletionResult {
  /** The generated completion text */
  text: string
  /** Lines of the completion, split for partial accept */
  lines: string[]
  /** Provider that generated this completion */
  provider: AIProvider
  /** Model used */
  model: string
  /** Tokens used in the prompt */
  promptTokens: number
  /** Tokens in the completion */
  completionTokens: number
  /** Time from request to first token, in ms */
  latencyMs: number
  /** Total request time in ms */
  totalTimeMs: number
  /** Unique completion ID for telemetry */
  completionId: string
  /** Timestamp when generated */
  timestamp: number
}

export interface CompletionCacheEntry {
  /** Hash of the context that produced this completion */
  contextHash: string
  /** The completion result */
  result: CompletionResult
  /** Number of times this entry has been served from cache */
  hitCount: number
  /** When the entry was created */
  createdAt: number
  /** When the entry was last accessed */
  lastAccessedAt: number
}

export interface InlineDiffSegment {
  type: 'equal' | 'insert'
  text: string
}

export interface GhostTextState {
  /** Full completion text */
  text: string
  /** Lines of the completion */
  lines: string[]
  /** Which line index has been partially accepted up to */
  acceptedLineIndex: number
  /** Within the current line, how many words have been accepted */
  acceptedWordCount: number
  /** The remaining text yet to be accepted */
  remainingText: string
  /** Inline diff segments for preview */
  diffSegments: InlineDiffSegment[]
  /** The line/column where the ghost text starts */
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
  /** Requests made in the current window */
  requestCount: number
  /** Start of the current rate limit window */
  windowStart: number
  /** Maximum requests per window */
  maxRequestsPerWindow: number
  /** Window duration in ms (default 60000 = 1 minute) */
  windowDurationMs: number
  /** Total tokens used in this billing period */
  quotaTokensUsed: number
  /** Token quota limit (0 = unlimited) */
  quotaTokensLimit: number
}

export interface LanguageCompletionConfig {
  enabled: boolean
  /** Custom trigger characters for this language */
  triggerCharacters?: string[]
  /** Custom stop sequences */
  stopSequences?: string[]
  /** Max completion lines for this language */
  maxLines?: number
  /** Custom prompt template override */
  promptTemplate?: string
}

export interface AICompletionSettings {
  /** Global enable/disable */
  enabled: boolean
  /** Active provider for completions */
  provider: AIProvider
  /** Model ID to use */
  modelId: string
  /** Debounce delay in ms */
  debounceMs: number
  /** Temperature (0-1) */
  temperature: number
  /** Max tokens to generate */
  maxCompletionTokens: number
  /** Max context tokens to send */
  maxContextTokens: number
  /** Enable multi-line completions */
  multiLine: boolean
  /** Max lines in a single completion */
  maxCompletionLines: number
  /** Enable comment-to-code detection */
  commentToCode: boolean
  /** Per-language overrides */
  languageOverrides: Record<string, LanguageCompletionConfig>
  /** Show inline diff preview */
  showInlineDiff: boolean
  /** Auto-dismiss after ms of inactivity (0 = never) */
  autoDismissMs: number
  /** Cache max entries */
  cacheMaxEntries: number
  /** Cache TTL in ms */
  cacheTtlMs: number
  /** Rate limit: requests per minute */
  rateLimitPerMinute: number
  /** Token quota per day (0 = unlimited) */
  dailyTokenQuota: number
}

/* ── FIM Prompt Formatting ─────────────────────────────── */

export interface FIMPrompt {
  prompt: string
  prefix: string
  suffix: string
  /** Total estimated tokens in the prompt */
  tokenCount: number
}

/** Format tokens used by different providers for fill-in-the-middle */
const FIM_TOKENS: Record<string, { prefix: string; suffix: string; middle: string }> = {
  anthropic: {
    prefix: '<|fim_prefix|>',
    suffix: '<|fim_suffix|>',
    middle: '<|fim_middle|>',
  },
  openai: {
    prefix: '<|fim_prefix|>',
    suffix: '<|fim_suffix|>',
    middle: '<|fim_middle|>',
  },
  ollama_codellama: {
    prefix: '<PRE> ',
    suffix: ' <SUF>',
    middle: ' <MID>',
  },
  ollama_deepseek: {
    prefix: '<|fim▁begin|>',
    suffix: '<|fim▁hole|>',
    middle: '<|fim▁end|>',
  },
  ollama_qwen: {
    prefix: '<fim_prefix>',
    suffix: '<fim_suffix>',
    middle: '<fim_middle>',
  },
  ollama_default: {
    prefix: '<|fim_prefix|>',
    suffix: '<|fim_suffix|>',
    middle: '<|fim_middle|>',
  },
}

/** Language-specific system prompt snippets */
const LANGUAGE_PROMPTS: Record<string, string> = {
  typescript: 'You are an expert TypeScript developer. Follow TypeScript best practices, use proper types, and prefer functional patterns where appropriate.',
  typescriptreact: 'You are an expert React/TypeScript developer. Use React 19 patterns, proper hooks, and TypeScript strict typing.',
  javascript: 'You are an expert JavaScript developer. Use modern ES2024+ syntax, async/await, and clean functional patterns.',
  javascriptreact: 'You are an expert React/JavaScript developer. Use modern React patterns with hooks and functional components.',
  python: 'You are an expert Python developer. Follow PEP 8, use type hints, and prefer Pythonic idioms.',
  rust: 'You are an expert Rust developer. Prioritize memory safety, use idiomatic patterns, and handle errors with Result types.',
  go: 'You are an expert Go developer. Follow Go conventions, handle errors explicitly, and keep code simple.',
  java: 'You are an expert Java developer. Follow Java conventions, use appropriate design patterns, and handle exceptions properly.',
  cpp: 'You are an expert C++ developer. Use modern C++20/23 features, RAII patterns, and avoid undefined behavior.',
  c: 'You are an expert C developer. Follow C best practices, manage memory carefully, and validate all inputs.',
  csharp: 'You are an expert C# developer. Use modern C# features, async/await patterns, and LINQ where appropriate.',
  html: 'You are an expert HTML developer. Write semantic, accessible HTML following WCAG guidelines.',
  css: 'You are an expert CSS developer. Use modern CSS features, custom properties, and logical properties.',
  sql: 'You are an expert SQL developer. Write efficient, well-structured queries following SQL best practices.',
  ruby: 'You are an expert Ruby developer. Follow Ruby idioms and conventions.',
  php: 'You are an expert PHP developer. Use modern PHP 8+ features and follow PSR standards.',
  swift: 'You are an expert Swift developer. Use Swift idioms, value types, and protocol-oriented programming.',
  kotlin: 'You are an expert Kotlin developer. Use Kotlin idioms, coroutines, and null-safety features.',
}

/** Tokens/characters that suppress completion triggering */
const SUPPRESS_AFTER_TOKENS = new Set([
  ';', '{', '}', '(', ')', '[', ']', ',', ':', '?', '!',
  '&&', '||', '??', '=>', '->',
])

/** Patterns that indicate the cursor is inside a string */
const STRING_CONTEXT_PATTERNS: RegExp[] = [
  /(?:^|[^\\])"(?:[^"\\]|\\.)*$/,         // double-quoted string
  /(?:^|[^\\])'(?:[^'\\]|\\.)*$/,         // single-quoted string
  /(?:^|[^\\])`(?:[^`\\]|\\.)*$/,         // template literal
  /"""[\s\S]*$/,                            // Python triple-double-quote
  /'''[\s\S]*$/,                            // Python triple-single-quote
]

/** Patterns that indicate the cursor is inside a comment */
const COMMENT_CONTEXT_PATTERNS: Record<string, RegExp[]> = {
  default: [
    /\/\/[^\n]*$/,                          // single-line comment
    /\/\*[\s\S]*?(?!\*\/)$/,               // block comment (unclosed)
  ],
  python: [
    /#[^\n]*$/,                             // Python comment
    /"""[\s\S]*?(?!""")$/,                  // Python docstring (unclosed)
  ],
  ruby: [
    /#[^\n]*$/,
    /=begin[\s\S]*?(?!=end)$/,
  ],
  html: [
    /<!--[\s\S]*?(?!-->)$/,
  ],
  css: [
    /\/\*[\s\S]*?(?!\*\/)$/,
  ],
}

/** Comment patterns for detecting comment-to-code intent */
const COMMENT_LINE_PATTERNS: Record<string, RegExp> = {
  default: /^\s*\/\/\s*.+/,
  python: /^\s*#\s*.+/,
  ruby: /^\s*#\s*.+/,
  lua: /^\s*--\s*.+/,
  html: /^\s*<!--\s*.+/,
  css: /^\s*\/\*\s*.+/,
  sql: /^\s*--\s*.+/,
}

/* ── Utility Functions ─────────────────────────────────── */

let _completionIdCounter = 0

function generateCompletionId(): string {
  _completionIdCounter += 1
  return `cmp_${Date.now()}_${_completionIdCounter}`
}

function hashContext(prefix: string, suffix: string, filePath: string): string {
  // Simple but fast hash for cache key
  let hash = 0
  const str = `${filePath}::${prefix.slice(-500)}::${suffix.slice(0, 200)}`
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return `ctx_${hash.toString(36)}`
}

function extractImports(content: string, languageId: string): string[] {
  const imports: string[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // TypeScript/JavaScript imports
    if (/^import\s/.test(trimmed) || /^(const|let|var)\s.*=\s*require\(/.test(trimmed)) {
      imports.push(trimmed)
      continue
    }
    // Python imports
    if (languageId === 'python' && (/^import\s/.test(trimmed) || /^from\s.*import\s/.test(trimmed))) {
      imports.push(trimmed)
      continue
    }
    // Rust use
    if (languageId === 'rust' && /^use\s/.test(trimmed)) {
      imports.push(trimmed)
      continue
    }
    // Go imports (simplified)
    if (languageId === 'go' && /^import\s/.test(trimmed)) {
      imports.push(trimmed)
      continue
    }
    // Java/Kotlin imports
    if ((languageId === 'java' || languageId === 'kotlin') && /^import\s/.test(trimmed)) {
      imports.push(trimmed)
      continue
    }
    // C# using
    if (languageId === 'csharp' && /^using\s/.test(trimmed)) {
      imports.push(trimmed)
      continue
    }
    // C/C++ includes
    if ((languageId === 'c' || languageId === 'cpp') && /^#include\s/.test(trimmed)) {
      imports.push(trimmed)
      continue
    }

    // Stop scanning once we're past the import block (heuristic)
    if (imports.length > 0 && !/^\s*(\/\/|\/\*|\*|#|--|$)/.test(trimmed)) {
      break
    }
  }

  return imports
}

function detectIndentation(content: string): { unit: string; level: number; size: number } {
  const lines = content.split('\n').filter(l => l.trim().length > 0)
  let tabCount = 0
  let spaceCount = 0
  let twoSpaceCount = 0
  let fourSpaceCount = 0

  for (const line of lines.slice(0, 50)) {
    if (line.startsWith('\t')) tabCount++
    else if (line.startsWith('  ')) {
      spaceCount++
      const match = line.match(/^( +)/)
      if (match) {
        const len = match[1].length
        if (len % 2 === 0 && len % 4 !== 0) twoSpaceCount++
        if (len % 4 === 0) fourSpaceCount++
      }
    }
  }

  if (tabCount > spaceCount) {
    return { unit: '\t', level: 1, size: 1 }
  }
  const size = fourSpaceCount >= twoSpaceCount ? 4 : 2
  return { unit: ' '.repeat(size), level: size, size }
}

function getLeadingWhitespace(line: string): number {
  const match = line.match(/^(\s*)/)
  return match ? match[1].length : 0
}

function isInsideString(textBeforeCursor: string): boolean {
  // Check last 200 chars for unclosed string
  const recent = textBeforeCursor.slice(-200)
  return STRING_CONTEXT_PATTERNS.some(pattern => pattern.test(recent))
}

function isInsideComment(textBeforeCursor: string, languageId: string): boolean {
  const recent = textBeforeCursor.slice(-300)
  const patterns = COMMENT_CONTEXT_PATTERNS[languageId] ?? COMMENT_CONTEXT_PATTERNS.default
  return patterns.some(pattern => pattern.test(recent))
}

function isCommentLine(line: string, languageId: string): boolean {
  const pattern = COMMENT_LINE_PATTERNS[languageId] ?? COMMENT_LINE_PATTERNS.default
  return pattern.test(line)
}

function shouldSuppressTrigger(textBeforeCursor: string): boolean {
  const trimmed = textBeforeCursor.trimEnd()
  if (!trimmed) return false
  // Check last non-whitespace token
  for (const token of SUPPRESS_AFTER_TOKENS) {
    if (trimmed.endsWith(token)) return true
  }
  return false
}

function splitCompletionIntoLines(text: string): string[] {
  return text.split('\n')
}

function computeInlineDiffSegments(existingText: string, completionText: string): InlineDiffSegment[] {
  const segments: InlineDiffSegment[] = []

  // Simple approach: if existing text is empty, everything is an insert
  if (!existingText) {
    if (completionText) {
      segments.push({ type: 'insert', text: completionText })
    }
    return segments
  }

  // Find common prefix
  let commonLen = 0
  const maxLen = Math.min(existingText.length, completionText.length)
  while (commonLen < maxLen && existingText[commonLen] === completionText[commonLen]) {
    commonLen++
  }

  if (commonLen > 0) {
    segments.push({ type: 'equal', text: existingText.slice(0, commonLen) })
  }

  const remaining = completionText.slice(commonLen)
  if (remaining) {
    segments.push({ type: 'insert', text: remaining })
  }

  return segments
}

function getModelFamily(provider: AIProvider, modelId: string): ModelFamily {
  if (provider === 'anthropic') return 'claude'
  if (provider === 'google') return 'gemini'
  if (provider === 'openai') {
    if (modelId.includes('gpt-4') || modelId.startsWith('o')) return 'gpt4'
    return 'gpt3.5'
  }
  if (provider === 'ollama') {
    if (modelId.includes('llama')) return 'llama'
    if (modelId.includes('mistral')) return 'mistral'
    return 'llama'
  }
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
  private maxEntries: number
  private ttlMs: number

  constructor(maxEntries = 100, ttlMs = 5 * 60 * 1000) {
    this.maxEntries = maxEntries
    this.ttlMs = ttlMs
  }

  get(contextHash: string): CompletionResult | null {
    const entry = this.entries.get(contextHash)
    if (!entry) return null

    // Check TTL
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.entries.delete(contextHash)
      return null
    }

    entry.hitCount++
    entry.lastAccessedAt = Date.now()
    return entry.result
  }

  set(contextHash: string, result: CompletionResult): void {
    // Evict oldest entries if at capacity
    if (this.entries.size >= this.maxEntries) {
      this.evictOldest()
    }

    this.entries.set(contextHash, {
      contextHash,
      result,
      hitCount: 0,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    })
  }

  has(contextHash: string): boolean {
    const entry = this.entries.get(contextHash)
    if (!entry) return false
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.entries.delete(contextHash)
      return false
    }
    return true
  }

  invalidate(contextHash: string): void {
    this.entries.delete(contextHash)
  }

  clear(): void {
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }

  get stats(): { size: number; totalHits: number; oldestMs: number } {
    let totalHits = 0
    let oldest = Date.now()
    for (const entry of this.entries.values()) {
      totalHits += entry.hitCount
      if (entry.createdAt < oldest) oldest = entry.createdAt
    }
    return {
      size: this.entries.size,
      totalHits,
      oldestMs: this.entries.size > 0 ? Date.now() - oldest : 0,
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity
    for (const [key, entry] of this.entries) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt
        oldestKey = key
      }
    }
    if (oldestKey) this.entries.delete(oldestKey)
  }

  /** Remove all entries older than TTL */
  prune(): number {
    const now = Date.now()
    let pruned = 0
    for (const [key, entry] of this.entries) {
      if (now - entry.createdAt > this.ttlMs) {
        this.entries.delete(key)
        pruned++
      }
    }
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
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents)
    }
  }

  trackShown(result: CompletionResult, languageId: string): void {
    this.record({
      type: 'shown',
      completionId: result.completionId,
      provider: result.provider,
      model: result.model,
      languageId,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      latencyMs: result.latencyMs,
      timestamp: Date.now(),
    })
  }

  trackAccepted(result: CompletionResult, languageId: string, mode: AcceptMode, linesAccepted: number): void {
    const type = mode === 'full' ? 'accepted' : 'partially-accepted'
    this.record({
      type,
      completionId: result.completionId,
      provider: result.provider,
      model: result.model,
      languageId,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      latencyMs: result.latencyMs,
      acceptMode: mode,
      linesAccepted,
      totalLines: result.lines.length,
      timestamp: Date.now(),
    })
  }

  trackDismissed(result: CompletionResult, languageId: string, reason: CompletionDismissReason): void {
    this.record({
      type: 'dismissed',
      completionId: result.completionId,
      provider: result.provider,
      model: result.model,
      languageId,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      latencyMs: result.latencyMs,
      dismissReason: reason,
      timestamp: Date.now(),
    })
  }

  trackError(provider: AIProvider, model: string, languageId: string, latencyMs: number): void {
    this.record({
      type: 'error',
      completionId: generateCompletionId(),
      provider,
      model,
      languageId,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs,
      timestamp: Date.now(),
    })
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
      // By language
      if (!byLanguage[event.languageId]) {
        byLanguage[event.languageId] = { shown: 0, accepted: 0, rate: 0 }
      }
      if (event.type === 'shown') byLanguage[event.languageId].shown++
      if (event.type === 'accepted') byLanguage[event.languageId].accepted++

      // By provider
      if (!byProvider[event.provider]) {
        byProvider[event.provider] = { shown: 0, accepted: 0, rate: 0, avgLatency: 0 }
      }
      if (event.type === 'shown') {
        byProvider[event.provider].shown++
      }
      if (event.type === 'accepted') {
        byProvider[event.provider].accepted++
      }
    }

    // Calculate rates
    for (const lang of Object.values(byLanguage)) {
      lang.rate = lang.shown > 0 ? lang.accepted / lang.shown : 0
    }
    for (const prov of Object.keys(byProvider)) {
      const p = byProvider[prov]
      p.rate = p.shown > 0 ? p.accepted / p.shown : 0
      const provLatencies = shown.filter(e => e.provider === prov)
      p.avgLatency = provLatencies.length > 0
        ? provLatencies.reduce((s, e) => s + e.latencyMs, 0) / provLatencies.length
        : 0
    }

    return {
      totalShown: shown.length,
      totalAccepted: accepted.length,
      totalPartiallyAccepted: partial.length,
      totalDismissed: dismissed.length,
      totalErrors: errors.length,
      acceptanceRate: shown.length > 0 ? accepted.length / shown.length : 0,
      averageLatencyMs: shown.length > 0 ? totalLatency / shown.length : 0,
      totalPromptTokens: relevant.reduce((s, e) => s + e.promptTokens, 0),
      totalCompletionTokens: relevant.reduce((s, e) => s + e.completionTokens, 0),
      byLanguage,
      byProvider,
    }
  }

  onFlush(callback: (events: CompletionTelemetryEvent[]) => void): () => void {
    this.flushCallbacks.push(callback)
    return () => {
      const idx = this.flushCallbacks.indexOf(callback)
      if (idx >= 0) this.flushCallbacks.splice(idx, 1)
    }
  }

  flush(): void {
    if (this.events.length === 0) return
    const batch = [...this.events]
    for (const cb of this.flushCallbacks) {
      try { cb(batch) } catch { /* swallow */ }
    }
  }

  clear(): void {
    this.events = []
  }

  get eventCount(): number {
    return this.events.length
  }
}

/* ── Rate Limiter ──────────────────────────────────────── */

export class CompletionRateLimiter {
  private state: RateLimitState

  constructor(maxRequestsPerMinute = 20, dailyTokenQuota = 0) {
    this.state = {
      requestCount: 0,
      windowStart: Date.now(),
      maxRequestsPerWindow: maxRequestsPerMinute,
      windowDurationMs: 60_000,
      quotaTokensUsed: 0,
      quotaTokensLimit: dailyTokenQuota,
    }
  }

  canMakeRequest(): boolean {
    this.maybeResetWindow()
    if (this.state.requestCount >= this.state.maxRequestsPerWindow) {
      return false
    }
    if (this.state.quotaTokensLimit > 0 && this.state.quotaTokensUsed >= this.state.quotaTokensLimit) {
      return false
    }
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
    return {
      used: this.state.quotaTokensUsed,
      limit: this.state.quotaTokensLimit,
      percentage: this.state.quotaTokensLimit > 0
        ? (this.state.quotaTokensUsed / this.state.quotaTokensLimit) * 100
        : 0,
    }
  }

  resetQuota(): void {
    this.state.quotaTokensUsed = 0
  }

  updateLimits(maxRequestsPerMinute: number, dailyTokenQuota: number): void {
    this.state.maxRequestsPerWindow = maxRequestsPerMinute
    this.state.quotaTokensLimit = dailyTokenQuota
  }

  private maybeResetWindow(): void {
    const now = Date.now()
    if (now - this.state.windowStart >= this.state.windowDurationMs) {
      this.state.requestCount = 0
      this.state.windowStart = now
    }
  }
}

/* ── FIM Prompt Builder ────────────────────────────────── */

export class FIMPromptBuilder {
  /**
   * Build a fill-in-the-middle prompt for the given provider and context.
   * Manages token budget by trimming prefix/suffix to fit within limits.
   */
  static build(
    context: CompletionContext,
    provider: AIProvider,
    modelId: string,
    maxContextTokens: number,
  ): FIMPrompt {
    const family = getModelFamily(provider, modelId)
    const fim = getFIMTokens(provider, modelId)

    // Reserve tokens: ~20% for suffix, ~10% for imports/metadata, ~70% for prefix
    const importText = context.imports.length > 0
      ? context.imports.join('\n') + '\n'
      : ''
    const importTokens = countTokens(importText, family)
    const metaTokens = 50 // overhead for FIM tokens, file path, language tag
    const availableTokens = maxContextTokens - importTokens - metaTokens

    const suffixBudget = Math.floor(availableTokens * 0.2)
    const prefixBudget = availableTokens - suffixBudget

    // Trim prefix from the beginning if too long
    let prefix = context.prefix
    let prefixTokens = countTokens(prefix, family)
    if (prefixTokens > prefixBudget) {
      // Keep the most recent part of the prefix
      const lines = prefix.split('\n')
      while (countTokens(prefix, family) > prefixBudget && lines.length > 1) {
        lines.shift()
        prefix = lines.join('\n')
      }
      prefixTokens = countTokens(prefix, family)
    }

    // Trim suffix from the end if too long
    let suffix = context.suffix
    let suffixTokens = countTokens(suffix, family)
    if (suffixTokens > suffixBudget) {
      const lines = suffix.split('\n')
      while (countTokens(suffix, family) > suffixBudget && lines.length > 1) {
        lines.pop()
        suffix = lines.join('\n')
      }
      suffixTokens = countTokens(suffix, family)
    }

    // Build open files context if budget allows
    let openFilesText = ''
    const openFilesBudget = Math.max(0, prefixBudget - prefixTokens - 100)
    if (openFilesBudget > 50 && context.openFilesContext.length > 0) {
      const sorted = [...context.openFilesContext].sort((a, b) => b.relevance - a.relevance)
      for (const file of sorted) {
        const snippet = `// From: ${file.filePath}\n${file.content}\n\n`
        const snippetTokens = countTokens(snippet, family)
        if (countTokens(openFilesText, family) + snippetTokens <= openFilesBudget) {
          openFilesText += snippet
        }
      }
    }

    // Language comment for context
    const langComment = `// File: ${context.filePath} (${context.languageId})\n`

    // Assemble the FIM prompt
    const fullPrefix = openFilesText + langComment + importText + prefix
    const prompt = `${fim.prefix}${fullPrefix}${fim.suffix}${suffix}${fim.middle}`
    const totalTokens = countTokens(prompt, family)

    return {
      prompt,
      prefix: fullPrefix,
      suffix,
      tokenCount: totalTokens,
    }
  }

  /**
   * Build a chat-style prompt for providers that don't support FIM natively.
   * Used as a fallback for Anthropic and Google models.
   */
  static buildChatPrompt(
    context: CompletionContext,
    maxContextTokens: number,
    settings: AICompletionSettings,
  ): { system: string; user: string; tokenCount: number } {
    const langPrompt = LANGUAGE_PROMPTS[context.languageId] ?? LANGUAGE_PROMPTS.default ?? ''
    const isComment = isCommentLine(context.currentLine, context.languageId)
    const family = getModelFamily(settings.provider, settings.modelId)

    const system = [
      'You are an AI code completion assistant integrated into the Orion IDE.',
      langPrompt,
      'Complete the code at the cursor position marked with <CURSOR>.',
      'Output ONLY the completion text, nothing else. No explanations, no markdown.',
      settings.multiLine
        ? `Provide up to ${settings.maxCompletionLines} lines if appropriate.`
        : 'Provide a single-line completion.',
      isComment && settings.commentToCode
        ? 'The user just wrote a comment. Suggest the implementation described by the comment.'
        : '',
    ].filter(Boolean).join(' ')

    // Build the user message with surrounding code
    const importText = context.imports.length > 0
      ? `// Imports:\n${context.imports.join('\n')}\n\n`
      : ''

    const budget = maxContextTokens - countTokens(system, family) - 100
    let prefix = context.prefix
    let suffix = context.suffix

    // Trim to fit
    const prefixBudget = Math.floor(budget * 0.7)
    const suffixBudget = budget - prefixBudget
    if (countTokens(prefix, family) > prefixBudget) {
      const lines = prefix.split('\n')
      while (countTokens(lines.join('\n'), family) > prefixBudget && lines.length > 1) {
        lines.shift()
      }
      prefix = lines.join('\n')
    }
    if (countTokens(suffix, family) > suffixBudget) {
      const lines = suffix.split('\n')
      while (countTokens(lines.join('\n'), family) > suffixBudget && lines.length > 1) {
        lines.pop()
      }
      suffix = lines.join('\n')
    }

    const user = `${importText}${prefix}<CURSOR>${suffix}`
    const tokenCount = countTokens(system + user, family)

    return { system, user, tokenCount }
  }
}

/* ── Completion Provider Interface ─────────────────────── */

export interface ICompletionProvider {
  readonly id: string
  readonly name: string
  readonly provider: AIProvider

  /** Check if this provider is available (has API key, server is reachable, etc.) */
  isAvailable(): Promise<boolean>

  /** Generate a completion for the given context */
  complete(
    context: CompletionContext,
    settings: AICompletionSettings,
    signal: AbortSignal,
  ): Promise<CompletionResult>

  /** Generate a streaming completion (yields partial text) */
  completeStream(
    context: CompletionContext,
    settings: AICompletionSettings,
    signal: AbortSignal,
    onChunk: (chunk: string) => void,
  ): Promise<CompletionResult>
}

/* ── Built-in Providers ────────────────────────────────── */

class AnthropicCompletionProvider implements ICompletionProvider {
  readonly id = 'anthropic-completion'
  readonly name = 'Anthropic'
  readonly provider: AIProvider = 'anthropic'

  async isAvailable(): Promise<boolean> {
    const configs = getProviderConfigs()
    return Boolean(configs.anthropic?.apiKey)
  }

  async complete(
    context: CompletionContext,
    settings: AICompletionSettings,
    signal: AbortSignal,
  ): Promise<CompletionResult> {
    const startTime = Date.now()
    const configs = getProviderConfigs()
    const config = configs.anthropic
    const { system, user, tokenCount: promptTokens } = FIMPromptBuilder.buildChatPrompt(
      context, settings.maxContextTokens, settings,
    )

    const body = {
      model: settings.modelId,
      max_tokens: settings.maxCompletionTokens,
      temperature: settings.temperature,
      system,
      messages: [{ role: 'user', content: user }],
      stop_sequences: ['\n\n\n', '```'],
    }

    const response = await fetch(`${config.baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
        ...config.headers,
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    const latencyMs = Date.now() - startTime

    return {
      text: text.trimEnd(),
      lines: splitCompletionIntoLines(text.trimEnd()),
      provider: 'anthropic',
      model: settings.modelId,
      promptTokens,
      completionTokens: data.usage?.output_tokens ?? countTokens(text, 'claude'),
      latencyMs,
      totalTimeMs: Date.now() - startTime,
      completionId: generateCompletionId(),
      timestamp: Date.now(),
    }
  }

  async completeStream(
    context: CompletionContext,
    settings: AICompletionSettings,
    signal: AbortSignal,
    onChunk: (chunk: string) => void,
  ): Promise<CompletionResult> {
    const startTime = Date.now()
    const configs = getProviderConfigs()
    const config = configs.anthropic
    const { system, user, tokenCount: promptTokens } = FIMPromptBuilder.buildChatPrompt(
      context, settings.maxContextTokens, settings,
    )

    const body = {
      model: settings.modelId,
      max_tokens: settings.maxCompletionTokens,
      temperature: settings.temperature,
      stream: true,
      system,
      messages: [{ role: 'user', content: user }],
      stop_sequences: ['\n\n\n', '```'],
    }

    const response = await fetch(`${config.baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
        ...config.headers,
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`)
    }

    let fullText = ''
    let firstChunkTime = 0
    const reader = response.body?.getReader()
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
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'content_block_delta' && event.delta?.text) {
                if (!firstChunkTime) firstChunkTime = Date.now()
                fullText += event.delta.text
                onChunk(event.delta.text)
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    }

    const latencyMs = firstChunkTime ? firstChunkTime - startTime : Date.now() - startTime

    return {
      text: fullText.trimEnd(),
      lines: splitCompletionIntoLines(fullText.trimEnd()),
      provider: 'anthropic',
      model: settings.modelId,
      promptTokens,
      completionTokens: countTokens(fullText, 'claude'),
      latencyMs,
      totalTimeMs: Date.now() - startTime,
      completionId: generateCompletionId(),
      timestamp: Date.now(),
    }
  }
}

class OpenAICompletionProvider implements ICompletionProvider {
  readonly id = 'openai-completion'
  readonly name = 'OpenAI'
  readonly provider: AIProvider = 'openai'

  async isAvailable(): Promise<boolean> {
    const configs = getProviderConfigs()
    return Boolean(configs.openai?.apiKey)
  }

  async complete(
    context: CompletionContext,
    settings: AICompletionSettings,
    signal: AbortSignal,
  ): Promise<CompletionResult> {
    const startTime = Date.now()
    const configs = getProviderConfigs()
    const config = configs.openai
    const { system, user, tokenCount: promptTokens } = FIMPromptBuilder.buildChatPrompt(
      context, settings.maxContextTokens, settings,
    )

    const body = {
      model: settings.modelId,
      max_tokens: settings.maxCompletionTokens,
      temperature: settings.temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stop: ['\n\n\n', '```'],
    }

    const response = await fetch(`${config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey || ''}`,
        ...(config.organization ? { 'OpenAI-Organization': config.organization } : {}),
        ...config.headers,
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''
    const latencyMs = Date.now() - startTime

    return {
      text: text.trimEnd(),
      lines: splitCompletionIntoLines(text.trimEnd()),
      provider: 'openai',
      model: settings.modelId,
      promptTokens: data.usage?.prompt_tokens ?? promptTokens,
      completionTokens: data.usage?.completion_tokens ?? countTokens(text, 'gpt4'),
      latencyMs,
      totalTimeMs: Date.now() - startTime,
      completionId: generateCompletionId(),
      timestamp: Date.now(),
    }
  }

  async completeStream(
    context: CompletionContext,
    settings: AICompletionSettings,
    signal: AbortSignal,
    onChunk: (chunk: string) => void,
  ): Promise<CompletionResult> {
    const startTime = Date.now()
    const configs = getProviderConfigs()
    const config = configs.openai
    const { system, user, tokenCount: promptTokens } = FIMPromptBuilder.buildChatPrompt(
      context, settings.maxContextTokens, settings,
    )

    const body = {
      model: settings.modelId,
      max_tokens: settings.maxCompletionTokens,
      temperature: settings.temperature,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stop: ['\n\n\n', '```'],
    }

    const response = await fetch(`${config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey || ''}`,
        ...(config.organization ? { 'OpenAI-Organization': config.organization } : {}),
        ...config.headers,
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    let fullText = ''
    let firstChunkTime = 0
    const reader = response.body?.getReader()
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
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const event = JSON.parse(line.slice(6))
              const delta = event.choices?.[0]?.delta?.content
              if (delta) {
                if (!firstChunkTime) firstChunkTime = Date.now()
                fullText += delta
                onChunk(delta)
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    }

    const latencyMs = firstChunkTime ? firstChunkTime - startTime : Date.now() - startTime

    return {
      text: fullText.trimEnd(),
      lines: splitCompletionIntoLines(fullText.trimEnd()),
      provider: 'openai',
      model: settings.modelId,
      promptTokens,
      completionTokens: countTokens(fullText, 'gpt4'),
      latencyMs,
      totalTimeMs: Date.now() - startTime,
      completionId: generateCompletionId(),
      timestamp: Date.now(),
    }
  }
}

class OllamaCompletionProvider implements ICompletionProvider {
  readonly id = 'ollama-completion'
  readonly name = 'Ollama (Local)'
  readonly provider: AIProvider = 'ollama'

  async isAvailable(): Promise<boolean> {
    const configs = getProviderConfigs()
    const baseUrl = configs.ollama?.baseUrl || 'http://localhost:11434'
    try {
      const resp = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(2000) })
      return resp.ok
    } catch {
      return false
    }
  }

  async complete(
    context: CompletionContext,
    settings: AICompletionSettings,
    signal: AbortSignal,
  ): Promise<CompletionResult> {
    const startTime = Date.now()
    const configs = getProviderConfigs()
    const baseUrl = configs.ollama?.baseUrl || 'http://localhost:11434'

    const fimPrompt = FIMPromptBuilder.build(
      context, 'ollama', settings.modelId, settings.maxContextTokens,
    )

    const body = {
      model: settings.modelId,
      prompt: fimPrompt.prompt,
      stream: false,
      options: {
        temperature: settings.temperature,
        num_predict: settings.maxCompletionTokens,
        stop: ['\n\n\n', '<|endoftext|>', '<|end|>', '```'],
      },
    }

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const text = data.response || ''
    const latencyMs = Date.now() - startTime

    return {
      text: text.trimEnd(),
      lines: splitCompletionIntoLines(text.trimEnd()),
      provider: 'ollama',
      model: settings.modelId,
      promptTokens: data.prompt_eval_count ?? fimPrompt.tokenCount,
      completionTokens: data.eval_count ?? countTokens(text, 'llama'),
      latencyMs,
      totalTimeMs: Date.now() - startTime,
      completionId: generateCompletionId(),
      timestamp: Date.now(),
    }
  }

  async completeStream(
    context: CompletionContext,
    settings: AICompletionSettings,
    signal: AbortSignal,
    onChunk: (chunk: string) => void,
  ): Promise<CompletionResult> {
    const startTime = Date.now()
    const configs = getProviderConfigs()
    const baseUrl = configs.ollama?.baseUrl || 'http://localhost:11434'

    const fimPrompt = FIMPromptBuilder.build(
      context, 'ollama', settings.modelId, settings.maxContextTokens,
    )

    const body = {
      model: settings.modelId,
      prompt: fimPrompt.prompt,
      stream: true,
      options: {
        temperature: settings.temperature,
        num_predict: settings.maxCompletionTokens,
        stop: ['\n\n\n', '<|endoftext|>', '<|end|>', '```'],
      },
    }

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
    }

    let fullText = ''
    let firstChunkTime = 0
    const reader = response.body?.getReader()
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
          try {
            const event = JSON.parse(line)
            if (event.response) {
              if (!firstChunkTime) firstChunkTime = Date.now()
              fullText += event.response
              onChunk(event.response)
            }
          } catch { /* ignore */ }
        }
      }
    }

    const latencyMs = firstChunkTime ? firstChunkTime - startTime : Date.now() - startTime

    return {
      text: fullText.trimEnd(),
      lines: splitCompletionIntoLines(fullText.trimEnd()),
      provider: 'ollama',
      model: settings.modelId,
      promptTokens: fimPrompt.tokenCount,
      completionTokens: countTokens(fullText, 'llama'),
      latencyMs,
      totalTimeMs: Date.now() - startTime,
      completionId: generateCompletionId(),
      timestamp: Date.now(),
    }
  }
}

/* ── Provider Registry ─────────────────────────────────── */

const builtInProviders: ICompletionProvider[] = [
  new AnthropicCompletionProvider(),
  new OpenAICompletionProvider(),
  new OllamaCompletionProvider(),
]

const customProviders = new Map<string, ICompletionProvider>()

export function registerCompletionProvider(provider: ICompletionProvider): () => void {
  customProviders.set(provider.id, provider)
  return () => { customProviders.delete(provider.id) }
}

export function getCompletionProvider(providerType: AIProvider): ICompletionProvider | undefined {
  // Check custom providers first
  for (const p of customProviders.values()) {
    if (p.provider === providerType) return p
  }
  return builtInProviders.find(p => p.provider === providerType)
}

export function getAllCompletionProviders(): ICompletionProvider[] {
  return [...builtInProviders, ...customProviders.values()]
}

/* ── Default Settings ──────────────────────────────────── */

const DEFAULT_SETTINGS: AICompletionSettings = {
  enabled: true,
  provider: 'anthropic',
  modelId: 'claude-sonnet-4-6',
  debounceMs: 300,
  temperature: 0.1,
  maxCompletionTokens: 256,
  maxContextTokens: 4096,
  multiLine: true,
  maxCompletionLines: 15,
  commentToCode: true,
  languageOverrides: {},
  showInlineDiff: true,
  autoDismissMs: 0,
  cacheMaxEntries: 100,
  cacheTtlMs: 5 * 60 * 1000,
  rateLimitPerMinute: 20,
  dailyTokenQuota: 0,
}

const SETTINGS_STORAGE_KEY = 'orion:ai-completion-settings'

function loadSettings(): AICompletionSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(settings: AICompletionSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
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
    this.rateLimiter = new CompletionRateLimiter(
      this.settings.rateLimitPerMinute,
      this.settings.dailyTokenQuota,
    )
  }

  /* ── Public API ────────────────────────────────── */

  /**
   * Trigger a completion request with debouncing.
   * Cancels any in-flight request and schedules a new one.
   */
  trigger(context: CompletionContext): void {
    if (this._isDisposed) return
    if (!this.settings.enabled) return
    if (!this.isLanguageEnabled(context.languageId)) return

    // Smart triggering: check if we should suppress
    if (!this.shouldTrigger(context)) {
      return
    }

    // Cancel existing
    this.cancelPending()

    const store = useAICompletionStore.getState()
    const delay = this.settings.debounceMs

    this.debounceTimer = setTimeout(() => {
      this.executeCompletion(context).catch(err => {
        if (err.name !== 'AbortError') {
          console.warn('[AICodeCompletion] Error:', err.message)
          store.setStatus('error')
          store.setError(err.message)
        }
      })
    }, delay)

    store.setStatus('idle')
  }

  /**
   * Execute completion immediately without debouncing.
   */
  async triggerImmediate(context: CompletionContext): Promise<CompletionResult | null> {
    if (this._isDisposed) return null
    if (!this.settings.enabled) return null

    this.cancelPending()
    return this.executeCompletion(context)
  }

  /**
   * Cancel any pending or in-flight completion.
   */
  cancelPending(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    if (this.autoDismissTimer) {
      clearTimeout(this.autoDismissTimer)
      this.autoDismissTimer = null
    }
  }

  /**
   * Accept the current ghost text (full, line, or word).
   */
  accept(mode: AcceptMode = 'full'): string | null {
    const store = useAICompletionStore.getState()
    const ghost = store.ghostText
    const result = store.currentResult

    if (!ghost || !result) return null

    let acceptedText: string
    let linesAccepted: number

    switch (mode) {
      case 'full': {
        acceptedText = ghost.remainingText
        linesAccepted = ghost.lines.length - ghost.acceptedLineIndex
        this.telemetry.trackAccepted(result, store.languageId, 'full', linesAccepted)
        store.clearGhostText()
        break
      }
      case 'line': {
        const nextLineIdx = ghost.acceptedLineIndex
        if (nextLineIdx >= ghost.lines.length) {
          store.clearGhostText()
          return null
        }
        acceptedText = ghost.lines[nextLineIdx]
        if (nextLineIdx < ghost.lines.length - 1) acceptedText += '\n'
        linesAccepted = 1
        const newAcceptedIdx = nextLineIdx + 1

        if (newAcceptedIdx >= ghost.lines.length) {
          this.telemetry.trackAccepted(result, store.languageId, 'line', linesAccepted)
          store.clearGhostText()
        } else {
          const remaining = ghost.lines.slice(newAcceptedIdx).join('\n')
          store.setGhostText({
            ...ghost,
            acceptedLineIndex: newAcceptedIdx,
            remainingText: remaining,
            diffSegments: computeInlineDiffSegments('', remaining),
          })
          this.telemetry.trackAccepted(result, store.languageId, 'line', linesAccepted)
        }
        break
      }
      case 'word': {
        const remaining = ghost.remainingText
        // Extract next word (including leading whitespace)
        const wordMatch = remaining.match(/^(\s*\S+)/)
        if (!wordMatch) {
          store.clearGhostText()
          return null
        }
        acceptedText = wordMatch[1]
        linesAccepted = 0
        const newRemaining = remaining.slice(acceptedText.length)

        if (!newRemaining) {
          this.telemetry.trackAccepted(result, store.languageId, 'word', 0)
          store.clearGhostText()
        } else {
          // Recalculate line index based on what's remaining
          const newLines = splitCompletionIntoLines(newRemaining)
          store.setGhostText({
            ...ghost,
            acceptedWordCount: ghost.acceptedWordCount + 1,
            remainingText: newRemaining,
            lines: newLines,
            acceptedLineIndex: 0,
            diffSegments: computeInlineDiffSegments('', newRemaining),
          })
          this.telemetry.trackAccepted(result, store.languageId, 'word', 0)
        }
        break
      }
    }

    return acceptedText!
  }

  /**
   * Dismiss the current ghost text.
   */
  dismiss(reason: CompletionDismissReason = 'manual'): void {
    const store = useAICompletionStore.getState()
    const result = store.currentResult
    if (result) {
      this.telemetry.trackDismissed(result, store.languageId, reason)
    }
    store.clearGhostText()
    store.setStatus('idle')
    this.cancelPending()
  }

  /**
   * Update engine settings.
   */
  updateSettings(partial: Partial<AICompletionSettings>): void {
    this.settings = { ...this.settings, ...partial }
    saveSettings(this.settings)

    if (partial.cacheMaxEntries !== undefined || partial.cacheTtlMs !== undefined) {
      this.cache = new CompletionCache(this.settings.cacheMaxEntries, this.settings.cacheTtlMs)
    }
    if (partial.rateLimitPerMinute !== undefined || partial.dailyTokenQuota !== undefined) {
      this.rateLimiter.updateLimits(this.settings.rateLimitPerMinute, this.settings.dailyTokenQuota)
    }

    useAICompletionStore.getState().setSettings(this.settings)
  }

  getSettings(): AICompletionSettings {
    return { ...this.settings }
  }

  getTelemetry(): CompletionTelemetry {
    return this.telemetry
  }

  getTelemetrySummary(sinceMs?: number): CompletionTelemetrySummary {
    return this.telemetry.getSummary(sinceMs)
  }

  getRateLimitState(): { canRequest: boolean; waitMs: number; quota: ReturnType<CompletionRateLimiter['getQuotaUsage']> } {
    return {
      canRequest: this.rateLimiter.canMakeRequest(),
      waitMs: this.rateLimiter.getTimeUntilNextSlot(),
      quota: this.rateLimiter.getQuotaUsage(),
    }
  }

  getCacheStats(): ReturnType<CompletionCache['stats']> {
    return this.cache.stats
  }

  clearCache(): void {
    this.cache.clear()
  }

  dispose(): void {
    this._isDisposed = true
    this.cancelPending()
    this.cache.clear()
    this.telemetry.flush()
  }

  /* ── Private ───────────────────────────────────── */

  private isLanguageEnabled(languageId: string): boolean {
    const override = this.settings.languageOverrides[languageId]
    if (override !== undefined) return override.enabled
    return true
  }

  private shouldTrigger(context: CompletionContext): boolean {
    const { prefix, currentLine, languageId } = context

    // Don't trigger on empty lines (unless it's after a comment for comment-to-code)
    if (!currentLine.trim()) {
      // Check if previous line was a comment (for comment-to-code)
      if (this.settings.commentToCode) {
        const lines = prefix.split('\n')
        const prevLine = lines.length >= 2 ? lines[lines.length - 2] : ''
        if (isCommentLine(prevLine, languageId)) return true
      }
      return false
    }

    // Don't trigger inside strings
    if (isInsideString(prefix)) return false

    // Don't trigger inside comments (but DO trigger for comment-to-code on comment lines)
    if (isInsideComment(prefix, languageId)) {
      // Allow if the whole line is a comment (comment-to-code)
      if (this.settings.commentToCode && isCommentLine(currentLine, languageId)) {
        return true
      }
      return false
    }

    // Don't trigger after suppression tokens (unless line has content after them)
    const lineAfterLastToken = currentLine.trimEnd()
    if (shouldSuppressTrigger(lineAfterLastToken)) {
      // Allow if there's content after the last suppression token
      // e.g., `if (` should suppress, but `if (condition)` should not
      return false
    }

    // Minimum typing threshold: need at least 2 chars on the current line
    const trimmedLine = currentLine.trim()
    if (trimmedLine.length < 2) return false

    return true
  }

  private async executeCompletion(context: CompletionContext): Promise<CompletionResult | null> {
    const store = useAICompletionStore.getState()

    // Check rate limit
    if (!this.rateLimiter.canMakeRequest()) {
      store.setStatus('rate-limited')
      const waitMs = this.rateLimiter.getTimeUntilNextSlot()
      store.setError(`Rate limited. Try again in ${Math.ceil(waitMs / 1000)}s`)
      return null
    }

    // Check cache
    const contextHash = hashContext(context.prefix, context.suffix, context.filePath)
    if (contextHash === this.lastContextHash && store.ghostText) {
      return store.currentResult
    }
    this.lastContextHash = contextHash

    const cached = this.cache.get(contextHash)
    if (cached) {
      this.presentResult(cached, context)
      return cached
    }

    // Set up abort controller
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    store.setStatus('gathering-context')
    store.setLanguageId(context.languageId)

    // Get the provider
    const provider = getCompletionProvider(this.settings.provider)
    if (!provider) {
      store.setStatus('error')
      store.setError(`No completion provider found for: ${this.settings.provider}`)
      return null
    }

    store.setStatus('requesting')

    try {
      let result: CompletionResult

      // Use streaming if the model supports it
      const modelConfig = AI_MODELS.find(m => m.modelId === this.settings.modelId)
      if (modelConfig?.supportsStreaming) {
        let streamedText = ''
        store.setStatus('streaming')

        result = await provider.completeStream(
          context,
          this.settings,
          signal,
          (chunk) => {
            streamedText += chunk
            // Update ghost text incrementally during streaming
            const lines = splitCompletionIntoLines(streamedText.trimEnd())
            if (lines.length > this.settings.maxCompletionLines) {
              // Abort if we've exceeded max lines
              this.abortController?.abort()
              return
            }
            store.setGhostText({
              text: streamedText.trimEnd(),
              lines,
              acceptedLineIndex: 0,
              acceptedWordCount: 0,
              remainingText: streamedText.trimEnd(),
              diffSegments: computeInlineDiffSegments('', streamedText.trimEnd()),
              anchorLine: context.cursor.line,
              anchorColumn: context.cursor.column,
            })
          },
        )
      } else {
        result = await provider.complete(context, this.settings, signal)
      }

      // Validate and trim result
      if (!result.text || result.text.trim().length === 0) {
        store.setStatus('idle')
        return null
      }

      // Enforce max lines
      if (result.lines.length > this.settings.maxCompletionLines) {
        result.lines = result.lines.slice(0, this.settings.maxCompletionLines)
        result.text = result.lines.join('\n')
      }

      // Enforce single-line if multiLine is disabled
      if (!this.settings.multiLine && result.lines.length > 1) {
        result.lines = [result.lines[0]]
        result.text = result.lines[0]
      }

      // Record in rate limiter and cache
      this.rateLimiter.recordRequest(result.promptTokens + result.completionTokens)
      this.cache.set(contextHash, result)

      this.presentResult(result, context)
      return result
    } catch (err: any) {
      if (err.name === 'AbortError') {
        store.setStatus('cancelled')
        return null
      }
      store.setStatus('error')
      store.setError(err.message || 'Unknown completion error')
      this.telemetry.trackError(
        this.settings.provider,
        this.settings.modelId,
        context.languageId,
        0,
      )
      return null
    }
  }

  private presentResult(result: CompletionResult, context: CompletionContext): void {
    const store = useAICompletionStore.getState()
    const existingText = context.suffix.split('\n')[0] || ''

    store.setCurrentResult(result)
    store.setGhostText({
      text: result.text,
      lines: result.lines,
      acceptedLineIndex: 0,
      acceptedWordCount: 0,
      remainingText: result.text,
      diffSegments: this.settings.showInlineDiff
        ? computeInlineDiffSegments(existingText, result.text)
        : [{ type: 'insert', text: result.text }],
      anchorLine: context.cursor.line,
      anchorColumn: context.cursor.column,
    })
    store.setStatus('ready')

    this.telemetry.trackShown(result, context.languageId)

    // Set up auto-dismiss
    if (this.settings.autoDismissMs > 0) {
      if (this.autoDismissTimer) clearTimeout(this.autoDismissTimer)
      this.autoDismissTimer = setTimeout(() => {
        this.dismiss('manual')
      }, this.settings.autoDismissMs)
    }
  }
}

/* ── Context Gatherer ──────────────────────────────────── */

/**
 * Helper to build a CompletionContext from raw editor state.
 * Used by editor components to feed the completion engine.
 */
export function gatherCompletionContext(
  fileContent: string,
  filePath: string,
  languageId: string,
  cursorOffset: number,
  openFiles?: Array<{ path: string; content: string; languageId: string }>,
): CompletionContext {
  const prefix = fileContent.slice(0, cursorOffset)
  const suffix = fileContent.slice(cursorOffset)

  // Calculate line/column from offset
  const linesBeforeCursor = prefix.split('\n')
  const line = linesBeforeCursor.length - 1
  const column = linesBeforeCursor[linesBeforeCursor.length - 1].length
  const currentLine = linesBeforeCursor[linesBeforeCursor.length - 1]

  const imports = extractImports(fileContent, languageId)
  const indent = detectIndentation(fileContent)

  // Build open files context with relevance scoring
  const openFilesContext: OpenFileSnippet[] = []
  if (openFiles) {
    for (const file of openFiles) {
      if (file.path === filePath) continue
      // Compute a simple relevance score based on import overlap
      const fileImports = extractImports(file.content, file.languageId)
      const sharedImports = imports.filter(imp =>
        fileImports.some(fi => fi.includes(imp.split(' ').pop()?.replace(/['"`;]/g, '') || ''))
      )
      const relevance = Math.min(1, sharedImports.length * 0.2 + 0.1)
      // Take first 50 lines as context snippet
      const snippet = file.content.split('\n').slice(0, 50).join('\n')
      openFilesContext.push({
        filePath: file.path,
        languageId: file.languageId,
        content: snippet,
        relevance,
      })
    }
    // Sort by relevance descending, take top 3
    openFilesContext.sort((a, b) => b.relevance - a.relevance)
    openFilesContext.splice(3)
  }

  return {
    fileContent,
    prefix,
    suffix,
    filePath,
    languageId,
    cursor: { line, column, offset: cursorOffset },
    imports,
    openFilesContext,
    currentLine,
    indentLevel: getLeadingWhitespace(currentLine),
    indentUnit: indent.unit,
  }
}

/* ── Zustand Store ─────────────────────────────────────── */

export interface AICompletionStoreState {
  /** Current completion status */
  status: CompletionStatus
  /** Ghost text being displayed */
  ghostText: GhostTextState | null
  /** Current completion result (for telemetry and accept) */
  currentResult: CompletionResult | null
  /** Last error message */
  error: string | null
  /** Language ID of the current context */
  languageId: string
  /** Settings snapshot */
  settings: AICompletionSettings

  /* ── Actions ────────────────────────────── */
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

  updateSettings: (partial) => {
    const current = get().settings
    const next = { ...current, ...partial }
    saveSettings(next)
    set({ settings: next })
  },

  reset: () => set({ ...initialStoreState, settings: get().settings }),
}))

/* ── Keyboard Handlers ─────────────────────────────────── */

export interface CompletionKeyBindings {
  /** Accept full completion (default: Tab) */
  acceptFull: string
  /** Dismiss completion (default: Escape) */
  dismiss: string
  /** Accept next word (default: Ctrl+Right) */
  acceptWord: string
  /** Accept next line (default: Ctrl+Shift+Right) */
  acceptLine: string
}

const DEFAULT_KEYBINDINGS: CompletionKeyBindings = {
  acceptFull: 'Tab',
  dismiss: 'Escape',
  acceptWord: 'Ctrl+ArrowRight',
  acceptLine: 'Ctrl+Shift+ArrowRight',
}

/**
 * Create a keyboard event handler for completion interactions.
 * Attach this to the editor's keydown event.
 */
export function createCompletionKeyHandler(
  engine: AICodeCompletionEngine,
  onAccept: (text: string) => void,
  keybindings?: Partial<CompletionKeyBindings>,
): (event: KeyboardEvent) => boolean {
  const bindings = { ...DEFAULT_KEYBINDINGS, ...keybindings }

  return (event: KeyboardEvent): boolean => {
    const store = useAICompletionStore.getState()
    if (!store.ghostText) return false

    const key = buildKeyString(event)

    // Accept full completion
    if (key === bindings.acceptFull) {
      const text = engine.accept('full')
      if (text) {
        event.preventDefault()
        event.stopPropagation()
        onAccept(text)
        return true
      }
    }

    // Dismiss
    if (key === bindings.dismiss) {
      engine.dismiss('escape')
      event.preventDefault()
      return true
    }

    // Accept word
    if (key === bindings.acceptWord) {
      const text = engine.accept('word')
      if (text) {
        event.preventDefault()
        event.stopPropagation()
        onAccept(text)
        return true
      }
    }

    // Accept line
    if (key === bindings.acceptLine) {
      const text = engine.accept('line')
      if (text) {
        event.preventDefault()
        event.stopPropagation()
        onAccept(text)
        return true
      }
    }

    return false
  }
}

function buildKeyString(event: KeyboardEvent): string {
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push('Alt')
  parts.push(event.key)
  return parts.join('+')
}

/* ── Singleton Engine Instance ─────────────────────────── */

let _engineInstance: AICodeCompletionEngine | null = null

/**
 * Get or create the global completion engine instance.
 */
export function getCompletionEngine(): AICodeCompletionEngine {
  if (!_engineInstance) {
    _engineInstance = new AICodeCompletionEngine()
  }
  return _engineInstance
}

/**
 * Reset the global engine instance (useful for testing).
 */
export function resetCompletionEngine(): void {
  _engineInstance?.dispose()
  _engineInstance = null
}
