/**
 * Orion CLI - Environment Management Command
 * Manage, validate, and analyze environment variables for your project.
 *
 * Usage:
 *   orion env check                   # Check all env vars used in codebase
 *   orion env suggest                 # AI suggests needed env vars for project
 *   orion env template                # Generate .env.example from .env
 *   orion env validate                # Validate .env against .env.example
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
  stopSpinner,
  loadProjectContext,
  getCurrentDirectoryContext,
  detectLanguage,
} from '../utils.js';
import { createStreamHandler, printCommandError } from '../shared.js';
import { commandHeader, divider, box, palette } from '../ui.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '__pycache__', '.cache', 'coverage', '.nyc_output', '.turbo',
  '.svelte-kit', '.output', 'target', 'vendor', '.venv', 'venv',
  'env', '.tox', '.eggs', '.orion',
]);

const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw',
  '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp', '.cs',
  '.rb', '.php', '.swift', '.kt', '.scala',
  '.sh', '.bash', '.zsh', '.ps1',
  '.yaml', '.yml', '.toml', '.ini', '.cfg',
  '.vue', '.svelte', '.astro',
  '.dart', '.ex', '.exs', '.erl',
  '.dockerfile',
]);

const MAX_FILE_SIZE = 512 * 1024;
const MAX_FILES = 5000;

// Patterns for detecting env var usage across languages
const ENV_PATTERNS = [
  // JavaScript/TypeScript: process.env.VAR_NAME or process.env['VAR_NAME']
  { regex: /process\.env\.([A-Z_][A-Z0-9_]*)/g, lang: 'js/ts' },
  { regex: /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g, lang: 'js/ts' },
  // Python: os.environ['VAR'], os.environ.get('VAR'), os.getenv('VAR')
  { regex: /os\.environ\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g, lang: 'python' },
  { regex: /os\.environ\.get\(\s*['"]([A-Z_][A-Z0-9_]*)['"]/g, lang: 'python' },
  { regex: /os\.getenv\(\s*['"]([A-Z_][A-Z0-9_]*)['"]/g, lang: 'python' },
  // Ruby: ENV['VAR'] or ENV.fetch('VAR')
  { regex: /ENV\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g, lang: 'ruby' },
  { regex: /ENV\.fetch\(\s*['"]([A-Z_][A-Z0-9_]*)['"]/g, lang: 'ruby' },
  // Go: os.Getenv("VAR")
  { regex: /os\.Getenv\(\s*["']([A-Z_][A-Z0-9_]*)["']\)/g, lang: 'go' },
  // Rust: std::env::var("VAR") or env::var("VAR")
  { regex: /env::var\(\s*["']([A-Z_][A-Z0-9_]*)["']\)/g, lang: 'rust' },
  // Java: System.getenv("VAR")
  { regex: /System\.getenv\(\s*["']([A-Z_][A-Z0-9_]*)["']\)/g, lang: 'java' },
  // Shell: $VAR_NAME or ${VAR_NAME}
  { regex: /\$\{([A-Z_][A-Z0-9_]*)\}/g, lang: 'shell' },
  { regex: /\$([A-Z_][A-Z0-9_]*)/g, lang: 'shell' },
  // Docker/docker-compose: ${VAR_NAME}
  { regex: /\$\{([A-Z_][A-Z0-9_]*)(?::-[^}]*)?\}/g, lang: 'docker' },
  // .NET: Environment.GetEnvironmentVariable("VAR")
  { regex: /Environment\.GetEnvironmentVariable\(\s*["']([A-Z_][A-Z0-9_]*)["']\)/g, lang: 'dotnet' },
  // PHP: getenv('VAR') or $_ENV['VAR']
  { regex: /getenv\(\s*['"]([A-Z_][A-Z0-9_]*)['"]\)/g, lang: 'php' },
  { regex: /\$_ENV\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g, lang: 'php' },
];

// ─── System Prompts ──────────────────────────────────────────────────────────

const SUGGEST_SYSTEM_PROMPT = `You are Orion, an expert at analyzing projects and determining required environment variables.
Analyze the project context and suggest all environment variables that would be needed.

For each variable provide:
1. **Variable name** (e.g., DATABASE_URL)
2. **Purpose** - what it's used for
3. **Required** - whether it's required or optional
4. **Example value** - a safe example (never real secrets)
5. **Category** - group by: Database, Auth, API Keys, App Config, Cloud/Deploy, etc.

Format your response in clear markdown with categories as headers.
Be thorough - consider common patterns for the detected tech stack.`;

// ─── Types ───────────────────────────────────────────────────────────────────

interface EnvVarUsage {
  name: string;
  files: { file: string; line: number; pattern: string }[];
  count: number;
}

interface EnvEntry {
  key: string;
  value: string;
  hasValue: boolean;
}

// ─── File Discovery ──────────────────────────────────────────────────────────

function discoverFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string, depth: number): void {
    if (depth > 8 || files.length >= MAX_FILES) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      const name = entry.name;

      if (name.startsWith('.') && !name.startsWith('.env') && !name.startsWith('.docker')) {
        if (IGNORE_DIRS.has(name)) continue;
      }

      const fullPath = path.join(currentDir, name);

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(name)) {
          walk(fullPath, depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(name).toLowerCase();
        if (SCANNABLE_EXTENSIONS.has(ext) || name === 'Dockerfile' || name === 'Makefile' || name === 'docker-compose.yml' || name === 'docker-compose.yaml') {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size <= MAX_FILE_SIZE) {
              files.push(fullPath);
            }
          } catch { /* skip */ }
        }
      }
    }
  }

  walk(dir, 0);
  return files;
}

