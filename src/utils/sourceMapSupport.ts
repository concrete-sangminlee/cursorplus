/**
 * Source map parsing and resolution system.
 * Supports Source Map V3 format with VLQ decoding, inline source maps,
 * index maps (sections), stack trace mapping, and debug adapter integration.
 */

/* ── Types ─────────────────────────────────────────────── */

export interface SourcePosition {
  source: string
  line: number
  column: number
  name?: string
}

export interface GeneratedPosition {
  line: number
  column: number
}

export interface MappingSegment {
  generatedColumn: number
  sourceIndex?: number
  originalLine?: number
  originalColumn?: number
  nameIndex?: number
}

export interface SourceMapV3 {
  version: 3
  file?: string
  sourceRoot?: string
  sources: string[]
  sourcesContent?: (string | null)[]
  names: string[]
  mappings: string
  sections?: SourceMapSection[]
}

export interface SourceMapSection {
  offset: { line: number; column: number }
  map: SourceMapV3
}

export interface StackFrame {
  functionName?: string
  file: string
  line: number
  column: number
}

export interface MappedStackFrame extends StackFrame {
  originalFile?: string
  originalLine?: number
  originalColumn?: number
  originalName?: string
}

export interface BreakpointMapping {
  originalFile: string
  originalLine: number
  originalColumn?: number
  generatedFile: string
  generatedLine: number
  generatedColumn: number
}

interface DecodedMapping {
  generatedLine: number
  generatedColumn: number
  sourceIndex: number
  originalLine: number
  originalColumn: number
  nameIndex: number
}

interface ValidationResult {
  valid: boolean
  errors: string[]
}

/* ── VLQ Decoder ───────────────────────────────────────── */

const VLQ_BASE_SHIFT = 5
const VLQ_BASE = 1 << VLQ_BASE_SHIFT          // 32
const VLQ_BASE_MASK = VLQ_BASE - 1             // 0b11111
const VLQ_CONTINUATION_BIT = VLQ_BASE          // 0b100000

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const base64Lookup: Record<string, number> = {}
for (let i = 0; i < BASE64_CHARS.length; i++) {
  base64Lookup[BASE64_CHARS[i]] = i
}

function decodeVLQ(encoded: string, index: number): [value: number, newIndex: number] {
  let result = 0
  let shift = 0
  let continuation: boolean

  do {
    if (index >= encoded.length) {
      throw new Error('Unexpected end of VLQ data')
    }

    const char = encoded[index++]
    const digit = base64Lookup[char]

    if (digit === undefined) {
      throw new Error(`Invalid base64 character: ${char}`)
    }

    continuation = (digit & VLQ_CONTINUATION_BIT) !== 0
    result += (digit & VLQ_BASE_MASK) << shift
    shift += VLQ_BASE_SHIFT
  } while (continuation)

  // The least significant bit is the sign bit
  const isNegative = (result & 1) !== 0
  const value = result >> 1

  return [isNegative ? -value : value, index]
}

function decodeVLQSegment(encoded: string, index: number): [values: number[], newIndex: number] {
  const values: number[] = []

  while (index < encoded.length) {
    const char = encoded[index]
    if (char === ',' || char === ';') break

    let value: number
    ;[value, index] = decodeVLQ(encoded, index)
    values.push(value)
  }

  return [values, index]
}

/* ── Mapping Decoder ───────────────────────────────────── */

