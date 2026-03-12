import { useState, useCallback, useRef, useEffect } from 'react'
import {
  X,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Github,
  BookOpen,
  Bug,
  FileText,
  Star,
} from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

/* ── Simulated system info ─────────────────────────────────────────── */
const SYSTEM_INFO = {
  electron: '28.2.1',
  chrome: '120.0.6099.199',
  node: '18.18.2',
  v8: '12.0.267.19-electron.0',
  os: navigator.platform || 'Unknown',
  arch: navigator.userAgent.includes('x64') || navigator.userAgent.includes('Win64') ? 'x64' : 'arm64',
  memory: `${((performance as any).memory?.usedJSHeapSize / 1048576)?.toFixed(1) || '128.4'} MB`,
}

const BUILD_NUMBER = '2026.03.1200'
const BUILD_DATE = 'March 12, 2026'
const VERSION = '1.2.0'

/* ── Tech stack badges ─────────────────────────────────────────────── */
const TECH_BADGES = [
  { name: 'React', version: '18.3.1', color: '#61DAFB', bg: 'rgba(97,218,251,0.1)' },
  { name: 'TypeScript', version: '5.4.5', color: '#3178C6', bg: 'rgba(49,120,198,0.1)' },
  { name: 'Monaco Editor', version: '0.52.0', color: '#007ACC', bg: 'rgba(0,122,204,0.1)' },
  { name: 'Electron', version: '28.2.1', color: '#9FEAF9', bg: 'rgba(159,234,249,0.1)' },
  { name: 'xterm.js', version: '5.5.0', color: '#2E7D32', bg: 'rgba(46,125,50,0.1)' },
]

/* ── Links ─────────────────────────────────────────────────────────── */
const LINKS = [
  { label: 'GitHub Repository', icon: Github, url: 'https://github.com/orion-ide/orion' },
  { label: 'Documentation', icon: BookOpen, url: 'https://docs.orion-ide.dev' },
  { label: 'Report Issue', icon: Bug, url: 'https://github.com/orion-ide/orion/issues/new' },
  { label: 'Release Notes', icon: FileText, url: 'https://github.com/orion-ide/orion/releases' },
]

/* ── Easter egg messages ───────────────────────────────────────────── */
const EASTER_EGGS = [
  'Per aspera ad astra!',
  'You found a secret constellation!',
  'The stars align for great code!',
  'May your builds always succeed!',
  'Orion watches over your code...',
]

/* ── Constellation SVG logo ────────────────────────────────────────── */
function OrionLogo({ size = 36, animate = false }: { size?: number; animate?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={animate ? { animation: 'orion-spin 1.5s ease-in-out' } : undefined}
    >
      {/* Constellation lines */}
      <line x1="20" y1="10" x2="44" y2="10" stroke="rgba(188,140,255,0.5)" strokeWidth="1" />
      <line x1="20" y1="10" x2="14" y2="28" stroke="rgba(188,140,255,0.5)" strokeWidth="1" />
      <line x1="44" y1="10" x2="50" y2="28" stroke="rgba(188,140,255,0.5)" strokeWidth="1" />
      <line x1="14" y1="28" x2="22" y2="32" stroke="rgba(188,140,255,0.5)" strokeWidth="1" />
      <line x1="50" y1="28" x2="42" y2="32" stroke="rgba(188,140,255,0.5)" strokeWidth="1" />
      <line x1="22" y1="32" x2="32" y2="32" stroke="rgba(88,166,255,0.8)" strokeWidth="1.5" />
      <line x1="32" y1="32" x2="42" y2="32" stroke="rgba(88,166,255,0.8)" strokeWidth="1.5" />
      <line x1="22" y1="32" x2="16" y2="50" stroke="rgba(188,140,255,0.5)" strokeWidth="1" />
      <line x1="42" y1="32" x2="48" y2="50" stroke="rgba(188,140,255,0.5)" strokeWidth="1" />
      <line x1="16" y1="50" x2="10" y2="58" stroke="rgba(188,140,255,0.4)" strokeWidth="1" />
      <line x1="48" y1="50" x2="54" y2="58" stroke="rgba(188,140,255,0.4)" strokeWidth="1" />
      {/* Stars — shoulder */}
      <circle cx="20" cy="10" r="2.5" fill="#bc8cff">
        {animate && <animate attributeName="r" values="2.5;4;2.5" dur="0.8s" />}
      </circle>
      <circle cx="44" cy="10" r="2.5" fill="#bc8cff">
        {animate && <animate attributeName="r" values="2.5;4;2.5" dur="0.8s" begin="0.1s" />}
      </circle>
      {/* Stars — arms */}
      <circle cx="14" cy="28" r="2" fill="#9ecbff" />
      <circle cx="50" cy="28" r="2" fill="#9ecbff" />
      {/* Belt — Orion's belt, 3 bright stars */}
      <circle cx="22" cy="32" r="3" fill="#58a6ff">
        {animate && <animate attributeName="opacity" values="1;0.5;1" dur="0.6s" />}
      </circle>
      <circle cx="32" cy="32" r="3.5" fill="#58a6ff">
        {animate && <animate attributeName="opacity" values="1;0.5;1" dur="0.6s" begin="0.15s" />}
      </circle>
      <circle cx="42" cy="32" r="3" fill="#58a6ff">
        {animate && <animate attributeName="opacity" values="1;0.5;1" dur="0.6s" begin="0.3s" />}
      </circle>
      {/* Stars — legs */}
      <circle cx="16" cy="50" r="2" fill="#9ecbff" />
      <circle cx="48" cy="50" r="2" fill="#9ecbff" />
      {/* Stars — feet */}
      <circle cx="10" cy="58" r="1.5" fill="rgba(158,203,255,0.7)" />
      <circle cx="54" cy="58" r="1.5" fill="rgba(158,203,255,0.7)" />
      {/* Nebula glow behind belt */}
      <ellipse cx="32" cy="32" rx="16" ry="6" fill="url(#belt-glow)" opacity="0.3" />
      <defs>
        <radialGradient id="belt-glow">
          <stop offset="0%" stopColor="#58a6ff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#58a6ff" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  )
}

