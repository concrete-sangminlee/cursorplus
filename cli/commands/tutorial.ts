/**
 * Orion CLI - Interactive Tutorial Command
 * Step-by-step walkthrough of Orion CLI features.
 * Uses inquirer for interactive prompts and ui.ts for beautiful output.
 */

import * as readline from 'readline';
import chalk from 'chalk';
import {
  colors,
  readConfig,
  printSuccess,
  printError,
  printWarning,
  printInfo,
} from '../utils.js';
import {
  commandHeader,
  divider,
  box,
  badge,
  statusLine,
  palette,
} from '../ui.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface TutorialStep {
  title: string;
  run: () => Promise<boolean>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pause(): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(palette.dim('  Press Enter to continue...'), () => {
      rl.close();
      resolve();
    });
  });
}

function askYesNo(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  ${palette.violet('?')} ${question} ${palette.dim('(y/n)')} `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith('y'));
    });
  });
}

// ── Step 1: Welcome & Ollama Check ───────────────────────────────────────────

async function stepWelcome(): Promise<boolean> {
  console.log();
  console.log(box(
    `${palette.violet.bold('Welcome to the Orion CLI Tutorial!')}\n` +
    `\n` +
    `This interactive walkthrough will introduce you\n` +
    `to the core features of Orion, your AI-powered\n` +
    `coding assistant for the terminal.\n` +
    `\n` +
    `${palette.dim('You will learn how to:')}\n` +
    `  ${palette.green('\u2713')} Ask quick questions with ${colors.command('orion ask')}\n` +
    `  ${palette.green('\u2713')} Explain code with ${colors.command('orion explain')}\n` +
    `  ${palette.green('\u2713')} Start interactive chat with ${colors.command('orion chat')}\n` +
    `  ${palette.green('\u2713')} Explore all available commands`,
    { title: 'Orion Tutorial', color: '#7C5CFC', width: 56 }
  ));
  console.log();

  // Check Ollama status
  console.log(divider('Checking Environment'));
  console.log();

  const config = readConfig();

  // Check Ollama
  let ollamaReady = false;
  try {
    const ollamaHost = config.ollamaHost || 'http://localhost:11434';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${ollamaHost}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json() as { models?: { name: string }[] };
      const models = data.models || [];
      if (models.length > 0) {
        ollamaReady = true;
        printSuccess(`Ollama is running with ${models.length} model(s) installed`);
      } else {
        printWarning('Ollama is running but no models are installed');
        printInfo(`Install a model: ${colors.command('ollama pull llama3.2')}`);
      }
    } else {
      printWarning('Ollama returned an error');
    }
  } catch {
    printWarning('Ollama is not running');
    printInfo(`Start it with: ${colors.command('ollama serve')}`);
  }

  // Check API keys
  const hasAnthropic = !!(process.env.ANTHROPIC_API_KEY || config.anthropicApiKey);
  const hasOpenAI = !!(process.env.OPENAI_API_KEY || config.openaiApiKey);

  if (hasAnthropic) {
    printSuccess('Anthropic API key detected');
  }
  if (hasOpenAI) {
    printSuccess('OpenAI API key detected');
  }

  if (!ollamaReady && !hasAnthropic && !hasOpenAI) {
    console.log();
    printError('No AI provider is configured!');
    printInfo(`Run ${colors.command('orion config')} to set up an API key, or start Ollama.`);
    console.log();
    printInfo('You can still continue the tutorial to learn about the commands.');
  }

  // Current config summary
  console.log();
  console.log(`  ${palette.dim('Active provider:')} ${palette.violet(config.provider || 'ollama')}`);
  console.log(`  ${palette.dim('Active model:   ')} ${palette.violet(config.model || 'llama3.2')}`);

  console.log();
  await pause();
  return true;
}

// ── Step 2: Try orion ask ────────────────────────────────────────────────────

async function stepAsk(): Promise<boolean> {
  console.log();
  console.log(divider('Step 2: Quick Questions'));
  console.log();

  console.log(box(
    `The ${colors.command('orion ask')} command lets you ask\n` +
    `a quick one-shot question to the AI.\n` +
    `\n` +
    `${palette.dim('Basic usage:')}\n` +
    `  ${colors.command('orion ask "What is a closure in JS?"')}\n` +
    `\n` +
    `${palette.dim('With file context:')}\n` +
    `  ${colors.command('orion ask "What does this do?" @app.ts')}\n` +
    `\n` +
    `${palette.dim('With piped input:')}\n` +
    `  ${palette.dim('cat error.log | orion ask "What went wrong?"')}`,
    { title: 'orion ask', color: '#38BDF8', width: 56 }
  ));
  console.log();

  printInfo('The @file syntax automatically includes file contents as context.');
  printInfo('You can reference multiple files: @src/index.ts @src/utils.ts');

  console.log();
  await pause();
  return true;
}

// ── Step 3: Try orion explain ────────────────────────────────────────────────

async function stepExplain(): Promise<boolean> {
  console.log();
  console.log(divider('Step 3: Code Explanation'));
  console.log();

  console.log(box(
    `The ${colors.command('orion explain')} command provides\n` +
    `AI-powered explanations of any source file.\n` +
    `\n` +
    `${palette.dim('Explain a file:')}\n` +
    `  ${colors.command('orion explain src/index.ts')}\n` +
    `\n` +
    `${palette.dim('Explain piped content:')}\n` +
    `  ${palette.dim('cat complex-function.py | orion explain')}\n` +
    `\n` +
    `${palette.dim('The AI will break down:')}\n` +
    `  ${palette.blue('\u2022')} What the code does (high-level overview)\n` +
    `  ${palette.blue('\u2022')} Key functions and their roles\n` +
    `  ${palette.blue('\u2022')} Important patterns and dependencies`,
    { title: 'orion explain', color: '#22C55E', width: 56 }
  ));
  console.log();

  printInfo('Try it on any file in your project to get an instant overview!');

  console.log();
  await pause();
  return true;
}

// ── Step 4: Try orion chat with provider switching ───────────────────────────

async function stepChat(): Promise<boolean> {
  console.log();
  console.log(divider('Step 4: Interactive Chat'));
  console.log();

  console.log(box(
    `The ${colors.command('orion chat')} command starts a fully\n` +
    `interactive AI chat session with hot-switching.\n` +
    `\n` +
    `${palette.dim('Start a chat:')}\n` +
    `  ${colors.command('orion chat')}\n` +
    `\n` +
    `${palette.dim('In-chat commands:')}\n` +
    `  ${palette.violet('/tab')}        Switch AI provider instantly\n` +
    `  ${palette.violet('/model')}      Change the active model\n` +
    `  ${palette.violet('/save')}       Save the current session\n` +
    `  ${palette.violet('/history')}    View chat history\n` +
    `  ${palette.violet('/load')}       Load a previous session\n` +
    `  ${palette.violet('/clear')}      Clear conversation\n` +
    `  ${palette.violet('/exit')}       Exit chat\n` +
    `\n` +
    `${palette.dim('Provider hot-switching:')}\n` +
    `  Switch between Claude, GPT, and Ollama mid-\n` +
    `  conversation. History is preserved across\n` +
    `  provider switches!`,
    { title: 'orion chat', color: '#9B59B6', width: 56 }
  ));
  console.log();

  printInfo('Your conversation history is fully preserved when switching providers.');
  printInfo('Use /save to persist sessions and /load to resume them later.');

  console.log();
  await pause();
  return true;
}

// ── Step 5: Show all available commands ──────────────────────────────────────

async function stepAllCommands(): Promise<boolean> {
  console.log();
  console.log(divider('Step 5: All Commands'));
  console.log();

  const categories: Array<{ name: string; color: string; commands: Array<[string, string]> }> = [
    {
      name: 'Core',
      color: '#7C5CFC',
      commands: [
        ['chat', 'Interactive AI chat session'],
        ['ask', 'Quick one-shot question'],
        ['explain', 'Explain what code does'],
        ['review', 'AI code review'],
        ['fix', 'Find and fix issues'],
        ['edit', 'AI-assisted file editing'],
        ['commit', 'Generate AI commit messages'],
      ],
    },
    {
      name: 'Code',
      color: '#38BDF8',
      commands: [
        ['search', 'Search codebase + AI analysis'],
        ['diff', 'AI-powered diff review'],
        ['pr', 'Generate PR description'],
        ['run', 'Run command with AI error analysis'],
        ['test', 'Run tests with AI analysis'],
        ['agent', 'Run AI tasks in parallel'],
        ['refactor', 'Rename, extract, simplify code'],
      ],
    },
    {
      name: 'Generate',
      color: '#22C55E',
      commands: [
        ['plan', 'AI implementation plan'],
        ['generate', 'Generate boilerplate code'],
        ['docs', 'Generate documentation'],
      ],
    },
    {
      name: 'Tools',
      color: '#F59E0B',
      commands: [
        ['shell', 'AI-enhanced interactive shell'],
        ['todo', 'Scan for TODO/FIXME comments'],
        ['fetch', 'Fetch URL content'],
        ['changelog', 'Generate changelog'],
        ['migrate', 'Code migration (JS->TS, etc.)'],
        ['deps', 'Dependency analysis'],
        ['snippet', 'Manage code snippets'],
        ['compare', 'Compare files or approaches'],
      ],
    },
    {
      name: 'Analysis',
      color: '#EF4444',
      commands: [
        ['debug', 'Debugging assistant'],
        ['benchmark', 'Performance analysis'],
        ['security', 'Security vulnerability scan'],
        ['typecheck', 'Type analysis & improvements'],
      ],
    },
    {
      name: 'Safety',
      color: '#D4A574',
      commands: [
        ['undo', 'Undo last file change'],
        ['status', 'Show environment status'],
        ['doctor', 'Full health check'],
      ],
    },
  ];

  for (const cat of categories) {
    const catBadge = badge(cat.name, cat.color);
    console.log(`  ${catBadge}`);
    console.log();
    for (const [cmd, desc] of cat.commands) {
      const cmdStr = colors.command(('orion ' + cmd).padEnd(22));
      console.log(`    ${cmdStr} ${palette.dim(desc)}`);
    }
    console.log();
  }

  await pause();
  return true;
}

// ── Step 6: Next Steps ───────────────────────────────────────────────────────

async function stepNextSteps(): Promise<boolean> {
  console.log();
  console.log(divider('Next Steps'));
  console.log();

  console.log(box(
    `${palette.violet.bold('You are all set!')}\n` +
    `\n` +
    `${palette.dim('Here are some things to try next:')}\n` +
    `\n` +
    `  ${palette.green('1.')} Run ${colors.command('orion config')} to set up API keys\n` +
    `  ${palette.green('2.')} Run ${colors.command('orion init')} to create project context\n` +
    `  ${palette.green('3.')} Run ${colors.command('orion doctor')} for a full health check\n` +
    `  ${palette.green('4.')} Run ${colors.command('orion chat')} to start your first session\n` +
    `  ${palette.green('5.')} Run ${colors.command('orion examples')} to see usage examples\n` +
    `\n` +
    `${palette.dim('Get help for any command:')}\n` +
    `  ${colors.command('orion <command> --help')}\n` +
    `\n` +
    `${palette.dim('View examples for a specific command:')}\n` +
    `  ${colors.command('orion examples <command>')}\n` +
    `\n` +
    `${palette.dim('Global flags:')}\n` +
    `  ${palette.dim('--dry-run')}   Show changes without writing files\n` +
    `  ${palette.dim('--json')}      Structured JSON output for CI/CD\n` +
    `  ${palette.dim('-y, --yes')}   Auto-confirm all prompts\n` +
    `  ${palette.dim('--quiet')}     Minimal output`,
    { title: 'What Next?', color: '#22C55E', width: 56 }
  ));
  console.log();

  printSuccess('Tutorial complete! Happy coding with Orion.');
  console.log();

  return true;
}

// ── Main Tutorial Command ────────────────────────────────────────────────────

export async function tutorialCommand(options?: { skip?: boolean }): Promise<void> {
  // Skip mode: just show a summary
  if (options?.skip) {
    console.log(commandHeader('Orion Tutorial', [['Mode', 'Quick summary (--skip)']]));
    console.log();
    printInfo(`Run ${colors.command('orion tutorial')} without --skip for the full interactive walkthrough.`);
    console.log();
    printInfo('Key commands to get started:');
    console.log(`    ${colors.command('orion config')}       Configure API keys`);
    console.log(`    ${colors.command('orion chat')}         Start interactive chat`);
    console.log(`    ${colors.command('orion ask "..."')}    Quick one-shot question`);
    console.log(`    ${colors.command('orion explain <f>')}  Explain a file`);
    console.log(`    ${colors.command('orion examples')}     View usage examples`);
    console.log(`    ${colors.command('orion doctor')}       Health check`);
    console.log();
    return;
  }

  console.log(commandHeader('Orion Interactive Tutorial'));

  const steps: TutorialStep[] = [
    { title: 'Welcome & Environment Check', run: stepWelcome },
    { title: 'Quick Questions (orion ask)', run: stepAsk },
    { title: 'Code Explanation (orion explain)', run: stepExplain },
    { title: 'Interactive Chat (orion chat)', run: stepChat },
    { title: 'All Available Commands', run: stepAllCommands },
    { title: 'Next Steps', run: stepNextSteps },
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepNum = `${i + 1}/${steps.length}`;
    console.log();
    console.log(`  ${badge(`Step ${stepNum}`, '#7C5CFC')} ${palette.white.bold(step.title)}`);

    const success = await step.run();

    if (!success) {
      console.log();
      printWarning('Tutorial interrupted. Run it again anytime with:');
      printInfo(colors.command('orion tutorial'));
      console.log();
      return;
    }
  }
}
