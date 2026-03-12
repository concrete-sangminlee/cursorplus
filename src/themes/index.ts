export interface Theme {
  id: string
  name: string
  type: 'dark' | 'light'
  colors: Record<string, string> // CSS variable name -> value
  monacoTheme: string // Monaco editor theme name
}

export const themes: Theme[] = [
  // ---------- Orion Dark (current default) ----------
  {
    id: 'orion-dark',
    name: 'Orion Dark',
    type: 'dark',
    monacoTheme: 'vs-dark',
    colors: {
      '--bg-primary': '#0d1117',
      '--bg-secondary': '#161b22',
      '--bg-tertiary': '#010409',
      '--bg-hover': '#1c2128',
      '--bg-active': '#252c35',
      '--bg-elevated': '#1c2128',
      '--border': '#21262d',
      '--border-bright': '#30363d',
      '--border-focus': '#58a6ff',
      '--text-primary': '#e6edf3',
      '--text-secondary': '#8b949e',
      '--text-muted': '#484f58',
      '--accent': '#58a6ff',
      '--accent-green': '#3fb950',
      '--accent-orange': '#f78166',
      '--accent-red': '#f85149',
      '--accent-purple': '#bc8cff',
      '--accent-cyan': '#76e3ea',
    },
  },

  // ---------- Orion Darker (higher contrast) ----------
  {
    id: 'orion-darker',
    name: 'Orion Darker',
    type: 'dark',
    monacoTheme: 'vs-dark',
    colors: {
      '--bg-primary': '#000000',
      '--bg-secondary': '#0a0a0f',
      '--bg-tertiary': '#000000',
      '--bg-hover': '#111118',
      '--bg-active': '#1a1a24',
      '--bg-elevated': '#111118',
      '--border': '#1a1a24',
      '--border-bright': '#2a2a38',
      '--border-focus': '#6cb6ff',
      '--text-primary': '#f0f4fc',
      '--text-secondary': '#9da8b7',
      '--text-muted': '#505868',
      '--accent': '#6cb6ff',
      '--accent-green': '#56d364',
      '--accent-orange': '#ffa070',
      '--accent-red': '#ff6b61',
      '--accent-purple': '#d2a8ff',
      '--accent-cyan': '#8cf0f8',
    },
  },

  // ---------- GitHub Dark ----------
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    type: 'dark',
    monacoTheme: 'vs-dark',
    colors: {
      '--bg-primary': '#0d1117',
      '--bg-secondary': '#161b22',
      '--bg-tertiary': '#010409',
      '--bg-hover': '#1f242c',
      '--bg-active': '#292e36',
      '--bg-elevated': '#1c2128',
      '--border': '#30363d',
      '--border-bright': '#484f58',
      '--border-focus': '#1f6feb',
      '--text-primary': '#c9d1d9',
      '--text-secondary': '#8b949e',
      '--text-muted': '#484f58',
      '--accent': '#58a6ff',
      '--accent-green': '#3fb950',
      '--accent-orange': '#d29922',
      '--accent-red': '#f85149',
      '--accent-purple': '#bc8cff',
      '--accent-cyan': '#39d353',
    },
  },

  // ---------- Monokai Pro ----------
  {
    id: 'monokai-pro',
    name: 'Monokai Pro',
    type: 'dark',
    monacoTheme: 'vs-dark',
    colors: {
      '--bg-primary': '#2d2a2e',
      '--bg-secondary': '#363337',
      '--bg-tertiary': '#221f22',
      '--bg-hover': '#403e41',
      '--bg-active': '#4a474b',
      '--bg-elevated': '#403e41',
      '--border': '#49464e',
      '--border-bright': '#5b585f',
      '--border-focus': '#ffd866',
      '--text-primary': '#fcfcfa',
      '--text-secondary': '#c1c0c0',
      '--text-muted': '#727072',
      '--accent': '#ffd866',
      '--accent-green': '#a9dc76',
      '--accent-orange': '#fc9867',
      '--accent-red': '#ff6188',
      '--accent-purple': '#ab9df2',
      '--accent-cyan': '#78dce8',
    },
  },

  // ---------- Nord ----------
  {
    id: 'nord',
    name: 'Nord',
    type: 'dark',
    monacoTheme: 'vs-dark',
    colors: {
      '--bg-primary': '#2e3440',
      '--bg-secondary': '#3b4252',
      '--bg-tertiary': '#272c36',
      '--bg-hover': '#434c5e',
      '--bg-active': '#4c566a',
      '--bg-elevated': '#434c5e',
      '--border': '#3b4252',
      '--border-bright': '#4c566a',
      '--border-focus': '#88c0d0',
      '--text-primary': '#eceff4',
      '--text-secondary': '#d8dee9',
      '--text-muted': '#616e88',
      '--accent': '#88c0d0',
      '--accent-green': '#a3be8c',
      '--accent-orange': '#d08770',
      '--accent-red': '#bf616a',
      '--accent-purple': '#b48ead',
      '--accent-cyan': '#8fbcbb',
    },
  },
]

/** Find a theme by id. Falls back to the first theme (Orion Dark). */
export function getThemeById(id: string): Theme {
  return themes.find((t) => t.id === id) || themes[0]
}
