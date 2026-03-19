/**
 * Orion CLI - Cron Expression Helper
 * Generate, explain, and preview cron schedule expressions.
 *
 * Usage:
 *   orion cron "every monday at 9am"       # Generate cron expression
 *   orion cron --explain "0 9 * * 1"       # Explain cron expression
 *   orion cron --next "0 9 * * 1" 5        # Show next 5 execution times
 */

import { askAI } from '../ai-client.js';
import {
  colors,
  startSpinner,
  stopSpinner,
} from '../utils.js';
import {
  createStreamHandler,
  createSilentStreamHandler,
  printCommandError,
} from '../shared.js';
import { readStdin } from '../stdin.js';
import { commandHeader, statusLine, divider, palette, table as uiTable } from '../ui.js';
import { renderMarkdown } from '../markdown.js';

// ─── System Prompts ─────────────────────────────────────────────────────────

const CRON_GENERATE_PROMPT = `You are Orion, an expert at cron expressions. Generate a cron expression from a natural language description.

Your response MUST follow this exact format:

## Cron Expression

\`\`\`
<expression>
\`\`\`

## Breakdown

| Field | Value | Meaning |
|-------|-------|---------|
| Minute | 0 | At minute 0 |
| Hour | 9 | At 9 AM |
| Day of Month | * | Every day |
| Month | * | Every month |
| Day of Week | 1 | Monday |

## In Plain English

One clear sentence: "Runs every Monday at 9:00 AM"

## Next 5 Executions

Assuming current time, list the next 5 times this would run:
1. Monday, Jan 6, 2025 at 09:00 AM
2. Monday, Jan 13, 2025 at 09:00 AM
...

## Cron Format Reference

\`\`\`
\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 minute (0-59)
\u2502 \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 hour (0-23)
\u2502 \u2502 \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 day of month (1-31)
\u2502 \u2502 \u2502 \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 month (1-12)
\u2502 \u2502 \u2502 \u2502 \u250C\u2500\u2500\u2500\u2500\u2500\u2500 day of week (0-7, 0 and 7 = Sunday)
\u2502 \u2502 \u2502 \u2502 \u2502
* * * * *
\`\`\`

## Useful Tips
- Any relevant tips about this specific schedule pattern.

Rules:
- Use standard 5-field cron format (minute, hour, day-of-month, month, day-of-week)
- Always verify the expression matches the description
- Show next execution times based on current date/time
- Include the visual cron format diagram
- Mention if the description is ambiguous and provide the most common interpretation`;

const CRON_EXPLAIN_PROMPT = `You are Orion, an expert at explaining cron expressions. Break down the given cron expression into clear, understandable components.

Format your explanation as:

## Cron Expression Analysis

\`\`\`
<the expression>
\`\`\`

## In Plain English

One clear sentence describing when this runs.

## Field Breakdown

| Field | Value | Meaning |
|-------|-------|---------|
| Minute (0-59) | value | explanation |
| Hour (0-23) | value | explanation |
| Day of Month (1-31) | value | explanation |
| Month (1-12) | value | explanation |
| Day of Week (0-7) | value | explanation |

## Visual Schedule

\`\`\`
\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 minute
\u2502 \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 hour
\u2502 \u2502 \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 day of month
\u2502 \u2502 \u2502 \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 month
\u2502 \u2502 \u2502 \u2502 \u250C\u2500\u2500\u2500\u2500\u2500\u2500 day of week
\u2502 \u2502 \u2502 \u2502 \u2502
X X X X X  \u2190 annotated values
\`\`\`

## Next 5 Executions

Based on current date/time:
1. ...
2. ...

## Common Use Cases

When this type of schedule is typically used.

## Potential Issues
- Any edge cases (e.g., runs on Feb 30th = never, daylight saving time, etc.)

Rules:
- Explain every field clearly
- Handle special characters: * , - / L W # ?
- Note any platform-specific differences (6-field vs 5-field)
- Warn about common mistakes or edge cases`;

// ─── Cron Parsing Utilities ─────────────────────────────────────────────────

interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

function parseCronExpression(expr: string): CronParts | null {
  const trimmed = expr.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length === 5) {
    return {
      minute: parts[0],
      hour: parts[1],
      dayOfMonth: parts[2],
      month: parts[3],
      dayOfWeek: parts[4],
    };
  }

  // Handle 6-field (with seconds) by ignoring the first field
  if (parts.length === 6) {
    return {
      minute: parts[1],
      hour: parts[2],
      dayOfMonth: parts[3],
      month: parts[4],
      dayOfWeek: parts[5],
    };
  }

  return null;
}

