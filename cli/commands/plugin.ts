/**
 * Orion CLI - Plugin System for Extensibility
 * Install, remove, list, and scaffold plugins.
 * Plugins live in ~/.orion/plugins/ as JS files.
 *
 * Each plugin exports: { name, description, commands: [{ name, description, action }] }
 * Installed plugins' commands become available as `orion <plugin-name>:<command>`
 *
 * Usage:
 *   orion plugin list                      # List installed plugins
 *   orion plugin install ./my-plugin.js    # Install a local plugin
 *   orion plugin remove my-plugin          # Remove a plugin
 *   orion plugin create my-plugin          # Scaffold a new plugin
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  colors,
  ensureConfigDir,
} from '../utils.js';
import { commandHeader, statusLine, divider, palette, table as uiTable, truncate, timeAgo } from '../ui.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const PLUGINS_DIR = path.join(os.homedir(), '.orion', 'plugins');
const PLUGIN_REGISTRY_FILE = path.join(os.homedir(), '.orion', 'plugins.json');

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PluginCommand {
  name: string;
  description: string;
  action: (...args: any[]) => Promise<void> | void;
}

export interface PluginManifest {
  name: string;
  description: string;
  commands: PluginCommand[];
}

interface PluginRegistryEntry {
  name: string;
  description: string;
  sourcePath: string;
  installedAt: string;
  commands: { name: string; description: string }[];
}

interface PluginRegistry {
  plugins: PluginRegistryEntry[];
}

// ─── Plugin Storage ─────────────────────────────────────────────────────────

function ensurePluginsDir(): void {
  ensureConfigDir();
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  }
}

function loadRegistry(): PluginRegistry {
  ensurePluginsDir();
  if (!fs.existsSync(PLUGIN_REGISTRY_FILE)) {
    return { plugins: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(PLUGIN_REGISTRY_FILE, 'utf-8')) as PluginRegistry;
  } catch {
    return { plugins: [] };
  }
}

function saveRegistry(registry: PluginRegistry): void {
  ensurePluginsDir();
  fs.writeFileSync(PLUGIN_REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
}

function getPluginPath(name: string): string {
  return path.join(PLUGINS_DIR, `${name}.js`);
}

// ─── Plugin Validation ──────────────────────────────────────────────────────

function validatePluginModule(mod: any, sourcePath: string): PluginManifest | null {
  const plugin = mod.default || mod;

  if (!plugin || typeof plugin !== 'object') {
    console.log(`  ${colors.error('Invalid plugin:')} module does not export an object`);
    console.log(`  ${palette.dim('File:')} ${sourcePath}`);
    return null;
  }

  if (typeof plugin.name !== 'string' || !plugin.name.trim()) {
    console.log(`  ${colors.error('Invalid plugin:')} missing or empty "name" property`);
    return null;
  }

  if (typeof plugin.description !== 'string') {
    console.log(`  ${colors.error('Invalid plugin:')} missing "description" property`);
    return null;
  }

  if (!Array.isArray(plugin.commands) || plugin.commands.length === 0) {
    console.log(`  ${colors.error('Invalid plugin:')} "commands" must be a non-empty array`);
    return null;
  }

  for (const cmd of plugin.commands) {
    if (typeof cmd.name !== 'string' || !cmd.name.trim()) {
      console.log(`  ${colors.error('Invalid plugin:')} each command must have a "name" string`);
      return null;
    }
    if (typeof cmd.description !== 'string') {
      console.log(`  ${colors.error('Invalid plugin:')} each command must have a "description" string`);
      return null;
    }
    if (typeof cmd.action !== 'function') {
      console.log(`  ${colors.error('Invalid plugin:')} each command must have an "action" function`);
      return null;
    }
  }

  return plugin as PluginManifest;
}

// ─── Subcommands ────────────────────────────────────────────────────────────

async function listPlugins(): Promise<void> {
  console.log(commandHeader('Orion Plugin Manager', [
    ['Action', 'List'],
    ['Store', PLUGINS_DIR],
  ]));

  const registry = loadRegistry();

  if (registry.plugins.length === 0) {
    console.log(statusLine('i', palette.dim('No plugins installed.')));
    console.log(`  ${palette.dim('Install a plugin: orion plugin install ./my-plugin.js')}`);
    console.log(`  ${palette.dim('Create a plugin:  orion plugin create my-plugin')}`);
    console.log();
    return;
  }

  const headers = ['Plugin', 'Description', 'Commands', 'Installed'];
  const rows: string[][] = [];

  for (const p of registry.plugins) {
    const cmdNames = p.commands.map(c => c.name).join(', ');
    const installed = timeAgo(new Date(p.installedAt));
    rows.push([
      truncate(p.name, 25),
      truncate(p.description, 35),
      truncate(cmdNames, 30),
      installed,
    ]);
  }

  console.log(uiTable(headers, rows));
  console.log();
  console.log(`  ${palette.dim(`${registry.plugins.length} plugin(s) installed`)}`);
  console.log();

  // Show available commands
  console.log(`  ${palette.violet.bold('Available plugin commands:')}`);
  for (const p of registry.plugins) {
    for (const cmd of p.commands) {
      console.log(`    ${colors.command(`orion ${p.name}:${cmd.name}`)}  ${palette.dim(cmd.description)}`);
    }
  }
  console.log();
}

async function installPlugin(source: string): Promise<void> {
  console.log(commandHeader('Orion Plugin Manager', [
    ['Action', 'Install'],
    ['Source', source],
  ]));

  const resolvedSource = path.resolve(source);

  // Validate source file exists
  if (!fs.existsSync(resolvedSource)) {
    console.log(`  ${colors.error('File not found:')} ${resolvedSource}`);
    console.log(`  ${palette.dim('Provide a path to a valid .js plugin file.')}`);
    console.log();
    return;
  }

  if (!resolvedSource.endsWith('.js')) {
    console.log(`  ${colors.error('Plugin must be a .js file:')} ${resolvedSource}`);
    console.log(`  ${palette.dim('Plugin files must have a .js extension.')}`);
    console.log();
    return;
  }

  // Load and validate the plugin
  let pluginModule: any;
  try {
    // Use dynamic require for JS files
    const fileUrl = 'file:///' + resolvedSource.replace(/\\/g, '/');
    pluginModule = await import(fileUrl);
  } catch (err: any) {
    console.log(`  ${colors.error('Failed to load plugin:')} ${err.message}`);
    console.log(`  ${palette.dim('Ensure the plugin file is valid JavaScript.')}`);
    console.log();
    return;
  }

  const manifest = validatePluginModule(pluginModule, resolvedSource);
  if (!manifest) {
    console.log();
    console.log(`  ${palette.dim('Plugin must export: { name, description, commands: [{ name, description, action }] }')}`);
    console.log();
    return;
  }

  // Check for conflicts
  const registry = loadRegistry();
  const existingIdx = registry.plugins.findIndex(p => p.name === manifest.name);

  if (existingIdx >= 0) {
    console.log(`  ${palette.yellow('!')} Plugin "${manifest.name}" is already installed. Updating...`);
    registry.plugins.splice(existingIdx, 1);
  }

  // Copy plugin to plugins directory
  ensurePluginsDir();
  const destPath = getPluginPath(manifest.name);
  try {
    fs.copyFileSync(resolvedSource, destPath);
  } catch (err: any) {
    console.log(`  ${colors.error('Failed to copy plugin:')} ${err.message}`);
    console.log();
    return;
  }

  // Register the plugin
  const entry: PluginRegistryEntry = {
    name: manifest.name,
    description: manifest.description,
    sourcePath: resolvedSource,
    installedAt: new Date().toISOString(),
    commands: manifest.commands.map(c => ({ name: c.name, description: c.description })),
  };

  registry.plugins.push(entry);
  saveRegistry(registry);

  console.log();
  console.log(statusLine('\u2713', palette.green(`Plugin "${manifest.name}" installed successfully`)));
  console.log(`    ${palette.dim('Description:')} ${manifest.description}`);
  console.log(`    ${palette.dim('Commands:')}`);
  for (const cmd of manifest.commands) {
    console.log(`      ${colors.command(`orion ${manifest.name}:${cmd.name}`)}  ${palette.dim(cmd.description)}`);
  }
  console.log(`    ${palette.dim('Stored in:')} ${destPath}`);
  console.log();
}

async function removePlugin(name: string): Promise<void> {
  console.log(commandHeader('Orion Plugin Manager', [
    ['Action', 'Remove'],
    ['Plugin', name],
  ]));

  const registry = loadRegistry();
  const idx = registry.plugins.findIndex(p => p.name === name);

  if (idx < 0) {
    console.log(`  ${colors.error('Plugin not found:')} "${name}"`);
    console.log(`  ${palette.dim('Run `orion plugin list` to see installed plugins.')}`);
    console.log();
    return;
  }

  const plugin = registry.plugins[idx];

  // Remove the plugin file
  const pluginPath = getPluginPath(name);
  try {
    if (fs.existsSync(pluginPath)) {
      fs.unlinkSync(pluginPath);
    }
  } catch (err: any) {
    console.log(`  ${palette.yellow('!')} Could not delete plugin file: ${err.message}`);
  }

  // Remove from registry
  registry.plugins.splice(idx, 1);
  saveRegistry(registry);

  console.log();
  console.log(statusLine('\u2713', palette.green(`Plugin "${plugin.name}" removed`)));
  console.log(`    ${palette.dim('Removed commands:')}`);
  for (const cmd of plugin.commands) {
    console.log(`      ${palette.dim(`orion ${plugin.name}:${cmd.name}`)}`);
  }
  console.log();
}

async function createPlugin(name: string): Promise<void> {
  console.log(commandHeader('Orion Plugin Manager', [
    ['Action', 'Create'],
    ['Name', name],
  ]));

  // Sanitize name
  const safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-+/g, '-');

  if (!safeName) {
    console.log(`  ${colors.error('Invalid plugin name:')} "${name}"`);
    console.log(`  ${palette.dim('Use alphanumeric characters and hyphens.')}`);
    console.log();
    return;
  }

  const outputDir = path.resolve(safeName + '-plugin');
  const outputFile = path.join(outputDir, 'index.js');

  if (fs.existsSync(outputDir)) {
    console.log(`  ${colors.error('Directory already exists:')} ${outputDir}`);
    console.log(`  ${palette.dim('Choose a different name or remove the existing directory.')}`);
    console.log();
    return;
  }

  // Create plugin directory and template
  fs.mkdirSync(outputDir, { recursive: true });

  const template = `/**
 * Orion Plugin: ${safeName}
 *
 * This is a template for an Orion CLI plugin.
 * Install with: orion plugin install ./${safeName}-plugin/index.js
 *
 * Plugin API:
 *   - name: unique plugin identifier (used as command prefix)
 *   - description: short description shown in plugin list
 *   - commands: array of { name, description, action } objects
 *
 * Commands become available as: orion ${safeName}:<command-name>
 */