function decodeMappings(mappingsStr: string): DecodedMapping[] {
  const mappings: DecodedMapping[] = []

  if (!mappingsStr) return mappings

  let generatedLine = 0
  let sourceIndex = 0
  let originalLine = 0
  let originalColumn = 0
  let nameIndex = 0
  let index = 0

  while (index < mappingsStr.length) {
    const char = mappingsStr[index]

    if (char === ';') {
      generatedLine++
      index++
      continue
    }

    if (char === ',') {
      index++
      continue
    }

    let values: number[]
    ;[values, index] = decodeVLQSegment(mappingsStr, index)

    if (values.length === 0) continue

    // First value is always the generated column (relative)
    let generatedColumn = values[0]

    const mapping: DecodedMapping = {
      generatedLine,
      generatedColumn,
      sourceIndex: -1,
      originalLine: -1,
      originalColumn: -1,
      nameIndex: -1,
    }

    if (values.length >= 4) {
      sourceIndex += values[1]
      originalLine += values[2]
      originalColumn += values[3]

      mapping.sourceIndex = sourceIndex
      mapping.originalLine = originalLine
      mapping.originalColumn = originalColumn
    }

    if (values.length >= 5) {
      nameIndex += values[4]
      mapping.nameIndex = nameIndex
    }

    mappings.push(mapping)
  }

  // The generated columns within each line are relative; accumulate them
  return resolveRelativeColumns(mappings)
}

function resolveRelativeColumns(mappings: DecodedMapping[]): DecodedMapping[] {
  let currentLine = -1
  let columnAccumulator = 0

  return mappings.map((m) => {
    if (m.generatedLine !== currentLine) {
      currentLine = m.generatedLine
      columnAccumulator = m.generatedColumn
    } else {
      columnAccumulator += m.generatedColumn
    }

    return { ...m, generatedColumn: columnAccumulator }
  })
}

/* ── Validation ────────────────────────────────────────── */

export function validateSourceMap(raw: unknown): ValidationResult {
  const errors: string[] = []

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Source map must be an object'] }
  }

  const obj = raw as Record<string, unknown>

  if (obj.version !== 3) {
    errors.push(`Expected version 3, got ${String(obj.version)}`)
  }

  // Index maps use sections instead of mappings/sources
  if (Array.isArray(obj.sections)) {
    const sections = obj.sections as unknown[]
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i] as Record<string, unknown> | undefined
      if (!section || typeof section !== 'object') {
        errors.push(`sections[${i}] must be an object`)
        continue
      }
      const offset = section.offset as Record<string, unknown> | undefined
      if (!offset || typeof offset.line !== 'number' || typeof offset.column !== 'number') {
        errors.push(`sections[${i}].offset must have numeric line and column`)
      }
      if (!section.map || typeof section.map !== 'object') {
        errors.push(`sections[${i}].map must be a source map object`)
      }
    }
    return { valid: errors.length === 0, errors }
  }

  if (!Array.isArray(obj.sources)) {
    errors.push('"sources" must be an array')
  }

  if (!Array.isArray(obj.names)) {
    errors.push('"names" must be an array')
  }

  if (typeof obj.mappings !== 'string') {
    errors.push('"mappings" must be a string')
  }

  if (obj.sourcesContent !== undefined && !Array.isArray(obj.sourcesContent)) {
    errors.push('"sourcesContent" must be an array if present')
  }

  return { valid: errors.length === 0, errors }
}

/* ── Path Resolution ───────────────────────────────────── */

function resolveSourcePath(source: string, sourceRoot?: string, mapUrl?: string): string {
  // Absolute URLs or paths pass through
  if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('/')) {
    return source
  }

  let base = ''

  if (sourceRoot) {
    base = sourceRoot.endsWith('/') ? sourceRoot : sourceRoot + '/'
  } else if (mapUrl) {
    const lastSlash = mapUrl.lastIndexOf('/')
    base = lastSlash >= 0 ? mapUrl.substring(0, lastSlash + 1) : ''
  }

  const combined = base + source

  // Normalize .. and . segments
  return normalizePath(combined)
}

function normalizePath(path: string): string {
  const parts = path.split('/')
  const resolved: string[] = []

  for (const part of parts) {
    if (part === '.' || part === '') continue
    if (part === '..') {
      resolved.pop()
    } else {
      resolved.push(part)
    }
  }

  const prefix = path.startsWith('/') ? '/' : ''
  return prefix + resolved.join('/')
}

/* ── Inline Source Map Support ─────────────────────────── */

