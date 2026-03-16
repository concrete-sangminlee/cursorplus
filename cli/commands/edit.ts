/**
 * Orion CLI - AI-Assisted File Editing
 * Read file, get edit instructions, preview diff, apply changes
 */

import * as path from 'path';
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
  startSpinner,
  stopSpinner,
  readFileContent,
  writeFileContent,
  formatDiff,
  fileExists,
} from '../utils.js';

const EDIT_SYSTEM_PROMPT = `You are Orion, an expert code editor. The user will provide a file and editing instructions.

Rules:
1. Output ONLY the complete modified file content
2. Do NOT include any explanation, markdown formatting, or code fences
3. Do NOT add \`\`\` markers around the code
4. Preserve the original file's formatting style (indentation, line endings)
5. Only make the changes the user requested
6. Keep all existing code that wasn't asked to be changed
7. Output the raw file content, ready to be written to disk`;

export async function editCommand(filePath: string): Promise<void> {
  printHeader('Orion AI Edit');

  const resolvedPath = path.resolve(filePath);

  // Check file exists
  if (!fileExists(filePath)) {
    printError(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  // Read the file
  const { content: originalContent, language } = readFileContent(filePath);
  const lineCount = originalContent.split('\n').length;

  printInfo(`File: ${colors.file(resolvedPath)}`);
  printInfo(`Language: ${language} | Lines: ${lineCount}`);
  console.log();

  // Show a preview of the file
  const previewLines = originalContent.split('\n').slice(0, 20);
  console.log(colors.dim('  File preview (first 20 lines):'));
  previewLines.forEach((line, i) => {
    const lineNum = colors.dim(String(i + 1).padStart(4, ' ') + ' |');
    console.log(`  ${lineNum} ${colors.code(line)}`);
  });
  if (lineCount > 20) {
    console.log(colors.dim(`  ... and ${lineCount - 20} more lines`));
  }
  console.log();

  // Ask what to change
  const { instruction } = await inquirer.prompt([
    {
      type: 'input',
      name: 'instruction',
      message: 'What would you like to change?',
      validate: (input: string) => input.trim().length > 0 || 'Please describe the change.',
    },
  ]);

  // Send to AI
  const spinner = startSpinner('Generating edit...');

  try {
    const userMessage = `File: ${path.basename(filePath)} (${language})\n\nInstruction: ${instruction}\n\nOriginal file content:\n${originalContent}`;

    let modifiedContent = '';

    await askAI(EDIT_SYSTEM_PROMPT, userMessage, {
      onToken(token: string) {
        modifiedContent += token;
      },
      onComplete() {
        stopSpinner(spinner, 'Edit generated');
      },
      onError(error: Error) {
        stopSpinner(spinner, error.message, false);
      },
    });

    // Clean up the response (remove potential code fences)
    modifiedContent = modifiedContent.trim();
    if (modifiedContent.startsWith('```')) {
      const lines = modifiedContent.split('\n');
      lines.shift(); // Remove opening fence
      if (lines[lines.length - 1]?.trim() === '```') {
        lines.pop(); // Remove closing fence
      }
      modifiedContent = lines.join('\n');
    }

    // Show diff
    console.log();
    printDivider();
    console.log(colors.label('  Changes Preview:'));
    console.log();
    console.log(formatDiff(originalContent, modifiedContent));
    console.log();
    printDivider();

    // Ask for confirmation
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Apply these changes?',
        choices: [
          { name: 'Apply changes', value: 'apply' },
          { name: 'Try different instructions', value: 'retry' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ]);

    if (action === 'apply') {
      writeFileContent(filePath, modifiedContent);
      printSuccess(`File updated: ${resolvedPath}`);
    } else if (action === 'retry') {
      await editCommand(filePath);
    } else {
      printInfo('Edit cancelled. File unchanged.');
    }
  } catch (err: any) {
    stopSpinner(spinner, err.message, false);
    console.error(colors.error(`  Error: ${err.message}`));
    process.exit(1);
  }
}