module.exports = {
  name: '${safeName}',
  description: 'A custom Orion plugin',

  commands: [
    {
      name: 'hello',
      description: 'Say hello from the plugin',
      action: async (...args) => {
        console.log();
        console.log('  Hello from ${safeName} plugin!');
        if (args.length > 0) {
          console.log('  Arguments:', args.join(' '));
        }
        console.log();
      },
    },

    {
      name: 'info',
      description: 'Show plugin information',
      action: async () => {
        console.log();
        console.log('  Plugin: ${safeName}');
        console.log('  Version: 1.0.0');
        console.log('  Author: <your name>');
        console.log();
      },
    },
  ],
};
`;

  const readme = `# ${safeName} - Orion Plugin

A custom plugin for the Orion CLI.

## Installation

\`\`\`bash
orion plugin install ./${safeName}-plugin/index.js
\`\`\`

## Commands

| Command | Description |
|---------|-------------|
| \`orion ${safeName}:hello\` | Say hello from the plugin |
| \`orion ${safeName}:info\` | Show plugin information |

## Development

1. Edit \`index.js\` to add your custom commands
2. Each command needs: \`name\`, \`description\`, and \`action\` (async function)
3. Reinstall after changes: \`orion plugin install ./index.js\`

## Plugin API

\`\`\`javascript
module.exports = {
  name: 'my-plugin',           // Unique identifier
  description: 'What it does', // Shown in plugin list
  commands: [
    {
      name: 'my-command',
      description: 'What the command does',
      action: async (...args) => {
        // Your logic here
        // args are any additional CLI arguments
      },
    },
  ],
};
\`\`\`
`;

  fs.writeFileSync(outputFile, template, 'utf-8');
  fs.writeFileSync(path.join(outputDir, 'README.md'), readme, 'utf-8');

  console.log();
  console.log(statusLine('\u2713', palette.green(`Plugin scaffolded: ${safeName}`)));
  console.log();
  console.log(`    ${palette.dim('Created files:')}`);
  console.log(`      ${colors.file(outputFile)}`);
  console.log(`      ${colors.file(path.join(outputDir, 'README.md'))}`);
  console.log();
  console.log(`    ${palette.violet.bold('Next steps:')}`);
  console.log(`      1. Edit ${colors.file(outputFile)} to add your commands`);
  console.log(`      2. Install: ${colors.command(`orion plugin install ./${safeName}-plugin/index.js`)}`);
  console.log(`      3. Use:    ${colors.command(`orion ${safeName}:hello`)}`);
  console.log();
}