function parseInlineSourceMap(dataUrl: string): SourceMapV3 {
  const prefix = 'data:application/json;base64,'
  const prefixUtf8 = 'data:application/json;charset=utf-8;base64,'

  let encoded: string

  if (dataUrl.startsWith(prefix)) {
    encoded = dataUrl.slice(prefix.length)
  } else if (dataUrl.startsWith(prefixUtf8)) {
    encoded = dataUrl.slice(prefixUtf8.length)
  } else {
    throw new Error('Unsupported inline source map format. Expected base64-encoded data URL.')
  }

  const json = atob(encoded)
  return JSON.parse(json) as SourceMapV3
}

/* ── parseSourceMap ────────────────────────────────────── */

export function parseSourceMap(input: string | object): SourceMapV3 {
  let raw: unknown

  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      return parseInlineSourceMap(input)
    }
    raw = JSON.parse(input)
  } else {
    raw = input
  }

  const validation = validateSourceMap(raw)
  if (!validation.valid) {
    throw new Error(`Invalid source map: ${validation.errors.join('; ')}`)
  }

  return raw as SourceMapV3
}

/* ── SourceMapConsumer ─────────────────────────────────── */

export class SourceMapConsumer {
  private readonly sourceMap: SourceMapV3
  private readonly mapUrl?: string
  private decodedMappings: DecodedMapping[] | null = null
  private sectionConsumers: Array<{
    offset: { line: number; column: number }
    consumer: SourceMapConsumer
  }> | null = null

  // Lookup caches
  private generatedIndex: Map<string, DecodedMapping[]> | null = null
  private originalIndex: Map<string, DecodedMapping[]> | null = null

  constructor(sourceMap: SourceMapV3 | string | object, mapUrl?: string) {
    this.sourceMap = parseSourceMap(sourceMap)
    this.mapUrl = mapUrl

    if (this.sourceMap.sections) {
      this.sectionConsumers = this.sourceMap.sections.map((section) => ({
        offset: section.offset,
        consumer: new SourceMapConsumer(section.map, mapUrl),
      }))
    }
  }

  /* ── Lazy decoding ─────────────────────────────────── */

  private getMappings(): DecodedMapping[] {
    if (!this.decodedMappings) {
      this.decodedMappings = decodeMappings(this.sourceMap.mappings ?? '')
    }
    return this.decodedMappings
  }

  private getGeneratedIndex(): Map<string, DecodedMapping[]> {
    if (!this.generatedIndex) {
      this.generatedIndex = new Map()
      for (const m of this.getMappings()) {
        const key = `${m.generatedLine}:${m.generatedColumn}`
        const arr = this.generatedIndex.get(key) ?? []
        arr.push(m)
        this.generatedIndex.set(key, arr)
      }
    }
    return this.generatedIndex
  }

  private getOriginalIndex(): Map<string, DecodedMapping[]> {
    if (!this.originalIndex) {
      this.originalIndex = new Map()
      for (const m of this.getMappings()) {
        if (m.sourceIndex < 0) continue
        const key = `${m.sourceIndex}:${m.originalLine}:${m.originalColumn}`
        const arr = this.originalIndex.get(key) ?? []
        arr.push(m)
        this.originalIndex.set(key, arr)
      }
    }
    return this.originalIndex
  }

  /* ── Public API ────────────────────────────────────── */

  /** Map a generated position back to the original source. */
  originalPositionFor(line: number, column: number): SourcePosition | null {
    // Handle index maps via sections
    if (this.sectionConsumers) {
      for (let i = this.sectionConsumers.length - 1; i >= 0; i--) {
        const { offset, consumer } = this.sectionConsumers[i]
        if (
          line > offset.line ||
          (line === offset.line && column >= offset.column)
        ) {
          const adjLine = line - offset.line
          const adjCol = line === offset.line ? column - offset.column : column
          return consumer.originalPositionFor(adjLine, adjCol)
        }
      }
      return null
    }

    // Binary search for the closest mapping on the requested generated line
    const mappings = this.getMappings()
    const match = this.findClosestGeneratedMapping(mappings, line, column)

    if (!match || match.sourceIndex < 0) return null

    const sourcePath = this.resolveSource(match.sourceIndex)

    return {
      source: sourcePath,
      line: match.originalLine,
      column: match.originalColumn,
      name: match.nameIndex >= 0 ? this.sourceMap.names[match.nameIndex] : undefined,
    }
  }

