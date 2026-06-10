#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

const readOption = (name) => {
  const prefix = `--${name}=`
  const inline = args.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = args.indexOf(`--${name}`)
  if (index >= 0) return args[index + 1]

  return undefined
}

const readText = (filePath) => {
  const bytes = fs.readFileSync(filePath)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.toString('utf16le').replace(/^\uFEFF/, '')
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    throw new Error(`${filePath} uses unsupported UTF-16BE encoding.`)
  }
  return bytes.toString('utf8').replace(/^\uFEFF/, '')
}
const readJson = (filePath) => JSON.parse(readText(filePath))
const normalizePath = (value) => String(value || '').replace(/^\.\/+/, '')
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const toRegexFromGlob = (pattern) => {
  const escaped = escapeRegExp(pattern)
    .replace(/\\\*/g, '.*')
    .replace(/\\\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

const hasPackedMatch = (packFiles, pattern) => {
  const normalized = normalizePath(pattern)
  if (!normalized) return false
  if (packFiles.has(normalized)) return true

  const directoryPrefix = normalized.endsWith('/') ? normalized : `${normalized}/`
  if ([...packFiles].some((file) => file.startsWith(directoryPrefix))) return true

  if (/[*!?]/.test(normalized)) {
    const globExp = toRegexFromGlob(normalized)
    return [...packFiles].some((file) => globExp.test(file))
  }

  return false
}

const binEntries = (bin) => {
  if (typeof bin === 'string') return [bin]
  if (bin && typeof bin === 'object') return Object.values(bin)
  return []
}

const safePackName = (packageName) => packageName.replace(/^@/, '').replace(/\//g, '-')

const packageJsonPath = readOption('package-json') || 'package.json'
const packJsonPath = readOption('pack-json')
const packageJson = readJson(packageJsonPath)
const expectedVersion = readOption('expected-version') || packageJson.version
const packageName = packageJson.name
const safeName = safePackName(packageName)
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

if (!packageName) {
  console.error('package.json is missing a package name.')
  process.exit(1)
}

if (!expectedVersion) {
  console.error('Unable to determine the expected package version.')
  process.exit(1)
}

const packJson = packJsonPath
  ? readText(packJsonPath)
  : execFileSync(npmCommand, ['pack', '--json', '--dry-run'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })
const parsed = JSON.parse(packJson)
const entry = Array.isArray(parsed) ? parsed[0] : parsed

if (!entry || typeof entry !== 'object') {
  console.error('Unable to parse npm pack JSON output.')
  process.exit(1)
}

const expectedFiles = new Set([
  'LICENSE',
  'README.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'package.json',
])

if (packageJson.main) expectedFiles.add(packageJson.main)
binEntries(packageJson.bin).forEach((binEntry) => expectedFiles.add(binEntry))

if (Array.isArray(packageJson.files) && packageJson.files.length > 0) {
  packageJson.files.forEach((entryName) => expectedFiles.add(entryName))
}

const packedFileMetadata = Array.isArray(entry.files) ? entry.files : []
const entryFiles = new Set(
  packedFileMetadata
    .map((item) => (typeof item === 'string' ? item : item.path))
    .map(normalizePath),
)
const normalizedExpectedFiles = [...expectedFiles].map(normalizePath)
const missingFiles = normalizedExpectedFiles
  .filter((file) => !hasPackedMatch(entryFiles, file))
  .sort()

if (missingFiles.length > 0) {
  console.error(`npm pack is missing required files: ${missingFiles.join(', ')}`)
  process.exit(1)
}

const missingShebangs = binEntries(packageJson.bin)
  .map(normalizePath)
  .filter((binEntry) => {
    if (!binEntry || !fs.existsSync(binEntry)) return true
    return !fs.readFileSync(binEntry, 'utf8').startsWith('#!')
  })

if (missingShebangs.length > 0) {
  console.error(`npm binary files must exist and start with a shebang: ${missingShebangs.join(', ')}`)
  process.exit(1)
}

const expectedFilename = `${safeName}-${expectedVersion}.tgz`
const actualFilename = path.basename(entry.filename || '')

if (actualFilename !== expectedFilename) {
  console.error(`Unexpected pack filename: expected ${expectedFilename}, got ${actualFilename}`)
  process.exit(1)
}

if (entry.name !== packageName) {
  console.error(`Packed package name mismatch: expected ${packageName}, got ${entry.name}`)
  process.exit(1)
}

if (entry.version !== expectedVersion) {
  console.error(`Packed package version mismatch: expected ${expectedVersion}, got ${entry.version}`)
  process.exit(1)
}

if (packedFileMetadata.length === 0) {
  console.error('npm pack output is missing file list metadata.')
  process.exit(1)
}

if (typeof entry.entryCount === 'number' && entry.entryCount !== packedFileMetadata.length) {
  console.error(`npm pack entryCount mismatch: expected ${packedFileMetadata.length}, got ${entry.entryCount}`)
  process.exit(1)
}

const emptyCriticalFiles = packedFileMetadata
  .filter((item) => normalizedExpectedFiles.includes(normalizePath(item.path)))
  .filter((item) => item.size === 0)
  .map((item) => item.path)

if (emptyCriticalFiles.length > 0) {
  console.error(`npm pack includes empty critical files: ${emptyCriticalFiles.join(', ')}`)
  process.exit(1)
}

if (!entry.integrity && process.env.ACTIONS_STEP_DEBUG !== 'true') {
  console.info('No integrity hash is reported in npm pack output; continuing with available metadata.')
}

console.log(`npm pack validation passed for ${packageName}@${expectedVersion}`)
console.log(`Expected files present: ${normalizedExpectedFiles.sort().join(', ')}`)
console.log(`Packed file count: ${packedFileMetadata.length}`)