// ─── Plugin Command Execution ───────────────────────────────────────────────

/**
 * Execute a plugin command by name.
 * Called from the alias/unknown command handler in index.ts.
 * Returns true if a plugin command was found and executed.
 */
export async function executePluginCommand(fullCommand: string, args: string[]): Promise<boolean> {
  const colonIndex = fullCommand.indexOf(':');
  if (colonIndex < 0) return false;

  const pluginName = fullCommand.substring(0, colonIndex);
  const commandName = fullCommand.substring(colonIndex + 1);

  if (!pluginName || !commandName) return false;

  const registry = loadRegistry();
  const entry = registry.plugins.find(p => p.name === pluginName);
  if (!entry) return false;

  // Check if command exists in registry
  const cmdEntry = entry.commands.find(c => c.name === commandName);
  if (!cmdEntry) {
    console.log();
    console.log(`  ${colors.error(`Unknown command "${commandName}" for plugin "${pluginName}"`)}`);
    console.log(`  ${palette.dim('Available commands:')}`);
    for (const c of entry.commands) {
      console.log(`    ${colors.command(`orion ${pluginName}:${c.name}`)}  ${palette.dim(c.description)}`);
    }
    console.log();
    return true;
  }

  // Load and execute the plugin
  const pluginPath = getPluginPath(pluginName);
  if (!fs.existsSync(pluginPath)) {
    console.log(`  ${colors.error('Plugin file not found.')} Try reinstalling: ${colors.command(`orion plugin install <source>`)}`);
    return true;
  }

  try {
    const fileUrl = 'file:///' + pluginPath.replace(/\\/g, '/');
    const mod = await import(fileUrl);
    const plugin = mod.default || mod;

    const cmd = plugin.commands?.find((c: any) => c.name === commandName);
    if (cmd && typeof cmd.action === 'function') {
      await cmd.action(...args);
    } else {
      console.log(`  ${colors.error('Command action not found in plugin file.')}`);
    }
  } catch (err: any) {
    console.log(`  ${colors.error('Plugin execution error:')} ${err.message}`);
  }

  return true;
}

