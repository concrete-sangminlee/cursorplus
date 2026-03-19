/**
 * Orion CLI - AI Diff Review Command
 * Review git diffs with AI-powered analysis and severity levels.
 * Inspired by Claude Code's diff review and Aider's change analysis.
 *
 * Usage:
 *   orion diff                    # Review uncommitted changes
 *   orion diff --staged           # Review staged changes
 *   orion diff HEAD~3             # Review last 3 commits
 *   orion diff main..feature      # Review branch diff
 */

import { askAI } from '../ai-client.js';
import {
  colors,
  startSpinner,
  isGitRepo,
  runGitCommand,
  getCurrentDirectoryContext,
  loadProjectContext,
} from '../utils.js';
import { createStreamHandler, printCommandError } from '../shared.js';
import { renderMarkdown } from '../markdown.js';
import { commandHeader, box, statusLine, divider, palette, severityBadge } from '../ui.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const DIFF_SYSTEM_PROMPT = `You are Orion, an expert code reviewer specializing in diff analysis.
Review the provided git diff and provide a thorough analysis.

For each finding, use this exact severity format:
[ERROR] <title>: <description>
[WARNING] <title>: <description>
[INFO] <title>: <description>

Focus on:
- **Bugs**: Logic errors, null pointer risks, off-by-one errors
- **Security**: Exposed secrets, injection risks, auth bypasses
- **Performance**: N+1 queries, unnecessary allocations, blocking calls
- **Breaking Changes**: API changes, type signature changes, removed exports
- **Best Practices**: Missing error handling, magic numbers, code duplication

End with:
1. **Risk Assessment**: LOW / MEDIUM / HIGH / CRITICAL
2. **Summary**: One-paragraph overview of the changes
3. **Recommendation**: APPROVE / REQUEST_CHANGES / NEEDS_DISCUSSION

Be specific: reference file names, line numbers, and changed code when possible.
If the diff is clean and well-written, say so. Don't invent issues.`;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DiffOptions {
  staged?: boolean;
  ref?: string;     // e.g., HEAD~3, main..feature, commit-sha
}

// ─── Diff Retrieval ─────────────────────────────────────────────────────────

function getDiff(options: DiffOptions): { diff: string; description: string } {
  if (options.staged) {
    const diff = runGitCommand('diff --cached');
    return { diff, description: 'staged changes' };
  }

  if (options.ref) {
    const ref = options.ref;

    // Handle HEAD~N pattern
    if (/^HEAD~\d+$/.test(ref)) {
      const diff = runGitCommand(`diff ${ref}..HEAD`);
      const n = ref.replace('HEAD~', '');
      return { diff, description: `last ${n} commit${parseInt(n) > 1 ? 's' : ''}` };
    }

    // Handle branch..branch or commit..commit
    if (ref.includes('..')) {
      const diff = runGitCommand(`diff ${ref}`);
      return { diff, description: `diff ${ref}` };
    }

    // Handle single commit ref
    const diff = runGitCommand(`diff ${ref}..HEAD`);
    return { diff, description: `changes since ${ref}` };
  }

  // Default: uncommitted changes (both staged + unstaged)
  const diff = runGitCommand('diff HEAD');
  return { diff, description: 'uncommitted changes' };
}

// ─── Diff Stats ─────────────────────────────────────────────────────────────

interface DiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: string[];
}

function parseDiffStats(diff: string): DiffStats {
  const files = new Set<string>();
  let insertions = 0;
  let deletions = 0;

  const lines = diff.split('\n');
  for (const line of lines) {
    // Parse file headers
    const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (fileMatch) {
      files.add(fileMatch[2]);
    }

    // Count insertions/deletions (lines starting with + or - but not file headers)
    if (line.startsWith('+') && !line.startsWith('+++')) {
      insertions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  return {
    filesChanged: files.size,
    insertions,
    deletions,
    files: Array.from(files),
  };
}

// ─── Severity Renderer ─────────────────────────────────────────────────────

function renderDiffReviewOutput(text: string): void {
  const lines = text.split('\n');
  const nonSeverityLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[ERROR]')) {
      flushMarkdown(nonSeverityLines);
      console.log(`  ${severityBadge('error')} ${palette.red(trimmed.replace('[ERROR] ', ''))}`);
    } else if (trimmed.startsWith('[WARNING]')) {
      flushMarkdown(nonSeverityLines);
      console.log(`  ${severityBadge('warning')} ${palette.yellow(trimmed.replace('[WARNING] ', ''))}`);
    } else if (trimmed.startsWith('[INFO]')) {
      flushMarkdown(nonSeverityLines);
      console.log(`  ${severityBadge('info')} ${palette.blue(trimmed.replace('[INFO] ', ''))}`);
    } else {
      nonSeverityLines.push(line);
    }
  }

  // Flush remaining
  flushMarkdown(nonSeverityLines);
}

