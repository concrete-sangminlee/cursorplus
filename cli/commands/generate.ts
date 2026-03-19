/**
 * Orion CLI - Code Generation Command
 * Auto-detects project type and generates conventional boilerplate code.
 *
 * Usage:
 *   orion generate component LoginForm      # React/Vue/Svelte component
 *   orion generate api /users               # API route/endpoint
 *   orion generate model User               # Data model / schema
 *   orion generate hook useAuth             # Custom hook (React)
 *   orion generate test src/auth.ts         # Generate tests (alias for orion test --generate)
 *   orion generate middleware auth           # Express/Koa middleware
 *   orion generate page Dashboard           # Page component (Next.js/Nuxt)
 *   orion generate service AuthService      # Service class
 */

import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import { askAI } from '../ai-client.js';
import {
  colors,
  printInfo,
  printSuccess,
  printError,
  printWarning,
  startSpinner,
  stopSpinner,
  writeFileContent,
  getCurrentDirectoryContext,
  loadProjectContext,
  detectLanguage,
} from '../utils.js';
import { renderMarkdown } from '../markdown.js';
import {
  createSilentStreamHandler,
} from '../shared.js';
import { getPipelineOptions, jsonOutput } from '../pipeline.js';
import {
  commandHeader,
  table as uiTable,
  divider,
  statusLine,
  badge,
  box,
  palette,
} from '../ui.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type GeneratorType = 'component' | 'api' | 'model' | 'hook' | 'test' | 'middleware' | 'page' | 'service';

interface ProjectType {
  name: string;
  framework: string;
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java';
  hasTypeScript: boolean;
  styling?: string;
  stateManagement?: string;
  testFramework?: string;
}

interface GenerateResult {
  filePath: string;
  content: string;
  type: GeneratorType;
  name: string;
}

// ─── Valid Generator Types ───────────────────────────────────────────────────

const GENERATOR_TYPES: Record<GeneratorType, { label: string; description: string }> = {
  component: { label: 'Component', description: 'UI component (React, Vue, Svelte, Angular)' },
  api:       { label: 'API',       description: 'API route / endpoint handler' },
  model:     { label: 'Model',     description: 'Data model / database schema' },
  hook:      { label: 'Hook',      description: 'Custom hook (React useX, Vue composable)' },
  test:      { label: 'Test',      description: 'Test file for a source module' },
  middleware:{ label: 'Middleware', description: 'Middleware function (Express, Koa, Fastify)' },
  page:      { label: 'Page',      description: 'Page component (Next.js, Nuxt, SvelteKit)' },
  service:   { label: 'Service',   description: 'Service / business logic class' },
};

// ─── Project Type Detector ───────────────────────────────────────────────────

