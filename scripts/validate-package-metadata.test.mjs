import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseArgs, validatePackageMetadata } from './validate-package-metadata.mjs'

const tempDirs = []

const writeTempJson = (packageName, version, suffix = 'package') => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `orion-meta-${suffix}-`))
  tempDirs.push(dir)
  const filePath = path.join(dir, `${suffix}.json`)
  fs.writeFileSync(filePath, JSON.stringify({ name: packageName, version }))
  return { dir, filePath }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true })
  }
})

describe('parseArgs', () => {
  it('supports --key=value and --key value syntaxes', () => {
    expect(parseArgs(['--expected-version=1.2.3', '--package-json', 'tmp/package.json']))
      .toEqual({
        'expected-version': '1.2.3',
        'package-json': 'tmp/package.json',
      })
  })

  it('treats standalone flags as true', () => {
    expect(parseArgs(['--force'])).toEqual({ force: 'true' })
  })
})

describe('validatePackageMetadata', () => {
  it('passes when metadata is aligned', () => {
    const { filePath: packageJson } = writeTempJson('@scope/demo', '1.0.0', 'pkg')
    const { filePath: packageLock } = writeTempJson('@scope/demo', '1.0.0', 'lock')

    expect(validatePackageMetadata({
      packageJsonPath: packageJson,
      packageLockPath: packageLock,
      expectedVersion: '1.0.0',
    })).toEqual({
      packageName: '@scope/demo',
      packageVersion: '1.0.0',
    })
  })

  it('throws on package name mismatch', () => {
    const { filePath: packageJson } = writeTempJson('@scope/demo', '1.0.0', 'pkg')
    const { filePath: packageLock } = writeTempJson('@scope/different', '1.0.0', 'lock')

    expect(() => validatePackageMetadata({
      packageJsonPath: packageJson,
      packageLockPath: packageLock,
    })).toThrow('package.json name (@scope/demo) does not match package-lock.json name (@scope/different).')
  })

  it('throws on expected version mismatch', () => {
    const { filePath: packageJson } = writeTempJson('@scope/demo', '1.0.0', 'pkg')
    const { filePath: packageLock } = writeTempJson('@scope/demo', '1.0.0', 'lock')

    expect(() => validatePackageMetadata({
      packageJsonPath: packageJson,
      packageLockPath: packageLock,
      expectedVersion: '2.0.0',
    })).toThrow('package version (1.0.0) does not match expected version (2.0.0).')
  })
})
