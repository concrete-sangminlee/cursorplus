import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HtmlResponsePreview } from './ApiClientPanel'

describe('ApiClientPanel HTML response preview', () => {
  it('renders API HTML inside a sandboxed iframe', () => {
    const markup = renderToStaticMarkup(
      <HtmlResponsePreview html={'<img src=x onerror="globalThis.__probe=true">'} />,
    )

    expect(markup).toContain('<iframe')
    expect(markup).toContain('sandbox=""')
    expect(markup).toContain('referrerPolicy="no-referrer"')
    expect(markup).toContain('srcDoc=')
  })
})
