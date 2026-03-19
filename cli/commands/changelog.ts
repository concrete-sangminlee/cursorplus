/**
 * Orion CLI - AI Changelog Generator
 * Generates organized changelogs from git commit history using AI categorization.
 */

import * as fs from 'fs';
import * as path from 'path';
import { askAI } from '../ai-client.js';
import {
  colors,
  printInfo,
  printSuccess,
  printError,
  printWarning,
  startSpinner,
  isGitRepo,
  runGitCommand,
  loadProjectContext,
  writeFileContent,
} from '../utils.js';
import { createSilentStreamHandler, createStreamHandler, printCommandError } from '../shared.js';
import { getPipelineOptions, jsonOutput } from '../pipeline.js';
import { commandHeader, divider, box, palette } from '../ui.js';
import { renderMarkdown } from '../markdown.js';

// ─── System Prompt ───────────────────────────────────────────────────────────

const CHANGELOG_SYSTEM_PROMPT = `You are Orion, an expert changelog generator. Given a list of git commit messages, organize them into a well-formatted markdown changelog.

Rules:
1. Group commits into these categories (only include categories that have commits):
   - **Features** (feat, feature, add)
   - **Bug Fixes** (fix, bugfix, patch)
   - **Documentation** (docs, doc, readme)
   - **Refactoring** (refactor, restructure, cleanup)
   - **Performance** (perf, performance, optimize)
   - **Tests** (test, spec, coverage)
   - **Build & CI** (build, ci, deploy, docker)
   - **Chores** (chore, deps, dependency, bump, version)
   - **Style** (style, format, lint)
   - **Other** (anything that doesn't fit above)

2. Use markdown format:
   - Each category as a ### heading
   - Each commit as a bullet point
   - Clean up commit messages for readability (remove prefixes like "feat:", "fix:", etc. from the bullet text since they are already categorized)
   - Include the short commit hash in parentheses at the end of each line

3. Add a title with the date range at the top as a ## heading
4. Output ONLY the markdown changelog, nothing else
5. Sort categories by importance: Features first, then Bug Fixes, then the rest`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGitLog(since?: string, days?: number): string {
  let logArgs = 'log --oneline --no-merges';

  if (since) {
    logArgs += ` ${since}..HEAD`;
  } else if (days) {
    logArgs += ` --since="${days} days ago"`;
  } else {
    // Default: last 50 commits
    logArgs += ' -50';
  }

  return runGitCommand(logArgs);
}

function getDateRange(since?: string, days?: number): string {
  if (since) {
    return `Changes since ${since}`;
  } else if (days) {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const from = fromDate.toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    return `${from} to ${to}`;
  }
  return `Recent changes (last 50 commits)`;
}

// ─── Main Command ────────────────────────────────────────────────────────────

export interface ChangelogCommandOptions {
  since?: string;
  days?: number;
  output?: string;
}

export async function changelogCommand(options: ChangelogCommandOptions): Promise<void> {
  const pipelineOpts = getPipelineOptions();

  const meta: [string, string][] = [];
  if (options.since) meta.push(['Since', options.since]);
  if (options.days) meta.push(['Days', `${options.days}`]);
  if (options.output) meta.push(['Output', colors.file(path.resolve(options.output))]);

  console.log(commandHeader('Orion Changelog', meta.length > 0 ? meta : undefined));

  // Check git repo
  if (!isGitRepo()) {
    console.log();
    printError('Not a git repository.');
    printInfo('Run this command inside a git project directory.');
    console.log();
    process.exit(1);
  }

  // Get git log
  const spinner = startSpinner('Fetching git history...');

  let gitLog: string;
  try {
    gitLog = getGitLog(options.since, options.days);
  } catch (err: any) {
    spinner.stop();
    console.log();
    printError(`Failed to read git log: ${err.message}`);
    if (options.since) {
      printInfo(`Make sure the tag or ref "${options.since}" exists.`);
    }
    console.log();
    process.exit(1);
    return;
  }

  if (!gitLog || gitLog.trim().length === 0) {
    spinner.stop();
    console.log();
    printWarning('No commits found in the specified range.');
    if (options.since) {
      printInfo(`Check that "${options.since}" is a valid tag or ref.`);
    } else if (options.days) {
      printInfo(`No commits in the last ${options.days} day(s).`);
    }
    console.log();
    return;
  }

  const commitLines = gitLog.trim().split('\n').filter(Boolean);
  const dateRange = getDateRange(options.since, options.days);

  if (!pipelineOpts.quiet) {
    printInfo(`Found ${commitLines.length} commit(s) (${dateRange})`);
  }

  // Send to AI for categorization
  spinner.text = 'Generating changelog with AI...';

  try {
    const userMessage =
      `Generate a changelog from these git commits.\n` +
      `Date range: ${dateRange}\n\n` +
      `Commits:\n${gitLog}`;

    const projectContext = loadProjectContext();
    const fullSystemPrompt = projectContext
      ? CHANGELOG_SYSTEM_PROMPT + '\n\nProject context:\n' + projectContext
      : CHANGELOG_SYSTEM_PROMPT;

    const { callbacks, getResponse } = createSilentStreamHandler(spinner, 'Changelog generated');

    await askAI(fullSystemPrompt, userMessage, callbacks);

    const changelog = getResponse().trim();

    // Output to file if requested
    if (options.output) {
      if (pipelineOpts.dryRun) {
        printInfo(`Dry run: would write changelog to ${colors.file(path.resolve(options.output))}`);
      } else {
        writeFileContent(options.output, changelog + '\n');
        printSuccess(`Changelog written to ${colors.file(path.resolve(options.output))}`);
      }
    }

    // Display the changelog
    if (!pipelineOpts.quiet) {
      console.log();
      console.log(renderMarkdown(changelog));
      console.log();
    }

    jsonOutput('changelog', {
      dateRange,
      commitCount: commitLines.length,
      output: options.output || null,
      changelog,
    });

  } catch (err: any) {
    printCommandError(err, 'changelog', 'Run `orion config` to check your AI provider settings.');
    process.exit(1);
  }
}
