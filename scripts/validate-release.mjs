#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, validatePackageMetadata } from './validate-package-metadata.mjs'

const semVerRegExp = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

export const isValidSemVer = (value) => semVerRegExp.test(value)

export const hasReleaseHeading = (body, version) => {
  const headingRegex = new RegExp(`^#{2,4}\\s+\\[?v?${escapeRegExp(version)}\\]?\\b`)
  return body.split(/\r?\n/).some((line) => headingRegex.test(line))
}

export const packageVersionExists = (packageName, version) => {
  try {
    execFileSync(npmCommand, ['view', `${packageName}@${version}`, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return true
  } catch (error) {
    return false
  }
}

export const validateReleaseTagOnDefaultBranch = ({
  defaultBranch = 'main',
  commitSha = process.env.GITHUB_SHA || '',
  repoPrefix = 'origin',
  runGitCommand = (args) => execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }),
} = {}) => {
  const baseBranch = `${repoPrefix}/${defaultBranch}`
  const listResult = runGitCommand(['branch', '-r', '--list', baseBranch]).toString().trim()

  if (!listResult) {
    throw new Error(`Base branch ref '${baseBranch}' not found; expected branch '${defaultBranch}'.`)
  }

  if (!commitSha) {
    throw new Error('Unable to determine the release commit SHA.')
  }

  try {
    runGitCommand(['merge-base', '--is-ancestor', baseBranch, commitSha])
  } catch (error) {
    throw new Error(`Tag commit (${commitSha}) is not on ${baseBranch} history.`)
  }
}

export const validateReleaseContext = ({
  tagName = process.env.GITHUB_REF_NAME || '',
  packageJsonPath = 'package.json',
  packageLockPath = 'package-lock.json',
  changelogPath = 'CHANGELOG.md',
  npmToken = process.env.NPM_TOKEN || '',
  defaultBranch = 'main',
  commitSha = process.env.GITHUB_SHA || '',
  checkDefaultBranchHistory = true,
  checkExistingNpmVersion = true,
  readFileText = (filePath) => fs.readFileSync(filePath, 'utf8'),
  isExistingNpmVersion = packageVersionExists,
  runGitCommand = (args) => execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }),
} = {}) => {
  const normalizedTag = String(tagName || '')
    .trim()
    .replace(/^refs\/tags\//, '')
    .replace(/^v/, '')
  if (!normalizedTag) {
    throw new Error('Release tag is missing.')
  }

  if (!isValidSemVer(normalizedTag)) {
    throw new Error(`Release tag '${normalizedTag}' is not valid SemVer.`)
  }

  const result = validatePackageMetadata({
    packageJsonPath,
    packageLockPath,
    expectedVersion: normalizedTag,
  })

  const resolvedChangelogPath = path.resolve(changelogPath)
  if (!fs.existsSync(resolvedChangelogPath)) {
    throw new Error('CHANGELOG.md is required for release traceability.')
  }

  const changelogBody = readFileText(resolvedChangelogPath)
  if (!hasReleaseHeading(changelogBody, normalizedTag)) {
    throw new Error(`CHANGELOG.md does not contain a release heading for ${normalizedTag}`)
  }

  if (checkExistingNpmVersion && npmToken && isExistingNpmVersion(result.packageName, normalizedTag)) {
    throw new Error(`Version ${normalizedTag} already exists in npm registry for ${result.packageName}.`)
  }

  const normalizedBranch = String(defaultBranch || 'main').replace(/^refs\/heads\//, '')
  if (checkDefaultBranchHistory) {
    validateReleaseTagOnDefaultBranch({
      defaultBranch: normalizedBranch,
      commitSha,
      runGitCommand,
    })
  }

  return {
    packageName: result.packageName,
    version: result.packageVersion,
    normalizedTag,
  }
}

export const runCli = () => {
  const options = parseArgs(process.argv.slice(2))
  const result = validateReleaseContext({
    tagName: options.tag || process.env.GITHUB_REF_NAME,
    packageJsonPath: options['package-json'] || 'package.json',
    packageLockPath: options['package-lock'] || 'package-lock.json',
    changelogPath: options.changelog || 'CHANGELOG.md',
    npmToken: options['npm-token'] || process.env.NPM_TOKEN || '',
    defaultBranch: options['default-branch'] || process.env.DEFAULT_BRANCH || 'main',
    commitSha: options.sha || process.env.GITHUB_SHA || '',
    checkDefaultBranchHistory: options['skip-branch-check'] !== 'true',
    checkExistingNpmVersion: options['skip-npm-check'] !== 'true' && options['skip-registry-check'] !== 'true',
  })

  process.stdout.write(`release metadata validated: ${result.packageName}@${result.version}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    runCli()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
