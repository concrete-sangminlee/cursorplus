/**
 * Orion CLI - AI Commit Message Generator
 * Generates conventional commit messages from staged changes
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { askAI } from '../ai-client.js';
import {
  colors,
  printHeader,
  printDivider,
  printInfo,
  printSuccess,
  printError,
  printWarning,
  startSpinner,
  stopSpinner,
  isGitRepo,
  getStagedDiff,
  getStagedFiles,
  commitWithMessage,
} from '../utils.js';

const COMMIT_SYSTEM_PROMPT = `You are a git commit message generator. Analyze the provided diff and generate a conventional commit message.

Rules:
1. Use conventional commit format: type(scope): description
2. Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore
3. Keep the first line under 72 characters
4. Add a blank line then a body if the changes are complex
5. Be specific about what changed and why
6. Do NOT use markdown formatting
7. Output ONLY the commit message, nothing else

Examples:
- feat(auth): add JWT token refresh mechanism
- fix(api): handle null response in user endpoint
- refactor(utils): extract date formatting to shared helper`;

export async function commitCommand(): Promise<void> {
  printHeader('Orion AI Commit');

  // Check if we're in a git repo
  if (!isGitRepo()) {
    printError('Not a git repository. Run this command inside a git project.');
    process.exit(1);
  }

  // Get staged changes
  const stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    printWarning('No staged changes found.');
    printInfo('Stage your changes first:');
    console.log(colors.command('    git add <files>'));
    console.log(colors.command('    git add -p'));
    process.exit(1);
  }

  // Show staged files
  printInfo(`Staged files (${stagedFiles.length}):`);
  for (const file of stagedFiles) {
    console.log(`    ${colors.file(file)}`);
  }
  console.log();

  // Get the diff
  const diff = getStagedDiff();
  if (!diff) {
    printWarning('Staged diff is empty.');
    process.exit(1);
  }

  // Truncate very large diffs
  const maxDiffLength = 8000;
  const truncatedDiff = diff.length > maxDiffLength
    ? diff.substring(0, maxDiffLength) + '\n\n... [diff truncated for AI processing]'
    : diff;

  // Generate commit message
  const spinner = startSpinner('Generating commit message...');

  try {
    const userMessage = `Generate a commit message for these changes:\n\nStaged files:\n${stagedFiles.join('\n')}\n\nDiff:\n${truncatedDiff}`;

    let commitMessage = '';

    await askAI(COMMIT_SYSTEM_PROMPT, userMessage, {
      onToken(token: string) {
        commitMessage += token;
      },
      onComplete() {
        stopSpinner(spinner, 'Commit message generated');
      },
      onError(error: Error) {
        stopSpinner(spinner, error.message, false);
      },
    });

    // Clean up the message
    commitMessage = commitMessage.trim();

    // Display the suggested message
    console.log();
    printDivider();
    console.log(colors.ai(commitMessage));
    printDivider();
    console.log();

    // Ask for confirmation
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Commit with this message', value: 'commit' },
          { name: 'Edit the message', value: 'edit' },
          { name: 'Regenerate', value: 'regenerate' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ]);

    if (action === 'commit') {
      const commitSpinner = startSpinner('Committing...');
      try {
        const result = commitWithMessage(commitMessage);
        stopSpinner(commitSpinner, 'Committed successfully!');
        console.log(colors.dim(`  ${result}`));
      } catch (err: any) {
        stopSpinner(commitSpinner, `Commit failed: ${err.message}`, false);
        process.exit(1);
      }
    } else if (action === 'edit') {
      const { editedMessage } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'editedMessage',
          message: 'Edit your commit message:',
          default: commitMessage,
        },
      ]);

      if (editedMessage.trim()) {
        const commitSpinner = startSpinner('Committing...');
        try {
          const result = commitWithMessage(editedMessage.trim());
          stopSpinner(commitSpinner, 'Committed successfully!');
          console.log(colors.dim(`  ${result}`));
        } catch (err: any) {
          stopSpinner(commitSpinner, `Commit failed: ${err.message}`, false);
          process.exit(1);
        }
      } else {
        printWarning('Empty message. Commit cancelled.');
      }
    } else if (action === 'regenerate') {
      // Recursive call to regenerate
      await commitCommand();
    } else {
      printInfo('Commit cancelled.');
    }
  } catch (err: any) {
    stopSpinner(spinner, err.message, false);
    console.error(colors.error(`  Error: ${err.message}`));
    process.exit(1);
  }
}
