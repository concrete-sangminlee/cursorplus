import { useState, useEffect, useRef, useMemo } from 'react'
import { APP_VERSION, APP_NAME } from '@/utils/version'

// Generate particle field positions (tiny stars in background)
function generateParticles(count: number) {
  const particles: { x: number; y: number; size: number; opacity: number; speed: number; delay: number }[] = []
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 0.5 + Math.random() * 1.5,
      opacity: 0.15 + Math.random() * 0.45,
      speed: 12 + Math.random() * 24,
      delay: Math.random() * 8,
    })
  }
  return particles
}

const LOADING_STAGES = [
  { at: 0, label: 'Initializing editor...' },
  { at: 25, label: 'Loading extensions...' },
  { at: 55, label: 'Restoring workspace...' },
  { at: 85, label: 'Ready!' },
]

// Orion constellation star positions (scaled to a 120x120 viewBox)
// Based on the actual Orion constellation shape
const STARS: { cx: number; cy: number; r: number; delay: number; brightness: number }[] = [
  // Betelgeuse (left shoulder)
  { cx: 30, cy: 28, r: 3.2, delay: 0, brightness: 1 },
  // Bellatrix (right shoulder)
  { cx: 88, cy: 30, r: 2.6, delay: 0.4, brightness: 0.9 },
  // Alnitak (belt left)
  { cx: 44, cy: 56, r: 2.0, delay: 0.8, brightness: 0.85 },
  // Alnilam (belt center)
  { cx: 58, cy: 54, r: 2.4, delay: 1.2, brightness: 0.95 },
  // Mintaka (belt right)
  { cx: 72, cy: 52, r: 2.0, delay: 0.6, brightness: 0.85 },
  // Saiph (left foot)
  { cx: 36, cy: 90, r: 2.2, delay: 1.0, brightness: 0.8 },
  // Rigel (right foot)
  { cx: 82, cy: 92, r: 3.0, delay: 0.2, brightness: 1 },
  // Meissa (head)
  { cx: 58, cy: 10, r: 1.6, delay: 1.4, brightness: 0.7 },
]

// Constellation lines connecting the stars (indices into STARS array)
const LINES: [number, number][] = [
  [7, 0],  // head -> left shoulder
  [7, 1],  // head -> right shoulder
  [0, 2],  // left shoulder -> belt left
  [1, 4],  // right shoulder -> belt right
  [2, 3],  // belt left -> belt center
  [3, 4],  // belt center -> belt right
  [2, 5],  // belt left -> left foot
  [4, 6],  // belt right -> right foot
]

