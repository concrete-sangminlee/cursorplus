/**
 * Orion CLI - AI-Enhanced Interactive Shell
 * Natural language to shell command translator with execution confirmation.
 *
 * Usage:
 *   orion shell                # Start AI-enhanced shell
 *
 * Features:
 *   - Type natural language, AI translates to shell commands
 *   - Shows the command before executing and asks for confirmation
 *   - Captures output and can answer follow-up questions about it
 *   - Type !command to run directly without AI translation
 *   - Cross-platform: detects Windows vs Unix and generates appropriate commands
 *
 * Examples:
 *   "find all TODO comments"       -> grep -rn "TODO" --include="*.ts" .
 *   "what's using port 3000"       -> lsof -i :3000 / netstat -ano | findstr :3000
 *   "disk usage of this folder"    -> du -sh .
 */

import * as readline from 'readline';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { askAI } from '../ai-client.js';
import {
  colors,
  printHeader,
  printInfo,
  printSuccess,
  printError,
  printWarning,
  startSpinner,
  stopSpinner,
  getCurrentDirectoryContext,
  loadProjectContext,
} from '../utils.js';
import { renderMarkdown } from '../markdown.js';
import {
  commandHeader,
  divider,
  palette,
  statusLine,
  box,
} from '../ui.js';
import { createSilentStreamHandler } from '../shared.js';
import { jsonOutput } from '../pipeline.js';

// ─── Prompts ────────────────────────────────────────────────────────────────

const TRANSLATE_PROMPT = `You are Orion Shell, an expert at translating natural language into shell commands.

Rules:
- Output ONLY the shell command, nothing else. No explanation, no markdown, no backticks.
- If the user's request maps to a single command or pipeline, output exactly that.
- If multiple commands are needed, chain them with && or ;
- Detect the platform from the context and use appropriate commands:
  - Windows: use cmd/PowerShell commands (dir, findstr, netstat, tasklist, etc.)
  - macOS/Linux: use standard Unix commands (ls, grep, lsof, ps, etc.)
- Be precise. Prefer common, safe commands.
- Never output destructive commands (rm -rf /, format, del /s, etc.) unless the user's intent is crystal clear and scoped.
- If the request is ambiguous or dangerous, output a safe alternative with a comment.
- For file searches, prefer recursive grep/find with appropriate flags.
- Always quote paths and patterns that may contain spaces.

Current workspace context:
`;

const FOLLOWUP_PROMPT = `You are Orion Shell, an AI assistant running in an interactive shell session.
The user previously ran a command and now has a follow-up question about the output.
Be concise and helpful. Reference specific lines from the output when relevant.
Format your response for terminal display - keep it brief and actionable.

Current workspace context:
`;

// ─── Types ──────────────────────────────────────────────────────────────────

interface ShellHistoryEntry {
  type: 'natural' | 'direct';
  input: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ─── Command Execution ─────────────────────────────────────────────────────

function executeShellCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd' : '/bin/sh';
    const shellFlag = isWindows ? '/c' : '-c';

    const child = spawn(shell, [shellFlag, command], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(palette.red(text));
    });

    child.on('close', (code: number | null) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    child.on('error', (err: Error) => {
      resolve({ stdout, stderr: stderr + '\n' + err.message, exitCode: 1 });
    });
  });
}

// ─── Main Command ───────────────────────────────────────────────────────────

