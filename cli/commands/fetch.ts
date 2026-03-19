/**
 * Orion CLI - Web Fetch Command
 * Fetches URL content for AI context.
 * Strips HTML tags for web pages, keeps text/JSON as-is.
 * Supports both interactive (/fetch in chat) and CLI (orion fetch <url>).
 *
 * Usage:
 *   orion fetch https://docs.example.com/api
 *   orion fetch https://example.com/README.md --raw
 *   orion fetch https://docs.example.com/api | orion ask "How do I use this API?"
 */

import chalk from 'chalk';
import {
  colors,
  printHeader,
  printInfo,
  printSuccess,
  printError,
  printWarning,
  startSpinner,
  stopSpinner,
} from '../utils.js';
import { commandHeader, palette } from '../ui.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_CONTENT_SIZE = 50 * 1024; // 50KB max
const FETCH_TIMEOUT = 15000; // 15 seconds

// ─── HTML Tag Stripping ──────────────────────────────────────────────────────

/**
 * Strip HTML tags and decode common entities.
 * Extracts meaningful text content from HTML pages.
 */
export function stripHtmlTags(html: string): string {
  let text = html;

  // Remove script and style blocks entirely
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Add line breaks for block-level elements
  text = text.replace(/<\/?(?:p|div|br|hr|h[1-6]|li|tr|blockquote|pre|section|article|header|footer|nav|main|aside)[^>]*>/gi, '\n');
  text = text.replace(/<\/(?:td|th)[^>]*>/gi, '\t');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&mdash;/g, '--');
  text = text.replace(/&ndash;/g, '-');
  text = text.replace(/&hellip;/g, '...');
  text = text.replace(/&#(\d+);/g, (_match: string, code: string) => String.fromCharCode(parseInt(code, 10)));

  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ');       // collapse horizontal whitespace
  text = text.replace(/\n[ \t]+/g, '\n');     // trim leading whitespace on lines
  text = text.replace(/[ \t]+\n/g, '\n');     // trim trailing whitespace on lines
  text = text.replace(/\n{3,}/g, '\n\n');     // collapse multiple blank lines
  text = text.trim();

  return text;
}

// ─── Fetch Result Interface ──────────────────────────────────────────────────

export interface FetchResult {
  url: string;
  content: string | null;
  contentType: string | null;
  statusCode: number;
  error: string | null;
}

// ─── URL Fetcher ─────────────────────────────────────────────────────────────

/**
 * Fetch a URL and return its text content.
 * For HTML pages, strips tags and returns text.
 * For JSON/text, returns content as-is.
 * Truncates to MAX_CONTENT_SIZE.
 */
export async function fetchUrl(url: string, raw = false): Promise<FetchResult> {
  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      url,
      content: null,
      contentType: null,
      statusCode: 0,
      error: `Invalid URL: ${url}`,
    };
  }

  // Only allow http and https
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return {
      url,
      content: null,
      contentType: null,
      statusCode: 0,
      error: `Unsupported protocol: ${parsedUrl.protocol} (only http/https are supported)`,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Orion-CLI/2.0 (AI Coding Assistant)',
        'Accept': 'text/html, application/json, text/plain, text/markdown, */*',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        url,
        content: null,
        contentType: null,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type') || 'text/plain';
    let body = await response.text();

    // Truncate if too large
    if (body.length > MAX_CONTENT_SIZE) {
      body = body.substring(0, MAX_CONTENT_SIZE);
    }

    // Process based on content type
    let content: string;
    if (!raw && contentType.includes('text/html')) {
      content = stripHtmlTags(body);
    } else if (contentType.includes('application/json')) {
      // Pretty-print JSON
      try {
        const parsed = JSON.parse(body);
        content = JSON.stringify(parsed, null, 2);
      } catch {
        content = body;
      }
    } else {
      content = body;
    }

    // Final truncation check after processing
    if (content.length > MAX_CONTENT_SIZE) {
      content = content.substring(0, MAX_CONTENT_SIZE);
    }

    return {
      url,
      content,
      contentType,
      statusCode: response.status,
      error: null,
    };
  } catch (err: any) {
    const errorMsg = err.name === 'AbortError'
      ? `Request timed out after ${FETCH_TIMEOUT / 1000}s`
      : err.message || 'Unknown fetch error';

    return {
      url,
      content: null,
      contentType: null,
      statusCode: 0,
      error: errorMsg,
    };
  }
}

// ─── CLI Command ─────────────────────────────────────────────────────────────

export async function fetchCommand(url: string, options: { raw?: boolean } = {}): Promise<void> {
  if (!url) {
    console.log();
    printError('Please provide a URL to fetch.');
    console.log(`  ${colors.dim('Usage: orion fetch <url> [--raw]')}`);
    console.log(`  ${colors.dim('       orion fetch https://docs.example.com/api')}`);
    console.log(`  ${colors.dim('       orion fetch https://example.com/README.md --raw')}`);
    console.log(`  ${colors.dim('       orion fetch https://docs.example.com/api | orion ask "How do I use this?"')}`);
    console.log();
    process.exit(1);
  }

  // Check if output is being piped (not a TTY)
  const isPiped = !process.stdout.isTTY;

  if (!isPiped) {
    console.log(commandHeader('Orion Web Fetch'));
    printInfo(`Fetching: ${colors.file(url)}`);
    if (options.raw) {
      printInfo('Mode: raw (no HTML processing)');
    }
    console.log();
  }

  const spinner = isPiped ? null : startSpinner('Fetching...');

  const result = await fetchUrl(url, options.raw);

  if (spinner) {
    stopSpinner(spinner);
  }

  if (result.error) {
    if (isPiped) {
      // When piped, write error to stderr
      process.stderr.write(`Error: ${result.error}\n`);
      process.exit(1);
    } else {
      printError(result.error);
      if (result.statusCode === 403) {
        printInfo('The server may be blocking automated requests.');
      } else if (result.statusCode === 404) {
        printInfo('The URL was not found. Check the address and try again.');
      }
      console.log();
      process.exit(1);
    }
    return;
  }

  const content = result.content || '';

  if (isPiped) {
    // When piped, output raw content for chaining with other commands
    process.stdout.write(content);
  } else {
    // Interactive output with formatting
    const lines = content.split('\n').length;
    const sizeKB = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1);

    printSuccess(`Fetched ${lines} lines (${sizeKB}KB) from ${colors.file(url)}`);
    if (result.contentType) {
      printInfo(`Content-Type: ${chalk.dim(result.contentType)}`);
    }
    console.log();

    // Show a preview (first 50 lines)
    const previewLines = content.split('\n').slice(0, 50);
    for (const line of previewLines) {
      console.log(`  ${chalk.dim(line)}`);
    }

    if (lines > 50) {
      console.log();
      printInfo(`... and ${lines - 50} more lines (showing first 50)`);
    }

    console.log();
    printInfo('Tip: Pipe to orion ask for AI analysis:');
    console.log(`  ${colors.dim(`orion fetch "${url}" | orion ask "Summarize this"`)}`);
    console.log();
  }
}
