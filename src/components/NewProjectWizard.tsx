import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  memo,
} from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Search,
  FolderOpen,
  Star,
  TrendingUp,
  Check,
  AlertCircle,
  Loader2,
  Layout,
  Server,
  Layers,
  Monitor,
  Package,
  Wrench,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useToastStore } from '@/store/toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  emoji: string;
  description: string;
  templateCount: number;
}

interface Template {
  id: string;
  categoryId: string;
  name: string;
  emoji: string;
  description: string;
  tags: string[];
  popular: boolean;
  stars: number;
  defaultOptions: Partial<ProjectOptions>;
}

interface ProjectOptions {
  typescript: boolean;
  eslint: boolean;
  prettier: boolean;
  testing: 'none' | 'jest' | 'vitest' | 'mocha';
  docker: boolean;
  ci: 'none' | 'github-actions' | 'gitlab-ci' | 'circleci';
}

interface WizardState {
  step: number;
  categoryId: string | null;
  templateId: string | null;
  projectName: string;
  directory: string;
  options: ProjectOptions;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const CATEGORIES: TemplateCategory[] = [
  {
    id: 'frontend',
    label: 'Frontend',
    icon: <Layout size={28} />,
    emoji: '\u{1F310}',
    description: 'Web applications and single-page apps',
    templateCount: 6,
  },
  {
    id: 'backend',
    label: 'Backend',
    icon: <Server size={28} />,
    emoji: '\u{2699}\u{FE0F}',
    description: 'APIs, microservices, and server apps',
    templateCount: 5,
  },
  {
    id: 'fullstack',
    label: 'Full-Stack',
    icon: <Layers size={28} />,
    emoji: '\u{1F4E6}',
    description: 'End-to-end web applications',
    templateCount: 4,
  },
  {
    id: 'desktop',
    label: 'Desktop',
    icon: <Monitor size={28} />,
    emoji: '\u{1F5A5}\u{FE0F}',
    description: 'Native desktop applications',
    templateCount: 3,
  },
  {
    id: 'library',
    label: 'Library',
    icon: <Package size={28} />,
    emoji: '\u{1F4DA}',
    description: 'Reusable packages and modules',
    templateCount: 3,
  },
  {
    id: 'tool',
    label: 'Tool',
    icon: <Wrench size={28} />,
    emoji: '\u{1F527}',
    description: 'CLI tools, scripts, and utilities',
    templateCount: 3,
  },
];

const TEMPLATES: Template[] = [
  // Frontend
  { id: 'react-vite', categoryId: 'frontend', name: 'React + Vite', emoji: '\u{269B}\u{FE0F}', description: 'Modern React app powered by Vite with HMR and optimised builds.', tags: ['React', 'Vite', 'SPA'], popular: true, stars: 4820, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'vitest', docker: false, ci: 'none' } },
  { id: 'nextjs', categoryId: 'frontend', name: 'Next.js', emoji: '\u{25B2}', description: 'Production-grade React framework with SSR, SSG, and API routes.', tags: ['React', 'Next.js', 'SSR'], popular: true, stars: 11200, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'jest', docker: false, ci: 'github-actions' } },
  { id: 'vue-vite', categoryId: 'frontend', name: 'Vue 3 + Vite', emoji: '\u{1F49A}', description: 'Vue 3 Composition API with Vite for lightning-fast development.', tags: ['Vue', 'Vite', 'SPA'], popular: false, stars: 3100, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'vitest', docker: false, ci: 'none' } },
  { id: 'svelte-kit', categoryId: 'frontend', name: 'SvelteKit', emoji: '\u{1F525}', description: 'Full-featured Svelte framework for building web apps of all sizes.', tags: ['Svelte', 'SvelteKit', 'SSR'], popular: false, stars: 2700, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'vitest', docker: false, ci: 'none' } },
  { id: 'astro', categoryId: 'frontend', name: 'Astro', emoji: '\u{1F680}', description: 'Content-driven websites with island architecture and zero JS by default.', tags: ['Astro', 'Static', 'Islands'], popular: true, stars: 5400, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'none', docker: false, ci: 'none' } },
  { id: 'vanilla-ts', categoryId: 'frontend', name: 'Vanilla TypeScript', emoji: '\u{1F4DD}', description: 'Minimal TypeScript project with Vite \u2014 no framework overhead.', tags: ['TypeScript', 'Vite', 'Minimal'], popular: false, stars: 890, defaultOptions: { typescript: true, eslint: true, prettier: false, testing: 'none', docker: false, ci: 'none' } },

  // Backend
  { id: 'express', categoryId: 'backend', name: 'Express', emoji: '\u{1F6E4}\u{FE0F}', description: 'Fast, unopinionated, minimalist web framework for Node.js.', tags: ['Node.js', 'Express', 'REST'], popular: true, stars: 6300, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'jest', docker: true, ci: 'github-actions' } },
  { id: 'fastify', categoryId: 'backend', name: 'Fastify', emoji: '\u{26A1}', description: 'High-performance web framework with schema-based validation.', tags: ['Node.js', 'Fastify', 'REST'], popular: false, stars: 2900, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'vitest', docker: true, ci: 'none' } },
  { id: 'nestjs', categoryId: 'backend', name: 'NestJS', emoji: '\u{1F431}', description: 'Progressive Node.js framework for scalable server-side applications.', tags: ['Node.js', 'NestJS', 'DI'], popular: true, stars: 7800, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'jest', docker: true, ci: 'github-actions' } },
  { id: 'hono', categoryId: 'backend', name: 'Hono', emoji: '\u{1F525}', description: 'Ultra-fast web framework targeting edge runtimes and Cloudflare Workers.', tags: ['Edge', 'Hono', 'Workers'], popular: false, stars: 1800, defaultOptions: { typescript: true, eslint: true, prettier: false, testing: 'vitest', docker: false, ci: 'none' } },
  { id: 'graphql-yoga', categoryId: 'backend', name: 'GraphQL Yoga', emoji: '\u{1F9D8}', description: 'Fully-featured GraphQL server with subscriptions and file uploads.', tags: ['GraphQL', 'Node.js', 'API'], popular: false, stars: 1400, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'jest', docker: true, ci: 'none' } },

  // Full-Stack
  { id: 't3', categoryId: 'fullstack', name: 'T3 Stack', emoji: '\u{1F4E6}', description: 'Next.js, tRPC, Tailwind, Prisma \u2014 the best of the TypeScript ecosystem.', tags: ['Next.js', 'tRPC', 'Prisma'], popular: true, stars: 9100, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'vitest', docker: false, ci: 'github-actions' } },
  { id: 'remix', categoryId: 'fullstack', name: 'Remix', emoji: '\u{1F4BF}', description: 'Full-stack React framework focused on web fundamentals and UX.', tags: ['React', 'Remix', 'Full-Stack'], popular: true, stars: 4600, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'vitest', docker: false, ci: 'none' } },
  { id: 'nuxt', categoryId: 'fullstack', name: 'Nuxt 3', emoji: '\u{1F49A}', description: 'Intuitive Vue framework with SSR, file-based routing, and auto-imports.', tags: ['Vue', 'Nuxt', 'SSR'], popular: false, stars: 3500, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'vitest', docker: false, ci: 'none' } },
  { id: 'redwood', categoryId: 'fullstack', name: 'RedwoodJS', emoji: '\u{1F332}', description: 'Opinionated full-stack framework with React, GraphQL, and Prisma.', tags: ['React', 'GraphQL', 'Prisma'], popular: false, stars: 1900, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'jest', docker: false, ci: 'github-actions' } },

  // Desktop
  { id: 'electron', categoryId: 'desktop', name: 'Electron', emoji: '\u{1F4BB}', description: 'Build cross-platform desktop apps with JavaScript, HTML, and CSS.', tags: ['Electron', 'Cross-Platform', 'Node.js'], popular: true, stars: 8200, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'jest', docker: false, ci: 'github-actions' } },
  { id: 'tauri', categoryId: 'desktop', name: 'Tauri', emoji: '\u{1F980}', description: 'Lightweight alternative to Electron using Rust and system webviews.', tags: ['Tauri', 'Rust', 'Lightweight'], popular: true, stars: 6700, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'vitest', docker: false, ci: 'github-actions' } },
  { id: 'neutralino', categoryId: 'desktop', name: 'Neutralinojs', emoji: '\u{2B50}', description: 'Lightweight and portable desktop app framework with minimal resources.', tags: ['Neutralino', 'Lightweight', 'Portable'], popular: false, stars: 1100, defaultOptions: { typescript: true, eslint: false, prettier: false, testing: 'none', docker: false, ci: 'none' } },

  // Library
  { id: 'tsup-lib', categoryId: 'library', name: 'TypeScript Library (tsup)', emoji: '\u{1F4E6}', description: 'Publish a TypeScript library with tsup bundling and dual CJS/ESM output.', tags: ['TypeScript', 'tsup', 'npm'], popular: true, stars: 3400, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'vitest', docker: false, ci: 'github-actions' } },
  { id: 'react-lib', categoryId: 'library', name: 'React Component Library', emoji: '\u{269B}\u{FE0F}', description: 'Publish reusable React components with Storybook and automated releases.', tags: ['React', 'Storybook', 'npm'], popular: false, stars: 2100, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'vitest', docker: false, ci: 'github-actions' } },
  { id: 'monorepo', categoryId: 'library', name: 'Monorepo (Turborepo)', emoji: '\u{1F3D7}\u{FE0F}', description: 'Multi-package monorepo with Turborepo, shared configs, and changesets.', tags: ['Turborepo', 'Monorepo', 'pnpm'], popular: true, stars: 4100, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'vitest', docker: false, ci: 'github-actions' } },

  // Tool
  { id: 'cli-tool', categoryId: 'tool', name: 'CLI Tool', emoji: '\u{1F4DF}', description: 'Interactive command-line tool with argument parsing and rich output.', tags: ['CLI', 'Node.js', 'Commander'], popular: false, stars: 1600, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'vitest', docker: false, ci: 'github-actions' } },
  { id: 'vscode-ext', categoryId: 'tool', name: 'VS Code Extension', emoji: '\u{1F9E9}', description: 'Scaffold a VS Code extension with commands, views, and language support.', tags: ['VS Code', 'Extension', 'API'], popular: true, stars: 2800, defaultOptions: { typescript: true, eslint: true, prettier: false, testing: 'jest', docker: false, ci: 'github-actions' } },
  { id: 'github-action', categoryId: 'tool', name: 'GitHub Action', emoji: '\u{2699}\u{FE0F}', description: 'Custom GitHub Action written in TypeScript with automated publishing.', tags: ['GitHub', 'CI/CD', 'Action'], popular: false, stars: 900, defaultOptions: { typescript: true, eslint: true, prettier: true, testing: 'jest', docker: true, ci: 'github-actions' } },
];