// ─── Env Var Scanner ─────────────────────────────────────────────────────────

function scanEnvVars(files: string[]): Map<string, EnvVarUsage> {
  const usages = new Map<string, EnvVarUsage>();
  const cwd = process.cwd();

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    const relPath = path.relative(cwd, file);

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];

      for (const pattern of ENV_PATTERNS) {
        // Reset regex state
        pattern.regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.regex.exec(line)) !== null) {
          const varName = match[1];

          // Skip very short or common non-env vars
          if (varName.length < 2) continue;

          const existing = usages.get(varName) || {
            name: varName,
            files: [],
            count: 0,
          };

          existing.files.push({
            file: relPath,
            line: lineIdx + 1,
            pattern: pattern.lang,
          });
          existing.count++;
          usages.set(varName, existing);
        }
      }
    }
  }

  return usages;
}

// ─── .env File Parser ────────────────────────────────────────────────────────

function parseEnvFile(filePath: string): EnvEntry[] {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  const entries: EnvEntry[] = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();

    // Remove surrounding quotes
    const cleanValue = value.replace(/^['"](.*)['"]$/, '$1');

    entries.push({
      key,
      value: cleanValue,
      hasValue: cleanValue.length > 0,
    });
  }

  return entries;
}

// ─── Subcommands ─────────────────────────────────────────────────────────────

/**
 * orion env check - Scan codebase for all env var usage
 */
async function envCheck(): Promise<void> {
  console.log(commandHeader('Orion Environment Check', [
    ['Directory', process.cwd()],
    ['Action', 'Scan codebase for environment variable usage'],
  ]));
  console.log();

  const spinner = startSpinner('Scanning project files...');
  const cwd = process.cwd();
  const files = discoverFiles(cwd);
  stopSpinner(spinner, `Scanned ${files.length} files`);

  const scanSpinner = startSpinner('Detecting environment variables...');
  const usages = scanEnvVars(files);
  stopSpinner(scanSpinner, `Found ${usages.size} unique environment variables`);
  console.log();

  if (usages.size === 0) {
    printInfo('No environment variable usage detected in the codebase.');
    console.log();
    return;
  }

  // Sort by frequency
  const sorted = [...usages.values()].sort((a, b) => b.count - a.count);

  // Display results
  console.log(`  ${colors.label('Environment Variables Used:')}`);
  console.log(divider('Variables'));
  console.log();

  for (const usage of sorted) {
    const fileSet = new Set(usage.files.map(f => f.file));
    const fileCount = fileSet.size;
    const langs = new Set(usage.files.map(f => f.pattern));

    console.log(`  ${palette.yellow.bold(usage.name)}`);
    console.log(`    ${palette.dim(`Used ${usage.count} time(s) in ${fileCount} file(s) [${[...langs].join(', ')}]`)}`);

    // Show up to 3 file references
    const uniqueFiles = [...fileSet].slice(0, 3);
    for (const file of uniqueFiles) {
      const fileUsages = usage.files.filter(f => f.file === file);
      const lineNums = fileUsages.map(f => f.line).join(', ');
      console.log(`    ${palette.dim('\u2514')} ${colors.file(file)} ${palette.dim(`(line${fileUsages.length > 1 ? 's' : ''} ${lineNums})`)}`);
    }
    if (fileSet.size > 3) {
      console.log(`    ${palette.dim(`\u2514 ...and ${fileSet.size - 3} more file(s)`)}`);
    }
    console.log();
  }

  // Check if .env exists
  const envPath = path.join(cwd, '.env');
  const envExamplePath = path.join(cwd, '.env.example');

  console.log(divider('Status'));
  console.log();
  console.log(`  ${colors.label('.env file:')} ${fs.existsSync(envPath) ? palette.green('Found') : palette.yellow('Not found')}`);
  console.log(`  ${colors.label('.env.example:')} ${fs.existsSync(envExamplePath) ? palette.green('Found') : palette.yellow('Not found')}`);
  console.log(`  ${colors.label('Variables found:')} ${usages.size}`);
  console.log(`  ${colors.label('Total references:')} ${[...usages.values()].reduce((sum, u) => sum + u.count, 0)}`);
  console.log();
}

/**
 * orion env suggest - AI suggests needed env vars for project
 */
async function envSuggest(): Promise<void> {
  console.log(commandHeader('Orion Environment Suggestion', [
    ['Directory', process.cwd()],
    ['Action', 'AI analyzes project and suggests env vars'],
  ]));
  console.log();

  // Gather project context
  const contextSpinner = startSpinner('Analyzing project structure...');

  const cwd = process.cwd();
  const context = getCurrentDirectoryContext();
  const projectContext = loadProjectContext();

  // Scan existing env vars
  const files = discoverFiles(cwd);
  const usages = scanEnvVars(files);

  // Read package.json or other manifests for stack detection
  let manifest = '';
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      manifest = fs.readFileSync(pkgPath, 'utf-8');
    } catch { /* ignore */ }
  }

  // Read existing .env if present
  let existingEnv = '';
  const envPath = path.join(cwd, '.env');
  if (fs.existsSync(envPath)) {
    const entries = parseEnvFile(envPath);
    existingEnv = entries.map(e => e.key).join(', ');
  }

  stopSpinner(contextSpinner, 'Project analysis complete');

  // Build user message
  const existingVars = [...usages.keys()].join(', ');
  const userMessage = [
    `Project context:\n${context}`,
    manifest ? `\nPackage manifest:\n${manifest}` : '',
    existingVars ? `\nEnvironment variables already used in code: ${existingVars}` : '',
    existingEnv ? `\nVariables already in .env: ${existingEnv}` : '',
    '\nAnalyze this project and suggest all environment variables that should be configured.',
    'Include both currently used vars and any that are commonly needed for this tech stack.',
  ].join('\n');

  const spinner = startSpinner('AI is analyzing your project...');

  const fullPrompt = projectContext
    ? SUGGEST_SYSTEM_PROMPT + '\n\nProject context:\n' + projectContext
    : SUGGEST_SYSTEM_PROMPT;

  const { callbacks } = createStreamHandler(spinner, {
    label: 'Suggested Environment Variables:',
    markdown: true,
  });

  try {
    await askAI(fullPrompt, userMessage, callbacks);
    console.log();
  } catch (err: any) {
    printCommandError(err, 'env suggest', 'Run `orion config` to check your AI provider settings.');
    process.exit(1);
  }
}

