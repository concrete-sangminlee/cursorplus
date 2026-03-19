/**
 * Orion CLI - AI Content Summarizer Command
 * Summarize files, directories, or piped content with AI-powered analysis.
 *
 * Usage:
 *   orion summarize src/                   # Summarize a directory/project
 *   orion summarize src/auth.ts            # Summarize a file
 *   orion summarize --meeting notes.md     # Summarize meeting notes
 *   cat long-doc.md | orion summarize      # Summarize piped content
 */

import * as fs from 'fs';
import * as path from 'path';
import { askAI } from '../ai-client.js';
import {
  colors,
  printInfo,
  printError,
  printWarning,
  startSpinner,
  readFileContent,
  fileExists,
  loadProjectContext,
} from '../utils.js';
import { createStreamHandler, readAndValidateFile, printCommandError } from '../shared.js';
import { readStdin } from '../stdin.js';
import { commandHeader, divider, palette } from '../ui.js';

// ─── System Prompts ─────────────────────────────────────────────────────────

function buildSystemPrompt(options: SummarizeCommandOptions): string {
  const lengthInstructions: Record<string, string> = {
    short: 'Keep the summary very concise - 3 to 5 sentences maximum.',
    medium: 'Provide a balanced summary - around 1 to 2 paragraphs.',
    long: 'Provide a thorough, detailed summary covering all important aspects.',
  };

  const lengthGuide = lengthInstructions[options.length || 'medium'];

  const bulletInstruction = options.bullet
    ? 'Format the output as bullet points. Use markdown bullet lists exclusively.'
    : 'Use clear markdown formatting with headings and paragraphs.';

  if (options.meeting) {
    return `You are Orion, an expert at summarizing meeting notes and discussions.

Given meeting notes, produce a structured summary including:
1. **Key Decisions** - What was decided
2. **Action Items** - What needs to be done and by whom (if mentioned)
3. **Discussion Points** - Main topics discussed
4. **Follow-ups** - Items needing follow-up

${lengthGuide}
${bulletInstruction}
Output ONLY the summary in markdown format.`;
  }

  return `You are Orion, an expert content summarizer. Produce a clear, accurate summary of the provided content.

Rules:
1. Identify the main purpose and key points.
2. Highlight important details, patterns, or notable elements.
3. ${lengthGuide}
4. ${bulletInstruction}
5. Output ONLY the summary in markdown format.`;
}

const DIRECTORY_SYSTEM_PROMPT = `You are Orion, an expert software architect. Given a project's directory structure and key file contents, generate a clear project overview.

Provide:
1. **Project Overview** - What this project is and its purpose
2. **Architecture** - How the project is structured
3. **Key Components** - Important modules, files, and their roles
4. **Tech Stack** - Languages, frameworks, and tools identified
5. **Entry Points** - Main entry files and how to get started

Use markdown formatting. Be concise but thorough.`;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SummarizeCommandOptions {
  meeting?: boolean;
  bullet?: boolean;
  length?: 'short' | 'medium' | 'long';
}

// ─── Directory Scanning ─────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.orion', 'dist', 'build', 'out',
  '.next', '.nuxt', '__pycache__', '.venv', 'venv',
  'coverage', '.cache', '.turbo', '.vercel',
]);

const KEY_FILES = new Set([
  'package.json', 'tsconfig.json', 'README.md', 'readme.md',
  'Cargo.toml', 'go.mod', 'pyproject.toml', 'requirements.txt',
  'Makefile', 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.env.example', 'setup.py', 'pom.xml', 'build.gradle',
]);

interface DirectoryScan {
  tree: string;
  keyFileContents: string;
  fileCount: number;
  dirCount: number;
}

