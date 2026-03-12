import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  RefreshCw,
  Bug,
  Trash2,
  Shield,
  Zap,
  Search,
  Filter,
  GitCompare,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Check,
  X,
  Eye,
  EyeOff,
  Tag,
  Calendar,
  User,
  ArrowUpCircle,
  ArrowDownCircle,
  MinusCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReleaseType = 'major' | 'minor' | 'patch';
type ChangeCategory = 'Added' | 'Changed' | 'Fixed' | 'Removed' | 'Security' | 'Performance';

interface ChangeItem {
  id: string;
  description: string;
  detailedMarkdown?: string;
  category: ChangeCategory;
  contributor: string;
  commitHash?: string;
  prNumber?: number;
}

interface VersionEntry {
  version: string;
  date: string;
  releaseType: ReleaseType;
  summary: string;
  changes: ChangeItem[];
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_VERSIONS: VersionEntry[] = [
  {
    version: '2.4.0',
    date: '2026-03-10',
    releaseType: 'minor',
    summary: 'Collaboration features and performance improvements across the editor.',
    changes: [
      { id: 'c1', description: 'Real-time collaborative editing with presence cursors', category: 'Added', contributor: 'alice', commitHash: 'a1b2c3d', prNumber: 312 },
      { id: 'c2', description: 'Live share sessions with voice chat integration', category: 'Added', contributor: 'bob', commitHash: 'e4f5g6h', prNumber: 315 },
      { id: 'c3', description: 'Redesigned settings panel with search and categories', category: 'Changed', contributor: 'carol', commitHash: 'i7j8k9l', prNumber: 318 },
      { id: 'c4', description: 'Terminal now uses GPU-accelerated rendering', category: 'Performance', contributor: 'dave', commitHash: 'm0n1o2p', prNumber: 320 },
      { id: 'c5', description: 'Fixed memory leak in large file diff viewer', category: 'Fixed', contributor: 'eve', commitHash: 'q3r4s5t', prNumber: 322 },
      { id: 'c6', description: 'Patched XSS vulnerability in markdown preview', category: 'Security', contributor: 'frank', commitHash: 'u6v7w8x', prNumber: 325 },
      { id: 'c7', description: 'Removed legacy snippet format support', category: 'Removed', contributor: 'carol', commitHash: 'y9z0a1b', prNumber: 327 },
    ],
  },
  {
    version: '2.3.2',
    date: '2026-02-20',
    releaseType: 'patch',
    summary: 'Bug fixes for the extension host and terminal.',
    changes: [
      { id: 'c8', description: 'Fixed extension host crash when loading large bundles', category: 'Fixed', contributor: 'dave', commitHash: 'c2d3e4f', prNumber: 305 },
      { id: 'c9', description: 'Fixed terminal cursor blinking inconsistency on macOS', category: 'Fixed', contributor: 'alice', commitHash: 'g5h6i7j', prNumber: 307 },
      { id: 'c10', description: 'Addressed path traversal issue in workspace trust', category: 'Security', contributor: 'frank', commitHash: 'k8l9m0n', prNumber: 309 },
      { id: 'c11', description: 'Reduced startup time by lazy-loading sidebar panels', category: 'Performance', contributor: 'bob', commitHash: 'o1p2q3r', prNumber: 310 },
    ],
  },
  {
    version: '2.3.1',
    date: '2026-02-05',
    releaseType: 'patch',
    summary: 'Hotfix for file save regression introduced in 2.3.0.',
    changes: [
      { id: 'c12', description: 'Fixed file save silently failing for files > 50 MB', category: 'Fixed', contributor: 'eve', commitHash: 's4t5u6v', prNumber: 298 },
      { id: 'c13', description: 'Fixed breadcrumb navigation not updating on rename', category: 'Fixed', contributor: 'carol', commitHash: 'w7x8y9z', prNumber: 299 },
    ],
  },
  {
    version: '2.3.0',
    date: '2026-01-28',
    releaseType: 'minor',
    summary: 'New AI assistant panel, inline diff improvements, and Git graph view.',
    changes: [
      { id: 'c14', description: 'AI-powered code assistant panel with context-aware suggestions', detailedMarkdown: 'The assistant uses **local models** by default and supports OpenAI-compatible endpoints.\n\n```json\n{ "ai.endpoint": "http://localhost:11434" }\n```', category: 'Added', contributor: 'alice', commitHash: 'a0b1c2d', prNumber: 280 },
      { id: 'c15', description: 'Interactive Git graph visualization with branch topology', category: 'Added', contributor: 'bob', commitHash: 'e3f4g5h', prNumber: 284 },
      { id: 'c16', description: 'Inline diff now supports word-level highlighting', category: 'Changed', contributor: 'dave', commitHash: 'i6j7k8l', prNumber: 287 },
      { id: 'c17', description: 'Editor minimap rendering optimized for retina displays', category: 'Performance', contributor: 'eve', commitHash: 'm9n0o1p', prNumber: 290 },
      { id: 'c18', description: 'Removed deprecated "openFile" command alias', category: 'Removed', contributor: 'carol', commitHash: 'q2r3s4t', prNumber: 292 },
      { id: 'c19', description: 'Fixed CSS variable leak in theme switching', category: 'Fixed', contributor: 'frank', commitHash: 'u5v6w7x', prNumber: 294 },
    ],
  },
  {
    version: '2.2.0',
    date: '2026-01-10',
    releaseType: 'minor',
    summary: 'Snippet manager, keyboard shortcut editor, and notification center.',
    changes: [
      { id: 'c20', description: 'Snippet manager with folder organization and sync', category: 'Added', contributor: 'carol', commitHash: 'y8z9a0b', prNumber: 260 },
      { id: 'c21', description: 'Visual keyboard shortcut editor with conflict detection', category: 'Added', contributor: 'alice', commitHash: 'c1d2e3f', prNumber: 264 },
      { id: 'c22', description: 'Notification center with history and action buttons', category: 'Added', contributor: 'bob', commitHash: 'g4h5i6j', prNumber: 268 },
      { id: 'c23', description: 'Switched to virtual scrolling in file explorer for large trees', category: 'Performance', contributor: 'dave', commitHash: 'k7l8m9n', prNumber: 271 },
      { id: 'c24', description: 'Updated dependency resolution to fix prototype pollution', category: 'Security', contributor: 'frank', commitHash: 'o0p1q2r', prNumber: 274 },
      { id: 'c25', description: 'Fixed tab reorder animation jank on Wayland', category: 'Fixed', contributor: 'eve', commitHash: 's3t4u5v', prNumber: 276 },
    ],
  },
  {
    version: '2.1.0',
    date: '2025-12-15',
    releaseType: 'minor',
    summary: 'Multi-root workspaces, split editor groups, and new welcome experience.',
    changes: [
      { id: 'c26', description: 'Multi-root workspace support with per-folder settings', category: 'Added', contributor: 'alice', commitHash: 'w6x7y8z', prNumber: 240 },
      { id: 'c27', description: 'Split editor into arbitrary grid layouts', category: 'Added', contributor: 'bob', commitHash: 'a9b0c1d', prNumber: 244 },
      { id: 'c28', description: 'Redesigned welcome tab with quick-start templates', category: 'Changed', contributor: 'carol', commitHash: 'e2f3g4h', prNumber: 248 },
      { id: 'c29', description: 'Fixed undo stack corruption after multi-cursor paste', category: 'Fixed', contributor: 'dave', commitHash: 'i5j6k7l', prNumber: 251 },
      { id: 'c30', description: 'Removed Python 2 linter shim', category: 'Removed', contributor: 'eve', commitHash: 'm8n9o0p', prNumber: 254 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENT_VERSION = DEMO_VERSIONS[0].version;
const LOCAL_STORAGE_KEY = 'releaseNotes_readVersions';
const LAST_SEEN_KEY = 'releaseNotes_lastSeenVersion';

const CATEGORY_META: Record<ChangeCategory, { icon: React.ReactNode; color: string }> = {
  Added: { icon: <Plus size={14} />, color: '#4ec9b0' },
  Changed: { icon: <RefreshCw size={14} />, color: '#dcdcaa' },
  Fixed: { icon: <Bug size={14} />, color: '#ce9178' },
  Removed: { icon: <Trash2 size={14} />, color: '#f44747' },
  Security: { icon: <Shield size={14} />, color: '#c586c0' },
  Performance: { icon: <Zap size={14} />, color: '#569cd6' },
};

const RELEASE_TYPE_COLORS: Record<ReleaseType, string> = {
  major: '#f44747',
  minor: '#4ec9b0',
  patch: '#dcdcaa',
};

const ALL_CATEGORIES: ChangeCategory[] = ['Added', 'Changed', 'Fixed', 'Removed', 'Security', 'Performance'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseVersion(v: string): number[] {
  return v.split('.').map(Number);
}

function versionInRange(v: string, from: string, to: string): boolean {
  const vn = parseVersion(v);
  const fn = parseVersion(from);
  const tn = parseVersion(to);
  const toNum = (a: number[]) => a[0] * 10000 + a[1] * 100 + a[2];
  const val = toNum(vn);
  return val >= Math.min(toNum(fn), toNum(tn)) && val <= Math.max(toNum(fn), toNum(tn));
}

function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split('\n');
  const elements: React.ReactNode[] = [];
  let inCode = false;
  let codeBlock: string[] = [];

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (inCode) {
        elements.push(
          <pre key={`code-${i}`} style={{ background: 'var(--rn-bg-tertiary)', padding: 8, borderRadius: 4, overflow: 'auto', fontSize: 12, margin: '4px 0' }}>
            <code>{codeBlock.join('\n')}</code>
          </pre>
        );
        codeBlock = [];
      }
      inCode = !inCode;
      return;
    }
    if (inCode) {
      codeBlock.push(line);
      return;
    }
    const formatted = line
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`(.+?)`/g, '<code style="background:var(--rn-bg-tertiary);padding:1px 4px;border-radius:3px;font-size:12px">$1</code>');
    elements.push(<p key={`p-${i}`} style={{ margin: '2px 0' }} dangerouslySetInnerHTML={{ __html: formatted }} />);
  });

  return <>{elements}</>;
}

function getReadVersions(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadVersions(set: Set<string>) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([...set]));
  } catch { /* noop */ }
}

