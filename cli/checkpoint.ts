/**
 * Orion CLI - Workspace Checkpoints
 * Saves the entire workspace state before multi-file operations
 * so they can be atomically rolled back. Inspired by Cline's checkpoints.
 *
 * Checkpoints are stored in .orion/checkpoints/<id>.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CheckpointFile {
  path: string;
  content: string;
  existed: boolean;
}

export interface Checkpoint {
  id: string;
  timestamp: Date;
  description: string;
  files: CheckpointFile[];
}

/** Serializable form stored on disk */
interface CheckpointRecord {
  id: string;
  timestamp: string;
  description: string;
  files: CheckpointFile[];
}

// ── Directory Helpers ────────────────────────────────────────────────────────

function getCheckpointsDir(): string {
  const dir = path.join(process.cwd(), '.orion', 'checkpoints');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function checkpointPath(id: string): string {
  return path.join(getCheckpointsDir(), `${id}.json`);
}

// ── Create Checkpoint ────────────────────────────────────────────────────────

/**
 * Save the current state of the given files so they can be restored later.
 * Files that do not exist yet are recorded with `existed: false` so that
 * restoring the checkpoint can delete them (they were created by the operation).
 *
 * @returns The checkpoint ID.
 */
export function createCheckpoint(description: string, filePaths: string[]): string {
  const id = crypto.randomBytes(6).toString('hex') + '-' + Date.now().toString(36);

  const files: CheckpointFile[] = [];

  for (const raw of filePaths) {
    const resolved = path.resolve(raw);

    if (fs.existsSync(resolved)) {
      try {
        const stat = fs.statSync(resolved);
        // Skip directories and very large files (> 5 MB)
        if (stat.isDirectory()) continue;
        if (stat.size > 5 * 1024 * 1024) continue;

        const content = fs.readFileSync(resolved, 'utf-8');
        files.push({ path: resolved, content, existed: true });
      } catch {
        // Skip unreadable files (binary, permission errors, etc.)
      }
    } else {
      // File does not exist yet; record so we can delete it on restore
      files.push({ path: resolved, content: '', existed: false });
    }
  }

  const record: CheckpointRecord = {
    id,
    timestamp: new Date().toISOString(),
    description,
    files,
  };

  const dir = getCheckpointsDir();
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(record, null, 2), 'utf-8');

  return id;
}

// ── Restore Checkpoint ───────────────────────────────────────────────────────

/**
 * Atomically restore every file captured in the checkpoint.
 *  - Files that existed before the operation are written back with their
 *    original content.
 *  - Files that did NOT exist before the operation are deleted (they were
 *    created by the operation that we are rolling back).
 */
export function restoreCheckpoint(id: string): void {
  const filePath = checkpointPath(id);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Checkpoint not found: ${id}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const record: CheckpointRecord = JSON.parse(raw);

  for (const file of record.files) {
    if (file.existed) {
      // Restore original content
      const dir = path.dirname(file.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(file.path, file.content, 'utf-8');
    } else {
      // File was created by the operation -- remove it
      if (fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // Best effort: skip if it cannot be removed
        }
      }
    }
  }
}

// ── List Checkpoints ─────────────────────────────────────────────────────────

/**
 * Return all checkpoints sorted newest-first.
 */
export function listCheckpoints(): Checkpoint[] {
  const dir = path.join(process.cwd(), '.orion', 'checkpoints');

  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const checkpoints: Checkpoint[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
      const record: CheckpointRecord = JSON.parse(raw);
      checkpoints.push({
        id: record.id,
        timestamp: new Date(record.timestamp),
        description: record.description,
        files: record.files,
      });
    } catch {
      // Skip corrupt checkpoint files
    }
  }

  // Newest first
  checkpoints.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return checkpoints;
}

// ── Delete Checkpoint ────────────────────────────────────────────────────────

/**
 * Remove a checkpoint from disk.
 */
export function deleteCheckpoint(id: string): void {
  const filePath = checkpointPath(id);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Checkpoint not found: ${id}`);
  }

  fs.unlinkSync(filePath);
}
