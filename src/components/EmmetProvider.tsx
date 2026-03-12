import { useEffect, useRef } from 'react'
import type { Monaco } from '@monaco-editor/react'
import type { languages, IDisposable } from 'monaco-editor'

interface EmmetProviderProps {
  monaco: Monaco | null
}

// ── HTML Tag Abbreviations ──────────────────────────────────────────────────

const SELF_CLOSING_TAGS = new Set([
  'img', 'input', 'br', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed',
  'source', 'track', 'wbr',
])

const HTML_TAGS = [
  'div', 'span', 'p', 'a', 'ul', 'ol', 'li', 'img', 'input', 'button',
  'form', 'label', 'select', 'option', 'textarea',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'footer', 'nav', 'section', 'main', 'article', 'aside',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'strong', 'em', 'br', 'hr', 'pre', 'code', 'blockquote',
  'video', 'audio', 'canvas', 'svg', 'iframe',
]

// ── CSS Abbreviations ───────────────────────────────────────────────────────

const CSS_ABBREVIATIONS: Record<string, { label: string; snippet: string; detail: string }> = {
  // Display
  'd':    { label: 'd',    snippet: 'display: ${1:block};',          detail: 'display: block' },
  'dn':   { label: 'dn',   snippet: 'display: none;',               detail: 'display: none' },
  'df':   { label: 'df',   snippet: 'display: flex;',               detail: 'display: flex' },
  'dif':  { label: 'dif',  snippet: 'display: inline-flex;',        detail: 'display: inline-flex' },
  'db':   { label: 'db',   snippet: 'display: block;',              detail: 'display: block' },
  'dib':  { label: 'dib',  snippet: 'display: inline-block;',       detail: 'display: inline-block' },
  'di':   { label: 'di',   snippet: 'display: inline;',             detail: 'display: inline' },
  'dg':   { label: 'dg',   snippet: 'display: grid;',               detail: 'display: grid' },
  // Flexbox
  'fxd':  { label: 'fxd',  snippet: 'flex-direction: ${1:row};',    detail: 'flex-direction' },
  'fxdc': { label: 'fxdc', snippet: 'flex-direction: column;',      detail: 'flex-direction: column' },
  'fxw':  { label: 'fxw',  snippet: 'flex-wrap: ${1:wrap};',        detail: 'flex-wrap' },
  'ai':   { label: 'ai',   snippet: 'align-items: ${1:center};',    detail: 'align-items' },
  'aic':  { label: 'aic',  snippet: 'align-items: center;',         detail: 'align-items: center' },
  'aifs': { label: 'aifs', snippet: 'align-items: flex-start;',     detail: 'align-items: flex-start' },
  'aife': { label: 'aife', snippet: 'align-items: flex-end;',       detail: 'align-items: flex-end' },
  'jc':   { label: 'jc',   snippet: 'justify-content: ${1:center};',detail: 'justify-content' },
  'jcc':  { label: 'jcc',  snippet: 'justify-content: center;',     detail: 'justify-content: center' },
  'jcsb': { label: 'jcsb', snippet: 'justify-content: space-between;', detail: 'justify-content: space-between' },
  'jcsa': { label: 'jcsa', snippet: 'justify-content: space-around;',  detail: 'justify-content: space-around' },
  'jcfs': { label: 'jcfs', snippet: 'justify-content: flex-start;', detail: 'justify-content: flex-start' },
  'jcfe': { label: 'jcfe', snippet: 'justify-content: flex-end;',   detail: 'justify-content: flex-end' },
  'fg':   { label: 'fg',   snippet: 'flex-grow: ${1:1};',           detail: 'flex-grow' },
  'fs':   { label: 'fs',   snippet: 'flex-shrink: ${1:0};',         detail: 'flex-shrink' },
  'fb':   { label: 'fb',   snippet: 'flex-basis: ${1:auto};',       detail: 'flex-basis' },
  'fx':   { label: 'fx',   snippet: 'flex: ${1:1};',                detail: 'flex' },
  'gap':  { label: 'gap',  snippet: 'gap: ${1:8px};',               detail: 'gap' },
  // Position
  'pos':  { label: 'pos',  snippet: 'position: ${1:relative};',     detail: 'position' },
  'poa':  { label: 'poa',  snippet: 'position: absolute;',          detail: 'position: absolute' },
  'por':  { label: 'por',  snippet: 'position: relative;',          detail: 'position: relative' },
  'pof':  { label: 'pof',  snippet: 'position: fixed;',             detail: 'position: fixed' },
  'pos-s':{ label: 'pos-s',snippet: 'position: sticky;',            detail: 'position: sticky' },
  // Top/Right/Bottom/Left
  't':    { label: 't',    snippet: 'top: ${1:0};',                 detail: 'top' },
  'r':    { label: 'r',    snippet: 'right: ${1:0};',               detail: 'right' },
  'b':    { label: 'b',    snippet: 'bottom: ${1:0};',              detail: 'bottom' },
  'l':    { label: 'l',    snippet: 'left: ${1:0};',                detail: 'left' },
  // Sizing
  'w':    { label: 'w',    snippet: 'width: ${1:100%};',            detail: 'width' },
  'h':    { label: 'h',    snippet: 'height: ${1:100%};',           detail: 'height' },
  'mw':   { label: 'mw',   snippet: 'max-width: ${1:100%};',       detail: 'max-width' },
  'mh':   { label: 'mh',   snippet: 'max-height: ${1:100%};',      detail: 'max-height' },
  'miw':  { label: 'miw',  snippet: 'min-width: ${1:0};',           detail: 'min-width' },
  'mih':  { label: 'mih',  snippet: 'min-height: ${1:0};',          detail: 'min-height' },
  // Margin (with numeric patterns handled separately)
  'm':    { label: 'm',    snippet: 'margin: ${1:0};',              detail: 'margin' },
  'mt':   { label: 'mt',   snippet: 'margin-top: ${1:0};',          detail: 'margin-top' },
  'mr':   { label: 'mr',   snippet: 'margin-right: ${1:0};',        detail: 'margin-right' },
  'mb':   { label: 'mb',   snippet: 'margin-bottom: ${1:0};',       detail: 'margin-bottom' },
  'ml':   { label: 'ml',   snippet: 'margin-left: ${1:0};',         detail: 'margin-left' },
  'mx':   { label: 'mx',   snippet: 'margin-left: ${1:0};\nmargin-right: ${1:0};', detail: 'margin-left + margin-right' },
  'my':   { label: 'my',   snippet: 'margin-top: ${1:0};\nmargin-bottom: ${1:0};', detail: 'margin-top + margin-bottom' },
  'ma':   { label: 'ma',   snippet: 'margin: auto;',                detail: 'margin: auto' },
  // Padding
  'p':    { label: 'p',    snippet: 'padding: ${1:0};',             detail: 'padding' },
  'pt':   { label: 'pt',   snippet: 'padding-top: ${1:0};',         detail: 'padding-top' },
  'pr':   { label: 'pr',   snippet: 'padding-right: ${1:0};',       detail: 'padding-right' },
  'pb':   { label: 'pb',   snippet: 'padding-bottom: ${1:0};',      detail: 'padding-bottom' },
  'pl':   { label: 'pl',   snippet: 'padding-left: ${1:0};',        detail: 'padding-left' },
  'px':   { label: 'px',   snippet: 'padding-left: ${1:0};\npadding-right: ${1:0};', detail: 'padding-left + padding-right' },
  'py':   { label: 'py',   snippet: 'padding-top: ${1:0};\npadding-bottom: ${1:0};', detail: 'padding-top + padding-bottom' },
  // Border
  'bd':   { label: 'bd',   snippet: 'border: ${1:1px} ${2:solid} ${3:#000};', detail: 'border' },
  'bdn':  { label: 'bdn',  snippet: 'border: none;',                detail: 'border: none' },
  'br':   { label: 'br',   snippet: 'border-radius: ${1:4px};',     detail: 'border-radius' },
  // Background
  'bg':   { label: 'bg',   snippet: 'background: ${1:#fff};',       detail: 'background' },
  'bgc':  { label: 'bgc',  snippet: 'background-color: ${1:#fff};', detail: 'background-color' },
  // Color / Font
  'c':    { label: 'c',    snippet: 'color: ${1:#000};',            detail: 'color' },
  'fz':   { label: 'fz',   snippet: 'font-size: ${1:14px};',       detail: 'font-size' },
  'fw':   { label: 'fw',   snippet: 'font-weight: ${1:bold};',     detail: 'font-weight' },
  'ff':   { label: 'ff',   snippet: 'font-family: ${1:sans-serif};',detail: 'font-family' },
  'ta':   { label: 'ta',   snippet: 'text-align: ${1:center};',    detail: 'text-align' },
  'tac':  { label: 'tac',  snippet: 'text-align: center;',          detail: 'text-align: center' },
  'tal':  { label: 'tal',  snippet: 'text-align: left;',            detail: 'text-align: left' },
  'tar':  { label: 'tar',  snippet: 'text-align: right;',           detail: 'text-align: right' },
  'td':   { label: 'td',   snippet: 'text-decoration: ${1:none};',  detail: 'text-decoration' },
  'tdn':  { label: 'tdn',  snippet: 'text-decoration: none;',       detail: 'text-decoration: none' },
  'tt':   { label: 'tt',   snippet: 'text-transform: ${1:uppercase};', detail: 'text-transform' },
  'lh':   { label: 'lh',   snippet: 'line-height: ${1:1.5};',      detail: 'line-height' },
  'ls':   { label: 'ls',   snippet: 'letter-spacing: ${1:0.5px};',  detail: 'letter-spacing' },
  // Overflow
  'ov':   { label: 'ov',   snippet: 'overflow: ${1:hidden};',       detail: 'overflow' },
  'ovh':  { label: 'ovh',  snippet: 'overflow: hidden;',            detail: 'overflow: hidden' },
  'ova':  { label: 'ova',  snippet: 'overflow: auto;',              detail: 'overflow: auto' },
  'ovs':  { label: 'ovs',  snippet: 'overflow: scroll;',            detail: 'overflow: scroll' },
  // Z-index / Opacity
  'z':    { label: 'z',    snippet: 'z-index: ${1:1};',             detail: 'z-index' },
  'op':   { label: 'op',   snippet: 'opacity: ${1:1};',             detail: 'opacity' },
  // Cursor
  'cur':  { label: 'cur',  snippet: 'cursor: ${1:pointer};',        detail: 'cursor' },
  'curp': { label: 'curp', snippet: 'cursor: pointer;',             detail: 'cursor: pointer' },
  // Transition / Transform
  'trs':  { label: 'trs',  snippet: 'transition: ${1:all} ${2:0.3s} ${3:ease};', detail: 'transition' },
  'tf':   { label: 'tf',   snippet: 'transform: ${1:none};',        detail: 'transform' },
  // Box shadow
  'bxsh': { label: 'bxsh', snippet: 'box-shadow: ${1:0} ${2:2px} ${3:4px} ${4:rgba(0,0,0,0.1)};', detail: 'box-shadow' },
  'bxshn':{ label: 'bxshn',snippet: 'box-shadow: none;',            detail: 'box-shadow: none' },
  // Box sizing
  'bxz':  { label: 'bxz',  snippet: 'box-sizing: border-box;',     detail: 'box-sizing: border-box' },
}