/**
 * orion env template - Generate .env.example from .env
 */
async function envTemplate(): Promise<void> {
  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');
  const examplePath = path.join(cwd, '.env.example');

  console.log(commandHeader('Orion Environment Template', [
    ['Directory', cwd],
    ['Action', 'Generate .env.example from .env'],
  ]));
  console.log();

  if (!fs.existsSync(envPath)) {
    printError('.env file not found in current directory.');
    printInfo('Create a .env file first, or run `orion env suggest` for guidance.');
    console.log();
    process.exit(1);
  }

  const entries = parseEnvFile(envPath);

  if (entries.length === 0) {
    printError('.env file is empty or contains no valid entries.');
    console.log();
    process.exit(1);
  }

  // Generate .env.example with keys but no values
  const templateLines: string[] = [
    '# Environment Configuration',
    '# Copy this file to .env and fill in the values',
    `# Generated by Orion CLI on ${new Date().toISOString().split('T')[0]}`,
    '',
  ];

  // Group by common prefixes for organization
  const groups = new Map<string, EnvEntry[]>();
  for (const entry of entries) {
    // Extract category from prefix (e.g., DB_ -> Database, API_ -> API)
    const prefix = entry.key.split('_')[0];
    const existing = groups.get(prefix) || [];
    existing.push(entry);
    groups.set(prefix, existing);
  }

  for (const [prefix, groupEntries] of groups) {
    if (groups.size > 1 && groupEntries.length > 1) {
      templateLines.push(`# ${prefix}`);
    }
    for (const entry of groupEntries) {
      templateLines.push(`${entry.key}=`);
    }
    if (groups.size > 1 && groupEntries.length > 1) {
      templateLines.push('');
    }
  }

  const templateContent = templateLines.join('\n') + '\n';

  // Show preview
  console.log(`  ${colors.label('Preview (.env.example):')}`);
  console.log(divider('Template'));
  for (const line of templateContent.split('\n')) {
    if (line.startsWith('#')) {
      console.log(`  ${palette.dim(line)}`);
    } else if (line.includes('=')) {
      const [key] = line.split('=');
      console.log(`  ${palette.yellow(key)}${palette.dim('=')}`);
    }
  }
  console.log(divider('End'));
  console.log();

  // Write the file
  const existsAlready = fs.existsSync(examplePath);
  fs.writeFileSync(examplePath, templateContent, 'utf-8');

  if (existsAlready) {
    printSuccess(`Updated ${colors.file('.env.example')} (${entries.length} variables)`);
  } else {
    printSuccess(`Created ${colors.file('.env.example')} (${entries.length} variables)`);
  }

  console.log();
  console.log(`  ${colors.label('Variables:')} ${entries.length}`);
  console.log(`  ${colors.label('Output:')} ${colors.file(examplePath)}`);
  console.log();

  printInfo('Remember to add .env to .gitignore and commit .env.example');
  console.log();
}

