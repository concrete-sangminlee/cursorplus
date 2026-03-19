/**
 * Orion CLI - API Documentation Lookup
 * Quick API reference without leaving the terminal.
 * Sends query to AI for formatted API documentation.
 *
 * Usage:
 *   orion api express                      # Look up Express.js API
 *   orion api "react useState"             # Look up React hook docs
 *   orion api node fs                      # Look up Node.js fs module
 */

import { askAI } from '../ai-client.js';
import {
  colors,
  startSpinner,
  loadProjectContext,
} from '../utils.js';
import {
  createStreamHandler,
  printCommandError,
} from '../shared.js';
import { readStdin } from '../stdin.js';
import { commandHeader, palette } from '../ui.js';
import { renderMarkdown } from '../markdown.js';

// ─── System Prompt ──────────────────────────────────────────────────────────

const API_LOOKUP_PROMPT = `You are Orion, an expert developer reference tool. When the user asks about an API, library, module, or function, provide a concise but thorough API reference card.

Format your response as a structured reference card:

## <Library/Module Name>

### Overview
One-line description of what it does.

### Import / Setup
\`\`\`
// How to import or set up
\`\`\`

### Key Functions / Methods

For each relevant function or method:

#### \`functionName(param1: Type, param2?: Type): ReturnType\`
Brief description of what it does.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| param1 | Type | Yes | What it does |
| param2 | Type | No | What it does (default: value) |

**Returns:** \`ReturnType\` - Description

**Example:**
\`\`\`
// Practical, copy-paste-ready example
\`\`\`

### Common Patterns
Show 1-2 real-world usage patterns.

### Related
- List related functions/modules the user might also need.

### Gotchas
- Any common pitfalls or important notes.

Rules:
- Be precise with types, parameter names, and return values
- Use the correct language syntax for code examples
- Keep examples practical and immediately usable
- If the query is ambiguous, cover the most common interpretation
- Include version-specific notes if relevant (e.g., "Added in Node 18")
- Always include at least one practical example per function
- Use markdown formatting throughout`;

// ─── Command Entry Point ────────────────────────────────────────────────────

export async function apiLookupCommand(
  query?: string,
  extraWords?: string[],
): Promise<void> {
  // Combine query and extra words (for multi-word queries like "node fs")
  let fullQuery = '';

  if (query && extraWords && extraWords.length > 0) {
    fullQuery = [query, ...extraWords].join(' ');
  } else if (query) {
    fullQuery = query;
  }

  // Check for piped input
  if (!fullQuery) {
    const stdinData = await readStdin();
    if (stdinData) {
      fullQuery = stdinData.trim();
    }
  }

  if (!fullQuery) {
    console.log();
    console.log(`  ${colors.error('Please provide an API query.')}`);
    console.log();
    console.log(`  ${palette.violet.bold('Usage:')}`);
    console.log(`    ${palette.dim('orion api express                  # Express.js API reference')}`);
    console.log(`    ${palette.dim('orion api "react useState"         # React hook documentation')}`);
    console.log(`    ${palette.dim('orion api node fs                  # Node.js fs module')}`);
    console.log(`    ${palette.dim('orion api "python requests"        # Python requests library')}`);
    console.log(`    ${palette.dim('orion api "css grid"               # CSS Grid reference')}`);
    console.log(`    ${palette.dim('echo "lodash debounce" | orion api # Pipe query')}`);
    console.log();
    process.exit(1);
  }

  console.log(commandHeader('Orion API Reference', [
    ['Query', `"${fullQuery}"`],
    ['Mode', 'Documentation Lookup'],
  ]));
  console.log();

  const spinner = startSpinner('Looking up API documentation...');

  const { callbacks } = createStreamHandler(spinner, {
    markdown: true,
  });

  try {
    const projectContext = loadProjectContext();
    const systemPrompt = projectContext
      ? API_LOOKUP_PROMPT + '\n\nProject context (use to infer relevant frameworks/versions):\n' + projectContext
      : API_LOOKUP_PROMPT;

    const userMessage = `Provide a complete API reference card for: ${fullQuery}

If this refers to a specific function, method, or hook, focus on that. If it refers to a library or module, provide an overview of the most important and commonly used functions/methods.`;

    await askAI(systemPrompt, userMessage, callbacks);
    console.log();
  } catch (err: any) {
    printCommandError(err, 'api', 'Run `orion config` to check your AI provider settings.');
    process.exit(1);
  }
}
