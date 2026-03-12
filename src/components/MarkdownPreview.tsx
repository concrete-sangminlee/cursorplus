import { useMemo, useCallback, useRef } from 'react'

interface MarkdownPreviewProps {
  content: string
  style?: React.CSSProperties
}

// Basic syntax highlighting for code blocks
function highlightCode(code: string, lang: string): string {
  // Keywords for common languages
  const jsKeywords = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|static|get|set|null|undefined|true|false|void|delete|super)\b/g
  const pyKeywords = /\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|and|or|not|in|is|None|True|False|self|global|nonlocal|assert|del|print)\b/g
  const tsKeywords = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|static|get|set|null|undefined|true|false|void|delete|super|interface|type|enum|implements|namespace|abstract|declare|readonly|private|protected|public|as|keyof|infer|never|unknown|any)\b/g
  const goKeywords = /\b(func|return|if|else|for|range|switch|case|break|continue|var|const|type|struct|interface|map|chan|go|defer|select|package|import|nil|true|false|make|len|cap|append|copy|delete|new|panic|recover)\b/g
  const rustKeywords = /\b(fn|let|mut|return|if|else|for|while|loop|match|break|continue|struct|enum|impl|trait|pub|use|mod|crate|self|super|where|async|await|move|ref|type|const|static|unsafe|extern|true|false|None|Some|Ok|Err|Self|dyn|Box|Vec|String|Option|Result)\b/g
  const cssKeywords = /\b(color|background|margin|padding|border|display|position|width|height|font|text|align|flex|grid|top|left|right|bottom|overflow|opacity|z-index|transform|transition|animation|none|auto|inherit|initial|solid|dashed|dotted|relative|absolute|fixed|sticky|block|inline|content|important)\b/g

  let keywords: RegExp
  const langLower = lang.toLowerCase()
  if (['js', 'javascript', 'jsx'].includes(langLower)) keywords = jsKeywords
  else if (['ts', 'typescript', 'tsx'].includes(langLower)) keywords = tsKeywords
  else if (['py', 'python'].includes(langLower)) keywords = pyKeywords
  else if (['go', 'golang'].includes(langLower)) keywords = goKeywords
  else if (['rs', 'rust'].includes(langLower)) keywords = rustKeywords
  else if (['css', 'scss', 'less'].includes(langLower)) keywords = cssKeywords
  else keywords = jsKeywords // fallback

  let highlighted = code

  // Protect strings first - replace with placeholders
  const strings: string[] = []
  highlighted = highlighted.replace(/(["'`])(?:(?!\1|\\).|\\.)*?\1/g, (match) => {
    strings.push(match)
    return `__STR_${strings.length - 1}__`
  })

  // Protect comments - replace with placeholders
  const comments: string[] = []
  highlighted = highlighted.replace(/\/\/.*$/gm, (match) => {
    comments.push(match)
    return `__CMT_${comments.length - 1}__`
  })
  highlighted = highlighted.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    comments.push(match)
    return `__CMT_${comments.length - 1}__`
  })
  highlighted = highlighted.replace(/#.*$/gm, (match) => {
    // Only treat as comment for python/shell-like languages
    if (['py', 'python', 'sh', 'bash', 'shell', 'yaml', 'yml', 'toml', 'ruby', 'rb'].includes(langLower)) {
      comments.push(match)
      return `__CMT_${comments.length - 1}__`
    }
    return match
  })

  // Numbers
  highlighted = highlighted.replace(/\b(\d+\.?\d*)\b/g, '<span class="md-hl-number">$1</span>')

  // Keywords
  highlighted = highlighted.replace(keywords, '<span class="md-hl-keyword">$1</span>')

  // Restore comments with highlighting
  comments.forEach((c, i) => {
    highlighted = highlighted.replace(`__CMT_${i}__`, `<span class="md-hl-comment">${c}</span>`)
  })

  // Restore strings with highlighting
  strings.forEach((s, i) => {
    highlighted = highlighted.replace(`__STR_${i}__`, `<span class="md-hl-string">${s}</span>`)
  })

  return highlighted
}