/**
 * orion env validate - Validate .env against .env.example
 */
async function envValidate(): Promise<void> {
  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');
  const examplePath = path.join(cwd, '.env.example');

  console.log(commandHeader('Orion Environment Validator', [
    ['Directory', cwd],
    ['Action', 'Validate .env against .env.example'],
  ]));
  console.log();

  if (!fs.existsSync(examplePath)) {
    printError('.env.example not found.');
    printInfo('Run `orion env template` to generate one from your .env file.');
    console.log();
    process.exit(1);
  }

  const exampleEntries = parseEnvFile(examplePath);
  const envEntries = fs.existsSync(envPath) ? parseEnvFile(envPath) : [];

  if (exampleEntries.length === 0) {
    printError('.env.example is empty or contains no valid entries.');
    console.log();
    process.exit(1);
  }

  const envKeys = new Set(envEntries.map(e => e.key));
  const exampleKeys = new Set(exampleEntries.map(e => e.key));

  // Find missing, extra, and empty vars
  const missing: string[] = [];
  const empty: string[] = [];
  const extra: string[] = [];
  const valid: string[] = [];

  for (const entry of exampleEntries) {
    if (!envKeys.has(entry.key)) {
      missing.push(entry.key);
    } else {
      const envEntry = envEntries.find(e => e.key === entry.key);
      if (envEntry && !envEntry.hasValue) {
        empty.push(entry.key);
      } else {
        valid.push(entry.key);
      }
    }
  }

  for (const entry of envEntries) {
    if (!exampleKeys.has(entry.key)) {
      extra.push(entry.key);
    }
  }

  // Display results
  const hasEnv = fs.existsSync(envPath);

  if (!hasEnv) {
    printError('.env file not found.');
    printInfo('All variables from .env.example are missing.');
    console.log();
    for (const key of [...exampleKeys]) {
      console.log(`  ${palette.red('\u2717')} ${palette.yellow(key)} ${palette.dim('- missing')}`);
    }
    console.log();
    process.exit(1);
  }

  // Show valid vars
  if (valid.length > 0) {
    console.log(`  ${colors.label('Valid:')}`);
    for (const key of valid) {
      console.log(`  ${palette.green('\u2713')} ${key}`);
    }
    console.log();
  }

  // Show empty vars
  if (empty.length > 0) {
    console.log(`  ${colors.label('Empty (defined but no value):')}`);
    for (const key of empty) {
      console.log(`  ${palette.yellow('!')} ${key}`);
    }
    console.log();
  }

  // Show missing vars
  if (missing.length > 0) {
    console.log(`  ${colors.label('Missing (in .env.example but not in .env):')}`);
    for (const key of missing) {
      console.log(`  ${palette.red('\u2717')} ${key}`);
    }
    console.log();
  }

  // Show extra vars
  if (extra.length > 0) {
    console.log(`  ${colors.label('Extra (in .env but not in .env.example):')}`);
    for (const key of extra) {
      console.log(`  ${palette.blue('+')} ${key}`);
    }
    console.log();
  }

  // Summary
  console.log(divider('Summary'));
  console.log();
  console.log(`  ${colors.label('Required (.env.example):')} ${exampleKeys.size}`);
  console.log(`  ${colors.label('Configured (.env):')} ${envKeys.size}`);
  console.log(`  ${colors.label('Valid:')} ${palette.green(String(valid.length))}`);
  if (empty.length > 0) {
    console.log(`  ${colors.label('Empty:')} ${palette.yellow(String(empty.length))}`);
  }
  if (missing.length > 0) {
    console.log(`  ${colors.label('Missing:')} ${palette.red(String(missing.length))}`);
  }
  if (extra.length > 0) {
    console.log(`  ${colors.label('Extra:')} ${palette.blue(String(extra.length))}`);
  }
  console.log();

  // Exit with error if there are missing vars
  if (missing.length > 0) {
    printError(`${missing.length} required variable(s) missing from .env`);
    console.log();
    process.exit(1);
  } else if (empty.length > 0) {
    printWarning(`All variables present, but ${empty.length} have empty values.`);
    console.log();
  } else {
    printSuccess('All environment variables are properly configured.');
    console.log();
  }
}

// ─── Command Entry Point ────────────────────────────────────────────────────

export async function envCommand(action: string): Promise<void> {
  if (!action || !action.trim()) {
    console.log();
    printError('Please specify an action.');
    console.log(`  ${palette.dim('Usage:')}`);
    console.log(`    ${colors.command('orion env check')}       ${palette.dim('Check all env vars used in codebase')}`);
    console.log(`    ${colors.command('orion env suggest')}     ${palette.dim('AI suggests needed env vars')}`);
    console.log(`    ${colors.command('orion env template')}    ${palette.dim('Generate .env.example from .env')}`);
    console.log(`    ${colors.command('orion env validate')}    ${palette.dim('Validate .env against .env.example')}`);
    console.log();
    process.exit(1);
  }

  switch (action.toLowerCase()) {
    case 'check':
      await envCheck();
      break;
    case 'suggest':
      await envSuggest();
      break;
    case 'template':
      await envTemplate();
      break;
    case 'validate':
      await envValidate();
      break;
    default:
      console.log();
      printError(`Unknown action: "${action}"`);
      console.log(`  ${palette.dim('Available actions: check, suggest, template, validate')}`);
      console.log();
      process.exit(1);
  }
}