function flushMarkdown(lines: string[]): void {
  if (lines.length === 0) return;
  const block = lines.join('\n');
  if (block.trim()) {
    console.log(renderMarkdown(block));
  }
  lines.length = 0;
}

// ─── Command Entry Point ────────────────────────────────────────────────────

export async function diffCommand(ref?: string, options: Omit<DiffOptions, 'ref'> = {}): Promise<void> {
  // Verify git repo
  if (!isGitRepo()) {
    console.log();
    console.log(`  ${colors.error('Not a git repository.')}`);
    console.log(`  ${colors.dim('Run this command inside a git project.')}`);
    console.log();
    process.exit(1);
  }

  const diffOptions: DiffOptions = {
    staged: options.staged,
    ref,
  };

  // Get the diff
  const spinner = startSpinner('Getting diff...');
  let diff: string;
  let description: string;

  try {
    const result = getDiff(diffOptions);
    diff = result.diff;
    description = result.description;
  } catch (err: any) {
    spinner.fail(palette.red('Failed to get diff'));
    console.log();
    console.log(`  ${palette.dim(err.message)}`);
    console.log();
    process.exit(1);
  }

  if (!diff || !diff.trim()) {
    spinner.fail(palette.red('No changes found'));
    console.log();
    if (diffOptions.staged) {
      console.log(`  ${palette.dim('No staged changes. Stage files with `git add` first.')}`);
    } else {
      console.log(`  ${palette.dim('Working tree is clean. Nothing to review.')}`);
    }
    console.log();
    return;
  }

  // Parse diff stats
  const stats = parseDiffStats(diff);
  spinner.succeed(palette.green(`Found ${description}`));

  // Display header
  console.log(commandHeader('Orion Diff Review', [
    ['Scope', description],
    ['Files', `${stats.filesChanged} changed`],
    ['Changes', `${palette.green(`+${stats.insertions}`)} ${palette.red(`-${stats.deletions}`)}`],
  ]));

  // List changed files
  console.log(`  ${palette.violet.bold('Changed Files')}`);
  for (const file of stats.files.slice(0, 20)) {
    console.log(statusLine('\u25CF' as any, colors.file(file)));
  }
  if (stats.files.length > 20) {
    console.log(`  ${palette.dim(`  ...and ${stats.files.length - 20} more`)}`);
  }
  console.log();
  console.log(divider());
  console.log();

  // Truncate very large diffs to avoid exceeding token limits
  const MAX_DIFF_CHARS = 30000;
  let diffForAI = diff;
  let truncated = false;
  if (diff.length > MAX_DIFF_CHARS) {
    diffForAI = diff.substring(0, MAX_DIFF_CHARS);
    truncated = true;
    console.log(`  ${palette.yellow('! Diff truncated to ~30K chars for AI analysis. Full diff has ' + diff.length.toLocaleString() + ' chars.')}`);
    console.log();
  }

  // Send to AI for review
  const aiSpinner = startSpinner('AI is reviewing changes...');

  const context = getCurrentDirectoryContext();
  const projectContext = loadProjectContext();

  const fullSystemPrompt = projectContext
    ? DIFF_SYSTEM_PROMPT + '\n\nWorkspace context:\n' + context + '\n\nProject context:\n' + projectContext
    : DIFF_SYSTEM_PROMPT + '\n\nWorkspace context:\n' + context;

  const userMessage = truncated
    ? `Review this git diff (${description}). Note: diff was truncated due to size.\n\n\`\`\`diff\n${diffForAI}\n\`\`\``
    : `Review this git diff (${description}):\n\n\`\`\`diff\n${diffForAI}\n\`\`\``;

  try {
    let fullResponse = '';

    await askAI(fullSystemPrompt, userMessage, {
      onToken(token: string) {
        aiSpinner.stop();
        fullResponse += token;
      },
      onComplete(text: string) {
        console.log();
        renderDiffReviewOutput(text);
        console.log();
      },
      onError(error: Error) {
        aiSpinner.fail(palette.red(error.message));
      },
    });
  } catch (err: any) {
    printCommandError(err, 'diff', 'Run `orion config` to check your AI provider settings.');
    process.exit(1);
  }
}