// Simple but effective markdown renderer
function parseMarkdown(md: string): string {
  let html = md

  // Escape HTML
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Collect footnote definitions [^id]: text
  const footnotes: Record<string, string> = {}
  html = html.replace(/^\[\^(\w+)\]:\s+(.+)$/gm, (_, id, text) => {
    footnotes[id] = text
    return `__FOOTNOTE_DEF_${id}__`
  })

  // Mermaid code blocks - must be before generic code blocks
  html = html.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    return `<div class="md-mermaid-placeholder"><div class="md-mermaid-header"><span class="md-mermaid-icon">&#9672;</span> Mermaid diagram &mdash; preview not available</div><pre class="md-mermaid-code"><code>${code.trim()}</code></pre></div>`
  })

  // Code blocks (```lang\n...\n```) with syntax highlighting, copy button, and language label
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const trimmed = code.trim()
    const highlighted = lang ? highlightCode(trimmed, lang) : trimmed
    const langLabel = lang ? `<span class="md-code-lang">${lang}</span>` : ''
    const copyBtn = `<button class="md-code-copy">Copy</button>`
    return `<div class="md-code-wrapper"><div class="md-code-header">${langLabel}${copyBtn}</div><pre class="md-code-block"><code class="language-${lang}">${highlighted}</code></pre></div>`
  })

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6 class="md-h6">$1</h6>')
  html = html.replace(/^#####\s+(.+)$/gm, '<h5 class="md-h5">$1</h5>')
  html = html.replace(/^####\s+(.+)$/gm, '<h4 class="md-h4">$1</h4>')
  html = html.replace(/^###\s+(.+)$/gm, '<h3 class="md-h3">$1</h3>')
  html = html.replace(/^##\s+(.+)$/gm, '<h2 class="md-h2">$1</h2>')
  html = html.replace(/^#\s+(.+)$/gm, '<h1 class="md-h1">$1</h1>')

  // Display math blocks $$...$$
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    return `<div class="md-math-block"><span class="md-math-label">Math</span><pre class="md-math-content">${math.trim()}</pre></div>`
  })

  // Inline math $...$
  html = html.replace(/\$([^\$\n]+?)\$/g, '<code class="md-math-inline">$1</code>')

  // Bold and Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>')

  // Images (must come before links since image syntax includes link syntax)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="md-image" />')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link">$1</a>')

  // Footnote references [^id]
  html = html.replace(/\[\^(\w+)\]/g, (_, id) => {
    return `<sup class="md-footnote-ref"><a href="#fn-${id}" id="fnref-${id}">[${id}]</a></sup>`
  })

  // Blockquotes (handle consecutive lines)
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote class="md-blockquote"><p>$1</p></blockquote>')
  // Merge adjacent blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote class="md-blockquote">/g, '')

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="md-hr" />')
  html = html.replace(/^\*\*\*$/gm, '<hr class="md-hr" />')
  html = html.replace(/^___$/gm, '<hr class="md-hr" />')

  // Task lists (before general lists)
  html = html.replace(/^[\s]*[-*+]\s+\[x\]\s+(.+)$/gim, '<li class="md-li md-task-li"><input type="checkbox" checked disabled class="md-checkbox" /><span>$1</span></li>')
  html = html.replace(/^[\s]*[-*+]\s+\[ \]\s+(.+)$/gm, '<li class="md-li md-task-li"><input type="checkbox" disabled class="md-checkbox" /><span>$1</span></li>')

  // Unordered lists
  html = html.replace(/^[\s]*[-*+]\s+(.+)$/gm, (match) => {
    // Don't re-wrap task list items
    if (match.includes('md-task-li')) return match
    return match.replace(/^[\s]*[-*+]\s+(.+)$/gm, '<li class="md-li">$1</li>')
  })
  html = html.replace(/(<li class="md-li[^"]*">.*<\/li>\n?)+/g, '<ul class="md-ul">$&</ul>')

  // Ordered lists
  html = html.replace(/^[\s]*\d+\.\s+(.+)$/gm, '<li class="md-oli">$1</li>')
  html = html.replace(/(<li class="md-oli">.*<\/li>\n?)+/g, '<ol class="md-ol">$&</ol>')

  // Tables with striped rows
  const tableRegex = /^\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/gm
  html = html.replace(tableRegex, (_, header, rows) => {
    const headers = header.split('|').map((h: string) => `<th class="md-th">${h.trim()}</th>`).join('')
    const rowsHtml = rows.trim().split('\n').map((row: string, idx: number) => {
      const cells = row.replace(/^\||\|$/g, '').split('|').map((c: string) => `<td class="md-td">${c.trim()}</td>`).join('')
      return `<tr class="${idx % 2 === 1 ? 'md-tr-striped' : ''}">${cells}</tr>`
    }).join('')
    return `<div class="md-table-wrapper"><table class="md-table"><thead><tr>${headers}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`
  })

  // Build footnotes section if any were found
  const footnoteIds = Object.keys(footnotes)
  if (footnoteIds.length > 0) {
    // Remove footnote definition placeholders
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

export default function MarkdownPreview({ content, style }: MarkdownPreviewProps) {
  const html = useMemo(() => parseMarkdown(content), [content])
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle copy button clicks via event delegation (safer than inline onclick)
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('md-code-copy')) {
      const wrapper = target.closest('.md-code-wrapper')
      const codeEl = wrapper?.querySelector('code')
      if (codeEl) {
        navigator.clipboard.writeText(codeEl.textContent || '').then(() => {
          target.textContent = 'Copied!'
          setTimeout(() => { target.textContent = 'Copy' }, 1500)
        })
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="markdown-preview"
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '24px 32px',
        color: 'var(--text-primary)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 14,
        lineHeight: 1.7,
        maxWidth: 900,
        ...style,
      }}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// Styles to inject
export const markdownPreviewStyles = `
/* Headings - GitHub style */
.markdown-preview .md-h1 { font-size: 2em; font-weight: 700; margin: 24px 0 16px; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); line-height: 1.25; }
.markdown-preview .md-h2 { font-size: 1.5em; font-weight: 600; margin: 24px 0 16px; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); line-height: 1.25; }
.markdown-preview .md-h3 { font-size: 1.25em; font-weight: 600; margin: 24px 0 16px; line-height: 1.25; }
.markdown-preview .md-h4 { font-size: 1em; font-weight: 600; margin: 24px 0 16px; line-height: 1.25; }
.markdown-preview .md-h5 { font-size: 0.875em; font-weight: 600; margin: 24px 0 16px; line-height: 1.25; }
.markdown-preview .md-h6 { font-size: 0.85em; font-weight: 600; margin: 24px 0 16px; color: var(--text-muted); line-height: 1.25; }

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
}
.markdown-preview .md-code-copy:hover {
  color: var(--text-primary);
  background: rgba(255,255,255,0.06);
  border-color: var(--text-muted);
}
.markdown-preview .md-code-block {
  background: transparent;
  border-radius: 0;
  padding: 16px;
  margin: 0;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
  border: none;
}

/* Syntax highlighting */
.markdown-preview .md-hl-keyword { color: #ff7b72; }
.markdown-preview .md-hl-string { color: #a5d6ff; }
.markdown-preview .md-hl-comment { color: #8b949e; font-style: italic; }
.markdown-preview .md-hl-number { color: #79c0ff; }

/* Inline code */
.markdown-preview .md-inline-code {
  background: rgba(110,118,129,0.2);
  padding: 0.2em 0.4em;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 85%;
}

/* Blockquotes - GitHub style */
.markdown-preview .md-blockquote {
  border-left: 4px solid var(--accent-blue, #388bfd);
  padding: 8px 16px;
  margin: 0 0 16px;
  color: var(--text-secondary);
  background: rgba(88,166,255,0.04);
  border-radius: 0 6px 6px 0;
  font-style: italic;
}
.markdown-preview .md-blockquote p { margin: 0; }

/* Links */
.markdown-preview .md-link { color: var(--accent-blue, #388bfd); text-decoration: none; }
.markdown-preview .md-link:hover { text-decoration: underline; }

/* Horizontal rules */
.markdown-preview .md-hr {
  border: none;
  height: 3px;
  background: var(--border);
  margin: 24px 0;
  border-radius: 2px;
}

/* Lists */
.markdown-preview .md-ul, .markdown-preview .md-ol { padding-left: 2em; margin: 0 0 16px; }
.markdown-preview .md-li, .markdown-preview .md-oli { margin: 4px 0; }

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

/* Images */
.markdown-preview .md-image {
  max-width: 100%;
  border-radius: 8px;
  margin: 16px 0;
  display: block;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
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

/* Math - placeholder rendering */
.markdown-preview .md-math-block {
  margin: 16px 0;
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
  background: var(--bg-tertiary);
}
.markdown-preview .md-math-label {
  display: inline-block;
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
.markdown-preview .md-math-content {
  font-family: var(--font-mono);
  font-size: 14px;
  padding: 16px;
  margin: 0;
  overflow-x: auto;
  color: var(--text-secondary);
  line-height: 1.6;
}
.markdown-preview .md-math-inline {
  font-family: var(--font-mono);
  font-size: 90%;
  background: rgba(110,118,129,0.15);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  color: var(--accent-blue, #79c0ff);
}

/* Mermaid placeholder */
.markdown-preview .md-mermaid-placeholder {
  margin: 16px 0;
  border-radius: 8px;
  border: 1px dashed var(--border);
  overflow: hidden;
  background: var(--bg-tertiary);
}
.markdown-preview .md-mermaid-header {
  padding: 10px 16px;
  font-size: 13px;
  color: var(--text-muted);
  background: rgba(255,255,255,0.03);
  border-bottom: 1px dashed var(--border);
  font-style: italic;
}
.markdown-preview .md-mermaid-icon {
  margin-right: 6px;
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

/* General typography */
.markdown-preview strong { font-weight: 600; }
.markdown-preview em { font-style: italic; }
.markdown-preview del { text-decoration: line-through; color: var(--text-muted); }

/* Smooth scrollbar */
.markdown-preview::-webkit-scrollbar { width: 8px; }
.markdown-preview::-webkit-scrollbar-track { background: transparent; }
.markdown-preview::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
.markdown-preview::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
`
