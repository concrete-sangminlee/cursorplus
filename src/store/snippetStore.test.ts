/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSnippetStore } from './snippetStore'
import type { Snippet, SnippetCategory } from './snippetStore'

/*
 * Tests for the snippetStore zustand singleton (src/store/snippetStore.ts).
 * NOTE: a separate, larger `snippets.ts` store also exists; this file targets
 * the distinct API of snippetStore.ts only (addSnippet returns id, VS Code
 * import, language-array matching, etc.).
 *
 * The store persists { snippets, categories, sortBy } to localStorage under
 * the key 'orion-snippets', so we run under jsdom and clear localStorage.
 */

const store = useSnippetStore

/* Mirror of the store's baked-in default categories (cloned per reset). */
const DEFAULT_CATEGORIES: SnippetCategory[] = [
  { id: 'general', name: 'General', color: '#58a6ff', snippetCount: 0 },
  { id: 'react', name: 'React', color: '#61dafb', snippetCount: 0 },
  { id: 'testing', name: 'Testing', color: '#2ea043', snippetCount: 0 },
  { id: 'logging', name: 'Logging', color: '#d29922', snippetCount: 0 },
  { id: 'error-handling', name: 'Error Handling', color: '#f85149', snippetCount: 0 },
]

function reset() {
  store.setState({
    snippets: [],
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    sortBy: 'name',
    filterLanguage: null,
    filterCategory: null,
    searchQuery: '',
  })
}

