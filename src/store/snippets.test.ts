/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSnippetStore } from './snippets'
import type { Snippet, VSCodeSnippetFormat } from './snippets'

const store = useSnippetStore
const STORAGE_KEY = 'orion-user-snippets'

/*
 * BUILTIN_SNIPPETS is not exported, so snapshot it from the store's initial
 * snapshot. localStorage is empty at module-load time in the test environment,
 * so loadUserSnippets() returns [] and the initial `snippets` array is exactly
 * the built-ins.
 */
const BUILTINS: Snippet[] = store.getState().snippets.filter((s) => s.isBuiltin)

function reset() {
  // Reset only data fields; do NOT use replace:true (would wipe actions).
  store.setState({
    snippets: BUILTINS.map((s) => ({ ...s })),
    userSnippets: [],
  })
}

function persisted(): Snippet[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? (JSON.parse(raw) as Snippet[]) : []
}

beforeEach(() => {
  localStorage.clear()
  reset()
})

describe('initial state', () => {
  it('seeds built-in snippets and an empty user list', () => {
    expect(BUILTINS.length).toBeGreaterThan(50)
    expect(store.getState().userSnippets).toEqual([])
    // every built-in is flagged and present in the combined list
    expect(store.getState().snippets.every((s) => s.isBuiltin)).toBe(true)
  })
})

describe('createSnippet', () => {
  it('adds a user snippet with a generated id and isBuiltin=false', () => {
    store.getState().createSnippet({
      name: 'Log',
      prefix: 'lg',
      body: 'console.log()',
      description: 'log',
      language: 'javascript',
    })
    const user = store.getState().userSnippets
    expect(user).toHaveLength(1)
    expect(user[0].id).toMatch(/^snippet_/)
    expect(user[0].isBuiltin).toBe(false)
    expect(user[0].name).toBe('Log')
  })

  it('keeps built-ins and appends user snippets in the combined list', () => {
    store.getState().createSnippet({
      name: 'X', prefix: 'x', body: 'x', description: 'x', language: 'global',
    })
    const all = store.getState().snippets
    expect(all).toHaveLength(BUILTINS.length + 1)
    expect(all[all.length - 1].name).toBe('X')
    expect(all.slice(0, BUILTINS.length).every((s) => s.isBuiltin)).toBe(true)
  })

  it('persists user snippets to localStorage', () => {
    store.getState().createSnippet({
      name: 'P', prefix: 'p', body: 'b', description: 'd', language: 'css',
    })
    const stored = persisted()
    expect(stored).toHaveLength(1)
    expect(stored[0].prefix).toBe('p')
    expect(stored[0].isBuiltin).toBe(false)
  })

  it('generates unique ids for sequential creates', () => {
    store.getState().createSnippet({ name: 'a', prefix: 'a', body: 'a', description: '', language: 'global' })
    store.getState().createSnippet({ name: 'b', prefix: 'b', body: 'b', description: '', language: 'global' })
    const [a, b] = store.getState().userSnippets
    expect(a.id).not.toBe(b.id)
  })
})

describe('updateSnippet', () => {
  it('updates fields of an existing user snippet and persists', () => {
    store.getState().createSnippet({ name: 'a', prefix: 'a', body: 'a', description: '', language: 'global' })
    const id = store.getState().userSnippets[0].id
    store.getState().updateSnippet(id, { body: 'updated', name: 'renamed' })
    const s = store.getState().userSnippets[0]
    expect(s.body).toBe('updated')
    expect(s.name).toBe('renamed')
    expect(persisted()[0].body).toBe('updated')
  })

  it('is a no-op for built-in snippet ids (cannot edit built-ins)', () => {
    const builtinId = BUILTINS[0].id
    const before = store.getState()
    store.getState().updateSnippet(builtinId, { body: 'HACKED' })
    // state object identity unchanged (returned `state`) and built-in untouched
    expect(store.getState()).toBe(before)
    expect(store.getState().snippets.find((s) => s.id === builtinId)!.body).not.toBe('HACKED')
  })

  it('is a no-op for an unknown id', () => {
    const before = store.getState()
    store.getState().updateSnippet('does-not-exist', { body: 'x' })
    expect(store.getState()).toBe(before)
  })
})

describe('deleteSnippet', () => {
  it('removes a user snippet and persists the new list', () => {
    store.getState().createSnippet({ name: 'a', prefix: 'a', body: 'a', description: '', language: 'global' })
    store.getState().createSnippet({ name: 'b', prefix: 'b', body: 'b', description: '', language: 'global' })
    const id = store.getState().userSnippets[0].id
    store.getState().deleteSnippet(id)
    expect(store.getState().userSnippets.map((s) => s.name)).toEqual(['b'])
    expect(persisted().map((s) => s.name)).toEqual(['b'])
  })

  it('refuses to delete built-in snippets', () => {
    const builtinId = BUILTINS[0].id
    store.getState().deleteSnippet(builtinId)
    expect(store.getState().snippets.find((s) => s.id === builtinId)).toBeDefined()
  })
})

