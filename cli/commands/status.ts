/**
 * Orion CLI - Status Command
 * Shows comprehensive Orion environment status: provider, models,
 * sessions, backups, config, and project context.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  colors,
  readConfig,
  getConfigPath,
  printInfo,
} from '../utils.js';
import {
  getAvailableProviders,
  listOllamaModels,
} from '../ai-client.js';
import { getBackupStats } from '../backup.js';
import { commandHeader, keyValue, divider, statusLine, palette, providerStatusList } from '../ui.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countSessions(): number {
  const sessionsDir = path.join(os.homedir(), '.orion', 'sessions');
  if (!fs.existsSync(sessionsDir)) return 0;
  try {
    return fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

// ─── Main Status Command ────────────────────────────────────────────────────

export async function statusCommand(): Promise<void> {
  console.log(commandHeader('Orion Status'));

  const config = readConfig();

  // ── Current Provider & Model ──────────────────────────────────────────────

  console.log();
  console.log(divider('AI Provider'));
  console.log();
  console.log(keyValue([
    ['Provider', config.provider || 'auto'],
    ['Model', config.model || 'default'],
    ['Max Tokens', String(config.maxTokens || 4096)],
    ['Temperature', String(config.temperature || 0.7)],
  ]));
  console.log();

  // ── Available Providers ───────────────────────────────────────────────────

  console.log(divider('Available Providers'));
  console.log();

  try {
    const providers = await getAvailableProviders();
    const providerList = providers.map(p => ({
      name: p.provider.charAt(0).toUpperCase() + p.provider.slice(1),
      provider: p.provider,
      model: p.model,
      available: p.available,
      active: p.provider === config.provider,
      reason: p.reason,
    }));

    console.log(providerStatusList(providerList));
  } catch {
    console.log(statusLine('\u2717' as any, palette.dim('Could not check provider availability')));
  }
  console.log();

  // ── Installed Ollama Models ───────────────────────────────────────────────

  console.log(divider('Ollama Models'));
  console.log();

  try {
    const ollamaHost = config.ollamaHost || 'http://localhost:11434';
    const models = await listOllamaModels(ollamaHost);

    if (models.length > 0) {
      for (const model of models) {
        const isActive = model === config.model;
        const icon = isActive ? '\u25CF' : '\u25CB';
        const iconColor = isActive ? palette.green : palette.dim;
        const suffix = isActive ? palette.yellow(' \u25C0 active') : '';
        console.log('  ' + iconColor(icon) + ' ' + palette.white(model) + suffix);
      }
    } else {
      console.log(statusLine('\u25CB' as any, palette.dim('No Ollama models installed or Ollama not running')));
      printInfo(`Install a model: ${colors.command('ollama pull llama3.2')}`);
    }
  } catch {
    console.log(statusLine('\u25CB' as any, palette.dim('Ollama not reachable')));
  }
  console.log();

  // ── Sessions ──────────────────────────────────────────────────────────────

  console.log(divider('Sessions & Backups'));
  console.log();

  const sessionCount = countSessions();
  const backupStats = getBackupStats();

  console.log(keyValue([
    ['Active Sessions', sessionCount > 0 ? palette.green(String(sessionCount)) : palette.dim('0')],
    ['Backups', backupStats.count > 0
      ? `${palette.green(String(backupStats.count))} (${formatSize(backupStats.totalSize)})`
      : palette.dim('0')],
  ]));
  console.log();

  // ── Config & Context ──────────────────────────────────────────────────────

  console.log(divider('Configuration'));
  console.log();

  const configPath = getConfigPath();
  const configExists = fs.existsSync(configPath);
  const projectContextPath = path.join(process.cwd(), '.orion', 'context.md');
  const projectContextExists = fs.existsSync(projectContextPath);
  const globalContextPath = path.join(os.homedir(), '.orion', 'global-context.md');
  const globalContextExists = fs.existsSync(globalContextPath);

  console.log(statusLine(
    configExists ? '\u2713' as any : '\u2717' as any,
    `Config file: ${configExists ? colors.file(configPath) : palette.dim('not found')}`
  ));
  console.log(statusLine(
    projectContextExists ? '\u2713' as any : '\u25CB' as any,
    `Project context: ${projectContextExists ? colors.file(projectContextPath) : palette.dim('not found (run orion init)')}`
  ));
  console.log(statusLine(
    globalContextExists ? '\u2713' as any : '\u25CB' as any,
    `Global context: ${globalContextExists ? colors.file(globalContextPath) : palette.dim('not set')}`
  ));
  console.log();
}
