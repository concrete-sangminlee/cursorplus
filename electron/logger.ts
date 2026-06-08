type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function normalizeLevel(value: string | undefined): LogLevel | null {
  if (!value) return null
  const normalized = value.toLowerCase()
  return normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error'
    ? normalized
    : null
}

function configuredLevel(): LogLevel {
  const explicitLevel = normalizeLevel(process.env.ORION_LOG_LEVEL)
  if (explicitLevel) return explicitLevel

  if (process.env.ORION_DEBUG === '1' || process.env.DEBUG?.includes('orion')) {
    return 'debug'
  }

  return 'warn'
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[configuredLevel()]
}

function prefix(scope: string): string {
  return `[${scope}]`
}

export function debugLog(scope: string, message: string, ...details: unknown[]): void {
  if (shouldLog('debug')) {
    console.debug(prefix(scope), message, ...details)
  }
}

export function infoLog(scope: string, message: string, ...details: unknown[]): void {
  if (shouldLog('info')) {
    console.info(prefix(scope), message, ...details)
  }
}

export function warnLog(scope: string, message: string, ...details: unknown[]): void {
  if (shouldLog('warn')) {
    console.warn(prefix(scope), message, ...details)
  }
}

export function errorLog(scope: string, message: string, ...details: unknown[]): void {
  if (shouldLog('error')) {
    console.error(prefix(scope), message, ...details)
  }
}
