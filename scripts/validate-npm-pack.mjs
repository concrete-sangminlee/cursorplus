#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const parseArgs = (args) => {
  const options = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) continue

    const [rawName, inlineValue] = arg.slice(2).split(/=(.*)/s, 2)
    if (inlineValue !== undefined) {
      options[rawName] = inlineValue
    } else {
      options[rawName] = args[index + 1]
      index += 1
    }
  }

  return options
}

export const readText = (filePath) => {
  const bytes = fs.readFileSync(filePath)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.toString('utf16le').replace(/^\uFEFF/, '')
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    throw new Error(`${filePath} uses unsupported UTF-16BE encoding.`)
  }
  return bytes.toString('utf8').replace(/^\uFEFF/, '')
}

export const normalizePath = (value) => String(value || '').replace(/^\.\/+/, '')

const readJson = (filePath) => JSON.parse(readText(filePath))
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const toRegexFromGlob = (pattern) => {
  const escaped = escapeRegExp(pattern)
    .replace(/\\\*/g, '.*')
    .replace(/\\\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

export const hasPackedMatch = (packFiles, pattern) => {
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

export const binEntries = (bin) => {
  if (typeof bin === 'string') return [bin]
  if (bin && typeof bin === 'object') return Object.values(bin)
  return []
}

export const safePackName = (packageName) => packageName.replace(/^@/, '').replace(/\//g, '-')

export const validatePackPayload = ({
  packageJson,
  packEntry,
  expectedVersion = packageJson.version,
  fileExists = fs.existsSync,
  readFileText = (filePath) => fs.readFileSync(filePath, 'utf8'),
}) => {
  const packageName = packageJson.name

  if (!packageName) {
    throw new Error('package.json is missing a package name.')
  }

  if (!expectedVersion) {
    throw new Error('Unable to determine the expected package version.')
  }

  if (!packEntry || typeof packEntry !== 'object') {
    throw new Error('Unable to parse npm pack JSON output.')
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

  const packedFileMetadata = Array.isArray(packEntry.files) ? packEntry.files : []
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
    throw new Error(`npm pack is missing required files: ${missingFiles.join(', ')}`)
  }

  const missingShebangs = binEntries(packageJson.bin)
    .map(normalizePath)
    .filter((binEntry) => {
      if (!binEntry || !fileExists(binEntry)) return true
      return !readFileText(binEntry).startsWith('#!')
    })

  if (missingShebangs.length > 0) {
    throw new Error(`npm binary files must exist and start with a shebang: ${missingShebangs.join(', ')}`)
  }

  const expectedFilename = `${safePackName(packageName)}-${expectedVersion}.tgz`
  const actualFilename = path.basename(packEntry.filename || '')

  if (actualFilename !== expectedFilename) {
    throw new Error(`Unexpected pack filename: expected ${expectedFilename}, got ${actualFilename}`)
  }

  if (packEntry.name !== packageName) {
    throw new Error(`Packed package name mismatch: expected ${packageName}, got ${packEntry.name}`)
  }

  if (packEntry.version !== expectedVersion) {
    throw new Error(`Packed package version mismatch: expected ${expectedVersion}, got ${packEntry.version}`)
  }

  if (packedFileMetadata.length === 0) {
    throw new Error('npm pack output is missing file list metadata.')
  }

  if (typeof packEntry.entryCount === 'number' && packEntry.entryCount !== packedFileMetadata.length) {
    throw new Error(`npm pack entryCount mismatch: expected ${packedFileMetadata.length}, got ${packEntry.entryCount}`)
  }

  const emptyCriticalFiles = packedFileMetadata
    .filter((item) => normalizedExpectedFiles.includes(normalizePath(item.path)))
    .filter((item) => item.size === 0)
    .map((item) => item.path)

  if (emptyCriticalFiles.length > 0) {
    throw new Error(`npm pack includes empty critical files: ${emptyCriticalFiles.join(', ')}`)
  }

  return {
    expectedFiles: normalizedExpectedFiles.sort(),
    hasIntegrity: Boolean(packEntry.integrity),
    packageName,
    packedFileCount: packedFileMetadata.length,
    version: expectedVersion,
  }
}

export const loadPackEntry = ({ packJsonPath, npmCommand }) => {
  const packJson = packJsonPath
    ? readText(packJsonPath)
    : execFileSync(npmCommand, ['pack', '--json', '--dry-run'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      })
  const parsed = JSON.parse(packJson)
  return Array.isArray(parsed) ? parsed[0] : parsed
}

export const runCli = (argv = process.argv.slice(2), io = console) => {
  const options = parseArgs(argv)
  const packageJson = readJson(options['package-json'] || 'package.json')
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = validatePackPayload({
    expectedVersion: options['expected-version'] || packageJson.version,
    packageJson,
    packEntry: loadPackEntry({
      npmCommand,
      packJsonPath: options['pack-json'],
    }),
  })

  if (!result.hasIntegrity && process.env.ACTIONS_STEP_DEBUG !== 'true') {
    io.info('No integrity hash is reported in npm pack output; continuing with available metadata.')
  }

  io.log(`npm pack validation passed for ${result.packageName}@${result.version}`)
  io.log(`Expected files present: ${result.expectedFiles.join(', ')}`)
  io.log(`Packed file count: ${result.packedFileCount}`)
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isCli) {
  try {
    runCli()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
