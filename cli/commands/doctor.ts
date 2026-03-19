/**
 * Orion CLI - Doctor Command
 * Full health check of the Orion development environment.
 * Checks Node.js, npm, git, Ollama, API keys, config, disk space.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import {
  colors,
  readConfig,
  getConfigPath,
  printInfo,
} from '../utils.js';
import { commandHeader, divider, statusLine, palette } from '../ui.js';
import { getPipelineOptions, jsonOutput } from '../pipeline.js';
import { getBackupStats } from '../backup.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type CheckStatus = 'pass' | 'fail' | 'warn';

interface CheckResult {
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function runCmd(cmd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return { ok: true, output };
  } catch {
    return { ok: false, output: '' };
  }
}

function parseVersion(versionStr: string): number[] {
  const match = versionStr.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function versionAtLeast(current: number[], minimum: number[]): boolean {
  for (let i = 0; i < 3; i++) {
    if (current[i] > minimum[i]) return true;
    if (current[i] < minimum[i]) return false;
  }
  return true; // equal
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function printCheck(result: CheckResult): void {
  const icon = result.status === 'pass' ? '\u2713'
    : result.status === 'fail' ? '\u2717'
    : '!';
  console.log(statusLine(icon as any, result.detail));
}

// ─── Individual Checks ───────────────────────────────────────────────────────

function checkNodeVersion(): CheckResult {
  const { ok, output } = runCmd('node --version');
  if (!ok) {
    return {
      label: 'node',
      status: 'fail',
      detail: `Node.js: ${palette.red('not found')}`,
      fix: 'Install Node.js from https://nodejs.org (v18+ recommended)',
    };
  }

  const version = parseVersion(output);
  if (versionAtLeast(version, [18, 0, 0])) {
    return {
      label: 'node',
      status: 'pass',
      detail: `Node.js: ${palette.green(output)}`,
    };
  }

  return {
    label: 'node',
    status: 'warn',
    detail: `Node.js: ${palette.yellow(output)} (v18+ recommended)`,
    fix: 'Upgrade Node.js to v18 or later for best compatibility.',
  };
}

function checkNpmVersion(): CheckResult {
  const { ok, output } = runCmd('npm --version');
  if (!ok) {
    return {
      label: 'npm',
      status: 'fail',
      detail: `npm: ${palette.red('not found')}`,
      fix: 'npm should be installed with Node.js. Reinstall Node.js.',
    };
  }

  return {
    label: 'npm',
    status: 'pass',
    detail: `npm: ${palette.green('v' + output)}`,
  };
}

function checkGit(): CheckResult {
  const { ok, output } = runCmd('git --version');
  if (!ok) {
    return {
      label: 'git',
      status: 'fail',
      detail: `Git: ${palette.red('not found')}`,
      fix: 'Install Git from https://git-scm.com',
    };
  }

  // Check if current directory is a git repo
  const { ok: isRepo } = runCmd('git rev-parse --is-inside-work-tree');
  const repoStatus = isRepo
    ? palette.dim(' (repo initialized)')
    : palette.yellow(' (not a git repo)');

  if (!isRepo) {
    return {
      label: 'git',
      status: 'warn',
      detail: `Git: ${palette.green(output.replace('git version ', 'v'))}${repoStatus}`,
      fix: 'Run `git init` to initialize a repository in this directory.',
    };
  }

  return {
    label: 'git',
    status: 'pass',
    detail: `Git: ${palette.green(output.replace('git version ', 'v'))}${repoStatus}`,
  };
}

async function checkOllama(): Promise<CheckResult> {
  const config = readConfig();
  const ollamaHost = config.ollamaHost || 'http://localhost:11434';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${ollamaHost}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        label: 'ollama',
        status: 'warn',
        detail: `Ollama: ${palette.yellow('running but returned error ' + response.status)}`,
        fix: 'Check Ollama installation: https://ollama.ai',
      };
    }

    const data = await response.json() as { models?: { name: string }[] };
    const models = data.models || [];

    if (models.length === 0) {
      return {
        label: 'ollama',
        status: 'warn',
        detail: `Ollama: ${palette.green('running')} ${palette.yellow('(no models installed)')}`,
        fix: 'Install a model: `ollama pull llama3.2`',
      };
    }

    const modelNames = models.map(m => m.name).slice(0, 5);
    const extra = models.length > 5 ? ` +${models.length - 5} more` : '';

    return {
      label: 'ollama',
      status: 'pass',
      detail: `Ollama: ${palette.green('running')} ${palette.dim(`(${modelNames.join(', ')}${extra})`)}`,
    };
  } catch {
    return {
      label: 'ollama',
      status: 'warn',
      detail: `Ollama: ${palette.yellow('not running')}`,
      fix: 'Start Ollama with `ollama serve` or install from https://ollama.ai',
    };
  }
}

function checkAnthropicKey(): CheckResult {
  const config = readConfig();
  const key = process.env.ANTHROPIC_API_KEY || config.anthropicApiKey;

  if (key) {
    const masked = key.substring(0, 7) + '****' + key.substring(key.length - 4);
    return {
      label: 'anthropic_key',
      status: 'pass',
      detail: `ANTHROPIC_API_KEY: ${palette.green('set')} ${palette.dim(`(${masked})`)}`,
    };
  }

  return {
    label: 'anthropic_key',
    status: 'warn',
    detail: `ANTHROPIC_API_KEY: ${palette.yellow('not set')}`,
    fix: 'Set via environment variable or run `orion config` to save it.',
  };
}

function checkOpenAIKey(): CheckResult {
  const config = readConfig();
  const key = process.env.OPENAI_API_KEY || config.openaiApiKey;

  if (key) {
    const masked = key.substring(0, 7) + '****' + key.substring(key.length - 4);
    return {
      label: 'openai_key',
      status: 'pass',
      detail: `OPENAI_API_KEY: ${palette.green('set')} ${palette.dim(`(${masked})`)}`,
    };
  }

  return {
    label: 'openai_key',
    status: 'warn',
    detail: `OPENAI_API_KEY: ${palette.yellow('not set')}`,
    fix: 'Set via environment variable or run `orion config` to save it.',
  };
}

function checkConfigFile(): CheckResult {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return {
      label: 'config',
      status: 'warn',
      detail: `Config file: ${palette.yellow('not found')} ${palette.dim(configPath)}`,
      fix: 'Run `orion config` or `orion init` to create the configuration file.',
    };
  }

  // Validate JSON
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    JSON.parse(raw);
    return {
      label: 'config',
      status: 'pass',
      detail: `Config file: ${palette.green('valid')} ${palette.dim(configPath)}`,
    };
  } catch {
    return {
      label: 'config',
      status: 'fail',
      detail: `Config file: ${palette.red('invalid JSON')} ${palette.dim(configPath)}`,
      fix: 'Fix the JSON syntax in your config file, or delete it and run `orion config`.',
    };
  }
}

function checkContextFile(): CheckResult {
  const contextPath = path.join(process.cwd(), '.orion', 'context.md');

  if (fs.existsSync(contextPath)) {
    try {
      const stat = fs.statSync(contextPath);
      return {
        label: 'context',
        status: 'pass',
        detail: `Project context: ${palette.green('found')} ${palette.dim(`(${formatSize(stat.size)})`)}`,
      };
    } catch {
      return {
        label: 'context',
        status: 'warn',
        detail: `Project context: ${palette.yellow('exists but unreadable')}`,
        fix: 'Check file permissions on .orion/context.md.',
      };
    }
  }

  return {
    label: 'context',
    status: 'warn',
    detail: `Project context: ${palette.yellow('not found')} ${palette.dim('.orion/context.md')}`,
    fix: 'Run `orion init` to create a project context file for better AI responses.',
  };
}

function checkDiskSpace(): CheckResult {
  const backupStats = getBackupStats();
  const backupsDir = path.join(process.cwd(), '.orion', 'backups');

  // Check free disk space
  let freeSpace: number | null = null;
  try {
    if (process.platform === 'win32') {
      // On Windows, use wmic to get free space for the drive
      const drive = path.resolve(process.cwd()).substring(0, 2);
      const { ok, output } = runCmd(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace /format:value`);
      if (ok) {
        const match = output.match(/FreeSpace=(\d+)/);
        if (match) {
          freeSpace = parseInt(match[1], 10);
        }
      }
    } else {
      const { ok, output } = runCmd(`df -k "${process.cwd()}" | tail -1`);
      if (ok) {
        const parts = output.split(/\s+/);
        // Available is typically the 4th column
        if (parts.length >= 4) {
          freeSpace = parseInt(parts[3], 10) * 1024;
        }
      }
    }
  } catch { /* ignore */ }

  const backupInfo = backupStats.count > 0
    ? `${backupStats.count} backups (${formatSize(backupStats.totalSize)})`
    : 'no backups';

  if (freeSpace !== null) {
    const freeStr = formatSize(freeSpace);
    if (freeSpace < 100 * 1024 * 1024) { // Less than 100MB
      return {
        label: 'disk',
        status: 'fail',
        detail: `Disk space: ${palette.red(freeStr + ' free')} ${palette.dim(`| ${backupInfo}`)}`,
        fix: 'Free up disk space. Run `orion undo --clean` to remove old backups.',
      };
    }
    if (freeSpace < 1024 * 1024 * 1024) { // Less than 1GB
      return {
        label: 'disk',
        status: 'warn',
        detail: `Disk space: ${palette.yellow(freeStr + ' free')} ${palette.dim(`| ${backupInfo}`)}`,
        fix: 'Consider freeing disk space. Run `orion undo --clean` to remove old backups.',
      };
    }
    return {
      label: 'disk',
      status: 'pass',
      detail: `Disk space: ${palette.green(freeStr + ' free')} ${palette.dim(`| ${backupInfo}`)}`,
    };
  }

  // Could not determine disk space, just report backup info
  return {
    label: 'disk',
    status: 'pass',
    detail: `Disk space: ${palette.dim('could not determine free space')} ${palette.dim(`| ${backupInfo}`)}`,
  };
}

