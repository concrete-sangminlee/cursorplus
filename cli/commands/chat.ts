/**
 * Orion CLI - Interactive Chat Command
 * REPL-style AI chat with streaming, history, and colorized output
 */

import * as readline from 'readline';
import chalk from 'chalk';
import { streamChat, getProviderInfo, createTerminalStreamCallbacks, type AIMessage } from '../ai-client.js';
import {
  colors,
  printHeader,
  printDivider,
  printInfo,
  startSpinner,
  stopSpinner,
  getCurrentDirectoryContext,
} from '../utils.js';

const SYSTEM_PROMPT = `You are Orion, an expert AI coding assistant running in a terminal CLI.
You help developers with coding questions, debugging, architecture, and best practices.

Guidelines:
- Be concise but thorough
- Use code examples when helpful
- Format code in markdown code blocks with language tags
- When suggesting file changes, show the relevant code
- Be direct and actionable

Current workspace context:
`;

const HELP_TEXT = `
${colors.label('Chat Commands:')}
  ${colors.command('/help')}     Show this help message
  ${colors.command('/clear')}    Clear conversation history
  ${colors.command('/model')}    Show current AI model
  ${colors.command('/exit')}     Exit the chat session

${colors.label('Tips:')}
  - Type your message and press Enter to send
  - For multi-line input, end with an empty line
  - Code in responses is highlighted in yellow
`;

export async function chatCommand(): Promise<void> {
  printHeader('Orion Interactive Chat');

  const providerInfo = await getProviderInfo();
  printInfo(`Provider: ${colors.secondary(providerInfo.provider)} | Model: ${colors.secondary(providerInfo.model)}`);
  printInfo(`Type ${colors.command('/help')} for commands, ${colors.command('/exit')} to quit`);
  console.log();

  const history: AIMessage[] = [];
  const context = getCurrentDirectoryContext();
  const systemMessage: AIMessage = {
    role: 'system',
    content: SYSTEM_PROMPT + context,
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
    terminal: true,
  });

  function prompt(): void {
    process.stdout.write(`\n${colors.user('You:')} `);
  }

  function handleSlashCommand(cmd: string): boolean {
    const command = cmd.trim().toLowerCase();

    switch (command) {
      case '/exit':
      case '/quit':
      case '/q':
        console.log(`\n${colors.dim('Goodbye! Happy coding.')}\n`);
        rl.close();
        process.exit(0);
        return true;

      case '/clear':
        history.length = 0;
        console.log(colors.success('  Conversation history cleared.'));
        prompt();
        return true;

      case '/model':
        getProviderInfo().then(info => {
          printInfo(`Provider: ${colors.secondary(info.provider)} | Model: ${colors.secondary(info.model)}`);
          prompt();
        });
        return true;

      case '/help':
        console.log(HELP_TEXT);
        prompt();
        return true;

      default:
        if (command.startsWith('/')) {
          console.log(colors.warning(`  Unknown command: ${command}. Type /help for available commands.`));
          prompt();
          return true;
        }
        return false;
    }
  }

  async function processInput(input: string): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed) {
      prompt();
      return;
    }

    if (handleSlashCommand(trimmed)) return;

    // Add user message to history
    history.push({ role: 'user', content: trimmed });

    // Show spinner while waiting for first token
    const spinner = startSpinner('Thinking...');
    let firstToken = true;

    try {
      const messages: AIMessage[] = [systemMessage, ...history];

      process.stdout.write(`\n${colors.label('Orion:')} `);

      const response = await streamChat(messages, {
        onToken(token: string) {
          if (firstToken) {
            stopSpinner(spinner);
            firstToken = false;
          }

          // Detect and colorize code blocks
          process.stdout.write(colors.ai(token));
        },
        onComplete(fullText: string) {
          if (firstToken) stopSpinner(spinner);
          process.stdout.write('\n');
          // Add assistant response to history
          history.push({ role: 'assistant', content: fullText });
        },
        onError(error: Error) {
          stopSpinner(spinner, error.message, false);
        },
      });
    } catch (err: any) {
      if (firstToken) stopSpinner(spinner, err.message, false);
      console.error(colors.error(`\n  Error: ${err.message}`));
    }

    prompt();
  }

  // Start the chat loop
  prompt();

  rl.on('line', (line: string) => {
    processInput(line);
  });

  rl.on('close', () => {
    console.log(`\n${colors.dim('Session ended.')}\n`);
    process.exit(0);
  });
}