function detectProjectType(): ProjectType {
  const cwd = process.cwd();
  const result: ProjectType = {
    name: 'unknown',
    framework: 'generic',
    language: 'typescript',
    hasTypeScript: false,
  };

  // Check for TypeScript
  if (fs.existsSync(path.join(cwd, 'tsconfig.json'))) {
    result.hasTypeScript = true;
    result.language = 'typescript';
  }

  // Read package.json for framework detection
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      result.name = pkg.name || 'unknown';

      // Detect framework
      if (allDeps['next']) {
        result.framework = 'nextjs';
      } else if (allDeps['nuxt'] || allDeps['nuxt3']) {
        result.framework = 'nuxt';
      } else if (allDeps['@sveltejs/kit']) {
        result.framework = 'sveltekit';
      } else if (allDeps['svelte']) {
        result.framework = 'svelte';
      } else if (allDeps['@angular/core']) {
        result.framework = 'angular';
      } else if (allDeps['vue']) {
        result.framework = 'vue';
      } else if (allDeps['react'] || allDeps['react-dom']) {
        result.framework = 'react';
      } else if (allDeps['express']) {
        result.framework = 'express';
      } else if (allDeps['fastify']) {
        result.framework = 'fastify';
      } else if (allDeps['koa']) {
        result.framework = 'koa';
      } else if (allDeps['hono']) {
        result.framework = 'hono';
      } else if (allDeps['@nestjs/core']) {
        result.framework = 'nestjs';
      }

      // Detect styling
      if (allDeps['tailwindcss']) result.styling = 'tailwind';
      else if (allDeps['styled-components']) result.styling = 'styled-components';
      else if (allDeps['@emotion/react']) result.styling = 'emotion';
      else if (allDeps['sass'] || allDeps['node-sass']) result.styling = 'scss';

      // Detect state management
      if (allDeps['zustand']) result.stateManagement = 'zustand';
      else if (allDeps['@reduxjs/toolkit'] || allDeps['redux']) result.stateManagement = 'redux';
      else if (allDeps['jotai']) result.stateManagement = 'jotai';
      else if (allDeps['pinia']) result.stateManagement = 'pinia';
      else if (allDeps['mobx']) result.stateManagement = 'mobx';

      // Detect test framework
      if (allDeps['vitest']) result.testFramework = 'vitest';
      else if (allDeps['jest']) result.testFramework = 'jest';
      else if (allDeps['mocha']) result.testFramework = 'mocha';

      // Infer language if no tsconfig
      if (!result.hasTypeScript) {
        result.language = 'javascript';
      }
    } catch { /* ignore parse errors */ }
  }

  // Non-JS/TS projects
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    result.framework = 'rust';
    result.language = 'rust';
  } else if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    result.framework = 'go';
    result.language = 'go';
  } else if (fs.existsSync(path.join(cwd, 'pyproject.toml'))
    || fs.existsSync(path.join(cwd, 'requirements.txt'))
    || fs.existsSync(path.join(cwd, 'setup.py'))) {

    result.language = 'python';
    // Detect Python frameworks
    const reqFiles = ['requirements.txt', 'pyproject.toml', 'setup.py'];
    for (const reqFile of reqFiles) {
      const reqPath = path.join(cwd, reqFile);
      if (fs.existsSync(reqPath)) {
        try {
          const content = fs.readFileSync(reqPath, 'utf-8');
          if (content.includes('fastapi')) result.framework = 'fastapi';
          else if (content.includes('django')) result.framework = 'django';
          else if (content.includes('flask')) result.framework = 'flask';
        } catch { /* ignore */ }
      }
    }
    if (result.framework === 'generic') result.framework = 'python';
  } else if (fs.existsSync(path.join(cwd, 'pom.xml'))
    || fs.existsSync(path.join(cwd, 'build.gradle'))
    || fs.existsSync(path.join(cwd, 'build.gradle.kts'))) {
    result.framework = 'java';
    result.language = 'java';
  }

  return result;
}

// ─── File Path Resolution ────────────────────────────────────────────────────

