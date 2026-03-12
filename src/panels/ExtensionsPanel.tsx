import { useState, useMemo } from 'react'
import { Search, Star, Download, ChevronDown, ChevronRight, Package } from 'lucide-react'

interface Extension {
  id: string
  name: string
  publisher: string
  description: string
  installs: string
  rating: number
  color: string
  category: 'installed' | 'recommended' | 'popular'
  enabled: boolean
}

const MOCK_EXTENSIONS: Extension[] = [
  {
    id: 'python',
    name: 'Python',
    publisher: 'Microsoft',
    description: 'Python language support with IntelliSense, linting, debugging, and more',
    installs: '50M+',
    rating: 4.7,
    color: '#3572A5',
    category: 'installed',
    enabled: true,
  },
  {
    id: 'eslint',
    name: 'ESLint',
    publisher: 'Microsoft',
    description: 'Integrates ESLint into VS Code for real-time JavaScript and TypeScript linting',
    installs: '30M+',
    rating: 4.6,
    color: '#4B32C3',
    category: 'installed',
    enabled: true,
  },
  {
    id: 'prettier',
    name: 'Prettier',
    publisher: 'Prettier',
    description: 'Opinionated code formatter supporting many languages',
    installs: '40M+',
    rating: 4.5,
    color: '#F7B93E',
    category: 'installed',
    enabled: true,
  },
  {
    id: 'gitlens',
    name: 'GitLens',
    publisher: 'GitKraken',
    description: 'Supercharge Git with blame annotations, code lens, and rich visualizations',
    installs: '20M+',
    rating: 4.6,
    color: '#68BC71',
    category: 'installed',
    enabled: false,
  },
  {
    id: 'thunder-client',
    name: 'Thunder Client',
    publisher: 'Thunder Client',
    description: 'Lightweight REST API client for testing and debugging APIs',
    installs: '10M+',
    rating: 4.8,
    color: '#A855F7',
    category: 'recommended',
    enabled: false,
  },
  {
    id: 'material-icon-theme',
    name: 'Material Icon Theme',
    publisher: 'Philipp Kief',
    description: 'Material Design icons for files and folders in the explorer',
    installs: '15M+',
    rating: 4.9,
    color: '#42A5F5',
    category: 'recommended',
    enabled: false,
  },
  {
    id: 'docker',
    name: 'Docker',
    publisher: 'Microsoft',
    description: 'Build, manage, and deploy containerized applications from the editor',
    installs: '25M+',
    rating: 4.5,
    color: '#2496ED',
    category: 'popular',
    enabled: false,
  },
  {
    id: 'tailwindcss',
    name: 'Tailwind CSS IntelliSense',
    publisher: 'Tailwind Labs',
    description: 'Intelligent Tailwind CSS tooling with autocomplete and linting',
    installs: '5M+',
    rating: 4.7,
    color: '#38BDF8',
    category: 'popular',
    enabled: false,
  },
  {
    id: 'liveshare',
    name: 'Live Share',
    publisher: 'Microsoft',
    description: 'Real-time collaborative development and pair programming',
    installs: '15M+',
    rating: 4.4,
    color: '#E4637C',
    category: 'recommended',
    enabled: false,
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    publisher: 'GitHub',
    description: 'AI pair programmer that suggests code completions in real time',
    installs: '10M+',
    rating: 4.6,
    color: '#F0F0F0',
    category: 'popular',
    enabled: false,
  },
]

type Category = 'installed' | 'recommended' | 'popular'

const CATEGORY_LABELS: Record<Category, string> = {
  installed: 'Installed',
  recommended: 'Recommended',
  popular: 'Popular',
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  const stars: React.ReactNode[] = []
  for (let i = 0; i < 5; i++) {
    if (i < full) {
      stars.push(<Star key={i} size={10} fill="var(--accent-orange)" strokeWidth={0} />)
    } else if (i === full && half) {
      stars.push(
        <span key={i} style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10 }}>
          <Star size={10} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} />
          <span style={{ position: 'absolute', left: 0, top: 0, width: 5, overflow: 'hidden' }}>
            <Star size={10} fill="var(--accent-orange)" strokeWidth={0} />
          </span>
        </span>
      )
    } else {
      stars.push(<Star key={i} size={10} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} />)
    }
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      {stars}
      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 3 }}>{rating}</span>
    </span>
  )
}

