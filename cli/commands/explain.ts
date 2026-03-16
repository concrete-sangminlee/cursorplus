/**
 * Orion CLI - File Explanation Command
 * AI-powered code explanation with streaming output
 */

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
  fileExists,
} from '../utils.js';

const EXPLAIN_SYSTEM_PROMPT = `You are Orion, an expert code explainer. Explain what the provided file does clearly and concisely.

Structure your explanation as:
1. **Overview** - What this file/module does in 1-2 sentences
2. **Key Components** - Main functions, classes, exports
3. **How It Works** - The logic flow and important patterns
4. **Dependencies** - Notable imports and external dependencies
5. **Usage** - How this file is typically used

Use simple language. Be thorough but not verbose.
Format using markdown for readability.`;

export async function explainCommand(filePath: string): Promise<void> {
  printHeader('Orion Code Explainer');

  const resolvedPath = path.resolve(filePath);

  if (!fileExists(filePath)) {
    console.error(colors.error(`  File not found: ${resolvedPath}`));
    process.exit(1);
  }

  const { content, language } = readFileContent(filePath);
  const lineCount = content.split('\n').length;

  printInfo(`File: ${colors.file(resolvedPath)}`);
  printInfo(`Language: ${language} | Lines: ${lineCount}`);
  printDivider();
  console.log();

  const spinner = startSpinner('Analyzing code...');
  let firstToken = true;

  try {
    const userMessage = `Explain this ${language} file (${path.basename(filePath)}):\n\n\`\`\`${language}\n${content}\n\`\`\``;

    await askAI(EXPLAIN_SYSTEM_PROMPT, userMessage, {
      onToken(token: string) {
        if (firstToken) {
          stopSpinner(spinner);
          firstToken = false;
          process.stdout.write('  ');
        }
        process.stdout.write(colors.ai(token));
      },
      onComplete() {
        if (firstToken) stopSpinner(spinner);
        console.log('\n');
      },
      onError(error: Error) {
        stopSpinner(spinner, error.message, false);
      },
    });
  } catch (err: any) {
    if (firstToken) stopSpinner(spinner, err.message, false);
    console.error(colors.error(`  Error: ${err.message}`));
    process.exit(1);
  }
}