function resolveOutputPath(type: GeneratorType, name: string, project: ProjectType): string {
  const ext = project.hasTypeScript ? '.tsx' : '.jsx';
  const plainExt = project.hasTypeScript ? '.ts' : '.js';
  const cwd = process.cwd();

  switch (type) {
    case 'component': {
      // React / Vue / Svelte / Angular
      if (project.framework === 'nextjs') {
        return path.join(cwd, 'components', `${name}${ext}`);
      }
      if (project.framework === 'vue' || project.framework === 'nuxt') {
        return path.join(cwd, 'components', `${name}.vue`);
      }
      if (project.framework === 'svelte' || project.framework === 'sveltekit') {
        return path.join(cwd, 'src', 'lib', 'components', `${name}.svelte`);
      }
      if (project.framework === 'angular') {
        const kebab = name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
        return path.join(cwd, 'src', 'app', 'components', kebab, `${kebab}.component.ts`);
      }
      // Default React
      return path.join(cwd, 'src', 'components', `${name}${ext}`);
    }

    case 'api': {
      // Normalize route path
      const routeName = name.startsWith('/') ? name.substring(1) : name;
      const routeFile = routeName.replace(/\//g, '-') || 'index';

      if (project.framework === 'nextjs') {
        // App Router convention
        return path.join(cwd, 'app', 'api', routeName, `route${plainExt}`);
      }
      if (project.framework === 'express' || project.framework === 'fastify' || project.framework === 'koa') {
        return path.join(cwd, 'src', 'routes', `${routeFile}${plainExt}`);
      }
      if (project.framework === 'nestjs') {
        return path.join(cwd, 'src', routeFile, `${routeFile}.controller${plainExt}`);
      }
      if (project.framework === 'fastapi') {
        return path.join(cwd, 'app', 'routers', `${routeFile}.py`);
      }
      if (project.framework === 'django') {
        return path.join(cwd, 'api', `views_${routeFile}.py`);
      }
      if (project.framework === 'flask') {
        return path.join(cwd, 'app', 'routes', `${routeFile}.py`);
      }
      if (project.framework === 'go') {
        return path.join(cwd, 'handlers', `${routeFile}.go`);
      }
      if (project.framework === 'rust') {
        return path.join(cwd, 'src', 'handlers', `${routeFile}.rs`);
      }
      return path.join(cwd, 'src', 'api', `${routeFile}${plainExt}`);
    }

    case 'model': {
      const modelName = name.charAt(0).toLowerCase() + name.slice(1);
      if (project.framework === 'django') {
        return path.join(cwd, 'models', `${modelName}.py`);
      }
      if (project.language === 'python') {
        return path.join(cwd, 'models', `${modelName}.py`);
      }
      if (project.framework === 'go') {
        return path.join(cwd, 'models', `${modelName}.go`);
      }
      if (project.framework === 'rust') {
        return path.join(cwd, 'src', 'models', `${modelName}.rs`);
      }
      if (project.framework === 'java') {
        return path.join(cwd, 'src', 'main', 'java', 'models', `${name}.java`);
      }
      return path.join(cwd, 'src', 'models', `${modelName}${plainExt}`);
    }

    case 'hook': {
      // Ensure hook name starts with 'use'
      const hookName = name.startsWith('use') ? name : `use${name.charAt(0).toUpperCase() + name.slice(1)}`;
      if (project.framework === 'vue' || project.framework === 'nuxt') {
        return path.join(cwd, 'composables', `${hookName}${plainExt}`);
      }
      return path.join(cwd, 'src', 'hooks', `${hookName}${plainExt}`);
    }

    case 'test': {
      // Test files go next to their source or in a tests/ dir
      const parsed = path.parse(name);
      const lang = detectLanguage(name);

      if (lang === 'python') {
        return path.join(cwd, 'tests', `test_${parsed.name}.py`);
      }
      if (lang === 'go') {
        return path.join(parsed.dir || cwd, `${parsed.name}_test.go`);
      }
      if (lang === 'rust') {
        return path.join(cwd, 'tests', `${parsed.name}_test.rs`);
      }
      // JS/TS: sibling test file
      const testExt = parsed.ext || plainExt;
      return path.join(parsed.dir || path.join(cwd, 'src'), `${parsed.name}.test${testExt}`);
    }

    case 'middleware': {
      const mwName = name.charAt(0).toLowerCase() + name.slice(1);
      if (project.framework === 'nextjs') {
        return path.join(cwd, `middleware${plainExt}`);
      }
      if (project.language === 'python') {
        return path.join(cwd, 'middleware', `${mwName}.py`);
      }
      if (project.framework === 'go') {
        return path.join(cwd, 'middleware', `${mwName}.go`);
      }
      return path.join(cwd, 'src', 'middleware', `${mwName}${plainExt}`);
    }

    case 'page': {
      const pageName = name.charAt(0).toLowerCase() + name.slice(1);
      if (project.framework === 'nextjs') {
        return path.join(cwd, 'app', pageName, `page${ext}`);
      }
      if (project.framework === 'nuxt') {
        return path.join(cwd, 'pages', `${pageName}.vue`);
      }
      if (project.framework === 'sveltekit') {
        return path.join(cwd, 'src', 'routes', pageName, '+page.svelte');
      }
      return path.join(cwd, 'src', 'pages', `${name}${ext}`);
    }

    case 'service': {
      const svcName = name.charAt(0).toLowerCase() + name.slice(1);
      if (project.language === 'python') {
        return path.join(cwd, 'services', `${svcName}.py`);
      }
      if (project.framework === 'go') {
        return path.join(cwd, 'services', `${svcName}.go`);
      }
      if (project.framework === 'rust') {
        return path.join(cwd, 'src', 'services', `${svcName}.rs`);
      }
      if (project.framework === 'java') {
        return path.join(cwd, 'src', 'main', 'java', 'services', `${name}Service.java`);
      }
      if (project.framework === 'nestjs') {
        return path.join(cwd, 'src', svcName, `${svcName}.service${plainExt}`);
      }
      return path.join(cwd, 'src', 'services', `${svcName}${plainExt}`);
    }

    default:
      return path.join(cwd, 'src', `${name}${plainExt}`);
  }
}

// ─── AI Generation Prompt ────────────────────────────────────────────────────

function buildGeneratePrompt(type: GeneratorType, name: string, project: ProjectType, outputPath: string): string {
  const projectInfo = [
    `Framework: ${project.framework}`,
    `Language: ${project.language}`,
    `TypeScript: ${project.hasTypeScript ? 'Yes' : 'No'}`,
    project.styling ? `Styling: ${project.styling}` : null,
    project.stateManagement ? `State: ${project.stateManagement}` : null,
    project.testFramework ? `Testing: ${project.testFramework}` : null,
  ].filter(Boolean).join('\n');

  return `You are Orion, an expert code generator. Generate production-quality ${GENERATOR_TYPES[type].label.toLowerCase()} code.

Project:
${projectInfo}

Target file: ${outputPath}

Rules:
1. Output ONLY the file content - no markdown fences, no explanations
2. Follow the project's conventions (${project.framework}, ${project.language})
3. Include all necessary imports
4. Add JSDoc/docstring comments for public APIs
5. Use modern patterns and best practices for ${project.framework}
6. If TypeScript, use proper type annotations (no \`any\`)
7. Include error handling where appropriate
8. Make the code production-ready, not just a skeleton
9. Follow naming conventions for the framework (PascalCase components, camelCase hooks, etc.)
${project.styling === 'tailwind' ? '10. Use Tailwind CSS classes for styling' : ''}
${type === 'component' ? '11. Include prop types/interface and sensible defaults' : ''}
${type === 'api' ? '11. Include input validation, error responses, and proper HTTP status codes' : ''}
${type === 'model' ? '11. Include field validations and common methods (toJSON, etc.)' : ''}
${type === 'hook' ? '11. Return a well-typed interface and handle loading/error states' : ''}
${type === 'test' ? '11. Cover happy paths, edge cases, and error scenarios' : ''}
${type === 'service' ? '11. Use dependency injection patterns and include error handling' : ''}`;
}

// ─── Framework Badge ─────────────────────────────────────────────────────────

function frameworkBadge(framework: string): string {
  const FRAMEWORK_COLORS: Record<string, string> = {
    react: '#61DAFB',
    nextjs: '#000000',
    vue: '#42B883',
    nuxt: '#00DC82',
    svelte: '#FF3E00',
    sveltekit: '#FF3E00',
    angular: '#DD0031',
    express: '#000000',
    fastify: '#000000',
    koa: '#33333D',
    nestjs: '#E0234E',
    fastapi: '#009688',
    django: '#092E20',
    flask: '#000000',
    go: '#00ADD8',
    rust: '#DEA584',
    java: '#ED8B00',
    python: '#3776AB',
    hono: '#FF6B35',
    generic: '#7C5CFC',
  };

  const FRAMEWORK_NAMES: Record<string, string> = {
    react: 'React',
    nextjs: 'Next.js',
    vue: 'Vue',
    nuxt: 'Nuxt',
    svelte: 'Svelte',
    sveltekit: 'SvelteKit',
    angular: 'Angular',
    express: 'Express',
    fastify: 'Fastify',
    koa: 'Koa',
    nestjs: 'NestJS',
    fastapi: 'FastAPI',
    django: 'Django',
    flask: 'Flask',
    go: 'Go',
    rust: 'Rust',
    java: 'Java',
    python: 'Python',
    hono: 'Hono',
    generic: 'Generic',
  };

  const color = FRAMEWORK_COLORS[framework] || '#7C5CFC';
  const name = FRAMEWORK_NAMES[framework] || framework;
  return badge(name, color);
}

// ─── Main Command ────────────────────────────────────────────────────────────

export async function generateCommand(type: string, name: string, options?: { force?: boolean }): Promise<void> {
  // Validate generator type
  const validType = type?.toLowerCase() as GeneratorType;

  if (!type || !GENERATOR_TYPES[validType]) {
    console.log(commandHeader('Orion Generate'));
    console.log();

    if (type) {
      printError(`Unknown generator type: "${type}"`);
      console.log();
    }

    console.log(`  ${palette.dim('Available generators:')}`);
    console.log();
    console.log(uiTable(
      ['Type', 'Description', 'Example'],
      Object.entries(GENERATOR_TYPES).map(([key, val]) => {
        const examples: Record<string, string> = {
          component: 'LoginForm',
          api: '/users',
          model: 'User',
          hook: 'useAuth',
          test: 'src/auth.ts',
          middleware: 'auth',
          page: 'Dashboard',
          service: 'AuthService',
        };
        return [
          palette.violet(key),
          val.description,
          palette.dim(`orion generate ${key} ${examples[key] || 'Name'}`),
        ];
      }),
    ));
    console.log();
    process.exit(1);
  }

  if (!name || !name.trim()) {
    console.log(commandHeader('Orion Generate'));
    console.log();
    printError(`Name is required for ${GENERATOR_TYPES[validType].label} generator.`);
    console.log();
    console.log(`  ${palette.dim('Usage:')} ${colors.command(`orion generate ${validType}`)} ${palette.dim('<name>')}`);
    console.log();
    process.exit(1);
  }

  // Detect project type
  const projectSpinner = startSpinner('Detecting project type...');
  const project = detectProjectType();
  stopSpinner(projectSpinner, `Detected: ${project.framework} (${project.language})`);

  // Resolve output path
  const outputPath = resolveOutputPath(validType, name, project);
  const relativePath = path.relative(process.cwd(), outputPath);

  console.log(commandHeader(`Orion Generate: ${GENERATOR_TYPES[validType].label}`, [
    ['Name', name],
    ['Framework', frameworkBadge(project.framework)],
    ['Language', project.language + (project.hasTypeScript ? ' (TypeScript)' : '')],
    ['Output', colors.file(relativePath)],
  ]));

  // Check if file already exists
  if (fs.existsSync(outputPath)) {
    const pipelineOpts = getPipelineOptions();

    if (!options?.force && !pipelineOpts.yes) {
      const answer = await inquirer.prompt([{
        type: 'confirm',
        name: 'overwrite',
        message: `File already exists at ${relativePath}. Overwrite?`,
        default: false,
      }]);

      if (!answer.overwrite) {
        printInfo('Aborted. Existing file unchanged.');
        console.log();
        return;
      }
    } else if (!options?.force) {
      // --yes mode but no --force: warn and proceed
      printWarning(`Overwriting existing file: ${relativePath}`);
    }
  }

  // Generate code via AI
  const generateSpinner = startSpinner(`Generating ${GENERATOR_TYPES[validType].label.toLowerCase()}...`);

  try {
    const dirContext = getCurrentDirectoryContext();
    const projectContext = loadProjectContext();
    const systemPrompt = buildGeneratePrompt(validType, name, project, relativePath);

    const userMessage = [
      `Generate a ${GENERATOR_TYPES[validType].label.toLowerCase()} named "${name}".`,
      `Type: ${validType}`,
      `Output file: ${relativePath}`,
      '',
      `Project context:`,
      dirContext,
    ].join('\n');

    const fullPrompt = projectContext
      ? systemPrompt + '\n\nAdditional project context:\n' + projectContext
      : systemPrompt;

    const { callbacks, getResponse } = createSilentStreamHandler(generateSpinner, 'Code generated');
    await askAI(fullPrompt, userMessage, callbacks);

    let generatedCode = getResponse().trim();

    // Clean up potential code fences from AI response
    if (generatedCode.startsWith('```')) {
      const lines = generatedCode.split('\n');
      lines.shift(); // Remove opening fence
      if (lines[lines.length - 1]?.trim() === '```') {
        lines.pop(); // Remove closing fence
      }
      generatedCode = lines.join('\n');
    }

    // Preview the generated code
    const pipelineOpts = getPipelineOptions();

    if (!pipelineOpts.quiet) {
      console.log();
      console.log(divider(`Preview: ${relativePath}`));
      console.log();

      // Show code with line numbers
      const previewLines = generatedCode.split('\n');
      const maxPreview = 40;
      const showLines = previewLines.slice(0, maxPreview);

      for (let i = 0; i < showLines.length; i++) {
        const lineNum = palette.dim(String(i + 1).padStart(4, ' ') + ' \u2502');
        console.log(`  ${lineNum} ${palette.white(showLines[i])}`);
      }

      if (previewLines.length > maxPreview) {
        console.log(palette.dim(`  \u2026 and ${previewLines.length - maxPreview} more lines`));
      }

      console.log();
      console.log(divider());
      console.log();
    }

    // Confirm before writing (unless --yes or --force)
    let shouldWrite = options?.force || false;

    if (!shouldWrite && !pipelineOpts.yes) {
      const answer = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'Write this file?',
        choices: [
          { name: 'Write file', value: 'write' },
          { name: 'Regenerate', value: 'regenerate' },
          { name: 'Cancel', value: 'cancel' },
        ],
      }]);

      if (answer.action === 'regenerate') {
        await generateCommand(type, name, options);
        return;
      }

      shouldWrite = answer.action === 'write';
    } else {
      shouldWrite = true;
    }

    if (shouldWrite) {
      if (pipelineOpts.dryRun) {
        printInfo('Dry run: no files were written.');
        jsonOutput('generate', {
          type: validType,
          name,
          file: outputPath,
          framework: project.framework,
          dryRun: true,
        });
        console.log();
        return;
      }

      // Ensure target directory exists
      const targetDir = path.dirname(outputPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      writeFileContent(outputPath, generatedCode);

      console.log();
      printSuccess(`Created: ${colors.file(relativePath)}`);
      console.log();

      // Show helpful next steps
      console.log(`  ${palette.dim('Next steps:')}`);

      if (validType === 'component') {
        console.log(`    ${palette.dim('1.')} Import and use in your app`);
        console.log(`    ${palette.dim('2.')} ${colors.command(`orion generate test ${relativePath}`)} to add tests`);
      } else if (validType === 'api') {
        console.log(`    ${palette.dim('1.')} Register the route in your app`);
        console.log(`    ${palette.dim('2.')} ${colors.command(`orion review ${relativePath}`)} to review the code`);
      } else if (validType === 'test') {
        console.log(`    ${palette.dim('1.')} ${colors.command('orion test')} to run the tests`);
      } else {
        console.log(`    ${palette.dim('1.')} ${colors.command(`orion review ${relativePath}`)} to review the code`);
        console.log(`    ${palette.dim('2.')} ${colors.command(`orion edit ${relativePath}`)} to customize further`);
      }
      console.log();

      jsonOutput('generate', {
        type: validType,
        name,
        file: outputPath,
        framework: project.framework,
        language: project.language,
        lines: generatedCode.split('\n').length,
      });
    } else {
      printInfo('Generation cancelled. No files written.');
      console.log();
    }
  } catch (err: any) {
    stopSpinner(generateSpinner, err.message, false);
    printError(`Code generation failed: ${err.message}`);
    printInfo('Run `orion config` to check your AI provider settings.');
    console.log();
    process.exit(1);
  }
}
