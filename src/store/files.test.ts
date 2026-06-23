/** @vitest-environment jsdom */
//
// IMPORTANT NOTE ON SCOPE
// -----------------------
// The task prompt described this module as an "open-files / tabs store" with
// tab ordering, dirty tracking, active-file selection, etc. The actual store at
// src/store/files.ts is NOT that store. It is a FILE-TREE / file-operations /
// search / metadata store. It has no concept of open tabs, dirty buffers, an
// active file, or content editing.
//
// These tests therefore cover the behaviors this store ACTUALLY implements:
//   - file-watch event handling (create / delete / change against the tree)
//   - tree file operations (copy/move/folder move/duplicate/trash/template)  [IPC-bound]
//   - search + quickOpen (fuzzy) + frecency recent-files tracking
//   - file metadata / large-file / binary / encoding detection
//   - templates registry
//
// The IPC namespace is `window.electronAPI` (not `window.api`).
//
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileNode } from '@shared/types'
import { useFileStore } from './files'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ElectronAPI = Record<string, ReturnType<typeof vi.fn>>

function getApi(): ElectronAPI {
  return (window as unknown as { electronAPI: ElectronAPI }).electronAPI
}

/** Build a small POSIX-path tree used by most tests. */
function sampleTree(): FileNode[] {
  return [
    {
      name: 'src',
      path: '/proj/src',
      type: 'directory',
      children: [
        { name: 'index.ts', path: '/proj/src/index.ts', type: 'file' },
        { name: 'util.ts', path: '/proj/src/util.ts', type: 'file' },
        {
          name: 'components',
          path: '/proj/src/components',
          type: 'directory',
          children: [
            { name: 'Button.tsx', path: '/proj/src/components/Button.tsx', type: 'file' },
          ],
        },
      ],
    },
    { name: 'readme.md', path: '/proj/readme.md', type: 'file' },
  ]
}

const st = () => useFileStore.getState()

// Capture the pristine initial state once, before any test mutates it.
const INITIAL = {
  rootPath: useFileStore.getState().rootPath,
  fileTree: useFileStore.getState().fileTree,
  expandedDirs: useFileStore.getState().expandedDirs,
  watchedPaths: useFileStore.getState().watchedPaths,
  isWatching: useFileStore.getState().isWatching,
  searchQuery: useFileStore.getState().searchQuery,
  searchResults: useFileStore.getState().searchResults,
  recentFiles: useFileStore.getState().recentFiles,
  fileMetadataCache: useFileStore.getState().fileMetadataCache,
}

beforeEach(() => {
  // Reset only the DATA fields. Never use replace:true (it would wipe actions).
  useFileStore.setState({
    rootPath: null,
    fileTree: [],
    expandedDirs: new Set<string>(),
    watchedPaths: new Set<string>(),
    isWatching: false,
    searchQuery: '',
    searchResults: [],
    recentFiles: [],
    fileMetadataCache: new Map(),
    templates: [...INITIAL_TEMPLATES_SNAPSHOT],
  })

  // Stub the IPC bridge with exactly the methods the store calls.
  const api: ElectronAPI = {
    watchDirectory: vi.fn(),
    unwatchAll: vi.fn(),
    unwatchPath: vi.fn(),
    onFileWatchEvent: vi.fn(),
    copyFile: vi.fn().mockResolvedValue({ success: true }),
    copyFolder: vi.fn().mockResolvedValue({ success: true }),
    moveFile: vi.fn().mockResolvedValue({ success: true }),
    moveFolder: vi.fn().mockResolvedValue({ success: true }),
    writeFile: vi.fn().mockResolvedValue({ success: true }),
    trashItem: vi.fn().mockResolvedValue({ success: true }),
    convertEncodingSync: vi.fn(),
  }
  ;(window as unknown as { electronAPI: ElectronAPI }).electronAPI = api
})

