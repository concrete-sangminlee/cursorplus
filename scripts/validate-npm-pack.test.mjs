import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  hasPackedMatch,
  normalizePath,
  parseArgs,
  readText,
  validatePackPayload,
} from './validate-npm-pack.mjs'

const tempDirs = []

const makePackageJson = () => ({
  name: '@scope/toolkit',
  version: '1.2.3',
  main: 'dist/main.js',
  bin: {
    toolkit: 'dist/cli.mjs',
  },
  files: [
    'dist/',
    'README.md',
  ],
})

const makePackEntry = (overrides = {}) => ({
  name: '@scope/toolkit',
  version: '1.2.3',
  filename: 'scope-toolkit-1.2.3.tgz',
  entryCount: 7,
  integrity: 'sha512-test',
  files: [
    { path: 'LICENSE', size: 1 },
    { path: 'README.md', size: 1 },
    { path: 'CHANGELOG.md', size: 1 },
    { path: 'SECURITY.md', size: 1 },
    { path: 'package.json', size: 1 },
    { path: 'dist/main.js', size: 1 },
    { path: 'dist/cli.mjs', size: 1 },
  ],
  ...overrides,
})

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { force: true, recursive: true })
  }
})

describe('validatePackPayload', () => {
  it('accepts a complete scoped package payload', () => {
    const result = validatePackPayload({
      packageJson: makePackageJson(),
      packEntry: makePackEntry(),
      fileExists: (filePath) => filePath === 'dist/cli.mjs',
      readFileText: () => '#!/usr/bin/env node\nconsole.log("ok")\n',
    })

    expect(result).toMatchObject({
      packageName: '@scope/toolkit',
      packedFileCount: 7,
      version: '1.2.3',
    })
    expect(result.expectedFiles).toContain('dist/cli.mjs')
  })

  it('rejects missing required package files', () => {
    expect(() => validatePackPayload({
      packageJson: makePackageJson(),
      packEntry: makePackEntry({
        entryCount: 6,
        files: makePackEntry().files.filter((item) => item.path !== 'SECURITY.md'),
      }),
      fileExists: () => true,
      readFileText: () => '#!/usr/bin/env node\n',
    })).toThrow('npm pack is missing required files: SECURITY.md')
  })

  it('rejects binary entries without a shebang', () => {
    expect(() => validatePackPayload({
      packageJson: makePackageJson(),
      packEntry: makePackEntry(),
      fileExists: () => true,
      readFileText: () => 'console.log("missing shebang")\n',
    })).toThrow('npm binary files must exist and start with a shebang: dist/cli.mjs')
  })

  it('rejects inconsistent entry counts', () => {
    expect(() => validatePackPayload({
      packageJson: makePackageJson(),
      packEntry: makePackEntry({ entryCount: 99 }),
      fileExists: () => true,
      readFileText: () => '#!/usr/bin/env node\n',
    })).toThrow('npm pack entryCount mismatch: expected 7, got 99')
  })
})

describe('readText', () => {
  it('reads PowerShell UTF-16LE redirected JSON files', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orion-pack-test-'))
    tempDirs.push(tempDir)
    const filePath = path.join(tempDir, 'pack.json')

    fs.writeFileSync(filePath, Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('[{"name":"orion"}]', 'utf16le'),
    ]))

    expect(readText(filePath)).toBe('[{"name":"orion"}]')
  })
})

describe('parseArgs', () => {
  it('parses long options in --flag=value and --flag value forms', () => {
    expect(parseArgs(['--pack-json=my-pack.json', '--expected-version', '1.2.3']))
      .toEqual({
        'pack-json': 'my-pack.json',
        'expected-version': '1.2.3',
      })
  })

  it('treats standalone flags as true', () => {
    expect(parseArgs(['--verbose'])).toEqual({
      verbose: 'true',
    })
  })
})

describe('hasPackedMatch', () => {
  const packFiles = new Set(['dist/main.js', 'src/index.js', 'README.md'])

  it('matches explicit file names and directory prefixes', () => {
    expect(hasPackedMatch(packFiles, 'dist/')).toBe(true)
    expect(hasPackedMatch(packFiles, 'README.md')).toBe(true)
  })

  it('matches normalized windows-style paths', () => {
    expect(normalizePath('dist\\\\main.js')).toBe('dist/main.js')
    expect(hasPackedMatch(packFiles, 'dist\\\\')).toBe(true)
  })

  it('matches glob entries for nested files', () => {
    expect(hasPackedMatch(packFiles, 'src/*.js')).toBe(true)
    expect(hasPackedMatch(packFiles, 'LICENSE')).toBe(false)
  })
})
