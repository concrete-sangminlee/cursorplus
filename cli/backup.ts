/**
 * Orion CLI - Automatic Backup System
 * Creates backups before file modifications, supports restore and cleanup.
 * Backups are stored in .orion/backups/ relative to the project root.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Backup Directory ────────────────────────────────────────────────────────

function getBackupsDir(): string {
  const dir = path.join(process.cwd(), '.orion', 'backups');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ─── Create Backup ───────────────────────────────────────────────────────────

/**
 * Creates a backup of the given file before modifications.
 * Backup is stored at .orion/backups/<filename>.<timestamp>.bak
 * Returns the backup file path.
 */
export function createBackup(filePath: string): string {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Cannot backup: file not found: ${resolvedPath}`);
  }

  const backupsDir = getBackupsDir();
  const fileName = path.basename(resolvedPath);
  const timestamp = Date.now();
  const backupName = `${fileName}.${timestamp}.bak`;
  const backupPath = path.join(backupsDir, backupName);

  // Store a metadata sidecar so we can map backup -> original path
  const metaPath = backupPath + '.meta';
  const content = fs.readFileSync(resolvedPath);

  fs.writeFileSync(backupPath, content);
  fs.writeFileSync(metaPath, JSON.stringify({
    originalPath: resolvedPath,
    fileName,
    timestamp,
    createdAt: new Date(timestamp).toISOString(),
    size: content.length,
  }), 'utf-8');

  return backupPath;
}

// ─── Restore Backup ─────────────────────────────────────────────────────────

/**
 * Restores a file from its backup.
 * @param backupPath - Path to the .bak backup file
 * @param originalPath - Path to restore the file to
 */
export function restoreBackup(backupPath: string, originalPath: string): void {
  const resolvedBackup = path.resolve(backupPath);

  if (!fs.existsSync(resolvedBackup)) {
    throw new Error(`Backup not found: ${resolvedBackup}`);
  }

  const resolvedOriginal = path.resolve(originalPath);
  const dir = path.dirname(resolvedOriginal);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = fs.readFileSync(resolvedBackup);
  fs.writeFileSync(resolvedOriginal, content);
}

// ─── List Backups ────────────────────────────────────────────────────────────

export interface BackupEntry {
  path: string;
  original: string;
  date: Date;
  size: number;
}

/**
 * Lists all available backups, optionally filtered by original file path.
 */
export function listBackups(filePath?: string): BackupEntry[] {
  const backupsDir = path.join(process.cwd(), '.orion', 'backups');

  if (!fs.existsSync(backupsDir)) {
    return [];
  }

  const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.bak'));
  const entries: BackupEntry[] = [];

  for (const file of files) {
    const bakPath = path.join(backupsDir, file);
    const metaPath = bakPath + '.meta';

    let original = '(unknown)';
    let date = new Date(0);
    let size = 0;

    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        original = meta.originalPath || original;
        date = new Date(meta.timestamp || 0);
        size = meta.size || 0;
      } catch { /* skip corrupt meta */ }
    } else {
      // Fallback: parse timestamp from filename  <name>.<timestamp>.bak
      const match = file.match(/\.(\d+)\.bak$/);
      if (match) {
        date = new Date(parseInt(match[1], 10));
      }
      try {
        const stat = fs.statSync(bakPath);
        size = stat.size;
      } catch { /* ignore */ }
    }

    // Filter by original file if specified
    if (filePath) {
      const resolvedFilter = path.resolve(filePath);
      if (original !== resolvedFilter) {
        continue;
      }
    }

    entries.push({ path: bakPath, original, date, size });
  }

  // Sort newest first
  entries.sort((a, b) => b.date.getTime() - a.date.getTime());

  return entries;
}

// ─── Get Most Recent Backup ──────────────────────────────────────────────────

/**
 * Returns the most recent backup entry, optionally filtered by file.
 */
export function getMostRecentBackup(filePath?: string): BackupEntry | null {
  const entries = listBackups(filePath);
  return entries.length > 0 ? entries[0] : null;
}

// ─── Clean Old Backups ───────────────────────────────────────────────────────

/**
 * Remove backups older than the specified number of days.
 * Default: 7 days.
 * Returns the count of removed backups.
 */
export function cleanOldBackups(maxAgeDays?: number): number {
  const days = maxAgeDays ?? 7;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const backupsDir = path.join(process.cwd(), '.orion', 'backups');

  if (!fs.existsSync(backupsDir)) {
    return 0;
  }

  const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.bak'));
  let removed = 0;

  for (const file of files) {
    const bakPath = path.join(backupsDir, file);
    const metaPath = bakPath + '.meta';

    let timestamp = 0;

    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        timestamp = meta.timestamp || 0;
      } catch { /* ignore */ }
    }

    // Fallback: parse from filename
    if (!timestamp) {
      const match = file.match(/\.(\d+)\.bak$/);
      if (match) {
        timestamp = parseInt(match[1], 10);
      }
    }

    if (timestamp && timestamp < cutoff) {
      try {
        fs.unlinkSync(bakPath);
        if (fs.existsSync(metaPath)) {
          fs.unlinkSync(metaPath);
        }
        removed++;
      } catch { /* skip files that can't be removed */ }
    }
  }

  return removed;
}

// ─── Backup Stats ────────────────────────────────────────────────────────────

/**
 * Returns total count and size of all backups.
 */
export function getBackupStats(): { count: number; totalSize: number } {
  const backupsDir = path.join(process.cwd(), '.orion', 'backups');

  if (!fs.existsSync(backupsDir)) {
    return { count: 0, totalSize: 0 };
  }

  const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.bak'));
  let totalSize = 0;

  for (const file of files) {
    try {
      const stat = fs.statSync(path.join(backupsDir, file));
      totalSize += stat.size;
    } catch { /* ignore */ }
  }

  return { count: files.length, totalSize };
}