// Snapshot the built-in templates so beforeEach can restore them even after a
// test mutates the templates array. We read them lazily from the live store the
// first time this module loads.
const INITIAL_TEMPLATES_SNAPSHOT = [...useFileStore.getState().templates]

describe('files store: sanity / reset', () => {
  it('resets data fields without destroying actions', () => {
    expect(st().fileTree).toEqual([])
    expect(typeof st().toggleDir).toBe('function')
    expect(typeof st().searchFiles).toBe('function')
    expect(typeof st().analyzeFile).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// Directory expansion
// ---------------------------------------------------------------------------

describe('toggleDir', () => {
  it('adds then removes a path on successive toggles', () => {
    st().toggleDir('/proj/src')
    expect(st().expandedDirs.has('/proj/src')).toBe(true)
    st().toggleDir('/proj/src')
    expect(st().expandedDirs.has('/proj/src')).toBe(false)
  })

  it('produces a NEW Set instance each toggle (immutability)', () => {
    const before = st().expandedDirs
    st().toggleDir('/x')
    expect(st().expandedDirs).not.toBe(before)
  })
})

// ---------------------------------------------------------------------------
// File watching (IPC registration + lifecycle)
// ---------------------------------------------------------------------------

describe('file watching', () => {
  it('startWatching registers the root, sets isWatching, and wires the listener', () => {
    st().startWatching('/proj')
    expect(st().isWatching).toBe(true)
    expect(st().watchedPaths.has('/proj')).toBe(true)
    expect(getApi().watchDirectory).toHaveBeenCalledWith('/proj')
    expect(getApi().onFileWatchEvent).toHaveBeenCalledTimes(1)
  })

  it('startWatching is a no-op when already watching', () => {
    st().startWatching('/proj')
    getApi().watchDirectory.mockClear()
    st().startWatching('/other')
    expect(getApi().watchDirectory).not.toHaveBeenCalled()
    expect(st().watchedPaths.has('/other')).toBe(false)
  })

  it('stopWatching clears state and calls unwatchAll', () => {
    st().startWatching('/proj')
    st().stopWatching()
    expect(st().isWatching).toBe(false)
    expect(st().watchedPaths.size).toBe(0)
    expect(getApi().unwatchAll).toHaveBeenCalledTimes(1)
  })

  it('stopWatching is a no-op when not watching', () => {
    st().stopWatching()
    expect(getApi().unwatchAll).not.toHaveBeenCalled()
  })

  it('addWatchedPath / removeWatchedPath update set and call IPC', () => {
    st().addWatchedPath('/proj/sub')
    expect(st().watchedPaths.has('/proj/sub')).toBe(true)
    expect(getApi().watchDirectory).toHaveBeenCalledWith('/proj/sub')

    st().removeWatchedPath('/proj/sub')
    expect(st().watchedPaths.has('/proj/sub')).toBe(false)
    expect(getApi().unwatchPath).toHaveBeenCalledWith('/proj/sub')
  })
})

describe('handleFileWatchEvent', () => {
  beforeEach(() => {
    useFileStore.setState({ fileTree: sampleTree() })
  })

  it('create inserts a new file node under its parent directory (sorted)', () => {
    st().handleFileWatchEvent({ type: 'create', path: '/proj/src/aaa.ts', isDirectory: false })
    const src = st().fileTree[0]
    const names = src.children!.map((c) => c.name)
    // directories sort first, then alphabetical files
    expect(names).toEqual(['components', 'aaa.ts', 'index.ts', 'util.ts'])
    const added = src.children!.find((c) => c.name === 'aaa.ts')!
    expect(added.type).toBe('file')
    expect(added.children).toBeUndefined()
  })

  it('create with isDirectory:true inserts a directory node with empty children', () => {
    st().handleFileWatchEvent({ type: 'create', path: '/proj/src/newdir', isDirectory: true })
    const newdir = st().fileTree[0].children!.find((c) => c.name === 'newdir')!
    expect(newdir.type).toBe('directory')
    expect(newdir.children).toEqual([])
  })

  it('delete removes the node and prunes expandedDirs + metadata cache', () => {
    useFileStore.setState({
      expandedDirs: new Set(['/proj/src/components']),
      fileMetadataCache: new Map([
        ['/proj/src/components', { size: 0, isLargeFile: false, isBinary: false, encoding: 'utf-8', hasBOM: false, contentDeferred: false }],
      ]) as never,
    })
    st().handleFileWatchEvent({ type: 'delete', path: '/proj/src/components' })
    const src = st().fileTree[0]
    expect(src.children!.find((c) => c.name === 'components')).toBeUndefined()
    expect(st().expandedDirs.has('/proj/src/components')).toBe(false)
    expect(st().fileMetadataCache.has('/proj/src/components')).toBe(false)
  })

  it('change replaces the tree reference when the node exists (refresh signal)', () => {
    const before = st().fileTree
    st().handleFileWatchEvent({ type: 'change', path: '/proj/src/index.ts' })
    expect(st().fileTree).not.toBe(before)
  })

  it('change for an unknown path does NOT replace the tree reference', () => {
    // Current behavior: set({fileTree}) only runs when findNode hits.
    const before = st().fileTree
    st().handleFileWatchEvent({ type: 'change', path: '/proj/does-not-exist.ts' })
    expect(st().fileTree).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// File operations (IPC-bound, with optimistic tree updates)
// ---------------------------------------------------------------------------

describe('copyFile', () => {
  beforeEach(() => useFileStore.setState({ fileTree: sampleTree() }))

  it('calls IPC copyFile and optimistically inserts the destination node', async () => {
    await st().copyFile('/proj/src/index.ts', '/proj/src/index.copy.ts')
    expect(getApi().copyFile).toHaveBeenCalledWith('/proj/src/index.ts', '/proj/src/index.copy.ts')
    const src = st().fileTree[0]
    expect(src.children!.some((c) => c.path === '/proj/src/index.copy.ts')).toBe(true)
  })

  it('propagates IPC rejection and leaves the tree unchanged', async () => {
    getApi().copyFile.mockRejectedValueOnce(new Error('eacces'))
    const before = st().fileTree
    await expect(st().copyFile('/proj/src/index.ts', '/proj/src/x.ts')).rejects.toThrow('eacces')
    expect(st().fileTree).toBe(before)
  })

  it('does not insert when the source node is absent from the tree', async () => {
    await st().copyFile('/proj/ghost.ts', '/proj/ghost.copy.ts')
    expect(getApi().copyFile).toHaveBeenCalled()
    // Tree should not gain a node for a missing source
    const found = st().fileTree.some((n) => n.path === '/proj/ghost.copy.ts')
    expect(found).toBe(false)
  })
})

describe('duplicateFile', () => {
  beforeEach(() => useFileStore.setState({ fileTree: sampleTree() }))

  it('generates "<name>-copy.<ext>" and delegates to copyFile', async () => {
    await st().duplicateFile('/proj/src/util.ts')
    expect(getApi().copyFile).toHaveBeenCalledWith('/proj/src/util.ts', '/proj/src/util-copy.ts')
  })

  it('avoids collisions by incrementing the suffix', async () => {
    // Seed the tree with the first-choice duplicate name so it must bump to -2.
    const tree = sampleTree()
    tree[0].children!.push({ name: 'util-copy.ts', path: '/proj/src/util-copy.ts', type: 'file' })
    useFileStore.setState({ fileTree: tree })

    await st().duplicateFile('/proj/src/util.ts')
    expect(getApi().copyFile).toHaveBeenCalledWith('/proj/src/util.ts', '/proj/src/util-copy-2.ts')
  })
})

describe('moveFile', () => {
  beforeEach(() => useFileStore.setState({ fileTree: sampleTree() }))

  it('removes source, inserts destination, and rewrites recentFiles + metadata cache', async () => {
    useFileStore.setState({
      recentFiles: [
        { path: '/proj/src/util.ts', name: 'util.ts', lastAccessed: 1, accessCount: 1, score: 1 },
      ],
      fileMetadataCache: new Map([
        ['/proj/src/util.ts', { size: 5, isLargeFile: false, isBinary: false, encoding: 'utf-8', hasBOM: false, contentDeferred: false }],
      ]) as never,
    })

    await st().moveFile('/proj/src/util.ts', '/proj/src/util.renamed.ts')

    expect(getApi().moveFile).toHaveBeenCalledWith('/proj/src/util.ts', '/proj/src/util.renamed.ts')
    const src = st().fileTree[0]
    expect(src.children!.some((c) => c.path === '/proj/src/util.ts')).toBe(false)
    expect(src.children!.some((c) => c.path === '/proj/src/util.renamed.ts')).toBe(true)

    expect(st().recentFiles[0].path).toBe('/proj/src/util.renamed.ts')
    expect(st().recentFiles[0].name).toBe('util.renamed.ts')

    expect(st().fileMetadataCache.has('/proj/src/util.ts')).toBe(false)
    expect(st().fileMetadataCache.get('/proj/src/util.renamed.ts')?.size).toBe(5)
  })
})

describe('moveFolder', () => {
  beforeEach(() => useFileStore.setState({ fileTree: sampleTree() }))

  it('rebases the subtree paths and remaps expandedDirs under the new base', async () => {
    useFileStore.setState({
      expandedDirs: new Set(['/proj/src/components', '/proj/other']),
    })

    await st().moveFolder('/proj/src/components', '/proj/widgets')
    expect(getApi().moveFolder).toHaveBeenCalledWith('/proj/src/components', '/proj/widgets')

    // The moved folder lands at the top level (parentDir('/proj/widgets') === '/proj',
    // which is not a directory node in the tree, so insertNode won't place it under one;
    // current behavior: removed from old location, paths rebased). Assert the rebase + expandedDirs.
    expect(st().expandedDirs.has('/proj/widgets')).toBe(true)
    expect(st().expandedDirs.has('/proj/src/components')).toBe(false)
    expect(st().expandedDirs.has('/proj/other')).toBe(true)
  })
})

describe('createFileFromTemplate', () => {
  beforeEach(() => useFileStore.setState({ fileTree: sampleTree() }))

  it('writes the template content via IPC and inserts the new node', async () => {
    await st().createFileFromTemplate('/proj/src', 'New.tsx', 'react-component')
    const tmpl = INITIAL_TEMPLATES_SNAPSHOT.find((t) => t.id === 'react-component')!
    expect(getApi().writeFile).toHaveBeenCalledWith('/proj/src/New.tsx', tmpl.content)
    const src = st().fileTree[0]
    expect(src.children!.some((c) => c.path === '/proj/src/New.tsx')).toBe(true)
  })

  it('throws for an unknown template id and writes nothing', async () => {
    await expect(
      st().createFileFromTemplate('/proj/src', 'x.ts', 'no-such-template')
    ).rejects.toThrow(/not found/)
    expect(getApi().writeFile).not.toHaveBeenCalled()
  })

  it('throws when IPC writeFile reports success:false', async () => {
    getApi().writeFile.mockResolvedValueOnce({ success: false, error: 'disk full' })
    await expect(
      st().createFileFromTemplate('/proj/src', 'x.ts', 'typescript-module')
    ).rejects.toThrow('disk full')
  })
})

describe('moveToTrash', () => {
  beforeEach(() => useFileStore.setState({ fileTree: sampleTree() }))

  it('removes the node and prunes descendants from expandedDirs, metadata, and recentFiles', async () => {
    useFileStore.setState({
      // A sibling whose path shares the trashed prefix must survive (not "/proj/src/components").
      expandedDirs: new Set(['/proj/src/components', '/proj/src/components/deep', '/proj/src/components-old']),
      recentFiles: [
        { path: '/proj/src/components/Button.tsx', name: 'Button.tsx', lastAccessed: 1, accessCount: 1, score: 1 },
        { path: '/proj/readme.md', name: 'readme.md', lastAccessed: 1, accessCount: 1, score: 1 },
      ],
      fileMetadataCache: new Map([
        ['/proj/src/components/Button.tsx', { size: 1, isLargeFile: false, isBinary: false, encoding: 'utf-8', hasBOM: false, contentDeferred: false }],
        ['/proj/src/components-old/Old.tsx', { size: 2, isLargeFile: false, isBinary: false, encoding: 'utf-8', hasBOM: false, contentDeferred: false }],
      ]) as never,
    })

    await st().moveToTrash('/proj/src/components')
    expect(getApi().trashItem).toHaveBeenCalledWith('/proj/src/components')

    expect(st().fileTree[0].children!.some((c) => c.name === 'components')).toBe(false)
    expect(st().expandedDirs.has('/proj/src/components')).toBe(false)
    expect(st().expandedDirs.has('/proj/src/components/deep')).toBe(false)
    // Descendant caches are pruned along with the directory.
    expect(st().fileMetadataCache.has('/proj/src/components/Button.tsx')).toBe(false)
    expect(st().recentFiles.some((f) => f.path === '/proj/src/components/Button.tsx')).toBe(false)
    expect(st().recentFiles.some((f) => f.path === '/proj/readme.md')).toBe(true)
    // The prefix-sharing sibling is untouched.
    expect(st().expandedDirs.has('/proj/src/components-old')).toBe(true)
    expect(st().fileMetadataCache.has('/proj/src/components-old/Old.tsx')).toBe(true)
  })

  it('propagates IPC rejection', async () => {
    getApi().trashItem.mockRejectedValueOnce(new Error('locked'))
    await expect(st().moveToTrash('/proj/readme.md')).rejects.toThrow('locked')
  })
})

// ---------------------------------------------------------------------------
// Search & quick-open
// ---------------------------------------------------------------------------

describe('searchFiles', () => {
  beforeEach(() => useFileStore.setState({ fileTree: sampleTree() }))

  it('matches by name substring (case-insensitive)', () => {
    const res = st().searchFiles('button')
    expect(res.map((r) => r.path)).toContain('/proj/src/components/Button.tsx')
  })

  it('matches by path substring', () => {
    const res = st().searchFiles('components')
    expect(res.every((r) => r.path.includes('components'))).toBe(true)
    expect(res.length).toBe(1)
  })

  it('applies an extension type filter', () => {
    const res = st().searchFiles('', 'md')
    // empty query matches every name (''.includes always true), filter narrows to .md
    expect(res.map((r) => r.path)).toEqual(['/proj/readme.md'])
  })

  it('only returns file nodes, never directories', () => {
    const res = st().searchFiles('src')
    expect(res.every((r) => r.type === 'file')).toBe(true)
  })
})

describe('setSearchQuery', () => {
  beforeEach(() => useFileStore.setState({ fileTree: sampleTree() }))

  it('stores the query and computes results', () => {
    st().setSearchQuery('util')
    expect(st().searchQuery).toBe('util')
    expect(st().searchResults.some((r) => r.name === 'util.ts')).toBe(true)
  })

  it('clears results when the query is empty', () => {
    st().setSearchQuery('util')
    st().setSearchQuery('')
    expect(st().searchResults).toEqual([])
  })
})

describe('quickOpen (fuzzy)', () => {
  beforeEach(() => useFileStore.setState({ fileTree: sampleTree() }))

  it('returns recent files (by score) when the query is empty', () => {
    useFileStore.setState({
      recentFiles: [
        { path: '/a', name: 'a', lastAccessed: 1, accessCount: 1, score: 9 },
        { path: '/b', name: 'b', lastAccessed: 1, accessCount: 1, score: 3 },
      ],
    })
    const res = st().quickOpen('')
    expect(res.map((r) => r.path)).toEqual(['/a', '/b'])
    expect(res[0].matchScore).toBe(9)
  })

  it('ranks fuzzy matches and excludes non-matches', () => {
    const res = st().quickOpen('btn')
    // "btn" fuzzy-matches Button.tsx (b..t..n) but not readme.md
    expect(res.some((r) => r.name === 'Button.tsx')).toBe(true)
    expect(res.some((r) => r.name === 'readme.md')).toBe(false)
  })

  it('boosts files present in recentFiles', () => {
    // index.ts and util.ts both fuzzy-match "t". Give util.ts a recent boost and
    // confirm it outranks index.ts.
    useFileStore.setState({
      recentFiles: [
        { path: '/proj/src/util.ts', name: 'util.ts', lastAccessed: Date.now(), accessCount: 50, score: 1000 },
      ],
    })
    const res = st().quickOpen('util')
    expect(res[0].path).toBe('/proj/src/util.ts')
  })
})

// ---------------------------------------------------------------------------
// Frecency / recent files
// ---------------------------------------------------------------------------

describe('recordFileAccess & recent files', () => {
  it('adds a new entry with accessCount 1 on first access', () => {
    st().recordFileAccess('/proj/a.ts', 'a.ts')
    const entry = st().recentFiles.find((f) => f.path === '/proj/a.ts')!
    expect(entry.accessCount).toBe(1)
    expect(entry.score).toBeGreaterThan(0)
  })

  it('increments accessCount on repeat access without duplicating the entry', () => {
    st().recordFileAccess('/proj/a.ts', 'a.ts')
    st().recordFileAccess('/proj/a.ts', 'a.ts')
    const entries = st().recentFiles.filter((f) => f.path === '/proj/a.ts')
    expect(entries.length).toBe(1)
    expect(entries[0].accessCount).toBe(2)
  })

  it('keeps the list sorted by score descending', () => {
    st().recordFileAccess('/low.ts', 'low.ts')
    // bump /high.ts twice so its count/score exceeds /low.ts
    st().recordFileAccess('/high.ts', 'high.ts')
    st().recordFileAccess('/high.ts', 'high.ts')
    const scores = st().recentFiles.map((f) => f.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect(st().recentFiles[0].path).toBe('/high.ts')
  })

  it('caps the recent list at MAX_RECENT_FILES (50)', () => {
    for (let i = 0; i < 60; i++) st().recordFileAccess(`/f${i}.ts`, `f${i}.ts`)
    expect(st().recentFiles.length).toBe(50)
  })

  it('getRecentFiles recomputes scores and respects the limit', () => {
    st().recordFileAccess('/a.ts', 'a.ts')
    st().recordFileAccess('/b.ts', 'b.ts')
    st().recordFileAccess('/c.ts', 'c.ts')
    expect(st().getRecentFiles(2).length).toBe(2)
  })

  it('clearRecentFiles empties the list', () => {
    st().recordFileAccess('/a.ts', 'a.ts')
    st().clearRecentFiles()
    expect(st().recentFiles).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// File metadata / large-file / binary / encoding
// ---------------------------------------------------------------------------

describe('analyzeFile & metadata cache', () => {
  it('flags large files over the 1MB threshold and defers content', () => {
    const meta = st().analyzeFile('/big.bin', 2_000_000)
    expect(meta.isLargeFile).toBe(true)
    expect(meta.contentDeferred).toBe(true)
    expect(st().getFileMetadata('/big.bin')).toEqual(meta)
    expect(st().isLargeFile('/big.bin')).toBe(true)
  })

  it('treats small text files as non-large, non-deferred', () => {
    const meta = st().analyzeFile('/small.ts', 100, new Uint8Array([0x68, 0x69])) // "hi"
    expect(meta.isLargeFile).toBe(false)
    expect(meta.isBinary).toBe(false)
    expect(meta.contentDeferred).toBe(false)
    expect(meta.encoding).toBe('ascii')
  })

  it('detects binary content via header bytes and defers it', () => {
    // Mostly NUL bytes -> >10% non-text -> binary
    const bytes = new Uint8Array(100).fill(0)
    const meta = st().analyzeFile('/img.png', 100, bytes)
    expect(meta.isBinary).toBe(true)
    expect(meta.contentDeferred).toBe(true)
    expect(st().isBinaryFile('/img.png')).toBe(true)
  })

  it('isLargeFile / isBinaryFile / getFileMetadata default safely for unknown paths', () => {
    expect(st().isLargeFile('/unknown')).toBe(false)
    expect(st().isBinaryFile('/unknown')).toBe(false)
    expect(st().getFileMetadata('/unknown')).toBeNull()
  })

  it('clearMetadataCache empties the cache', () => {
    st().analyzeFile('/a', 1)
    st().clearMetadataCache()
    expect(st().getFileMetadata('/a')).toBeNull()
  })
})

describe('detectFileEncoding', () => {
  it('detects a UTF-8 BOM', () => {
    expect(st().detectFileEncoding(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toEqual({
      encoding: 'utf-8',
      hasBOM: true,
    })
  })

  it('detects a UTF-16LE BOM', () => {
    expect(st().detectFileEncoding(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))).toEqual({
      encoding: 'utf-16le',
      hasBOM: true,
    })
  })

  it('detects a UTF-16BE BOM', () => {
    expect(st().detectFileEncoding(new Uint8Array([0xfe, 0xff, 0x00, 0x41]))).toEqual({
      encoding: 'utf-16be',
      hasBOM: true,
    })
  })

  it('classifies pure ASCII as ascii without a BOM', () => {
    expect(st().detectFileEncoding(new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]))).toEqual({
      encoding: 'ascii',
      hasBOM: false,
    })
  })

  it('classifies high bytes (no BOM) as utf-8', () => {
    expect(st().detectFileEncoding(new Uint8Array([0xc3, 0xa9]))).toEqual({
      encoding: 'utf-8',
      hasBOM: false,
    })
  })
})

describe('convertEncoding', () => {
  it('delegates to the IPC convertEncodingSync bridge when it returns a string', () => {
    getApi().convertEncodingSync.mockReturnValueOnce('CONVERTED')
    const out = st().convertEncoding('hello', 'utf-8', 'utf-16le')
    expect(getApi().convertEncodingSync).toHaveBeenCalledWith('hello', 'utf-8', 'utf-16le')
    expect(out).toBe('CONVERTED')
  })

  it('falls back to a UTF-8 round-trip when IPC is unavailable', () => {
    getApi().convertEncodingSync.mockReturnValueOnce(undefined)
    expect(st().convertEncoding('hello', 'utf-16le', 'utf-8')).toBe('hello')
  })

  it('returns content unchanged for unsupported target encodings', () => {
    getApi().convertEncodingSync.mockReturnValueOnce(undefined)
    expect(st().convertEncoding('héllo', 'utf-8', 'shift-jis')).toBe('héllo')
  })
})

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

describe('templates', () => {
  it('ships the built-in templates', () => {
    const ids = st().templates.map((t) => t.id)
    expect(ids).toContain('react-component')
    expect(ids).toContain('test-file')
  })

  it('addTemplate appends a custom template', () => {
    const before = st().templates.length
    st().addTemplate({ id: 'custom', label: 'Custom', extension: 'txt', content: 'x' })
    expect(st().templates.length).toBe(before + 1)
    expect(st().templates.find((t) => t.id === 'custom')?.content).toBe('x')
  })

  it('removeTemplate removes by id', () => {
    st().removeTemplate('json-config')
    expect(st().templates.some((t) => t.id === 'json-config')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Simple setters
// ---------------------------------------------------------------------------

describe('setRootPath / setFileTree', () => {
  it('setRootPath stores the path', () => {
    st().setRootPath('/proj')
    expect(st().rootPath).toBe('/proj')
  })

  it('setFileTree replaces the tree', () => {
    const tree = sampleTree()
    st().setFileTree(tree)
    expect(st().fileTree).toBe(tree)
  })
})