// ── HTML Snippet Shortcuts ──────────────────────────────────────────────────

const HTML_SNIPPETS: Record<string, { label: string; snippet: string; detail: string }> = {
  '!': {
    label: '!',
    snippet: [
      '<!DOCTYPE html>',
      '<html lang="${1:en}">',
      '<head>',
      '\t<meta charset="UTF-8">',
      '\t<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '\t<title>${2:Document}</title>',
      '</head>',
      '<body>',
      '\t$0',
      '</body>',
      '</html>',
    ].join('\n'),
    detail: 'HTML5 boilerplate',
  },
  'link:css': {
    label: 'link:css',
    snippet: '<link rel="stylesheet" href="${1:style.css}">',
    detail: 'CSS link tag',
  },
  'link:favicon': {
    label: 'link:favicon',
    snippet: '<link rel="shortcut icon" href="${1:favicon.ico}" type="image/x-icon">',
    detail: 'Favicon link tag',
  },
  'script:src': {
    label: 'script:src',
    snippet: '<script src="${1:script.js}"></script>',
    detail: 'Script with src',
  },
  'a:link': {
    label: 'a:link',
    snippet: '<a href="${1:https://}">${2:link}</a>',
    detail: 'Anchor with href',
  },
  'a:mail': {
    label: 'a:mail',
    snippet: '<a href="mailto:${1:}">${2:email}</a>',
    detail: 'Mailto link',
  },
  'img': {
    label: 'img',
    snippet: '<img src="${1:}" alt="${2:}">',
    detail: '<img> with src and alt',
  },
  'input:text': {
    label: 'input:text',
    snippet: '<input type="text" name="${1:}" id="${2:}">',
    detail: 'Text input',
  },
  'input:password': {
    label: 'input:password',
    snippet: '<input type="password" name="${1:}" id="${2:}">',
    detail: 'Password input',
  },
  'input:checkbox': {
    label: 'input:checkbox',
    snippet: '<input type="checkbox" name="${1:}" id="${2:}">',
    detail: 'Checkbox input',
  },
  'input:radio': {
    label: 'input:radio',
    snippet: '<input type="radio" name="${1:}" id="${2:}">',
    detail: 'Radio input',
  },
  'input:submit': {
    label: 'input:submit',
    snippet: '<input type="submit" value="${1:Submit}">',
    detail: 'Submit input',
  },
  'btn': {
    label: 'btn',
    snippet: '<button type="${1:button}">${2:Click me}</button>',
    detail: 'Button element',
  },
  'form:get': {
    label: 'form:get',
    snippet: '<form action="${1:}" method="get">\n\t$0\n</form>',
    detail: 'GET form',
  },
  'form:post': {
    label: 'form:post',
    snippet: '<form action="${1:}" method="post">\n\t$0\n</form>',
    detail: 'POST form',
  },
}

