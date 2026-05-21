/**
 * Protocols that are safe to pass to `shell.openExternal()`.
 *
 * Excludes `file:` (reads local files), `javascript:`/`data:` (script execution
 * surfaces in some handlers), and custom URI schemes like `slack:`, `vscode:`,
 * `ms-cxh:`, `steam:` — those resolve to OS-registered protocol handlers and
 * can launch arbitrary local applications (classic Electron RCE primitive).
 */
const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

export function isSafeExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed) return false
  // Reject control characters and any internal whitespace — these are parsed
  // inconsistently across OS shell entry points and can hide malicious URIs.
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return false
  if (/\s/.test(trimmed)) return false

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return false
  }

  return SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol.toLowerCase())
}
