/**
 * Orion CLI - TODO Scanner & AI Prioritizer
 * Recursively scan source files for TODO, FIXME, HACK, XXX, NOTE comments.
 *
 * Usage:
 *   orion todo                  # Scan codebase for TODO/FIXME/HACK comments
 *   orion todo --fix            # AI suggests fixes for each TODO
 *   orion todo --prioritize     # AI prioritizes TODOs by importance/impact
 *
 * Features:
 *   - Recursively scans source files, skipping node_modules/dist/build/.git
 *   - Detects TODO, FIXME, HACK, XXX, NOTE markers in comments
 *   - Displays results in a formatted table with file, line, type, text
 *   - --fix: AI generates implementation suggestions for each TODO
 *   - --prioritize: AI ranks TODOs by importance, urgency, and impact
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { askAI } from '../ai-client.js';
import {
  colors,
  printHeader,
  printInfo,
  printSuccess,
  printError,
  printWarning,
  startSpinner,
  stopSpinner,
  getCurrentDirectoryContext,
  loadProjectContext,
} from '../utils.js';
import { renderMarkdown } from '../markdown.js';
import {
  commandHeader,
  divider,
  palette,
  statusLine,
  table as uiTable,
  badge,
  box,
  progressBar,
} from '../ui.js';
import { createStreamHandler, createSilentStreamHandler } from '../shared.js';
import { jsonOutput } from '../pipeline.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type TodoType = 'TODO' | 'FIXME' | 'HACK' | 'XXX' | 'NOTE';

interface TodoEntry {
  file: string;
  relativePath: string;
  line: number;
  type: TodoType;
  text: string;
  context: string; // surrounding code for AI context
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TODO_PATTERN = /\b(TODO|FIXME|HACK|XXX|NOTE)\b[:\s]*(.*)/i;

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.svn', '.hg',
  'coverage', '.next', '.nuxt', '.output', '__pycache__',
  'target', 'vendor', '.cache', '.orion', '.vscode',
  'out', 'bin', 'obj', '.idea',
]);

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.rs', '.go', '.java', '.kt', '.scala',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.swift',
  '.php', '.lua', '.dart', '.ex', '.exs', '.erl',
  '.hs', '.ml', '.clj', '.lisp', '.r',
  '.sh', '.bash', '.zsh', '.ps1',
  '.vue', '.svelte',
  '.html', '.css', '.scss', '.less',
  '.sql', '.yaml', '.yml', '.toml',
  '.md', '.mdx',
]);

const TYPE_COLORS: Record<TodoType, string> = {
  'TODO': '#3B82F6',
  'FIXME': '#EF4444',
  'HACK': '#F59E0B',
  'XXX': '#EF4444',
  'NOTE': '#22C55E',
};

const TYPE_PRIORITY_ORDER: Record<TodoType, number> = {
  'FIXME': 0,
  'XXX': 1,
  'HACK': 2,
  'TODO': 3,
  'NOTE': 4,
};

// ─── AI Prompts ─────────────────────────────────────────────────────────────

const FIX_PROMPT = `You are Orion, an expert developer assistant. The user has TODO/FIXME/HACK comments in their codebase.

For each item, suggest a concrete implementation or fix. Be specific and actionable.
Format your response as a numbered list matching the order given.
For each item, provide:
1. A brief assessment (1 line)
2. A concrete code suggestion or approach (keep it concise, show key code snippets)

Keep each suggestion under 10 lines. Be practical, not theoretical.`;

const PRIORITIZE_PROMPT = `You are Orion, an expert developer assistant. The user has TODO/FIXME/HACK/XXX/NOTE comments in their codebase.

Analyze all items and rank them by importance considering:
- **Impact**: How much it affects code quality, reliability, or user experience
- **Urgency**: FIXMEs and XXXs are usually more urgent than TODOs
- **Risk**: HACK items may indicate fragile workarounds
- **Effort**: Quick wins should rank higher than large refactors

Output a prioritized list with:
1. Priority rank (1 = highest priority)
2. The original marker (TODO/FIXME/etc.) and file location
3. A brief reason for the ranking (1 sentence)
4. Suggested approach (1 sentence)

Group into sections: Critical, High, Medium, Low.`;

// ─── Scanner ────────────────────────────────────────────────────────────────

function scanDirectory(dir: string, todos: TodoEntry[], baseDir: string): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // Skip unreadable directories
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        scanDirectory(fullPath, todos, baseDir);
      }
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(ext)) continue;

    scanFile(fullPath, todos, baseDir);
  }
}

function scanFile(filePath: string, todos: TodoEntry[], baseDir: string): void {
  let content: string;
  try {
    const stat = fs.statSync(filePath);
    // Skip files larger than 500KB
    if (stat.size > 500 * 1024) return;
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return; // Skip unreadable files
  }

  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(TODO_PATTERN);

    if (match) {
      const type = match[1].toUpperCase() as TodoType;
      const text = match[2].trim() || '(no description)';
      const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/');

      // Gather surrounding context (3 lines before and after)
      const contextStart = Math.max(0, i - 3);
      const contextEnd = Math.min(lines.length - 1, i + 3);
      const contextLines = lines.slice(contextStart, contextEnd + 1);
      const context = contextLines.join('\n');

      todos.push({
        file: filePath,
        relativePath,
        line: i + 1,
        type,
        text,
        context,
      });
    }
  }
}

// ─── Display ────────────────────────────────────────────────────────────────

function typeBadge(type: TodoType): string {
  return badge(type, TYPE_COLORS[type]);
}

function displayTodoTable(todos: TodoEntry[]): void {
  // Sort by type priority, then by file
  const sorted = [...todos].sort((a, b) => {
    const typeDiff = TYPE_PRIORITY_ORDER[a.type] - TYPE_PRIORITY_ORDER[b.type];
    if (typeDiff !== 0) return typeDiff;
    return a.relativePath.localeCompare(b.relativePath);
  });

  console.log();
  console.log(uiTable(
    ['Type', 'File', 'Line', 'Description'],
    sorted.map(t => [
      typeBadge(t.type),
      palette.blue(truncatePath(t.relativePath, 35)),
      palette.dim(String(t.line)),
      truncateText(t.text, 45),
    ])
  ));
  console.log();

  // Summary by type
  const counts: Record<string, number> = {};
  for (const t of todos) {
    counts[t.type] = (counts[t.type] || 0) + 1;
  }

  const summaryParts: string[] = [];
  for (const type of ['FIXME', 'XXX', 'HACK', 'TODO', 'NOTE'] as TodoType[]) {
    if (counts[type]) {
      summaryParts.push(`${chalk.hex(TYPE_COLORS[type]).bold(type)}: ${counts[type]}`);
    }
  }

  console.log(`  ${palette.violet.bold('Summary:')} ${summaryParts.join(palette.dim(' | '))}`);

  const fileCount = new Set(todos.map(t => t.relativePath)).size;
  console.log(`  ${palette.dim(`${todos.length} items across ${fileCount} files`)}`);
  console.log();
}

// ─── Main Command ───────────────────────────────────────────────────────────

export async function todoCommand(options: {
  fix?: boolean;
  prioritize?: boolean;
} = {}): Promise<void> {
  const cwd = process.cwd();
  const mode = options.fix ? 'fix' : options.prioritize ? 'prioritize' : 'scan';

  console.log(commandHeader('Orion TODO Scanner', [
    ['Directory', cwd],
    ['Mode', mode === 'fix' ? 'AI fix suggestions' : mode === 'prioritize' ? 'AI prioritization' : 'scan'],
  ]));

  // Scan the codebase
  const spinner = startSpinner('Scanning codebase for TODO/FIXME/HACK...');
  const todos: TodoEntry[] = [];

  try {
    scanDirectory(cwd, todos, cwd);
  } catch (err: any) {
    stopSpinner(spinner, `Scan error: ${err.message}`, false);
    return;
  }

  stopSpinner(spinner, `Found ${todos.length} items`);

  if (todos.length === 0) {
    console.log();
    printSuccess('No TODO/FIXME/HACK/XXX/NOTE comments found.');
    printInfo('Your codebase is clean!');
    console.log();

    jsonOutput('todo_scan', { count: 0, items: [] });
    return;
  }

  // Display the table
  displayTodoTable(todos);

  // JSON output for CI/CD
  jsonOutput('todo_scan', {
    count: todos.length,
    items: todos.map(t => ({
      type: t.type,
      file: t.relativePath,
      line: t.line,
      text: t.text,
    })),
  });

  // AI modes
  if (options.fix) {
    await handleFixMode(todos);
  } else if (options.prioritize) {
    await handlePrioritizeMode(todos);
  }
}

// ─── Fix Mode ───────────────────────────────────────────────────────────────

async function handleFixMode(todos: TodoEntry[]): Promise<void> {
  // Limit to avoid overwhelming the AI with too many items
  const maxItems = 20;
  const itemsToFix = todos.slice(0, maxItems);

  if (todos.length > maxItems) {
    printWarning(`Showing AI suggestions for the first ${maxItems} of ${todos.length} items.`);
    console.log();
  }

  console.log(divider('AI Fix Suggestions'));
  console.log();

  const spinner = startSpinner('AI is analyzing TODOs and generating fix suggestions...');

  try {
    const projectContext = loadProjectContext();
    const dirContext = getCurrentDirectoryContext();

    const itemList = itemsToFix.map((t, i) => {
      return [
        `${i + 1}. [${t.type}] ${t.relativePath}:${t.line}`,
        `   Text: ${t.text}`,
        `   Context:`,
        `   \`\`\``,
        `   ${t.context}`,
        `   \`\`\``,
      ].join('\n');
    }).join('\n\n');

    const userMessage = [
      `Workspace:\n${dirContext}`,
      `\nTODO items to fix:\n${itemList}`,
    ].join('\n');

    const systemPrompt = projectContext
      ? FIX_PROMPT + '\n\nProject context:\n' + projectContext
      : FIX_PROMPT;

    const { callbacks } = createStreamHandler(spinner, {
      label: 'Fix Suggestions',
      markdown: true,
    });

    await askAI(systemPrompt, userMessage, callbacks);
    console.log();

    jsonOutput('todo_fix', {
      itemsAnalyzed: itemsToFix.length,
    });
  } catch (err: any) {
    stopSpinner(spinner, err.message, false);
    printError(`AI analysis failed: ${err.message}`);
    printInfo('Run `orion config` to check your AI provider settings.');
    console.log();
  }
}

// ─── Prioritize Mode ────────────────────────────────────────────────────────

async function handlePrioritizeMode(todos: TodoEntry[]): Promise<void> {
  console.log(divider('AI Prioritization'));
  console.log();

  const spinner = startSpinner('AI is analyzing and prioritizing items...');

  try {
    const projectContext = loadProjectContext();
    const dirContext = getCurrentDirectoryContext();

    const itemList = todos.map((t, i) => {
      return `${i + 1}. [${t.type}] ${t.relativePath}:${t.line} - ${t.text}`;
    }).join('\n');

    const userMessage = [
      `Workspace:\n${dirContext}`,
      `\nAll TODO/FIXME/HACK/XXX/NOTE items (${todos.length} total):\n${itemList}`,
    ].join('\n');

    const systemPrompt = projectContext
      ? PRIORITIZE_PROMPT + '\n\nProject context:\n' + projectContext
      : PRIORITIZE_PROMPT;

    const { callbacks } = createStreamHandler(spinner, {
      label: 'Priority Ranking',
      markdown: true,
    });

    await askAI(systemPrompt, userMessage, callbacks);
    console.log();

    jsonOutput('todo_prioritize', {
      itemsAnalyzed: todos.length,
    });
  } catch (err: any) {
    stopSpinner(spinner, err.message, false);
    printError(`AI analysis failed: ${err.message}`);
    printInfo('Run `orion config` to check your AI provider settings.');
    console.log();
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncatePath(p: string, maxLen: number): string {
  if (p.length <= maxLen) return p;
  const parts = p.split('/');
  if (parts.length <= 2) return '...' + p.slice(-(maxLen - 3));

  // Keep first dir and filename, truncate middle
  const first = parts[0];
  const last = parts[parts.length - 1];
  const middle = '...';
  const result = `${first}/${middle}/${last}`;
  if (result.length <= maxLen) return result;
  return '...' + p.slice(-(maxLen - 3));
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 1) + '\u2026';
}
