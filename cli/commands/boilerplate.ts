/**
 * Orion CLI - Boilerplate Generation Command
 * Generates common boilerplate files instantly from built-in templates.
 * No AI needed -- fast and offline-capable.
 *
 * Usage:
 *   orion boilerplate express-api          # Generate Express API boilerplate
 *   orion boilerplate react-component      # React component template
 *   orion boilerplate dockerfile           # Dockerfile for current project
 *   orion boilerplate github-actions       # CI/CD workflow
 *   orion boilerplate readme               # README template
 *   orion boilerplate --list               # Show all templates
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  colors,
  printInfo,
  printSuccess,
  printError,
  printWarning,
} from '../utils.js';
import { getPipelineOptions, jsonOutput } from '../pipeline.js';
import {
  commandHeader,
  table as uiTable,
  palette,
  badge,
} from '../ui.js';

// ─── Template Registry ────────────────────────────────────────────────────

export interface BoilerplateTemplate {
  name: string;
  description: string;
  category: 'backend' | 'frontend' | 'devops' | 'docs' | 'testing' | 'config';
  files: { path: string; content: string }[];
}

function categoryBadge(category: string): string {
  const colorMap: Record<string, string> = {
    backend: '#22C55E',
    frontend: '#61DAFB',
    devops: '#F59E0B',
    docs: '#A78BFA',
    testing: '#EC4899',
    config: '#6B7280',
  };
  return badge(category, colorMap[category] || '#7C5CFC');
}

// ─── Built-in Templates ───────────────────────────────────────────────────

export const TEMPLATES: Record<string, BoilerplateTemplate> = {
  'express-api': {
    name: 'Express API',
    description: 'Express.js REST API with routing, middleware, and error handling',
    category: 'backend',
    files: [
      {
        path: 'src/index.ts',
        content: `import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(\`[\${new Date().toISOString()}] \${req.method} \${req.path}\`);
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// API routes
app.get('/api', (_req: Request, res: Response) => {
  res.json({ message: 'Welcome to the API', version: '1.0.0' });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
});

export default app;
`,
      },
      {
        path: 'package.json',
        content: JSON.stringify({
          name: 'express-api',
          version: '0.1.0',
          private: true,
          scripts: {
            dev: 'tsx watch src/index.ts',
            build: 'tsc',
            start: 'node dist/index.js',
            lint: 'eslint src/',
          },
          dependencies: {
            express: '^4.19.0',
            cors: '^2.8.5',
            helmet: '^7.1.0',
          },
          devDependencies: {
            tsx: '^4.15.0',
            typescript: '^5.5.0',
            '@types/express': '^4.17.0',
            '@types/cors': '^2.8.0',
            '@types/node': '^20.0.0',
          },
        }, null, 2) + '\n',
      },
    ],
  },

  'react-component': {
    name: 'React Component',
    description: 'React functional component with TypeScript, props, and tests',
    category: 'frontend',
    files: [
      {
        path: 'Component.tsx',
        content: `import React from 'react';

export interface ComponentProps {
  /** The main title text */
  title: string;
  /** Optional description below the title */
  description?: string;
  /** Optional children elements */
  children?: React.ReactNode;
  /** Optional CSS class name */
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

