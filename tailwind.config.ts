import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0d1117',
          secondary: '#161b22',
          tertiary: '#010409',
          hover: '#1c2128',
        },
        border: {
          primary: '#21262d',
          active: '#58a6ff',
        },
        text: {
          primary: '#e6edf3',
          secondary: '#8b949e',
          muted: '#484f58',
        },
        accent: {
          blue: '#58a6ff',
          green: '#3fb950',
          orange: '#f78166',
          yellow: '#d29922',
          purple: '#bc8cff',
          red: '#f85149',
        },
        agent: {
          active: '#3fb950',
          working: '#58a6ff',
          idle: '#484f58',
        },
      },
      fontFamily: {
        mono: ['Cascadia Code', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