export async function shellCommand(): Promise<void> {
  printHeader('Orion AI Shell');

  const platform = process.platform === 'win32' ? 'Windows'
    : process.platform === 'darwin' ? 'macOS'
    : 'Linux';

  console.log();
  printInfo(`Platform: ${palette.white(platform)}`);
  printInfo(`Type natural language and AI will translate to shell commands.`);
  printInfo(`Type ${colors.command('!command')} to run a command directly.`);
  printInfo(`Type ${colors.command('/help')} for more options.`);
  console.log();

  const context = getCurrentDirectoryContext();
  const projectContext = loadProjectContext();
  const platformNote = `\nPlatform: ${platform} (${process.platform})\nShell: ${process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/sh'}\n`;

  const fullContext = platformNote + context + (projectContext ? '\nProject context:\n' + projectContext : '');

  const history: ShellHistoryEntry[] = [];
  let lastOutput = '';
  let lastCommand = '';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
    terminal: true,
  });

  function prompt(): void {
    process.stdout.write(`\n  ${palette.purple('\u2726')} ${palette.violet.bold('orion')} ${palette.dim('\u276F')} `);
  }

  const HELP_TEXT = `
${colors.label('Orion Shell Commands:')}
  ${palette.dim('Type any natural language')}  AI translates to a shell command
  ${colors.command('!<command>')}               Run a shell command directly (bypass AI)
  ${colors.command('/history')}                 Show command history
  ${colors.command('/clear')}                   Clear history
  ${colors.command('/help')}                    Show this help
  ${colors.command('/exit')}                    Exit the shell

${colors.label('Examples:')}
  ${palette.dim('"find all TODO comments in TypeScript files"')}
  ${palette.dim('"show git log for the last 5 commits"')}
  ${palette.dim('"what processes are using port 3000"')}
  ${palette.dim('"list all files larger than 1MB"')}
  ${palette.dim('"!git status"')}  ${palette.dim('(runs directly)')}
`;

  function handleSlashCommand(input: string): boolean {
    const cmd = input.trim().toLowerCase();

    switch (cmd) {
      case '/exit':
      case '/quit':
      case '/q':
        console.log(`\n${colors.dim('  Shell session ended.')}\n`);
        rl.close();
        process.exit(0);
        return true;

      case '/help':
        console.log(HELP_TEXT);
        prompt();
        return true;

      case '/history':
        if (history.length === 0) {
          printInfo('No commands in history yet.');
        } else {
          console.log();
          console.log(colors.label('  Command History:'));
          console.log();
          for (let i = 0; i < history.length; i++) {
            const entry = history[i];
            const icon = entry.exitCode === 0 ? palette.green('\u2713') : palette.red('\u2717');
            const typeTag = entry.type === 'direct' ? palette.dim('[direct]') : palette.dim('[ai]');
            console.log(`  ${palette.dim(String(i + 1).padStart(3))} ${icon} ${typeTag} ${colors.command(entry.command)}`);
          }
        }
        console.log();
        prompt();
        return true;

      case '/clear':
        history.length = 0;
        lastOutput = '';
        lastCommand = '';
        printSuccess('History cleared.');
        prompt();
        return true;

      default:
        if (cmd.startsWith('/')) {
          printWarning(`Unknown command: ${cmd}. Type /help for options.`);
          prompt();
          return true;
        }
        return false;
    }
  }

  async function askConfirmation(question: string): Promise<boolean> {
    return new Promise((resolve) => {
      const confirmRl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });

      confirmRl.question(question, (answer) => {
        confirmRl.close();
        const trimmed = answer.trim().toLowerCase();
        resolve(trimmed === '' || trimmed === 'y' || trimmed === 'yes');
      });
    });
  }

  async function processInput(input: string): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed) {
      prompt();
      return;
    }

    // Handle slash commands
    if (handleSlashCommand(trimmed)) return;

    // Direct command execution with !prefix
    if (trimmed.startsWith('!')) {
      const directCmd = trimmed.slice(1).trim();
      if (!directCmd) {
        printWarning('Usage: !<command> (e.g., !git status)');
        prompt();
        return;
      }

      console.log();
      console.log(`  ${palette.dim('$')} ${colors.command(directCmd)}`);
      console.log();

      const result = await executeShellCommand(directCmd);

      const entry: ShellHistoryEntry = {
        type: 'direct',
        input: trimmed,
        command: directCmd,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
      history.push(entry);
      lastOutput = result.stdout + result.stderr;
      lastCommand = directCmd;

      console.log();
      if (result.exitCode === 0) {
        console.log(statusLine('\u2713' as any, palette.dim(`exit code: ${result.exitCode}`)));
      } else {
        console.log(statusLine('\u2717' as any, `exit code: ${result.exitCode}`));
      }

      jsonOutput('shell_execute', {
        type: 'direct',
        command: directCmd,
        exitCode: result.exitCode,
      });

      prompt();
      return;
    }

    // Check if this looks like a follow-up question about previous output
    const isFollowUp = lastOutput && isFollowUpQuestion(trimmed);

    if (isFollowUp) {
      // Answer a follow-up question about the last command's output
      const spinner = startSpinner('Thinking...');

      try {
        const userMessage = [
          `Previous command: ${lastCommand}`,
          `Output:\n\`\`\`\n${truncateOutput(lastOutput, 3000)}\n\`\`\``,
          `\nUser question: ${trimmed}`,
        ].join('\n');

        const { callbacks, getResponse } = createSilentStreamHandler(spinner, 'Done');
        await askAI(FOLLOWUP_PROMPT + fullContext, userMessage, callbacks);

        const response = getResponse();
        console.log();
        console.log(renderMarkdown(response));
      } catch (err: any) {
        stopSpinner(spinner, err.message, false);
        printError(`AI error: ${err.message}`);
      }

      prompt();
      return;
    }

    // AI translation: natural language -> shell command
    const spinner = startSpinner('Translating...');

    try {
      const userMessage = trimmed;
      const { callbacks, getResponse } = createSilentStreamHandler(spinner);
      await askAI(TRANSLATE_PROMPT + fullContext, userMessage, callbacks);

      let command = getResponse().trim();

      // Strip markdown code fences if AI included them
      command = command.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
      // Strip leading $ or > prompt characters
      command = command.replace(/^\$\s+/, '').replace(/^>\s+/, '').trim();

      if (!command) {
        printWarning('AI could not translate that into a command.');
        prompt();
        return;
      }

      // Show the translated command
      console.log();
      console.log(`  ${palette.dim('Translated command:')}`);
      console.log(`  ${palette.dim('$')} ${palette.yellow.bold(command)}`);
      console.log();

      // Ask for confirmation
      const confirmed = await askConfirmation(`  ${palette.violet('Run this?')} ${palette.dim('(Y/n)')} `);

      if (!confirmed) {
        printInfo('Skipped. Type your next request or refine the query.');
        prompt();
        return;
      }

      // Execute the command
      console.log();
      const result = await executeShellCommand(command);

      const entry: ShellHistoryEntry = {
        type: 'natural',
        input: trimmed,
        command,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
      history.push(entry);
      lastOutput = result.stdout + result.stderr;
      lastCommand = command;

      console.log();
      if (result.exitCode === 0) {
        console.log(statusLine('\u2713' as any, palette.dim(`exit code: ${result.exitCode}`)));
      } else {
        console.log(statusLine('\u2717' as any, `exit code: ${result.exitCode}`));
        printInfo('Ask a follow-up question or try a different approach.');
      }

      jsonOutput('shell_execute', {
        type: 'ai_translated',
        naturalLanguage: trimmed,
        command,
        exitCode: result.exitCode,
      });
    } catch (err: any) {
      stopSpinner(spinner, err.message, false);
      printError(`AI translation failed: ${err.message}`);
      printInfo('Run `orion config` to check your AI provider settings.');
    }

    prompt();
  }

  // Start the REPL
  prompt();

  rl.on('line', (line: string) => {
    processInput(line);
  });

  rl.on('close', () => {
    console.log(`\n${colors.dim('  Shell session ended.')}\n`);
    process.exit(0);
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Heuristic to detect if user input is a follow-up question about previous output.
 */
function isFollowUpQuestion(input: string): boolean {
  const lower = input.toLowerCase();
  const followUpPatterns = [
    /^(what|why|how|where|which|who|when|explain|tell me|show me|can you)/,
    /^(is there|are there|does it|do they|did it)/,
    /\?$/,
    /^(about|regarding|from) (the|that|this|those)/,
    /(the output|the result|the error|that error|those lines)/,
    /^(count|sum|total|average|how many)/,
    /^(filter|sort|extract|pick|get the)/,
  ];

  return followUpPatterns.some(p => p.test(lower));
}

/**
 * Truncate long output, keeping the last N characters.
 */
function truncateOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output;
  return '... (truncated)\n' + output.slice(-maxChars);
}
