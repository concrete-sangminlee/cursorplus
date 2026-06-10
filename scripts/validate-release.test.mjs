import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  hasReleaseHeading,
  isValidSemVer,
  validateReleaseContext,
} from './validate-release.mjs'

const tempDirs = []

const writeJson = (name, version, filename) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orion-release-'))
  tempDirs.push(dir)
  const filePath = path.join(dir, filename)
  fs.writeFileSync(filePath, JSON.stringify({ name, version }))
  return { dir, filePath }
}

const writeChangelog = (dir, contents) => {
  const changelogPath = path.join(dir, 'CHANGELOG.md')
  fs.writeFileSync(changelogPath, contents)
  return changelogPath
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true })
  }
})

describe('release metadata validation', () => {
  it('detects valid semver tags', () => {
    expect(isValidSemVer('1.2.3')).toBe(true)
    expect(isValidSemVer('1.2.3-beta.1+build.1')).toBe(true)
    expect(isValidSemVer('v1.2.3')).toBe(false)
  })

  it('detects release heading in changelog content', () => {
    const body = ['# Changelog', '## [1.2.3]', '### Changed', '- stuff'].join('\n')
    expect(hasReleaseHeading(body, '1.2.3')).toBe(true)
    expect(hasReleaseHeading(body, '9.9.9')).toBe(false)
  })

  it('validates complete release context and skips remote npm check by test override', () => {
    const pkg = writeJson('@scope/demo', '1.2.3', 'package.json')
    const lock = writeJson('@scope/demo', '1.2.3', 'package-lock.json')
    const changelogPath = writeChangelog(pkg.dir, '# Changelog\n\n## v1.2.3\n\n- Added')

    const result = validateReleaseContext({
      tagName: 'v1.2.3',
      packageJsonPath: pkg.filePath,
      packageLockPath: lock.filePath,
      changelogPath,
      npmToken: 'fake-token',
      checkExistingNpmVersion: false,
      readFileText: (filePath) => fs.readFileSync(filePath, 'utf8'),
      isExistingNpmVersion: () => false,
    })

    expect(result).toMatchObject({
      packageName: '@scope/demo',
      normalizedTag: '1.2.3',
      version: '1.2.3',
    })
  })

  it('fails when published version exists in registry', () => {
    const pkg = writeJson('@scope/demo', '2.0.0', 'package.json')
    const lock = writeJson('@scope/demo', '2.0.0', 'package-lock.json')
    const changelogPath = writeChangelog(pkg.dir, '# Changelog\n\n## [2.0.0]')

    expect(() => validateReleaseContext({
      tagName: '2.0.0',
      packageJsonPath: pkg.filePath,
      packageLockPath: lock.filePath,
      changelogPath,
      npmToken: 'fake-token',
      checkExistingNpmVersion: true,
      readFileText: (filePath) => fs.readFileSync(filePath, 'utf8'),
      isExistingNpmVersion: () => true,
    })).toThrow('already exists in npm registry')
  })
})