function shouldAutoShow(): boolean {
  try {
    const last = localStorage.getItem(LAST_SEEN_KEY);
    return last !== CURRENT_VERSION;
  } catch {
    return true;
  }
}

function markLastSeen() {
  try {
    localStorage.setItem(LAST_SEEN_KEY, CURRENT_VERSION);
  } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface WhatsNewHeroProps {
  version: VersionEntry;
  onDismiss: () => void;
}

const WhatsNewHero: React.FC<WhatsNewHeroProps> = ({ version, onDismiss }) => (
  <div style={{
    background: 'linear-gradient(135deg, var(--rn-accent) 0%, var(--rn-accent-secondary) 100%)',
    borderRadius: 8,
    padding: 24,
    marginBottom: 16,
    position: 'relative',
    color: '#fff',
  }}>
    <button onClick={onDismiss} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.8 }} title="Dismiss">
      <X size={18} />
    </button>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <Sparkles size={22} />
      <span style={{ fontSize: 20, fontWeight: 700 }}>What&apos;s New in v{version.version}</span>
    </div>
    <p style={{ margin: 0, opacity: 0.9, fontSize: 14, lineHeight: 1.5 }}>{version.summary}</p>
    <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {version.changes.slice(0, 3).map((c) => (
        <span key={c.id} style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
          {c.description.slice(0, 50)}{c.description.length > 50 ? '...' : ''}
        </span>
      ))}
      {version.changes.length > 3 && (
        <span style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
          +{version.changes.length - 3} more
        </span>
      )}
    </div>
  </div>
);

