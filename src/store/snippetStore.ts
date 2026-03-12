/**
 * Snippet management store.
 * Manages user snippets, snippet categories, import/export,
 * and recently used snippets with search.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/* ── Types ─────────────────────────────────────────────── */

export interface Snippet {
  id: string
  name: string
  prefix: string
  body: string
  description?: string
  language: string | string[]
  category?: string
  tags: string[]
  isBuiltIn: boolean
  useCount: number
  lastUsed?: number
  createdAt: number
  updatedAt: number
  author?: string
  version?: string
}

export interface SnippetCategory {
  id: string
  name: string
  color: string
  snippetCount: number
}

export type SnippetSortBy = 'name' | 'prefix' | 'recent' | 'frequency' | 'category'

/* ── Store ─────────────────────────────────────────────── */

interface SnippetStoreState {
  snippets: Snippet[]
  categories: SnippetCategory[]
  sortBy: SnippetSortBy
  filterLanguage: string | null
  filterCategory: string | null
  searchQuery: string

  // CRUD
  addSnippet: (snippet: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt' | 'useCount' | 'isBuiltIn'>) => string
  updateSnippet: (id: string, updates: Partial<Snippet>) => void
  deleteSnippet: (id: string) => void
  duplicateSnippet: (id: string) => string
  recordUse: (id: string) => void

  // Categories
  addCategory: (name: string, color?: string) => string
  deleteCategory: (id: string) => void
  renameCategory: (id: string, name: string) => void

  // Queries
  getSnippetsByLanguage: (language: string) => Snippet[]
  getSnippetsByPrefix: (prefix: string, language?: string) => Snippet[]
  searchSnippets: (query: string) => Snippet[]
  getRecentSnippets: (limit?: number) => Snippet[]
  getMostUsedSnippets: (limit?: number) => Snippet[]
  getFilteredSnippets: () => Snippet[]

  // Import/Export
  exportSnippets: (language?: string) => string
  importSnippets: (json: string) => number
  importVSCodeSnippets: (json: string, language: string) => number

  // Settings
  setSortBy: (sort: SnippetSortBy) => void
  setFilterLanguage: (lang: string | null) => void
  setFilterCategory: (cat: string | null) => void
  setSearchQuery: (query: string) => void
}

/* ── Default Categories ────────────────────────────────── */

const DEFAULT_CATEGORIES: SnippetCategory[] = [
  { id: 'general', name: 'General', color: '#58a6ff', snippetCount: 0 },
  { id: 'react', name: 'React', color: '#61dafb', snippetCount: 0 },
  { id: 'testing', name: 'Testing', color: '#2ea043', snippetCount: 0 },
  { id: 'logging', name: 'Logging', color: '#d29922', snippetCount: 0 },
  { id: 'error-handling', name: 'Error Handling', color: '#f85149', snippetCount: 0 },
]

/* ── Store Implementation ──────────────────────────────── */

export const useSnippetStore = create<SnippetStoreState>()(
  persist(
    (set, get) => ({
      snippets: [],
      categories: DEFAULT_CATEGORIES,
      sortBy: 'name' as SnippetSortBy,
      filterLanguage: null,
      filterCategory: null,
      searchQuery: '',

      addSnippet: (snippet) => {
        const id = `snip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const now = Date.now()
        const full: Snippet = {
          ...snippet,
          id,
          isBuiltIn: false,
          useCount: 0,
          createdAt: now,
          updatedAt: now,
        }
        set(s => ({ snippets: [...s.snippets, full] }))
        return id
      },

      updateSnippet: (id, updates) => {
        set(s => ({
          snippets: s.snippets.map(sn =>
            sn.id === id ? { ...sn, ...updates, updatedAt: Date.now() } : sn
          ),
        }))
      },

      deleteSnippet: (id) => {
        set(s => ({ snippets: s.snippets.filter(sn => sn.id !== id) }))
      },

      duplicateSnippet: (id) => {
        const original = get().snippets.find(s => s.id === id)
        if (!original) return ''
        return get().addSnippet({
          ...original,
          name: `${original.name} (copy)`,
          prefix: `${original.prefix}_copy`,
          tags: [...original.tags],
          language: Array.isArray(original.language) ? [...original.language] : original.language,
        })
      },

      recordUse: (id) => {
        set(s => ({
          snippets: s.snippets.map(sn =>
            sn.id === id
              ? { ...sn, useCount: sn.useCount + 1, lastUsed: Date.now() }
              : sn
          ),
        }))
      },

      addCategory: (name, color) => {
        const id = `cat-${Date.now()}`
        set(s => ({
          categories: [...s.categories, {
            id,
            name,
            color: color || '#8b949e',
            snippetCount: 0,
          }],
        }))
        return id
      },

      deleteCategory: (id) => {
        set(s => ({
          categories: s.categories.filter(c => c.id !== id),
          snippets: s.snippets.map(sn =>
            sn.category === id ? { ...sn, category: undefined } : sn
          ),
        }))
      },

      renameCategory: (id, name) => {
        set(s => ({
          categories: s.categories.map(c => c.id === id ? { ...c, name } : c),
        }))
      },

      getSnippetsByLanguage: (language) => {
        return get().snippets.filter(s => {
          const langs = Array.isArray(s.language) ? s.language : [s.language]
          return langs.includes(language) || langs.includes('*')
        })
      },

      getSnippetsByPrefix: (prefix, language) => {
        const lower = prefix.toLowerCase()
        return get().snippets.filter(s => {
          if (!s.prefix.toLowerCase().startsWith(lower)) return false
          if (language) {
            const langs = Array.isArray(s.language) ? s.language : [s.language]
            return langs.includes(language) || langs.includes('*')
          }
          return true
        })
      },

      searchSnippets: (query) => {
        const lower = query.toLowerCase()
        return get().snippets.filter(s =>
          s.name.toLowerCase().includes(lower) ||
          s.prefix.toLowerCase().includes(lower) ||
          s.body.toLowerCase().includes(lower) ||
          (s.description || '').toLowerCase().includes(lower) ||
          s.tags.some(t => t.toLowerCase().includes(lower))
        )
      },

      getRecentSnippets: (limit = 10) => {
        return [...get().snippets]
          .filter(s => s.lastUsed)
          .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
          .slice(0, limit)
      },

      getMostUsedSnippets: (limit = 10) => {
        return [...get().snippets]
          .sort((a, b) => b.useCount - a.useCount)
          .slice(0, limit)
      },

      getFilteredSnippets: () => {
        const { snippets, filterLanguage, filterCategory, searchQuery, sortBy } = get()
        let filtered = [...snippets]

        if (filterLanguage) {
          filtered = filtered.filter(s => {
            const langs = Array.isArray(s.language) ? s.language : [s.language]
            return langs.includes(filterLanguage) || langs.includes('*')
          })
        }

        if (filterCategory) {
          filtered = filtered.filter(s => s.category === filterCategory)
        }

        if (searchQuery) {
          const lower = searchQuery.toLowerCase()
          filtered = filtered.filter(s =>
            s.name.toLowerCase().includes(lower) ||
            s.prefix.toLowerCase().includes(lower) ||
            (s.description || '').toLowerCase().includes(lower)
          )
        }

        filtered.sort((a, b) => {
          switch (sortBy) {
            case 'name': return a.name.localeCompare(b.name)
            case 'prefix': return a.prefix.localeCompare(b.prefix)
            case 'recent': return (b.lastUsed || 0) - (a.lastUsed || 0)
            case 'frequency': return b.useCount - a.useCount
            case 'category': return (a.category || '').localeCompare(b.category || '')
            default: return 0
          }
        })

        return filtered
      },

      exportSnippets: (language) => {
        let snippets = get().snippets.filter(s => !s.isBuiltIn)
        if (language) {
          snippets = snippets.filter(s => {
            const langs = Array.isArray(s.language) ? s.language : [s.language]
            return langs.includes(language)
          })
        }
        return JSON.stringify({ snippets, version: 1 }, null, 2)
      },

      importSnippets: (json) => {
        try {
          const data = JSON.parse(json)
          if (!Array.isArray(data.snippets)) return 0

          const imported = data.snippets.map((s: any) => ({
            ...s,
            id: `snip-imported-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            isBuiltIn: false,
            useCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }))

          set(s => ({ snippets: [...s.snippets, ...imported] }))
          return imported.length
        } catch {
          return 0
        }
      },

      importVSCodeSnippets: (json, language) => {
        try {
          const data = JSON.parse(json)
          const imported: Snippet[] = []

          for (const [name, def] of Object.entries(data)) {
            const d = def as any
            imported.push({
              id: `snip-vsc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name,
              prefix: Array.isArray(d.prefix) ? d.prefix[0] : d.prefix,
              body: Array.isArray(d.body) ? d.body.join('\n') : d.body,
              description: d.description,
              language,
              category: undefined,
              tags: [],
              isBuiltIn: false,
              useCount: 0,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
          }

          set(s => ({ snippets: [...s.snippets, ...imported] }))
          return imported.length
        } catch {
          return 0
        }
      },

      setSortBy: (sort) => set({ sortBy: sort }),
      setFilterLanguage: (lang) => set({ filterLanguage: lang }),
      setFilterCategory: (cat) => set({ filterCategory: cat }),
      setSearchQuery: (query) => set({ searchQuery: query }),
    }),
    {
      name: 'orion-snippets',
      partialize: (state) => ({
        snippets: state.snippets,
        categories: state.categories,
        sortBy: state.sortBy,
      }),
    }
  )
)