function ExtensionCard({
  ext,
  onToggle,
  onInstall,
}: {
  ext: Extension
  onToggle: (id: string) => void
  onInstall: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const isInstalled = ext.category === 'installed'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        gap: 10,
        padding: '8px 12px',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.1s ease',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 6,
          background: ext.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 16,
          fontWeight: 700,
          color: ext.color === '#F0F0F0' ? '#24292e' : '#fff',
        }}
      >
        {ext.name[0]}
      </div>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {ext.name}
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            marginTop: 1,
          }}
        >
          {ext.publisher}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            marginTop: 3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {ext.description}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 5,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              color: 'var(--text-muted)',
            }}
          >
            <Download size={10} />
            {ext.installs}
          </span>
          <StarRating rating={ext.rating} />
          <span style={{ marginLeft: 'auto' }}>
            {isInstalled ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle(ext.id)
                }}
                style={{
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 600,
                  borderRadius: 3,
                  border: '1px solid var(--border)',
                  background: ext.enabled ? 'rgba(88,166,255,0.1)' : 'transparent',
                  color: ext.enabled ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {ext.enabled ? 'Enabled' : 'Disabled'}
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onInstall(ext.id)
                }}
                style={{
                  padding: '2px 10px',
                  fontSize: 10,
                  fontWeight: 600,
                  borderRadius: 3,
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#fff',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.85' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
              >
                Install
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function ExtensionsPanel() {
  const [filter, setFilter] = useState('')
  const [extensions, setExtensions] = useState<Extension[]>(MOCK_EXTENSIONS)
  const [expandedCategories, setExpandedCategories] = useState<Set<Category>>(
    new Set(['installed', 'recommended', 'popular'])
  )

  const filteredExtensions = useMemo(() => {
    if (!filter.trim()) return extensions
    const lower = filter.toLowerCase()
    return extensions.filter(
      (ext) =>
        ext.name.toLowerCase().includes(lower) ||
        ext.publisher.toLowerCase().includes(lower) ||
        ext.description.toLowerCase().includes(lower)
    )
  }, [extensions, filter])

  const grouped = useMemo(() => {
    const groups: Record<Category, Extension[]> = {
      installed: [],
      recommended: [],
      popular: [],
    }
    for (const ext of filteredExtensions) {
      groups[ext.category].push(ext)
    }
    return groups
  }, [filteredExtensions])

  const toggleCategory = (cat: Category) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }

  const toggleExtension = (id: string) => {
    setExtensions((prev) =>
      prev.map((ext) => (ext.id === id ? { ...ext, enabled: !ext.enabled } : ext))
    )
  }

  const installExtension = (id: string) => {
    setExtensions((prev) =>
      prev.map((ext) =>
        ext.id === id ? { ...ext, category: 'installed' as const, enabled: true } : ext
      )
    )
  }

  const categories: Category[] = ['installed', 'recommended', 'popular']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--text-secondary)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          userSelect: 'none',
        }}
      >
        <Package size={12} />
        Extensions
      </div>

      {/* Search bar */}
      <div
        style={{
          padding: '6px 8px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--bg-primary)',
            borderRadius: 4,
            border: '1px solid var(--border)',
            padding: '4px 8px',
          }}
        >
          <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search extensions..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* Extension list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {categories.map((cat) => {
          const exts = grouped[cat]
          if (exts.length === 0) return null
          const isExpanded = expandedCategories.has(cat)

          return (
            <div key={cat}>
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--bg-tertiary)',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  textAlign: 'left',
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  userSelect: 'none',
                }}
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>{CATEGORY_LABELS[cat]}</span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    background: 'var(--bg-active)',
                    padding: '0 5px',
                    borderRadius: 8,
                  }}
                >
                  {exts.length}
                </span>
              </button>

              {/* Extension cards */}
              {isExpanded &&
                exts.map((ext) => (
                  <ExtensionCard
                    key={ext.id}
                    ext={ext}
                    onToggle={toggleExtension}
                    onInstall={installExtension}
                  />
                ))}
            </div>
          )
        })}

        {filteredExtensions.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              fontSize: 12,
              padding: 20,
              gap: 8,
            }}
          >
            <Package size={24} strokeWidth={1} />
            <span>No extensions found</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '4px 12px',
          fontSize: 10,
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          userSelect: 'none',
        }}
      >
        <span>
          {extensions.filter((e) => e.category === 'installed').length} installed
        </span>
        <span>
          {extensions.filter((e) => e.category === 'installed' && e.enabled).length} enabled
        </span>
      </div>
    </div>
  )
}