/* ── Main component ────────────────────────────────────────────────── */
export default function AboutDialog({ open, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'done'>('idle')
  const [logoClicks, setLogoClicks] = useState(0)
  const [easterEgg, setEasterEgg] = useState<string | null>(null)
  const [logoAnimate, setLogoAnimate] = useState(false)
  const easterEggTimer = useRef<ReturnType<typeof setTimeout>>()
  const clickResetTimer = useRef<ReturnType<typeof setTimeout>>()

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setCopied(false)
      setUpdateState('idle')
      setLogoClicks(0)
      setEasterEgg(null)
      setLogoAnimate(false)
    }
  }, [open])

  const handleCopySystemInfo = useCallback(() => {
    const info = [
      `Orion IDE v${VERSION}`,
      `Build: ${BUILD_NUMBER} (${BUILD_DATE})`,
      '',
      'System Information:',
      `  Electron: ${SYSTEM_INFO.electron}`,
      `  Chrome: ${SYSTEM_INFO.chrome}`,
      `  Node.js: ${SYSTEM_INFO.node}`,
      `  V8: ${SYSTEM_INFO.v8}`,
      `  OS: ${SYSTEM_INFO.os} (${SYSTEM_INFO.arch})`,
      `  Memory: ${SYSTEM_INFO.memory}`,
    ].join('\n')
    navigator.clipboard.writeText(info).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  const handleCheckUpdates = useCallback(() => {
    if (updateState === 'checking') return
    setUpdateState('checking')
    setTimeout(() => setUpdateState('done'), 2200)
  }, [updateState])

  const handleLogoClick = useCallback(() => {
    const next = logoClicks + 1
    setLogoClicks(next)

    // Reset click counter after 3 seconds of no clicks
    if (clickResetTimer.current) clearTimeout(clickResetTimer.current)
    clickResetTimer.current = setTimeout(() => setLogoClicks(0), 3000)

    if (next >= 5) {
      setLogoAnimate(true)
      const msg = EASTER_EGGS[Math.floor(Math.random() * EASTER_EGGS.length)]
      setEasterEgg(msg)
      setLogoClicks(0)
      setTimeout(() => setLogoAnimate(false), 1500)
      if (easterEggTimer.current) clearTimeout(easterEggTimer.current)
      easterEggTimer.current = setTimeout(() => setEasterEgg(null), 4000)
    }
  }, [logoClicks])

  if (!open) return null

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes orion-spin { 0% { transform: rotate(0deg) scale(1); } 50% { transform: rotate(180deg) scale(1.3); } 100% { transform: rotate(360deg) scale(1); } }
        @keyframes orion-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes orion-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes orion-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes orion-egg-in { 0% { opacity: 0; transform: scale(0.8) translateY(8px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
        .about-scroll::-webkit-scrollbar { width: 6px; }
        .about-scroll::-webkit-scrollbar-track { background: transparent; }
        .about-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        .about-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
      `}</style>

      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onClose}
      >
        {/* Dialog */}
        <div
          className="anim-scale-in"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 460,
            maxHeight: '85vh',
            background: 'var(--bg-secondary, #1e1e2e)',
            border: '1px solid var(--border, #333)',
            borderRadius: 14,
            boxShadow: '0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px 0',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #666)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>About</span>
            <button
              onClick={onClose}
              style={{
                padding: 4,
                borderRadius: 6,
                color: 'var(--text-muted, #888)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Scrollable body */}
          <div
            className="about-scroll"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '16px 28px 28px',
              gap: 20,
              overflowY: 'auto',
              flex: 1,
            }}
          >
            {/* ── Logo ────────────────────────────────────── */}
            <div
              onClick={handleLogoClick}
              style={{
                width: 72,
                height: 72,
                borderRadius: 18,
                background: 'linear-gradient(135deg, rgba(88,166,255,0.15) 0%, rgba(188,140,255,0.15) 100%)',
                border: '1px solid rgba(88,166,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: logoAnimate
                  ? '0 0 30px rgba(88,166,255,0.5), 0 0 60px rgba(188,140,255,0.3)'
                  : '0 4px 24px rgba(88,166,255,0.15)',
              }}
              title="Click me 5 times..."
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.06)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              <OrionLogo size={42} animate={logoAnimate} />
            </div>

            {/* ── Easter egg message ──────────────────────── */}
            {easterEgg && (
              <div
                style={{
                  animation: 'orion-egg-in 0.4s ease-out',
                  padding: '6px 16px',
                  borderRadius: 20,
                  background: 'linear-gradient(135deg, rgba(88,166,255,0.15), rgba(188,140,255,0.15))',
                  border: '1px solid rgba(188,140,255,0.3)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#bc8cff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Star size={12} fill="#bc8cff" />
                {easterEgg}
                <Star size={12} fill="#bc8cff" />
              </div>
            )}

            {/* ── Title ───────────────────────────────────── */}
            <div style={{ textAlign: 'center' }}>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: '0.5px',
                  margin: 0,
                  background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 50%, #58a6ff 100%)',
                  backgroundSize: '200% auto',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  animation: 'orion-shimmer 4s linear infinite',
                }}
              >
                Orion IDE
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 }}>
                <Sparkles size={13} color="#bc8cff" />
                <span style={{ fontSize: 12, color: 'var(--text-muted, #888)', fontWeight: 500 }}>AI-Powered Code Editor</span>
              </div>
            </div>

            {/* ── Version badge ────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '3px 12px',
                  borderRadius: 20,
                  background: 'rgba(88,166,255,0.1)',
                  border: '1px solid rgba(88,166,255,0.2)',
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--accent, #58a6ff)',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                v{VERSION}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted, #666)', fontFamily: 'var(--font-mono, monospace)' }}>
                Build {BUILD_NUMBER}
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted, #666)', marginTop: -14 }}>
              {BUILD_DATE}
            </span>

            {/* ── System Information ──────────────────────── */}
            <SectionLabel text="System Information" />
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border, #333)' }}>
              <SysRow label="Electron" value={SYSTEM_INFO.electron} />
              <SysRow label="Chrome" value={SYSTEM_INFO.chrome} />
              <SysRow label="Node.js" value={SYSTEM_INFO.node} />
              <SysRow label="V8" value={SYSTEM_INFO.v8} />
              <SysRow label="OS" value={`${SYSTEM_INFO.os} (${SYSTEM_INFO.arch})`} />
              <SysRow label="Memory" value={SYSTEM_INFO.memory} last />
            </div>

            {/* ── Built With ─────────────────────────────── */}
            <SectionLabel text="Built With" />
            <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {TECH_BADGES.map((b) => (
                <TechBadge key={b.name} name={b.name} version={b.version} color={b.color} bg={b.bg} />
              ))}
            </div>

            {/* ── Links ──────────────────────────────────── */}
            <SectionLabel text="Links" />
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {LINKS.map((link) => (
                <LinkRow key={link.label} label={link.label} icon={link.icon} url={link.url} />
              ))}
            </div>

            {/* ── License ─────────────────────────────────── */}
            <div
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 8,
                background: 'var(--bg-primary, #181825)',
                border: '1px solid var(--border, #333)',
                fontSize: 11,
                color: 'var(--text-muted, #666)',
                lineHeight: 1.6,
                textAlign: 'center',
              }}
            >
              Released under the <span style={{ color: 'var(--text-secondary, #aaa)', fontWeight: 600 }}>MIT License</span>.
              <br />
              Copyright &copy; 2024-2026 Orion IDE Contributors.
            </div>

            {/* ── Action buttons ──────────────────────────── */}
            <div style={{ width: '100%', display: 'flex', gap: 8, marginTop: 2 }}>
              {/* Copy System Info */}
              <ActionButton
                onClick={handleCopySystemInfo}
                style={{ flex: 1 }}
                icon={copied ? <Check size={14} /> : <Copy size={14} />}
                label={copied ? 'Copied!' : 'Copy System Info'}
                accent={copied}
              />
              {/* Check for Updates */}
              <ActionButton
                onClick={handleCheckUpdates}
                style={{ flex: 1 }}
                icon={
                  updateState === 'checking' ? (
                    <RefreshCw size={14} style={{ animation: 'orion-pulse 0.6s ease-in-out infinite' }} />
                  ) : updateState === 'done' ? (
                    <Check size={14} />
                  ) : (
                    <RefreshCw size={14} />
                  )
                }
                label={
                  updateState === 'checking'
                    ? 'Checking...'
                    : updateState === 'done'
                      ? 'Up to date!'
                      : 'Check for Updates'
                }
                accent={updateState === 'done'}
                disabled={updateState === 'checking'}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Helper components ─────────────────────────────────────────────── */

function SectionLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 4,
      }}
    >
      <div style={{ flex: 1, height: 1, background: 'var(--border, #333)' }} />
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text-muted, #666)',
          textTransform: 'uppercase',
          letterSpacing: '1.2px',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border, #333)' }} />
    </div>
  )
}

function SysRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 14px',
        background: 'var(--bg-primary, #181825)',
        borderBottom: last ? 'none' : '1px solid var(--border, #333)',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #888)', letterSpacing: '0.3px' }}>
        {label}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-secondary, #bbb)', fontFamily: 'var(--font-mono, monospace)' }}>
        {value}
      </span>
    </div>
  )
}

function TechBadge({ name, version, color, bg }: { name: string; version: string; color: string; bg: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px 4px 8px',
        borderRadius: 6,
        background: bg,
        border: `1px solid ${color}33`,
        fontSize: 11,
        fontWeight: 600,
        color,
        whiteSpace: 'nowrap',
        transition: 'transform 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)' }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
    >
      {/* Colored dot as a mini icon */}
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
          boxShadow: `0 0 6px ${color}66`,
        }}
      />
      {name}
      <span style={{ fontWeight: 400, opacity: 0.7, fontFamily: 'var(--font-mono, monospace)', fontSize: 10 }}>
        {version}
      </span>
    </div>
  )
}

function LinkRow({ label, icon: Icon, url }: { label: string; icon: typeof Github; url: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 12px',
        borderRadius: 6,
        cursor: 'pointer',
        color: 'var(--text-secondary, #bbb)',
        fontSize: 12,
        transition: 'background 0.15s',
      }}
      onClick={() => window.open(url, '_blank')}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <Icon size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{label}</span>
      <ExternalLink size={12} style={{ opacity: 0.3 }} />
    </div>
  )
}

function ActionButton({
  onClick,
  icon,
  label,
  accent,
  disabled,
  style,
}: {
  onClick: () => void
  icon: React.ReactNode
  label: string
  accent?: boolean
  disabled?: boolean
  style?: React.CSSProperties
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '8px 12px',
        borderRadius: 8,
        border: accent ? '1px solid rgba(88,166,255,0.3)' : '1px solid var(--border, #333)',
        background: accent ? 'rgba(88,166,255,0.1)' : 'var(--bg-primary, #181825)',
        color: accent ? 'var(--accent, #58a6ff)' : 'var(--text-secondary, #bbb)',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.7 : 1,
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = accent ? 'rgba(88,166,255,0.15)' : 'rgba(255,255,255,0.06)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = accent ? 'rgba(88,166,255,0.1)' : 'var(--bg-primary, #181825)'
      }}
    >
      {icon}
      {label}
    </button>
  )
}
