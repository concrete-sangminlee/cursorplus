/**
 * Orion CLI - AI-Powered Dependency Analyzer
 * Analyzes project dependencies for security issues, outdated packages, and unused deps.
 * Supports: package.json, requirements.txt, Cargo.toml, go.mod
 */

import * as fs from 'fs';
import * as path from 'path';
import { askAI } from '../ai-client.js';
import {
  colors,
  printInfo,
  printSuccess,
  printError,
  printWarning,
  startSpinner,
  loadProjectContext,
} from '../utils.js';
import { createSilentStreamHandler, createStreamHandler, printCommandError } from '../shared.js';
import { getPipelineOptions, jsonOutput } from '../pipeline.js';
import { commandHeader, divider, statusLine, palette } from '../ui.js';
import { renderMarkdown } from '../markdown.js';

// ─── System Prompts ──────────────────────────────────────────────────────────

const DEPS_GENERAL_PROMPT = `You are Orion, an expert dependency analyzer. Analyze the provided dependency manifest and provide a comprehensive overview.

For each dependency, assess:
1. Purpose - what does it do
2. Category - runtime, dev-only, build tool, testing, etc.
3. Health - well-maintained, deprecated, or concerning

Output format (use these exact markers):

### Dependency Overview

[CATEGORY: Runtime]
- **<package>** (v<version>) - <brief purpose>
[CATEGORY: Development]
- **<package>** (v<version>) - <brief purpose>
[CATEGORY: Build/Tooling]
- **<package>** (v<version>) - <brief purpose>

### Summary
- Total dependencies: <N>
- Runtime: <N>
- Development: <N>
- Potential concerns: <list any deprecated or problematic packages>

Keep descriptions brief (one line per dependency). Focus on actionable insights.`;

const DEPS_SECURITY_PROMPT = `You are Orion, a security-focused dependency auditor. Analyze the provided dependency manifest for security concerns.

Check for:
1. Known vulnerable packages (based on your knowledge)
2. Packages with a history of security issues
3. Packages that are abandoned/unmaintained (security risk)
4. Overly permissive version ranges that could pull in vulnerable versions
5. Suspicious or typosquatting package names

Output format (use these exact markers):

[CRITICAL] <package> - <security concern>
[HIGH] <package> - <security concern>
[MEDIUM] <package> - <security concern>
[LOW] <package> - <security concern>
[OK] No known security issues found (if applicable)

### Recommendations
- <actionable security recommendations>

### Version Range Concerns
- <any overly permissive version ranges like * or >=>0.0.0>

Be thorough but avoid false positives. Only flag packages with known or likely security concerns.`;

const DEPS_OUTDATED_PROMPT = `You are Orion, a dependency update advisor. Analyze the provided dependency manifest and identify packages that are likely outdated.

Based on your knowledge (up to your training date), identify:
1. Packages with known newer major versions available
2. Packages using very old versions
3. Packages that have been renamed or replaced by alternatives
4. Packages with version ranges that are significantly behind

Output format (use these exact markers):

[MAJOR] <package> <current> -> <latest known> - <what changed / migration notes>
[MINOR] <package> <current> -> <latest known> - <brief note>
[REPLACED] <package> -> <replacement> - <migration path>
[CURRENT] <package> - appears up to date

### Update Priority
1. <highest priority updates with rationale>
2. ...

Note: These suggestions are based on training data and may not reflect the absolute latest versions. Run your package manager's built-in audit/outdated command for precise results.`;

const DEPS_UNUSED_PROMPT = `You are Orion, a dependency cleanup advisor. Analyze the provided dependency manifest alongside the source file snippets to identify potentially unused dependencies.

Look for:
1. Dependencies declared but not imported/required in any source file
2. DevDependencies that appear unused (no matching config files or scripts)
3. Duplicate functionality (multiple packages doing the same thing)
4. Dependencies that could be replaced by built-in language features

Output format (use these exact markers):

[LIKELY UNUSED] <package> - not found in any source imports
[POSSIBLY UNUSED] <package> - found in config only, may not be needed
[DUPLICATE] <package1> and <package2> - both provide <functionality>
[REPLACEABLE] <package> - could use built-in <alternative>

### Cleanup Recommendations
- <actionable recommendations for removing or consolidating deps>

### Size Impact
- Estimated node_modules size reduction: <estimate>

Be conservative: only flag packages as "likely unused" if you are confident.`;

// ─── Dependency File Detection ───────────────────────────────────────────────

interface DependencyManifest {
  type: 'npm' | 'python' | 'rust' | 'go';
  filePath: string;
  content: string;
  label: string;
}

