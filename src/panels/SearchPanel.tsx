import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Search, ChevronRight, ChevronDown, FileText, Loader2, Replace, X, ChevronsUpDown, ChevronsDownUp, ListFilter, AlignJustify, FileOutput, History, Copy, FolderOpen, Undo2, Eye, ArrowDown, ArrowUp } from 'lucide-react'
import { useEditorStore } from '@/store/editor'
import { useFileStore } from '@/store/files'
import { useToastStore } from '@/store/toast'

interface SearchMatch {
  file: string
  line: number
  content: string
}

interface MatchEntry {
  line: number
  text: string
  dismissed?: boolean
}

interface GroupedResult {
  filePath: string
  fileName: string
  matches: MatchEntry[]
  dismissed?: boolean
}

interface UndoEntry {
  filePath: string
  originalContent: string
  timestamp: number
}

const SEARCH_HISTORY_KEY = 'orion-search-history'
const MAX_HISTORY = 10

const FILE_TYPE_CHIPS = [
  { label: '*.ts', ext: '.ts' },
  { label: '*.tsx', ext: '.tsx' },
  { label: '*.js', ext: '.js' },
  { label: '*.jsx', ext: '.jsx' },
  { label: '*.css', ext: '.css' },
  { label: '*.scss', ext: '.scss' },
  { label: '*.json', ext: '.json' },
  { label: '*.html', ext: '.html' },
  { label: '*.md', ext: '.md' },
  { label: '*.py', ext: '.py' },
]

function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.slice(0, MAX_HISTORY)
    }
  } catch {}
  return []
}

function saveSearchHistory(history: string[]) {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
  } catch {}
}

function addToHistory(history: string[], query: string): string[] {
  const trimmed = query.trim()
  if (!trimmed) return history
  const filtered = history.filter(h => h !== trimmed)
  return [trimmed, ...filtered].slice(0, MAX_HISTORY)
}

// Styles as constants to reduce inline noise
const inputStyle: React.CSSProperties = {
  flex: 1, padding: '6px 10px', background: 'transparent',
  border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-primary)',
}

const filterInputStyle: React.CSSProperties = {
  flex: 1, padding: '4px 10px', background: 'transparent',
  border: 'none', outline: 'none', fontSize: 11, color: 'var(--text-primary)',
}

const inputWrapStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  background: 'var(--bg-primary)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', overflow: 'hidden',
}

const toggleBtnBase: React.CSSProperties = {
  padding: '2px 4px', borderRadius: 3, fontSize: 11, fontWeight: 700,
  fontFamily: 'var(--font-mono)', border: 'none', cursor: 'pointer',
}

const iconBtnStyle: React.CSSProperties = {
  padding: 2, borderRadius: 3, color: 'var(--text-muted)',
  background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex',
}

const chipBtnBase: React.CSSProperties = {
  padding: '1px 6px', borderRadius: 10, fontSize: 10, fontFamily: 'var(--font-mono)',
  border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.1s',
  whiteSpace: 'nowrap',
}