// ─── Command Entry Point ────────────────────────────────────────────────────

export async function pluginCommand(
  action: string,
  target?: string,
): Promise<void> {
  switch (action) {
    case 'list':
    case 'ls':
      await listPlugins();
      break;

    case 'install':
    case 'add':
      if (!target) {
        console.log();
        console.log(`  ${colors.error('Plugin path is required.')}`);
        console.log(`  ${palette.dim('Usage: orion plugin install ./my-plugin.js')}`);
        console.log();
        process.exit(1);
      }
      await installPlugin(target);
      break;

    case 'remove':
    case 'rm':
    case 'uninstall':
      if (!target) {
        console.log();
        console.log(`  ${colors.error('Plugin name is required.')}`);
        console.log(`  ${palette.dim('Usage: orion plugin remove my-plugin')}`);
        console.log();
        process.exit(1);
      }
      await removePlugin(target);
      break;

    case 'create':
    case 'new':
    case 'scaffold':
      if (!target) {
        console.log();
        console.log(`  ${colors.error('Plugin name is required.')}`);
        console.log(`  ${palette.dim('Usage: orion plugin create my-plugin')}`);
        console.log();
        process.exit(1);
      }
      await createPlugin(target);
      break;

    default:
      console.log();
      console.log(`  ${colors.error('Unknown action:')} "${action}"`);
      console.log();
      console.log(`  ${palette.violet.bold('Available actions:')}`);
      console.log(`    ${palette.dim('list')}       List installed plugins`);
      console.log(`    ${palette.dim('install')}    Install a plugin from a .js file`);
      console.log(`    ${palette.dim('remove')}     Remove an installed plugin`);
      console.log(`    ${palette.dim('create')}     Scaffold a new plugin template`);
      console.log();
      console.log(`  ${palette.dim('Example: orion plugin install ./my-plugin.js')}`);
      console.log();
      process.exit(1);
  }
}