function detectDependencyManifest(): DependencyManifest | null {
  const cwd = process.cwd();

  // Check package.json (npm/yarn/pnpm)
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    return {
      type: 'npm',
      filePath: pkgPath,
      content: fs.readFileSync(pkgPath, 'utf-8'),
      label: 'package.json (npm)',
    };
  }

  // Check requirements.txt (Python)
  const reqPath = path.join(cwd, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    return {
      type: 'python',
      filePath: reqPath,
      content: fs.readFileSync(reqPath, 'utf-8'),
      label: 'requirements.txt (Python)',
    };
  }

  // Check pyproject.toml (Python)
  const pyprojectPath = path.join(cwd, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    return {
      type: 'python',
      filePath: pyprojectPath,
      content: fs.readFileSync(pyprojectPath, 'utf-8'),
      label: 'pyproject.toml (Python)',
    };
  }

  // Check Cargo.toml (Rust)
  const cargoPath = path.join(cwd, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    return {
      type: 'rust',
      filePath: cargoPath,
      content: fs.readFileSync(cargoPath, 'utf-8'),
      label: 'Cargo.toml (Rust)',
    };
  }

  // Check go.mod (Go)
  const goModPath = path.join(cwd, 'go.mod');
  if (fs.existsSync(goModPath)) {
    return {
      type: 'go',
      filePath: goModPath,
      content: fs.readFileSync(goModPath, 'utf-8'),
      label: 'go.mod (Go)',
    };
  }

  return null;
}

// ─── Source File Snippets (for unused detection) ─────────────────────────────

function collectImportSnippets(maxFiles = 100): string {
  const cwd = process.cwd();
  const sourceExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.rs', '.go',
  ]);
  const ignoreDirs = new Set(['node_modules', 'dist', 'build', '.git', '.orion', '__pycache__', '.next', 'coverage']);
  const snippets: string[] = [];
  let fileCount = 0;

  function walk(dir: string) {
    if (fileCount >= maxFiles) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (fileCount >= maxFiles) break;

      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) {
          walk(path.join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (sourceExtensions.has(ext)) {
          const fullPath = path.join(dir, entry.name);
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            // Extract only import/require lines to save tokens
            const importLines = content
              .split('\n')
              .filter(line => {
                const trimmed = line.trim();
                return trimmed.startsWith('import ') ||
                       trimmed.startsWith('from ') ||
                       trimmed.includes('require(') ||
                       trimmed.startsWith('use ') ||
                       (trimmed.startsWith('import ') && ext === '.go');
              })
              .join('\n');

            if (importLines.trim()) {
              const relative = path.relative(cwd, fullPath);
              snippets.push(`// ${relative}\n${importLines}`);
              fileCount++;
            }
          } catch { /* skip unreadable files */ }
        }
      }
    }
  }

  walk(cwd);
  return snippets.join('\n\n');
}

// ─── Main Command ────────────────────────────────────────────────────────────

export interface DepsCommandOptions {
  security?: boolean;
  outdated?: boolean;
  unused?: boolean;
}