describe('legacy aliases', () => {
  it('addSnippet delegates to createSnippet', () => {
    store.getState().addSnippet({ name: 'a', prefix: 'a', body: 'a', description: '', language: 'global' })
    expect(store.getState().userSnippets).toHaveLength(1)
  })

  it('removeSnippet delegates to deleteSnippet', () => {
    store.getState().addSnippet({ name: 'a', prefix: 'a', body: 'a', description: '', language: 'global' })
    const id = store.getState().userSnippets[0].id
    store.getState().removeSnippet(id)
    expect(store.getState().userSnippets).toHaveLength(0)
  })
})

describe('getSnippetsForLanguage', () => {
  it('returns javascript snippets plus global, excluding typescript/python', () => {
    const result = store.getState().getSnippetsForLanguage('javascript')
    const langs = new Set(result.map((s) => s.language))
    expect(langs.has('javascript')).toBe(true)
    expect(langs.has('global')).toBe(true)
    expect(langs.has('typescript')).toBe(false)
    expect(langs.has('python')).toBe(false)
  })

  it('includes javascript snippets for typescript (TS is a superset)', () => {
    const result = store.getState().getSnippetsForLanguage('typescript')
    const langs = new Set(result.map((s) => s.language))
    expect(langs.has('typescript')).toBe(true)
    expect(langs.has('javascript')).toBe(true)
    expect(langs.has('global')).toBe(true)
  })

  it('resolves the jsx alias to the javascript family', () => {
    const result = store.getState().getSnippetsForLanguage('jsx')
    const langs = new Set(result.map((s) => s.language))
    expect(langs.has('javascript')).toBe(true)
    expect(langs.has('global')).toBe(true)
  })

  it('is case-insensitive on the requested language id', () => {
    const lower = store.getState().getSnippetsForLanguage('python').map((s) => s.id)
    const upper = store.getState().getSnippetsForLanguage('PYTHON').map((s) => s.id)
    expect(upper).toEqual(lower)
  })

  it('returns only global snippets for an unknown language', () => {
    const result = store.getState().getSnippetsForLanguage('rust')
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((s) => s.language === 'global')).toBe(true)
  })

  it('includes freshly created user snippets matching the language', () => {
    store.getState().createSnippet({
      name: 'myhook', prefix: 'mh', body: 'b', description: 'd', language: 'python',
    })
    const result = store.getState().getSnippetsForLanguage('python')
    expect(result.some((s) => s.name === 'myhook')).toBe(true)
  })
})

describe('importSnippets', () => {
  it('imports plain snippets with generated ids and default fields', () => {
    store.getState().importSnippets([
      { prefix: 'p1', body: 'b1' },
      { prefix: 'p2', body: 'b2', name: 'Named', description: 'desc', language: 'css' },
    ])
    const user = store.getState().userSnippets
    expect(user).toHaveLength(2)
    // defaults: name falls back to prefix, description to prefix, language to global
    expect(user[0].name).toBe('p1')
    expect(user[0].description).toBe('p1')
    expect(user[0].language).toBe('global')
    expect(user[0].isBuiltin).toBe(false)
    expect(user[1].name).toBe('Named')
    expect(user[1].language).toBe('css')
  })

  it('filters out entries whose id looks like a built-in', () => {
    store.getState().importSnippets([
      { id: 'builtin_js_if', prefix: 'if', body: 'x' } as Partial<Snippet> & { prefix: string; body: string },
      { id: 'custom_1', prefix: 'ok', body: 'y' } as Partial<Snippet> & { prefix: string; body: string },
    ])
    const user = store.getState().userSnippets
    expect(user).toHaveLength(1)
    expect(user[0].prefix).toBe('ok')
  })

  it('appends to existing user snippets and persists', () => {
    store.getState().createSnippet({ name: 'a', prefix: 'a', body: 'a', description: '', language: 'global' })
    store.getState().importSnippets([{ prefix: 'p', body: 'b' }])
    expect(store.getState().userSnippets).toHaveLength(2)
    expect(persisted()).toHaveLength(2)
  })
})

