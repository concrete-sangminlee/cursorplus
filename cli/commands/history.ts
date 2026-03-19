/**
 * Orion CLI - Global Command History
 * Track every orion command run in ~/.orion/command-history.json.
 * Show, search, and clear command history.
 *
 * Usage:
 *   orion history                          # Show recent command history
 *   orion history --clear                  # Clear all history
 *   orion history --search "review"        # Search history by keyword
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
import {
  commandHeader,
  statusLine,
  divider,
  palette,
  table as uiTable,
  timeAgo,
} from '../ui.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const HISTORY_FILE = path.join(os.homedir(), '.orion', 'command-history.json');
const MAX_ENTRIES = 1000;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  timestamp: string;
  command: string;
  args: string[];
  exitCode: number;
}

// ─── History Storage ────────────────────────────────────────────────────────

export function loadHistory(): HistoryEntry[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as HistoryEntry[];
      }
    }
  } catch {
    // Corrupted file, return empty
  }
  return [];
}

function saveHistory(entries: HistoryEntry[]): void {
  ensureConfigDir();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

// ─── Record Command ─────────────────────────────────────────────────────────

/**
 * Record a command execution in history.
 * Called externally after each orion command completes.
 * Auto-prunes to keep max MAX_ENTRIES.
 */
export function recordCommand(command: string, args: string[], exitCode: number): void {
  try {
    const entries = loadHistory();

    const entry: HistoryEntry = {
      timestamp: new Date().toISOString(),
      command,
      args,
      exitCode,
    };

    entries.push(entry);

    // Auto-prune: keep only the most recent MAX_ENTRIES
    const pruned = entries.length > MAX_ENTRIES
      ? entries.slice(entries.length - MAX_ENTRIES)
      : entries;

    saveHistory(pruned);
  } catch {
    // Never let history tracking break the CLI
  }
}

// ─── Show History ───────────────────────────────────────────────────────────

function showHistory(entries: HistoryEntry[]): void {
  console.log(commandHeader('Command History', [['file', HISTORY_FILE]]));
  console.log();

  if (entries.length === 0) {
    printInfo('No command history found.');
    console.log();
    printInfo('History is recorded automatically as you use Orion commands.');
    console.log();
    return;
  }

  // Show most recent 50 entries (or all if fewer)
  const display = entries.slice(-50);
  const headers = ['Time', 'Command', 'Args', 'Exit'];
  const rows = display.map((entry) => {
    const date = new Date(entry.timestamp);
    const ago = timeAgo(date);
    const exitBadge = entry.exitCode === 0
      ? palette.green('0')
      : palette.red(String(entry.exitCode));
    const argsStr = entry.args.length > 0
      ? palette.dim(entry.args.join(' ').substring(0, 40))
      : palette.dim('-');

    return [ago, colors.command(entry.command), argsStr, exitBadge];
  });

  console.log(uiTable(headers, rows));
  console.log();
  printInfo(`Showing ${display.length} of ${entries.length} total entries.`);

  // Summary statistics
  const successCount = entries.filter((e) => e.exitCode === 0).length;
  const failCount = entries.length - successCount;
  const commandCounts: Record<string, number> = {};
  for (const entry of entries) {
    commandCounts[entry.command] = (commandCounts[entry.command] || 0) + 1;
  }
  const topCommands = Object.entries(commandCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([cmd, count]) => `${colors.command(cmd)} (${count})`)
    .join(palette.dim(' · '));

  console.log();
  console.log(statusLine('check', `Success: ${palette.green(String(successCount))}  Failed: ${palette.red(String(failCount))}`));
  if (topCommands) {
    console.log(statusLine('info', `Top commands: ${topCommands}`));
  }
  console.log(divider());
  console.log();
}

// ─── Search History ─────────────────────────────────────────────────────────

function searchHistory(entries: HistoryEntry[], keyword: string): void {
  console.log(commandHeader('Search History', [['keyword', keyword]]));
  console.log();

  const lower = keyword.toLowerCase();
  const matches = entries.filter((e) =>
    e.command.toLowerCase().includes(lower) ||
    e.args.some((a) => a.toLowerCase().includes(lower))
  );

  if (matches.length === 0) {
    printInfo(`No history entries matching "${keyword}".`);
    console.log();
    return;
  }

  const display = matches.slice(-50);
  const headers = ['Time', 'Command', 'Args', 'Exit'];
  const rows = display.map((entry) => {
    const date = new Date(entry.timestamp);
    const ago = timeAgo(date);
    const exitBadge = entry.exitCode === 0
      ? palette.green('0')
      : palette.red(String(entry.exitCode));
    const argsStr = entry.args.length > 0
      ? palette.dim(entry.args.join(' ').substring(0, 40))
      : palette.dim('-');

    return [ago, colors.command(entry.command), argsStr, exitBadge];
  });

  console.log(uiTable(headers, rows));
  console.log();
  printInfo(`Found ${matches.length} matching entries.`);
  console.log(divider());
  console.log();
}

// ─── Clear History ──────────────────────────────────────────────────────────

function clearHistory(): void {
  console.log(commandHeader('Clear History'));
  console.log();

  const entries = loadHistory();
  if (entries.length === 0) {
    printInfo('History is already empty.');
    console.log();
    return;
  }

  const count = entries.length;
  saveHistory([]);
  printSuccess(`Cleared ${count} history entries.`);
  console.log();
}

// ─── Main Export ────────────────────────────────────────────────────────────

export async function historyCommand(options: {
  clear?: boolean;
  search?: string;
}): Promise<void> {
  if (options.clear) {
    clearHistory();
    return;
  }

  const entries = loadHistory();

  if (options.search) {
    searchHistory(entries, options.search);
    return;
  }

  showHistory(entries);
}