  /** Map an original position to the generated output. */
  generatedPositionFor(source: string, line: number, column: number): GeneratedPosition | null {
    if (this.sectionConsumers) {
      for (const { offset, consumer } of this.sectionConsumers) {
        const result = consumer.generatedPositionFor(source, line, column)
        if (result) {
          return {
            line: result.line + offset.line,
            column: result.line === 0 ? result.column + offset.column : result.column,
          }
        }
      }
      return null
    }

    const sourceIndex = this.findSourceIndex(source)
    if (sourceIndex < 0) return null

    const mappings = this.getMappings().filter(
      (m) => m.sourceIndex === sourceIndex
    )

    const match = this.findClosestOriginalMapping(mappings, line, column)
    if (!match) return null

    return { line: match.generatedLine, column: match.generatedColumn }
  }

  /** Get all resolved source file paths. */
  get sources(): string[] {
    if (this.sectionConsumers) {
      const all = new Set<string>()
      for (const { consumer } of this.sectionConsumers) {
        for (const s of consumer.sources) {
          all.add(s)
        }
      }
      return [...all]
    }
    return this.sourceMap.sources.map((_, i) => this.resolveSource(i))
  }

  /** Get source content for a given source path. */
  sourceContentFor(source: string): string | null {
    if (this.sectionConsumers) {
      for (const { consumer } of this.sectionConsumers) {
        const content = consumer.sourceContentFor(source)
        if (content !== null) return content
      }
      return null
    }

    const idx = this.findSourceIndex(source)
    if (idx < 0) return null

    return this.sourceMap.sourcesContent?.[idx] ?? null
  }

  /** Iterate over every decoded mapping. */
  eachMapping(callback: (mapping: {
    generatedLine: number
    generatedColumn: number
    source: string | null
    originalLine: number | null
    originalColumn: number | null
    name: string | null
  }) => void): void {
    if (this.sectionConsumers) {
      for (const { offset, consumer } of this.sectionConsumers) {
        consumer.eachMapping((m) => {
          callback({
            ...m,
            generatedLine: m.generatedLine + offset.line,
            generatedColumn:
              m.generatedLine === 0
                ? m.generatedColumn + offset.column
                : m.generatedColumn,
          })
        })
      }
      return
    }

    for (const m of this.getMappings()) {
      callback({
        generatedLine: m.generatedLine,
        generatedColumn: m.generatedColumn,
        source: m.sourceIndex >= 0 ? this.resolveSource(m.sourceIndex) : null,
        originalLine: m.originalLine >= 0 ? m.originalLine : null,
        originalColumn: m.originalColumn >= 0 ? m.originalColumn : null,
        name: m.nameIndex >= 0 ? this.sourceMap.names[m.nameIndex] : null,
      })
    }
  }

  /** Destroy caches. */
  destroy(): void {
    this.decodedMappings = null
    this.generatedIndex = null
    this.originalIndex = null
    if (this.sectionConsumers) {
      for (const { consumer } of this.sectionConsumers) {
        consumer.destroy()
      }
    }
  }

  /* ── Internals ─────────────────────────────────────── */

  private resolveSource(index: number): string {
    const raw = this.sourceMap.sources[index]
    if (!raw) return `<unknown source ${index}>`
    return resolveSourcePath(raw, this.sourceMap.sourceRoot, this.mapUrl)
  }

