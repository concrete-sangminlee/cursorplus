import React from 'react'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[Orion ErrorBoundary] Uncaught error:', error)
    console.error('[Orion ErrorBoundary] Component stack:', info.componentStack)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleDismiss = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            width: '100vw',
            background: 'var(--bg-primary, #0d1117)',
            color: 'var(--text-primary, #e6edf3)',
            fontFamily: 'var(--font-sans, system-ui, sans-serif)',
          }}
        >
          <div
            style={{
              maxWidth: 480,
              padding: 32,
              background: 'var(--bg-secondary, #161b22)',
              border: '1px solid var(--border, #21262d)',
              borderRadius: 'var(--radius-lg, 8px)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                margin: '0 auto 16px',
                borderRadius: '50%',
                background: 'rgba(248, 81, 73, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                color: 'var(--accent-red, #f85149)',
              }}
              aria-hidden="true"
            >
              !
            </div>

            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Something went wrong
            </h2>

            <p
              style={{
                fontSize: 13,
                color: 'var(--text-secondary, #8b949e)',
                marginBottom: 8,
                lineHeight: 1.5,
              }}
            >
              Orion encountered an unexpected error. You can try reloading or dismiss this message.
            </p>

            {this.state.error && (
              <pre
                style={{
                  fontSize: 11,
                  color: 'var(--accent-red, #f85149)',
                  background: 'var(--bg-tertiary, #010409)',
                  border: '1px solid var(--border, #21262d)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  padding: 12,
                  marginBottom: 16,
                  textAlign: 'left',
                  overflow: 'auto',
                  maxHeight: 120,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {this.state.error.message}
              </pre>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#fff',
                  background: 'var(--accent, #58a6ff)',
                  border: 'none',
                  borderRadius: 'var(--radius-md, 6px)',
                  cursor: 'pointer',
                }}
              >
                Reload
              </button>
              <button
                onClick={this.handleDismiss}
                style={{
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-secondary, #8b949e)',
                  background: 'var(--bg-hover, #1c2128)',
                  border: '1px solid var(--border, #21262d)',
                  borderRadius: 'var(--radius-md, 6px)',
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
              <a
                href="https://github.com/nicepkg/orion/issues"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-secondary, #8b949e)',
                  background: 'transparent',
                  border: '1px solid var(--border, #21262d)',
                  borderRadius: 'var(--radius-md, 6px)',
                  cursor: 'pointer',
                  textDecoration: 'none',
                }}
              >
                Report Issue
              </a>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
