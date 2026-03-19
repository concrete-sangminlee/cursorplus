#!/usr/bin/env node

/**
 * Orion CLI - AI-Powered Coding Assistant
 *
 * A premium terminal tool for AI-assisted development.
 * Supports Anthropic Claude, OpenAI GPT, and local Ollama models.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { printBanner, colors, printError, printInfo } from './utils.js';
import { chatCommand } from './commands/chat.js';
import { askCommand } from './commands/ask.js';
import { reviewCommand } from './commands/review.js';
import { commitCommand } from './commands/commit.js';
import { editCommand } from './commands/edit.js';
import { explainCommand } from './commands/explain.js';
import { fixCommand } from './commands/fix.js';
import { configCommand, initCommand } from './commands/config.js';
import { agentCommand } from './commands/agent.js';
import { sessionCommand } from './commands/session.js';
import { watchCommand } from './commands/watch.js';
import { searchCommand } from './commands/search.js';
import { diffCommand } from './commands/diff.js';
import { runCommand } from './commands/run.js';
import { testCommand } from './commands/test.js';
import { undoCommand } from './commands/undo.js';
import { statusCommand } from './commands/status.js';
import { refactorCommand } from './commands/refactor.js';
import { doctorCommand } from './commands/doctor.js';
import { planCommand } from './commands/plan.js';
import { generateCommand } from './commands/generate.js';
import { shellCommand } from './commands/shell.js';
import { todoCommand } from './commands/todo.js';
import { changelogCommand } from './commands/changelog.js';
import { migrateCommand } from './commands/migrate.js';
import { depsCommand } from './commands/deps.js';
import { fetchCommand } from './commands/fetch.js';
import { setPipelineOptions } from './pipeline.js';
import { errorDisplay, palette } from './ui.js';

// ─── Error Handler Factory ──────────────────────────────────────────────────

function handleCommandError(err: any, command: string, suggestion?: string): void {
  const fixes = [];
  if (suggestion) fixes.push(suggestion);
  fixes.push(`Run ${colors.command(`orion ${command} --help`)} for usage.`);

  console.log(errorDisplay(
    err.message || 'An unexpected error occurred.',
    fixes
  ));
  console.log();
  process.exit(1);
}

// ─── Program Setup ──────────────────────────────────────────────────────────

const program = new Command();

program
  .name('orion')
  .version('2.0.0', '-v, --version', 'Show Orion CLI version')
  .description('AI-powered coding assistant for the terminal')
  .option('--json', 'Output structured JSON to stdout (for CI/CD pipelines)')
  .option('-y, --yes', 'Auto-confirm all prompts (non-interactive mode)')
  .option('--no-color', 'Disable color output')
  .option('--quiet', 'Minimal output')
  .option('--dry-run', 'Show what would be changed without writing files')
  .addHelpText('beforeAll', () => {
    printBanner();
    return '';
  })
  .hook('preAction', () => {
    const opts = program.opts();
    setPipelineOptions({
      json: opts.json || false,
      yes: opts.yes || false,
      noColor: opts.color === false,
      quiet: opts.quiet || false,
      dryRun: opts.dryRun || false,
    });
  });

// ─── Commands ────────────────────────────────────────────────────────────────

program
  .command('chat')
  .description('Start an interactive AI chat session')
  .action(async () => {
    try {
      await chatCommand();
    } catch (err: any) {
      handleCommandError(err, 'chat', 'Run `orion config` to set up API keys.');
    }
  });

program
  .command('ask <question>')
  .description('Ask a quick one-shot question (supports @file references)')
  .argument('[refs...]', 'Optional @file references for multi-file context')
  .action(async (question: string, refs: string[]) => {
    try {
      await askCommand(question, refs);
    } catch (err: any) {
      handleCommandError(err, 'ask', 'Ensure your AI provider is configured. Run `orion config`.');
    }
  });

program
  .command('edit <file>')
  .description('AI-assisted file editing')
  .option('--no-commit', 'Skip the auto-commit prompt after applying edits')
  .action(async (file: string, opts?: { commit?: boolean }) => {
    try {
      await editCommand(file, {
        noCommit: opts?.commit === false,
      });
    } catch (err: any) {
      handleCommandError(err, 'edit', 'Check that the file exists and your AI provider is configured.');
    }
  });

program
  .command('review [file]')
  .description('AI code review (file or current directory)')
  .action(async (file?: string) => {
    try {
      await reviewCommand(file);
    } catch (err: any) {
      handleCommandError(err, 'review', 'Ensure the file exists or run from a project directory.');
    }
  });

program
  .command('commit')
  .description('Generate AI commit message from staged changes')
  .action(async () => {
    try {
      await commitCommand();
    } catch (err: any) {
      handleCommandError(err, 'commit', 'Stage changes with `git add` first, then run `orion commit`.');
    }
  });

program
  .command('explain [file]')
  .description('AI-powered code explanation (accepts piped input)')
  .action(async (file?: string) => {
    try {
      await explainCommand(file);
    } catch (err: any) {
      handleCommandError(err, 'explain', 'Check that the file exists and your AI provider is configured.');
    }
  });

program
  .command('fix [file]')
  .description('Find and fix issues in a file (accepts piped input)')
  .option('--auto', 'Auto-run tests after fix; re-fix on failure (edit-lint-test loop)')
  .option('--max-iterations <n>', 'Max fix-test iterations for --auto (default: 3)')
  .option('--no-commit', 'Skip the auto-commit prompt after applying fixes')
  .action(async (file?: string, opts?: { auto?: boolean; maxIterations?: string; commit?: boolean }) => {
    try {
      await fixCommand(file, {
        auto: opts?.auto,
        maxIterations: opts?.maxIterations ? parseInt(opts.maxIterations, 10) : undefined,
        noCommit: opts?.commit === false,
      });
    } catch (err: any) {
      handleCommandError(err, 'fix', 'Check that the file exists and your AI provider is configured.');
    }
  });

program
  .command('run <command>')
  .description('Run a command with AI error analysis')
  .option('--fix', 'Auto-apply AI-suggested fixes on failure')
  .action(async (command: string, options: { fix?: boolean }) => {
    try {
      await runCommand(command, { fix: options.fix });
    } catch (err: any) {
      handleCommandError(err, 'run', 'Ensure your AI provider is configured. Run `orion config`.');
    }
  });

program
  .command('test')
  .description('Run tests with AI failure analysis or generate tests')
  .option('--generate <file>', 'Generate tests for a source file')
  .action(async (options: { generate?: string }) => {
    try {
      await testCommand({ generate: options.generate });
    } catch (err: any) {
      handleCommandError(err, 'test', 'Ensure your AI provider is configured. Run `orion config`.');
    }
  });

program
  .command('undo')
  .description('Undo last file change (restore from backup)')
  .option('--list', 'List available backups')
  .option('--file <file>', 'Undo a specific file')
  .option('--clean', 'Remove old backups (older than 7 days)')
  .action(async (options: { list?: boolean; file?: string; clean?: boolean }) => {
    try {
      await undoCommand(options);
    } catch (err: any) {
      handleCommandError(err, 'undo', 'Check that backups exist in .orion/backups/.');
    }
  });

program
  .command('status')
  .description('Show Orion environment status')
  .action(async () => {
    try {
      await statusCommand();
    } catch (err: any) {
      handleCommandError(err, 'status');
    }
  });

program
  .command('init')
  .description('Initialize Orion config in current project')
  .action(async () => {
    try {
      await initCommand();
    } catch (err: any) {
      handleCommandError(err, 'init', 'Make sure you have write permissions in the current directory.');
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
      console.log();
      printError('Could not launch Electron app.');
      printInfo('Make sure you are in the Orion project directory.');
      printInfo(`Run ${colors.command('npm run electron:dev')} manually.`);
      console.log();
    }
  });

program
  .command('config')
  .description('Configure API keys and preferences')
  .action(async () => {
    try {
      await configCommand();
    } catch (err: any) {
      handleCommandError(err, 'config', 'Check file permissions for ~/.orion/config.json.');
    }
  });

// ─── Multi-Agent & Competitive Features ──────────────────────────────────────

program
  .command('agent')
  .description('Run multiple AI tasks in parallel (multi-agent)')
  .argument('<tasks...>', 'Task descriptions to run in parallel')
  .option('--parallel <n>', 'Max concurrent tasks (default: 3)', '3')
  .option('--provider <name>', 'Force a specific AI provider for all tasks')
  .option('--no-save', 'Do not save results to .orion/agents/')
  .action(async (tasks: string[], options: { parallel?: string; provider?: string; save?: boolean }) => {
    try {
      await agentCommand(tasks, {
        parallel: parseInt(options.parallel || '3', 10),
        provider: options.provider,
        save: options.save,
      });
    } catch (err: any) {
      handleCommandError(err, 'agent', 'Ensure your AI provider is configured. Run `orion config`.');
    }
  });

program
  .command('session')
  .description('Manage named AI sessions')
  .argument('<action>', 'Action: new, list, resume, export, delete')
  .argument('[name]', 'Session name (required for new, resume, export, delete)')
  .action(async (action: string, name?: string) => {
    try {
      await sessionCommand(action, name);
    } catch (err: any) {
      handleCommandError(err, 'session', 'Check file permissions for ~/.orion/sessions/.');
    }
  });

program
  .command('watch')
  .description('Watch files and auto-run AI actions on change')
  .argument('<pattern>', 'Glob pattern for files to watch (e.g., "*.ts", "src/**")')
  .option('--on-change <action>', 'Action to run: review, fix, explain, ask (default: review)', 'review')
  .option('--debounce <ms>', 'Debounce delay in ms (default: 300)', '300')
  .option('--ignore <patterns>', 'Comma-separated ignore patterns', 'node_modules,dist,build,.git,.orion')
  .action(async (pattern: string, options: { onChange?: string; debounce?: string; ignore?: string }) => {
    try {
      await watchCommand(pattern, {
        onChange: options.onChange,
        debounce: parseInt(options.debounce || '300', 10),
        ignore: options.ignore,
      });
    } catch (err: any) {
      handleCommandError(err, 'watch', 'Ensure chokidar is installed and your AI provider is configured.');
    }
  });

// ─── Codebase-wide AI Operations ─────────────────────────────────────────────

program
  .command('search <pattern>')
  .description('Search codebase for a pattern and get AI analysis')
  .option('--type <type>', 'Filter by type: comment, code, all (default: all)', 'all')
  .option('--max <n>', 'Max results to return (default: 100)', '100')
  .option('--no-ai', 'Skip AI analysis, just show search results')
  .action(async (pattern: string, options: { type?: string; max?: string; ai?: boolean }) => {
    try {
      await searchCommand(pattern, {
        type: options.type,
        maxResults: parseInt(options.max || '100', 10),
        noAi: options.ai === false,
      });
    } catch (err: any) {
      handleCommandError(err, 'search', 'Ensure your AI provider is configured. Run `orion config`.');
    }
  });

program
  .command('diff [ref]')
  .description('Review git diff with AI analysis')
  .option('--staged', 'Review only staged changes')
  .action(async (ref: string | undefined, options: { staged?: boolean }) => {
    try {
      await diffCommand(ref, { staged: options.staged });
    } catch (err: any) {
      handleCommandError(err, 'diff', 'Ensure you are in a git repository and your AI provider is configured.');
    }
  });

// ─── Refactoring & Diagnostics ────────────────────────────────────────────

program
  .command('refactor <target>')
  .description('AI-powered code refactoring (rename, extract, simplify, unused)')
  .option('--rename <names...>', 'Rename a symbol across the codebase (oldName newName)')
  .option('--extract <name>', 'Extract code into a new function')
  .option('--simplify', 'Simplify complex code')
  .option('--unused', 'Find unused exports and imports')
  .action(async (target: string, options: { rename?: string[]; extract?: string; simplify?: boolean; unused?: boolean }) => {
    try {
      await refactorCommand(target, {
        rename: options.rename,
        extract: options.extract,
        simplify: options.simplify,
        unused: options.unused,
      });
    } catch (err: any) {
      handleCommandError(err, 'refactor', 'Ensure the file/directory exists and your AI provider is configured.');
    }
  });

program
  .command('doctor')
  .description('Run a full health check of the Orion environment')
  .action(async () => {
    try {
      await doctorCommand();
    } catch (err: any) {
      handleCommandError(err, 'doctor');
    }
  });

// ─── Planning & Code Generation ──────────────────────────────────────────────

program
  .command('plan <task>')
  .description('Generate a multi-step implementation plan from a task description')
  .option('--execute', 'Execute the plan immediately after generating it')
  .action(async (task: string, options: { execute?: boolean }) => {
    try {
      await planCommand(task, { execute: options.execute });
    } catch (err: any) {
      handleCommandError(err, 'plan', 'Ensure your AI provider is configured. Run `orion config`.');
    }
  });

program
  .command('generate <type> <name>')
  .description('Generate boilerplate code (component, api, model, hook, test, middleware, page, service)')
  .option('--force', 'Overwrite existing files without prompting')
  .action(async (type: string, name: string, options: { force?: boolean }) => {
    try {
      await generateCommand(type, name, { force: options.force });
    } catch (err: any) {
      handleCommandError(err, 'generate', 'Ensure your AI provider is configured. Run `orion config`.');
    }
  });

// ─── Interactive & Analysis Tools ─────────────────────────────────────────────

program
  .command('shell')
  .description('Start an AI-enhanced interactive shell (natural language to commands)')
  .action(async () => {
    try {
      await shellCommand();
    } catch (err: any) {
      handleCommandError(err, 'shell', 'Ensure your AI provider is configured. Run `orion config`.');
    }
  });

program
  .command('todo')
  .description('Scan codebase for TODO/FIXME/HACK comments')
  .option('--fix', 'AI suggests fixes for each TODO')
  .option('--prioritize', 'AI prioritizes TODOs by importance')
  .action(async (options: { fix?: boolean; prioritize?: boolean }) => {
    try {
      await todoCommand({
        fix: options.fix,
        prioritize: options.prioritize,
      });
    } catch (err: any) {
      handleCommandError(err, 'todo', 'Ensure your AI provider is configured. Run `orion config`.');
    }
  });

// ─── Web Fetch ───────────────────────────────────────────────────────────────

program
  .command('fetch <url>')
  .description('Fetch a URL and display text content (pipe to orion ask for AI analysis)')
  .option('--raw', 'Show raw content without HTML tag stripping')
  .action(async (url: string, options: { raw?: boolean }) => {
    try {
      await fetchCommand(url, { raw: options.raw });
    } catch (err: any) {
      handleCommandError(err, 'fetch', 'Check the URL and your network connection.');
    }
  });

// ─── Changelog, Migration & Dependency Analysis ──────────────────────────────

program
  .command('changelog')
  .description('Generate a categorized changelog from git commit history')
  .option('--since <ref>', 'Generate changelog since a tag or commit ref')
  .option('--days <n>', 'Generate changelog for the last N days')
  .option('--output <file>', 'Write changelog to a file')
  .action(async (options: { since?: string; days?: string; output?: string }) => {
    try {
      await changelogCommand({
        since: options.since,
        days: options.days ? parseInt(options.days, 10) : undefined,
        output: options.output,
      });
    } catch (err: any) {
      handleCommandError(err, 'changelog', 'Ensure you are in a git repository and your AI provider is configured.');
    }
  });

program
  .command('migrate <file>')
  .description('AI-powered code migration (JS->TS, Python2->3, class->hooks, callbacks->async)')
  .requiredOption('--to <target>', 'Migration target: typescript, python3, hooks, async, esm, composition')
  .action(async (file: string, options: { to: string }) => {
    try {
      await migrateCommand(file, { to: options.to });
    } catch (err: any) {
      handleCommandError(err, 'migrate', 'Check that the file exists and your AI provider is configured.');
    }
  });

program
  .command('deps')
  .description('AI-powered dependency analysis (security, outdated, unused)')
  .option('--security', 'Audit dependencies for security vulnerabilities')
  .option('--outdated', 'Find outdated packages with upgrade recommendations')
  .option('--unused', 'Detect unused dependencies in the project')
  .action(async (options: { security?: boolean; outdated?: boolean; unused?: boolean }) => {
    try {
      await depsCommand({
        security: options.security,
        outdated: options.outdated,
        unused: options.unused,
      });
    } catch (err: any) {
      handleCommandError(err, 'deps', 'Ensure a dependency manifest (package.json, etc.) exists and your AI provider is configured.');
    }
  });

// ─── Default Action (no command) ─────────────────────────────────────────────

program.action(() => {
  printBanner();

  // ─── Categorized Quick Reference ────────────────────────────────────────
  const category = (label: string, cmds: string) => {
    const padded = (label + ':').padEnd(10);
    return `    ${palette.violet.bold(padded)}${cmds}`;
  };

  const cn = (name: string) => colors.command(name);
  const sep = palette.dim(' \u00B7 ');

  console.log(palette.violet.bold('  Commands'));
  console.log();
  console.log(category('Core', [cn('chat'), cn('ask'), cn('explain'), cn('review'), cn('fix'), cn('edit'), cn('commit')].join(sep)));
  console.log(category('Code', [cn('search'), cn('diff'), cn('run'), cn('test'), cn('agent'), cn('refactor')].join(sep)));
  console.log(category('Generate', [cn('plan'), cn('generate')].join(sep)));
  console.log(category('Tools', [cn('shell'), cn('todo'), cn('fetch'), cn('changelog'), cn('migrate'), cn('deps')].join(sep)));
  console.log(category('Safety', [cn('undo'), cn('status'), cn('doctor')].join(sep)));
  console.log(category('Session', [cn('session'), cn('watch'), cn('config'), cn('init')].join(sep)));
  console.log();

  // ─── Detailed Command List ──────────────────────────────────────────────
  const cmd = (name: string, args: string, desc: string) => {
    const cmdStr = colors.command(name);
    const argStr = args ? ' ' + palette.dim(args) : '';
    const padLen = 28 - name.length - (args ? args.length + 1 : 0);
    return `    ${cmdStr}${argStr}${' '.repeat(Math.max(padLen, 2))}${palette.dim(desc)}`;
  };

  console.log(palette.violet.bold('  Core'));
  console.log();
  console.log(cmd('orion chat', '', 'Interactive AI chat session'));
  console.log(cmd('orion ask', '"q" @files', 'AI question with file context'));
  console.log(cmd('orion explain', '[file]', 'Explain what a file does'));
  console.log(cmd('orion review', '[file]', 'AI code review'));
  console.log(cmd('orion fix', '[file]', 'Find and fix issues'));
  console.log(cmd('orion fix', '--auto [file]', 'Fix, test, iterate until passing'));
  console.log(cmd('orion edit', '<file>', 'AI-assisted file editing'));
  console.log();
  console.log(palette.violet.bold('  Code'));
  console.log();
  console.log(cmd('orion search', '"pattern"', 'Search codebase + AI analysis'));
  console.log(cmd('orion diff', '[ref]', 'AI-powered diff review'));
  console.log(cmd('orion run', '"command"', 'Run command, AI analyzes errors'));
  console.log(cmd('orion run', '--fix "cmd"', 'Run & auto-apply AI fixes'));
  console.log(cmd('orion test', '', 'Run tests, AI analyzes failures'));
  console.log(cmd('orion test', '--generate <f>', 'Generate tests for a file'));
  console.log(cmd('orion agent', '<tasks...>', 'Run AI tasks in parallel'));
  console.log(cmd('orion refactor', '<target> --rename', 'Rename symbol across codebase'));
  console.log(cmd('orion refactor', '<file> --extract', 'Extract code into a function'));
  console.log(cmd('orion refactor', '<file> --simplify', 'Simplify complex code'));
  console.log(cmd('orion refactor', '<dir> --unused', 'Find unused exports/imports'));
  console.log();
  console.log(palette.violet.bold('  Generate'));
  console.log();
  console.log(cmd('orion plan', '"task"', 'AI implementation plan from task'));
  console.log(cmd('orion plan', '--execute "task"', 'Plan and execute immediately'));
  console.log(cmd('orion generate', 'component Name', 'Generate UI component'));
  console.log(cmd('orion generate', 'api /route', 'Generate API endpoint'));
  console.log(cmd('orion generate', 'model Name', 'Generate data model'));
  console.log(cmd('orion generate', 'hook useName', 'Generate custom hook'));
  console.log(cmd('orion generate', 'test file.ts', 'Generate tests for a file'));
  console.log(cmd('orion generate', 'service Name', 'Generate service class'));
  console.log();
  console.log(palette.violet.bold('  Tools'));
  console.log();
  console.log(cmd('orion shell', '', 'AI-enhanced interactive shell'));
  console.log(cmd('orion todo', '', 'Scan for TODO/FIXME/HACK comments'));
  console.log(cmd('orion todo', '--fix', 'AI suggests fixes for TODOs'));
  console.log(cmd('orion todo', '--prioritize', 'AI ranks TODOs by importance'));
  console.log(cmd('orion fetch', '<url>', 'Fetch URL content for context'));
  console.log(cmd('orion fetch', '<url> --raw', 'Fetch raw content (no HTML strip)'));
  console.log(cmd('orion changelog', '', 'Generate changelog from git commits'));
  console.log(cmd('orion changelog', '--since v1.0', 'Changelog since a tag'));
  console.log(cmd('orion changelog', '--days 7', 'Changelog for last 7 days'));
  console.log(cmd('orion migrate', '<file> --to ts', 'Migrate JS to TypeScript'));
  console.log(cmd('orion migrate', '<file> --to hooks', 'Class components to hooks'));
  console.log(cmd('orion migrate', '<file> --to async', 'Callbacks to async/await'));
  console.log(cmd('orion deps', '', 'Analyze project dependencies'));
  console.log(cmd('orion deps', '--security', 'Security vulnerability audit'));
  console.log(cmd('orion deps', '--outdated', 'Find outdated packages'));
  console.log(cmd('orion deps', '--unused', 'Find unused dependencies'));
  console.log();
  console.log(palette.violet.bold('  Safety'));
  console.log();
  console.log(cmd('orion undo', '', 'Undo last file change'));
  console.log(cmd('orion status', '', 'Show environment status'));
  console.log(cmd('orion doctor', '', 'Full health check'));
  console.log();
  console.log(palette.violet.bold('  Session'));
  console.log();
  console.log(cmd('orion session', '<action>', 'Manage named AI sessions'));
  console.log(cmd('orion watch', '<pattern>', 'Watch files & auto-run AI'));
  console.log(cmd('orion config', '', 'Configure API keys'));
  console.log(cmd('orion init', '', 'Initialize Orion config'));
  console.log();
  console.log(palette.violet.bold('  Pipe Support'));
  console.log();
  console.log(`    ${palette.dim('cat file.ts | orion ask "What\'s wrong?"')}`);
  console.log(`    ${palette.dim('git diff | orion review')}`);
  console.log(`    ${palette.dim('orion run "npm test"')}`);
  console.log(`    ${palette.dim('orion fetch https://docs.example.com/api | orion ask "How do I use this?"')}`);
  console.log();
  console.log(palette.violet.bold('  Global Flags'));
  console.log();
  console.log(`    ${palette.dim('--dry-run     Show changes without writing files')}`);
  console.log(`    ${palette.dim('--json        Output structured JSON (CI/CD)')}`);
  console.log(`    ${palette.dim('-y, --yes     Auto-confirm all prompts')}`);
  console.log(`    ${palette.dim('--quiet       Minimal output')}`);
  console.log();
  console.log(palette.dim('  Run orion <command> --help for more info on a command.'));
  console.log();
});

// ─── Parse & Run ─────────────────────────────────────────────────────────────

program.parse(process.argv);
