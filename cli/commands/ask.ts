/**
 * Orion CLI - Quick Ask Command
 * One-shot AI question with streaming response
 */

import chalk from 'chalk';
import { askAI, createTerminalStreamCallbacks } from '../ai-client.js';
import {
  colors,
  printDivider,
  startSpinner,
  stopSpinner,
  getCurrentDirectoryContext,
} from '../utils.js';

const SYSTEM_PROMPT = `You are Orion, an expert AI coding assistant.
Answer the user's question concisely and accurately.
Use code examples when helpful, formatted in markdown code blocks.
Be direct - this is a quick question mode, not a conversation.

Workspace context:
`;

export async function askCommand(question: string): Promise<void> {
  if (!question.trim()) {
    console.error(colors.error('  Please provide a question.'));
    console.log(colors.dim('  Usage: orion ask "How do I sort an array in TypeScript?"'));
    process.exit(1);
  }

  console.log();
  console.log(`  ${colors.user('Q:')} ${question}`);
  printDivider();

  const spinner = startSpinner('Thinking...');
  let firstToken = true;

  const context = getCurrentDirectoryContext();

  try {
    process.stdout.write(`\n  ${colors.label('Orion:')} `);

    await askAI(SYSTEM_PROMPT + context, question, {
      onToken(token: string) {
        if (firstToken) {
          stopSpinner(spinner);
          firstToken = false;
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
    console.error(colors.error(`\n  Error: ${err.message}`));
    process.exit(1);
  }
}