function expandCronField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    // Handle */n (every n)
    const stepMatch = part.match(/^(\*|(\d+)-(\d+))\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[4], 10);
      const start = stepMatch[2] ? parseInt(stepMatch[2], 10) : min;
      const end = stepMatch[3] ? parseInt(stepMatch[3], 10) : max;
      for (let i = start; i <= end; i += step) {
        values.add(i);
      }
      continue;
    }

    // Handle range (n-m)
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end; i++) {
        values.add(i);
      }
      continue;
    }

    // Handle wildcard
    if (part === '*') {
      for (let i = min; i <= max; i++) {
        values.add(i);
      }
      continue;
    }

    // Handle single number
    const num = parseInt(part, 10);
    if (!isNaN(num)) {
      values.add(num);
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}

function getNextExecutions(cronExpr: string, count: number): Date[] {
  const parts = parseCronExpression(cronExpr);
  if (!parts) return [];

  const minutes = expandCronField(parts.minute, 0, 59);
  const hours = expandCronField(parts.hour, 0, 23);
  const months = expandCronField(parts.month, 1, 12);
  const daysOfMonth = expandCronField(parts.dayOfMonth, 1, 31);
  const daysOfWeek = expandCronField(parts.dayOfWeek, 0, 7).map(d => d === 7 ? 0 : d);

  const results: Date[] = [];
  const now = new Date();
  const current = new Date(now.getTime() + 60000); // Start 1 minute from now
  current.setSeconds(0, 0);

  const maxIterations = 525960; // ~1 year of minutes
  let iterations = 0;

  while (results.length < count && iterations < maxIterations) {
    iterations++;

    const month = current.getMonth() + 1;
    const day = current.getDate();
    const dow = current.getDay();
    const hour = current.getHours();
    const minute = current.getMinutes();

    const monthMatch = months.includes(month);
    const dayMatch = parts.dayOfMonth === '*' || daysOfMonth.includes(day);
    const dowMatch = parts.dayOfWeek === '*' || daysOfWeek.includes(dow);
    const hourMatch = hours.includes(hour);
    const minuteMatch = minutes.includes(minute);

    // For day matching: if both day-of-month and day-of-week are specified (not *),
    // either can match (OR logic per POSIX standard)
    let dayOk: boolean;
    if (parts.dayOfMonth !== '*' && parts.dayOfWeek !== '*') {
      dayOk = dayMatch || dowMatch;
    } else {
      dayOk = dayMatch && dowMatch;
    }

    if (monthMatch && dayOk && hourMatch && minuteMatch) {
      results.push(new Date(current));
    }

    current.setMinutes(current.getMinutes() + 1);
  }

  return results;
}

function formatDate(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;

  return `${dayName}, ${monthName} ${day}, ${year} at ${hour12}:${minutes} ${ampm}`;
}

// ─── Subcommands ────────────────────────────────────────────────────────────

async function showNextExecutions(cronExpr: string, count: number): Promise<void> {
  console.log(commandHeader('Orion Cron Helper', [
    ['Mode', 'Next Executions'],
    ['Expression', `"${cronExpr}"`],
    ['Count', String(count)],
  ]));
  console.log();

  const parts = parseCronExpression(cronExpr);
  if (!parts) {
    console.log(`  ${colors.error('Invalid cron expression:')} "${cronExpr}"`);
    console.log(`  ${palette.dim('Expected format: "minute hour day-of-month month day-of-week"')}`);
    console.log(`  ${palette.dim('Example: "0 9 * * 1" (every Monday at 9 AM)')}`);
    console.log();
    return;
  }

  const spinner = startSpinner('Calculating next execution times...');

  const executions = getNextExecutions(cronExpr, count);

  stopSpinner(spinner, `Calculated ${executions.length} execution time(s)`);
  console.log();

  if (executions.length === 0) {
    console.log(`  ${palette.yellow('!')} No executions found within the next year.`);
    console.log(`  ${palette.dim('This expression may never trigger or triggers very rarely.')}`);
    console.log();
    return;
  }

  // Display cron breakdown
  console.log(`  ${palette.violet.bold('Expression:')} ${cronExpr}`);
  console.log();
  console.log(`  ${palette.dim('Field Breakdown:')}`);

  const fieldNames = ['Minute', 'Hour', 'Day of Month', 'Month', 'Day of Week'];
  const fieldValues = [parts.minute, parts.hour, parts.dayOfMonth, parts.month, parts.dayOfWeek];

  for (let i = 0; i < fieldNames.length; i++) {
    console.log(`    ${palette.dim(fieldNames[i].padEnd(15))} ${fieldValues[i]}`);
  }
  console.log();

  // Display execution times
  console.log(`  ${palette.violet.bold(`Next ${executions.length} Execution(s):`)}`);
  console.log();

  for (let i = 0; i < executions.length; i++) {
    const exec = executions[i];
    const now = new Date();
    const diffMs = exec.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let relativeTime: string;
    if (diffDays > 0) {
      relativeTime = `in ${diffDays}d ${diffHours % 24}h`;
    } else if (diffHours > 0) {
      relativeTime = `in ${diffHours}h ${diffMins % 60}m`;
    } else {
      relativeTime = `in ${diffMins}m`;
    }

    console.log(`    ${palette.green(`${i + 1}.`)} ${formatDate(exec)}  ${palette.dim(`(${relativeTime})`)}`);
  }

  console.log();
}

