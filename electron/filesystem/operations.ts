import fs from 'fs/promises'
import path from 'path'
import type { FileNode } from '../../shared/types'

const IGNORED = new Set(['node_modules', '.git', '.DS_Store', 'dist', 'dist-electron', '.superpowers'])

export async function readFileContent(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

export async function writeFileContent(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
}

export async function deleteItem(itemPath: string): Promise<void> {
  await fs.rm(itemPath, { recursive: true })
}

export async function renameItem(oldPath: string, newPath: string): Promise<void> {
  await fs.rename(oldPath, newPath)
}

export async function buildFileTree(dirPath: string): Promise<FileNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const nodes: FileNode[] = []

  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue

    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const children = await buildFileTree(fullPath)
      nodes.push({ name: entry.name, path: fullPath, type: 'directory', children })
    } else {
      nodes.push({ name: entry.name, path: fullPath, type: 'file' })
    }
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescriptreact',
    '.js': 'javascript', '.jsx': 'javascriptreact',
    '.json': 'json', '.md': 'markdown', '.html': 'html',
    '.css': 'css', '.scss': 'scss', '.py': 'python',
    '.rs': 'rust', '.go': 'go', '.java': 'java',
    '.c': 'c', '.cpp': 'cpp', '.h': 'c',
    '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
    '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
    '.sql': 'sql', '.graphql': 'graphql', '.xml': 'xml',
    '.svg': 'xml', '.vue': 'vue', '.svelte': 'svelte',
  }
  return map[ext] || 'plaintext'
}
