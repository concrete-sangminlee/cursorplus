/**
 * Extensions that `shell.openPath()` would hand to the OS shell, which then
 * executes them with the default associated app — i.e. arbitrary native code.
 * Treat any path ending in (or containing) one of these as unsafe to open.
 *
 * Sources of risk: Windows associates many of these with cscript/wscript/
 * mshta/regedit; macOS treats `.app` bundles as executables; `.jar` runs via
 * the Java launcher when installed.
 */
const DANGEROUS_OPEN_EXTENSIONS = new Set([
  // Windows native executables and script hosts
  'exe', 'bat', 'cmd', 'com', 'scr', 'pif',
  'vbs', 'vbe', 'jse', 'wsf', 'wsh', 'ps1',
  'msi', 'msp', 'mst', 'hta', 'cpl', 'reg', 'lnk',
  // Unix shells
  'sh', 'bash', 'zsh',
  // Cross-platform launchers
  'app', 'jar',
])

function hasDangerousExtension(filePath: string): boolean {
  // Normalize separators and take the basename
  const norm = filePath.replace(/\\/g, '/')
  const base = norm.substring(norm.lastIndexOf('/') + 1).toLowerCase()
  // Check every dot-separated segment, not just the last one — defeats the
  // `invoice.pdf.exe` lookalike trick where the victim only sees `.pdf`.
  const segments = base.split('.').slice(1)
  for (const seg of segments) {
    if (DANGEROUS_OPEN_EXTENSIONS.has(seg)) return true
  }
  return false
}

function hasControlOrNull(input: string): boolean {
  return /[\x00-\x1F\x7F]/.test(input)
}

/**
 * Validate a path that is about to be handed to `shell.openPath()`.
 *
 * `openPath` invokes the OS default application for the given file, which is
 * a direct RCE primitive for executable extensions. We refuse anything that
 * smells like a script or binary; ordinary documents pass through.
 */
export function isSafeOpenPath(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string') return false
  const trimmed = filePath.trim()
  if (!trimmed) return false
  if (hasControlOrNull(trimmed)) return false
  if (hasDangerousExtension(trimmed)) return false
  return true
}

/**
 * Validate a path passed to `shell.showItemInFolder()`. This call only opens
 * the file manager and selects the target — it does NOT execute the file —
 * so we only screen for outright malformed input (NUL injection, non-strings,
 * empty values). Extension filtering is intentionally not applied.
 */
export function isSafeRevealPath(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string') return false
  const trimmed = filePath.trim()
  if (!trimmed) return false
  if (hasControlOrNull(trimmed)) return false
  return true
}