  private findSourceIndex(source: string): number {
    // Try exact match first
    const idx = this.sourceMap.sources.indexOf(source)
    if (idx >= 0) return idx

    // Try resolved path match
    for (let i = 0; i < this.sourceMap.sources.length; i++) {
      if (this.resolveSource(i) === source) return i
    }

    // Try suffix match (for paths resolved differently)
    const normalized = normalizePath(source)
    for (let i = 0; i < this.sourceMap.sources.length; i++) {
      const resolved = normalizePath(this.resolveSource(i))
      if (resolved === normalized || resolved.endsWith('/' + normalized) || normalized.endsWith('/' + resolved)) {
        return i
      }
    }

    return -1
  }

  private findClosestGeneratedMapping(
    mappings: DecodedMapping[],
    line: number,
    column: number
  ): DecodedMapping | null {
    // Filter mappings on the target generated line
    let best: DecodedMapping | null = null

    for (const m of mappings) {
      if (m.generatedLine !== line) {
        if (m.generatedLine > line) break
        continue
      }

      if (m.generatedColumn <= column) {
        if (!best || m.generatedColumn > best.generatedColumn) {
          best = m
        }
      }
    }

    return best
  }

  private findClosestOriginalMapping(
    mappings: DecodedMapping[],
    line: number,
    column: number
  ): DecodedMapping | null {
    let best: DecodedMapping | null = null
    let bestDistance = Infinity

    for (const m of mappings) {
      if (m.originalLine < 0) continue

      const lineDist = Math.abs(m.originalLine - line)
      const colDist = m.originalLine === line ? Math.abs(m.originalColumn - column) : 0
      const distance = lineDist * 10000 + colDist

      if (distance < bestDistance) {
        bestDistance = distance
        best = m
      }
    }

    return best
  }
}

/* ── resolvePosition ───────────────────────────────────── */

export function resolvePosition(
  consumer: SourceMapConsumer,
  generatedLine: number,
  generatedColumn: number
): SourcePosition | null {
  return consumer.originalPositionFor(generatedLine, generatedColumn)
}

/* ── Stack Trace Mapping ───────────────────────────────── */

const STACK_FRAME_RE =
  /at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+)|(.+?):(\d+))\)?/

function parseStackFrame(frameLine: string): StackFrame | null {
  const match = frameLine.match(STACK_FRAME_RE)
  if (!match) return null

  const functionName = match[1] || undefined
  const file = match[2] || match[5] || ''
  const line = parseInt(match[3] || match[6] || '0', 10)
  const column = parseInt(match[4] || '0', 10)

  return { functionName, file, line, column }
}

export function mapStackTrace(
  stack: string,
  registry: SourceMapRegistry
): MappedStackFrame[] {
  const lines = stack.split('\n')
  const frames: MappedStackFrame[] = []

  for (const line of lines) {
    const frame = parseStackFrame(line.trim())
    if (!frame) continue

    const consumer = registry.getConsumerForFile(frame.file)
    if (!consumer) {
      frames.push(frame)
      continue
    }

    const original = consumer.originalPositionFor(frame.line, frame.column)
    if (original) {
      frames.push({
        ...frame,
        originalFile: original.source,
        originalLine: original.line,
        originalColumn: original.column,
        originalName: original.name,
      })
    } else {
      frames.push(frame)
    }
  }

  return frames
}

/* ── SourceMapRegistry ─────────────────────────────────── */

export class SourceMapRegistry {
  private consumers = new Map<string, SourceMapConsumer>()
  private pendingLoads = new Map<string, Promise<SourceMapConsumer | null>>()

  /** Register a source map for a given generated file path. */
  register(generatedFile: string, sourceMap: SourceMapV3 | string | object, mapUrl?: string): SourceMapConsumer {
    const consumer = new SourceMapConsumer(sourceMap, mapUrl)
    this.consumers.set(normalizePath(generatedFile), consumer)
    return consumer
  }

  /** Register from an inline source map comment found in a generated file. */
  registerInline(generatedFile: string, sourceContent: string): SourceMapConsumer | null {
    const url = extractSourceMappingURL(sourceContent)
    if (!url) return null

    if (url.startsWith('data:')) {
      const map = parseInlineSourceMap(url)
      return this.register(generatedFile, map, generatedFile)
    }

    // External URL – resolve relative to generated file
    const mapUrl = resolveSourcePath(url, undefined, generatedFile)
    // Caller is responsible for fetching external maps; store a placeholder
    return null
  }

