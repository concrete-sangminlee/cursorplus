import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NotebookHtmlOutput } from './NotebookPanel'

describe('NotebookPanel HTML output', () => {
  it('renders notebook HTML output inside a sandboxed iframe', () => {
    const markup = renderToStaticMarkup(
      <NotebookHtmlOutput html={'<img src=x onerror="globalThis.__probe=true">'} />,
    )

    expect(markup).toContain('<iframe')
    expect(markup).toContain('sandbox=""')
    expect(markup).toContain('referrerPolicy="no-referrer"')
    expect(markup).toContain('srcDoc=')
  })

  it('does not inline the html as DOM children', () => {
    const markup = renderToStaticMarkup(
      <NotebookHtmlOutput html={'<script>alert(1)</script>'} />,
    )

    // The script tag should only appear inside the iframe's srcDoc attribute,
    // never as a real DOM node sibling.
    expect(markup).not.toMatch(/<\/iframe>\s*<script>/)
  })
})
