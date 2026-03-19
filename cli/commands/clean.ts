/**
 * Orion CLI - Clean Command
 * Remove Orion data: backups, chat history, checkpoints.
 * Shows disk usage per category and confirms before deleting.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import inquirer from 'inquirer';
import {
  colors,
  printSuccess,
  printWarning,
  printInfo,
} from '../utils.js';
import { commandHeader, divider, keyValue, statusLine, palette } from '../ui.js';
import { getPipelineOptions, jsonOutput } from '../pipeline.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DataCategory {
  name: string;
  label: string;
  path: string;
  size: number;
  fileCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getDirStats(dirPath: string): { size: number; fileCount: number } {
  if (!fs.existsSync(dirPath)) {
    return { size: 0, fileCount: 0 };
  }

  let totalSize = 0;
  let fileCount = 0;

  function walk(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        try {
          if (entry.isDirectory()) {
            walk(fullPath);
          } else {
            const stat = fs.statSync(fullPath);
            totalSize += stat.size;
            fileCount++;
          }
        } catch { /* skip inaccessible files */ }
      }
    } catch { /* skip inaccessible directories */ }
  }

  walk(dirPath);
  return { size: totalSize, fileCount };
}

function removeDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function getDataCategories(): DataCategory[] {
  const orionHome = path.join(os.homedir(), '.orion');
  const orionProject = path.join(process.cwd(), '.orion');

  const categories: DataCategory[] = [
    {
      name: 'backups',
      label: 'Backups',
      path: path.join(orionProject, 'backups'),
      ...getDirStats(path.join(orionProject, 'backups')),
    },
    {
      name: 'history',
      label: 'Chat History',
      path: path.join(orionHome, 'sessions'),
      ...getDirStats(path.join(orionHome, 'sessions')),
    },
    {
      name: 'checkpoints',
      label: 'Checkpoints',
      path: path.join(orionProject, 'checkpoints'),
      ...getDirStats(path.join(orionProject, 'checkpoints')),
    },
  ];

  return categories;
}

function printCategory(cat: DataCategory): void {
  const sizeStr = cat.size > 0
    ? palette.yellow(formatSize(cat.size))
    : palette.dim('empty');
  const countStr = cat.fileCount > 0
    ? palette.dim(` (${cat.fileCount} files)`)
    : '';
  const exists = fs.existsSync(cat.path);
  const icon = exists && cat.fileCount > 0 ? '\u25CF' : '\u25CB';
  const iconColor = exists && cat.fileCount > 0 ? palette.yellow : palette.dim;

  console.log(
    '  ' + iconColor(icon) + ' ' +
    palette.white(cat.label.padEnd(16)) +
    sizeStr + countStr
  );
  console.log('  ' + ' '.repeat(2) + palette.dim(cat.path));
}

// ─── Main Clean Command ──────────────────────────────────────────────────────

export async function cleanCommand(options: {
  backups?: boolean;
  history?: boolean;
  checkpoints?: boolean;
  all?: boolean;
  dryRun?: boolean;
}): Promise<void> {
  const pipeOpts = getPipelineOptions();
  const dryRun = options.dryRun || pipeOpts.dryRun;
  const autoYes = pipeOpts.yes;

  console.log(commandHeader('Orion Clean'));
  console.log();

  // ── Gather data category stats ──────────────────────────────────────────

  const categories = getDataCategories();

  console.log(divider('Data Usage'));
  console.log();

  for (const cat of categories) {
    printCategory(cat);
    console.log();
  }

  const totalSize = categories.reduce((sum, c) => sum + c.size, 0);
  const totalFiles = categories.reduce((sum, c) => sum + c.fileCount, 0);

  console.log(divider());
  console.log();
  console.log(
    '  ' + palette.violet('Total') + '  ' +
    palette.white(formatSize(totalSize)) +
    palette.dim(` across ${totalFiles} files`)
  );
  console.log();

  // ── Determine what to clean ─────────────────────────────────────────────

  let toClean: DataCategory[] = [];

  if (options.all) {
    toClean = categories.filter(c => c.fileCount > 0);
  } else if (options.backups || options.history || options.checkpoints) {
    if (options.backups) {
      const cat = categories.find(c => c.name === 'backups');
      if (cat && cat.fileCount > 0) toClean.push(cat);
    }
    if (options.history) {
      const cat = categories.find(c => c.name === 'history');
      if (cat && cat.fileCount > 0) toClean.push(cat);
    }
    if (options.checkpoints) {
      const cat = categories.find(c => c.name === 'checkpoints');
      if (cat && cat.fileCount > 0) toClean.push(cat);
    }
  } else {
    // Interactive mode: let user choose
    const nonEmpty = categories.filter(c => c.fileCount > 0);

    if (nonEmpty.length === 0) {
      printInfo('Nothing to clean. All data directories are empty.');
      console.log();

      jsonOutput('clean', { cleaned: [], freedBytes: 0 });
      return;
    }

    const choices = nonEmpty.map(cat => ({
      name: `${cat.label} (${formatSize(cat.size)}, ${cat.fileCount} files)`,
      value: cat.name,
      checked: false,
    }));

    const { selected } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selected',
      message: 'Select data to remove:',
      choices,
    }]);

    toClean = categories.filter(c => (selected as string[]).includes(c.name));
  }

  if (toClean.length === 0) {
    printInfo('Nothing selected for cleanup.');
    console.log();

    jsonOutput('clean', { cleaned: [], freedBytes: 0 });
    return;
  }

  // ── Preview ─────────────────────────────────────────────────────────────

  const freedSize = toClean.reduce((sum, c) => sum + c.size, 0);
  const freedFiles = toClean.reduce((sum, c) => sum + c.fileCount, 0);

  console.log(divider('Will Remove'));
  console.log();

  for (const cat of toClean) {
    console.log(statusLine(
      '\u2717' as any,
      `${cat.label}: ${palette.yellow(formatSize(cat.size))} ${palette.dim(`(${cat.fileCount} files)`)}`
    ));
  }

  console.log();
  console.log(
    '  ' + palette.violet('Space to free') + '  ' +
    palette.green(formatSize(freedSize)) +
    palette.dim(` (${freedFiles} files)`)
  );
  console.log();

  // ── Dry run stops here ──────────────────────────────────────────────────

  if (dryRun) {
    printWarning('Dry run: no files were removed.');
    console.log();

    jsonOutput('clean', {
      dryRun: true,
      wouldClean: toClean.map(c => ({ name: c.name, size: c.size, fileCount: c.fileCount })),
      wouldFreeBytes: freedSize,
    });
    return;
  }

  // ── Confirm ─────────────────────────────────────────────────────────────

  if (!autoYes) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Remove ${freedFiles} files (${formatSize(freedSize)})?`,
      default: false,
    }]);

    if (!confirm) {
      printInfo('Cleanup cancelled.');
      console.log();
      return;
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  const cleaned: string[] = [];

  for (const cat of toClean) {
    try {
      removeDir(cat.path);
      printSuccess(`Removed ${cat.label}: ${formatSize(cat.size)} freed`);
      cleaned.push(cat.name);
    } catch (err: any) {
      printWarning(`Failed to remove ${cat.label}: ${err.message}`);
    }
  }

  console.log();
  console.log(
    '  ' + palette.green('\u2713') + ' ' +
    palette.white(`Freed ${formatSize(freedSize)} of disk space.`)
  );
  console.log();

  // ── Pipeline JSON output ────────────────────────────────────────────────

  jsonOutput('clean', {
    cleaned,
    freedBytes: freedSize,
    freedFormatted: formatSize(freedSize),
  });
}