export const Component: React.FC<ComponentProps> = ({
  title,
  description,
  children,
  className = '',
  onClick,
}) => {
  return (
    <div className={\`component \${className}\`.trim()} onClick={onClick} role={onClick ? 'button' : undefined}>
      <h2 className="component-title">{title}</h2>
      {description && <p className="component-description">{description}</p>}
      {children && <div className="component-content">{children}</div>}
    </div>
  );
};

export default Component;
`,
      },
      {
        path: 'Component.test.tsx',
        content: `import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Component } from './Component';

describe('Component', () => {
  it('renders the title', () => {
    render(<Component title="Hello" />);
    expect(screen.getByText('Hello')).toBeDefined();
  });

  it('renders description when provided', () => {
    render(<Component title="Title" description="A description" />);
    expect(screen.getByText('A description')).toBeDefined();
  });

  it('renders children', () => {
    render(<Component title="Title"><span>Child</span></Component>);
    expect(screen.getByText('Child')).toBeDefined();
  });
});
`,
      },
    ],
  },

  'dockerfile': {
    name: 'Dockerfile',
    description: 'Multi-stage Dockerfile for Node.js applications',
    category: 'devops',
    files: [
      {
        path: 'Dockerfile',
        content: `# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files first for better caching
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \\
    adduser -S appuser -u 1001 -G appgroup

# Copy only production dependencies
COPY package*.json ./
RUN npm ci --production && npm cache clean --force

# Copy built output
COPY --from=builder /app/dist ./dist

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
`,
      },
      {
        path: '.dockerignore',
        content: `node_modules
dist
.git
.gitignore
.env
.env.*
*.md
.vscode
.idea
coverage
.nyc_output
*.log
`,
      },
    ],
  },

  'github-actions': {
    name: 'GitHub Actions CI/CD',
    description: 'GitHub Actions workflow for Node.js CI/CD with lint, test, and build',
    category: 'devops',
    files: [
      {
        path: '.github/workflows/ci.yml',
        content: `name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint --if-present

      - name: Type check
        run: npm run typecheck --if-present

      - name: Test
        run: npm test --if-present

      - name: Build
        run: npm run build

  deploy:
    needs: lint-and-test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install and build
        run: |
          npm ci
          npm run build

      - name: Deploy
        run: echo "Add your deployment steps here"
`,
      },
    ],
  },

  'readme': {
    name: 'README',
    description: 'Professional README template with badges, usage, and contribution guide',
    category: 'docs',
    files: [
      {
        path: 'README.md',
        content: `# Project Name

[![CI](https://github.com/your-org/your-repo/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/your-repo/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A brief description of what this project does.

## Features

- Feature 1
- Feature 2
- Feature 3

## Prerequisites

- Node.js >= 18
- npm >= 9

## Installation

\`\`\`bash
git clone https://github.com/your-org/your-repo.git
cd your-repo
npm install
\`\`\`

## Usage

\`\`\`bash
npm run dev      # Start development server
npm run build    # Build for production
npm test         # Run tests
\`\`\`

## API Reference

### \`GET /api/health\`

Returns the health status of the service.

**Response:**
\`\`\`json
{
  "status": "ok",
  "uptime": 123.456
}
\`\`\`

## Project Structure

\`\`\`
.
├── src/           # Source code
├── tests/         # Test files
├── docs/          # Documentation
├── .github/       # GitHub Actions workflows
├── package.json
└── README.md
\`\`\`

## Contributing

1. Fork the repository
2. Create your feature branch (\`git checkout -b feature/amazing-feature\`)
3. Commit your changes (\`git commit -m 'Add amazing feature'\`)
4. Push to the branch (\`git push origin feature/amazing-feature\`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
`,
      },
    ],
  },

  'tsconfig': {
    name: 'TypeScript Config',
    description: 'Strict TypeScript configuration for modern Node.js projects',
    category: 'config',
    files: [
      {
        path: 'tsconfig.json',
        content: JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            lib: ['ES2022'],
            outDir: './dist',
            rootDir: './src',
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            resolveJsonModule: true,
            declaration: true,
            declarationMap: true,
            sourceMap: true,
            isolatedModules: true,
            noUncheckedIndexedAccess: true,
            noImplicitOverride: true,
            noPropertyAccessFromIndexSignature: true,
          },
          include: ['src'],
          exclude: ['node_modules', 'dist'],
        }, null, 2) + '\n',
      },
    ],
  },

  'eslint': {
    name: 'ESLint Config',
    description: 'ESLint flat config for TypeScript with recommended rules',
    category: 'config',
    files: [
      {
        path: 'eslint.config.js',
        content: `import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },
);
`,
      },
    ],
  },

  'vitest': {
    name: 'Vitest Config',
    description: 'Vitest testing setup with coverage and TypeScript support',
    category: 'testing',
    files: [
      {
        path: 'vitest.config.ts',
        content: `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.d.ts',
      ],
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    testTimeout: 10000,
  },
});
`,
      },
      {
        path: 'src/__tests__/example.test.ts',
        content: `import { describe, it, expect } from 'vitest';

describe('example', () => {
  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle strings', () => {
    expect('hello world').toContain('world');
  });
});
`,
      },
    ],
  },

  'gitignore': {
    name: '.gitignore',
    description: 'Comprehensive .gitignore for Node.js/TypeScript projects',
    category: 'config',
    files: [
      {
        path: '.gitignore',
        content: `# Dependencies
node_modules/
.pnp
.pnp.js

# Build output
dist/
build/
out/
.next/
.nuxt/
.svelte-kit/

# Environment files
.env
.env.local
.env.*.local

# IDE
.vscode/settings.json
.idea/
*.swp
*.swo
*~
.project
.classpath

# OS files
.DS_Store
Thumbs.db
Desktop.ini

# Logs
*.log
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*

# Coverage
coverage/
.nyc_output/
*.lcov

# Cache
.cache/
.eslintcache
.tsbuildinfo
*.tsbuildinfo

# Misc
*.tgz
.yarn-integrity
`,
      },
    ],
  },

  'prettier': {
    name: 'Prettier Config',
    description: 'Prettier configuration for consistent code formatting',
    category: 'config',
    files: [
      {
        path: '.prettierrc',
        content: JSON.stringify({
          semi: true,
          singleQuote: true,
          trailingComma: 'all',
          printWidth: 100,
          tabWidth: 2,
          useTabs: false,
          bracketSpacing: true,
          arrowParens: 'always',
          endOfLine: 'lf',
        }, null, 2) + '\n',
      },
      {
        path: '.prettierignore',
        content: `node_modules
dist
build
coverage
*.min.js
*.min.css
package-lock.json
pnpm-lock.yaml
`,
      },
    ],
  },

  'jest': {
    name: 'Jest Config',
    description: 'Jest testing setup with TypeScript support via ts-jest',
    category: 'testing',
    files: [
      {
        path: 'jest.config.ts',
        content: `import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
};

export default config;
`,
      },
    ],
  },

  'editorconfig': {
    name: 'EditorConfig',
    description: 'EditorConfig for consistent coding styles across editors',
    category: 'config',
    files: [
      {
        path: '.editorconfig',
        content: `# EditorConfig - https://editorconfig.org

root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 2
indent_style = space
insert_final_newline = true
trim_trailing_whitespace = true
max_line_length = 100

[*.md]
trim_trailing_whitespace = false
max_line_length = off

[*.{yml,yaml}]
indent_size = 2

[Makefile]
indent_style = tab

[*.go]
indent_style = tab
indent_size = 4
`,
      },
    ],
  },

  'license-mit': {
    name: 'MIT License',
    description: 'MIT License file',
    category: 'docs',
    files: [
      {
        path: 'LICENSE',
        content: `MIT License

Copyright (c) ${new Date().getFullYear()} [Your Name]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
      },
    ],
  },
};

// ─── Template Listing ─────────────────────────────────────────────────────

export function listTemplates(): { name: string; description: string; category: string }[] {
  return Object.entries(TEMPLATES).map(([key, tpl]) => ({
    name: key,
    description: tpl.description,
    category: tpl.category,
  }));
}

// ─── File Writer ──────────────────────────────────────────────────────────

export function writeTemplateFiles(
  templateKey: string,
  outputDir: string,
  options: { force?: boolean } = {},
): { created: string[]; skipped: string[] } {
  const template = TEMPLATES[templateKey];
  if (!template) {
    throw new Error(`Unknown template: "${templateKey}"`);
  }

  const created: string[] = [];
  const skipped: string[] = [];

  for (const file of template.files) {
    const fullPath = path.join(outputDir, file.path);
    const dir = path.dirname(fullPath);

    // Skip existing files unless --force
    if (fs.existsSync(fullPath) && !options.force) {
      skipped.push(file.path);
      continue;
    }

    // Create directories recursively
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, file.content, 'utf-8');
    created.push(file.path);
  }

  return { created, skipped };
}

// ─── Main Command ─────────────────────────────────────────────────────────

export async function boilerplateCommand(
  templateName?: string,
  options?: { list?: boolean; force?: boolean; output?: string },
): Promise<void> {
  const pipelineOpts = getPipelineOptions();

  // --list mode: show all templates
  if (options?.list || !templateName) {
    if (options?.list) {
      console.log(commandHeader('Orion Boilerplate: Available Templates'));
    } else {
      console.log(commandHeader('Orion Boilerplate'));
    }
    console.log();
    console.log(uiTable(
      ['Template', 'Category', 'Description'],
      Object.entries(TEMPLATES).map(([key, tpl]) => [
        palette.violet(key),
        categoryBadge(tpl.category),
        tpl.description,
      ]),
    ));
    console.log();
    printInfo(`Usage: ${colors.command('orion boilerplate <template>')} [--force] [--output <dir>]`);
    console.log();

    jsonOutput('boilerplate', {
      action: 'list',
      templates: listTemplates(),
    });
    return;
  }

  // Resolve template
  const templateKey = templateName.toLowerCase();
  if (!TEMPLATES[templateKey]) {
    console.log(commandHeader('Orion Boilerplate'));
    console.log();
    printError(`Unknown template: "${templateName}"`);
    console.log();
    printInfo('Available templates:');
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
      console.log(`    ${colors.command(key.padEnd(20))} ${palette.dim(tpl.description)}`);
    }
    console.log();
    printInfo(`Run ${colors.command('orion boilerplate --list')} for the full list.`);
    console.log();
    return;
  }

  const template = TEMPLATES[templateKey];
  const outputDir = options?.output ? path.resolve(options.output) : process.cwd();

  console.log(commandHeader('Orion Boilerplate', [
    ['Template', `${template.name} ${categoryBadge(template.category)}`],
    ['Output', colors.file(outputDir)],
    ['Files', String(template.files.length)],
  ]));

  if (pipelineOpts.dryRun) {
    console.log();
    printInfo('Dry run -- files that would be created:');
    for (const file of template.files) {
      console.log(`    ${palette.dim('+')} ${colors.file(file.path)}`);
    }
    console.log();
    jsonOutput('boilerplate', {
      template: templateKey,
      dryRun: true,
      files: template.files.map(f => f.path),
    });
    return;
  }

  // Write files
  const { created, skipped } = writeTemplateFiles(templateKey, outputDir, {
    force: options?.force || pipelineOpts.yes,
  });

  // Summary
  console.log();
  if (created.length > 0) {
    for (const file of created) {
      console.log(`  ${palette.green('+')} ${colors.file(file)}`);
    }
  }
  if (skipped.length > 0) {
    console.log();
    for (const file of skipped) {
      console.log(`  ${palette.dim('~')} ${palette.dim(file)} ${palette.dim('(exists, use --force to overwrite)')}`);
    }
  }
  console.log();

  if (created.length > 0) {
    printSuccess(`Generated ${created.length} file${created.length > 1 ? 's' : ''} from "${template.name}" template.`);
  } else if (skipped.length > 0) {
    printWarning('All files already exist. Use --force to overwrite.');
  }

  if (skipped.length > 0 && created.length > 0) {
    printInfo(`${skipped.length} file${skipped.length > 1 ? 's' : ''} skipped (already exist).`);
  }

  console.log();

  jsonOutput('boilerplate', {
    template: templateKey,
    outputDir,
    created,
    skipped,
  });
}