export async function depsCommand(options: DepsCommandOptions): Promise<void> {
  const pipelineOpts = getPipelineOptions();

  // Determine analysis mode
  let mode = 'general';
  let modeLabel = 'General Analysis';
  if (options.security) { mode = 'security'; modeLabel = 'Security Audit'; }
  else if (options.outdated) { mode = 'outdated'; modeLabel = 'Outdated Check'; }
  else if (options.unused) { mode = 'unused'; modeLabel = 'Unused Detection'; }

  // Detect dependency manifest
  const manifest = detectDependencyManifest();

  if (!manifest) {
    console.log(commandHeader('Orion Deps'));
    console.log();
    printError('No dependency manifest found in the current directory.');
    console.log();
    printInfo('Supported files:');
    console.log(`    ${palette.dim('package.json')}       ${palette.dim('(npm/yarn/pnpm)')}`);
    console.log(`    ${palette.dim('requirements.txt')}   ${palette.dim('(Python pip)')}`);
    console.log(`    ${palette.dim('pyproject.toml')}     ${palette.dim('(Python)')}`);
    console.log(`    ${palette.dim('Cargo.toml')}         ${palette.dim('(Rust)')}`);
    console.log(`    ${palette.dim('go.mod')}             ${palette.dim('(Go)')}`);
    console.log();
    process.exit(1);
  }

  console.log(commandHeader('Orion Deps: ' + modeLabel, [
    ['Manifest', colors.file(manifest.filePath)],
    ['Type', manifest.label],
    ['Mode', palette.green(modeLabel)],
  ]));

  // Build the AI prompt
  const spinner = startSpinner(`Analyzing dependencies (${modeLabel.toLowerCase()})...`);

  try {
    let systemPrompt: string;
    let userMessage: string;

    switch (mode) {
      case 'security':
        systemPrompt = DEPS_SECURITY_PROMPT;
        userMessage = `Audit the following dependency manifest for security concerns:\n\nFile: ${path.basename(manifest.filePath)}\n\n\`\`\`\n${manifest.content}\n\`\`\``;
        break;

      case 'outdated':
        systemPrompt = DEPS_OUTDATED_PROMPT;
        userMessage = `Check for outdated packages in the following dependency manifest:\n\nFile: ${path.basename(manifest.filePath)}\n\n\`\`\`\n${manifest.content}\n\`\`\``;
        break;

      case 'unused': {
        systemPrompt = DEPS_UNUSED_PROMPT;
        spinner.text = 'Scanning source files for imports...';
        const importSnippets = collectImportSnippets();
        spinner.text = 'Analyzing dependencies for unused packages...';

        userMessage =
          `Identify unused dependencies.\n\n` +
          `Dependency manifest (${path.basename(manifest.filePath)}):\n\`\`\`\n${manifest.content}\n\`\`\`\n\n` +
          `Source file imports:\n\`\`\`\n${importSnippets || '(no source imports found)'}\n\`\`\``;
        break;
      }

      default:
        systemPrompt = DEPS_GENERAL_PROMPT;
        userMessage = `Analyze the following dependency manifest:\n\nFile: ${path.basename(manifest.filePath)}\n\n\`\`\`\n${manifest.content}\n\`\`\``;
    }

    const projectContext = loadProjectContext();
    const fullSystemPrompt = projectContext
      ? systemPrompt + '\n\nProject context:\n' + projectContext
      : systemPrompt;

    const { callbacks, getResponse } = createSilentStreamHandler(spinner, `${modeLabel} complete`);

    await askAI(fullSystemPrompt, userMessage, callbacks);

    const response = getResponse().trim();

    // Display results
    if (!pipelineOpts.quiet) {
      console.log();

      // For security mode, parse and colorize severity markers
      if (mode === 'security') {
        console.log(divider('Security Analysis'));
        console.log();

        const lines = response.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('[CRITICAL]')) {
            console.log(statusLine('\u2717' as any, palette.red.bold(trimmed)));
          } else if (trimmed.startsWith('[HIGH]')) {
            console.log(statusLine('\u2717' as any, palette.red(trimmed)));
          } else if (trimmed.startsWith('[MEDIUM]')) {
            console.log(statusLine('!' as any, palette.yellow(trimmed)));
          } else if (trimmed.startsWith('[LOW]')) {
            console.log(statusLine('i' as any, palette.blue(trimmed)));
          } else if (trimmed.startsWith('[OK]')) {
            console.log(statusLine('\u2713' as any, palette.green(trimmed)));
          } else {
            console.log(renderMarkdown(line));
          }
        }
      }
      // For outdated mode, colorize update markers
      else if (mode === 'outdated') {
        console.log(divider('Outdated Packages'));
        console.log();

        const lines = response.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('[MAJOR]')) {
            console.log(statusLine('!' as any, palette.red(trimmed)));
          } else if (trimmed.startsWith('[MINOR]')) {
            console.log(statusLine('!' as any, palette.yellow(trimmed)));
          } else if (trimmed.startsWith('[REPLACED]')) {
            console.log(statusLine('\u2717' as any, palette.orange(trimmed)));
          } else if (trimmed.startsWith('[CURRENT]')) {
            console.log(statusLine('\u2713' as any, palette.green(trimmed)));
          } else {
            console.log(renderMarkdown(line));
          }
        }
      }
      // For unused mode, colorize unused markers
      else if (mode === 'unused') {
        console.log(divider('Unused Dependencies'));
        console.log();

        const lines = response.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('[LIKELY UNUSED]')) {
            console.log(statusLine('\u2717' as any, palette.red(trimmed)));
          } else if (trimmed.startsWith('[POSSIBLY UNUSED]')) {
            console.log(statusLine('!' as any, palette.yellow(trimmed)));
          } else if (trimmed.startsWith('[DUPLICATE]')) {
            console.log(statusLine('!' as any, palette.orange(trimmed)));
          } else if (trimmed.startsWith('[REPLACEABLE]')) {
            console.log(statusLine('i' as any, palette.blue(trimmed)));
          } else {
            console.log(renderMarkdown(line));
          }
        }
      }
      // General mode - render as markdown
      else {
        console.log(renderMarkdown(response));
      }

      console.log();
    }

    jsonOutput('deps', {
      mode,
      manifest: manifest.filePath,
      type: manifest.type,
      analysis: response,
    });

  } catch (err: any) {
    printCommandError(err, 'deps', 'Run `orion config` to check your AI provider settings.');
    process.exit(1);
  }
}