const cssText = `
  @keyframes orion-twinkle {
    0%, 100% { opacity: 0.4; transform: scale(0.85); }
    50% { opacity: 1; transform: scale(1.15); }
  }

  @keyframes orion-star-glow {
    0%, 100% { filter: drop-shadow(0 0 2px currentColor); }
    50% { filter: drop-shadow(0 0 8px currentColor) drop-shadow(0 0 16px currentColor); }
  }

  @keyframes orion-line-draw {
    from { stroke-dashoffset: 200; }
    to { stroke-dashoffset: 0; }
  }

  @keyframes orion-progress-fill {
    0% { width: 0%; }
    10% { width: 8%; }
    25% { width: 25%; }
    40% { width: 40%; }
    55% { width: 55%; }
    70% { width: 72%; }
    85% { width: 85%; }
    95% { width: 95%; }
    100% { width: 100%; }
  }

  @keyframes orion-progress-shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  @keyframes orion-progress-glow {
    0%, 100% { box-shadow: 0 0 4px rgba(188, 140, 255, 0.3), 0 0 8px rgba(88, 166, 255, 0.15); }
    50% { box-shadow: 0 0 8px rgba(188, 140, 255, 0.6), 0 0 20px rgba(88, 166, 255, 0.3); }
  }

  @keyframes orion-stage-fade {
    0% { opacity: 0; transform: translateY(4px); }
    15% { opacity: 1; transform: translateY(0); }
    85% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-4px); }
  }

  @keyframes orion-fade-out {
    0% { opacity: 1; transform: scale(1); filter: blur(0); }
    60% { opacity: 0.6; transform: scale(1.03); filter: blur(0); }
    100% { opacity: 0; transform: scale(1.08); filter: blur(2px); }
  }

  @keyframes orion-logo-entrance {
    0% { opacity: 0; transform: scale(0.85) translateY(16px); filter: blur(4px); }
    60% { opacity: 0.9; transform: scale(1.01) translateY(-2px); filter: blur(0); }
    100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
  }

  @keyframes orion-text-gradient {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  @keyframes orion-version-in {
    0% { opacity: 0; transform: translateY(6px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  @keyframes orion-particle-float {
    0% { transform: translateY(0) translateX(0); opacity: var(--p-opacity); }
    25% { transform: translateY(-8px) translateX(3px); opacity: calc(var(--p-opacity) * 0.7); }
    50% { transform: translateY(-4px) translateX(-2px); opacity: var(--p-opacity); }
    75% { transform: translateY(-12px) translateX(4px); opacity: calc(var(--p-opacity) * 0.5); }
    100% { transform: translateY(0) translateX(0); opacity: var(--p-opacity); }
  }

  @keyframes orion-constellation-pulse {
    0%, 100% { filter: drop-shadow(0 0 12px rgba(188, 140, 255, 0.15)) drop-shadow(0 0 24px rgba(99, 102, 241, 0.08)); }
    50% { filter: drop-shadow(0 0 20px rgba(188, 140, 255, 0.35)) drop-shadow(0 0 40px rgba(99, 102, 241, 0.2)); }
  }

  @keyframes orion-nebula-rotate {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .orion-splash-root {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(ellipse 60% 50% at 50% 45%, rgba(30, 27, 75, 0.7), transparent 70%),
      radial-gradient(ellipse 80% 60% at 50% 50%, rgba(15, 23, 42, 0.9), transparent 80%),
      var(--bg-primary, #0a0d14);
    font-family: var(--font-sans, 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif);
    animation: orion-logo-entrance 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
    overflow: hidden;
  }

  .orion-splash-root.orion-exiting {
    animation: orion-fade-out 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    pointer-events: none;
  }

  .orion-particle-field {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .orion-particle {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(188, 180, 255, 0.9) 0%, rgba(140, 160, 255, 0.4) 60%, transparent 100%);
    animation: orion-particle-float var(--p-speed) ease-in-out infinite;
    animation-delay: var(--p-delay);
  }

  .orion-nebula-glow {
    position: absolute;
    width: 300px;
    height: 300px;
    top: 50%;
    left: 50%;
    margin-top: -150px;
    margin-left: -150px;
    background: radial-gradient(circle, rgba(99, 102, 241, 0.06) 0%, rgba(139, 92, 246, 0.03) 40%, transparent 70%);
    animation: orion-nebula-rotate 30s linear infinite;
    pointer-events: none;
    z-index: 0;
  }

  .orion-constellation-wrap {
    position: relative;
    width: 120px;
    height: 120px;
    margin-bottom: 20px;
    z-index: 1;
    animation: orion-constellation-pulse 3.5s ease-in-out infinite;
  }

  .orion-constellation-line {
    stroke: var(--accent-purple, #bc8cff);
    stroke-width: 0.6;
    opacity: 0.25;
    stroke-dasharray: 200;
    animation: orion-line-draw 1.8s ease-out forwards;
  }

  .orion-constellation-star {
    animation: orion-twinkle 2.5s ease-in-out infinite;
  }

  .orion-constellation-star-glow {
    animation: orion-star-glow 3s ease-in-out infinite;
  }

  .orion-logo-text {
    font-size: 46px;
    font-weight: 800;
    letter-spacing: -2.5px;
    line-height: 1;
    background: linear-gradient(135deg, #c4b5fd 0%, var(--accent-purple, #bc8cff) 25%, var(--accent, #58a6ff) 50%, #6ee7b7 75%, var(--accent-green, #3fb950) 100%);
    background-size: 300% 300%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: orion-text-gradient 5s ease infinite;
    margin-bottom: 6px;
    z-index: 1;
    filter: drop-shadow(0 0 20px rgba(188, 140, 255, 0.15));
  }

  .orion-version {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.35);
    letter-spacing: 2.5px;
    text-transform: uppercase;
    font-weight: 500;
    margin-bottom: 28px;
    animation: orion-version-in 0.8s ease 0.4s both;
    z-index: 1;
  }

  .orion-progress-track {
    width: 260px;
    height: 3px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 3px;
    overflow: visible;
    position: relative;
    z-index: 1;
    border: 1px solid rgba(255, 255, 255, 0.03);
  }

  .orion-progress-bar {
    height: 100%;
    border-radius: 3px;
    position: relative;
    background: linear-gradient(
      90deg,
      var(--accent-purple, #bc8cff),
      var(--accent, #58a6ff),
      #a78bfa,
      var(--accent, #58a6ff),
      var(--accent-purple, #bc8cff)
    );
    background-size: 300% 100%;
    animation:
      orion-progress-fill var(--splash-duration) cubic-bezier(0.4, 0, 0.2, 1) forwards,
      orion-progress-shimmer 2s linear infinite,
      orion-progress-glow 2s ease-in-out infinite;
  }

  .orion-progress-bar::after {
    content: '';
    position: absolute;
    right: -1px;
    top: -3px;
    width: 6px;
    height: 9px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 6px rgba(188, 140, 255, 0.8), 0 0 12px rgba(99, 102, 241, 0.5);
    opacity: 0.9;
  }

  .orion-stage-label {
    margin-top: 16px;
    height: 18px;
    position: relative;
    overflow: hidden;
    z-index: 1;
  }

  .orion-stage-text {
    position: absolute;
    width: 100%;
    text-align: center;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    letter-spacing: 0.5px;
    opacity: 0;
    font-weight: 400;
  }

  .orion-stage-text:nth-child(1) {
    animation: orion-stage-fade calc(var(--splash-duration) * 0.28) ease both;
    animation-delay: 0s;
  }
  .orion-stage-text:nth-child(2) {
    animation: orion-stage-fade calc(var(--splash-duration) * 0.28) ease both;
    animation-delay: calc(var(--splash-duration) * 0.25);
  }
  .orion-stage-text:nth-child(3) {
    animation: orion-stage-fade calc(var(--splash-duration) * 0.28) ease both;
    animation-delay: calc(var(--splash-duration) * 0.50);
  }
  .orion-stage-text:nth-child(4) {
    animation: orion-stage-fade calc(var(--splash-duration) * 0.20) ease both;
    animation-delay: calc(var(--splash-duration) * 0.78);
  }

  .orion-tagline {
    margin-top: 36px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.2);
    letter-spacing: 1.5px;
    text-transform: uppercase;
    font-weight: 400;
    animation: orion-version-in 1s ease 0.6s both;
    z-index: 1;
  }
`

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [exiting, setExiting] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const SPLASH_DURATION_MS = 2400
  const particles = useMemo(() => generateParticles(60), [])

  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setExiting(true)
    }, SPLASH_DURATION_MS)

    return () => {
      clearTimeout(exitTimer)
    }
  }, [])

  useEffect(() => {
    if (!exiting) return
    // Wait for fade-out animation to finish before calling onComplete
    const finishTimer = setTimeout(onComplete, 600)
    return () => clearTimeout(finishTimer)
  }, [exiting, onComplete])

  return (
    <>
      <style>{cssText}</style>
      <div
        ref={rootRef}
        className={`orion-splash-root${exiting ? ' orion-exiting' : ''}`}
        style={{ '--splash-duration': `${SPLASH_DURATION_MS}ms` } as React.CSSProperties}
      >
        {/* Particle star field background */}
        <div className="orion-particle-field">
          {particles.map((p, i) => (
            <div
              key={`p-${i}`}
              className="orion-particle"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.size,
                height: p.size,
                '--p-opacity': p.opacity,
                '--p-speed': `${p.speed}s`,
                '--p-delay': `-${p.delay}s`,
              } as React.CSSProperties}
            />
          ))}
        </div>

        {/* Nebula ambient glow behind constellation */}
        <div className="orion-nebula-glow" />

        {/* Constellation SVG */}
        <div className="orion-constellation-wrap">
          <svg
            viewBox="0 0 120 120"
            width="120"
            height="120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Constellation lines */}
            {LINES.map(([from, to], i) => (
              <line
                key={`line-${i}`}
                className="orion-constellation-line"
                x1={STARS[from].cx}
                y1={STARS[from].cy}
                x2={STARS[to].cx}
                y2={STARS[to].cy}
                style={{ animationDelay: `${0.2 + i * 0.15}s` }}
              />
            ))}

            {/* Stars with twinkle */}
            {STARS.map((star, i) => (
              <g key={`star-${i}`}>
                {/* Outer glow */}
                <circle
                  className="orion-constellation-star-glow"
                  cx={star.cx}
                  cy={star.cy}
                  r={star.r * 2.5}
                  fill={`rgba(188, 140, 255, ${star.brightness * 0.08})`}
                  style={{
                    animationDelay: `${star.delay}s`,
                    animationDuration: `${2.5 + star.delay * 0.5}s`,
                    color: 'var(--accent-purple, #bc8cff)',
                  }}
                />
                {/* Core star */}
                <circle
                  className="orion-constellation-star"
                  cx={star.cx}
                  cy={star.cy}
                  r={star.r}
                  fill={star.brightness >= 0.95
                    ? 'var(--accent, #58a6ff)'
                    : 'var(--accent-purple, #bc8cff)'}
                  style={{
                    animationDelay: `${star.delay}s`,
                    animationDuration: `${2 + star.delay * 0.6}s`,
                    transformOrigin: `${star.cx}px ${star.cy}px`,
                  }}
                />
                {/* Bright center dot */}
                <circle
                  cx={star.cx}
                  cy={star.cy}
                  r={star.r * 0.4}
                  fill="#fff"
                  opacity={star.brightness * 0.7}
                />
              </g>
            ))}
          </svg>
        </div>

        {/* Logo text */}
        <div className="orion-logo-text">Orion</div>

        {/* Version */}
        <div className="orion-version">{APP_NAME} v{APP_VERSION}</div>

        {/* Progress bar */}
        <div className="orion-progress-track">
          <div className="orion-progress-bar" />
        </div>

        {/* Loading stage labels */}
        <div className="orion-stage-label">
          {LOADING_STAGES.map((stage, i) => (
            <span key={i} className="orion-stage-text">
              {stage.label}
            </span>
          ))}
        </div>

        {/* Tagline */}
        <div className="orion-tagline">AI-Powered Code Editor</div>
      </div>
    </>
  )
}
