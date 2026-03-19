/**
 * Orion CLI - Config Export/Import
 * Export full Orion config as a portable bundle for sharing team configurations.
 * Exports config, aliases, custom commands list, and active profile.
 * Does NOT export API keys for security.
 *
 * Usage:
 *   orion config-export                    # Export config to orion-config.json
 *   orion config-export --import file.json # Import config from file
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  colors,
  ensureConfigDir,
  readConfig,
  writeConfig,
  getConfigPath,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  type OrionConfig,
} from '../utils.js';
import {
  commandHeader,
  statusLine,
  divider,
  palette,
  keyValue,
} from '../ui.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const ORION_DIR = path.join(os.homedir(), '.orion');
const ALIASES_FILE = path.join(ORION_DIR, 'aliases.json');
const PROFILES_DIR = path.join(ORION_DIR, 'profiles');
const ACTIVE_PROFILE_FILE = path.join(ORION_DIR, 'active-profile');
const DEFAULT_EXPORT_FILE = 'orion-config.json';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ConfigBundle {
  version: string;
  exportedAt: string;
  config: Partial<OrionConfig>;
  aliases: Record<string, string>;
  customCommands: string[];
  activeProfile: string | null;
  profiles: string[];
}

// ─── Sensitive Key Filter ───────────────────────────────────────────────────

const SENSITIVE_KEYS: (keyof OrionConfig)[] = [
  'anthropicApiKey',
  'openaiApiKey',
];

/**
 * Strip API keys and other sensitive fields from config.
 */
function sanitizeConfig(config: OrionConfig): Partial<OrionConfig> {
  const sanitized: Partial<OrionConfig> = { ...config };
  for (const key of SENSITIVE_KEYS) {
    if (key in sanitized) {
      delete (sanitized as any)[key];
    }
  }
  return sanitized;
}

// ─── Load Helpers ───────────────────────────────────────────────────────────

function loadAliases(): Record<string, string> {
  try {
    if (fs.existsSync(ALIASES_FILE)) {
      const raw = fs.readFileSync(ALIASES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Corrupted file
  }
  return {};
}

function loadActiveProfile(): string | null {
  try {
    if (fs.existsSync(ACTIVE_PROFILE_FILE)) {
      return fs.readFileSync(ACTIVE_PROFILE_FILE, 'utf-8').trim() || null;
    }
  } catch {
    // Ignore
  }
  return null;
}

function listProfiles(): string[] {
  try {
    if (fs.existsSync(PROFILES_DIR)) {
      return fs.readdirSync(PROFILES_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));
    }
  } catch {
    // Ignore
  }
  return [];
}

function listCustomCommands(): string[] {
  // Custom commands are stored as plugins; list installed plugin names
  const pluginsDir = path.join(ORION_DIR, 'plugins');
  try {
    if (fs.existsSync(pluginsDir)) {
      return fs.readdirSync(pluginsDir)
        .filter((f) => f.endsWith('.js') || f.endsWith('.ts'))
        .map((f) => f.replace(/\.(js|ts)$/, ''));
    }
  } catch {
    // Ignore
  }
  return [];
}

// ─── Export Config ──────────────────────────────────────────────────────────

function exportConfig(outputFile: string): void {
  console.log(commandHeader('Export Config', [['output', outputFile]]));
  console.log();

  const config = readConfig();
  const sanitized = sanitizeConfig(config);
  const aliases = loadAliases();
  const activeProfile = loadActiveProfile();
  const profiles = listProfiles();
  const customCommands = listCustomCommands();

  const bundle: ConfigBundle = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    config: sanitized,
    aliases,
    customCommands,
    activeProfile,
    profiles,
  };

  // Write export file
  const outputPath = path.resolve(outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(bundle, null, 2), 'utf-8');

  // Summary
  const aliasCount = Object.keys(aliases).length;
  const profileCount = profiles.length;
  const commandCount = customCommands.length;

  console.log(keyValue([
    ['Config', colors.file(getConfigPath())],
    ['Provider', sanitized.provider || 'auto'],
    ['Model', sanitized.model || 'default'],
    ['Aliases', `${aliasCount} alias${aliasCount !== 1 ? 'es' : ''}`],
    ['Profiles', `${profileCount} profile${profileCount !== 1 ? 's' : ''}`],
    ['Custom Commands', `${commandCount} command${commandCount !== 1 ? 's' : ''}`],
    ['Active Profile', activeProfile || palette.dim('none')],
  ]));
  console.log();

  // Security notice
  console.log(statusLine('\u2713', 'API keys were NOT included (security).'));
  printSuccess(`Exported config to ${colors.file(outputPath)}`);
  console.log();
  printInfo('Share this file with your team to sync Orion settings.');
  console.log(divider());
  console.log();
}

