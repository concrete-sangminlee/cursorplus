/**
 * Orion CLI - Undo Command
 * Restore files from automatic backups created before edits.
 *
 * Usage:
 *   orion undo                  # Undo last file change (restore from backup)
 *   orion undo --list           # List available backups
 *   orion undo --file app.ts    # Undo specific file
 *   orion undo --clean          # Remove old backups
 */

import * as path from 'path';
import inquirer from 'inquirer';
import {
  colors,
  printInfo,
  printSuccess,
  printWarning,
  printError,
} from '../utils.js';
import {
  listBackups,
  getMostRecentBackup,
  restoreBackup,
  cleanOldBackups,
} from '../backup.js';
import { getPipelineOptions } from '../pipeline.js';
import { commandHeader, table as uiTable, divider, palette } from '../ui.js';

// ─── Format Helpers ──────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date): string {
  if (date.getTime() === 0) return '(unknown)';
  return date.toLocaleString();
}

// ─── List Backups ────────────────────────────────────────────────────────────

async function showBackupList(filePath?: string): Promise<void> {
  const entries = listBackups(filePath);

  if (entries.length === 0) {
    console.log();
    printInfo('No backups found.');
    printInfo('Backups are created automatically when you use `orion edit` or `orion fix`.');
    console.log();
    return;
  }

  console.log();
  console.log(uiTable(
    ['#', 'Original File', 'Date', 'Size'],
    entries.map((e, i) => [
      palette.dim(String(i + 1)),
      palette.blue(path.basename(e.original)),
      palette.dim(formatDate(e.date)),
      palette.dim(formatSize(e.size)),
    ])
  ));
  console.log();
  printInfo(`${entries.length} backup(s) found`);
  printInfo(`Restore with: ${colors.command('orion undo')} or ${colors.command('orion undo --file <name>')}`);
  console.log();
}

// ─── Undo (Restore) ─────────────────────────────────────────────────────────

async function performUndo(filePath?: string): Promise<void> {
  const backup = getMostRecentBackup(filePath);

  if (!backup) {
    console.log();
    if (filePath) {
      printError(`No backups found for: ${filePath}`);
    } else {
      printError('No backups available to undo.');
    }
    printInfo('Backups are created automatically when you use `orion edit` or `orion fix`.');
    printInfo(`Run ${colors.command('orion undo --list')} to see available backups.`);
    console.log();
    return;
  }

  const originalName = path.basename(backup.original);

  console.log();
  console.log(divider('Undo Preview'));
  console.log();
  printInfo(`File:    ${colors.file(backup.original)}`);
  printInfo(`Backup:  ${palette.dim(formatDate(backup.date))}`);
  printInfo(`Size:    ${palette.dim(formatSize(backup.size))}`);
  console.log();

  const pipelineOpts = getPipelineOptions();

  let confirm = true;
  if (!pipelineOpts.yes) {
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Restore "${originalName}" from backup (${formatDate(backup.date)})?`,
        default: true,
      },
    ]);
    confirm = answer.confirm;
  }

  if (confirm) {
    try {
      restoreBackup(backup.path, backup.original);
      printSuccess(`Restored: ${colors.file(backup.original)}`);
      printInfo(`From backup: ${palette.dim(backup.path)}`);
    } catch (err: any) {
      printError(`Failed to restore: ${err.message}`);
    }
  } else {
    printInfo('Undo cancelled.');
  }
  console.log();
}

// ─── Clean Old Backups ───────────────────────────────────────────────────────

async function performClean(): Promise<void> {
  const pipelineOpts = getPipelineOptions();

  let confirm = true;
  if (!pipelineOpts.yes) {
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Remove backups older than 7 days?',
        default: true,
      },
    ]);
    confirm = answer.confirm;
  }

  if (confirm) {
    const removed = cleanOldBackups(7);
    if (removed > 0) {
      printSuccess(`Removed ${removed} old backup(s).`);
    } else {
      printInfo('No old backups to remove.');
    }
  } else {
    printInfo('Clean cancelled.');
  }
  console.log();
}

// ─── Main Command ────────────────────────────────────────────────────────────

export async function undoCommand(options: {
  list?: boolean;
  file?: string;
  clean?: boolean;
}): Promise<void> {
  console.log(commandHeader('Orion Undo'));

  if (options.list) {
    await showBackupList(options.file);
    return;
  }

  if (options.clean) {
    await performClean();
    return;
  }

  await performUndo(options.file);
}