interface VersionDiffProps {
  versionA: VersionEntry;
  versionB: VersionEntry;
  onClose: () => void;
}

const VersionDiff: React.FC<VersionDiffProps> = ({ versionA, versionB }) => {
  const [older, newer] = parseVersion(versionA.version)[0] * 10000 + parseVersion(versionA.version)[1] * 100 + parseVersion(versionA.version)[2]
    < parseVersion(versionB.version)[0] * 10000 + parseVersion(versionB.version)[1] * 100 + parseVersion(versionB.version)[2]
    ? [versionA, versionB] : [versionB, versionA];

  const olderIds = new Set(older.changes.map((c) => c.id));
  const newerIds = new Set(newer.changes.map((c) => c.id));
  const added = newer.changes.filter((c) => !olderIds.has(c.id));
  const removed = older.changes.filter((c) => !newerIds.has(c.id));

  return (
    <div style={{ background: 'var(--rn-bg-secondary)', borderRadius: 6, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <GitCompare size={16} />
        Comparing v{older.version} &rarr; v{newer.version}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, color: '#4ec9b0', fontSize: 13, fontWeight: 600 }}>
            <ArrowUpCircle size={14} /> New in v{newer.version} ({added.length})
          </div>
          {added.map((c) => (
            <div key={c.id} style={{ fontSize: 12, padding: '3px 0', color: 'var(--rn-fg-secondary)' }}>
              <span style={{ color: CATEGORY_META[c.category].color, marginRight: 4 }}>{CATEGORY_META[c.category].icon}</span>
              {c.description}
            </div>
          ))}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, color: '#f44747', fontSize: 13, fontWeight: 600 }}>
            <ArrowDownCircle size={14} /> Only in v{older.version} ({removed.length})
          </div>
          {removed.map((c) => (
            <div key={c.id} style={{ fontSize: 12, padding: '3px 0', color: 'var(--rn-fg-secondary)' }}>
              <span style={{ color: CATEGORY_META[c.category].color, marginRight: 4 }}>{CATEGORY_META[c.category].icon}</span>
              {c.description}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ReleaseNotes: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<ChangeCategory>>(new Set(ALL_CATEGORIES));
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set([CURRENT_VERSION]));
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [readVersions, setReadVersions] = useState<Set<string>>(getReadVersions);
  const [showWhatsNew, setShowWhatsNew] = useState(shouldAutoShow);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelections, setCompareSelections] = useState<string[]>([]);
  const [versionRangeFrom, setVersionRangeFrom] = useState(DEMO_VERSIONS[DEMO_VERSIONS.length - 1].version);
  const [versionRangeTo, setVersionRangeTo] = useState(DEMO_VERSIONS[0].version);

  useEffect(() => {
    if (showWhatsNew) {
      markLastSeen();
    }
  }, [showWhatsNew]);

  const toggleVersion = useCallback((v: string) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  }, []);

  const toggleItem = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleCategory = useCallback((cat: ChangeCategory) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }, []);

  const markAsRead = useCallback((version: string) => {
    setReadVersions((prev) => {
      const next = new Set(prev);
      next.add(version);
      saveReadVersions(next);
      return next;
    });
  }, []);

  const markAsUnread = useCallback((version: string) => {
    setReadVersions((prev) => {
      const next = new Set(prev);
      next.delete(version);
      saveReadVersions(next);
      return next;
    });
  }, []);

  const handleCompareSelect = useCallback((version: string) => {
    setCompareSelections((prev) => {
      if (prev.includes(version)) return prev.filter((v) => v !== version);
      if (prev.length >= 2) return [prev[1], version];
      return [...prev, version];
    });
  }, []);

  const filteredVersions = useMemo(() => {
    return DEMO_VERSIONS.filter((entry) => {
      if (!versionInRange(entry.version, versionRangeFrom, versionRangeTo)) return false;
      const matchingChanges = entry.changes.filter((c) => {
        if (!selectedCategories.has(c.category)) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            c.description.toLowerCase().includes(q) ||
            c.contributor.toLowerCase().includes(q) ||
            c.category.toLowerCase().includes(q) ||
            entry.version.includes(q)
          );
        }
        return true;
      });
      return matchingChanges.length > 0 || !searchQuery;
    });
  }, [searchQuery, selectedCategories, versionRangeFrom, versionRangeTo]);

  const filteredChangesForVersion = useCallback(
    (entry: VersionEntry): ChangeItem[] => {
      return entry.changes.filter((c) => {
        if (!selectedCategories.has(c.category)) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            c.description.toLowerCase().includes(q) ||
            c.contributor.toLowerCase().includes(q) ||
            c.category.toLowerCase().includes(q)
          );
        }
        return true;
      });
    },
    [searchQuery, selectedCategories]
  );

  const compareVersionA = DEMO_VERSIONS.find((v) => v.version === compareSelections[0]);
  const compareVersionB = DEMO_VERSIONS.find((v) => v.version === compareSelections[1]);

  const cssVars: React.CSSProperties & Record<string, string> = {
    '--rn-bg-primary': '#1e1e1e',
    '--rn-bg-secondary': '#252526',
    '--rn-bg-tertiary': '#2d2d2d',
    '--rn-bg-hover': '#333333',
    '--rn-fg-primary': '#cccccc',
    '--rn-fg-secondary': '#999999',
    '--rn-border': '#3c3c3c',
    '--rn-accent': '#0078d4',
    '--rn-accent-secondary': '#6c3fa0',
    '--rn-scrollbar': '#424242',
  } as React.CSSProperties & Record<string, string>;

  return (
    <div
      style={{
        ...cssVars,
        background: 'var(--rn-bg-primary)',
        color: 'var(--rn-fg-primary)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rn-border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Tag size={18} style={{ color: 'var(--rn-accent)' }} />
        <span style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>Release Notes</span>
        <button
          onClick={() => setCompareMode(!compareMode)}
          style={{
            background: compareMode ? 'var(--rn-accent)' : 'var(--rn-bg-tertiary)',
            border: 'none',
            color: 'var(--rn-fg-primary)',
            borderRadius: 4,
            padding: '4px 10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
          }}
          title="Compare versions"
        >
          <GitCompare size={14} />
          Compare
        </button>
        <button
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          style={{
            background: showFilterPanel ? 'var(--rn-accent)' : 'var(--rn-bg-tertiary)',
            border: 'none',
            color: 'var(--rn-fg-primary)',
            borderRadius: 4,
            padding: '4px 10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
          }}
          title="Toggle filters"
        >
          <Filter size={14} />
          Filters
        </button>
      </div>

      {/* Search bar */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--rn-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--rn-bg-tertiary)', borderRadius: 4, padding: '4px 8px' }}>
          <Search size={14} style={{ color: 'var(--rn-fg-secondary)', marginRight: 6 }} />
          <input
            type="text"
            placeholder="Search across all release notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              color: 'var(--rn-fg-primary)',
              outline: 'none',
              fontSize: 13,
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--rn-fg-secondary)', cursor: 'pointer', padding: 2 }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilterPanel && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--rn-border)', flexShrink: 0 }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--rn-fg-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Categories</span>
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {ALL_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    borderRadius: 4,
                    border: `1px solid ${selectedCategories.has(cat) ? CATEGORY_META[cat].color : 'var(--rn-border)'}`,
                    background: selectedCategories.has(cat) ? `${CATEGORY_META[cat].color}22` : 'transparent',
                    color: selectedCategories.has(cat) ? CATEGORY_META[cat].color : 'var(--rn-fg-secondary)',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  {CATEGORY_META[cat].icon}
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: 'var(--rn-fg-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Version Range</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <select
                value={versionRangeFrom}
                onChange={(e) => setVersionRangeFrom(e.target.value)}
                style={{ background: 'var(--rn-bg-tertiary)', color: 'var(--rn-fg-primary)', border: '1px solid var(--rn-border)', borderRadius: 4, padding: '3px 6px', fontSize: 12 }}
              >
                {DEMO_VERSIONS.map((v) => (
                  <option key={v.version} value={v.version}>v{v.version}</option>
                ))}
              </select>
              <MinusCircle size={14} style={{ color: 'var(--rn-fg-secondary)' }} />
              <select
                value={versionRangeTo}
                onChange={(e) => setVersionRangeTo(e.target.value)}
                style={{ background: 'var(--rn-bg-tertiary)', color: 'var(--rn-fg-primary)', border: '1px solid var(--rn-border)', borderRadius: 4, padding: '3px 6px', fontSize: 12 }}
              >
                {DEMO_VERSIONS.map((v) => (
                  <option key={v.version} value={v.version}>v{v.version}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Compare mode selection hint */}
      {compareMode && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--rn-border)', background: 'var(--rn-bg-secondary)', flexShrink: 0, fontSize: 12, color: 'var(--rn-fg-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitCompare size={14} />
          {compareSelections.length < 2
            ? `Select ${2 - compareSelections.length} version${compareSelections.length === 0 ? 's' : ''} to compare. Click version headers below.`
            : 'Comparison shown below. Click a version to change selection.'}
          {compareSelections.length > 0 && (
            <button onClick={() => setCompareSelections([])} style={{ background: 'none', border: 'none', color: 'var(--rn-accent)', cursor: 'pointer', fontSize: 12, marginLeft: 'auto' }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* What's New hero */}
        {showWhatsNew && !searchQuery && (
          <WhatsNewHero
            version={DEMO_VERSIONS[0]}
            onDismiss={() => {
              setShowWhatsNew(false);
              markAsRead(CURRENT_VERSION);
            }}
          />
        )}

        {/* Version comparison */}
        {compareMode && compareVersionA && compareVersionB && (
          <VersionDiff
            versionA={compareVersionA}
            versionB={compareVersionB}
            onClose={() => setCompareSelections([])}
          />
        )}

        {/* Version list */}
        {filteredVersions.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--rn-fg-secondary)' }}>
            <Search size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
            <div>No results found for &quot;{searchQuery}&quot;</div>
          </div>
        )}

        {filteredVersions.map((entry) => {
          const isExpanded = expandedVersions.has(entry.version);
          const isRead = readVersions.has(entry.version);
          const isCurrent = entry.version === CURRENT_VERSION;
          const isCompareSelected = compareSelections.includes(entry.version);
          const changes = filteredChangesForVersion(entry);
          const grouped: Partial<Record<ChangeCategory, ChangeItem[]>> = {};
          changes.forEach((c) => {
            (grouped[c.category] ??= []).push(c);
          });

          return (
            <div
              key={entry.version}
              style={{
                marginBottom: 8,
                border: `1px solid ${isCompareSelected ? 'var(--rn-accent)' : 'var(--rn-border)'}`,
                borderRadius: 6,
                overflow: 'hidden',
                background: 'var(--rn-bg-secondary)',
              }}
            >
              {/* Version header */}
              <div
                onClick={() => compareMode ? handleCompareSelect(entry.version) : toggleVersion(entry.version)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  background: isCurrent ? 'var(--rn-bg-tertiary)' : 'transparent',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--rn-bg-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isCurrent ? 'var(--rn-bg-tertiary)' : 'transparent'; }}
              >
                {!compareMode && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                {compareMode && (
                  <div style={{
                    width: 16, height: 16, borderRadius: 3,
                    border: `1px solid ${isCompareSelected ? 'var(--rn-accent)' : 'var(--rn-border)'}`,
                    background: isCompareSelected ? 'var(--rn-accent)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isCompareSelected && <Check size={10} color="#fff" />}
                  </div>
                )}
                <span style={{ fontWeight: 600, fontSize: 14 }}>v{entry.version}</span>
                <span style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 3,
                  background: `${RELEASE_TYPE_COLORS[entry.releaseType]}22`,
                  color: RELEASE_TYPE_COLORS[entry.releaseType],
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}>
                  {entry.releaseType}
                </span>
                {isCurrent && (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--rn-accent)', color: '#fff', fontWeight: 600 }}>
                    CURRENT
                  </span>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', color: 'var(--rn-fg-secondary)', fontSize: 12 }}>
                  <Calendar size={12} />
                  {entry.date}
                </div>
                <span style={{ color: 'var(--rn-fg-secondary)', fontSize: 12 }}>
                  {changes.length} change{changes.length !== 1 ? 's' : ''}
                </span>
                {!compareMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); isRead ? markAsUnread(entry.version) : markAsRead(entry.version); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: isRead ? 'var(--rn-fg-secondary)' : 'var(--rn-accent)', padding: 2 }}
                    title={isRead ? 'Mark as unread' : 'Mark as read'}
                  >
                    {isRead ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>

              {/* Expanded content */}
              {isExpanded && !compareMode && (
                <div style={{ padding: '4px 14px 14px' }}>
                  <p style={{ fontSize: 12, color: 'var(--rn-fg-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>{entry.summary}</p>

                  {ALL_CATEGORIES.map((cat) => {
                    const items = grouped[cat];
                    if (!items || items.length === 0) return null;

                    return (
                      <div key={cat} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color: CATEGORY_META[cat].color, fontWeight: 600, fontSize: 12 }}>
                          {CATEGORY_META[cat].icon}
                          {cat}
                          <span style={{ fontWeight: 400, color: 'var(--rn-fg-secondary)' }}>({items.length})</span>
                        </div>
                        {items.map((item) => {
                          const itemExpanded = expandedItems.has(item.id);
                          return (
                            <div
                              key={item.id}
                              style={{
                                padding: '6px 10px',
                                marginBottom: 2,
                                borderRadius: 4,
                                background: itemExpanded ? 'var(--rn-bg-tertiary)' : 'transparent',
                                cursor: item.detailedMarkdown ? 'pointer' : 'default',
                              }}
                              onClick={() => item.detailedMarkdown && toggleItem(item.id)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                <span style={{ color: CATEGORY_META[item.category].color, flexShrink: 0 }}>{CATEGORY_META[item.category].icon}</span>
                                <span style={{ flex: 1 }}>{item.description}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--rn-fg-secondary)', fontSize: 11, flexShrink: 0 }}>
                                  <User size={10} />
                                  {item.contributor}
                                </span>
                                {item.commitHash && (
                                  <a
                                    href={`#commit/${item.commitHash}`}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ color: 'var(--rn-accent)', fontSize: 11, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
                                    title={`Commit ${item.commitHash}`}
                                  >
                                    <ExternalLink size={10} />
                                    {item.commitHash.slice(0, 7)}
                                  </a>
                                )}
                                {item.prNumber && (
                                  <a
                                    href={`#pr/${item.prNumber}`}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ color: 'var(--rn-accent)', fontSize: 11, textDecoration: 'none', flexShrink: 0 }}
                                    title={`Pull Request #${item.prNumber}`}
                                  >
                                    #{item.prNumber}
                                  </a>
                                )}
                                {item.detailedMarkdown && (
                                  itemExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                                )}
                              </div>
                              {itemExpanded && item.detailedMarkdown && (
                                <div style={{ marginTop: 8, paddingLeft: 22, fontSize: 12, color: 'var(--rn-fg-secondary)', lineHeight: 1.6 }}>
                                  {renderMarkdown(item.detailedMarkdown)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--rn-border)', fontSize: 11, color: 'var(--rn-fg-secondary)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
        <span>{DEMO_VERSIONS.length} versions &middot; {DEMO_VERSIONS.reduce((s, v) => s + v.changes.length, 0)} total changes</span>
        <span>Current: v{CURRENT_VERSION}</span>
      </div>
    </div>
  );
};

export default ReleaseNotes;
