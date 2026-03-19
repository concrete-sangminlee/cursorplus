/**
 * Orion CLI - Run Command
 * Execute shell commands with AI-powered error analysis and auto-fix suggestions.
 *
 * Usage:
 *   orion run "npm test"             # Run command, AI analyzes errors
 *   orion run "npm run build"        # Run build, AI explains failures
 *   orion run --fix "cargo build"    # Auto-apply AI's suggested fix
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import { askAI } from '../ai-client.js';
import {
  colors,
  printHeader,
  printInfo,
  printSuccess,
  printError,
  startSpinner,
  stopSpinner,
  writeFileContent,
  loadProjectContext,
  getCurrentDirectoryContext,
} from '../utils.js';
import { renderMarkdown } from '../markdown.js';
import {
  createStreamHandler,
  createSilentStreamHandler,
} from '../shared.js';
import { getPipelineOptions, jsonOutput } from '../pipeline.js';
import { commandHeader, divider, palette, statusLine, box } from '../ui.js';

// ─── Prompts ────────────────────────────────────────────────────────────────

const ERROR_ANALYSIS_PROMPT = `You are Orion, an expert developer assistant. A user ran a shell command that failed.

Analyze the error output and provide:
1. **Root Cause**: A clear explanation of why the command failed
2. **Fix**: Step-by-step instructions to resolve the issue
3. **Prevention**: How to avoid this in the future

Be concise, practical, and specific. Reference exact error messages and line numbers when available.
If the error involves missing dependencies, typos, or configuration issues, be explicit about the fix.`;

const AUTO_FIX_PROMPT = `You are Orion, an expert developer assistant. A user ran a shell command that failed.

Analyze the error and provide a fix. If the fix involves modifying a file, output:
---FILE: <filepath>---
<complete fixed file content>
---END FILE---

You may output multiple file blocks if multiple files need changes.
If the fix involves running a command instead, output:
---COMMAND---
<command to run>
---END COMMAND---

Provide a brief explanation before the fix blocks.`;

// ─── Types ──────────────────────────────────────────────────────────────────

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
  duration: number;
}

interface FileFix {
  filepath: string;
  content: string;
}

interface CommandFix {
  command: string;
}

// ─── Command Execution ──────────────────────────────────────────────────────

function executeCommand(command: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';

    // Use shell to support complex commands (pipes, &&, etc.)
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
      process.stdout.write(palette.dim(text));
    });

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(palette.red(text));
    });

    child.on('close', (code: number | null) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
        command,
        duration: Date.now() - startTime,
      });
    });

    child.on('error', (err: Error) => {
      resolve({
        stdout,
        stderr: stderr + '\n' + err.message,
        exitCode: 1,
        command,
        duration: Date.now() - startTime,
      });
    });
  });
}

// ─── Parse AI Fix Response ──────────────────────────────────────────────────

function parseFixResponse(response: string): { explanation: string; files: FileFix[]; commands: CommandFix[] } {
  const files: FileFix[] = [];
  const commands: CommandFix[] = [];
  const explanationParts: string[] = [];

  const lines = response.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check for file fix blocks
    const fileMatch = line.match(/^---FILE:\s*(.+?)\s*---$/);
    if (fileMatch) {
      const filepath = fileMatch[1];
      const contentLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^---END FILE---$/)) {
        contentLines.push(lines[i]);
        i++;
      }
      files.push({ filepath, content: contentLines.join('\n') });
      i++;
      continue;
    }

    // Check for command fix blocks
    if (line.match(/^---COMMAND---$/)) {
      const cmdLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^---END COMMAND---$/)) {
        cmdLines.push(lines[i]);
        i++;
      }
      commands.push({ command: cmdLines.join('\n').trim() });
      i++;
      continue;
    }

    explanationParts.push(line);
    i++;
  }

  return {
    explanation: explanationParts.join('\n').trim(),
    files,
    commands,
  };
}

// ─── Main Command ───────────────────────────────────────────────────────────

export async function runCommand(command: string, options: { fix?: boolean } = {}): Promise<void> {
  const autoFix = options.fix || false;

  console.log(commandHeader('Orion Run', [
    ['Command', colors.command(command)],
    ['Mode', autoFix ? 'auto-fix enabled' : 'analyze on failure'],
  ]));
  console.log();

  // Execute the command
  const result = await executeCommand(command);
  console.log();

  const durationStr = `${(result.duration / 1000).toFixed(1)}s`;

  if (result.exitCode === 0) {
    // Success
    console.log(statusLine('\u2713', `Command completed successfully ${palette.dim(`(${durationStr})`)}`));
    console.log();
    jsonOutput('run_result', {
      command: result.command,
      exitCode: 0,
      duration: durationStr,
      success: true,
    });
    return;
  }

  // Command failed - analyze with AI
  console.log(statusLine('\u2717', `Command failed with exit code ${result.exitCode} ${palette.dim(`(${durationStr})`)}`));
  console.log();

  const spinner = startSpinner('Analyzing error with AI...');

  try {
    const projectContext = loadProjectContext();
    const dirContext = getCurrentDirectoryContext();

    // Build user message with full context
    const errorOutput = [
      result.stderr,
      result.stdout,
    ].filter(Boolean).join('\n');

    // Truncate output if too long (keep last 3000 chars which usually has the relevant error)
    const maxOutput = 3000;
    const truncatedOutput = errorOutput.length > maxOutput
      ? '... (truncated)\n' + errorOutput.slice(-maxOutput)
      : errorOutput;

    const userMessage = [
      `Command: ${result.command}`,
      `Exit code: ${result.exitCode}`,
      `Working directory context:\n${dirContext}`,
      `\nOutput:\n\`\`\`\n${truncatedOutput}\n\`\`\``,
    ].join('\n');

    const systemPrompt = autoFix ? AUTO_FIX_PROMPT : ERROR_ANALYSIS_PROMPT;
    const fullPrompt = projectContext
      ? systemPrompt + '\n\nProject context:\n' + projectContext
      : systemPrompt;

    if (autoFix) {
      // Auto-fix mode: collect response silently, then parse and apply
      const { callbacks, getResponse } = createSilentStreamHandler(spinner, 'Analysis complete');
      await askAI(fullPrompt, userMessage, callbacks);

      const response = getResponse();
      const { explanation, files, commands: fixCommands } = parseFixResponse(response);

      // Show explanation
      if (explanation) {
        console.log();
        console.log(divider('AI Diagnosis'));
        console.log(renderMarkdown(explanation));
      }

      // Apply file fixes
      if (files.length > 0) {
        console.log(divider('File Fixes'));
        console.log();

        const pipelineOpts = getPipelineOptions();
        let applyAll: boolean;

        if (pipelineOpts.yes) {
          applyAll = true;
        } else {
          const answer = await inquirer.prompt([{
            type: 'confirm',
            name: 'apply',
            message: `Apply ${files.length} file fix(es)?`,
            default: false,
          }]);
          applyAll = answer.apply;
        }

        if (applyAll) {
          for (const fix of files) {
            try {
              writeFileContent(fix.filepath, fix.content);
              printSuccess(`Fixed: ${colors.file(fix.filepath)}`);
            } catch (err: any) {
              printError(`Could not write ${fix.filepath}: ${err.message}`);
            }
          }
        } else {
          printInfo('Fixes not applied. Review the suggestions above.');
        }
        console.log();
      }

      // Show command fixes
      if (fixCommands.length > 0) {
        console.log(divider('Suggested Commands'));
        console.log();
        for (const fix of fixCommands) {
          console.log(`  ${palette.dim('$')} ${colors.command(fix.command)}`);
        }
        console.log();
      }

      jsonOutput('run_result', {
        command: result.command,
        exitCode: result.exitCode,
        duration: durationStr,
        success: false,
        fixesApplied: files.length,
        suggestedCommands: fixCommands.length,
      });
    } else {
      // Analysis-only mode: stream the AI response with markdown
      const { callbacks } = createStreamHandler(spinner, {
        label: 'AI Diagnosis',
        markdown: true,
      });

      await askAI(fullPrompt, userMessage, callbacks);
      console.log();

      jsonOutput('run_result', {
        command: result.command,
        exitCode: result.exitCode,
        duration: durationStr,
        success: false,
      });
    }
  } catch (err: any) {
    stopSpinner(spinner, err.message, false);
    printError(`AI analysis failed: ${err.message}`);
    printInfo('Run `orion config` to check your AI provider settings.');
    console.log();
    process.exit(1);
  }
}
