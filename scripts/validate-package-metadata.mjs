#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const parseArgs = (args) => {
  const options = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) {
      continue
    }

    const equalsIndex = arg.indexOf('=')
    const name = equalsIndex >= 0 ? arg.slice(2, equalsIndex) : arg.slice(2)
    if (!name) {
      continue
    }
    const inlineValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : undefined

    if (inlineValue !== undefined) {
      options[name] = inlineValue
    } else if (args[index + 1] && !args[index + 1].startsWith('--')) {
      options[name] = args[index + 1]
      index += 1
    } else {
      options[name] = 'true'
    }
  }

  return options
}

export const validatePackageMetadata = ({
  packageJsonPath = 'package.json',
  packageLockPath = 'package-lock.json',
  expectedVersion,
} = {}) => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(packageJsonPath), 'utf8'))
  const packageLock = JSON.parse(fs.readFileSync(path.resolve(packageLockPath), 'utf8'))

  const packageName = packageJson.name
  const lockName = packageLock.name
  const packageVersion = packageJson.version
  const lockVersion = packageLock.version

  if (!packageName || !lockName) {
    throw new Error('package.json or package-lock.json is missing "name".')
  }

  if (packageName !== lockName) {
    throw new Error(`package.json name (${packageName}) does not match package-lock.json name (${lockName}).`)
  }

  if (!packageVersion || !lockVersion) {
    throw new Error('package.json or package-lock.json is missing "version".')
  }

  if (packageVersion !== lockVersion) {
    throw new Error(`package.json version (${packageVersion}) does not match package-lock.json version (${lockVersion}).`)
  }

  if (expectedVersion && packageVersion !== expectedVersion) {
    throw new Error(`package version (${packageVersion}) does not match expected version (${expectedVersion}).`)
  }

  return {
    packageName,
    packageVersion,
  }
}

export const runCli = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help === 'true') {
    process.stdout.write([
      'metadata:validate --package-json=... --package-lock=... --expected-version=...',
      'Validates package.json and package-lock.json name/version consistency.',
    ].join('\n'))
    process.stdout.write('\n')
    return
  }

  const expectedVersion = options['expected-version']
  const packageJsonPath = options['package-json'] || 'package.json'
  const packageLockPath = options['package-lock'] || 'package-lock.json'

  const result = validatePackageMetadata({
    expectedVersion,
    packageJsonPath,
    packageLockPath,
  })

  process.stdout.write(`package metadata validated: ${result.packageName}@${result.packageVersion}`)
  if (expectedVersion) {
    process.stdout.write(` (expected ${expectedVersion})`)
  }
  process.stdout.write('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    runCli()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