describe('importVSCodeSnippets', () => {
  it('parses prefix/body, returns the inserted count, and persists', () => {
    const data: VSCodeSnippetFormat = {
      'Log Statement': { prefix: 'log', body: ['console.log($1);'], description: 'log it' },
    }
    const n = store.getState().importVSCodeSnippets(data, 'javascript')
    expect(n).toBe(1)
    const s = store.getState().userSnippets[0]
    expect(s.name).toBe('Log Statement')
    expect(s.prefix).toBe('log')
    expect(s.body).toBe('console.log($1);')
    expect(s.language).toBe('javascript')
    expect(persisted()).toHaveLength(1)
  })

  it('joins multi-line body arrays with newlines and takes the first prefix from an array', () => {
    const data: VSCodeSnippetFormat = {
      Multi: { prefix: ['m', 'multi'], body: ['line1', 'line2'] },
    }
    store.getState().importVSCodeSnippets(data)
    const s = store.getState().userSnippets[0]
    expect(s.prefix).toBe('m')
    expect(s.body).toBe('line1\nline2')
  })

  it('derives language from the first comma-separated scope (lowercased)', () => {
    const data: VSCodeSnippetFormat = {
      Scoped: { prefix: 'sc', body: 'x', scope: 'TypeScript, JavaScript' },
    }
    store.getState().importVSCodeSnippets(data)
    expect(store.getState().userSnippets[0].language).toBe('typescript')
  })

  it('falls back description to the snippet name when absent', () => {
    const data: VSCodeSnippetFormat = { OnlyName: { prefix: 'on', body: 'x' } }
    store.getState().importVSCodeSnippets(data)
    expect(store.getState().userSnippets[0].description).toBe('OnlyName')
  })

  it('skips entries missing prefix or body', () => {
    const data = {
      Good: { prefix: 'g', body: 'x' },
      NoPrefix: { prefix: '', body: 'x' },
      NoBody: { prefix: 'n', body: '' },
    } as unknown as VSCodeSnippetFormat
    const n = store.getState().importVSCodeSnippets(data)
    expect(n).toBe(1)
    expect(store.getState().userSnippets[0].name).toBe('Good')
  })

  it('returns 0 and does not touch state for empty/unparseable input', () => {
    const before = store.getState().userSnippets
    const n = store.getState().importVSCodeSnippets({})
    expect(n).toBe(0)
    expect(store.getState().userSnippets).toBe(before)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('uses the default language when no scope is provided', () => {
    const data: VSCodeSnippetFormat = { D: { prefix: 'd', body: 'x' } }
    store.getState().importVSCodeSnippets(data, 'python')
    expect(store.getState().userSnippets[0].language).toBe('python')
    // and default of the default is 'global'
    const data2: VSCodeSnippetFormat = { E: { prefix: 'e', body: 'y' } }
    store.getState().importVSCodeSnippets(data2)
    expect(store.getState().userSnippets[1].language).toBe('global')
  })
})

describe('exportSnippets', () => {
  it('returns only user snippets, never built-ins', () => {
    store.getState().createSnippet({ name: 'a', prefix: 'a', body: 'a', description: '', language: 'global' })
    const exported = store.getState().exportSnippets()
    expect(exported).toHaveLength(1)
    expect(exported.every((s) => !s.isBuiltin)).toBe(true)
  })
})

describe('exportVSCodeFormat', () => {
  it('keys by name, splits body into lines, and includes scope only for non-global', () => {
    store.getState().createSnippet({
      name: 'My TS', prefix: 'ts', body: 'a\nb', description: 'd', language: 'typescript',
    })
    store.getState().createSnippet({
      name: 'My Global', prefix: 'g', body: 'x', description: 'd', language: 'global',
    })
    const out = store.getState().exportVSCodeFormat()
    expect(out['My TS'].body).toEqual(['a', 'b'])
    expect(out['My TS'].prefix).toBe('ts')
    expect(out['My TS'].scope).toBe('typescript')
    expect('scope' in out['My Global']).toBe(false)
  })

  it('round-trips through import without built-ins leaking in', () => {
    store.getState().createSnippet({
      name: 'Round', prefix: 'r', body: 'one\ntwo', description: 'd', language: 'css',
    })
    const exported = store.getState().exportVSCodeFormat()
    reset()
    const n = store.getState().importVSCodeSnippets(exported)
    expect(n).toBe(1)
    const s = store.getState().userSnippets[0]
    expect(s.body).toBe('one\ntwo')
    expect(s.language).toBe('css')
  })
})

describe('insertSnippetAtCursor', () => {
  it('dispatches an orion-insert-snippet CustomEvent carrying body and name', () => {
    const handler = vi.fn()
    window.addEventListener('orion-insert-snippet', handler)
    const snippet: Snippet = {
      id: 'x', name: 'Hello', prefix: 'h', body: 'console.log()',
      description: '', language: 'javascript', isBuiltin: false,
    }
    store.getState().insertSnippetAtCursor(snippet)
    expect(handler).toHaveBeenCalledTimes(1)
    const evt = handler.mock.calls[0][0] as CustomEvent
    expect(evt.detail).toEqual({ body: 'console.log()', name: 'Hello' })
    window.removeEventListener('orion-insert-snippet', handler)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