function scanDirectory(dirPath: string, maxDepth = 4): DirectoryScan {
  const resolvedDir = path.resolve(dirPath);
  const treeLines: string[] = [];
  const keyContents: string[] = [];
  let fileCount = 0;
  let dirCount = 0;

  function walk(currentPath: string, prefix: string, depth: number): void {
    if (depth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    // Sort: directories first, then files
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    // Filter out ignored directories and hidden files at depth > 0
    const filtered = entries.filter((e) => {
      if (e.isDirectory() && IGNORE_DIRS.has(e.name)) return false;
      if (e.name.startsWith('.') && depth > 0 && e.name !== '.env.example') return false;
      return true;
    });

    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      const isLast = i === filtered.length - 1;
      const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
      const childPrefix = isLast ? '    ' : '\u2502   ';

      if (entry.isDirectory()) {
        dirCount++;
        treeLines.push(`${prefix}${connector}${entry.name}/`);
        walk(path.join(currentPath, entry.name), prefix + childPrefix, depth + 1);
      } else {
        fileCount++;
        treeLines.push(`${prefix}${connector}${entry.name}`);

        // Capture key file contents
        if (KEY_FILES.has(entry.name) && keyContents.length < 5) {
          try {
            const filePath = path.join(currentPath, entry.name);
            const content = fs.readFileSync(filePath, 'utf-8');
            // Limit content size
            const truncated = content.length > 2000
              ? content.substring(0, 2000) + '\n... (truncated)'
              : content;
            const relativePath = path.relative(resolvedDir, filePath);
            keyContents.push(`--- ${relativePath} ---\n${truncated}`);
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }

  treeLines.push(path.basename(resolvedDir) + '/');
  walk(resolvedDir, '', 0);

  return {
    tree: treeLines.join('\n'),
    keyFileContents: keyContents.join('\n\n'),
    fileCount,
    dirCount,
  };
}

// ─── Main Command ───────────────────────────────────────────────────────────

export async function summarizeCommand(
  target?: string,
  options: SummarizeCommandOptions = {}
): Promise<void> {
  // Check for piped stdin data
  const stdinData = await readStdin();

  let userMessage: string;
  let systemPrompt: string;
  let headerMeta: [string, string][] = [];

  if (target) {
    const resolvedTarget = path.resolve(target);

    // Check if target is a directory
    if (fs.existsSync(resolvedTarget) && fs.statSync(resolvedTarget).isDirectory()) {
      // Directory summarization
      const spinner = startSpinner('Scanning directory structure...');

      const scan = scanDirectory(resolvedTarget);
      spinner.succeed(palette.green(
        `Scanned ${scan.fileCount} file(s) in ${scan.dirCount} director${scan.dirCount === 1 ? 'y' : 'ies'}`
      ));

      headerMeta = [
        ['Target', colors.file(resolvedTarget)],
        ['Type', 'Directory'],
        ['Files', String(scan.fileCount)],
        ['Directories', String(scan.dirCount)],
      ];
      if (options.length) headerMeta.push(['Length', options.length]);
      if (options.bullet) headerMeta.push(['Format', 'Bullet points']);

      console.log(commandHeader('Orion Summarizer', headerMeta));
      console.log();

      systemPrompt = DIRECTORY_SYSTEM_PROMPT;
      userMessage = `Summarize this project directory:\n\nDirectory structure:\n${scan.tree}`;
      if (scan.keyFileContents) {
        userMessage += `\n\nKey file contents:\n${scan.keyFileContents}`;
      }
    } else if (fileExists(target)) {
      // File summarization
      const file = readAndValidateFile(target);
      if (!file) {
        process.exit(1);
        return;
      }

      headerMeta = [
        ['File', colors.file(file.resolvedPath)],
        ['Language', `${file.language} \u00B7 ${file.lineCount} lines`],
      ];
      if (options.meeting) headerMeta.push(['Mode', 'Meeting Notes']);
      if (options.length) headerMeta.push(['Length', options.length]);
      if (options.bullet) headerMeta.push(['Format', 'Bullet points']);

      console.log(commandHeader('Orion Summarizer', headerMeta));
      console.log();

      systemPrompt = buildSystemPrompt(options);

      const contentLabel = options.meeting ? 'meeting notes' : `${file.language} file`;
      userMessage = `Summarize this ${contentLabel} (${file.fileName}):\n\n\`\`\`${file.language}\n${file.content}\n\`\`\``;
    } else {
      // Target does not exist
      console.log();
      printError(`Target not found: ${resolvedTarget}`);
      printInfo('Provide a valid file path, directory path, or pipe content via stdin.');
      console.log(`  ${palette.dim('Usage: orion summarize <file-or-directory>')}`);
      console.log(`  ${palette.dim('       cat document.md | orion summarize')}`);
      console.log();
      process.exit(1);
      return;
    }
  } else if (stdinData) {
    // Piped input summarization
    const lineCount = stdinData.split('\n').length;

    headerMeta = [
      ['Source', 'piped input'],
      ['Lines', String(lineCount)],
    ];
    if (options.meeting) headerMeta.push(['Mode', 'Meeting Notes']);
    if (options.length) headerMeta.push(['Length', options.length]);
    if (options.bullet) headerMeta.push(['Format', 'Bullet points']);

    console.log(commandHeader('Orion Summarizer', headerMeta));
    console.log();

    systemPrompt = buildSystemPrompt(options);

    const contentLabel = options.meeting ? 'meeting notes' : 'content';
    userMessage = `Summarize this ${contentLabel}:\n\n${stdinData}`;
  } else {
    // No input provided
    console.log();
    printError('Please provide a file, directory, or pipe content via stdin.');
    console.log(`  ${palette.dim('Usage: orion summarize <file-or-directory>')}`);
    console.log(`  ${palette.dim('       orion summarize src/')}`);
    console.log(`  ${palette.dim('       orion summarize README.md')}`);
    console.log(`  ${palette.dim('       orion summarize --meeting notes.md')}`);
    console.log(`  ${palette.dim('       cat long-doc.md | orion summarize')}`);
    console.log();
    process.exit(1);
    return;
  }

  // Send to AI
  const aiSpinner = startSpinner('AI is generating summary...');

  try {
    const projectContext = loadProjectContext();
    const fullSystemPrompt = projectContext
      ? systemPrompt + '\n\nProject context:\n' + projectContext
      : systemPrompt;

    const { callbacks } = createStreamHandler(aiSpinner, {
      markdown: true,
    });

    await askAI(fullSystemPrompt, userMessage, callbacks);
    console.log();
  } catch (err: any) {
    printCommandError(err, 'summarize', 'Run `orion config` to check your AI provider settings.');
    process.exit(1);
  }
}