const RECENT_TEMPLATE_IDS = ['react-vite', 'nextjs', 't3', 'express'];

const TESTING_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'jest', label: 'Jest' },
  { value: 'vitest', label: 'Vitest' },
  { value: 'mocha', label: 'Mocha' },
] as const;

const CI_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'github-actions', label: 'GitHub Actions' },
  { value: 'gitlab-ci', label: 'GitLab CI' },
  { value: 'circleci', label: 'CircleCI' },
] as const;

const PROJECT_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9._-]*$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function validateProjectName(name: string): string | null {
  if (!name) return 'Project name is required';
  if (name.includes(' ')) return 'Project name cannot contain spaces';
  if (!PROJECT_NAME_REGEX.test(name)) return 'Must start with a letter and contain only letters, numbers, dots, hyphens, or underscores';
  if (name.length > 64) return 'Project name must be 64 characters or fewer';
  return null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ProgressBar = memo(function ProgressBar({ step }: { step: number }) {
  const steps = ['Template Category', 'Select Template', 'Configure Project'];
  const pct = ((step + 1) / steps.length) * 100;

  return (
    <div style={{ padding: '16px 24px 0', flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        {steps.map((label, i) => (
          <span
            key={label}
            style={{
              fontSize: 12,
              fontWeight: i === step ? 600 : 400,
              color: i <= step ? 'var(--accent-primary)' : 'var(--text-tertiary)',
              transition: 'color 0.2s',
            }}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: 'var(--bg-tertiary)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--accent-primary)',
            borderRadius: 2,
            transition: 'width 0.35s ease',
          }}
        />
      </div>
    </div>
  );
});

const CategoryCard = memo(function CategoryCard({
  category,
  selected,
  onSelect,
}: {
  category: TemplateCategory;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '20px 16px',
        border: `2px solid ${selected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
        borderRadius: 10,
        background: selected ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        minWidth: 140,
        flex: '1 1 140px',
        outline: 'none',
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget.style.borderColor = 'var(--accent-hover)');
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget.style.borderColor = 'var(--border-primary)');
      }}
    >
      <span style={{ fontSize: 32 }}>{category.emoji}</span>
      <span style={{ color: selected ? 'var(--accent-primary)' : 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
        {category.label}
      </span>
      <span style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center', lineHeight: 1.4 }}>
        {category.description}
      </span>
      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
        {category.templateCount} templates
      </span>
    </button>
  );
});

const TemplateCard = memo(function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: Template;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: 14,
        border: `2px solid ${selected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
        borderRadius: 8,
        background: selected ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        textAlign: 'left',
        width: '100%',
        outline: 'none',
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget.style.borderColor = 'var(--accent-hover)');
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget.style.borderColor = 'var(--border-primary)');
      }}
    >
      <span style={{ fontSize: 28, flexShrink: 0, lineHeight: 1 }}>{template.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
            {template.name}
          </span>
          {template.popular && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                color: 'var(--accent-primary)',
                background: 'var(--bg-primary)',
                borderRadius: 4,
                padding: '2px 6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <TrendingUp size={10} /> Popular
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.4 }}>
          {template.description}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {template.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 4,
                background: 'var(--bg-primary)',
                color: 'var(--text-tertiary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              {tag}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-tertiary)' }}>
            <Star size={11} /> {formatStars(template.stars)}
          </span>
        </div>
      </div>
      {selected && (
        <Check size={18} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: 2 }} />
      )}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

const StepCategory = memo(function StepCategory({
  state,
  onSelectCategory,
}: {
  state: WizardState;
  onSelectCategory: (id: string) => void;
}) {
  const recentTemplates = useMemo(
    () => TEMPLATES.filter((t) => RECENT_TEMPLATE_IDS.includes(t.id)),
    [],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
      {recentTemplates.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Clock size={14} style={{ color: 'var(--text-tertiary)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Recent Templates
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {recentTemplates.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectCategory(t.categoryId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border-primary)',
                  background: 'var(--bg-secondary)',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-primary)')}
              >
                <span>{t.emoji}</span>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Sparkles size={14} style={{ color: 'var(--text-tertiary)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Choose a Category
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {CATEGORIES.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              selected={state.categoryId === cat.id}
              onSelect={() => onSelectCategory(cat.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

const StepTemplate = memo(function StepTemplate({
  state,
  onSelectTemplate,
}: {
  state: WizardState;
  onSelectTemplate: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filteredTemplates = useMemo(() => {
    let list = TEMPLATES.filter((t) => t.categoryId === state.categoryId);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          t.description.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => (a.popular === b.popular ? b.stars - a.stars : a.popular ? -1 : 1));
  }, [state.categoryId, search]);

  const category = CATEGORIES.find((c) => c.id === state.categoryId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        {category && <span style={{ fontSize: 20 }}>{category.emoji}</span>}
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          {category?.label} Templates
        </span>
      </div>
      <div style={{ position: 'relative' }}>
        <Search
          size={14}
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}
        />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px 8px 30px',
            borderRadius: 6,
            border: '1px solid var(--border-primary)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-primary)')}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredTemplates.length === 0 && (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: 24 }}>
            No templates found matching &quot;{search}&quot;.
          </p>
        )}
        {filteredTemplates.map((tmpl) => (
          <TemplateCard
            key={tmpl.id}
            template={tmpl}
            selected={state.templateId === tmpl.id}
            onSelect={() => onSelectTemplate(tmpl.id)}
          />
        ))}
      </div>
    </div>
  );
});

const StepConfigure = memo(function StepConfigure({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  const nameError = useMemo(() => validateProjectName(state.projectName), [state.projectName]);
  const template = TEMPLATES.find((t) => t.id === state.templateId);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const setOption = useCallback(
    <K extends keyof ProjectOptions>(key: K, value: ProjectOptions[K]) => {
      onChange({ options: { ...state.options, [key]: value } });
    },
    [onChange, state.options],
  );

  const handleBrowse = useCallback(() => {
    // In a real app this would open a native directory picker.
    // Here we simulate it.
    const fakeDir = state.directory || 'C:\\Users\\Projects';
    onChange({ directory: fakeDir });
  }, [onChange, state.directory]);

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 4,
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid var(--border-primary)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const checkboxRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    cursor: 'pointer',
    fontSize: 13,
    color: 'var(--text-primary)',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    width: '100%',
    cursor: 'pointer',
    appearance: 'auto' as const,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
      {template && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>{template.emoji}</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            {template.name}
          </span>
        </div>
      )}

      {/* Project Name */}
      <div>
        <label style={fieldLabelStyle}>Project Name</label>
        <input
          ref={nameRef}
          type="text"
          placeholder="my-awesome-project"
          value={state.projectName}
          onChange={(e) => onChange({ projectName: e.target.value })}
          style={{
            ...inputStyle,
            borderColor: state.projectName && nameError ? 'var(--error)' : 'var(--border-primary)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = state.projectName && nameError ? 'var(--error)' : 'var(--accent-primary)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = state.projectName && nameError ? 'var(--error)' : 'var(--border-primary)')}
        />
        {state.projectName && nameError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, color: 'var(--error)', fontSize: 12 }}>
            <AlertCircle size={12} /> {nameError}
          </div>
        )}
      </div>

      {/* Directory */}
      <div>
        <label style={fieldLabelStyle}>Directory</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="C:\Users\Projects"
            value={state.directory}
            onChange={(e) => onChange({ directory: e.target.value })}
            style={{ ...inputStyle, flex: 1 }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-primary)')}
          />
          <button
            onClick={handleBrowse}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 13,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <FolderOpen size={14} /> Browse
          </button>
        </div>
      </div>

      {/* Tech Stack Options */}
      <div>
        <label style={{ ...fieldLabelStyle, marginBottom: 8 }}>Tech Stack Options</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px' }}>
          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={state.options.typescript}
              onChange={(e) => setOption('typescript', e.target.checked)}
              style={{ accentColor: 'var(--accent-primary)' }}
            />
            TypeScript
          </label>
          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={state.options.eslint}
              onChange={(e) => setOption('eslint', e.target.checked)}
              style={{ accentColor: 'var(--accent-primary)' }}
            />
            ESLint
          </label>
          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={state.options.prettier}
              onChange={(e) => setOption('prettier', e.target.checked)}
              style={{ accentColor: 'var(--accent-primary)' }}
            />
            Prettier
          </label>
          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={state.options.docker}
              onChange={(e) => setOption('docker', e.target.checked)}
              style={{ accentColor: 'var(--accent-primary)' }}
            />
            Docker
          </label>
        </div>
      </div>

      {/* Testing Framework */}
      <div>
        <label style={fieldLabelStyle}>Testing Framework</label>
        <select
          value={state.options.testing}
          onChange={(e) => setOption('testing', e.target.value as ProjectOptions['testing'])}
          style={selectStyle}
        >
          {TESTING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* CI Provider */}
      <div>
        <label style={fieldLabelStyle}>CI / CD</label>
        <select
          value={state.options.ci}
          onChange={(e) => setOption('ci', e.target.value as ProjectOptions['ci'])}
          style={selectStyle}
        >
          {CI_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Summary */}
      {state.projectName && !nameError && state.directory && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: 'var(--text-primary)' }}>Summary</strong>
          <br />
          Project will be created at{' '}
          <code style={{ color: 'var(--accent-primary)' }}>
            {state.directory.replace(/[/\\]$/, '')}/{state.projectName}
          </code>
          <br />
          Template: <strong>{template?.name}</strong>
          {state.options.typescript && ' \u00B7 TypeScript'}
          {state.options.eslint && ' \u00B7 ESLint'}
          {state.options.prettier && ' \u00B7 Prettier'}
          {state.options.docker && ' \u00B7 Docker'}
          {state.options.testing !== 'none' && ` \u00B7 ${state.options.testing}`}
          {state.options.ci !== 'none' && ` \u00B7 ${state.options.ci}`}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface NewProjectWizardProps {
  isOpen?: boolean;
  onClose?: () => void;
  onCreateProject?: (config: {
    templateId: string;
    projectName: string;
    directory: string;
    options: ProjectOptions;
  }) => void;
}

const DEFAULT_OPTIONS: ProjectOptions = {
  typescript: true,
  eslint: true,
  prettier: true,
  testing: 'none',
  docker: false,
  ci: 'none',
};

function NewProjectWizard({ isOpen = true, onClose, onCreateProject }: NewProjectWizardProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [creating, setCreating] = useState(false);

  const [state, setState] = useState<WizardState>({
    step: 0,
    categoryId: null,
    templateId: null,
    projectName: '',
    directory: '',
    options: { ...DEFAULT_OPTIONS },
  });

  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset when dialog opens
  useEffect(() => {
    if (isOpen) {
      setState({
        step: 0,
        categoryId: null,
        templateId: null,
        projectName: '',
        directory: '',
        options: { ...DEFAULT_OPTIONS },
      });
      setCreating(false);
    }
  }, [isOpen]);

  const patch = useCallback((p: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...p }));
  }, []);

  const handleSelectCategory = useCallback(
    (id: string) => {
      patch({ categoryId: id, templateId: null, step: 1 });
    },
    [patch],
  );

  const handleSelectTemplate = useCallback(
    (id: string) => {
      const tmpl = TEMPLATES.find((t) => t.id === id);
      const opts = tmpl?.defaultOptions
        ? { ...DEFAULT_OPTIONS, ...tmpl.defaultOptions }
        : { ...DEFAULT_OPTIONS };
      patch({ templateId: id, options: opts });
    },
    [patch],
  );

  const canGoNext = useMemo(() => {
    if (state.step === 0) return !!state.categoryId;
    if (state.step === 1) return !!state.templateId;
    return false;
  }, [state.step, state.categoryId, state.templateId]);

  const canCreate = useMemo(() => {
    return (
      state.step === 2 &&
      !!state.templateId &&
      !!state.projectName &&
      !validateProjectName(state.projectName) &&
      !!state.directory
    );
  }, [state]);

  const goNext = useCallback(() => {
    if (state.step < 2 && canGoNext) {
      patch({ step: state.step + 1 });
    }
  }, [state.step, canGoNext, patch]);

  const goBack = useCallback(() => {
    if (state.step > 0) {
      patch({ step: state.step - 1 });
    }
  }, [state.step, patch]);

  const handleCreate = useCallback(async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      // Simulate async project creation
      await new Promise((resolve) => setTimeout(resolve, 800));
      onCreateProject?.({
        templateId: state.templateId!,
        projectName: state.projectName,
        directory: state.directory,
        options: state.options,
      });
      addToast(`Project "${state.projectName}" created successfully!`, 'success');
      onClose?.();
    } catch {
      addToast('Failed to create project. Please try again.', 'error');
    } finally {
      setCreating(false);
    }
  }, [canCreate, creating, state, onCreateProject, onClose, addToast]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        if (canCreate) handleCreate();
        else if (canGoNext) goNext();
      } else if (e.key === 'ArrowLeft' && e.altKey) {
        goBack();
      } else if (e.key === 'ArrowRight' && e.altKey) {
        if (canGoNext) goNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, canGoNext, canCreate, goNext, goBack, handleCreate, onClose]);

  // Click outside to close
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose?.();
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 680,
          maxWidth: '94vw',
          maxHeight: '85vh',
          borderRadius: 12,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-primary)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            New Project
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Progress */}
        <ProgressBar step={state.step} />

        {/* Body */}
        {state.step === 0 && (
          <StepCategory state={state} onSelectCategory={handleSelectCategory} />
        )}
        {state.step === 1 && (
          <StepTemplate state={state} onSelectTemplate={handleSelectTemplate} />
        )}
        {state.step === 2 && <StepConfigure state={state} onChange={patch} />}

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid var(--border-primary)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {state.step === 2 ? 'Ctrl+Enter to create' : 'Alt+Arrow to navigate'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {state.step > 0 && (
              <button
                onClick={goBack}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '7px 16px',
                  borderRadius: 6,
                  border: '1px solid var(--border-primary)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                <ChevronLeft size={14} /> Back
              </button>
            )}
            {state.step < 2 && (
              <button
                onClick={goNext}
                disabled={!canGoNext}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '7px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: canGoNext ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: canGoNext ? '#fff' : 'var(--text-tertiary)',
                  cursor: canGoNext ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: 500,
                  opacity: canGoNext ? 1 : 0.6,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (canGoNext) e.currentTarget.style.background = 'var(--accent-hover)';
                }}
                onMouseLeave={(e) => {
                  if (canGoNext) e.currentTarget.style.background = 'var(--accent-primary)';
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            )}
            {state.step === 2 && (
              <button
                onClick={handleCreate}
                disabled={!canCreate || creating}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 20px',
                  borderRadius: 6,
                  border: 'none',
                  background: canCreate && !creating ? 'var(--success)' : 'var(--bg-tertiary)',
                  color: canCreate && !creating ? '#fff' : 'var(--text-tertiary)',
                  cursor: canCreate && !creating ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: canCreate ? 1 : 0.6,
                  transition: 'all 0.15s',
                }}
              >
                {creating ? (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check size={14} /> Create Project
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Spinner keyframes injected via style tag */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default NewProjectWizard;