/* Minimal payload accepted by addSnippet (it injects id/timestamps/etc). */
function makeInput(overrides: Partial<Omit<Snippet, 'id' | 'createdAt' | 'updatedAt' | 'useCount' | 'isBuiltIn'>> = {}) {
  return {
    name: 'My Snippet',
    prefix: 'log',
    body: 'console.log($1)',
    language: 'typescript',
    tags: [] as string[],
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  reset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/* ── addSnippet ─────────────────────────────────────────── */

describe('addSnippet', () => {
  it('appends a snippet with generated id and injected defaults, returning the id', () => {
    const id = store.getState().addSnippet(makeInput({ name: 'Alpha', prefix: 'al' }))
    const snippets = store.getState().snippets
    expect(snippets).toHaveLength(1)
    const s = snippets[0]
    expect(s.id).toBe(id)
    expect(id).toMatch(/^snip-/)
    expect(s.isBuiltIn).toBe(false)
    expect(s.useCount).toBe(0)
    expect(s.createdAt).toBeGreaterThan(0)
    expect(s.updatedAt).toBe(s.createdAt)
    expect(s.lastUsed).toBeUndefined()
  })

  it('cannot be tricked into setting isBuiltIn/useCount via the input', () => {
    // The Omit type forbids these, but a runtime caller could still pass them;
    // the store must force its own values.
    store.getState().addSnippet({ ...makeInput(), isBuiltIn: true, useCount: 99 } as any)
    const s = store.getState().snippets[0]
    expect(s.isBuiltIn).toBe(false)
    expect(s.useCount).toBe(0)
  })

  it('preserves multi-language arrays and tags', () => {
    store.getState().addSnippet(makeInput({ language: ['ts', 'js'], tags: ['x', 'y'] }))
    const s = store.getState().snippets[0]
    expect(s.language).toEqual(['ts', 'js'])
    expect(s.tags).toEqual(['x', 'y'])
  })
})

/* ── updateSnippet ──────────────────────────────────────── */

describe('updateSnippet', () => {
  it('merges updates and bumps updatedAt', () => {
    const now = 1_000
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now)
    const id = store.getState().addSnippet(makeInput({ name: 'Old' }))
    spy.mockReturnValue(now + 5_000)
    store.getState().updateSnippet(id, { name: 'New', body: 'changed' })
    const s = store.getState().snippets.find(x => x.id === id)!
    expect(s.name).toBe('New')
    expect(s.body).toBe('changed')
    expect(s.createdAt).toBe(now)
    expect(s.updatedAt).toBe(now + 5_000)
  })

  it('is a no-op for an unknown id', () => {
    store.getState().addSnippet(makeInput({ name: 'Keep' }))
    store.getState().updateSnippet('does-not-exist', { name: 'X' })
    expect(store.getState().snippets).toHaveLength(1)
    expect(store.getState().snippets[0].name).toBe('Keep')
  })
})

/* ── deleteSnippet ──────────────────────────────────────── */

describe('deleteSnippet', () => {
  it('removes only the matching snippet', () => {
    const a = store.getState().addSnippet(makeInput({ name: 'A' }))
    const b = store.getState().addSnippet(makeInput({ name: 'B' }))
    store.getState().deleteSnippet(a)
    const ids = store.getState().snippets.map(s => s.id)
    expect(ids).toEqual([b])
  })

  it('is a no-op for unknown id', () => {
    store.getState().addSnippet(makeInput())
    store.getState().deleteSnippet('nope')
    expect(store.getState().snippets).toHaveLength(1)
  })
})

/* ── duplicateSnippet ───────────────────────────────────── */

describe('duplicateSnippet', () => {
  it('clones with "(copy)" name and "_copy" prefix, deep-copying tags', () => {
    const id = store.getState().addSnippet(makeInput({ name: 'Base', prefix: 'pf', tags: ['a'] }))
    const copyId = store.getState().duplicateSnippet(id)
    expect(copyId).not.toBe('')
    const copy = store.getState().snippets.find(s => s.id === copyId)!
    expect(copy.name).toBe('Base (copy)')
    expect(copy.prefix).toBe('pf_copy')
    // deep clone: mutating original tags must not affect the copy
    const original = store.getState().snippets.find(s => s.id === id)!
    expect(copy.tags).toEqual(['a'])
    expect(copy.tags).not.toBe(original.tags)
  })

  it('deep-copies a language array so the copy is independent', () => {
    const id = store.getState().addSnippet(makeInput({ language: ['ts', 'js'] }))
    const copyId = store.getState().duplicateSnippet(id)
    const original = store.getState().snippets.find(s => s.id === id)!
    const copy = store.getState().snippets.find(s => s.id === copyId)!
    expect(copy.language).toEqual(['ts', 'js'])
    expect(copy.language).not.toBe(original.language)
  })

  it('returns "" and adds nothing for an unknown id', () => {
    const result = store.getState().duplicateSnippet('missing')
    expect(result).toBe('')
    expect(store.getState().snippets).toHaveLength(0)
  })

  it('produces a non-built-in copy with reset useCount even from a used snippet', () => {
    const id = store.getState().addSnippet(makeInput())
    store.getState().recordUse(id)
    const copyId = store.getState().duplicateSnippet(id)
    const copy = store.getState().snippets.find(s => s.id === copyId)!
    expect(copy.isBuiltIn).toBe(false)
    expect(copy.useCount).toBe(0)
  })
})

/* ── recordUse ──────────────────────────────────────────── */

describe('recordUse', () => {
  it('increments useCount and stamps lastUsed', () => {
    const spy = vi.spyOn(Date, 'now').mockReturnValue(42)
    const id = store.getState().addSnippet(makeInput())
    spy.mockReturnValue(7777)
    store.getState().recordUse(id)
    let s = store.getState().snippets.find(x => x.id === id)!
    expect(s.useCount).toBe(1)
    expect(s.lastUsed).toBe(7777)
    store.getState().recordUse(id)
    s = store.getState().snippets.find(x => x.id === id)!
    expect(s.useCount).toBe(2)
  })
})

/* ── categories ─────────────────────────────────────────── */

describe('categories', () => {
  it('starts with the five default categories', () => {
    expect(store.getState().categories.map(c => c.id)).toEqual([
      'general', 'react', 'testing', 'logging', 'error-handling',
    ])
  })

  it('addCategory appends with default color and returns its id', () => {
    const id = store.getState().addCategory('Custom')
    expect(id).toMatch(/^cat-/)
    const cat = store.getState().categories.find(c => c.id === id)!
    expect(cat.name).toBe('Custom')
    expect(cat.color).toBe('#8b949e')
    expect(cat.snippetCount).toBe(0)
  })

  it('addCategory honors a provided color', () => {
    const id = store.getState().addCategory('Custom', '#123456')
    expect(store.getState().categories.find(c => c.id === id)!.color).toBe('#123456')
  })

  it('renameCategory changes only the matching category name', () => {
    store.getState().renameCategory('general', 'Renamed')
    expect(store.getState().categories.find(c => c.id === 'general')!.name).toBe('Renamed')
    expect(store.getState().categories.find(c => c.id === 'react')!.name).toBe('React')
  })

  it('deleteCategory removes the category and clears it from snippets that referenced it', () => {
    const catId = store.getState().addCategory('Temp')
    const s1 = store.getState().addSnippet(makeInput({ category: catId }))
    const s2 = store.getState().addSnippet(makeInput({ category: 'general' }))
    store.getState().deleteCategory(catId)
    expect(store.getState().categories.find(c => c.id === catId)).toBeUndefined()
    expect(store.getState().snippets.find(s => s.id === s1)!.category).toBeUndefined()
    // other snippet's category is untouched
    expect(store.getState().snippets.find(s => s.id === s2)!.category).toBe('general')
  })
})

/* ── getSnippetsByLanguage ──────────────────────────────── */

describe('getSnippetsByLanguage', () => {
  it('matches exact string language and array membership', () => {
    store.getState().addSnippet(makeInput({ name: 'TS', language: 'typescript' }))
    store.getState().addSnippet(makeInput({ name: 'Multi', language: ['python', 'typescript'] }))
    store.getState().addSnippet(makeInput({ name: 'JS', language: 'javascript' }))
    const names = store.getState().getSnippetsByLanguage('typescript').map(s => s.name).sort()
    expect(names).toEqual(['Multi', 'TS'])
  })

  it('includes wildcard "*" snippets for any language', () => {
    store.getState().addSnippet(makeInput({ name: 'Any', language: '*' }))
    store.getState().addSnippet(makeInput({ name: 'AnyArr', language: ['*'] }))
    const names = store.getState().getSnippetsByLanguage('go').map(s => s.name).sort()
    expect(names).toEqual(['Any', 'AnyArr'])
  })
})

/* ── getSnippetsByPrefix ────────────────────────────────── */

describe('getSnippetsByPrefix', () => {
  beforeEach(() => {
    store.getState().addSnippet(makeInput({ name: 'Log', prefix: 'log', language: 'ts' }))
    store.getState().addSnippet(makeInput({ name: 'Logger', prefix: 'logger', language: 'js' }))
    store.getState().addSnippet(makeInput({ name: 'Error', prefix: 'err', language: 'ts' }))
  })

  it('matches prefixes case-insensitively by startsWith', () => {
    const names = store.getState().getSnippetsByPrefix('LOG').map(s => s.name).sort()
    expect(names).toEqual(['Log', 'Logger'])
  })

  it('returns empty when no prefix matches', () => {
    expect(store.getState().getSnippetsByPrefix('zzz')).toEqual([])
  })

  it('filters by language when provided', () => {
    const names = store.getState().getSnippetsByPrefix('log', 'ts').map(s => s.name)
    expect(names).toEqual(['Log'])
  })
})

/* ── searchSnippets ─────────────────────────────────────── */

describe('searchSnippets', () => {
  beforeEach(() => {
    store.getState().addSnippet(makeInput({ name: 'Fetch helper', prefix: 'fh', body: 'await fetch(url)', description: 'network call', tags: ['http'] }))
    store.getState().addSnippet(makeInput({ name: 'Reducer', prefix: 'red', body: 'switch(action)', description: 'state', tags: ['redux'] }))
  })

  it('matches name, prefix, body, description, and tags case-insensitively', () => {
    expect(store.getState().searchSnippets('FETCH').map(s => s.name)).toEqual(['Fetch helper'])
    expect(store.getState().searchSnippets('switch').map(s => s.name)).toEqual(['Reducer'])
    expect(store.getState().searchSnippets('network').map(s => s.name)).toEqual(['Fetch helper'])
    expect(store.getState().searchSnippets('redux').map(s => s.name)).toEqual(['Reducer'])
    expect(store.getState().searchSnippets('red').map(s => s.name)).toEqual(['Reducer'])
  })

  it('returns empty array when nothing matches', () => {
    expect(store.getState().searchSnippets('nonexistent-term')).toEqual([])
  })
})

/* ── getRecentSnippets / getMostUsedSnippets ────────────── */

describe('getRecentSnippets', () => {
  it('returns only used snippets, newest-lastUsed first, honoring the limit', () => {
    const spy = vi.spyOn(Date, 'now')
    spy.mockReturnValue(1)
    const a = store.getState().addSnippet(makeInput({ name: 'A' }))
    const b = store.getState().addSnippet(makeInput({ name: 'B' }))
    const c = store.getState().addSnippet(makeInput({ name: 'C' }))
    store.getState().addSnippet(makeInput({ name: 'Unused' }))

    spy.mockReturnValue(100)
    store.getState().recordUse(a)
    spy.mockReturnValue(300)
    store.getState().recordUse(b)
    spy.mockReturnValue(200)
    store.getState().recordUse(c)

    const recent = store.getState().getRecentSnippets()
    expect(recent.map(s => s.name)).toEqual(['B', 'C', 'A']) // 300, 200, 100
    expect(recent.find(s => s.name === 'Unused')).toBeUndefined()

    expect(store.getState().getRecentSnippets(2).map(s => s.name)).toEqual(['B', 'C'])
  })

  it('does not mutate the underlying snippets array', () => {
    const before = store.getState().snippets
    store.getState().getRecentSnippets()
    expect(store.getState().snippets).toBe(before)
  })
})

describe('getMostUsedSnippets', () => {
  it('sorts by useCount descending, including zero-use snippets, honoring limit', () => {
    const a = store.getState().addSnippet(makeInput({ name: 'A' }))
    const b = store.getState().addSnippet(makeInput({ name: 'B' }))
    store.getState().addSnippet(makeInput({ name: 'C' }))
    store.getState().recordUse(b)
    store.getState().recordUse(b)
    store.getState().recordUse(a)

    const most = store.getState().getMostUsedSnippets()
    expect(most.map(s => s.name)).toEqual(['B', 'A', 'C'])
    expect(store.getState().getMostUsedSnippets(1).map(s => s.name)).toEqual(['B'])
  })
})

/* ── getFilteredSnippets ────────────────────────────────── */

describe('getFilteredSnippets', () => {
  beforeEach(() => {
    store.getState().addSnippet(makeInput({ name: 'Banana', prefix: 'bn', language: 'ts', category: 'general', description: 'fruit' }))
    store.getState().addSnippet(makeInput({ name: 'Apple', prefix: 'ap', language: 'js', category: 'react', description: 'red fruit' }))
    store.getState().addSnippet(makeInput({ name: 'Cherry', prefix: 'ch', language: 'ts', category: 'react', description: 'small' }))
  })

  it('sorts by name by default', () => {
    expect(store.getState().getFilteredSnippets().map(s => s.name)).toEqual(['Apple', 'Banana', 'Cherry'])
  })

  it('filters by language (and wildcard) ', () => {
    store.getState().addSnippet(makeInput({ name: 'Wild', prefix: 'wd', language: '*' }))
    store.getState().setFilterLanguage('ts')
    expect(store.getState().getFilteredSnippets().map(s => s.name)).toEqual(['Banana', 'Cherry', 'Wild'])
  })

  it('filters by category', () => {
    store.getState().setFilterCategory('react')
    expect(store.getState().getFilteredSnippets().map(s => s.name)).toEqual(['Apple', 'Cherry'])
  })

  it('filters by searchQuery across name/prefix/description only', () => {
    store.getState().setSearchQuery('fruit')
    // Banana ("fruit") and Apple ("red fruit") match via description
    expect(store.getState().getFilteredSnippets().map(s => s.name)).toEqual(['Apple', 'Banana'])
  })

  it('combines language + category + search filters', () => {
    store.getState().setFilterLanguage('ts')
    store.getState().setFilterCategory('react')
    expect(store.getState().getFilteredSnippets().map(s => s.name)).toEqual(['Cherry'])
  })

  it('honors the prefix sort order', () => {
    store.getState().setSortBy('prefix')
    expect(store.getState().getFilteredSnippets().map(s => s.prefix)).toEqual(['ap', 'bn', 'ch'])
  })

  it('honors the frequency sort order', () => {
    const target = store.getState().snippets.find(s => s.name === 'Cherry')!.id
    store.getState().recordUse(target)
    store.getState().setSortBy('frequency')
    expect(store.getState().getFilteredSnippets()[0].name).toBe('Cherry')
  })
})

/* ── export / import ────────────────────────────────────── */

describe('exportSnippets', () => {
  it('serializes non-built-in snippets with a version field', () => {
    store.getState().addSnippet(makeInput({ name: 'Exportable', language: 'ts' }))
    // simulate a built-in snippet directly in state (addSnippet cannot create one)
    store.setState(s => ({
      snippets: [...s.snippets, { ...s.snippets[0], id: 'builtin-1', name: 'BuiltIn', isBuiltIn: true }],
    }))
    const out = JSON.parse(store.getState().exportSnippets())
    expect(out.version).toBe(1)
    expect(out.snippets.map((s: Snippet) => s.name)).toEqual(['Exportable'])
  })

  it('filters export by language (no wildcard expansion)', () => {
    store.getState().addSnippet(makeInput({ name: 'TS', language: 'ts' }))
    store.getState().addSnippet(makeInput({ name: 'Multi', language: ['ts', 'js'] }))
    store.getState().addSnippet(makeInput({ name: 'JS', language: 'js' }))
    const out = JSON.parse(store.getState().exportSnippets('ts'))
    expect(out.snippets.map((s: Snippet) => s.name).sort()).toEqual(['Multi', 'TS'])
  })
})

describe('importSnippets', () => {
  it('imports snippets, reassigns ids/flags, and returns the count', () => {
    const json = JSON.stringify({
      snippets: [
        { name: 'I1', prefix: 'i1', body: 'b', language: 'ts', tags: [], isBuiltIn: true, useCount: 5, id: 'old-1' },
        { name: 'I2', prefix: 'i2', body: 'b', language: 'js', tags: [] },
      ],
      version: 1,
    })
    const count = store.getState().importSnippets(json)
    expect(count).toBe(2)
    const imported = store.getState().snippets
    expect(imported).toHaveLength(2)
    expect(imported.every(s => s.id.startsWith('snip-imported-'))).toBe(true)
    expect(imported.every(s => s.isBuiltIn === false)).toBe(true)
    expect(imported.every(s => s.useCount === 0)).toBe(true)
  })

  it('appends to existing snippets rather than replacing them', () => {
    store.getState().addSnippet(makeInput({ name: 'Pre' }))
    store.getState().importSnippets(JSON.stringify({ snippets: [{ name: 'New', prefix: 'n', body: 'b', language: 'ts', tags: [] }] }))
    expect(store.getState().snippets.map(s => s.name).sort()).toEqual(['New', 'Pre'])
  })

  it('returns 0 for invalid JSON', () => {
    expect(store.getState().importSnippets('{not json')).toBe(0)
    expect(store.getState().snippets).toHaveLength(0)
  })

  it('returns 0 when snippets field is missing or not an array', () => {
    expect(store.getState().importSnippets(JSON.stringify({ version: 1 }))).toBe(0)
    expect(store.getState().importSnippets(JSON.stringify({ snippets: 'oops' }))).toBe(0)
    expect(store.getState().snippets).toHaveLength(0)
  })
})

describe('importVSCodeSnippets', () => {
  it('converts a VS Code snippet object, joining body arrays and taking first prefix', () => {
    const vscode = JSON.stringify({
      'Print to console': {
        prefix: ['log', 'cl'],
        body: ['console.log($1);', '$2'],
        description: 'Log output to console',
      },
      'Simple': {
        prefix: 'sp',
        body: 'doThing();',
      },
    })
    const count = store.getState().importVSCodeSnippets(vscode, 'typescript')
    expect(count).toBe(2)
    const printer = store.getState().snippets.find(s => s.name === 'Print to console')!
    expect(printer.prefix).toBe('log') // first element of prefix array
    expect(printer.body).toBe('console.log($1);\n$2') // joined with \n
    expect(printer.description).toBe('Log output to console')
    expect(printer.language).toBe('typescript')
    expect(printer.tags).toEqual([])
    expect(printer.isBuiltIn).toBe(false)
    expect(printer.id).toMatch(/^snip-vsc-/)

    const simple = store.getState().snippets.find(s => s.name === 'Simple')!
    expect(simple.prefix).toBe('sp')
    expect(simple.body).toBe('doThing();')
  })

  it('returns 0 for invalid JSON and adds nothing', () => {
    expect(store.getState().importVSCodeSnippets('not-json', 'ts')).toBe(0)
    expect(store.getState().snippets).toHaveLength(0)
  })

  it('returns 0 for an empty object', () => {
    expect(store.getState().importVSCodeSnippets('{}', 'ts')).toBe(0)
  })
})

/* ── settings setters ───────────────────────────────────── */

describe('settings setters', () => {
  it('setSortBy / setFilterLanguage / setFilterCategory / setSearchQuery update state', () => {
    store.getState().setSortBy('frequency')
    store.getState().setFilterLanguage('go')
    store.getState().setFilterCategory('react')
    store.getState().setSearchQuery('foo')
    const s = store.getState()
    expect(s.sortBy).toBe('frequency')
    expect(s.filterLanguage).toBe('go')
    expect(s.filterCategory).toBe('react')
    expect(s.searchQuery).toBe('foo')
  })

  it('filter values can be cleared back to null', () => {
    store.getState().setFilterLanguage('go')
    store.getState().setFilterLanguage(null)
    expect(store.getState().filterLanguage).toBeNull()
  })
})

/* ── persistence ────────────────────────────────────────── */

describe('persistence', () => {
  it('writes snippets/categories/sortBy to localStorage under "orion-snippets"', async () => {
    store.getState().addSnippet(makeInput({ name: 'Persisted' }))
    store.getState().setSortBy('frequency')

    // zustand persist writes asynchronously via a microtask; flush it.
    await Promise.resolve()

    const raw = localStorage.getItem('orion-snippets')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.state.sortBy).toBe('frequency')
    expect(parsed.state.snippets.map((s: Snippet) => s.name)).toEqual(['Persisted'])
    expect(parsed.state.categories).toBeDefined()
    // partialize excludes transient filter/search state
    expect(parsed.state.filterLanguage).toBeUndefined()
    expect(parsed.state.searchQuery).toBeUndefined()
  })
})
