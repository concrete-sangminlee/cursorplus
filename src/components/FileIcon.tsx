import { FileText, FileCode, FileJson, Image, Film, Music, Archive, Database, FileSpreadsheet, Braces, Hash, Settings, Lock, Terminal as TerminalIcon, Globe, BookOpen, Palette, Box, Cpu, Shield } from 'lucide-react'

interface FileIconProps {
  fileName: string
  size?: number
  style?: React.CSSProperties
}

const ICON_MAP: Record<string, { icon: any; color: string }> = {
  // TypeScript / JavaScript
  'ts': { icon: FileCode, color: '#3178c6' },
  'tsx': { icon: FileCode, color: '#3178c6' },
  'js': { icon: FileCode, color: '#f7df1e' },
  'jsx': { icon: FileCode, color: '#61dafb' },
  'mjs': { icon: FileCode, color: '#f7df1e' },
  'cjs': { icon: FileCode, color: '#f7df1e' },

  // Web
  'html': { icon: Globe, color: '#e34f26' },
  'htm': { icon: Globe, color: '#e34f26' },
  'css': { icon: Palette, color: '#1572b6' },
  'scss': { icon: Palette, color: '#cc6699' },
  'sass': { icon: Palette, color: '#cc6699' },
  'less': { icon: Palette, color: '#1d365d' },
  'svg': { icon: Image, color: '#ffb13b' },

  // Data
  'json': { icon: Braces, color: '#f7df1e' },
  'yaml': { icon: FileText, color: '#cb171e' },
  'yml': { icon: FileText, color: '#cb171e' },
  'xml': { icon: FileText, color: '#e37933' },
  'toml': { icon: FileText, color: '#9c4121' },
  'csv': { icon: FileSpreadsheet, color: '#217346' },

  // Config
  'env': { icon: Lock, color: '#ecd53f' },
  'gitignore': { icon: Settings, color: '#f05032' },
  'eslintrc': { icon: Settings, color: '#4b32c3' },
  'prettierrc': { icon: Settings, color: '#f7b93e' },
  'editorconfig': { icon: Settings, color: '#fefefe' },

  // Languages
  'py': { icon: FileCode, color: '#3776ab' },
  'rb': { icon: FileCode, color: '#cc342d' },
  'go': { icon: FileCode, color: '#00add8' },
  'rs': { icon: FileCode, color: '#dea584' },
  'java': { icon: FileCode, color: '#ed8b00' },
  'kt': { icon: FileCode, color: '#7f52ff' },
  'swift': { icon: FileCode, color: '#f05138' },
  'c': { icon: FileCode, color: '#a8b9cc' },
  'cpp': { icon: FileCode, color: '#00599c' },
  'h': { icon: FileCode, color: '#a8b9cc' },
  'hpp': { icon: FileCode, color: '#00599c' },
  'cs': { icon: FileCode, color: '#239120' },
  'php': { icon: FileCode, color: '#777bb4' },
  'lua': { icon: FileCode, color: '#2c2d72' },
  'dart': { icon: FileCode, color: '#0175c2' },
  'r': { icon: FileCode, color: '#276dc3' },
  'sql': { icon: Database, color: '#e38c00' },

  // Shell
  'sh': { icon: TerminalIcon, color: '#89e051' },
  'bash': { icon: TerminalIcon, color: '#89e051' },
  'zsh': { icon: TerminalIcon, color: '#89e051' },
  'fish': { icon: TerminalIcon, color: '#89e051' },
  'ps1': { icon: TerminalIcon, color: '#012456' },
  'bat': { icon: TerminalIcon, color: '#c1f12e' },
  'cmd': { icon: TerminalIcon, color: '#c1f12e' },

  // Docs
  'md': { icon: BookOpen, color: '#083fa1' },
  'mdx': { icon: BookOpen, color: '#083fa1' },
  'txt': { icon: FileText, color: '#8b949e' },
  'pdf': { icon: FileText, color: '#ec1c24' },
  'doc': { icon: FileText, color: '#2b579a' },
  'docx': { icon: FileText, color: '#2b579a' },

  // Images
  'png': { icon: Image, color: '#a4c639' },
  'jpg': { icon: Image, color: '#a4c639' },
  'jpeg': { icon: Image, color: '#a4c639' },
  'gif': { icon: Image, color: '#a4c639' },
  'webp': { icon: Image, color: '#a4c639' },
  'ico': { icon: Image, color: '#a4c639' },
  'bmp': { icon: Image, color: '#a4c639' },

  // Media
  'mp4': { icon: Film, color: '#f7df1e' },
  'webm': { icon: Film, color: '#f7df1e' },
  'avi': { icon: Film, color: '#f7df1e' },
  'mp3': { icon: Music, color: '#1db954' },
  'wav': { icon: Music, color: '#1db954' },
  'ogg': { icon: Music, color: '#1db954' },

  // Archives
  'zip': { icon: Archive, color: '#e6a817' },
  'tar': { icon: Archive, color: '#e6a817' },
  'gz': { icon: Archive, color: '#e6a817' },
  'rar': { icon: Archive, color: '#e6a817' },
  '7z': { icon: Archive, color: '#e6a817' },

  // Other
  'wasm': { icon: Cpu, color: '#654ff0' },
  'docker': { icon: Box, color: '#2496ed' },
  'dockerfile': { icon: Box, color: '#2496ed' },
  'lock': { icon: Lock, color: '#8b949e' },
}

// Special file names
const SPECIAL_FILES: Record<string, { icon: any; color: string }> = {
  'package.json': { icon: Box, color: '#cb3837' },
  'tsconfig.json': { icon: Braces, color: '#3178c6' },
  'vite.config.ts': { icon: Settings, color: '#646cff' },
  'webpack.config.js': { icon: Settings, color: '#8dd6f9' },
  '.gitignore': { icon: Settings, color: '#f05032' },
  '.env': { icon: Lock, color: '#ecd53f' },
  '.env.local': { icon: Lock, color: '#ecd53f' },
  'dockerfile': { icon: Box, color: '#2496ed' },
  'docker-compose.yml': { icon: Box, color: '#2496ed' },
  'readme.md': { icon: BookOpen, color: '#083fa1' },
  'license': { icon: Shield, color: '#8b949e' },
  'license.md': { icon: Shield, color: '#8b949e' },
}

export default function FileIcon({ fileName, size = 16, style }: FileIconProps) {
  const lowerName = fileName.toLowerCase()

  // Check special file names first
  const special = SPECIAL_FILES[lowerName]
  if (special) {
    const Icon = special.icon
    return <Icon size={size} style={{ color: special.color, flexShrink: 0, ...style }} />
  }

  // Get extension
  const ext = lowerName.split('.').pop() || ''
  const mapped = ICON_MAP[ext]

  if (mapped) {
    const Icon = mapped.icon
    return <Icon size={size} style={{ color: mapped.color, flexShrink: 0, ...style }} />
  }

  // Default
  return <FileText size={size} style={{ color: '#8b949e', flexShrink: 0, ...style }} />
}

// Export for folder icon
export function FolderIcon({ expanded = false, size = 16, style }: { expanded?: boolean; size?: number; style?: React.CSSProperties }) {
  const color = expanded ? '#dcb67a' : '#c09553'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, ...style }}>
      {expanded ? (
        <path d="M3 7V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill={color} opacity={0.85} />
      ) : (
        <path d="M3 7V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V9C21 7.9 20.1 7 19 7H11L9 5H5C3.9 5 3 5.9 3 7Z" fill={color} opacity={0.7} />
      )}
    </svg>
  )
}
