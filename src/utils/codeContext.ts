import { useEditorStore } from '@/store/editor'
import type { OpenFile } from '@shared/types'

/* ── Types ────────────────────────────────────────────── */

export interface CodeContext {
  activeFilePath: string | null
  activeFileContent: string | null
  activeFileLanguage: string | null
  selectionText: string | null
  cursorLine: number | null
  surroundingLines: string | null
  openFilePaths: string[]
  importStatements: string | null
  relatedFiles: RelatedFile[]
}

export interface RelatedFile {
  path: string
  name: string
  language: string
  content: string // first 100 lines
}

/* ── Language detection helper ────────────────────────── */

function extToLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
    py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
    cs: 'csharp', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
    html: 'html', css: 'css', scss: 'scss', json: 'json', md: 'markdown',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', sql: 'sql', sh: 'bash',
    vue: 'vue', svelte: 'svelte',
  }
  return map[ext] || ext
}

/* ── Import parsing ───────────────────────────────────── */

interface ParsedImport {
  raw: string
  specifier: string // the from '...' path
  isRelative: boolean
}

function parseImports(content: string): ParsedImport[] {
  const lines = content.split('\n').slice(0, 30)
  const imports: ParsedImport[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // ES import: import ... from '...'
    const esMatch = trimmed.match(/^import\s+.*?\s+from\s+['"](.+?)['"]/)
    if (esMatch) {
      const specifier = esMatch[1]
      imports.push({
        raw: trimmed,
        specifier,
        isRelative: specifier.startsWith('.') || specifier.startsWith('@/'),
      })
      continue
    }

    // Side-effect import: import '...'
    const sideEffectMatch = trimmed.match(/^import\s+['"](.+?)['"]/)
    if (sideEffectMatch) {
      const specifier = sideEffectMatch[1]
      imports.push({
        raw: trimmed,
        specifier,
        isRelative: specifier.startsWith('.') || specifier.startsWith('@/'),
      })
      continue
    }

    // CommonJS require: const x = require('...')
    const requireMatch = trimmed.match(/require\s*\(\s*['"](.+?)['"]\s*\)/)
    if (requireMatch) {
      const specifier = requireMatch[1]
      imports.push({
        raw: trimmed,
        specifier,
        isRelative: specifier.startsWith('.') || specifier.startsWith('@/'),
      })
    }
  }

  return imports
}

/* ── Resolve import paths ─────────────────────────────── */

const defaultExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json']

function resolveImportPath(specifier: string, currentFilePath: string, allFilePaths: string[]): string | null {
  let resolved: string

  if (specifier.startsWith('@/')) {
    // Alias: @/ -> src/
    resolved = specifier.replace('@/', 'src/')
  } else if (specifier.startsWith('.')) {
    // Relative import: resolve against current file's directory
    const currentDir = currentFilePath.split('/').slice(0, -1).join('/')
    const parts = specifier.split('/')
    const dirParts = currentDir.split('/')

    for (const part of parts) {
      if (part === '..') {
        dirParts.pop()
      } else if (part !== '.') {
        dirParts.push(part)
      }
    }
    resolved = dirParts.join('/')
  } else {
    // Node module - skip
    return null
  }

  // Normalize path separators
  resolved = resolved.replace(/\\/g, '/')

  // Try exact match first
  const exactMatch = allFilePaths.find((p) => p.replace(/\\/g, '/') === resolved)
  if (exactMatch) return exactMatch

  // Try with extensions
  for (const ext of defaultExtensions) {
    const withExt = resolved + ext
    const match = allFilePaths.find((p) => p.replace(/\\/g, '/') === withExt)
    if (match) return match
  }

  // Try as directory with index file
  for (const ext of defaultExtensions) {
    const indexPath = resolved + '/index' + ext
    const match = allFilePaths.find((p) => p.replace(/\\/g, '/') === indexPath)
    if (match) return match
  }

  // Fuzzy match: find any file whose normalized path ends with the resolved path
  const normalizedResolved = resolved.replace(/^(src\/|\.?\/)/, '')
  for (const ext of ['', ...defaultExtensions]) {
    const target = normalizedResolved + ext
    const match = allFilePaths.find((p) => {
      const normalized = p.replace(/\\/g, '/').replace(/^(src\/|\.?\/)/, '')
      return normalized === target || normalized.endsWith('/' + target)
    })
    if (match) return match
  }

  return null
}

/* ── Public API ───────────────────────────────────────── */

/**
 * Gather the current editor context: active file, selection, cursor surroundings, open files, imports.
 */
export function getCurrentContext(options?: {
  selectionText?: string | null
  cursorLine?: number | null
}): CodeContext {
  const state = useEditorStore.getState()
  const { openFiles, activeFilePath } = state
  const activeFile = openFiles.find((f) => f.path === activeFilePath) || null

  const content = activeFile?.content || null
  const language = activeFile?.language || (activeFilePath ? extToLanguage(activeFilePath) : null)
  const selectionText = options?.selectionText || null
  const cursorLine = options?.cursorLine || null

  // Extract surrounding lines around cursor
  let surroundingLines: string | null = null
  if (content && cursorLine !== null && cursorLine >= 0) {
    const lines = content.split('\n')
    const start = Math.max(0, cursorLine - 10)
    const end = Math.min(lines.length, cursorLine + 11)
    surroundingLines = lines
      .slice(start, end)
      .map((line, i) => {
        const lineNum = start + i + 1
        const marker = lineNum === cursorLine + 1 ? ' >>>' : '    '
        return `${marker} ${lineNum}: ${line}`
      })
      .join('\n')
  }

  // Extract import statements (first 30 lines)
  let importStatements: string | null = null
  if (content) {
    const parsed = parseImports(content)
    if (parsed.length > 0) {
      importStatements = parsed.map((i) => i.raw).join('\n')
    }
  }

  // Get related files
  const allFilePaths = openFiles.map((f) => f.path)
  const relatedFiles = activeFile && activeFilePath
    ? getRelatedFiles(activeFilePath, content || '', openFiles, allFilePaths)
    : []

  return {
    activeFilePath,
    activeFileContent: content,
    activeFileLanguage: language,
    selectionText,
    cursorLine,
    surroundingLines,
    openFilePaths: openFiles.map((f) => f.path),
    importStatements,
    relatedFiles,
  }
}

/**
 * Find and return content of files imported by the current file.
 * Returns up to 5 related files, first 100 lines each.
 */
export function getRelatedFiles(
  currentFilePath: string,
  currentContent: string,
  openFiles: OpenFile[],
  allFilePaths: string[],
): RelatedFile[] {
  const parsed = parseImports(currentContent)
  const relativeImports = parsed.filter((i) => i.isRelative)

  const related: RelatedFile[] = []

  for (const imp of relativeImports) {
    if (related.length >= 5) break

    const resolvedPath = resolveImportPath(imp.specifier, currentFilePath, allFilePaths)
    if (!resolvedPath) continue

    // Check if the file is open (so we have its content)
    const openFile = openFiles.find((f) => f.path === resolvedPath)
    if (!openFile) continue

    const lines = openFile.content.split('\n')
    const truncatedContent = lines.slice(0, 100).join('\n')
    const name = resolvedPath.split(/[\\/]/).pop() || resolvedPath

    related.push({
      path: resolvedPath,
      name,
      language: openFile.language || extToLanguage(resolvedPath),
      content: truncatedContent + (lines.length > 100 ? '\n// ... (truncated)' : ''),
    })
  }

  return related
}

/**
 * Build a system prompt that provides the AI with full editor context.
 */
export function buildSystemPrompt(context: CodeContext): string {
  const parts: string[] = []

  parts.push(
    'You are Orion AI, an expert coding assistant integrated in the Orion IDE.',
    'You have deep knowledge of software engineering, debugging, architecture, and best practices.',
    'Be concise, accurate, and provide code examples when helpful.',
    '',
  )

  if (context.activeFilePath && context.activeFileLanguage) {
    parts.push(`Current file: ${context.activeFilePath} (${context.activeFileLanguage})`)
  }

  if (context.selectionText) {
    parts.push(`\nCurrent selection:\n\`\`\`${context.activeFileLanguage || ''}\n${context.selectionText}\n\`\`\``)
  } else {
    parts.push('Current selection: none')
  }

  if (context.activeFileContent) {
    // For very large files, include a reasonable portion
    const maxChars = 8000
    let content = context.activeFileContent
    if (content.length > maxChars) {
      // If we have cursor context, prioritize that area
      if (context.surroundingLines) {
        const importSection = context.importStatements || ''
        content = importSection
          + (importSection ? '\n\n// ...\n\n' : '')
          + context.surroundingLines
          + '\n\n// ... (file truncated, showing cursor area)'
      } else {
        content = content.substring(0, maxChars) + '\n// ... (truncated)'
      }
    }
    parts.push(`\nFile content:\n\`\`\`${context.activeFileLanguage || ''}\n${content}\n\`\`\``)
  }

  if (context.relatedFiles.length > 0) {
    parts.push('\nRelated files:')
    for (const rf of context.relatedFiles) {
      parts.push(`\n[${rf.path}]\n\`\`\`${rf.language}\n${rf.content}\n\`\`\``)
    }
  }

  if (context.openFilePaths.length > 0) {
    parts.push(`\nOpen files in editor:\n${context.openFilePaths.map((p) => `- ${p}`).join('\n')}`)
  }

  return parts.join('\n')
}

/**
 * Quick summary of context for display in the UI.
 * Returns something like "editor.ts + 3 related files"
 */
export function getContextSummary(context: CodeContext): string | null {
  if (!context.activeFilePath) return null

  const fileName = context.activeFilePath.split(/[\\/]/).pop() || context.activeFilePath
  const relatedCount = context.relatedFiles.length

  if (relatedCount > 0) {
    return `${fileName} + ${relatedCount} related file${relatedCount > 1 ? 's' : ''}`
  }
  return fileName
}
