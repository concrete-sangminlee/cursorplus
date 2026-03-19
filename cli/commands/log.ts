/**
 * Orion CLI - AI-Enhanced Git Log Command
 * Shows recent commits with AI-generated summaries and impact analysis.
 *
 * Usage:
 *   orion log                              # Show recent commits with AI summary
 *   orion log --author "name"              # Filter by author
 *   orion log --since "1 week ago"         # Filter by time
 *   orion log --impact                     # AI analyzes impact of each commit
 */

import { askAI } from '../ai-client.js';
import {
  colors,
  printInfo,
  printError,
  printWarning,
  startSpinner,
  isGitRepo,
  runGitCommand,
  loadProjectContext,
} from '../utils.js';
import { createSilentStreamHandler, printCommandError } from '../shared.js';
import { commandHeader, divider, table, palette } from '../ui.js';
import { renderMarkdown } from '../markdown.js';

// ─── System Prompts ─────────────────────────────────────────────────────────

const LOG_SUMMARY_PROMPT = `You are Orion, an expert software analyst. Given a list of git commits, provide a concise summary of the recent development activity.

Rules:
1. Start with a brief overview (2-3 sentences) of what the team has been working on.
2. Identify the main themes or areas of work.
3. Highlight any notable changes (breaking changes, major features, critical fixes).
4. Keep the summary concise and actionable.
5. Use markdown formatting for readability.
6. Do NOT list every commit individually - synthesize and summarize.`;

const LOG_IMPACT_PROMPT = `You are Orion, an expert software analyst. Given a list of git commits, analyze the impact of each commit.

For each commit, provide:
- **Impact Level**: HIGH, MEDIUM, or LOW
- **Reason**: A brief (one sentence) explanation of why this impact level was assigned

Impact criteria:
- HIGH: Breaking changes, security fixes, major features, data migrations, API changes
- MEDIUM: Bug fixes, non-trivial features, refactoring of core modules, dependency updates
- LOW: Documentation, formatting, typos, minor refactoring, test additions, config tweaks

Output format - return ONLY a JSON array (no markdown fences, no extra text):
[
  { "hash": "<short-hash>", "impact": "HIGH|MEDIUM|LOW", "reason": "<brief reason>" },
  ...
]

Important: Return valid JSON only. The array must have one entry per commit, in the same order as the input.`;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LogCommandOptions {
  author?: string;
  since?: string;
  count?: number;
  impact?: boolean;
}

interface CommitEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

interface ImpactEntry {
  hash: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildGitLogArgs(options: LogCommandOptions): string {
  const parts = ['log', '--format=%h\t%an\t%ar\t%s', '--no-merges'];

  if (options.author) {
    parts.push(`--author="${options.author}"`);
  }

  if (options.since) {
    parts.push(`--since="${options.since}"`);
  }

  const count = options.count || 20;
  parts.push(`-${count}`);

  return parts.join(' ');
}

function parseGitLog(raw: string): CommitEntry[] {
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, author, date, ...msgParts] = line.split('\t');
      return {
        hash: hash || '',
        author: author || '',
        date: date || '',
        message: msgParts.join('\t') || '',
      };
    });
}

function impactColor(level: string): string {
  switch (level.toUpperCase()) {
    case 'HIGH':
      return palette.red.bold(level);
    case 'MEDIUM':
      return palette.yellow(level);
    case 'LOW':
      return palette.green(level);
    default:
      return palette.dim(level);
  }
}

// ─── Main Command ───────────────────────────────────────────────────────────

export async function logCommand(options: LogCommandOptions): Promise<void> {
  // Verify git repo
  if (!isGitRepo()) {
    console.log();
    printError('Not a git repository.');
    printInfo('Run this command inside a git project directory.');
    console.log();
    process.exit(1);
  }

  // Build metadata for header
  const meta: [string, string][] = [];
  if (options.author) meta.push(['Author', options.author]);
  if (options.since) meta.push(['Since', options.since]);
  if (options.impact) meta.push(['Mode', 'Impact Analysis']);
  meta.push(['Limit', String(options.count || 20)]);

  console.log(commandHeader('Orion Git Log', meta));

  // Fetch git log
  const spinner = startSpinner('Fetching git history...');

  let rawLog: string;
  try {
    const args = buildGitLogArgs(options);
    rawLog = runGitCommand(args);
  } catch (err: any) {
    spinner.stop();
    console.log();
    printError(`Failed to read git log: ${err.message}`);
    console.log();
    process.exit(1);
    return;
  }

  if (!rawLog || rawLog.trim().length === 0) {
    spinner.stop();
    console.log();
    printWarning('No commits found matching the given filters.');
    if (options.author) {
      printInfo(`Check the author name: "${options.author}"`);
    }
    if (options.since) {
      printInfo(`Check the time range: "${options.since}"`);
    }
    console.log();
    return;
  }

  const commits = parseGitLog(rawLog);
  spinner.succeed(palette.green(`Found ${commits.length} commit(s)`));

  // Display commit table
  console.log();
  console.log(divider('Commits'));
  console.log();

  const tableRows = commits.map((c) => [
    palette.yellow(c.hash),
    c.message.length > 50 ? c.message.substring(0, 47) + '...' : c.message,
    palette.dim(c.author),
    palette.dim(c.date),
  ]);

  console.log(table(['Hash', 'Message', 'Author', 'Date'], tableRows));
  console.log();

  // AI analysis
  if (options.impact) {
    await analyzeImpact(commits);
  } else {
    await generateSummary(commits);
  }
}

