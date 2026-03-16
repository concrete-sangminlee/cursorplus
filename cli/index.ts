#!/usr/bin/env node

/**
 * Orion CLI - AI-Powered Coding Assistant
 *
 * A premium terminal tool for AI-assisted development.
 * Supports Anthropic Claude, OpenAI GPT, and local Ollama models.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { printBanner, colors } from './utils.js';
import { chatCommand } from './commands/chat.js';
import { askCommand } from './commands/ask.js';
import { reviewCommand } from './commands/review.js';
import { commitCommand } from './commands/commit.js';
import { editCommand } from './commands/edit.js';
import { explainCommand } from './commands/explain.js';
import { fixCommand } from './commands/fix.js';
import { configCommand, initCommand } from './commands/config.js';

// ─── Program Setup ──────────────────────────────────────────────────────────

const program = new Command();

program
  .name('orion')
  .version('2.0.0', '-v, --version', 'Show Orion CLI version')
  .description('AI-powered coding assistant for the terminal')
  .addHelpText('beforeAll', () => {
    printBanner();
    return '';
  });

// ─── Commands ────────────────────────────────────────────────────────────────

program
  .command('chat')
  .description('Start an interactive AI chat session')
  .action(async () => {
    try {
      await chatCommand();
    } catch (err: any) {
      console.error(colors.error(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('ask <question>')
  .description('Ask a quick one-shot question')
  .action(async (question: string) => {
    try {
      await askCommand(question);
    } catch (err: any) {
      console.error(colors.error(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('edit <file>')
  .description('AI-assisted file editing')
  .action(async (file: string) => {
    try {
      await editCommand(file);
    } catch (err: any) {
      console.error(colors.error(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('review [file]')
  .description('AI code review (file or current directory)')
  .action(async (file?: string) => {
    try {
      await reviewCommand(file);
    } catch (err: any) {
      console.error(colors.error(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('commit')
  .description('Generate AI commit message from staged changes')
  .action(async () => {
    try {
      await commitCommand();
    } catch (err: any) {
      console.error(colors.error(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('explain <file>')
  .description('AI-powered code explanation')
  .action(async (file: string) => {
    try {
      await explainCommand(file);
    } catch (err: any) {
      console.error(colors.error(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('fix <file>')
  .description('Find and fix issues in a file')
  .action(async (file: string) => {
    try {
      await fixCommand(file);
    } catch (err: any) {
      console.error(colors.error(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize Orion config in current project')
  .action(async () => {
    try {
      await initCommand();
    } catch (err: any) {
      console.error(colors.error(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('gui')
  .description('Launch the Orion desktop app (Electron)')
  .action(() => {
    console.log();
    console.log(colors.primary.bold('  Launching Orion IDE...'));
    console.log();

    try {
      const { execSync } = require('child_process');
      execSync('npm run electron:dev', {
        stdio: 'inherit',
        cwd: __dirname.includes('dist-cli')
          ? require('path').resolve(__dirname, '..')
          : process.cwd(),
      });
    } catch {
      console.log(colors.warning('  Could not launch Electron app.'));
      console.log(colors.dim('  Make sure you are in the Orion project directory.'));
      console.log(colors.dim('  Run: npm run electron:dev'));
    }
  });

program
  .command('config')
  .description('Configure API keys and preferences')
  .action(async () => {
    try {
      await configCommand();
    } catch (err: any) {
      console.error(colors.error(`Error: ${err.message}`));
      process.exit(1);
    }
  });

// ─── Default Action (no command) ─────────────────────────────────────────────

program.action(() => {
  printBanner();

  console.log(chalk.bold('  Commands:'));
  console.log();
  console.log(`    ${colors.command('orion chat')}              Interactive AI chat session`);
  console.log(`    ${colors.command('orion ask')} ${colors.dim('"question"')}    Quick one-shot AI question`);
  console.log(`    ${colors.command('orion edit')} ${colors.dim('<file>')}       AI-assisted file editing`);
  console.log(`    ${colors.command('orion review')} ${colors.dim('[file]')}     AI code review`);
  console.log(`    ${colors.command('orion commit')}             Generate AI commit message`);
  console.log(`    ${colors.command('orion explain')} ${colors.dim('<file>')}    Explain what a file does`);
  console.log(`    ${colors.command('orion fix')} ${colors.dim('<file>')}        Find and fix issues`);
  console.log(`    ${colors.command('orion init')}               Initialize Orion config`);
  console.log(`    ${colors.command('orion gui')}                Launch desktop app`);
  console.log(`    ${colors.command('orion config')}             Configure API keys`);
  console.log();
  console.log(colors.dim('  Run orion <command> --help for more info on a command.'));
  console.log();
});

// ─── Parse & Run ─────────────────────────────────────────────────────────────

program.parse(process.argv);