// ── Emmet Pattern Parsers ───────────────────────────────────────────────────

function isJsxLanguage(langId: string): boolean {
  return ['javascriptreact', 'typescriptreact'].includes(langId)
}

function expandTag(tag: string, selfClosing: boolean, isJsx: boolean): string {
  if (selfClosing) {
    return isJsx ? `<${tag} $0/>` : `<${tag} $0>`
  }
  return `<${tag}>$0</${tag}>`
}

/**
 * Expand a tag abbreviation with class/id: div.foo#bar -> <div class="foo" id="bar"></div>
 */
function expandTagWithModifiers(abbr: string, isJsx: boolean): { snippet: string; detail: string } | null {
  const match = abbr.match(/^([a-zA-Z][a-zA-Z0-9-]*)((?:[.#][a-zA-Z_-][a-zA-Z0-9_-]*)*)$/)
  if (!match) return null

  const tag = match[1]
  const modifiers = match[2]
  if (!modifiers) return null

  // Only expand known tags or custom elements with modifiers
  if (!HTML_TAGS.includes(tag) && !tag.includes('-')) return null

  const classes: string[] = []
  let id = ''

  const modRegex = /([.#])([a-zA-Z_-][a-zA-Z0-9_-]*)/g
  let m: RegExpExecArray | null
  while ((m = modRegex.exec(modifiers)) !== null) {
    if (m[1] === '.') classes.push(m[2])
    else if (m[1] === '#') id = m[2]
  }

  const classAttr = isJsx ? 'className' : 'class'
  let attrs = ''
  if (id) attrs += ` id="${id}"`
  if (classes.length > 0) attrs += ` ${classAttr}="${classes.join(' ')}"`

  const selfClosing = SELF_CLOSING_TAGS.has(tag)
  if (selfClosing) {
    const snippet = isJsx ? `<${tag}${attrs} $0/>` : `<${tag}${attrs} $0>`
    return { snippet, detail: snippet.replace(/\$\d/g, '') }
  }

  const snippet = `<${tag}${attrs}>$0</${tag}>`
  return { snippet, detail: snippet.replace(/\$\d/g, '') }
}

/**
 * Expand nested abbreviation: ul>li -> <ul><li></li></ul>
 */
function expandNested(abbr: string, isJsx: boolean): { snippet: string; detail: string } | null {
  if (!abbr.includes('>')) return null

  const parts = abbr.split('>')
  if (parts.length < 2 || parts.length > 5) return null

  // Validate each part is a simple tag name
  for (const part of parts) {
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(part)) return null
    if (!HTML_TAGS.includes(part) && !part.includes('-')) return null
  }

  let snippet = ''
  let indent = ''
  for (let i = 0; i < parts.length; i++) {
    const tag = parts[i]
    const selfClosing = SELF_CLOSING_TAGS.has(tag)
    if (selfClosing) {
      snippet += `${indent}${isJsx ? `<${tag} $0/>` : `<${tag}>`}\n`
    } else {
      snippet += `${indent}<${tag}>\n`
    }
    indent += '\t'
  }

  // Innermost content
  snippet += `${indent}$0\n`

  // Close tags in reverse (skip self-closing)
  for (let i = parts.length - 1; i >= 0; i--) {
    if (SELF_CLOSING_TAGS.has(parts[i])) continue
    indent = indent.slice(0, -1)
    snippet += `${indent}</${parts[i]}>\n`
  }

  snippet = snippet.trimEnd()

  const detail = parts.map(t => `<${t}>`).join(' > ')
  return { snippet, detail }
}

/**
 * Expand multiply abbreviation: li*3 -> <li></li><li></li><li></li>
 */
function expandMultiply(abbr: string, isJsx: boolean): { snippet: string; detail: string } | null {
  const match = abbr.match(/^([a-zA-Z][a-zA-Z0-9-]*)\*(\d+)$/)
  if (!match) return null

  const tag = match[1]
  const count = parseInt(match[2], 10)

  if (!HTML_TAGS.includes(tag) && !tag.includes('-')) return null
  if (count < 1 || count > 20) return null

  const selfClosing = SELF_CLOSING_TAGS.has(tag)
  const lines: string[] = []

  for (let i = 0; i < count; i++) {
    if (selfClosing) {
      lines.push(isJsx ? `<${tag} />` : `<${tag}>`)
    } else {
      lines.push(`<${tag}>$${i + 1}</${tag}>`)
    }
  }

  const snippet = lines.join('\n')
  const detail = `${count}x <${tag}>`
  return { snippet, detail }
}

/**
 * Expand numeric CSS abbreviations: m0 -> margin: 0, p10 -> padding: 10px, w100 -> width: 100%
 */
function expandNumericCSS(abbr: string): { snippet: string; detail: string } | null {
  const match = abbr.match(/^(m|mt|mr|mb|ml|mx|my|p|pt|pr|pb|pl|px|py|w|h|mw|mh|miw|mih|fz|lh|t|r|b|l|gap|br|z|op)(\d+)(p|e|r|%)?$/)
  if (!match) return null

  const prop = match[1]
  const num = match[2]
  const unitSuffix = match[3]

  const propMap: Record<string, string> = {
    m: 'margin', mt: 'margin-top', mr: 'margin-right', mb: 'margin-bottom', ml: 'margin-left',
    p: 'padding', pt: 'padding-top', pr: 'padding-right', pb: 'padding-bottom', pl: 'padding-left',
    w: 'width', h: 'height', mw: 'max-width', mh: 'max-height', miw: 'min-width', mih: 'min-height',
    fz: 'font-size', lh: 'line-height',
    t: 'top', r: 'right', b: 'bottom', l: 'left',
    gap: 'gap', br: 'border-radius', z: 'z-index', op: 'opacity',
  }

  const cssProperty = propMap[prop]
  if (!cssProperty) return null

  let unit = 'px'
  if (unitSuffix === 'p' || unitSuffix === '%') unit = '%'
  else if (unitSuffix === 'e') unit = 'em'
  else if (unitSuffix === 'r') unit = 'rem'

  // Special cases
  if (num === '0') {
    const snippet = `${cssProperty}: 0;`
    return { snippet, detail: snippet }
  }
  if (prop === 'z' || prop === 'op' || prop === 'lh') {
    // These are unitless
    const val = prop === 'op' ? (parseInt(num) / 100).toString() : num
    const snippet = `${cssProperty}: ${val};`
    return { snippet, detail: snippet }
  }

  // Handle mx/my expansion
  if (prop === 'mx') {
    const snippet = `margin-left: ${num}${unit};\nmargin-right: ${num}${unit};`
    return { snippet, detail: `margin-left + margin-right: ${num}${unit}` }
  }
  if (prop === 'my') {
    const snippet = `margin-top: ${num}${unit};\nmargin-bottom: ${num}${unit};`
    return { snippet, detail: `margin-top + margin-bottom: ${num}${unit}` }
  }
  if (prop === 'px') {
    const snippet = `padding-left: ${num}${unit};\npadding-right: ${num}${unit};`
    return { snippet, detail: `padding-left + padding-right: ${num}${unit}` }
  }
  if (prop === 'py') {
    const snippet = `padding-top: ${num}${unit};\npadding-bottom: ${num}${unit};`
    return { snippet, detail: `padding-top + padding-bottom: ${num}${unit}` }
  }

  // Width/height with 100 -> 100%
  if ((prop === 'w' || prop === 'h') && num === '100' && !unitSuffix) {
    unit = '%'
  }

  const snippet = `${cssProperty}: ${num}${unit};`
  return { snippet, detail: snippet }
}

// ── Languages to register ───────────────────────────────────────────────────

const HTML_LANGUAGES = ['html', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact']
const CSS_LANGUAGES = ['css', 'scss', 'less']
const ALL_LANGUAGES = [...HTML_LANGUAGES, ...CSS_LANGUAGES]

// ── Provider Registration ───────────────────────────────────────────────────

function createEmmetCompletionProvider(monaco: Monaco): languages.CompletionItemProvider {
  return {
    triggerCharacters: ['>', '*', '.', '#', '!', ':'],

    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const lineContent = model.getLineContent(position.lineNumber)
      const textUntilPosition = lineContent.substring(0, position.column - 1)

      // Extract the abbreviation: go back from cursor to find the emmet expression
      const abbrMatch = textUntilPosition.match(/([a-zA-Z!][a-zA-Z0-9.#>*:\-]*)$/)
      if (!abbrMatch) return { suggestions: [] }

      const abbr = abbrMatch[1]
      if (abbr.length < 1) return { suggestions: [] }

      const langId = model.getLanguageId()
      const isHTML = HTML_LANGUAGES.includes(langId)
      const isCSS = CSS_LANGUAGES.includes(langId)
      const isJsx = isJsxLanguage(langId)

      const range = {
        startLineNumber: position.lineNumber,
        startColumn: position.column - abbr.length,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      }

      const suggestions: languages.CompletionItem[] = []
      const CompletionItemKind = monaco.languages.CompletionItemKind
      const InsertTextRule = monaco.editor.CompletionItemInsertTextRule ?? (monaco as any).languages?.CompletionItemInsertTextRule

      // Helper to get InsertAsSnippet
      const snippetRule = InsertTextRule?.InsertAsSnippet ?? 4

      // ── HTML Snippet Shortcuts ────────────────────────────────────
      if (isHTML) {
        for (const [key, value] of Object.entries(HTML_SNIPPETS)) {
          if (key.startsWith(abbr) || key === abbr) {
            suggestions.push({
              label: `⚡ ${value.label}`,
              kind: CompletionItemKind.Snippet,
              documentation: value.detail,
              insertText: value.snippet,
              insertTextRules: snippetRule,
              range,
              sortText: '0' + key,
              detail: 'Emmet',
            })
          }
        }

        // ── Plain tag abbreviation ────────────────────────────────────
        if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(abbr)) {
          for (const tag of HTML_TAGS) {
            if (tag.startsWith(abbr)) {
              const selfClosing = SELF_CLOSING_TAGS.has(tag)
              suggestions.push({
                label: `⚡ ${tag}`,
                kind: CompletionItemKind.Snippet,
                documentation: `Emmet: <${tag}>`,
                insertText: expandTag(tag, selfClosing, isJsx),
                insertTextRules: snippetRule,
                range,
                sortText: '1' + tag,
                detail: 'Emmet',
              })
            }
          }
        }

        // ── Tag with class/id (div.foo, span#bar) ────────────────────
        const modResult = expandTagWithModifiers(abbr, isJsx)
        if (modResult) {
          suggestions.push({
            label: `⚡ ${abbr}`,
            kind: CompletionItemKind.Snippet,
            documentation: modResult.detail,
            insertText: modResult.snippet,
            insertTextRules: snippetRule,
            range,
            sortText: '0' + abbr,
            detail: 'Emmet',
          })
        }

        // ── Nested (ul>li) ────────────────────────────────────────────
        const nestedResult = expandNested(abbr, isJsx)
        if (nestedResult) {
          suggestions.push({
            label: `⚡ ${abbr}`,
            kind: CompletionItemKind.Snippet,
            documentation: nestedResult.detail,
            insertText: nestedResult.snippet,
            insertTextRules: snippetRule,
            range,
            sortText: '0' + abbr,
            detail: 'Emmet',
          })
        }

        // ── Multiply (li*3) ──────────────────────────────────────────
        const multiplyResult = expandMultiply(abbr, isJsx)
        if (multiplyResult) {
          suggestions.push({
            label: `⚡ ${abbr}`,
            kind: CompletionItemKind.Snippet,
            documentation: multiplyResult.detail,
            insertText: multiplyResult.snippet,
            insertTextRules: snippetRule,
            range,
            sortText: '0' + abbr,
            detail: 'Emmet',
          })
        }
      }

      // ── CSS Abbreviations ───────────────────────────────────────────
      // CSS abbreviations work in both CSS files and HTML/JSX (for inline styles, CSS-in-JS)
      {
        // Static abbreviations
        for (const [key, value] of Object.entries(CSS_ABBREVIATIONS)) {
          if (key.startsWith(abbr) || key === abbr) {
            suggestions.push({
              label: `⚡ ${value.label}`,
              kind: CompletionItemKind.Snippet,
              documentation: value.detail,
              insertText: value.snippet,
              insertTextRules: snippetRule,
              range,
              sortText: (isCSS ? '0' : '2') + key,
              detail: 'Emmet CSS',
            })
          }
        }

        // Numeric CSS abbreviations (m0, p10, w100, etc.)
        const numericResult = expandNumericCSS(abbr)
        if (numericResult) {
          suggestions.push({
            label: `⚡ ${abbr}`,
            kind: CompletionItemKind.Snippet,
            documentation: numericResult.detail,
            insertText: numericResult.snippet,
            insertTextRules: snippetRule,
            range,
            sortText: (isCSS ? '0' : '2') + abbr,
            detail: 'Emmet CSS',
          })
        }
      }

      return { suggestions }
    },
  }
}

// ── React Component ─────────────────────────────────────────────────────────

export default function EmmetProvider({ monaco }: EmmetProviderProps) {
  const disposablesRef = useRef<IDisposable[]>([])

  useEffect(() => {
    if (!monaco) return

    // Dispose previous registrations
    disposablesRef.current.forEach(d => d.dispose())
    disposablesRef.current = []

    const provider = createEmmetCompletionProvider(monaco)

    for (const langId of ALL_LANGUAGES) {
      const disposable = monaco.languages.registerCompletionItemProvider(langId, provider)
      disposablesRef.current.push(disposable)
    }

    return () => {
      disposablesRef.current.forEach(d => d.dispose())
      disposablesRef.current = []
    }
  }, [monaco])

  return null
}
