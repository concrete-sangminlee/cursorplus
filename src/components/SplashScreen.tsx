import { useState, useEffect, useRef } from 'react'

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

  @keyframes orion-stage-fade {
    0% { opacity: 0; transform: translateY(4px); }
    15% { opacity: 1; transform: translateY(0); }
    85% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-4px); }
  }

  @keyframes orion-fade-out {
    0% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.04); }
  }

  @keyframes orion-logo-entrance {
    0% { opacity: 0; transform: scale(0.9) translateY(10px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }

  @keyframes orion-text-gradient {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  @keyframes orion-version-in {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }

  .orion-splash-root {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--bg-primary, #0d1117);
    font-family: var(--font-sans, 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif);
    animation: orion-logo-entrance 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .orion-splash-root.orion-exiting {
    animation: orion-fade-out 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    pointer-events: none;
  }

  .orion-constellation-wrap {
    position: relative;
    width: 120px;
    height: 120px;
    margin-bottom: 20px;
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
    font-size: 42px;
    font-weight: 700;
    letter-spacing: -2px;
    line-height: 1;
    background: linear-gradient(135deg, var(--accent-purple, #bc8cff) 0%, var(--accent, #58a6ff) 50%, var(--accent-green, #3fb950) 100%);
    background-size: 200% 200%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: orion-text-gradient 4s ease infinite;
    margin-bottom: 6px;
  }

  .orion-version {
    font-size: 11px;
    color: var(--text-muted, #484f58);
    letter-spacing: 1.5px;
    text-transform: uppercase;
    font-weight: 500;
    margin-bottom: 28px;
    animation: orion-version-in 0.8s ease 0.3s both;
  }

  .orion-progress-track {
    width: 240px;
    height: 3px;
    background: var(--bg-hover, #1c2128);
    border-radius: 3px;
    overflow: hidden;
    position: relative;
  }

  .orion-progress-bar {
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(
      90deg,
      var(--accent-purple, #bc8cff),
      var(--accent, #58a6ff),
      var(--accent-purple, #bc8cff)
    );
    background-size: 200% 100%;
    animation:
      orion-progress-fill var(--splash-duration) cubic-bezier(0.4, 0, 0.2, 1) forwards,
      orion-progress-shimmer 1.5s linear infinite;
  }

  .orion-stage-label {
    margin-top: 14px;
    height: 18px;
    position: relative;
    overflow: hidden;
  }

  .orion-stage-text {
    position: absolute;
    width: 100%;
    text-align: center;
    font-size: 11px;
    color: var(--text-secondary, #8b949e);
    letter-spacing: 0.3px;
    opacity: 0;
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
    margin-top: 32px;
    font-size: 11px;
    color: var(--text-muted, #484f58);
    letter-spacing: 0.5px;
    animation: orion-version-in 1s ease 0.5s both;
  }
`

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [exiting, setExiting] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const SPLASH_DURATION_MS = 2400

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
    const finishTimer = setTimeout(onComplete, 500)
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
        <div className="orion-version">Orion IDE v1.2.0</div>

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