// ─── Main Doctor Command ─────────────────────────────────────────────────────

export async function doctorCommand(): Promise<void> {
  console.log(commandHeader('Orion Doctor'));
  console.log();
  console.log(`  ${palette.dim('Running health checks...')}`);
  console.log();

  const results: CheckResult[] = [];

  // ── Runtime Environment ────────────────────────────────────────────────────

  console.log(divider('Runtime Environment'));
  console.log();

  const nodeCheck = checkNodeVersion();
  results.push(nodeCheck);
  printCheck(nodeCheck);

  const npmCheck = checkNpmVersion();
  results.push(npmCheck);
  printCheck(npmCheck);

  const gitCheck = checkGit();
  results.push(gitCheck);
  printCheck(gitCheck);

  console.log();

  // ── AI Providers ───────────────────────────────────────────────────────────

  console.log(divider('AI Providers'));
  console.log();

  const ollamaCheck = await checkOllama();
  results.push(ollamaCheck);
  printCheck(ollamaCheck);

  const anthropicCheck = checkAnthropicKey();
  results.push(anthropicCheck);
  printCheck(anthropicCheck);

  const openaiCheck = checkOpenAIKey();
  results.push(openaiCheck);
  printCheck(openaiCheck);

  // Check that at least one provider is available
  const hasProvider =
    ollamaCheck.status === 'pass' ||
    anthropicCheck.status === 'pass' ||
    openaiCheck.status === 'pass';

  if (!hasProvider) {
    console.log();
    console.log(statusLine('\u2717' as any, palette.red('No AI provider available!')));
    printInfo('Configure at least one: Ollama, ANTHROPIC_API_KEY, or OPENAI_API_KEY.');
  }

  console.log();

  // ── Configuration ──────────────────────────────────────────────────────────

  console.log(divider('Configuration'));
  console.log();

  const configCheck = checkConfigFile();
  results.push(configCheck);
  printCheck(configCheck);

  const contextCheck = checkContextFile();
  results.push(contextCheck);
  printCheck(contextCheck);

  console.log();

  // ── Storage ────────────────────────────────────────────────────────────────

  console.log(divider('Storage'));
  console.log();

  const diskCheck = checkDiskSpace();
  results.push(diskCheck);
  printCheck(diskCheck);

  console.log();

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log(divider('Summary'));
  console.log();

  const passed = results.filter(r => r.status === 'pass').length;
  const warnings = results.filter(r => r.status === 'warn').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const total = results.length;

  console.log(
    `  ${palette.green(`${passed} passed`)} | ` +
    `${palette.yellow(`${warnings} warnings`)} | ` +
    `${palette.red(`${failed} failed`)} | ` +
    `${palette.dim(`${total} total checks`)}`
  );

  // ── Suggested Fixes ────────────────────────────────────────────────────────

  const fixable = results.filter(r => r.fix);

  if (fixable.length > 0) {
    console.log();
    console.log(divider('Suggested Fixes'));
    console.log();

    for (const result of fixable) {
      const icon = result.status === 'fail' ? '\u2717' : '!';
      const iconColor = result.status === 'fail' ? palette.red : palette.yellow;
      console.log(`  ${iconColor(icon)} ${result.fix}`);
    }
  }

  console.log();

  // ── Pipeline JSON output ───────────────────────────────────────────────────

  jsonOutput('doctor', {
    passed,
    warnings,
    failed,
    total,
    checks: results.map(r => ({
      label: r.label,
      status: r.status,
      fix: r.fix || null,
    })),
  });

  // Exit with non-zero if any critical check failed
  if (failed > 0) {
    process.exit(1);
  }
}