// ─── Import Config ──────────────────────────────────────────────────────────

function importConfig(inputFile: string): void {
  console.log(commandHeader('Import Config', [['source', inputFile]]));
  console.log();

  const inputPath = path.resolve(inputFile);

  // Validate file exists
  if (!fs.existsSync(inputPath)) {
    printError(`File not found: ${colors.file(inputPath)}`);
    console.log();
    return;
  }

  // Parse bundle
  let bundle: ConfigBundle;
  try {
    const raw = fs.readFileSync(inputPath, 'utf-8');
    bundle = JSON.parse(raw);
  } catch (err) {
    printError('Failed to parse config file. Ensure it is valid JSON.');
    console.log();
    return;
  }

  // Validate structure
  if (!bundle.version || !bundle.config) {
    printError('Invalid config bundle. Missing required fields (version, config).');
    console.log();
    return;
  }

  // Ensure no API keys snuck in from external source
  if (bundle.config) {
    for (const key of SENSITIVE_KEYS) {
      if (key in bundle.config) {
        printWarning(`Ignoring sensitive key "${key}" from imported config.`);
        delete (bundle.config as any)[key];
      }
    }
  }

  ensureConfigDir();

  // Merge config (preserve existing API keys)
  const existing = readConfig();
  const merged: OrionConfig = {
    ...existing,
    ...bundle.config,
    // Preserve API keys from current config
    anthropicApiKey: existing.anthropicApiKey,
    openaiApiKey: existing.openaiApiKey,
  };
  writeConfig(merged);

  // Import aliases (merge, don't overwrite)
  if (bundle.aliases && typeof bundle.aliases === 'object') {
    const existingAliases = loadAliases();
    const mergedAliases = { ...existingAliases, ...bundle.aliases };
    fs.writeFileSync(ALIASES_FILE, JSON.stringify(mergedAliases, null, 2), 'utf-8');
  }

  // Set active profile if specified
  if (bundle.activeProfile) {
    fs.writeFileSync(ACTIVE_PROFILE_FILE, bundle.activeProfile, 'utf-8');
  }

  // Summary
  const aliasCount = bundle.aliases ? Object.keys(bundle.aliases).length : 0;

  console.log(keyValue([
    ['Source', colors.file(inputPath)],
    ['Bundle Version', bundle.version],
    ['Exported At', bundle.exportedAt || palette.dim('unknown')],
    ['Provider', bundle.config.provider || palette.dim('unchanged')],
    ['Model', bundle.config.model || palette.dim('unchanged')],
    ['Aliases Imported', `${aliasCount}`],
    ['Active Profile', bundle.activeProfile || palette.dim('none')],
  ]));
  console.log();

  console.log(statusLine('\u2713', 'Existing API keys were preserved.'));
  printSuccess('Config imported successfully.');
  console.log();
  printInfo(`Run ${colors.command('orion config')} to verify settings.`);
  console.log(divider());
  console.log();
}

// ─── Main Export ────────────────────────────────────────────────────────────

export async function configExportCommand(options: {
  import?: string;
}): Promise<void> {
  if (options.import) {
    importConfig(options.import);
    return;
  }

  exportConfig(DEFAULT_EXPORT_FILE);
}
