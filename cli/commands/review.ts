/**
 * Orion CLI - Code Review Command
 * AI-powered code review with severity levels
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { askAI } from '../ai-client.js';
import {
  colors,
  printHeader,
  printDivider,
  printInfo,
  startSpinner,
  stopSpinner,
  readFileContent,
  detectLanguage,
} from '../utils.js';

const REVIEW_SYSTEM_PROMPT = `You are Orion, an expert code reviewer. Analyze the provided code and give a thorough review.

For each finding, use this exact format:
[ERROR] <title>: <description>
[WARNING] <title>: <description>
[INFO] <title>: <description>

Categories to check:
- Bugs and logic errors
- Security vulnerabilities
- Performance issues
- Code style and readability
- Best practices violations
- Missing error handling
- Type safety issues
- Potential race conditions

End with a brief summary and overall quality score (1-10).
Be specific: reference line numbers and variable names when possible.`;

function colorizeSeverity(line: string): string {
  if (line.startsWith('[ERROR]')) {
    return colors.severityError(' ERROR ') + ' ' + colors.error(line.replace('[ERROR] ', ''));
  }
  if (line.startsWith('[WARNING]')) {
    return colors.severityWarning(' WARN  ') + ' ' + colors.warning(line.replace('[WARNING] ', ''));
  }
  if (line.startsWith('[INFO]')) {
    return colors.severityInfo(' INFO  ') + ' ' + colors.info(line.replace('[INFO] ', ''));
  }
  return line;
}

async function reviewSingleFile(filePath: string): Promise<void> {
  const resolvedPath = path.resolve(filePath);
  console.log(`  ${colors.file(resolvedPath)}`);
  printDivider();

  const spinner = startSpinner('Analyzing code...');

  try {
    const { content, language } = readFileContent(filePath);
    const lineCount = content.split('\n').length;

    printInfo(`Language: ${language} | Lines: ${lineCount}`);
    console.log();

    const userMessage = `Review this ${language} file (${path.basename(filePath)}):\n\n\`\`\`${language}\n${content}\n\`\`\``;

    let fullResponse = '';

    const response = await askAI(REVIEW_SYSTEM_PROMPT, userMessage, {
      onToken(token: string) {
        stopSpinner(spinner);
        fullResponse += token;
      },
      onComplete(text: string) {
        // Format the complete response with colorized severity
        const lines = text.split('\n');
        console.log();
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('[ERROR]') || trimmed.startsWith('[WARNING]') || trimmed.startsWith('[INFO]')) {
            console.log(`  ${colorizeSeverity(trimmed)}`);
          } else if (trimmed.startsWith('```')) {
            console.log(colors.dim(`  ${trimmed}`));
          } else if (trimmed) {
            console.log(`  ${colors.ai(trimmed)}`);
          } else {
            console.log();
          }
        }
        console.log();
      },
      onError(error: Error) {
        stopSpinner(spinner, error.message, false);
      },
    });
  } catch (err: any) {
    stopSpinner(spinner, err.message, false);
    console.error(colors.error(`  Error: ${err.message}`));
  }
}

async function reviewDirectory(): Promise<void> {
  const cwd = process.cwd();
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp'];
  const ignorePatterns = ['node_modules', 'dist', 'build', '.git', '__pycache__', '.next'];

  const files: string[] = [];

  function scanDir(dir: string, depth: number = 0): void {
    if (depth > 3) return; // Max depth
    if (files.length >= 10) return; // Max files

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (ignorePatterns.some(p => entry.name.includes(p))) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath, depth + 1);
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch { /* skip inaccessible dirs */ }
  }

  scanDir(cwd);

  if (files.length === 0) {
    console.log(colors.warning('  No reviewable files found in current directory.'));
    return;
  }

  printInfo(`Found ${files.length} file(s) to review`);
  console.log();

  for (const file of files.slice(0, 5)) {
    await reviewSingleFile(file);
    printDivider();
  }
}

export async function reviewCommand(filePath?: string): Promise<void> {
  printHeader('Orion Code Review');

  if (filePath) {
    await reviewSingleFile(filePath);
  } else {
    printInfo('Scanning current directory for files to review...');
    await reviewDirectory();
  }
}
