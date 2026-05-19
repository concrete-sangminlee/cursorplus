import { describe, expect, it } from 'vitest'
import { parseMarkdown, safeHref } from '@/utils/aiChatMarkdown'

describe('AI chat markdown parsing', () => {
  it('escapes raw html before rendering', () => {
    const { html } = parseMarkdown('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
  })

  it('rejects unsafe link schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#')
    expect(safeHref('VBScript:alert(1)')).toBe('#')
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('#')
    expect(safeHref('file:///etc/passwd')).toBe('#')
  })

  it('allows safe links and relative references', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com')
    expect(safeHref('mailto:test@example.com')).toBe('mailto:test@example.com')
    expect(safeHref('/notes.md')).toBe('/notes.md')
    expect(safeHref('#section')).toBe('#section')
    expect(safeHref('./relative/path')).toBe('./relative/path')
  })

  it('supports fenced code blocks with backticks and tildes', () => {
    const content = [
      '```ts',
      'const value = 1',
      '```',
      '',
      '~~~ts',
      'const other = 2',
      '~~~',
    ].join('\n')

    const { html, codeBlocks } = parseMarkdown(content)
    expect(codeBlocks).toHaveLength(2)
    expect(codeBlocks[0]?.language).toBe('ts')
    expect(codeBlocks[1]?.language).toBe('ts')
    expect(html).not.toContain('```')
    expect(html).not.toContain('~~~')
    expect(codeBlocks[0]?.code).toBe('const value = 1')
    expect(codeBlocks[1]?.code).toBe('const other = 2')
  })

  it('keeps link text and blockquotes safe after escaping', () => {
    const content = '> quote\n[link](javascript:alert(1))\n[ok](https://example.com)'
    const { html } = parseMarkdown(content)
    expect(html).toContain('<blockquote')
    expect(html).toContain('href="#"')
    expect(html).toContain('href="https://example.com"')
  })
})