export default function SearchPanel() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GroupedResult[]>([])
  const [searching, setSearching] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [replaceQuery, setReplaceQuery] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [includePattern, setIncludePattern] = useState('')
  const [excludePattern, setExcludePattern] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const [searchHistory, setSearchHistory] = useState<string[]>(loadSearchHistory)
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [previewReplace, setPreviewReplace] = useState(false)
  const [searchOpenOnly, setSearchOpenOnly] = useState(false)
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set())
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchRef = useRef<() => void>(() => {})
  const historyDropdownRef = useRef<HTMLDivElement>(null)
  const resultsContainerRef = useRef<HTMLDivElement>(null)
  const { openFile } = useEditorStore()
  const rootPath = useFileStore((s) => s.rootPath)
  const addToast = useToastStore((s) => s.addToast)

  // Build a flat list of all match refs for keyboard navigation
  const flatMatches = useMemo(() => {
    const flat: { filePath: string; fileName: string; line: number; text: string; resultIdx: number; matchIdx: number }[] = []
    results.forEach((r, ri) => {
      if (r.dismissed) return
      r.matches.forEach((m, mi) => {
        if (!m.dismissed) {
          flat.push({ filePath: r.filePath, fileName: r.fileName, line: m.line, text: m.text, resultIdx: ri, matchIdx: mi })
        }
      })
    })
    return flat
  }, [results])

  // Focus input on Ctrl+Shift+F
  useEffect(() => {
    const handler = () => inputRef.current?.focus()
    window.addEventListener('orion:show-search', handler)
    return () => window.removeEventListener('orion:show-search', handler)
  }, [])

  // Close history dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(e.target as Node)) {
        setShowHistoryDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Global keyboard shortcuts for F4 / Shift+F4 navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F4' && flatMatches.length > 0) {
        e.preventDefault()
        if (e.shiftKey) {
          // Previous match
          setActiveMatchIndex(prev => {
            const next = prev <= 0 ? flatMatches.length - 1 : prev - 1
            const m = flatMatches[next]
            if (m) openResult(m.filePath, m.fileName, m.line)
            return next
          })
        } else {
          // Next match
          setActiveMatchIndex(prev => {
            const next = prev >= flatMatches.length - 1 ? 0 : prev + 1
            const m = flatMatches[next]
            if (m) openResult(m.filePath, m.fileName, m.line)
            return next
          })
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [flatMatches])

  const buildRegex = useCallback((flags?: string) => {
    let pattern: string
    if (useRegex) {
      pattern = query
    } else {
      pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
    if (wholeWord) pattern = `\\b${pattern}\\b`
    return new RegExp(pattern, flags ?? (caseSensitive ? 'g' : 'gi'))
  }, [query, useRegex, wholeWord, caseSensitive])

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !rootPath) return
    setSearching(true)
    setActiveMatchIndex(-1)

    // Save to search history
    setSearchHistory(prev => {
      const updated = addToHistory(prev, query)
      saveSearchHistory(updated)
      return updated
    })

    try {
      let raw: SearchMatch[]

      if (searchOpenOnly) {
        // Search only in currently open editor files
        const { openFiles } = useEditorStore.getState()
        raw = []
        const searchRegex = buildRegex()
        for (const file of openFiles) {
          if (!file.content) continue
          const lines = file.content.split('\n')
          for (let i = 0; i < lines.length; i++) {
            searchRegex.lastIndex = 0
            if (searchRegex.test(lines[i])) {
              raw.push({ file: file.path, line: i + 1, content: lines[i] })
            }
          }
        }
      } else {
        raw = await window.api.searchFiles(rootPath, query, { caseSensitive, regex: useRegex })
      }

      // Group by file
      const grouped = new Map<string, GroupedResult>()
      for (const match of raw) {
        const fileName = match.file.replace(/\\/g, '/').split('/').pop() || match.file
        if (!grouped.has(match.file)) {
          grouped.set(match.file, { filePath: match.file, fileName, matches: [] })
        }
        grouped.get(match.file)!.matches.push({ line: match.line, text: match.content })
      }
      let filteredResults = Array.from(grouped.values())

      // Apply file type chip filters
      if (selectedChips.size > 0) {
        filteredResults = filteredResults.filter(r => {
          return Array.from(selectedChips).some(ext => r.filePath.endsWith(ext))
        })
      }

      // Apply include/exclude filters
      if (includePattern.trim()) {
        const patterns = includePattern.split(',').map(p => p.trim()).filter(Boolean)
        filteredResults = filteredResults.filter(r => {
          return patterns.some(p => {
            if (p.startsWith('*.')) {
              return r.filePath.endsWith(p.substring(1))
            }
            return r.filePath.includes(p)
          })
        })
      }
      if (excludePattern.trim()) {
        const patterns = excludePattern.split(',').map(p => p.trim()).filter(Boolean)
        filteredResults = filteredResults.filter(r => {
          return !patterns.some(p => {
            if (p.startsWith('*.')) {
              return r.filePath.endsWith(p.substring(1))
            }
            return r.filePath.includes(p)
          })
        })
      }
      setResults(filteredResults)
      setExpanded(new Set(filteredResults.map((r) => r.filePath)))
    } catch {
      setResults([])
    }
    setSearching(false)
  }, [query, caseSensitive, useRegex, rootPath, includePattern, excludePattern, searchOpenOnly, selectedChips, buildRegex])

  handleSearchRef.current = handleSearch

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setShowHistoryDropdown(false)
      handleSearch()
    }
    if (e.key === 'Escape') {
      setShowHistoryDropdown(false)
    }
  }

  const openResult = async (filePath: string, fileName: string, _line?: number) => {
    try {
      const result = await window.api?.readFile(filePath)
      if (result) {
        openFile({
          path: filePath,
          name: fileName,
          content: result.content,
          language: result.language || 'plaintext',
          isModified: false,
          aiModified: false,
        })
      }
    } catch {}
  }

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  // Push to undo stack before writing
  const pushUndo = async (filePath: string) => {
    try {
      const fileData = await window.api.readFile(filePath)
      if (fileData?.content) {
        setUndoStack(prev => [...prev, { filePath, originalContent: fileData.content, timestamp: Date.now() }])
      }
    } catch {}
  }

  const handleUndoLast = async () => {
    if (undoStack.length === 0) return
    const last = undoStack[undoStack.length - 1]
    try {
      await window.api.writeFile(last.filePath, last.originalContent)
      const { openFiles, updateFileContent } = useEditorStore.getState()
      const openF = openFiles.find(f => f.path === last.filePath)
      if (openF) {
        updateFileContent(last.filePath, last.originalContent)
      }
      setUndoStack(prev => prev.slice(0, -1))
      const fileName = last.filePath.replace(/\\/g, '/').split('/').pop() || last.filePath
      addToast({ type: 'success', message: `Reverted replacement in ${fileName}` })
      handleSearch()
    } catch (err: any) {
      addToast({ type: 'error', message: `Failed to undo: ${err?.message}` })
    }
  }

  const handleReplaceAll = async () => {
    if (!replaceQuery && replaceQuery !== '') return
    if (!query.trim()) return

    let totalReplacements = 0
    const { openFiles, updateFileContent } = useEditorStore.getState()

    for (const result of results) {
      if (result.dismissed) continue
      try {
        await pushUndo(result.filePath)
        const fileData = await window.api.readFile(result.filePath)
        if (!fileData?.content) continue

        const regex = buildRegex()
        const matches = fileData.content.match(regex)
        if (!matches) continue

        const newContent = fileData.content.replace(regex, replaceQuery)
        totalReplacements += matches.length

        await window.api.writeFile(result.filePath, newContent)

        const openF = openFiles.find(f => f.path === result.filePath)
        if (openF) {
          updateFileContent(result.filePath, newContent)
        }
      } catch (err: any) {
        addToast({ type: 'error', message: `Failed to replace in ${result.fileName}: ${err?.message}` })
      }
    }

    addToast({
      type: 'success',
      message: `Replaced ${totalReplacements} occurrence${totalReplacements !== 1 ? 's' : ''} across ${results.length} file${results.length !== 1 ? 's' : ''}`
    })

    handleSearch()
  }

  const handleReplaceInFile = async (filePath: string, fileName: string) => {
    if (!replaceQuery && replaceQuery !== '') return
    if (!query.trim()) return

    const { openFiles, updateFileContent } = useEditorStore.getState()

    try {
      await pushUndo(filePath)
      const fileData = await window.api.readFile(filePath)
      if (!fileData?.content) return

      const regex = buildRegex()
      const matches = fileData.content.match(regex)
      if (!matches) return

      const newContent = fileData.content.replace(regex, replaceQuery)
      await window.api.writeFile(filePath, newContent)

      const openF = openFiles.find(f => f.path === filePath)
      if (openF) {
        updateFileContent(filePath, newContent)
      }

      addToast({ type: 'success', message: `Replaced ${matches.length} occurrence${matches.length !== 1 ? 's' : ''} in ${fileName}` })
      handleSearch()
    } catch (err: any) {
      addToast({ type: 'error', message: `Failed to replace: ${err?.message}` })
    }
  }

  const handleReplaceSingle = async (filePath: string, fileName: string, line: number, _matchText: string) => {
    if (!replaceQuery && replaceQuery !== '') return
    if (!query.trim()) return

    const { openFiles, updateFileContent } = useEditorStore.getState()

    try {
      await pushUndo(filePath)
      const fileData = await window.api.readFile(filePath)
      if (!fileData?.content) return

      const lines = fileData.content.split('\n')
      const lineIndex = line - 1
      if (lineIndex < 0 || lineIndex >= lines.length) return

      let pattern: string
      if (useRegex) {
        pattern = query
      } else {
        pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }
      if (wholeWord) pattern = `\\b${pattern}\\b`
      const regex = new RegExp(pattern, caseSensitive ? '' : 'i')

      lines[lineIndex] = lines[lineIndex].replace(regex, replaceQuery)
      const newContent = lines.join('\n')
      await window.api.writeFile(filePath, newContent)

      const openF = openFiles.find(f => f.path === filePath)
      if (openF) {
        updateFileContent(filePath, newContent)
      }

      addToast({ type: 'success', message: `Replaced 1 occurrence in ${fileName}` })
      handleSearch()
    } catch (err: any) {
      addToast({ type: 'error', message: `Failed to replace: ${err?.message}` })
    }
  }

  const activeResults = useMemo(() => results.filter(r => !r.dismissed), [results])
  const totalMatches = useMemo(() => activeResults.reduce((sum, r) => sum + r.matches.filter(m => !m.dismissed).length, 0), [activeResults])

  const collapseAll = () => setExpanded(new Set())
  const expandAll = () => setExpanded(new Set(results.map(r => r.filePath)))
  const clearResults = () => { setResults([]); setQuery(''); setUndoStack([]) }

  // Dismiss a single match
  const dismissMatch = (resultIdx: number, matchIdx: number) => {
    setResults(prev => prev.map((r, ri) => {
      if (ri !== resultIdx) return r
      const newMatches = r.matches.map((m, mi) => mi === matchIdx ? { ...m, dismissed: true } : m)
      const allDismissed = newMatches.every(m => m.dismissed)
      return { ...r, matches: newMatches, dismissed: allDismissed }
    }))
  }

  // Dismiss an entire file result
  const dismissFileResult = (resultIdx: number) => {
    setResults(prev => prev.map((r, ri) =>
      ri === resultIdx ? { ...r, dismissed: true } : r
    ))
  }

  // Highlight matching text in search results
  const highlightMatch = (text: string) => {
    if (!query.trim()) return text
    try {
      const regex = buildRegex()
      regex.lastIndex = 0
      const captureRegex = new RegExp(`(${regex.source})`, regex.flags)
      const parts = text.split(captureRegex)
      return parts.map((part, i) => {
        captureRegex.lastIndex = 0
        return captureRegex.test(part) ? (
          <span key={i} style={{
            background: 'rgba(234,179,8,0.35)', color: 'var(--text-primary)',
            borderRadius: 2, padding: '0 2px',
            outline: '1px solid rgba(234,179,8,0.5)',
            fontWeight: 600,
          }}>{part}</span>
        ) : part
      })
    } catch {
      return text
    }
  }

  // Preview replacement inline
  const highlightReplace = (text: string) => {
    if (!query.trim() || !previewReplace || !showReplace) return highlightMatch(text)
    try {
      const regex = buildRegex()
      regex.lastIndex = 0
      const captureRegex = new RegExp(`(${regex.source})`, regex.flags)
      const parts = text.split(captureRegex)
      return parts.map((part, i) => {
        captureRegex.lastIndex = 0
        if (captureRegex.test(part)) {
          const replaced = part.replace(new RegExp(regex.source, regex.flags), replaceQuery)
          return (
            <span key={i}>
              <span style={{
                background: 'rgba(239,68,68,0.25)', color: 'var(--text-primary)',
                textDecoration: 'line-through', opacity: 0.7, borderRadius: 2,
                padding: '0 1px',
              }}>{part}</span>
              <span style={{
                background: 'rgba(34,197,94,0.3)', color: 'var(--text-primary)',
                borderRadius: 2, padding: '0 2px', fontWeight: 600,
              }}>{replaced}</span>
            </span>
          )
        }
        return part
      })
    } catch {
      return highlightMatch(text)
    }
  }

  // Build context lines for a match
  const getContextLines = useCallback((result: GroupedResult, matchIndex: number): { before: MatchEntry[]; after: MatchEntry[] } => {
    if (!showContext) return { before: [], after: [] }
    const match = result.matches[matchIndex]
    const prevMatch = matchIndex > 0 ? result.matches[matchIndex - 1] : null
    const nextMatch = matchIndex < result.matches.length - 1 ? result.matches[matchIndex + 1] : null

    const before: MatchEntry[] = []
    const after: MatchEntry[] = []

    const beforeLine = match.line - 1
    if (beforeLine > 0) {
      const isPrevMatch = prevMatch && prevMatch.line === beforeLine
      const isPrevAfterContext = prevMatch && prevMatch.line >= beforeLine - 1
      if (!isPrevMatch && !isPrevAfterContext) {
        before.push({ line: beforeLine, text: `  ...` })
      }
    }

    const afterLine = match.line + 1
    if (afterLine > 0) {
      const isNextMatch = nextMatch && nextMatch.line === afterLine
      if (!isNextMatch) {
        after.push({ line: afterLine, text: `  ...` })
      }
    }

    return { before, after }
  }, [showContext])

  // Copy all results to clipboard
  const copyResultsToClipboard = useCallback(() => {
    if (activeResults.length === 0) return
    const lines: string[] = []
    for (const result of activeResults) {
      lines.push(`${result.filePath}`)
      for (const match of result.matches) {
        if (!match.dismissed) {
          lines.push(`  ${match.line}: ${match.text}`)
        }
      }
      lines.push('')
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      addToast({ type: 'success', message: `Copied ${totalMatches} result${totalMatches !== 1 ? 's' : ''} to clipboard` })
    }).catch(() => {
      addToast({ type: 'error', message: 'Failed to copy to clipboard' })
    })
  }, [activeResults, totalMatches, addToast])

  // Open all matching files
  const openAllMatchingFiles = useCallback(async () => {
    for (const result of activeResults) {
      await openResult(result.filePath, result.fileName)
    }
    addToast({ type: 'success', message: `Opened ${activeResults.length} file${activeResults.length !== 1 ? 's' : ''}` })
  }, [activeResults, addToast])

  // Open results in editor as text document
  const openResultsInEditor = useCallback(() => {
    if (activeResults.length === 0) return

    const lines: string[] = []
    lines.push(`# Search Results`)
    lines.push(`# Query: ${query}`)
    lines.push(`# ${totalMatches} result${totalMatches !== 1 ? 's' : ''} in ${activeResults.length} file${activeResults.length !== 1 ? 's' : ''}`)
    lines.push(`# Flags: ${caseSensitive ? 'Case Sensitive' : 'Case Insensitive'}${useRegex ? ', Regex' : ''}${wholeWord ? ', Whole Word' : ''}`)
    lines.push('')

    for (const result of activeResults) {
      const visibleMatches = result.matches.filter(m => !m.dismissed)
      lines.push(`${result.filePath} (${visibleMatches.length} match${visibleMatches.length !== 1 ? 'es' : ''})`)
      for (const match of visibleMatches) {
        lines.push(`  ${match.line}: ${match.text}`)
      }
      lines.push('')
    }

    const content = lines.join('\n')
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
    const tabName = `Search: ${query} (${timestamp})`
    const path = `untitled:search-results-${Date.now()}`

    openFile({
      path,
      name: tabName,
      content,
      language: 'plaintext',
      isModified: false,
      aiModified: false,
    })
  }, [activeResults, query, totalMatches, caseSensitive, useRegex, wholeWord, openFile])

  // Select history item
  const selectHistoryItem = (item: string) => {
    setQuery(item)
    setShowHistoryDropdown(false)
    setTimeout(() => {
      handleSearchRef.current()
    }, 10)
  }

  const clearHistory = () => {
    setSearchHistory([])
    saveSearchHistory([])
  }

  const toggleChip = (ext: string) => {
    setSelectedChips(prev => {
      const next = new Set(prev)
      next.has(ext) ? next.delete(ext) : next.add(ext)
      return next
    })
  }

  const shouldShowHistory = inputFocused && !query.trim() && searchHistory.length > 0 && showHistoryDropdown

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    ...toggleBtnBase,
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    background: active ? 'rgba(88,166,255,0.1)' : 'transparent',
  })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <Search size={12} style={{ marginRight: 6 }} />
        SEARCH
        {totalMatches > 0 && (
          <span style={{
            marginLeft: 6, fontSize: 10, color: 'var(--text-muted)',
            background: 'var(--bg-active)', padding: '0 5px', borderRadius: 8,
          }}>
            {totalMatches}
          </span>
        )}
      </div>

      <div style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {/* Toggle replace */}
          <button
            onClick={() => setShowReplace(!showReplace)}
            title={showReplace ? 'Hide Replace' : 'Show Replace'}
            style={{
              width: 20, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 3, color: showReplace ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0,
              transition: 'color 0.1s',
            }}
          >
            <ChevronRight size={12} style={{ transform: showReplace ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Search input with history dropdown */}
            <div style={{ position: 'relative' }} ref={historyDropdownRef}>
              <div style={inputWrapStyle}>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    if (e.target.value.trim()) {
                      setShowHistoryDropdown(false)
                    } else {
                      setShowHistoryDropdown(true)
                    }
                    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
                    if (e.target.value.trim()) {
                      searchDebounceRef.current = setTimeout(() => {
                        handleSearchRef.current()
                      }, 500)
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    setInputFocused(true)
                    if (!query.trim()) setShowHistoryDropdown(true)
                  }}
                  onBlur={() => {
                    setTimeout(() => setInputFocused(false), 200)
                  }}
                  placeholder="Search in files..."
                  style={inputStyle}
                />
                <div style={{ display: 'flex', gap: 1, padding: '0 4px' }}>
                  <button onClick={() => setCaseSensitive(!caseSensitive)} title="Match Case (Alt+C)"
                    style={toggleBtnStyle(caseSensitive)}>Aa</button>
                  <button onClick={() => setWholeWord(!wholeWord)} title="Match Whole Word (Alt+W)"
                    style={{ ...toggleBtnStyle(wholeWord), letterSpacing: '-0.5px' }}>
                    <span style={{ borderRight: '2px solid currentColor', paddingRight: 1 }}>ab</span>
                  </button>
                  <button onClick={() => setUseRegex(!useRegex)} title="Use Regular Expression (Alt+R)"
                    style={toggleBtnStyle(useRegex)}>.*</button>
                </div>
              </div>

              {/* Search history dropdown */}
              {shouldShowHistory && (
                <div
                  style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', marginTop: 2,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)', maxHeight: 200, overflowY: 'auto',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recent Searches</span>
                    <button onClick={clearHistory} title="Clear Search History"
                      style={{ padding: '1px 4px', borderRadius: 3, fontSize: 10, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                      <X size={10} />
                    </button>
                  </div>
                  {searchHistory.map((item, i) => (
                    <div
                      key={i}
                      onClick={() => selectHistoryItem(item)}
                      style={{
                        padding: '5px 8px', fontSize: 12, color: 'var(--text-secondary)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <History size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Replace input */}
            {showReplace && (
              <div style={inputWrapStyle}>
                <input
                  value={replaceQuery}
                  onChange={(e) => setReplaceQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleReplaceAll() }}
                  placeholder="Replace..."
                  style={inputStyle}
                />
                <div style={{ display: 'flex', gap: 2, padding: '0 4px' }}>
                  <button title="Preview Replacements" onClick={() => setPreviewReplace(!previewReplace)}
                    style={{
                      ...iconBtnStyle,
                      color: previewReplace ? 'var(--accent)' : 'var(--text-muted)',
                      background: previewReplace ? 'rgba(88,166,255,0.1)' : 'transparent',
                    }}>
                    <Eye size={12} />
                  </button>
                  <button title="Replace All in All Files" onClick={handleReplaceAll}
                    style={iconBtnStyle}>
                    <Replace size={12} />
                  </button>
                  {undoStack.length > 0 && (
                    <button title={`Undo Last Replace (${undoStack.length} in stack)`} onClick={handleUndoLast}
                      style={{ ...iconBtnStyle, color: 'var(--accent-orange, #f59e0b)' }}>
                      <Undo2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Filter toggle row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowFilters(!showFilters)}
                title={showFilters ? 'Hide Filters' : 'Show Filters (include/exclude files)'}
                style={{
                  padding: '2px 4px', borderRadius: 3, fontSize: 11,
                  color: showFilters ? 'var(--accent)' : 'var(--text-muted)',
                  background: showFilters ? 'rgba(88,166,255,0.1)' : 'transparent',
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <ListFilter size={12} />
                <span style={{ fontSize: 10 }}>Filters</span>
              </button>
              <button
                onClick={() => setShowContext(!showContext)}
                title={showContext ? 'Hide Context Lines' : 'Show Context Lines'}
                style={{
                  padding: '2px 4px', borderRadius: 3, fontSize: 11,
                  color: showContext ? 'var(--accent)' : 'var(--text-muted)',
                  background: showContext ? 'rgba(88,166,255,0.1)' : 'transparent',
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <AlignJustify size={12} />
                <span style={{ fontSize: 10 }}>Context</span>
              </button>
              <button
                onClick={() => setSearchOpenOnly(!searchOpenOnly)}
                title={searchOpenOnly ? 'Search all files' : 'Search open editors only'}
                style={{
                  padding: '2px 4px', borderRadius: 3, fontSize: 11,
                  color: searchOpenOnly ? 'var(--accent)' : 'var(--text-muted)',
                  background: searchOpenOnly ? 'rgba(88,166,255,0.1)' : 'transparent',
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <FolderOpen size={12} />
                <span style={{ fontSize: 10 }}>Open Only</span>
              </button>
            </div>

            {/* Include/Exclude filter inputs */}
            {showFilters && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                <div style={inputWrapStyle}>
                  <input
                    value={includePattern}
                    onChange={(e) => setIncludePattern(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
                    placeholder="files to include (e.g. *.ts, src/**)"
                    style={filterInputStyle}
                  />
                </div>
                <div style={inputWrapStyle}>
                  <input
                    value={excludePattern}
                    onChange={(e) => setExcludePattern(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
                    placeholder="files to exclude (e.g. node_modules, dist)"
                    style={filterInputStyle}
                  />
                </div>

                {/* File type filter chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                  {FILE_TYPE_CHIPS.map(chip => {
                    const active = selectedChips.has(chip.ext)
                    return (
                      <button
                        key={chip.ext}
                        onClick={() => { toggleChip(chip.ext); setTimeout(() => handleSearchRef.current(), 50) }}
                        style={{
                          ...chipBtnBase,
                          color: active ? 'var(--accent)' : 'var(--text-muted)',
                          background: active ? 'rgba(88,166,255,0.12)' : 'transparent',
                          borderColor: active ? 'var(--accent)' : 'var(--border)',
                        }}
                      >
                        {chip.label}
                      </button>
                    )
                  })}
                  {selectedChips.size > 0 && (
                    <button
                      onClick={() => { setSelectedChips(new Set()); setTimeout(() => handleSearchRef.current(), 50) }}
                      style={{
                        ...chipBtnBase,
                        color: 'var(--accent-orange, #f59e0b)',
                        background: 'transparent',
                        borderColor: 'var(--accent-orange, #f59e0b)',
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        {!rootPath && !searchOpenOnly && (
          <p style={{ fontSize: 11, color: 'var(--accent-orange)', marginTop: 6 }}>Open a folder first to search</p>
        )}
      </div>

      {/* Results area */}
      <div ref={resultsContainerRef} style={{ flex: 1, overflowY: 'auto', fontSize: 12 }}>
        {searching && (
          <div style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Loader2 size={14} className="anim-spin" />
            Searching...
          </div>
        )}

        {!searching && results.length === 0 && query && (
          <div style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center', fontSize: 12 }}>
            No results found
          </div>
        )}

        {!searching && activeResults.length > 0 && (
          <div style={{
            padding: '4px 12px', color: 'var(--text-muted)', fontSize: 11,
            display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontWeight: 500 }}>
              <span style={{ color: 'var(--text-primary)' }}>{totalMatches}</span> result{totalMatches !== 1 ? 's' : ''} in{' '}
              <span style={{ color: 'var(--text-primary)' }}>{activeResults.length}</span> file{activeResults.length !== 1 ? 's' : ''}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              <button onClick={copyResultsToClipboard} title="Copy Results to Clipboard" style={iconBtnStyle}>
                <Copy size={12} />
              </button>
              <button onClick={openAllMatchingFiles} title="Open All Matching Files" style={iconBtnStyle}>
                <FolderOpen size={12} />
              </button>
              <button onClick={openResultsInEditor} title="Open Results in Editor" style={iconBtnStyle}>
                <FileOutput size={12} />
              </button>
              <div style={{ width: 1, background: 'var(--border)', margin: '2px 2px' }} />
              <button onClick={() => {
                setActiveMatchIndex(prev => {
                  const next = prev >= flatMatches.length - 1 ? 0 : prev + 1
                  const m = flatMatches[next]
                  if (m) openResult(m.filePath, m.fileName, m.line)
                  return next
                })
              }} title="Next Match (F4)" style={iconBtnStyle}>
                <ArrowDown size={12} />
              </button>
              <button onClick={() => {
                setActiveMatchIndex(prev => {
                  const next = prev <= 0 ? flatMatches.length - 1 : prev - 1
                  const m = flatMatches[next]
                  if (m) openResult(m.filePath, m.fileName, m.line)
                  return next
                })
              }} title="Previous Match (Shift+F4)" style={iconBtnStyle}>
                <ArrowUp size={12} />
              </button>
              <div style={{ width: 1, background: 'var(--border)', margin: '2px 2px' }} />
              <button onClick={expandAll} title="Expand All" style={iconBtnStyle}>
                <ChevronsUpDown size={12} />
              </button>
              <button onClick={collapseAll} title="Collapse All" style={iconBtnStyle}>
                <ChevronsDownUp size={12} />
              </button>
              <button onClick={clearResults} title="Clear Results" style={iconBtnStyle}>
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Match navigation indicator */}
        {activeMatchIndex >= 0 && flatMatches.length > 0 && (
          <div style={{
            padding: '2px 12px', fontSize: 10, color: 'var(--text-muted)',
            background: 'rgba(88,166,255,0.06)', borderBottom: '1px solid var(--border)',
          }}>
            Match {activeMatchIndex + 1} of {flatMatches.length}
          </div>
        )}

        {results.map((result, resultIdx) => {
          if (result.dismissed) return null
          const visibleMatches = result.matches.filter(m => !m.dismissed)
          if (visibleMatches.length === 0) return null

          return (
            <div key={result.filePath}>
              {/* File header row */}
              <div
                onClick={() => toggleExpand(result.filePath)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 12px', cursor: 'pointer', color: 'var(--text-primary)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                {expanded.has(result.filePath) ? (
                  <ChevronDown size={12} style={{ flexShrink: 0 }} />
                ) : (
                  <ChevronRight size={12} style={{ flexShrink: 0 }} />
                )}
                <FileText size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span className="truncate" style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span>{result.fileName}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.7 }}>
                    {(() => {
                      const normalized = result.filePath.replace(/\\/g, '/')
                      const parts = normalized.split('/')
                      parts.pop()
                      const parentDir = parts.length > 0 ? parts.slice(-2).join('/') : ''
                      return parentDir
                    })()}
                  </span>
                </span>
                {showReplace && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReplaceInFile(result.filePath, result.fileName) }}
                    title="Replace all in this file"
                    style={{ ...iconBtnStyle, marginRight: 2 }}
                  >
                    <Replace size={12} />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); dismissFileResult(resultIdx) }}
                  title="Dismiss file from results"
                  style={{ ...iconBtnStyle, opacity: 0.5 }}
                >
                  <X size={10} />
                </button>
                <span style={{
                  fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-active)',
                  padding: '0 5px', borderRadius: 8, fontWeight: 500,
                }}>
                  {visibleMatches.length}
                </span>
              </div>

              {/* Match lines */}
              {expanded.has(result.filePath) &&
                result.matches.map((match, matchIdx) => {
                  if (match.dismissed) return null
                  const { before, after } = getContextLines(result, matchIdx)
                  const flatIdx = flatMatches.findIndex(
                    fm => fm.filePath === result.filePath && fm.line === match.line && fm.matchIdx === matchIdx
                  )
                  const isActive = flatIdx === activeMatchIndex

                  return (
                    <div key={matchIdx}>
                      {/* Context line before */}
                      {before.map((ctx, ci) => (
                        <div
                          key={`before-${ci}`}
                          style={{
                            padding: '2px 12px 2px 40px', color: 'var(--text-muted)',
                            fontSize: 11, fontFamily: 'var(--font-mono)', opacity: 0.5, fontStyle: 'italic',
                          }}
                        >
                          <span style={{ marginRight: 8, fontSize: 10 }}>{ctx.line}</span>
                          {ctx.text}
                        </div>
                      ))}
                      {/* Match line */}
                      <div
                        style={{
                          display: 'flex', alignItems: 'center',
                          padding: '3px 12px 3px 40px', cursor: 'pointer',
                          color: 'var(--text-secondary)', fontSize: 12,
                          fontFamily: 'var(--font-mono)',
                          background: isActive ? 'rgba(88,166,255,0.12)' : 'transparent',
                          borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.background = 'transparent'
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            openResult(result.filePath, result.fileName, match.line)
                          }
                        }}
                        tabIndex={0}
                      >
                        {showReplace && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReplaceSingle(result.filePath, result.fileName, match.line, match.text) }}
                            title="Replace this match"
                            style={{ ...iconBtnStyle, flexShrink: 0, marginRight: 4 }}
                          >
                            <Replace size={10} />
                          </button>
                        )}
                        <div
                          onClick={() => {
                            openResult(result.filePath, result.fileName, match.line)
                            setActiveMatchIndex(flatIdx)
                          }}
                          style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                          <span style={{ color: 'var(--text-muted)', marginRight: 8, fontSize: 10, userSelect: 'none' }}>
                            {match.line}
                          </span>
                          {highlightReplace(match.text)}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); dismissMatch(resultIdx, matchIdx) }}
                          title="Dismiss this match"
                          style={{ ...iconBtnStyle, opacity: 0.4, flexShrink: 0, marginLeft: 4 }}
                        >
                          <X size={10} />
                        </button>
                      </div>
                      {/* Context line after */}
                      {after.map((ctx, ci) => (
                        <div
                          key={`after-${ci}`}
                          style={{
                            padding: '2px 12px 2px 40px', color: 'var(--text-muted)',
                            fontSize: 11, fontFamily: 'var(--font-mono)', opacity: 0.5, fontStyle: 'italic',
                          }}
                        >
                          <span style={{ marginRight: 8, fontSize: 10 }}>{ctx.line}</span>
                          {ctx.text}
                        </div>
                      ))}
                    </div>
                  )
                })}
            </div>
          )
        })}

        {!searching && !query && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
            <div>Type to search across all files in the workspace</div>
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', opacity: 0.7 }}>
              <kbd style={{ padding: '1px 4px', borderRadius: 3, background: 'var(--bg-active)', border: '1px solid var(--border)', fontSize: 10 }}>F4</kbd> Next match{' '}
              <kbd style={{ padding: '1px 4px', borderRadius: 3, background: 'var(--bg-active)', border: '1px solid var(--border)', fontSize: 10 }}>Shift+F4</kbd> Previous match{' '}
              <kbd style={{ padding: '1px 4px', borderRadius: 3, background: 'var(--bg-active)', border: '1px solid var(--border)', fontSize: 10 }}>Enter</kbd> Open match
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
