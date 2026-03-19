/**
 * Orion CLI - AI Regex Helper
 * Generate, explain, and test regular expressions.
 *
 * Usage:
 *   orion regex "match email addresses"          # AI generates regex
 *   orion regex --explain "/^[\w-\.]+@/"         # Explain a regex
 *   orion regex --test "/pattern/" "test string" # Test a regex
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
import { commandHeader, statusLine, divider, palette } from '../ui.js';
import { renderMarkdown } from '../markdown.js';

// ─── System Prompts ─────────────────────────────────────────────────────────

const REGEX_GENERATE_PROMPT = `You are Orion, an expert at crafting regular expressions. Generate a regex pattern from a natural language description.

Your response MUST follow this exact format:

## Regex Pattern

\`\`\`
/your-pattern-here/flags
\`\`\`

## Breakdown

Explain each component of the regex:
- \`component\` - what it matches

## Examples

### Matches:
- \`example1\` - why it matches
- \`example2\` - why it matches

### Does NOT match:
- \`example3\` - why it doesn't match

## Variations

If useful, show alternative patterns for:
- Stricter validation: \`/pattern/\`
- Looser matching: \`/pattern/\`

Rules:
- Always provide the regex in /pattern/flags format
- Use JavaScript/PCRE compatible regex syntax
- Include the most commonly needed flags (g, i, m as appropriate)
- Show at least 3 matching and 2 non-matching examples
- Explain every component of the pattern
- Prefer readability over cleverness when possible`;

const REGEX_EXPLAIN_PROMPT = `You are Orion, an expert at explaining regular expressions. Break down the given regex pattern into clear, understandable components.

Format your explanation as:

## Pattern Analysis

\`\`\`
/the-pattern/flags
\`\`\`

## Component Breakdown

Walk through each part of the regex in order:

| Component | Meaning |
|-----------|---------|
| \`^\` | Start of string |
| \`[a-z]\` | Any lowercase letter |
| ... | ... |

## What It Matches

Plain English description of what the full pattern matches.

### Examples that match:
- \`example1\`
- \`example2\`

### Examples that DON'T match:
- \`example3\` - reason

## Flags

| Flag | Meaning |
|------|---------|
| \`g\` | Global - find all matches |
| ... | ... |

## Potential Issues
- Any edge cases or gotchas with this pattern.

Rules:
- Be precise about what each component does
- Use a table format for component breakdown
- Show practical examples
- Note any edge cases or potential issues
- If the regex has bugs or could be improved, mention it`;

// ─── Regex Testing ──────────────────────────────────────────────────────────

interface RegexTestResult {
  pattern: string;
  flags: string;
  input: string;
  matches: RegExpMatchArray[];
  fullMatch: boolean;
}

function parseRegexString(regexStr: string): { pattern: string; flags: string } | null {
  // Handle /pattern/flags format
  const slashMatch = regexStr.match(/^\/?(.+?)\/([gimsuy]*)$/);
  if (slashMatch) {
    return { pattern: slashMatch[1], flags: slashMatch[2] };
  }

  // Handle bare pattern (no slashes)
  if (!regexStr.startsWith('/')) {
    return { pattern: regexStr, flags: '' };
  }

  return null;
}

function testRegex(regexStr: string, testString: string): RegexTestResult | null {
  const parsed = parseRegexString(regexStr);
  if (!parsed) return null;

  let regex: RegExp;
  try {
    regex = new RegExp(parsed.pattern, parsed.flags || 'g');
  } catch (err: any) {
    console.log(`  ${colors.error('Invalid regex:')} ${err.message}`);
    return null;
  }

  const matches: RegExpMatchArray[] = [];
  let match: RegExpExecArray | null;

  // Ensure global flag for iteration
  const globalRegex = new RegExp(parsed.pattern, parsed.flags.includes('g') ? parsed.flags : parsed.flags + 'g');

  while ((match = globalRegex.exec(testString)) !== null) {
    matches.push(match);
    // Prevent infinite loops for zero-length matches
    if (match[0].length === 0) {
      globalRegex.lastIndex++;
    }
  }

  // Check full match
  const fullMatchRegex = new RegExp(`^${parsed.pattern}$`, parsed.flags.replace('g', ''));
  const fullMatch = fullMatchRegex.test(testString);

  return {
    pattern: parsed.pattern,
    flags: parsed.flags,
    input: testString,
    matches,
    fullMatch,
  };
}

function displayTestResults(result: RegexTestResult): void {
  console.log();
  console.log(`  ${palette.violet.bold('Regex Test Results')}`);
  console.log(divider());
  console.log();
  console.log(`  ${palette.dim('Pattern:')} /${result.pattern}/${result.flags}`);
  console.log(`  ${palette.dim('Input:')}   "${result.input}"`);
  console.log();

  if (result.fullMatch) {
    console.log(statusLine('\u2713', palette.green('Full match - entire string matches the pattern')));
  } else {
    console.log(statusLine('i', palette.dim('No full match - pattern does not match the entire string')));
  }
  console.log();

  if (result.matches.length === 0) {
    console.log(`  ${palette.yellow('!')} No matches found in the input string.`);
  } else {
    console.log(`  ${palette.green(`Found ${result.matches.length} match(es):`)}`);
    console.log();

    for (let i = 0; i < result.matches.length; i++) {
      const m = result.matches[i];
      const start = m.index ?? 0;
      const end = start + m[0].length;

      console.log(`  ${palette.dim(`Match ${i + 1}:`)} ${palette.green.bold(`"${m[0]}"`)} ${palette.dim(`at index ${start}-${end}`)}`);

      // Show capture groups
      if (m.length > 1) {
        for (let g = 1; g < m.length; g++) {
          console.log(`    ${palette.dim(`Group ${g}:`)} ${m[g] !== undefined ? `"${m[g]}"` : palette.dim('(empty)')}`);
        }
      }
    }
  }

  // Visualize matches in context
  if (result.matches.length > 0) {
    console.log();
    console.log(`  ${palette.dim('Visualization:')}`);
    let highlighted = result.input;
    // Work backwards to preserve indices
    const sortedMatches = [...result.matches].sort((a, b) => (b.index ?? 0) - (a.index ?? 0));
    for (const m of sortedMatches) {
      const idx = m.index ?? 0;
      const before = highlighted.substring(0, idx);
      const matched = highlighted.substring(idx, idx + m[0].length);
      const after = highlighted.substring(idx + m[0].length);
      highlighted = before + palette.green.bold(`[${matched}]`) + after;
    }
    console.log(`  ${highlighted}`);
  }

  console.log();
}

// ─── Command Entry Point ────────────────────────────────────────────────────

export async function regexCommand(
  query?: string,
  options: { explain?: string; test?: string; testString?: string } = {},
): Promise<void> {

  // Mode: Test regex against string
  if (options.test) {
    const regexStr = options.test;
    const testStr = options.testString || query || '';

    if (!testStr) {
      console.log();
      console.log(`  ${colors.error('Test string is required.')}`);
      console.log(`  ${palette.dim('Usage: orion regex --test "/pattern/" "test string"')}`);
      console.log();
      process.exit(1);
    }

    console.log(commandHeader('Orion Regex Helper', [
      ['Mode', 'Test'],
      ['Pattern', regexStr],
    ]));

    const result = testRegex(regexStr, testStr);
    if (result) {
      displayTestResults(result);
    } else {
      console.log();
      console.log(`  ${colors.error('Could not parse regex pattern.')}`);
      console.log(`  ${palette.dim('Use format: /pattern/flags or just the pattern')}`);
      console.log();
    }
    return;
  }

  // Mode: Explain regex
  if (options.explain) {
    const regexStr = options.explain;

    console.log(commandHeader('Orion Regex Helper', [
      ['Mode', 'Explain'],
      ['Pattern', regexStr],
    ]));
    console.log();

    const spinner = startSpinner('Analyzing regex pattern...');

    const { callbacks } = createStreamHandler(spinner, {
      markdown: true,
    });

    try {
      const userMessage = `Explain this regular expression in detail: ${regexStr}`;
      await askAI(REGEX_EXPLAIN_PROMPT, userMessage, callbacks);
      console.log();
    } catch (err: any) {
      printCommandError(err, 'regex', 'Run `orion config` to check your AI provider settings.');
      process.exit(1);
    }
    return;
  }

  // Mode: Generate regex from natural language
  if (!query) {
    // Check for piped input
    const stdinData = await readStdin();
    if (stdinData) {
      query = stdinData.trim();
    }
  }

  if (!query) {
    console.log();
    console.log(`  ${colors.error('Please provide a description or regex pattern.')}`);
    console.log();
    console.log(`  ${palette.violet.bold('Usage:')}`);
    console.log(`    ${palette.dim('orion regex "match email addresses"          # Generate regex')}`);
    console.log(`    ${palette.dim('orion regex --explain "/^[\\w-\\.]+@/"        # Explain regex')}`);
    console.log(`    ${palette.dim('orion regex --test "/\\d+/" "abc 123 def"    # Test regex')}`);
    console.log();
    process.exit(1);
  }

  console.log(commandHeader('Orion Regex Helper', [
    ['Mode', 'Generate'],
    ['Description', `"${query}"`],
  ]));
  console.log();

  const spinner = startSpinner('Generating regex pattern...');

  const { callbacks } = createStreamHandler(spinner, {
    markdown: true,
  });

  try {
    const userMessage = `Generate a regex pattern for: ${query}

Provide the regex in JavaScript/PCRE compatible syntax with appropriate flags.`;

    await askAI(REGEX_GENERATE_PROMPT, userMessage, callbacks);
    console.log();
  } catch (err: any) {
    printCommandError(err, 'regex', 'Run `orion config` to check your AI provider settings.');
    process.exit(1);
  }
}
