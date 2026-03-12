import { useState, useEffect } from 'react'

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const steps = [
      { delay: 100, progress: 20, label: 'Loading core modules...' },
      { delay: 300, progress: 45, label: 'Initializing editor...' },
      { delay: 500, progress: 70, label: 'Loading extensions...' },
      { delay: 700, progress: 90, label: 'Starting AI engine...' },
      { delay: 900, progress: 100, label: 'Ready' },
    ]

    const timers = steps.map(step =>
      setTimeout(() => setProgress(step.progress), step.delay)
    )

    const completeTimer = setTimeout(() => {
      setVisible(false)
      setTimeout(onComplete, 300)
    }, 1200)

    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(completeTimer)
    }
  }, [onComplete])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1b26',
        transition: 'opacity 0.3s ease',
        opacity: visible ? 1 : 0,
      }}
    >
      <div
        style={{
          fontSize: 42,
          fontWeight: 700,
          letterSpacing: '-2px',
          background: 'linear-gradient(135deg, #bc8cff 0%, #58a6ff 50%, #3fb950 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 24,
        }}
      >
        Orion
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: 200,
          height: 3,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #bc8cff, #58a6ff)',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      <div
        style={{
          marginTop: 12,
          fontSize: 11,
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.5px',
        }}
      >
        AI-Powered Code Editor
      </div>
    </div>
  )
}
