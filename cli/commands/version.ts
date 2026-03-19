/**
 * Orion CLI - Version Command
 * Enhanced version info: Orion version, Node.js, npm, OS, arch,
 * installed Ollama models, configured providers, CLI install path.
 */

import * as os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  colors,
  readConfig,
} from '../utils.js';
import { commandHeader, divider, keyValue, statusLine, palette } from '../ui.js';
import { jsonOutput } from '../pipeline.js';

// ─── ESM compatibility ──────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Constants ───────────────────────────────────────────────────────────────

const ORION_VERSION = '2.2.0';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function runCmd(cmd: string): string | null {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function getNodeVersion(): string {
  return process.version;
}

function getNpmVersion(): string {
  return runCmd('npm --version') || 'not found';
}

function getOsInfo(): string {
  const platform = process.platform === 'win32' ? 'Windows'
    : process.platform === 'darwin' ? 'macOS'
    : process.platform === 'linux' ? 'Linux'
    : process.platform;

  const release = os.release();
  return `${platform} ${release}`;
}

function getArch(): string {
  return `${process.arch} (${os.cpus().length} cores)`;
}

function getCliPath(): string {
  return __filename;
}

async function getOllamaModels(ollamaHost: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${ollamaHost}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = await response.json() as { models?: { name: string }[] };
    return (data.models || []).map(m => m.name);
  } catch {
    return [];
  }
}

function getConfiguredProviders(): { name: string; configured: boolean }[] {
  const config = readConfig();
  const providers: { name: string; configured: boolean }[] = [];

  // Anthropic
  const hasAnthropic = !!(process.env.ANTHROPIC_API_KEY || config.anthropicApiKey);
  providers.push({ name: 'Anthropic (Claude)', configured: hasAnthropic });

  // OpenAI
  const hasOpenai = !!(process.env.OPENAI_API_KEY || config.openaiApiKey);
  providers.push({ name: 'OpenAI (GPT)', configured: hasOpenai });

  // Ollama
  providers.push({ name: 'Ollama (local)', configured: true }); // always "available" if installed

  return providers;
}

// ─── Main Version Command ────────────────────────────────────────────────────

export async function versionCommand(options: {
  json?: boolean;
}): Promise<void> {
  const config = readConfig();
  const ollamaHost = config.ollamaHost || 'http://localhost:11434';

  // Gather all info
  const nodeVersion = getNodeVersion();
  const npmVersion = getNpmVersion();
  const osInfo = getOsInfo();
  const arch = getArch();
  const cliPath = getCliPath();
  const ollamaModels = await getOllamaModels(ollamaHost);
  const providers = getConfiguredProviders();
  const activeProvider = config.provider || 'auto';
  const activeModel = config.model || 'default';

  // ── JSON output mode ────────────────────────────────────────────────────

  if (options.json) {
    const data = {
      orion: ORION_VERSION,
      node: nodeVersion,
      npm: npmVersion,
      os: osInfo,
      arch: process.arch,
      cpus: os.cpus().length,
      platform: process.platform,
      cliPath,
      activeProvider,
      activeModel,
      providers: providers.map(p => ({ name: p.name, configured: p.configured })),
      ollamaModels,
    };
    console.log(JSON.stringify(data, null, 2));

    jsonOutput('version', data);
    return;
  }

  // ── Pretty output ───────────────────────────────────────────────────────

  console.log(commandHeader('Orion Version'));
  console.log();

  // System info
  console.log(divider('System'));
  console.log();
  console.log(keyValue([
    ['Orion CLI', palette.green('v' + ORION_VERSION)],
    ['Node.js', palette.green(nodeVersion)],
    ['npm', palette.green('v' + npmVersion)],
    ['OS', osInfo],
    ['Arch', arch],
  ]));
  console.log();

  // CLI path
  console.log(divider('Install'));
  console.log();
  console.log('  ' + palette.violet('CLI Path') + '  ' + colors.file(cliPath));
  console.log();

  // Providers
  console.log(divider('Providers'));
  console.log();

  for (const p of providers) {
    const icon = p.configured ? '\u2713' : '\u25CB';
    const text = p.configured
      ? palette.green(p.name)
      : palette.dim(p.name + ' (not configured)');
    console.log(statusLine(icon as any, text));
  }

  console.log();
  console.log(keyValue([
    ['Active Provider', activeProvider],
    ['Active Model', activeModel],
  ]));
  console.log();

  // Ollama models
  console.log(divider('Ollama Models'));
  console.log();

  if (ollamaModels.length > 0) {
    for (const model of ollamaModels) {
      const isActive = model === activeModel;
      const icon = isActive ? '\u25CF' : '\u25CB';
      const iconColor = isActive ? palette.green : palette.dim;
      const suffix = isActive ? palette.yellow(' \u25C0 active') : '';
      console.log('  ' + iconColor(icon) + ' ' + palette.white(model) + suffix);
    }
  } else {
    console.log(statusLine('\u25CB' as any, palette.dim('Ollama not running or no models installed')));
  }

  console.log();

  // Pipeline JSON (when --json is a global flag)
  jsonOutput('version', {
    orion: ORION_VERSION,
    node: nodeVersion,
    npm: npmVersion,
    os: osInfo,
    arch: process.arch,
    cliPath,
    providers: providers.map(p => ({ name: p.name, configured: p.configured })),
    ollamaModels,
  });
}