  /** Remove a source map and free its resources. */
  unregister(generatedFile: string): void {
    const key = normalizePath(generatedFile)
    const consumer = this.consumers.get(key)
    if (consumer) {
      consumer.destroy()
      this.consumers.delete(key)
    }
  }

  /** Get the consumer for a generated file. */
  getConsumerForFile(generatedFile: string): SourceMapConsumer | null {
    return this.consumers.get(normalizePath(generatedFile)) ?? null
  }

  /** Map a breakpoint from original source to generated position. */
  mapBreakpoint(
    originalFile: string,
    originalLine: number,
    originalColumn: number = 0
  ): BreakpointMapping | null {
    for (const [genFile, consumer] of this.consumers) {
      const generated = consumer.generatedPositionFor(originalFile, originalLine, originalColumn)
      if (generated) {
        return {
          originalFile,
          originalLine,
          originalColumn,
          generatedFile: genFile,
          generatedLine: generated.line,
          generatedColumn: generated.column,
        }
      }
    }
    return null
  }

  /** Reverse-map a breakpoint from generated back to original. */
  reverseMapBreakpoint(
    generatedFile: string,
    generatedLine: number,
    generatedColumn: number = 0
  ): BreakpointMapping | null {
    const consumer = this.getConsumerForFile(generatedFile)
    if (!consumer) return null

    const original = consumer.originalPositionFor(generatedLine, generatedColumn)
    if (!original) return null

    return {
      originalFile: original.source,
      originalLine: original.line,
      originalColumn: original.column,
      generatedFile,
      generatedLine,
      generatedColumn,
    }
  }

  /** Get all breakpoint candidates on a given original line. */
  breakpointLocationsForLine(
    originalFile: string,
    originalLine: number
  ): BreakpointMapping[] {
    const results: BreakpointMapping[] = []

    for (const [genFile, consumer] of this.consumers) {
      consumer.eachMapping((m) => {
        if (
          m.source === originalFile &&
          m.originalLine === originalLine &&
          m.generatedLine !== null &&
          m.generatedColumn !== null
        ) {
          results.push({
            originalFile,
            originalLine,
            originalColumn: m.originalColumn ?? 0,
            generatedFile: genFile,
            generatedLine: m.generatedLine,
            generatedColumn: m.generatedColumn,
          })
        }
      })
    }

    return results
  }

  /** Get resolved source content for a file, searching all registered maps. */
  getSourceContent(sourcePath: string): string | null {
    for (const consumer of this.consumers.values()) {
      const content = consumer.sourceContentFor(sourcePath)
      if (content !== null) return content
    }
    return null
  }

  /** List all original source paths across all registered maps. */
  allOriginalSources(): string[] {
    const all = new Set<string>()
    for (const consumer of this.consumers.values()) {
      for (const s of consumer.sources) {
        all.add(s)
      }
    }
    return [...all]
  }

  /** Free all consumers and clear state. */
  dispose(): void {
    for (const consumer of this.consumers.values()) {
      consumer.destroy()
    }
    this.consumers.clear()
    this.pendingLoads.clear()
  }
}

/* ── Helpers ───────────────────────────────────────────── */

const SOURCE_MAPPING_URL_RE =
  /\/\/[#@]\s*sourceMappingURL=(.+?)(?:\s|$)/
const SOURCE_MAPPING_URL_MULTILINE_RE =
  /\/\*[#@]\s*sourceMappingURL=(.+?)\s*\*\//

function extractSourceMappingURL(content: string): string | null {
  // Search from the end (source mapping comments are typically at the bottom)
  const lines = content.split('\n')
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
    const line = lines[i]
    const match = line.match(SOURCE_MAPPING_URL_RE) ?? line.match(SOURCE_MAPPING_URL_MULTILINE_RE)
    if (match) return match[1]
  }
  return null
}
