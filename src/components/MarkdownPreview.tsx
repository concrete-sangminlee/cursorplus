import { useState, useMemo, useCallback, useRef, useEffect } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MarkdownPreviewProps {
  content: string
  style?: React.CSSProperties
  customCSS?: string
  onNavigate?: (path: string) => void
}

interface TocEntry {
  level: number
  text: string
  id: string
}

interface FrontmatterData {
  [key: string]: string
}

type ViewMode = 'preview' | 'source' | 'split'

// ─── Utility: HTML escaping ──────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Syntax Highlighting ─────────────────────────────────────────────────────

function highlightCode(code: string, lang: string): string {
  const jsKeywords = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|static|get|set|null|undefined|true|false|void|delete|super)\b/g
  const pyKeywords = /\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|and|or|not|in|is|None|True|False|self|global|nonlocal|assert|del|print)\b/g
  const tsKeywords = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|static|get|set|null|undefined|true|false|void|delete|super|interface|type|enum|implements|namespace|abstract|declare|readonly|private|protected|public|as|keyof|infer|never|unknown|any)\b/g
  const goKeywords = /\b(func|return|if|else|for|range|switch|case|break|continue|var|const|type|struct|interface|map|chan|go|defer|select|package|import|nil|true|false|make|len|cap|append|copy|delete|new|panic|recover)\b/g
  const rustKeywords = /\b(fn|let|mut|return|if|else|for|while|loop|match|break|continue|struct|enum|impl|trait|pub|use|mod|crate|self|super|where|async|await|move|ref|type|const|static|unsafe|extern|true|false|None|Some|Ok|Err|Self|dyn|Box|Vec|String|Option|Result)\b/g
  const javaKeywords = /\b(public|private|protected|static|final|abstract|class|interface|extends|implements|new|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|throws|import|package|void|int|long|double|float|boolean|char|byte|short|null|true|false|this|super|instanceof|synchronized|volatile|transient|native|enum)\b/g
  const cKeywords = /\b(int|long|short|char|float|double|void|unsigned|signed|const|static|extern|auto|register|volatile|return|if|else|for|while|do|switch|case|break|continue|struct|union|enum|typedef|sizeof|NULL|true|false|include|define|ifdef|ifndef|endif|pragma)\b/g
  const cssKeywords = /\b(color|background|margin|padding|border|display|position|width|height|font|text|align|flex|grid|overflow|transition|transform|animation|opacity|z-index|top|left|right|bottom|none|auto|inherit|initial|important)\b/g
  const sqlKeywords = /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|NULL|IN|BETWEEN|LIKE|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|AS|INTO|VALUES|SET|COUNT|SUM|AVG|MAX|MIN|DISTINCT)\b/gi
  const shellKeywords = /\b(echo|cd|ls|mkdir|rm|cp|mv|cat|grep|sed|awk|find|chmod|chown|sudo|apt|yum|npm|yarn|pip|git|docker|curl|wget|export|source|alias|if|then|else|fi|for|do|done|while|case|esac|function|return|exit)\b/g

  let keywords: RegExp
  const l = lang.toLowerCase()
  switch (l) {
    case 'javascript': case 'js': case 'jsx': keywords = jsKeywords; break
    case 'typescript': case 'ts': case 'tsx': keywords = tsKeywords; break
    case 'python': case 'py': keywords = pyKeywords; break
    case 'go': case 'golang': keywords = goKeywords; break
    case 'rust': case 'rs': keywords = rustKeywords; break
    case 'java': case 'kotlin': keywords = javaKeywords; break
    case 'c': case 'cpp': case 'c++': case 'h': keywords = cKeywords; break
    case 'css': case 'scss': case 'less': keywords = cssKeywords; break
    case 'sql': keywords = sqlKeywords; break
    case 'bash': case 'sh': case 'shell': case 'zsh': keywords = shellKeywords; break
    default: keywords = jsKeywords
  }

  let escaped = escapeHtml(code)

  // Strings (double then single)
  escaped = escaped.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '<span class="md-hl-string">$&</span>')
  // Multi-line comments
  escaped = escaped.replace(/\/\*[\s\S]*?\*\//g, '<span class="md-hl-comment">$&</span>')
  // Single-line comments
  escaped = escaped.replace(/(\/\/.*$|#(?!include|define|ifdef|ifndef|endif|pragma).*$)/gm, '<span class="md-hl-comment">$&</span>')
  // Numbers
  escaped = escaped.replace(/\b(\d+\.?\d*(?:e[+-]?\d+)?|0x[0-9a-f]+|0b[01]+|0o[0-7]+)\b/gi, '<span class="md-hl-number">$&</span>')
  // Decorators / annotations
  escaped = escaped.replace(/@\w+/g, '<span class="md-hl-decorator">$&</span>')
  // Keywords
  escaped = escaped.replace(keywords, '<span class="md-hl-keyword">$&</span>')
  // Function calls (word followed by opening paren)
  escaped = escaped.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span class="md-hl-function">$1</span>')

  return escaped
}

// ─── Frontmatter Parsing ─────────────────────────────────────────────────────

function parseFrontmatter(content: string): { frontmatter: FrontmatterData | null; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) return { frontmatter: null, body: content }

  const data: FrontmatterData = {}
  const lines = match[1].split('\n')
  for (const line of lines) {
    const kv = line.match(/^(\w[\w\s-]*):\s*(.*)$/)
    if (kv) {
      data[kv[1].trim()] = kv[2].trim()
    }
  }
  return { frontmatter: data, body: content.slice(match[0].length) }
}

// ─── Table of Contents Extraction ────────────────────────────────────────────

function extractToc(content: string): TocEntry[] {
  const entries: TocEntry[] = []
  // Strip frontmatter first
  const body = content.replace(/^---\n[\s\S]*?\n---\n/, '')
  const lines = body.split('\n')
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+)$/)
    if (m) {
      const level = m[1].length
      const text = m[2].replace(/[*_`~\[\]]/g, '')
      const id = 'heading-' + text.toLowerCase().replace(/[^\w]+/g, '-').replace(/(^-|-$)/g, '')
      entries.push({ level, text, id })
    }
  }
  return entries
}

// ─── Mermaid Diagram Renderer (SVG-based) ────────────────────────────────────

function renderMermaidSvg(code: string): string {
  const trimmed = code.trim()
  const type = trimmed.split(/[\s\n]/)[0]?.toLowerCase() || ''

  // Parse nodes and edges from common diagram types
  if (type === 'graph' || type === 'flowchart') {
    return renderFlowchartSvg(trimmed)
  }
  if (type === 'sequencediagram' || trimmed.startsWith('sequenceDiagram')) {
    return renderSequenceSvg(trimmed)
  }
  if (type === 'pie') {
    return renderPieSvg(trimmed)
  }

  // Fallback: styled code display
  return `<div class="md-mermaid-placeholder"><div class="md-mermaid-header"><span class="md-mermaid-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></span>Mermaid Diagram<span class="md-mermaid-badge">${escapeHtml(type || 'diagram')}</span></div><pre class="md-mermaid-code"><code>${escapeHtml(code)}</code></pre></div>`
}

function renderFlowchartSvg(code: string): string {
  // Parse simple nodes like A[Text] --> B[Text]
  const nodeMap = new Map<string, { label: string; x: number; y: number }>()
  const edges: Array<{ from: string; to: string; label?: string }> = []
  const nodeRegex = /(\w+)\s*[\[({]([^}\])]+)[\])}]/g
  const edgeRegex = /(\w+)\s*(?:-->|==>|-.->|--[>|])\s*(?:\|([^|]*)\|)?\s*(\w+)/g
  let m: RegExpExecArray | null

  while ((m = nodeRegex.exec(code)) !== null) {
    if (!nodeMap.has(m[1])) {
      nodeMap.set(m[1], { label: m[2], x: 0, y: 0 })
    }
  }
  while ((m = edgeRegex.exec(code)) !== null) {
    edges.push({ from: m[1], to: m[3], label: m[2] })
    if (!nodeMap.has(m[1])) nodeMap.set(m[1], { label: m[1], x: 0, y: 0 })
    if (!nodeMap.has(m[3])) nodeMap.set(m[3], { label: m[3], x: 0, y: 0 })
  }

  // Layout nodes in a grid
  const nodes = Array.from(nodeMap.entries())
  const cols = Math.max(2, Math.ceil(Math.sqrt(nodes.length)))
  nodes.forEach(([, node], i) => {
    node.x = 60 + (i % cols) * 180
    node.y = 40 + Math.floor(i / cols) * 100
  })

  const width = 60 + cols * 180
  const height = 40 + Math.ceil(nodes.length / cols) * 100 + 40

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="max-width:100%;height:auto">`
  svg += '<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--accent-blue, #388bfd)"/></marker></defs>'

  // Draw edges
  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.from)
    const toNode = nodeMap.get(edge.to)
    if (fromNode && toNode) {
      svg += `<line x1="${fromNode.x + 60}" y1="${fromNode.y + 18}" x2="${toNode.x}" y2="${toNode.y + 18}" stroke="var(--accent-blue, #388bfd)" stroke-width="1.5" marker-end="url(#arrowhead)" opacity="0.7"/>`
      if (edge.label) {
        const mx = (fromNode.x + 60 + toNode.x) / 2
        const my = (fromNode.y + toNode.y) / 2 + 14
        svg += `<text x="${mx}" y="${my}" fill="var(--text-muted)" font-size="10" text-anchor="middle">${escapeHtml(edge.label)}</text>`
      }
    }
  }

  // Draw nodes
  for (const [, node] of nodes) {
    svg += `<rect x="${node.x}" y="${node.y}" width="120" height="36" rx="6" fill="var(--bg-tertiary, #2d2d30)" stroke="var(--accent-blue, #388bfd)" stroke-width="1.5"/>`
    svg += `<text x="${node.x + 60}" y="${node.y + 22}" fill="var(--text-primary, #ccc)" font-size="12" text-anchor="middle" font-family="sans-serif">${escapeHtml(node.label)}</text>`
  }

  svg += '</svg>'
  return `<div class="md-mermaid-rendered">${svg}</div>`
}

function renderSequenceSvg(code: string): string {
  const participants: string[] = []
  const messages: Array<{ from: string; to: string; text: string; dashed: boolean }> = []
  const lines = code.split('\n')

  for (const line of lines) {
    const pMatch = line.match(/participant\s+(\w+)/)
    if (pMatch && !participants.includes(pMatch[1])) participants.push(pMatch[1])
    const mMatch = line.match(/(\w+)\s*(->>|-->>|->|-->)\s*(\w+)\s*:\s*(.+)/)
    if (mMatch) {
      if (!participants.includes(mMatch[1])) participants.push(mMatch[1])
      if (!participants.includes(mMatch[3])) participants.push(mMatch[3])
      messages.push({ from: mMatch[1], to: mMatch[3], text: mMatch[4].trim(), dashed: mMatch[2].includes('--') })
    }
  }

  if (participants.length === 0) return renderMermaidSvg(code)

  const colW = 160
  const width = participants.length * colW + 40
  const height = 80 + messages.length * 50 + 40
  const getX = (p: string) => 20 + participants.indexOf(p) * colW + colW / 2

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="max-width:100%;height:auto">`
  svg += '<defs><marker id="seq-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="var(--accent-blue, #388bfd)"/></marker></defs>'

  // Participant boxes and lifelines
  for (const p of participants) {
    const x = getX(p)
    svg += `<rect x="${x - 40}" y="10" width="80" height="30" rx="4" fill="var(--bg-tertiary)" stroke="var(--border)" stroke-width="1"/>`
    svg += `<text x="${x}" y="30" fill="var(--text-primary)" font-size="12" text-anchor="middle" font-family="sans-serif">${escapeHtml(p)}</text>`
    svg += `<line x1="${x}" y1="40" x2="${x}" y2="${height - 10}" stroke="var(--border)" stroke-width="1" stroke-dasharray="4,4"/>`
  }

  // Messages
  messages.forEach((msg, i) => {
    const y = 70 + i * 50
    const x1 = getX(msg.from)
    const x2 = getX(msg.to)
    const dash = msg.dashed ? ' stroke-dasharray="6,3"' : ''
    svg += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="var(--accent-blue, #388bfd)" stroke-width="1.5"${dash} marker-end="url(#seq-arrow)"/>`
    const tx = (x1 + x2) / 2
    svg += `<text x="${tx}" y="${y - 6}" fill="var(--text-secondary)" font-size="11" text-anchor="middle" font-family="sans-serif">${escapeHtml(msg.text)}</text>`
  })

  svg += '</svg>'
  return `<div class="md-mermaid-rendered">${svg}</div>`
}

function renderPieSvg(code: string): string {
  const entries: Array<{ label: string; value: number }> = []
  const lines = code.split('\n')
  let title = 'Chart'
  for (const line of lines) {
    const tMatch = line.match(/title\s+(.+)/)
    if (tMatch) title = tMatch[1].trim()
    const dMatch = line.match(/"([^"]+)"\s*:\s*(\d+\.?\d*)/)
    if (dMatch) entries.push({ label: dMatch[1], value: parseFloat(dMatch[2]) })
  }

  if (entries.length === 0) return renderMermaidSvg(code)

  const total = entries.reduce((s, e) => s + e.value, 0)
  const colors = ['#388bfd', '#f97583', '#56d364', '#e3b341', '#bc8cff', '#79c0ff', '#ff9a00', '#3fb950']
  const cx = 120, cy = 120, r = 90
  let angle = 0

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 260" style="max-width:100%;height:auto">`
  svg += `<text x="180" y="20" fill="var(--text-primary)" font-size="14" text-anchor="middle" font-weight="600" font-family="sans-serif">${escapeHtml(title)}</text>`

  entries.forEach((entry, i) => {
    const slice = (entry.value / total) * Math.PI * 2
    const x1 = cx + r * Math.cos(angle)
    const y1 = cy + r * Math.sin(angle) + 30
    const x2 = cx + r * Math.cos(angle + slice)
    const y2 = cy + r * Math.sin(angle + slice) + 30
    const large = slice > Math.PI ? 1 : 0
    svg += `<path d="M${cx},${cy + 30} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z" fill="${colors[i % colors.length]}" opacity="0.85"/>`
    angle += slice
  })

  // Legend
  entries.forEach((entry, i) => {
    const ly = 30 + i * 20
    svg += `<rect x="250" y="${ly}" width="12" height="12" rx="2" fill="${colors[i % colors.length]}"/>`
    svg += `<text x="268" y="${ly + 10}" fill="var(--text-secondary)" font-size="11" font-family="sans-serif">${escapeHtml(entry.label)} (${Math.round(entry.value / total * 100)}%)</text>`
  })

  svg += '</svg>'
  return `<div class="md-mermaid-rendered">${svg}</div>`
}

// ─── Markdown Parser ─────────────────────────────────────────────────────────

function parseMarkdown(content: string): string {
  let html = content

  // Collect footnote definitions
  const footnotes: Record<string, string> = {}
  html = html.replace(/^\[\^(\w+)\]:\s+(.+)$/gm, (_, id, text) => {
    footnotes[id] = text
    return `__FOOTNOTE_DEF_${id}__`
  })

  // Fenced code blocks (with mermaid handling)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const trimmedCode = code.replace(/\n$/, '')
    if (lang.toLowerCase() === 'mermaid') {
      return renderMermaidSvg(trimmedCode)
    }
    const highlighted = highlightCode(trimmedCode, lang || 'text')
    const lines = highlighted.split('\n')
    const numberedLines = lines.map((line, i) =>
      `<span class="md-code-line"><span class="md-code-ln">${i + 1}</span>${line || ' '}</span>`
    ).join('\n')
    return `<div class="md-code-wrapper"><div class="md-code-header"><span class="md-code-lang">${escapeHtml(lang || 'text')}</span><button class="md-code-copy" type="button"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"/></svg><span class="md-copy-text">Copy</span></button></div><pre class="md-code-block"><code>${numberedLines}</code></pre></div>`
  })

  // Inline code (before other inline transformations)
  html = html.replace(/`([^`\n]+)`/g, '<code class="md-inline-code">$1</code>')

  // Headings (ATX style, h1-h6) with anchors
  html = html.replace(/^######\s+(.+)$/gm, (_, t) => { const id = 'heading-' + t.replace(/[*_`~\[\]]/g, '').toLowerCase().replace(/[^\w]+/g, '-').replace(/(^-|-$)/g, ''); return `<h6 class="md-h6" id="${id}">${t}</h6>` })
  html = html.replace(/^#####\s+(.+)$/gm, (_, t) => { const id = 'heading-' + t.replace(/[*_`~\[\]]/g, '').toLowerCase().replace(/[^\w]+/g, '-').replace(/(^-|-$)/g, ''); return `<h5 class="md-h5" id="${id}">${t}</h5>` })
  html = html.replace(/^####\s+(.+)$/gm, (_, t) => { const id = 'heading-' + t.replace(/[*_`~\[\]]/g, '').toLowerCase().replace(/[^\w]+/g, '-').replace(/(^-|-$)/g, ''); return `<h4 class="md-h4" id="${id}">${t}</h4>` })
  html = html.replace(/^###\s+(.+)$/gm, (_, t) => { const id = 'heading-' + t.replace(/[*_`~\[\]]/g, '').toLowerCase().replace(/[^\w]+/g, '-').replace(/(^-|-$)/g, ''); return `<h3 class="md-h3" id="${id}">${t}</h3>` })
  html = html.replace(/^##\s+(.+)$/gm, (_, t) => { const id = 'heading-' + t.replace(/[*_`~\[\]]/g, '').toLowerCase().replace(/[^\w]+/g, '-').replace(/(^-|-$)/g, ''); return `<h2 class="md-h2" id="${id}">${t}</h2>` })
  html = html.replace(/^#\s+(.+)$/gm, (_, t) => { const id = 'heading-' + t.replace(/[*_`~\[\]]/g, '').toLowerCase().replace(/[^\w]+/g, '-').replace(/(^-|-$)/g, ''); return `<h1 class="md-h1" id="${id}">${t}</h1>` })

  // Display math $$...$$
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    return `<div class="md-math-block"><div class="md-math-header"><span class="md-math-icon">&#8721;</span> LaTeX Math</div><pre class="md-math-content"><code>${math.trim()}</code></pre></div>`
  })

  // Inline math $...$
  html = html.replace(/\$([^\$\n]+?)\$/g, '<code class="md-math-inline">$1</code>')

  // Bold + Italic combos
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/~~(.+?)~~/g, '<del class="md-del">$1</del>')

  // Highlight ==text==
  html = html.replace(/==(.+?)==/g, '<mark class="md-mark">$1</mark>')

  // Images with lazy loading
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    return `<div class="md-image-container"><img src="${src}" alt="${alt}" class="md-image" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="md-image-placeholder" style="display:none"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><span>${alt || 'Image'}</span></div></div>`
  })

  // Links with data attribute for click handling
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    const isExternal = /^https?:\/\//.test(href)
    return `<a href="${href}" class="md-link" data-link-type="${isExternal ? 'external' : 'internal'}" title="${href}">${text}</a>`
  })

  // Autolinks
  html = html.replace(/&lt;(https?:\/\/[^&]+)&gt;/g, '<a href="$1" class="md-link" data-link-type="external">$1</a>')

  // Bare URLs in text (not inside tags)
  html = html.replace(/(?<![="'])(https?:\/\/[^\s<)"']+)/g, '<a href="$1" class="md-link" data-link-type="external">$1</a>')

  // Footnote references [^id]
  html = html.replace(/\[\^(\w+)\]/g, (_, id) => {
    return `<sup class="md-footnote-ref"><a href="#fn-${id}" id="fnref-${id}">[${id}]</a></sup>`
  })

  // Blockquotes (handle nested with >>)
  html = html.replace(/^&gt;\s?&gt;\s+(.+)$/gm, '<blockquote class="md-blockquote"><blockquote class="md-blockquote"><p>$1</p></blockquote></blockquote>')
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote class="md-blockquote"><p>$1</p></blockquote>')
  html = html.replace(/<\/blockquote>\n<blockquote class="md-blockquote">/g, '')

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="md-hr" />')
  html = html.replace(/^\*\*\*$/gm, '<hr class="md-hr" />')
  html = html.replace(/^___$/gm, '<hr class="md-hr" />')

  // Definition lists (term\n: definition)
  html = html.replace(/^(.+)\n:\s+(.+)$/gm, '<dl class="md-dl"><dt class="md-dt">$1</dt><dd class="md-dd">$2</dd></dl>')

  // Task lists (before general lists)
  html = html.replace(/^[\s]*[-*+]\s+\[x\]\s+(.+)$/gim, '<li class="md-li md-task-li"><input type="checkbox" checked disabled class="md-checkbox" /><span>$1</span></li>')
  html = html.replace(/^[\s]*[-*+]\s+\[ \]\s+(.+)$/gm, '<li class="md-li md-task-li"><input type="checkbox" disabled class="md-checkbox" /><span>$1</span></li>')

  // Unordered lists
  html = html.replace(/^[\s]*[-*+]\s+(.+)$/gm, (match) => {
    if (match.includes('md-task-li')) return match
    return match.replace(/^[\s]*[-*+]\s+(.+)$/gm, '<li class="md-li">$1</li>')
  })
  html = html.replace(/(<li class="md-li[^"]*">.*<\/li>\n?)+/g, '<ul class="md-ul">$&</ul>')

  // Ordered lists
  html = html.replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li class="md-oli">$1</li>')
  html = html.replace(/(<li class="md-oli">.*<\/li>\n?)+/g, '<ol class="md-ol">$&</ol>')

  // Tables with alignment support and striped rows
  const tableRegex = /^\|(.+)\|\n\|([-| :]+)\|\n((?:\|.+\|\n?)*)/gm
  html = html.replace(tableRegex, (_, header, separator, rows) => {
    const aligns = separator.split('|').map((s: string) => {
      s = s.trim()
      if (s.startsWith(':') && s.endsWith(':')) return 'center'
      if (s.endsWith(':')) return 'right'
      return 'left'
    })
    const headers = header.split('|').map((h: string, i: number) =>
      `<th class="md-th" style="text-align:${aligns[i] || 'left'}">${h.trim()}</th>`
    ).join('')
    const rowsHtml = rows.trim().split('\n').map((row: string, idx: number) => {
      const cells = row.replace(/^\||\|$/g, '').split('|').map((c: string, ci: number) =>
        `<td class="md-td" style="text-align:${aligns[ci] || 'left'}">${c.trim()}</td>`
      ).join('')
      return `<tr class="${idx % 2 === 1 ? 'md-tr-striped' : ''}">${cells}</tr>`
    }).join('')
    return `<div class="md-table-wrapper"><table class="md-table"><thead><tr>${headers}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`
  })

  // Build footnotes section
  const footnoteIds = Object.keys(footnotes)
  if (footnoteIds.length > 0) {
    footnoteIds.forEach(id => {
      html = html.replace(`__FOOTNOTE_DEF_${id}__`, '')
    })
    let footnotesHtml = '<section class="md-footnotes"><hr class="md-hr" /><ol class="md-footnote-list">'
    footnoteIds.forEach(id => {
      footnotesHtml += `<li id="fn-${id}" class="md-footnote-item"><span class="md-footnote-text">${footnotes[id]}</span> <a href="#fnref-${id}" class="md-footnote-backref">&#8617;</a></li>`
    })
    footnotesHtml += '</ol></section>'
    html += footnotesHtml
  }

  // Paragraphs (lines not already wrapped)
  html = html.replace(/^(?!<[a-z/!]|$|\s*$)(.+)$/gm, '<p class="md-p">$1</p>')

  return html
}

// ─── HTML Export Generator ───────────────────────────────────────────────────

function generateExportHtml(content: string, styles: string, customCSS: string): string {
  const { frontmatter, body } = parseFrontmatter(content)
  const parsed = parseMarkdown(body)

  let fmHtml = ''
  if (frontmatter) {
    const entries = Object.entries(frontmatter)
    fmHtml = '<div class="md-frontmatter"><div class="md-frontmatter-title">Document Metadata</div><table class="md-frontmatter-table">'
    for (const [k, v] of entries) {
      fmHtml += `<tr><td class="md-fm-key">${escapeHtml(k)}</td><td class="md-fm-value">${escapeHtml(v)}</td></tr>`
    }
    fmHtml += '</table></div>'
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${frontmatter?.title ? escapeHtml(frontmatter.title) : 'Markdown Export'}</title>
<style>
:root {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-tertiary: #2d2d30;
  --text-primary: #cccccc;
  --text-secondary: #9d9d9d;
  --text-muted: #6e7681;
  --border: #3e3e42;
  --accent-blue: #388bfd;
  --font-mono: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace;
}
body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.7;
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 32px;
}
${styles}
${customCSS}
@media print {
  body { background: white; color: #1a1a1a; }
  .md-code-copy { display: none !important; }
  .md-code-wrapper { border-color: #ddd; }
  .md-blockquote { border-left-color: #999; background: #f5f5f5; }
  a { color: #0969da; }
}
</style>
</head>
<body class="markdown-preview">
${fmHtml}
${parsed}
</body>
</html>`
}

// ─── Toolbar Icon ────────────────────────────────────────────────────────────

function ToolbarIcon({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d={d} />
    </svg>
  )
}

// ─── Table of Contents Dropdown ──────────────────────────────────────────────

function TocDropdown({ entries, onSelect }: { entries: TocEntry[]; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (entries.length === 0) return null

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        className="md-toolbar-btn"
        onClick={() => setOpen(!open)}
        title="Table of Contents"
        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <ToolbarIcon d="M1 2.75A.75.75 0 011.75 2h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 2.75zm0 5A.75.75 0 011.75 7h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 7.75zm0 5a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H1.75a.75.75 0 01-.75-.75z" />
        <span style={{ fontSize: 11 }}>TOC</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div className="md-toc-dropdown">
          <div className="md-toc-title">Table of Contents</div>
          {entries.map((entry, i) => (
            <button
              key={i}
              className="md-toc-item"
              style={{ paddingLeft: 12 + (entry.level - 1) * 16 }}
              onClick={() => {
                onSelect(entry.id)
                setOpen(false)
              }}
            >
              <span className="md-toc-level">H{entry.level}</span>
              <span className="md-toc-text">{entry.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Search Bar Component ────────────────────────────────────────────────────

function SearchBar({
  previewRef,
  onClose,
}: {
  previewRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [currentMatch, setCurrentMatch] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const clearHighlights = useCallback(() => {
    if (!previewRef.current) return
    const marks = previewRef.current.querySelectorAll('mark.md-search-highlight')
    marks.forEach(mark => {
      const parent = mark.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
        parent.normalize()
      }
    })
  }, [previewRef])

  const performSearch = useCallback((searchText: string) => {
    clearHighlights()
    if (!previewRef.current || !searchText.trim()) {
      setMatchCount(0)
      setCurrentMatch(0)
      return
    }

    const walker = document.createTreeWalker(
      previewRef.current,
      NodeFilter.SHOW_TEXT,
      null
    )

    const textNodes: Text[] = []
    let node: Node | null
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text)
    }

    let count = 0
    const lowerSearch = searchText.toLowerCase()

    for (const textNode of textNodes) {
      const text = textNode.textContent || ''
      const lower = text.toLowerCase()
      let idx = lower.indexOf(lowerSearch)
      if (idx === -1) continue

      const fragment = document.createDocumentFragment()
      let lastIdx = 0

      while (idx !== -1) {
        fragment.appendChild(document.createTextNode(text.slice(lastIdx, idx)))
        const mark = document.createElement('mark')
        mark.className = 'md-search-highlight'
        mark.setAttribute('data-match-index', String(count))
        mark.textContent = text.slice(idx, idx + searchText.length)
        fragment.appendChild(mark)
        count++
        lastIdx = idx + searchText.length
        idx = lower.indexOf(lowerSearch, lastIdx)
      }
      fragment.appendChild(document.createTextNode(text.slice(lastIdx)))
      textNode.parentNode?.replaceChild(fragment, textNode)
    }

    setMatchCount(count)
    if (count > 0) {
      setCurrentMatch(1)
      scrollToMatch(0)
    } else {
      setCurrentMatch(0)
    }
  }, [previewRef, clearHighlights])

  const scrollToMatch = useCallback((index: number) => {
    if (!previewRef.current) return
    const marks = previewRef.current.querySelectorAll('mark.md-search-highlight')
    marks.forEach(m => (m as HTMLElement).style.background = 'rgba(255,213,79,0.35)')
    const target = marks[index] as HTMLElement
    if (target) {
      target.style.background = 'rgba(255,140,0,0.7)'
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [previewRef])

  const goNext = useCallback(() => {
    if (matchCount === 0) return
    const next = currentMatch >= matchCount ? 1 : currentMatch + 1
    setCurrentMatch(next)
    scrollToMatch(next - 1)
  }, [currentMatch, matchCount, scrollToMatch])

  const goPrev = useCallback(() => {
    if (matchCount === 0) return
    const prev = currentMatch <= 1 ? matchCount : currentMatch - 1
    setCurrentMatch(prev)
    scrollToMatch(prev - 1)
  }, [currentMatch, matchCount, scrollToMatch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.shiftKey ? goPrev() : goNext()
    }
    if (e.key === 'Escape') {
      clearHighlights()
      onClose()
    }
  }, [goNext, goPrev, clearHighlights, onClose])

  useEffect(() => {
    return () => { clearHighlights() }
  }, [clearHighlights])

  return (
    <div className="md-search-bar">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--text-muted)" style={{ flexShrink: 0 }}>
        <path d="M11.5 7a4.499 4.499 0 11-8.998 0A4.499 4.499 0 0111.5 7zm-.82 4.74a6 6 0 111.06-1.06l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04z" />
      </svg>
      <input
        ref={inputRef}
        className="md-search-input"
        type="text"
        placeholder="Search in preview..."
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          performSearch(e.target.value)
        }}
        onKeyDown={handleKeyDown}
      />
      {matchCount > 0 && (
        <span className="md-search-count">{currentMatch}/{matchCount}</span>
      )}
      <button className="md-search-nav-btn" onClick={goPrev} title="Previous match" disabled={matchCount === 0}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3.22 9.78a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0l4.25 4.25a.75.75 0 01-1.06 1.06L8 6.06 4.28 9.78a.75.75 0 01-1.06 0z"/></svg>
      </button>
      <button className="md-search-nav-btn" onClick={goNext} title="Next match" disabled={matchCount === 0}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M12.78 6.22a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L3.22 7.28a.75.75 0 011.06-1.06L8 9.94l3.72-3.72a.75.75 0 011.06 0z"/></svg>
      </button>
      <button className="md-search-nav-btn" onClick={() => { clearHighlights(); onClose() }} title="Close search">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>
      </button>
    </div>
  )
}

// ─── Frontmatter Display Component ──────────────────────────────────────────

function FrontmatterPanel({ data }: { data: FrontmatterData }) {
  const [collapsed, setCollapsed] = useState(false)
  const entries = Object.entries(data)
  if (entries.length === 0) return null

  return (
    <div className="md-frontmatter">
      <button className="md-frontmatter-toggle" onClick={() => setCollapsed(!collapsed)}>
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>
          <path d="M12.78 6.22a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L3.22 7.28a.75.75 0 011.06-1.06L8 9.94l3.72-3.72a.75.75 0 011.06 0z"/>
        </svg>
        <span className="md-frontmatter-title">YAML Frontmatter</span>
        <span className="md-frontmatter-count">{entries.length} fields</span>
      </button>
      {!collapsed && (
        <table className="md-frontmatter-table">
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key}>
                <td className="md-fm-key">{key}</td>
                <td className="md-fm-value">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MarkdownPreview({ content, style, customCSS = '', onNavigate }: MarkdownPreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [scrollSync, setScrollSync] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [zoom, setZoom] = useState(100)
  const previewRef = useRef<HTMLDivElement>(null)
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const isSyncing = useRef(false)

  // Parse frontmatter and body
  const { frontmatter, body } = useMemo(() => parseFrontmatter(content), [content])
  const html = useMemo(() => parseMarkdown(body), [body])
  const toc = useMemo(() => extractToc(content), [content])

  // Word and character count
  const stats = useMemo(() => {
    const text = body.replace(/[#*`~\[\]()>|_-]/g, '')
    const words = text.trim().split(/\s+/).filter(w => w.length > 0).length
    const chars = content.length
    const lines = content.split('\n').length
    const readTime = Math.max(1, Math.ceil(words / 200))
    return { words, chars, lines, readTime }
  }, [content, body])

  // Handle copy button clicks and link clicks via event delegation
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement

    // Copy code button
    const copyBtn = target.closest('.md-code-copy') as HTMLElement | null
    if (copyBtn) {
      e.preventDefault()
      const wrapper = copyBtn.closest('.md-code-wrapper')
      const codeEl = wrapper?.querySelector('code')
      if (codeEl) {
        navigator.clipboard.writeText(codeEl.textContent || '').then(() => {
          const textEl = copyBtn.querySelector('.md-copy-text')
          if (textEl) {
            textEl.textContent = 'Copied!'
            setTimeout(() => { if (textEl) textEl.textContent = 'Copy' }, 1500)
          }
        })
      }
      return
    }

    // Link click handling
    const link = target.closest('a.md-link') as HTMLAnchorElement | null
    if (link) {
      e.preventDefault()
      const href = link.getAttribute('href') || ''
      const linkType = link.getAttribute('data-link-type')

      if (linkType === 'external') {
        window.open(href, '_blank', 'noopener,noreferrer')
      } else if (href.startsWith('#')) {
        // Anchor link - scroll to heading
        const targetEl = previewRef.current?.querySelector(href)
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      } else if (onNavigate) {
        onNavigate(href)
      }
      return
    }
  }, [onNavigate])

  // Scroll sync handlers
  const handlePreviewScroll = useCallback(() => {
    if (!scrollSync || isSyncing.current || !sourceRef.current || !previewRef.current) return
    isSyncing.current = true
    const preview = previewRef.current
    const source = sourceRef.current
    const ratio = preview.scrollTop / (preview.scrollHeight - preview.clientHeight || 1)
    source.scrollTop = ratio * (source.scrollHeight - source.clientHeight)
    requestAnimationFrame(() => { isSyncing.current = false })
  }, [scrollSync])

  const handleSourceScroll = useCallback(() => {
    if (!scrollSync || isSyncing.current || !sourceRef.current || !previewRef.current) return
    isSyncing.current = true
    const source = sourceRef.current
    const preview = previewRef.current
    const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight || 1)
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight)
    requestAnimationFrame(() => { isSyncing.current = false })
  }, [scrollSync])

  // TOC navigation
  const handleTocSelect = useCallback((id: string) => {
    if (previewRef.current) {
      const el = previewRef.current.querySelector(`#${id}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [])

  // Zoom controls
  const zoomIn = useCallback(() => setZoom(z => Math.min(200, z + 10)), [])
  const zoomOut = useCallback(() => setZoom(z => Math.max(50, z - 10)), [])
  const zoomReset = useCallback(() => setZoom(100), [])

  // Export as HTML
  const handleExport = useCallback(() => {
    const htmlContent = generateExportHtml(content, markdownBodyStyles, customCSS)
    const blob = new Blob([htmlContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = frontmatter?.title ? `${frontmatter.title}.html` : 'document.html'
    a.click()
    URL.revokeObjectURL(url)
  }, [content, customCSS, frontmatter])

  // Print
  const handlePrint = useCallback(() => {
    const htmlContent = generateExportHtml(content, markdownBodyStyles, customCSS)
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(htmlContent)
      win.document.close()
      setTimeout(() => win.print(), 250)
    }
  }, [content, customCSS])

  // Refresh (force re-render)
  const [, setRefreshKey] = useState(0)
  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        if (viewMode === 'preview' || viewMode === 'split') {
          e.preventDefault()
          setShowSearch(true)
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '=') {
        e.preventDefault()
        zoomIn()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        zoomOut()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        zoomReset()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [viewMode, zoomIn, zoomOut, zoomReset])

  return (
    <div
      className="markdown-preview-root"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-primary)',
        ...style,
      }}
    >
      {/* Toolbar */}
      <div className="md-toolbar">
        <div className="md-toolbar-group">
          {/* View mode buttons */}
          <div className="md-toolbar-segmented">
            <button
              className={`md-toolbar-seg-btn ${viewMode === 'source' ? 'md-seg-active' : ''}`}
              onClick={() => setViewMode('source')}
              title="Source view"
            >
              <ToolbarIcon d="M5.854 4.854a.5.5 0 10-.708-.708l-3.5 3.5a.5.5 0 000 .708l3.5 3.5a.5.5 0 00.708-.708L2.707 8l3.147-3.146zm4.292 0a.5.5 0 01.708-.708l3.5 3.5a.5.5 0 010 .708l-3.5 3.5a.5.5 0 01-.708-.708L13.293 8l-3.147-3.146z" />
              <span>Source</span>
            </button>
            <button
              className={`md-toolbar-seg-btn ${viewMode === 'split' ? 'md-seg-active' : ''}`}
              onClick={() => setViewMode('split')}
              title="Split view"
            >
              <ToolbarIcon d="M8.5 1.75v12.5a.75.75 0 01-1.5 0V1.75a.75.75 0 011.5 0zM1.75 1A.75.75 0 001 1.75v12.5c0 .414.336.75.75.75h12.5a.75.75 0 00.75-.75V1.75a.75.75 0 00-.75-.75H1.75zM2.5 2.5h11v11h-11v-11z" />
              <span>Split</span>
            </button>
            <button
              className={`md-toolbar-seg-btn ${viewMode === 'preview' ? 'md-seg-active' : ''}`}
              onClick={() => setViewMode('preview')}
              title="Preview"
            >
              <ToolbarIcon d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 010 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.831.88 9.577.43 8.899a1.62 1.62 0 010-1.798c.45-.678 1.367-1.932 2.637-3.023C4.33 2.992 6.019 2 8 2zM1.679 7.932a.12.12 0 000 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 000-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.824.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717zM8 10a2 2 0 110-4 2 2 0 010 4z" />
              <span>Preview</span>
            </button>
          </div>

          <div className="md-toolbar-divider" />

          {/* Scroll sync toggle */}
          {viewMode === 'split' && (
            <button
              className={`md-toolbar-btn ${scrollSync ? 'md-btn-active' : ''}`}
              onClick={() => setScrollSync(!scrollSync)}
              title={scrollSync ? 'Scroll sync on' : 'Scroll sync off'}
            >
              <ToolbarIcon d="M8 0a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V.75A.75.75 0 018 0zm0 12a.75.75 0 01.75.75v2.5a.75.75 0 01-1.5 0v-2.5A.75.75 0 018 12zm4-4a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5A.75.75 0 0112 8zM.75 7.25a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5H.75zM8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />
              <span style={{ fontSize: 11 }}>Sync</span>
            </button>
          )}

          <TocDropdown entries={toc} onSelect={handleTocSelect} />

          {/* Search toggle */}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <button
              className={`md-toolbar-btn ${showSearch ? 'md-btn-active' : ''}`}
              onClick={() => setShowSearch(!showSearch)}
              title="Search in preview (Ctrl+F)"
            >
              <ToolbarIcon d="M11.5 7a4.499 4.499 0 11-8.998 0A4.499 4.499 0 0111.5 7zm-.82 4.74a6 6 0 111.06-1.06l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04z" />
            </button>
          )}
        </div>

        <div className="md-toolbar-group">
          {/* Stats */}
          <span className="md-toolbar-stats">
            {stats.words} words &middot; {stats.lines} lines &middot; ~{stats.readTime} min read
          </span>

          <div className="md-toolbar-divider" />

          {/* Zoom controls */}
          <div className="md-zoom-controls">
            <button className="md-toolbar-btn" onClick={zoomOut} title="Zoom out (Ctrl+-)">
              <ToolbarIcon d="M2 7.75A.75.75 0 012.75 7h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 7.75z" />
            </button>
            <button
              className="md-zoom-label"
              onClick={zoomReset}
              title="Reset zoom (Ctrl+0)"
            >
              {zoom}%
            </button>
            <button className="md-toolbar-btn" onClick={zoomIn} title="Zoom in (Ctrl+=)">
              <ToolbarIcon d="M7.75 2a.75.75 0 01.75.75V7h4.25a.75.75 0 010 1.5H8.5v4.25a.75.75 0 01-1.5 0V8.5H2.75a.75.75 0 010-1.5H7V2.75A.75.75 0 017.75 2z" />
            </button>
          </div>

          <div className="md-toolbar-divider" />

          {/* Refresh */}
          <button className="md-toolbar-btn" onClick={handleRefresh} title="Refresh preview">
            <ToolbarIcon d="M1.705 8.005a.75.75 0 01.834.656 5.5 5.5 0 009.592 2.97l-1.204-1.204a.25.25 0 01.177-.427h3.646a.25.25 0 01.25.25v3.646a.25.25 0 01-.427.177l-1.38-1.38A7.002 7.002 0 011.05 8.84a.75.75 0 01.656-.834zM8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.002 7.002 0 0114.95 7.16a.75.75 0 01-1.49.178A5.5 5.5 0 008 2.5z" />
          </button>

          {/* Export */}
          <button className="md-toolbar-btn" onClick={handleExport} title="Export as HTML">
            <ToolbarIcon d="M3.5 1.75a.25.25 0 01.25-.25h3.168a.75.75 0 01.536.222l5.293 5.293a.25.25 0 01.073.177v7.063a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25V4.664a.75.75 0 01.536-.222L3.5 1.75zM3.75 0A1.75 1.75 0 002 1.75v12.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 14.25V7.5a.75.75 0 00-.22-.53l-5.5-5.5A.75.75 0 007.75 1.25H3.75zM7 5a.75.75 0 01.75.75v1.5h1.5a.75.75 0 010 1.5h-1.5v1.5a.75.75 0 01-1.5 0v-1.5h-1.5a.75.75 0 010-1.5h1.5v-1.5A.75.75 0 017 5z" />
          </button>

          {/* Print */}
          <button className="md-toolbar-btn" onClick={handlePrint} title="Print">
            <ToolbarIcon d="M5 1v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h4a1 1 0 001-1v-1h1a2 2 0 002-2V6a2 2 0 00-2-2h-1V1a1 1 0 00-1-1H6a1 1 0 00-1 1zm1.5.5h3v2h-3v-2zm3 10h-3v-1h3v1zM4 5.5h8a.5.5 0 01.5.5v5a.5.5 0 01-.5.5h-1v-1a1 1 0 00-1-1H6a1 1 0 00-1 1v1H4a.5.5 0 01-.5-.5V6a.5.5 0 01.5-.5z" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (viewMode === 'preview' || viewMode === 'split') && (
        <SearchBar previewRef={previewRef} onClose={() => setShowSearch(false)} />
      )}

      {/* Content Area */}
      <div className="md-content-area" style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Source Panel */}
        {(viewMode === 'source' || viewMode === 'split') && (
          <div className="md-source-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {viewMode === 'split' && (
              <div className="md-panel-label">SOURCE</div>
            )}
            <textarea
              ref={sourceRef}
              className="md-source-editor"
              value={content}
              readOnly
              onScroll={handleSourceScroll}
              spellCheck={false}
            />
          </div>
        )}

        {/* Split divider */}
        {viewMode === 'split' && (
          <div className="md-split-divider" />
        )}

        {/* Preview Panel */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {viewMode === 'split' && (
              <div className="md-panel-label">PREVIEW</div>
            )}
            <div
              ref={previewRef}
              className="markdown-preview"
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px 32px',
                color: 'var(--text-primary)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: 14 * (zoom / 100),
                lineHeight: 1.7,
                maxWidth: viewMode === 'split' ? '100%' : 900,
                transformOrigin: 'top left',
              }}
              onClick={handleClick}
              onScroll={handlePreviewScroll}
            >
              {/* Frontmatter display */}
              {frontmatter && <FrontmatterPanel data={frontmatter} />}
              {/* Rendered markdown */}
              <div dangerouslySetInnerHTML={{ __html: html }} />
              {/* Custom CSS injection */}
              {customCSS && <style dangerouslySetInnerHTML={{ __html: customCSS }} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Body Styles (used in export and preview) ────────────────────────────────

const markdownBodyStyles = `
/* Headings - GitHub style */
.markdown-preview .md-h1 { font-size: 2em; font-weight: 700; margin: 24px 0 16px; padding-bottom: 0.3em; border-bottom: 2px solid var(--border); line-height: 1.25; letter-spacing: -0.02em; }
.markdown-preview .md-h2 { font-size: 1.5em; font-weight: 600; margin: 24px 0 16px; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); line-height: 1.25; }
.markdown-preview .md-h3 { font-size: 1.25em; font-weight: 600; margin: 24px 0 16px; line-height: 1.25; }
.markdown-preview .md-h4 { font-size: 1em; font-weight: 600; margin: 24px 0 16px; line-height: 1.25; }
.markdown-preview .md-h5 { font-size: 0.875em; font-weight: 600; margin: 24px 0 16px; line-height: 1.25; text-transform: uppercase; letter-spacing: 0.04em; }
.markdown-preview .md-h6 { font-size: 0.85em; font-weight: 600; margin: 24px 0 16px; color: var(--text-muted); line-height: 1.25; text-transform: uppercase; letter-spacing: 0.04em; }

/* Heading hover anchor */
.markdown-preview [id^="heading-"] { position: relative; scroll-margin-top: 16px; }
.markdown-preview [id^="heading-"]:hover::before {
  content: '#';
  position: absolute;
  left: -1.2em;
  color: var(--accent-blue, #388bfd);
  opacity: 0.5;
  font-weight: 400;
}

/* Paragraphs */
.markdown-preview .md-p { margin: 0 0 16px; }

/* Code block wrapper */
.markdown-preview .md-code-wrapper {
  position: relative;
  margin: 16px 0;
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
  background: var(--bg-tertiary);
}
.markdown-preview .md-code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: rgba(255,255,255,0.03);
  border-bottom: 1px solid var(--border);
  min-height: 32px;
}
.markdown-preview .md-code-lang {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
}
.markdown-preview .md-code-copy {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
}
.markdown-preview .md-code-wrapper:hover .md-code-copy {
  opacity: 1;
}
.markdown-preview .md-code-copy:hover {
  color: var(--text-primary);
  background: rgba(255,255,255,0.08);
  border-color: var(--text-muted);
}
.markdown-preview .md-code-block {
  background: transparent;
  border-radius: 0;
  padding: 16px 0 16px 0;
  margin: 0;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  border: none;
  counter-reset: line;
}

/* Line numbers in code blocks */
.markdown-preview .md-code-line {
  display: block;
  padding: 0 16px 0 0;
}
.markdown-preview .md-code-line:hover {
  background: rgba(255,255,255,0.04);
}
.markdown-preview .md-code-ln {
  display: inline-block;
  width: 3em;
  text-align: right;
  padding-right: 1em;
  margin-right: 0.5em;
  color: var(--text-muted);
  opacity: 0.4;
  user-select: none;
  font-size: 12px;
  border-right: 1px solid var(--border);
}

/* Syntax highlighting */
.markdown-preview .md-hl-keyword { color: var(--md-hl-keyword, #ff7b72); font-weight: 500; }
.markdown-preview .md-hl-string { color: var(--md-hl-string, #a5d6ff); }
.markdown-preview .md-hl-comment { color: var(--md-hl-comment, #8b949e); font-style: italic; }
.markdown-preview .md-hl-number { color: var(--md-hl-number, #79c0ff); }
.markdown-preview .md-hl-function { color: var(--md-hl-function, #d2a8ff); }
.markdown-preview .md-hl-decorator { color: var(--md-hl-decorator, #ffa657); }

/* Inline code */
.markdown-preview .md-inline-code {
  background: rgba(110,118,129,0.25);
  padding: 0.2em 0.4em;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 85%;
  border: 1px solid rgba(110,118,129,0.15);
}

/* Blockquotes - GitHub style */
.markdown-preview .md-blockquote {
  border-left: 4px solid var(--accent-blue, #388bfd);
  padding: 8px 16px;
  margin: 0 0 16px;
  color: var(--text-secondary);
  background: rgba(88,166,255,0.04);
  border-radius: 0 6px 6px 0;
}
.markdown-preview .md-blockquote p { margin: 0; }

/* Links */
.markdown-preview .md-link {
  color: var(--accent-blue, #388bfd);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s ease;
  cursor: pointer;
}
.markdown-preview .md-link:hover {
  text-decoration: underline;
  border-bottom-color: var(--accent-blue, #388bfd);
}
.markdown-preview .md-link[data-link-type="external"]::after {
  content: '';
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-left: 3px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 16 16' fill='%23388bfd'%3E%3Cpath d='M3.75 2h3.5a.75.75 0 010 1.5h-3.5a.25.25 0 00-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25v-3.5a.75.75 0 011.5 0v3.5A1.75 1.75 0 0112.25 14h-8.5A1.75 1.75 0 012 12.25v-8.5C2 2.784 2.784 2 3.75 2zm6.854-1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.751.751 0 01-1.042-.018.751.751 0 01-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  vertical-align: middle;
  opacity: 0.6;
}

/* Horizontal rules */
.markdown-preview .md-hr {
  border: none;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--border), transparent);
  margin: 24px 0;
  border-radius: 2px;
}

/* Lists */
.markdown-preview .md-ul, .markdown-preview .md-ol { padding-left: 2em; margin: 0 0 16px; }
.markdown-preview .md-li, .markdown-preview .md-oli { margin: 4px 0; padding-left: 4px; }
.markdown-preview .md-li::marker { color: var(--text-muted); }
.markdown-preview .md-oli::marker { color: var(--text-muted); font-weight: 500; }

/* Task list items */
.markdown-preview .md-task-li {
  list-style: none;
  margin-left: -1.5em;
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
.markdown-preview .md-checkbox {
  margin: 4px 6px 0 0;
  width: 14px;
  height: 14px;
  accent-color: var(--accent-blue, #388bfd);
  flex-shrink: 0;
}
.markdown-preview .md-task-li:has(input:checked) span {
  text-decoration: line-through;
  color: var(--text-muted);
}

/* Images */
.markdown-preview .md-image-container {
  margin: 16px 0;
}
.markdown-preview .md-image {
  max-width: 100%;
  border-radius: 8px;
  display: block;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  transition: box-shadow 0.2s ease;
}
.markdown-preview .md-image:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}
.markdown-preview .md-image-placeholder {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 24px;
  border: 2px dashed var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 13px;
  background: var(--bg-tertiary);
}

/* Strikethrough */
.markdown-preview .md-del { text-decoration: line-through; color: var(--text-muted); }

/* Highlight */
.markdown-preview .md-mark {
  background: rgba(255, 213, 79, 0.25);
  color: inherit;
  padding: 0.1em 0.3em;
  border-radius: 3px;
}

/* Tables - GitHub style with striped rows */
.markdown-preview .md-table-wrapper {
  overflow-x: auto;
  margin: 16px 0;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.markdown-preview .md-table {
  border-collapse: collapse;
  width: 100%;
  border: none;
}
.markdown-preview .md-th {
  padding: 10px 16px;
  border-bottom: 2px solid var(--border);
  background: var(--bg-tertiary);
  font-weight: 600;
  text-align: left;
  font-size: 13px;
  white-space: nowrap;
}
.markdown-preview .md-td {
  padding: 8px 16px;
  border-top: 1px solid var(--border);
  font-size: 13px;
}
.markdown-preview .md-tr-striped {
  background: rgba(255,255,255,0.02);
}
.markdown-preview .md-table tr:hover td {
  background: rgba(255,255,255,0.04);
}

/* Definition lists */
.markdown-preview .md-dl { margin: 0 0 16px; }
.markdown-preview .md-dt { font-weight: 600; margin-top: 8px; }
.markdown-preview .md-dd { margin-left: 2em; color: var(--text-secondary); }

/* Math - KaTeX-like rendering */
.markdown-preview .md-math-block {
  margin: 16px 0;
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
  background: var(--bg-tertiary);
}
.markdown-preview .md-math-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  width: 100%;
  box-sizing: border-box;
  background: rgba(255,255,255,0.03);
}
.markdown-preview .md-math-icon {
  font-size: 14px;
  color: var(--accent-blue, #388bfd);
}
.markdown-preview .md-math-content {
  font-family: 'Latin Modern Math', 'STIX Two Math', 'Cambria Math', 'Times New Roman', var(--font-mono);
  font-size: 16px;
  padding: 20px 24px;
  margin: 0;
  overflow-x: auto;
  color: var(--text-primary);
  line-height: 1.8;
  text-align: center;
  letter-spacing: 0.02em;
}
.markdown-preview .md-math-content code {
  font-family: inherit;
  font-size: inherit;
  background: none;
  border: none;
  padding: 0;
}
.markdown-preview .md-math-inline {
  font-family: 'Latin Modern Math', 'STIX Two Math', 'Cambria Math', 'Times New Roman', var(--font-mono);
  font-size: 95%;
  background: rgba(110,118,129,0.12);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  color: var(--accent-blue, #79c0ff);
  border: 1px solid rgba(110,118,129,0.1);
}

/* Mermaid rendered diagrams */
.markdown-preview .md-mermaid-rendered {
  margin: 16px 0;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  overflow-x: auto;
  text-align: center;
}

/* Mermaid placeholder fallback */
.markdown-preview .md-mermaid-placeholder {
  margin: 16px 0;
  border-radius: 8px;
  border: 1px dashed var(--border);
  overflow: hidden;
  background: var(--bg-tertiary);
}
.markdown-preview .md-mermaid-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--text-muted);
  background: rgba(255,255,255,0.03);
  border-bottom: 1px dashed var(--border);
}
.markdown-preview .md-mermaid-icon {
  margin-right: 4px;
  color: var(--accent-blue, #388bfd);
}
.markdown-preview .md-mermaid-badge {
  margin-left: auto;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(88,166,255,0.12);
  color: var(--accent-blue, #388bfd);
  font-weight: 600;
}
.markdown-preview .md-mermaid-code {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 12px 16px;
  margin: 0;
  overflow-x: auto;
  color: var(--text-muted);
  line-height: 1.5;
  max-height: 200px;
  overflow-y: auto;
}

/* Frontmatter panel */
.markdown-preview .md-frontmatter {
  margin: 0 0 20px;
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
  background: var(--bg-tertiary);
}
.markdown-preview .md-frontmatter-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: rgba(255,255,255,0.03);
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
  transition: background 0.12s;
}
.markdown-preview .md-frontmatter-toggle:hover {
  background: rgba(255,255,255,0.06);
}
.markdown-preview .md-frontmatter-title {
  font-weight: 600;
}
.markdown-preview .md-frontmatter-count {
  margin-left: auto;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: rgba(88,166,255,0.12);
  color: var(--accent-blue, #388bfd);
}
.markdown-preview .md-frontmatter-table {
  width: 100%;
  border-collapse: collapse;
}
.markdown-preview .md-fm-key {
  padding: 6px 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--accent-blue, #79c0ff);
  font-weight: 500;
  white-space: nowrap;
  width: 1%;
  border-bottom: 1px solid rgba(62,62,66,0.5);
  vertical-align: top;
}
.markdown-preview .md-fm-value {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid rgba(62,62,66,0.5);
  word-break: break-word;
}

/* Footnotes */
.markdown-preview .md-footnotes {
  margin-top: 32px;
  font-size: 0.875em;
  color: var(--text-secondary);
}
.markdown-preview .md-footnote-list {
  padding-left: 1.5em;
  margin: 12px 0 0;
}
.markdown-preview .md-footnote-item {
  margin: 6px 0;
  line-height: 1.5;
}
.markdown-preview .md-footnote-ref a {
  color: var(--accent-blue, #388bfd);
  text-decoration: none;
  font-size: 0.8em;
  font-weight: 600;
}
.markdown-preview .md-footnote-ref a:hover { text-decoration: underline; }
.markdown-preview .md-footnote-backref {
  color: var(--accent-blue, #388bfd);
  text-decoration: none;
  margin-left: 4px;
  font-size: 0.9em;
}
.markdown-preview .md-footnote-backref:hover { text-decoration: underline; }

/* Search highlight */
.markdown-preview mark.md-search-highlight {
  background: rgba(255,213,79,0.35);
  color: inherit;
  padding: 1px 0;
  border-radius: 2px;
}

/* General typography */
.markdown-preview strong { font-weight: 600; }
.markdown-preview em { font-style: italic; }

/* Smooth scrollbar */
.markdown-preview::-webkit-scrollbar { width: 8px; }
.markdown-preview::-webkit-scrollbar-track { background: transparent; }
.markdown-preview::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
.markdown-preview::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
`

// ─── Exported Styles ─────────────────────────────────────────────────────────

export const markdownPreviewStyles = `
${markdownBodyStyles}

/* Toolbar */
.md-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  min-height: 36px;
  gap: 8px;
  flex-shrink: 0;
}
.md-toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.md-toolbar-divider {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 4px;
  flex-shrink: 0;
}
.md-toolbar-stats {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  padding: 0 4px;
}

/* Toolbar buttons */
.md-toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
  font-family: inherit;
}
.md-toolbar-btn:hover {
  color: var(--text-primary);
  background: rgba(255,255,255,0.06);
  border-color: var(--border);
}
.md-toolbar-btn.md-btn-active {
  color: var(--accent-blue, #388bfd);
  background: rgba(56,139,253,0.1);
  border-color: rgba(56,139,253,0.3);
}

/* Segmented control for view mode */
.md-toolbar-segmented {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-tertiary);
}
.md-toolbar-seg-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
  font-family: inherit;
  border-right: 1px solid var(--border);
}
.md-toolbar-seg-btn:last-child { border-right: none; }
.md-toolbar-seg-btn:hover {
  color: var(--text-primary);
  background: rgba(255,255,255,0.04);
}
.md-toolbar-seg-btn.md-seg-active {
  color: var(--text-primary);
  background: rgba(255,255,255,0.08);
  font-weight: 500;
}

/* Zoom controls */
.md-zoom-controls {
  display: flex;
  align-items: center;
  gap: 0;
}
.md-zoom-label {
  font-size: 11px;
  color: var(--text-muted);
  background: transparent;
  border: none;
  padding: 3px 4px;
  cursor: pointer;
  font-family: var(--font-mono);
  min-width: 36px;
  text-align: center;
  transition: color 0.12s;
}
.md-zoom-label:hover {
  color: var(--text-primary);
}

/* Search bar */
.md-search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.md-search-input {
  flex: 1;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 3px 8px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  min-width: 120px;
  max-width: 300px;
  transition: border-color 0.15s;
}
.md-search-input:focus {
  border-color: var(--accent-blue, #388bfd);
}
.md-search-input::placeholder {
  color: var(--text-muted);
}
.md-search-count {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  white-space: nowrap;
  min-width: 32px;
  text-align: center;
}
.md-search-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.12s;
  flex-shrink: 0;
}
.md-search-nav-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: rgba(255,255,255,0.06);
  border-color: var(--border);
}
.md-search-nav-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

/* TOC dropdown */
.md-toc-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 260px;
  max-width: 380px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  z-index: 100;
  padding: 4px 0;
}
.md-toc-title {
  padding: 8px 12px 6px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
}
.md-toc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
  font-family: inherit;
}
.md-toc-item:hover {
  background: rgba(255,255,255,0.06);
  color: var(--text-primary);
}
.md-toc-level {
  font-size: 9px;
  font-weight: 700;
  color: var(--text-muted);
  opacity: 0.6;
  min-width: 18px;
  text-align: center;
  flex-shrink: 0;
  text-transform: uppercase;
}
.md-toc-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-toc-dropdown::-webkit-scrollbar { width: 6px; }
.md-toc-dropdown::-webkit-scrollbar-track { background: transparent; }
.md-toc-dropdown::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

/* Panel label */
.md-panel-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-muted);
  padding: 4px 12px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  flex-shrink: 0;
}

/* Source editor */
.md-source-editor {
  flex: 1;
  width: 100%;
  padding: 16px 20px;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: none;
  outline: none;
  resize: none;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  tab-size: 2;
  box-sizing: border-box;
  overflow: auto;
}
.md-source-editor::-webkit-scrollbar { width: 8px; }
.md-source-editor::-webkit-scrollbar-track { background: transparent; }
.md-source-editor::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

/* Split divider */
.md-split-divider {
  width: 1px;
  background: var(--border);
  flex-shrink: 0;
  position: relative;
}
.md-split-divider::after {
  content: '';
  position: absolute;
  top: 0;
  left: -3px;
  width: 7px;
  height: 100%;
  cursor: col-resize;
}

/* Content area */
.md-content-area {
  background: var(--bg-primary);
}

/* Print styles */
@media print {
  .md-toolbar { display: none !important; }
  .md-search-bar { display: none !important; }
  .markdown-preview { max-width: 100% !important; font-size: 12pt !important; }
  .markdown-preview .md-code-copy { display: none !important; }
  .markdown-preview .md-frontmatter-toggle { background: #f5f5f5 !important; color: #333 !important; }
  .markdown-preview .md-frontmatter { border-color: #ddd !important; }
  .markdown-preview .md-code-wrapper { border-color: #ddd !important; break-inside: avoid; }
  .markdown-preview .md-table-wrapper { break-inside: avoid; }
  .markdown-preview .md-image { break-inside: avoid; max-width: 100% !important; }
  .markdown-preview .md-blockquote { border-left-color: #999 !important; background: #f9f9f9 !important; }
  .markdown-preview .md-mermaid-rendered { break-inside: avoid; }
  .markdown-preview .md-h1, .markdown-preview .md-h2, .markdown-preview .md-h3 { break-after: avoid; }
}

/* Selection styling */
.markdown-preview ::selection {
  background: rgba(56,139,253,0.3);
}

/* Light theme overrides (when body/root has data-theme="light") */
[data-theme-type="light"] .markdown-preview .md-code-wrapper { background: #f6f8fa; }
[data-theme-type="light"] .markdown-preview .md-code-copy:hover { background: rgba(0,0,0,0.06); }
[data-theme-type="light"] .markdown-preview .md-code-line:hover { background: rgba(0,0,0,0.03); }
[data-theme-type="light"] .markdown-preview .md-blockquote { background: rgba(88,166,255,0.06); }
[data-theme-type="light"] .markdown-preview .md-inline-code { background: rgba(175,184,193,0.2); border-color: rgba(175,184,193,0.2); }
[data-theme-type="light"] .markdown-preview .md-tr-striped { background: rgba(0,0,0,0.02); }
[data-theme-type="light"] .markdown-preview .md-table tr:hover td { background: rgba(0,0,0,0.04); }
[data-theme-type="light"] .markdown-preview .md-math-block { background: #f6f8fa; }
[data-theme-type="light"] .markdown-preview .md-mermaid-rendered { background: #f6f8fa; }
[data-theme-type="light"] .markdown-preview .md-frontmatter { background: #f6f8fa; }
[data-theme-type="light"] .markdown-preview .md-mark { background: rgba(255,213,79,0.4); }
[data-theme-type="light"] .markdown-preview .md-image { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
[data-theme-type="light"] .markdown-preview .md-image:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
[data-theme-type="light"] .md-search-input { background: #fff; }
[data-theme-type="light"] .md-toolbar { background: #f0f0f0; }
[data-theme-type="light"] .md-toolbar-segmented { background: #e8e8e8; }
[data-theme-type="light"] .md-toolbar-seg-btn:hover { background: rgba(0,0,0,0.04); }
[data-theme-type="light"] .md-toolbar-seg-btn.md-seg-active { background: rgba(0,0,0,0.08); }
[data-theme-type="light"] .md-toolbar-btn:hover { background: rgba(0,0,0,0.06); }
[data-theme-type="light"] .md-toc-dropdown { background: #f0f0f0; }
[data-theme-type="light"] .md-toc-item:hover { background: rgba(0,0,0,0.06); }
`
