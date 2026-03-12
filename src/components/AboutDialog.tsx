import { Zap, X, Sparkles } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

export default function AboutDialog({ open, onClose }: Props) {
  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="anim-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header with close button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '10px 14px 0',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: 4,
              borderRadius: 4,
              color: 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '8px 32px 32px',
            gap: 16,
          }}
        >
          {/* Logo */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 20px rgba(88, 166, 255, 0.3)',
            }}
          >
            <Zap size={28} color="#fff" fill="#fff" />
          </div>

          {/* Title */}
          <div style={{ textAlign: 'center' }}>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '0.3px',
              }}
            >
              Orion IDE
            </h2>
          </div>

          {/* Version */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '3px 12px',
              borderRadius: 20,
              background: 'rgba(88, 166, 255, 0.1)',
              border: '1px solid rgba(88, 166, 255, 0.2)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            v1.0.0-beta
          </div>

          {/* Info rows */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 4,
            }}
          >
            <InfoRow label="Build" value="Electron + React + Monaco Editor" />
            <InfoRow label="Credits" value="Built by Bebut" />
          </div>

          {/* Powered by AI */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 4,
              fontSize: 12,
              color: 'var(--accent-purple)',
              fontWeight: 500,
            }}
          >
            <Sparkles size={14} />
            <span>Powered by AI</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderRadius: 8,
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        {value}
      </span>
    </div>
  )
}
