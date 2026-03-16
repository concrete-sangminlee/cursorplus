/**
 * Orion CLI - Auto-Fix Command
 * AI-powered code fixing with diff preview and confirmation
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
  printWarning,
  startSpinner,
  stopSpinner,
  readFileContent,
  writeFileContent,
  formatDiff,
  fileExists,
} from '../utils.js';

const FIX_ANALYSIS_PROMPT = `You are Orion, an expert code fixer. Analyze the provided code for issues.

First, list all issues found using this format:
[ERROR] <issue description> (line ~N)
[WARNING] <issue description> (line ~N)
[INFO] <suggestion> (line ~N)

Then output a separator line: ---FIX---

Then output ONLY the complete fixed file content with all issues resolved.
Do NOT wrap the fixed code in code fences or markdown.
Output raw code after the ---FIX--- separator.

Focus on:
- Bugs and logic errors
- Type errors and null safety
- Missing error handling
- Security issues
- Performance problems
- Best practice violations`;

export async function fixCommand(filePath: string): Promise<void> {
  printHeader('Orion Auto-Fix');

  const resolvedPath = path.resolve(filePath);

  if (!fileExists(filePath)) {
    printError(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const { content: originalContent, language } = readFileContent(filePath);
  const lineCount = originalContent.split('\n').length;

  printInfo(`File: ${colors.file(resolvedPath)}`);
  printInfo(`Language: ${language} | Lines: ${lineCount}`);
  console.log();

  const spinner = startSpinner('Scanning for issues...');

  try {
    const userMessage = `Fix issues in this ${language} file (${path.basename(filePath)}):\n\n\`\`\`${language}\n${originalContent}\n\`\`\``;

    let fullResponse = '';

    await askAI(FIX_ANALYSIS_PROMPT, userMessage, {
      onToken(token: string) {
        fullResponse += token;
      },
      onComplete() {
        stopSpinner(spinner, 'Analysis complete');
      },
      onError(error: Error) {
        stopSpinner(spinner, error.message, false);
      },
    });

    // Parse the response
    const parts = fullResponse.split('---FIX---');
    const analysis = parts[0]?.trim() || '';
    let fixedContent = parts[1]?.trim() || '';

    // Show analysis
    console.log();
    printDivider();
    console.log(colors.label('  Issues Found:'));
    console.log();

    const analysisLines = analysis.split('\n');
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    for (const line of analysisLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[ERROR]')) {
        errorCount++;
        console.log(`  ${colors.severityError(' ERROR ')} ${colors.error(trimmed.replace('[ERROR] ', ''))}`);
      } else if (trimmed.startsWith('[WARNING]')) {
        warningCount++;
        console.log(`  ${colors.severityWarning(' WARN  ')} ${colors.warning(trimmed.replace('[WARNING] ', ''))}`);
      } else if (trimmed.startsWith('[INFO]')) {
        infoCount++;
        console.log(`  ${colors.severityInfo(' INFO  ')} ${colors.info(trimmed.replace('[INFO] ', ''))}`);
      } else if (trimmed) {
        console.log(`  ${colors.ai(trimmed)}`);
      }
    }

    console.log();
    console.log(
      `  Summary: ${colors.error(`${errorCount} errors`)} | ` +
      `${colors.warning(`${warningCount} warnings`)} | ` +
      `${colors.info(`${infoCount} suggestions`)}`
    );

    if (!fixedContent) {
      printInfo('No fixable issues found, or AI did not provide fixes.');
      return;
    }

    // Clean up potential code fences
    if (fixedContent.startsWith('```')) {
      const lines = fixedContent.split('\n');
      lines.shift();
      if (lines[lines.length - 1]?.trim() === '```') {
        lines.pop();
      }
      fixedContent = lines.join('\n');
    }

    // Show diff
    console.log();
    printDivider();
    console.log(colors.label('  Proposed Fixes:'));
    console.log();
    console.log(formatDiff(originalContent, fixedContent));
    console.log();
    printDivider();

    // Ask for confirmation
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Apply these fixes?',
        choices: [
          { name: 'Apply all fixes', value: 'apply' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ]);

    if (action === 'apply') {
      writeFileContent(filePath, fixedContent);
      printSuccess(`Fixed file saved: ${resolvedPath}`);
    } else {
      printInfo('Fixes discarded. File unchanged.');
    }
  } catch (err: any) {
    stopSpinner(spinner, err.message, false);
    console.error(colors.error(`  Error: ${err.message}`));
    process.exit(1);
  }
}