// ─── AI Summary ─────────────────────────────────────────────────────────────

async function generateSummary(commits: CommitEntry[]): Promise<void> {
  const spinner = startSpinner('AI is summarizing commit history...');

  const commitList = commits
    .map((c) => `${c.hash} ${c.message} (${c.author}, ${c.date})`)
    .join('\n');

  const userMessage = `Summarize this git commit history:\n\n${commitList}`;

  try {
    const projectContext = loadProjectContext();
    const fullSystemPrompt = projectContext
      ? LOG_SUMMARY_PROMPT + '\n\nProject context:\n' + projectContext
      : LOG_SUMMARY_PROMPT;

    const { callbacks, getResponse } = createSilentStreamHandler(spinner, 'Summary generated');

    await askAI(fullSystemPrompt, userMessage, callbacks);

    const summary = getResponse().trim();
    console.log();
    console.log(divider('AI Summary'));
    console.log();
    console.log(renderMarkdown(summary));
    console.log();
  } catch (err: any) {
    printCommandError(err, 'log', 'Run `orion config` to check your AI provider settings.');
    process.exit(1);
  }
}

// ─── AI Impact Analysis ─────────────────────────────────────────────────────

async function analyzeImpact(commits: CommitEntry[]): Promise<void> {
  const spinner = startSpinner('AI is analyzing commit impact...');

  const commitList = commits
    .map((c) => `${c.hash} ${c.message}`)
    .join('\n');

  const userMessage = `Analyze the impact of each commit:\n\n${commitList}`;

  try {
    const projectContext = loadProjectContext();
    const fullSystemPrompt = projectContext
      ? LOG_IMPACT_PROMPT + '\n\nProject context:\n' + projectContext
      : LOG_IMPACT_PROMPT;

    const { callbacks, getResponse } = createSilentStreamHandler(spinner, 'Impact analysis complete');

    await askAI(fullSystemPrompt, userMessage, callbacks);

    const rawResponse = getResponse().trim();

    // Parse the JSON response
    let impacts: ImpactEntry[];
    try {
      impacts = JSON.parse(rawResponse);
    } catch {
      // If JSON parsing fails, try to extract JSON from the response
      const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        impacts = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: display raw AI response
        console.log();
        console.log(divider('Impact Analysis'));
        console.log();
        console.log(renderMarkdown(rawResponse));
        console.log();
        return;
      }
    }

    // Build impact table
    console.log();
    console.log(divider('Impact Analysis'));
    console.log();

    const impactRows = impacts.map((entry) => {
      const commit = commits.find((c) => c.hash === entry.hash);
      const message = commit
        ? commit.message.length > 40
          ? commit.message.substring(0, 37) + '...'
          : commit.message
        : '';
      return [
        palette.yellow(entry.hash),
        impactColor(entry.impact),
        message,
        palette.dim(entry.reason || ''),
      ];
    });

    console.log(table(['Hash', 'Impact', 'Message', 'Reason'], impactRows));
    console.log();

    // Show impact summary counts
    const highCount = impacts.filter((i) => i.impact === 'HIGH').length;
    const mediumCount = impacts.filter((i) => i.impact === 'MEDIUM').length;
    const lowCount = impacts.filter((i) => i.impact === 'LOW').length;

    console.log(
      `  ${palette.dim('Impact Distribution:')} ` +
      `${palette.red.bold(`${highCount} HIGH`)}  ` +
      `${palette.yellow(`${mediumCount} MEDIUM`)}  ` +
      `${palette.green(`${lowCount} LOW`)}`
    );
    console.log();
  } catch (err: any) {
    if (err instanceof SyntaxError) {
      printError('Failed to parse AI impact analysis response.');
      printInfo('Try running the command again.');
    } else {
      printCommandError(err, 'log', 'Run `orion config` to check your AI provider settings.');
    }
    process.exit(1);
  }
}
