/**
 * Orion CLI - Command Alias Manager
 * Create, list, and remove shortcut aliases for Orion commands.
 * Aliases are stored in ~/.orion/aliases.json.
 *
 * Usage:
 *   orion alias set r "review"          # Create alias: orion r = orion review
 *   orion alias set fr "fix --auto"     # Create alias: orion fr = orion fix --auto
 *   orion alias list                    # List all aliases
 *   orion alias remove r                # Remove an alias
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  colors,
  ensureConfigDir,
  printSuccess,
  printError,
  printWarning,
  printInfo,
} from '../utils.js';
import { commandHeader, statusLine, divider, palette, table as uiTable } from '../ui.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const ALIASES_FILE = path.join(os.homedir(), '.orion', 'aliases.json');

// Built-in commands that cannot be overridden by aliases
const RESERVED_COMMANDS = [
  'chat', 'ask', 'edit', 'review', 'commit', 'explain', 'fix', 'run',
  'test', 'undo', 'status', 'init', 'gui', 'config', 'agent', 'session',
  'watch', 'search', 'diff', 'pr', 'compare', 'security', 'typecheck',
  'refactor', 'doctor', 'plan', 'generate', 'shell', 'todo', 'snippet',
  'fetch', 'changelog', 'migrate', 'deps', 'debug', 'benchmark', 'docs',
  'completions', 'tutorial', 'examples', 'hooks', 'alias', 'help', 'version',
];

// ─── Alias Storage ──────────────────────────────────────────────────────────

export interface AliasMap {
  [alias: string]: string;
}

export function loadAliases(): AliasMap {
  try {
    if (fs.existsSync(ALIASES_FILE)) {
      const raw = fs.readFileSync(ALIASES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as AliasMap;
      }
    }
  } catch {
    // Corrupted file, return empty
  }
  return {};
}

function saveAliases(aliases: AliasMap): void {
  ensureConfigDir();
  fs.writeFileSync(ALIASES_FILE, JSON.stringify(aliases, null, 2), 'utf-8');
}

// ─── Resolve Alias ──────────────────────────────────────────────────────────

/**
 * Given an unknown command name, check if it matches an alias.
 * Returns the expanded command string, or null if no alias matches.
 */
export function resolveAlias(command: string): string | null {
  const aliases = loadAliases();
  return aliases[command] ?? null;
}

// ─── Set Alias ──────────────────────────────────────────────────────────────

function setAlias(name: string, expansion: string): void {
  // Validate alias name
  if (!name || name.trim().length === 0) {
    printError('Alias name cannot be empty.');
    return;
  }

  if (/\s/.test(name)) {
    printError('Alias name cannot contain spaces.');
    return;
  }

  if (name.startsWith('-')) {
    printError('Alias name cannot start with a dash.');
    return;
  }

  // Check reserved commands
  if (RESERVED_COMMANDS.includes(name.toLowerCase())) {
    printError(`Cannot create alias ${colors.command(name)}: it conflicts with a built-in command.`);
    printInfo('Choose a different alias name.');
    return;
  }

  // Validate expansion is not empty
  if (!expansion || expansion.trim().length === 0) {
    printError('Alias expansion (command) cannot be empty.');
    return;
  }

  const aliases = loadAliases();
  const isUpdate = name in aliases;

  aliases[name] = expansion.trim();
  saveAliases(aliases);

  if (isUpdate) {
    printSuccess(
      `Updated alias: ${colors.command('orion ' + name)} => ${colors.command('orion ' + expansion)}`
    );
  } else {
    printSuccess(
      `Created alias: ${colors.command('orion ' + name)} => ${colors.command('orion ' + expansion)}`
    );
  }
}

// ─── Remove Alias ───────────────────────────────────────────────────────────

function removeAlias(name: string): void {
  const aliases = loadAliases();

  if (!(name in aliases)) {
    printError(`Alias ${colors.command(name)} does not exist.`);
    const keys = Object.keys(aliases);
    if (keys.length > 0) {
      printInfo(`Available aliases: ${keys.map((k) => colors.command(k)).join(', ')}`);
    }
    return;
  }

  const expansion = aliases[name];
  delete aliases[name];
  saveAliases(aliases);

  printSuccess(`Removed alias: ${colors.command(name)} (was: ${palette.dim(expansion)})`);
}

// ─── List Aliases ───────────────────────────────────────────────────────────

function listAliases(): void {
  console.log(commandHeader('Command Aliases', [['file', ALIASES_FILE]]));
  console.log();

  const aliases = loadAliases();
  const entries = Object.entries(aliases);

  if (entries.length === 0) {
    printInfo('No aliases defined.');
    console.log();
    printInfo(`Create one with: ${colors.command('orion alias set <name> "<command>"')}`);
    printInfo(`Example: ${colors.command('orion alias set r "review"')}`);
    console.log();
    return;
  }

  // Build table
  const headers = ['Alias', 'Expands To', 'Full Command'];
  const rows = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, expansion]) => [
      colors.command(name),
      palette.dim(expansion),
      palette.dim('orion ' + expansion),
    ]);

  console.log(uiTable(headers, rows));
  console.log();
  printInfo(`${entries.length} alias${entries.length > 1 ? 'es' : ''} defined.`);
  console.log(divider());
  console.log();
}

// ─── Main Export ────────────────────────────────────────────────────────────

export async function aliasCommand(
  action: string,
  name?: string,
  expansion?: string
): Promise<void> {
  switch (action) {
    case 'set': {
      if (!name) {
        printError('Missing alias name.');
        printInfo(`Usage: ${colors.command('orion alias set <name> "<command>"')}`);
        process.exit(1);
      }
      if (!expansion) {
        printError('Missing command to alias.');
        printInfo(`Usage: ${colors.command('orion alias set <name> "<command>"')}`);
        process.exit(1);
      }
      console.log(commandHeader('Set Alias'));
      console.log();
      setAlias(name, expansion);
      console.log();
      break;
    }

    case 'list':
      listAliases();
      break;

    case 'remove':
    case 'delete':
    case 'rm': {
      if (!name) {
        printError('Missing alias name to remove.');
        printInfo(`Usage: ${colors.command('orion alias remove <name>')}`);
        process.exit(1);
      }
      console.log(commandHeader('Remove Alias'));
      console.log();
      removeAlias(name);
      console.log();
      break;
    }

    default:
      printError(`Unknown action: ${colors.command(action)}`);
      printInfo('Usage: orion alias <set|list|remove> [name] [command]');
      console.log();
      process.exit(1);
  }
}
