export interface ParsedCodeBlock {
  id: string
  language: string
  code: string
  filePath?: string
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const CODE_BLOCK_SENTINEL = '\x00'
const ALLOWED_SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

export function safeHref(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return '#'

  const normalized = trimmed.toLowerCase()
  if (normalized.startsWith('#') || normalized.startsWith('/') || normalized.startsWith('./') || normalized.startsWith('../') || normalized.startsWith('?')) {
    return trimmed
  }

  const schemeMatch = normalized.match(/^[a-z][a-z0-9+.-]*:/)
  if (!schemeMatch) return trimmed

  let effectiveScheme = schemeMatch[0]
  try {
    effectiveScheme = decodeURIComponent(normalized).match(/^[a-z][a-z0-9+.-]*:/)?.[0] ?? schemeMatch[0]
  } catch {
    effectiveScheme = schemeMatch[0]
  }

  if (
    effectiveScheme === 'javascript:'
    || effectiveScheme === 'vbscript:'
    || effectiveScheme === 'data:'
    || effectiveScheme === 'file:'
  ) {
    return '#'
  }

  if (!ALLOWED_SAFE_LINK_PROTOCOLS.has(effectiveScheme)) return '#'

  return trimmed
}

export function parseMarkdown(content: string): { html: string; codeBlocks: ParsedCodeBlock[] } {
  const codeBlocks: ParsedCodeBlock[] = []
  let blockIndex = 0

  let processed = content.replace(/(```|~~~)([ \t]*([^\n`~]*))\n([\s\S]*?)\1/g, (_match, _fence: string, _langSpec: string, lang: string, code: string) => {
    const id = `code-block-${blockIndex++}`
    const language = (lang || '').trim().split(/\s+/)[0] || 'text'
    codeBlocks.push({ id, language, code: code.trimEnd(), filePath: undefined })
    return `${CODE_BLOCK_SENTINEL}CODE_BLOCK_${id}${CODE_BLOCK_SENTINEL}`
  })

  processed = escapeHtml(processed)

  processed = processed.replace(/`([^`]+)`/g, '<code style="background:var(--orion-chat-code-bg,rgba(255,255,255,0.08));padding:1px 5px;border-radius:3px;font-size:0.88em;font-family:var(--orion-chat-mono,\'Cascadia Code\',\'Fira Code\',monospace)">$1</code>')
  processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>')
  processed = processed.replace(/~~(.+?)~~/g, '<del>$1</del>')
  processed = processed.replace(/^### (.+)$/gm, '<h4 style="margin:12px 0 4px;font-size:0.95em;font-weight:600">$1</h4>')
  processed = processed.replace(/^## (.+)$/gm, '<h3 style="margin:12px 0 4px;font-size:1.05em;font-weight:600">$1</h3>')
  processed = processed.replace(/^# (.+)$/gm, '<h2 style="margin:12px 0 6px;font-size:1.15em;font-weight:600">$1</h2>')
  processed = processed.replace(/^[-*] (.+)$/gm, '<li style="margin-left:16px;list-style:disc;margin-bottom:2px">$1</li>')
  processed = processed.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:16px;list-style:decimal;margin-bottom:2px">$1</li>')
  processed = processed.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid var(--orion-chat-accent,#8b5cf6);padding-left:10px;margin:6px 0;opacity:0.85">$1</blockquote>')
  processed = processed.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--orion-chat-border,rgba(255,255,255,0.1));margin:10px 0">')
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text: string, href: string) =>
    `<a href="${safeHref(href)}" style="color:var(--orion-chat-link,#58a6ff);text-decoration:none" target="_blank" rel="noopener">${text}</a>`
  )
  processed = processed.replace(/\n\n/g, '</p><p style="margin:6px 0">')
  processed = processed.replace(/\n/g, '<br>')

  const html = `<p style="margin:6px 0">${processed}</p>`

  return { html, codeBlocks }
}