async function explainCron(cronExpr: string): Promise<void> {
  console.log(commandHeader('Orion Cron Helper', [
    ['Mode', 'Explain'],
    ['Expression', `"${cronExpr}"`],
  ]));
  console.log();

  // First show local computation of next executions
  const parts = parseCronExpression(cronExpr);
  if (parts) {
    const nextExecs = getNextExecutions(cronExpr, 3);
    if (nextExecs.length > 0) {
      console.log(`  ${palette.dim('Quick preview - next runs:')}`);
      for (const exec of nextExecs) {
        console.log(`    ${palette.dim('\u2022')} ${formatDate(exec)}`);
      }
      console.log();
    }
  }

  const spinner = startSpinner('Analyzing cron expression...');

  const { callbacks } = createStreamHandler(spinner, {
    markdown: true,
  });

  try {
    const userMessage = `Explain this cron expression in detail: ${cronExpr}

Current date/time for reference: ${new Date().toISOString()}`;

    await askAI(CRON_EXPLAIN_PROMPT, userMessage, callbacks);
    console.log();
  } catch (err: any) {
    printCommandError(err, 'cron', 'Run `orion config` to check your AI provider settings.');
    process.exit(1);
  }
}

async function generateCron(description: string): Promise<void> {
  console.log(commandHeader('Orion Cron Helper', [
    ['Mode', 'Generate'],
    ['Description', `"${description}"`],
  ]));
  console.log();

  const spinner = startSpinner('Generating cron expression...');

  const { callbacks } = createStreamHandler(spinner, {
    markdown: true,
  });

  try {
    const userMessage = `Generate a cron expression for: ${description}

Current date/time for calculating next executions: ${new Date().toISOString()}`;

    await askAI(CRON_GENERATE_PROMPT, userMessage, callbacks);
    console.log();
  } catch (err: any) {
    printCommandError(err, 'cron', 'Run `orion config` to check your AI provider settings.');
    process.exit(1);
  }
}

// ─── Command Entry Point ────────────────────────────────────────────────────

export async function cronHelperCommand(
  query?: string,
  options: { explain?: string; next?: string; count?: string } = {},
): Promise<void> {

  // Mode: Show next N execution times
  if (options.next) {
    const cronExpr = options.next;
    const count = parseInt(options.count || query || '5', 10);
    const validCount = isNaN(count) || count < 1 ? 5 : Math.min(count, 25);
    await showNextExecutions(cronExpr, validCount);
    return;
  }

  // Mode: Explain cron expression
  if (options.explain) {
    await explainCron(options.explain);
    return;
  }

  // Mode: Generate cron from natural language
  if (!query) {
    const stdinData = await readStdin();
    if (stdinData) {
      query = stdinData.trim();
    }
  }

  if (!query) {
    console.log();
    console.log(`  ${colors.error('Please provide a schedule description or cron expression.')}`);
    console.log();
    console.log(`  ${palette.violet.bold('Usage:')}`);
    console.log(`    ${palette.dim('orion cron "every monday at 9am"       # Generate cron expression')}`);
    console.log(`    ${palette.dim('orion cron --explain "0 9 * * 1"       # Explain cron expression')}`);
    console.log(`    ${palette.dim('orion cron --next "0 9 * * 1" 5        # Show next 5 executions')}`);
    console.log();
    console.log(`  ${palette.violet.bold('More examples:')}`);
    console.log(`    ${palette.dim('orion cron "twice a day at 8am and 6pm"')}`);
    console.log(`    ${palette.dim('orion cron "every 15 minutes during business hours"')}`);
    console.log(`    ${palette.dim('orion cron "first day of every month at midnight"')}`);
    console.log(`    ${palette.dim('orion cron --explain "*/5 9-17 * * 1-5"')}`);
    console.log(`    ${palette.dim('orion cron --next "0 0 1 * *" 12')}`);
    console.log();
    process.exit(1);
  }

  await generateCron(query);
}
