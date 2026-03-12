import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Terminal,
  FileText,
  Download,
  Upload,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  HardDrive,
  Network,
  Layers,
  Container,
  Server,
  Cpu,
  MemoryStick,
  Clock,
  Globe,
  Pause,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  X,
  Check,
  AlertCircle,
  Hammer,
  FolderOpen,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = 'containers' | 'images' | 'compose' | 'volumes' | 'networks';

type ContainerStatus = 'running' | 'stopped' | 'paused';

interface PortMapping {
  host: number;
  container: number;
  protocol: string;
}

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  ports: PortMapping[];
  created: string;
  uptime: string;
  cpu: number;
  memory: number;
  memoryLimit: number;
}

interface ImageInfo {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

interface ComposeService {
  name: string;
  image: string;
  status: ContainerStatus;
  ports: PortMapping[];
  replicas: number;
}

interface ComposeProject {
  name: string;
  file: string;
  services: ComposeService[];
  status: 'running' | 'stopped' | 'partial';
}

interface VolumeInfo {
  name: string;
  driver: string;
  mountPoint: string;
  size: string;
  containers: string[];
}

interface NetworkInfo {
  name: string;
  driver: string;
  scope: string;
  subnet: string;
  containers: string[];
}

// ─── Demo Data ───────────────────────────────────────────────────────────────

const DEMO_CONTAINERS: ContainerInfo[] = [
  {
    id: 'a1b2c3d4e5f6',
    name: 'web-frontend',
    image: 'node:18-alpine',
    status: 'running',
    ports: [{ host: 3000, container: 3000, protocol: 'tcp' }],
    created: '2026-03-10T08:30:00Z',
    uptime: '2 days',
    cpu: 12.5,
    memory: 256,
    memoryLimit: 512,
  },
  {
    id: 'b2c3d4e5f6a7',
    name: 'api-server',
    image: 'python:3.11-slim',
    status: 'running',
    ports: [{ host: 8000, container: 8000, protocol: 'tcp' }],
    created: '2026-03-10T08:31:00Z',
    uptime: '2 days',
    cpu: 35.2,
    memory: 384,
    memoryLimit: 1024,
  },
  {
    id: 'c3d4e5f6a7b8',
    name: 'postgres-db',
    image: 'postgres:15',
    status: 'running',
    ports: [{ host: 5432, container: 5432, protocol: 'tcp' }],
    created: '2026-03-09T12:00:00Z',
    uptime: '3 days',
    cpu: 8.1,
    memory: 192,
    memoryLimit: 512,
  },
  {
    id: 'd4e5f6a7b8c9',
    name: 'redis-cache',
    image: 'redis:7-alpine',
    status: 'running',
    ports: [{ host: 6379, container: 6379, protocol: 'tcp' }],
    created: '2026-03-09T12:01:00Z',
    uptime: '3 days',
    cpu: 2.3,
    memory: 64,
    memoryLimit: 256,
  },
  {
    id: 'e5f6a7b8c9d0',
    name: 'nginx-proxy',
    image: 'nginx:latest',
    status: 'stopped',
    ports: [
      { host: 80, container: 80, protocol: 'tcp' },
      { host: 443, container: 443, protocol: 'tcp' },
    ],
    created: '2026-03-08T16:00:00Z',
    uptime: '-',
    cpu: 0,
    memory: 0,
    memoryLimit: 256,
  },
  {
    id: 'f6a7b8c9d0e1',
    name: 'worker-queue',
    image: 'python:3.11-slim',
    status: 'paused',
    ports: [],
    created: '2026-03-10T09:00:00Z',
    uptime: '2 days (paused)',
    cpu: 0,
    memory: 128,
    memoryLimit: 512,
  },
];

const DEMO_IMAGES: ImageInfo[] = [
  { id: 'sha256:aaa111', repository: 'node', tag: '18-alpine', size: '172 MB', created: '2026-02-28' },
  { id: 'sha256:bbb222', repository: 'python', tag: '3.11-slim', size: '125 MB', created: '2026-03-01' },
  { id: 'sha256:ccc333', repository: 'postgres', tag: '15', size: '379 MB', created: '2026-02-20' },
  { id: 'sha256:ddd444', repository: 'redis', tag: '7-alpine', size: '30 MB', created: '2026-03-05' },
  { id: 'sha256:eee555', repository: 'nginx', tag: 'latest', size: '142 MB', created: '2026-03-07' },
  { id: 'sha256:fff666', repository: 'myapp/frontend', tag: 'v2.1.0', size: '245 MB', created: '2026-03-10' },
  { id: 'sha256:ggg777', repository: 'myapp/api', tag: 'v1.8.3', size: '198 MB', created: '2026-03-10' },
  { id: 'sha256:hhh888', repository: 'alpine', tag: '3.18', size: '7.3 MB', created: '2026-01-15' },
];

const DEMO_COMPOSE: ComposeProject[] = [
  {
    name: 'myapp-stack',
    file: './docker-compose.yml',
    status: 'running',
    services: [
      { name: 'frontend', image: 'myapp/frontend:v2.1.0', status: 'running', ports: [{ host: 3000, container: 3000, protocol: 'tcp' }], replicas: 1 },
      { name: 'api', image: 'myapp/api:v1.8.3', status: 'running', ports: [{ host: 8000, container: 8000, protocol: 'tcp' }], replicas: 2 },
      { name: 'db', image: 'postgres:15', status: 'running', ports: [{ host: 5432, container: 5432, protocol: 'tcp' }], replicas: 1 },
      { name: 'cache', image: 'redis:7-alpine', status: 'running', ports: [{ host: 6379, container: 6379, protocol: 'tcp' }], replicas: 1 },
    ],
  },
  {
    name: 'monitoring',
    file: './monitoring/docker-compose.yml',
    status: 'stopped',
    services: [
      { name: 'prometheus', image: 'prom/prometheus:latest', status: 'stopped', ports: [{ host: 9090, container: 9090, protocol: 'tcp' }], replicas: 1 },
      { name: 'grafana', image: 'grafana/grafana:latest', status: 'stopped', ports: [{ host: 3001, container: 3000, protocol: 'tcp' }], replicas: 1 },
    ],
  },
];

const DEMO_VOLUMES: VolumeInfo[] = [
  { name: 'postgres_data', driver: 'local', mountPoint: '/var/lib/docker/volumes/postgres_data/_data', size: '1.2 GB', containers: ['postgres-db'] },
  { name: 'redis_data', driver: 'local', mountPoint: '/var/lib/docker/volumes/redis_data/_data', size: '48 MB', containers: ['redis-cache'] },
  { name: 'nginx_config', driver: 'local', mountPoint: '/var/lib/docker/volumes/nginx_config/_data', size: '12 KB', containers: ['nginx-proxy'] },
  { name: 'app_uploads', driver: 'local', mountPoint: '/var/lib/docker/volumes/app_uploads/_data', size: '340 MB', containers: ['api-server'] },
  { name: 'node_modules_cache', driver: 'local', mountPoint: '/var/lib/docker/volumes/node_modules_cache/_data', size: '890 MB', containers: [] },
];

const DEMO_NETWORKS: NetworkInfo[] = [
  { name: 'bridge', driver: 'bridge', scope: 'local', subnet: '172.17.0.0/16', containers: [] },
  { name: 'myapp_default', driver: 'bridge', scope: 'local', subnet: '172.18.0.0/16', containers: ['web-frontend', 'api-server', 'postgres-db', 'redis-cache'] },
  { name: 'proxy_net', driver: 'bridge', scope: 'local', subnet: '172.19.0.0/16', containers: ['nginx-proxy', 'web-frontend'] },
  { name: 'host', driver: 'host', scope: 'local', subnet: '-', containers: [] },
  { name: 'none', driver: 'null', scope: 'local', subnet: '-', containers: [] },
];

const DEMO_LOGS = `[2026-03-12T10:00:01Z] INFO  Starting application server...
[2026-03-12T10:00:02Z] INFO  Loading configuration from /etc/app/config.yml
[2026-03-12T10:00:02Z] INFO  Database connection pool initialized (max: 20)
[2026-03-12T10:00:03Z] INFO  Redis connection established at redis-cache:6379
[2026-03-12T10:00:03Z] WARN  Cache TTL not configured, using default (3600s)
[2026-03-12T10:00:04Z] INFO  Registered 42 API routes
[2026-03-12T10:00:04Z] INFO  Health check endpoint: /api/health
[2026-03-12T10:00:05Z] INFO  Server listening on 0.0.0.0:8000
[2026-03-12T10:01:12Z] INFO  GET /api/health 200 2ms
[2026-03-12T10:01:45Z] INFO  POST /api/auth/login 200 85ms
[2026-03-12T10:02:03Z] ERROR Connection timeout to external service: payments-api
[2026-03-12T10:02:04Z] WARN  Retrying request to payments-api (attempt 1/3)
[2026-03-12T10:02:05Z] INFO  GET /api/users/me 200 12ms
[2026-03-12T10:02:06Z] INFO  Retry successful for payments-api
[2026-03-12T10:03:00Z] INFO  Scheduled job: cleanup_expired_sessions started
[2026-03-12T10:03:01Z] INFO  Removed 14 expired sessions
[2026-03-12T10:04:22Z] INFO  GET /api/products?page=1&limit=20 200 45ms
[2026-03-12T10:05:00Z] INFO  WebSocket connection established: user_382
[2026-03-12T10:05:33Z] WARN  Rate limit approaching for IP 192.168.1.50 (85/100)
[2026-03-12T10:06:11Z] INFO  POST /api/orders 201 230ms
[2026-03-12T10:07:00Z] INFO  Background worker processed 8 queued tasks`;

// ─── Utility Components ──────────────────────────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{
      width: 60,
      height: 6,
      borderRadius: 3,
      background: 'var(--vscode-progressBar-background, #333)',
      overflow: 'hidden',
      display: 'inline-block',
      verticalAlign: 'middle',
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        borderRadius: 3,
        background: color,
        transition: 'width 0.3s ease',
      }} />
    </div>
  );
}

function StatusDot({ status }: { status: ContainerStatus }) {
  const colorMap: Record<ContainerStatus, string> = {
    running: '#3fb950',
    stopped: '#f85149',
    paused: '#d29922',
  };
  return (
    <span style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: colorMap[status],
      marginRight: 6,
      flexShrink: 0,
    }} />
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--vscode-panel-background, #1e1e1e)',
  color: 'var(--vscode-foreground, #cccccc)',
  fontFamily: 'var(--vscode-font-family, "Segoe UI", sans-serif)',
  fontSize: 13,
  overflow: 'hidden',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--vscode-panel-border, #2d2d2d)',
  background: 'var(--vscode-editorGroupHeader-tabsBackground, #252526)',
  flexShrink: 0,
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 14px',
  cursor: 'pointer',
  borderBottom: active ? '2px solid var(--vscode-focusBorder, #007acc)' : '2px solid transparent',
  color: active ? 'var(--vscode-foreground, #cccccc)' : 'var(--vscode-disabledForeground, #888)',
  background: 'transparent',
  border: 'none',
  borderBottomWidth: 2,
  borderBottomStyle: 'solid',
  borderBottomColor: active ? 'var(--vscode-focusBorder, #007acc)' : 'transparent',
  fontSize: 12,
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  whiteSpace: 'nowrap',
  transition: 'color 0.15s',
});

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 10px',
  borderBottom: '1px solid var(--vscode-panel-border, #2d2d2d)',
  flexShrink: 0,
};

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--vscode-foreground, #cccccc)',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 3,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--vscode-input-background, #3c3c3c)',
  color: 'var(--vscode-input-foreground, #cccccc)',
  border: '1px solid var(--vscode-input-border, #555)',
  borderRadius: 3,
  padding: '4px 8px',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '4px 0',
};

const rowStyle = (hovered: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  padding: '6px 10px',
  gap: 8,
  background: hovered ? 'var(--vscode-list-hoverBackground, #2a2d2e)' : 'transparent',
  cursor: 'pointer',
  fontSize: 12,
  transition: 'background 0.1s',
});

const badgeStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: 8,
  fontSize: 10,
  fontWeight: 600,
  background: color + '22',
  color: color,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
});

const dialogOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
};

const dialogStyle: React.CSSProperties = {
  background: 'var(--vscode-editorWidget-background, #252526)',
  border: '1px solid var(--vscode-editorWidget-border, #454545)',
  borderRadius: 6,
  padding: 20,
  width: 380,
  maxWidth: '90%',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};

const buttonStyle = (variant: 'primary' | 'secondary' | 'danger'): React.CSSProperties => {
  const colors = {
    primary: { bg: 'var(--vscode-button-background, #007acc)', fg: 'var(--vscode-button-foreground, #fff)' },
    secondary: { bg: 'var(--vscode-button-secondaryBackground, #3a3d41)', fg: 'var(--vscode-button-secondaryForeground, #ccc)' },
    danger: { bg: '#c93c37', fg: '#ffffff' },
  };
  return {
    padding: '6px 14px',
    borderRadius: 3,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    background: colors[variant].bg,
    color: colors[variant].fg,
  };
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 10px',
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  color: 'var(--vscode-sideBarSectionHeader-foreground, #bbbbbb)',
  background: 'var(--vscode-sideBarSectionHeader-background, #1e1e1e)',
  cursor: 'pointer',
  userSelect: 'none',
};

// ─── Container Tab ───────────────────────────────────────────────────────────

function ContainersTab() {
  const [containers, setContainers] = useState(DEMO_CONTAINERS);
  const [filter, setFilter] = useState('');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [execOpen, setExecOpen] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return containers.filter(
      c => c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q)
    );
  }, [containers, filter]);

  const handleAction = useCallback((id: string, action: string) => {
    setContainers(prev =>
      prev.map(c => {
        if (c.id !== id) return c;
        switch (action) {
          case 'start': return { ...c, status: 'running' as ContainerStatus, uptime: 'just now', cpu: 1.2, memory: 32 };
          case 'stop': return { ...c, status: 'stopped' as ContainerStatus, uptime: '-', cpu: 0, memory: 0 };
          case 'pause': return { ...c, status: 'paused' as ContainerStatus };
          case 'restart': return { ...c, uptime: 'just now', cpu: 1.0, memory: 48 };
          case 'remove': return null as unknown as ContainerInfo;
          default: return c;
        }
      }).filter(Boolean)
    );
  }, []);

  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [showLogs]);

  const logLines = DEMO_LOGS.split('\n');
  const filteredLogs = logSearch
    ? logLines.filter(l => l.toLowerCase().includes(logSearch.toLowerCase()))
    : logLines;

  if (showLogs) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={toolbarStyle}>
          <button style={iconBtnStyle} onClick={() => setShowLogs(false)} title="Back">
            <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <span style={{ fontWeight: 600, fontSize: 12 }}>
            Logs: {containers.find(c => c.id === selectedId)?.name ?? ''}
          </span>
          <div style={{ flex: 1 }} />
          <input
            style={{ ...searchInputStyle, flex: 'none', width: 180 }}
            placeholder="Search logs..."
            value={logSearch}
            onChange={e => setLogSearch(e.target.value)}
          />
          <button style={iconBtnStyle} title="Scroll to bottom"
            onClick={() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })}>
            <ArrowDown size={14} />
          </button>
        </div>
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: 10,
          fontFamily: 'var(--vscode-editor-font-family, "Cascadia Code", monospace)',
          fontSize: 11,
          lineHeight: 1.6,
          background: 'var(--vscode-terminal-background, #1a1a1a)',
        }}>
          {filteredLogs.map((line, i) => {
            let lineColor = 'var(--vscode-terminal-foreground, #ccc)';
            if (line.includes('ERROR')) lineColor = '#f85149';
            else if (line.includes('WARN')) lineColor = '#d29922';
            else if (line.includes('INFO')) lineColor = '#58a6ff';
            return (
              <div key={i} style={{ color: lineColor, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {line}
              </div>
            );
          })}
          <div ref={logsEndRef} />
        </div>
      </div>
    );
  }

  if (execOpen) {
    const container = containers.find(c => c.id === selectedId);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={toolbarStyle}>
          <button style={iconBtnStyle} onClick={() => setExecOpen(false)} title="Back">
            <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <Terminal size={14} />
          <span style={{ fontWeight: 600, fontSize: 12 }}>
            Exec: {container?.name} (sh)
          </span>
        </div>
        <div style={{
          flex: 1,
          padding: 10,
          fontFamily: 'var(--vscode-editor-font-family, monospace)',
          fontSize: 12,
          lineHeight: 1.5,
          background: 'var(--vscode-terminal-background, #1a1a1a)',
          color: 'var(--vscode-terminal-foreground, #ccc)',
        }}>
          <div style={{ color: '#3fb950' }}>root@{container?.id.slice(0, 12)}:/app#</div>
          <div style={{ opacity: 0.6, marginTop: 8 }}>
            Interactive terminal session (demo mode)
          </div>
          <div style={{ marginTop: 4, opacity: 0.4 }}>
            Type commands to execute inside the container...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={toolbarStyle}>
        <Search size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
        <input
          style={searchInputStyle}
          placeholder="Filter containers..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <button style={iconBtnStyle} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>
      <div style={listStyle}>
        {filtered.map(c => (
          <div
            key={c.id}
            style={rowStyle(hoveredRow === c.id)}
            onMouseEnter={() => setHoveredRow(c.id)}
            onMouseLeave={() => setHoveredRow(null)}
            onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
          >
            <StatusDot status={c.status} />
            <span style={{ fontWeight: 600, minWidth: 120 }}>{c.name}</span>
            <span style={{ opacity: 0.6, minWidth: 130 }}>{c.image}</span>
            <span style={badgeStyle(
              c.status === 'running' ? '#3fb950' : c.status === 'paused' ? '#d29922' : '#f85149'
            )}>
              {c.status}
            </span>
            <span style={{ opacity: 0.5, fontSize: 11, minWidth: 70 }}>
              {c.ports.map(p => `${p.host}:${p.container}`).join(', ') || '-'}
            </span>
            <span style={{ opacity: 0.5, fontSize: 11, minWidth: 50 }}>
              <Clock size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
              {c.uptime}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, alignItems: 'center' }}>
              {c.status === 'running' && (
                <>
                  <MiniBar value={c.cpu} max={100} color="#58a6ff" />
                  <span style={{ fontSize: 10, opacity: 0.5, width: 35, textAlign: 'right' }}>
                    {c.cpu.toFixed(1)}%
                  </span>
                  <MiniBar value={c.memory} max={c.memoryLimit} color="#d29922" />
                  <span style={{ fontSize: 10, opacity: 0.5, width: 42, textAlign: 'right' }}>
                    {c.memory}M
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', opacity: 0.5 }}>
            No containers found.
          </div>
        )}
      </div>
      {selectedId && (
        <div style={{
          borderTop: '1px solid var(--vscode-panel-border, #2d2d2d)',
          padding: '8px 10px',
          display: 'flex',
          gap: 6,
          flexShrink: 0,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, opacity: 0.6, marginRight: 4 }}>
            {containers.find(c => c.id === selectedId)?.name}:
          </span>
          {containers.find(c => c.id === selectedId)?.status !== 'running' && (
            <button style={buttonStyle('primary')} onClick={() => handleAction(selectedId, 'start')}>
              <Play size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} /> Start
            </button>
          )}
          {containers.find(c => c.id === selectedId)?.status === 'running' && (
            <>
              <button style={buttonStyle('secondary')} onClick={() => handleAction(selectedId, 'stop')}>
                <Square size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} /> Stop
              </button>
              <button style={buttonStyle('secondary')} onClick={() => handleAction(selectedId, 'pause')}>
                <Pause size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} /> Pause
              </button>
            </>
          )}
          <button style={buttonStyle('secondary')} onClick={() => handleAction(selectedId, 'restart')}>
            <RotateCcw size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} /> Restart
          </button>
          <button style={buttonStyle('secondary')} onClick={() => { setShowLogs(true); }}>
            <FileText size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} /> Logs
          </button>
          <button style={buttonStyle('secondary')} onClick={() => { setExecOpen(true); }}>
            <Terminal size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} /> Exec
          </button>
          <button style={buttonStyle('danger')} onClick={() => { handleAction(selectedId, 'remove'); setSelectedId(null); }}>
            <Trash2 size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} /> Remove
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Images Tab ──────────────────────────────────────────────────────────────

function ImagesTab() {
  const [images, setImages] = useState(DEMO_IMAGES);
  const [filter, setFilter] = useState('');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [showPull, setShowPull] = useState(false);
  const [showBuild, setShowBuild] = useState(false);
  const [pullInput, setPullInput] = useState('');
  const [buildDockerfile, setBuildDockerfile] = useState('./Dockerfile');
  const [buildTag, setBuildTag] = useState('myimage:latest');

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return images.filter(
      img => img.repository.toLowerCase().includes(q) || img.tag.toLowerCase().includes(q)
    );
  }, [images, filter]);

  const handlePull = useCallback(() => {
    if (!pullInput.trim()) return;
    const [repo, tag = 'latest'] = pullInput.split(':');
    setImages(prev => [
      ...prev,
      { id: `sha256:${Math.random().toString(36).slice(2, 8)}`, repository: repo, tag, size: '-- MB', created: '2026-03-12' },
    ]);
    setPullInput('');
    setShowPull(false);
  }, [pullInput]);

  const handleBuild = useCallback(() => {
    const [repo, tag = 'latest'] = buildTag.split(':');
    setImages(prev => [
      ...prev,
      { id: `sha256:${Math.random().toString(36).slice(2, 8)}`, repository: repo, tag, size: '-- MB', created: '2026-03-12' },
    ]);
    setShowBuild(false);
  }, [buildTag]);

  const handleRemove = useCallback((id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div style={toolbarStyle}>
        <Search size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
        <input
          style={searchInputStyle}
          placeholder="Filter images..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <button style={buttonStyle('primary')} onClick={() => setShowPull(true)}>
          <Download size={12} style={{ marginRight: 3, verticalAlign: 'middle' }} /> Pull
        </button>
        <button style={buttonStyle('secondary')} onClick={() => setShowBuild(true)}>
          <Hammer size={12} style={{ marginRight: 3, verticalAlign: 'middle' }} /> Build
        </button>
      </div>
      <div style={listStyle}>
        {filtered.map(img => (
          <div
            key={img.id}
            style={rowStyle(hoveredRow === img.id)}
            onMouseEnter={() => setHoveredRow(img.id)}
            onMouseLeave={() => setHoveredRow(null)}
          >
            <Layers size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, minWidth: 150 }}>{img.repository}</span>
            <span style={badgeStyle('#58a6ff')}>{img.tag}</span>
            <span style={{ opacity: 0.5, fontSize: 11, minWidth: 60 }}>{img.size}</span>
            <span style={{ opacity: 0.5, fontSize: 11, minWidth: 80 }}>{img.created}</span>
            <div style={{ marginLeft: 'auto' }}>
              <button
                style={{ ...iconBtnStyle, color: '#f85149' }}
                title="Remove image"
                onClick={(e) => { e.stopPropagation(); handleRemove(img.id); }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showPull && (
        <div style={dialogOverlayStyle} onClick={() => setShowPull(false)}>
          <div style={dialogStyle} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
              <Download size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Pull Image
            </h3>
            <label style={{ fontSize: 11, opacity: 0.7, display: 'block', marginBottom: 4 }}>
              Image name (e.g. nginx:latest)
            </label>
            <input
              style={{ ...searchInputStyle, width: '100%', marginBottom: 14, padding: '6px 10px' }}
              value={pullInput}
              onChange={e => setPullInput(e.target.value)}
              placeholder="repository:tag"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handlePull()}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={buttonStyle('secondary')} onClick={() => setShowPull(false)}>Cancel</button>
              <button style={buttonStyle('primary')} onClick={handlePull}>Pull</button>
            </div>
          </div>
        </div>
      )}

      {showBuild && (
        <div style={dialogOverlayStyle} onClick={() => setShowBuild(false)}>
          <div style={dialogStyle} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
              <Hammer size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Build Image
            </h3>
            <label style={{ fontSize: 11, opacity: 0.7, display: 'block', marginBottom: 4 }}>
              Dockerfile path
            </label>
            <input
              style={{ ...searchInputStyle, width: '100%', marginBottom: 10, padding: '6px 10px' }}
              value={buildDockerfile}
              onChange={e => setBuildDockerfile(e.target.value)}
            />
            <label style={{ fontSize: 11, opacity: 0.7, display: 'block', marginBottom: 4 }}>
              Image tag
            </label>
            <input
              style={{ ...searchInputStyle, width: '100%', marginBottom: 14, padding: '6px 10px' }}
              value={buildTag}
              onChange={e => setBuildTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleBuild()}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={buttonStyle('secondary')} onClick={() => setShowBuild(false)}>Cancel</button>
              <button style={buttonStyle('primary')} onClick={handleBuild}>Build</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Compose Tab ─────────────────────────────────────────────────────────────

function ComposeTab() {
  const [projects, setProjects] = useState(DEMO_COMPOSE);
  const [expandedProject, setExpandedProject] = useState<string | null>('myapp-stack');

  const toggleProject = useCallback((name: string) => {
    setExpandedProject(prev => prev === name ? null : name);
  }, []);

  const handleComposeAction = useCallback((projectName: string, action: 'up' | 'down') => {
    setProjects(prev =>
      prev.map(p => {
        if (p.name !== projectName) return p;
        const newStatus: ContainerStatus = action === 'up' ? 'running' : 'stopped';
        return {
          ...p,
          status: action === 'up' ? 'running' : 'stopped',
          services: p.services.map(s => ({ ...s, status: newStatus })),
        };
      })
    );
  }, []);

  const composeStatusColor = (status: string) => {
    if (status === 'running') return '#3fb950';
    if (status === 'partial') return '#d29922';
    return '#f85149';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={toolbarStyle}>
        <FolderOpen size={14} style={{ opacity: 0.6 }} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>Compose Projects</span>
        <div style={{ flex: 1 }} />
        <button style={iconBtnStyle} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>
      <div style={listStyle}>
        {projects.map(project => (
          <div key={project.name}>
            <div
              style={sectionHeaderStyle}
              onClick={() => toggleProject(project.name)}
            >
              {expandedProject === project.name
                ? <ChevronDown size={14} />
                : <ChevronRight size={14} />}
              <Server size={14} />
              <span>{project.name}</span>
              <span style={badgeStyle(composeStatusColor(project.status))}>{project.status}</span>
              <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 4 }}>{project.file}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button
                  style={buttonStyle('primary')}
                  onClick={e => { e.stopPropagation(); handleComposeAction(project.name, 'up'); }}
                >
                  <ArrowUp size={11} style={{ marginRight: 2, verticalAlign: 'middle' }} /> Up
                </button>
                <button
                  style={buttonStyle('danger')}
                  onClick={e => { e.stopPropagation(); handleComposeAction(project.name, 'down'); }}
                >
                  <ArrowDown size={11} style={{ marginRight: 2, verticalAlign: 'middle' }} /> Down
                </button>
              </div>
            </div>
            {expandedProject === project.name && (
              <div style={{ padding: '2px 0' }}>
                {project.services.map(svc => (
                  <div key={svc.name} style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '5px 10px 5px 36px',
                    gap: 8,
                    fontSize: 12,
                  }}>
                    <StatusDot status={svc.status} />
                    <span style={{ fontWeight: 600, minWidth: 100 }}>{svc.name}</span>
                    <span style={{ opacity: 0.6, minWidth: 140 }}>{svc.image}</span>
                    <span style={{ opacity: 0.5, fontSize: 11 }}>
                      {svc.ports.map(p => `${p.host}:${p.container}`).join(', ') || 'no ports'}
                    </span>
                    <span style={{ opacity: 0.5, fontSize: 11, marginLeft: 'auto' }}>
                      replicas: {svc.replicas}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Volumes Tab ─────────────────────────────────────────────────────────────

function VolumesTab() {
  const [volumes, setVolumes] = useState(DEMO_VOLUMES);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return volumes.filter(v => v.name.toLowerCase().includes(q));
  }, [volumes, filter]);

  const handleRemove = useCallback((name: string) => {
    setVolumes(prev => prev.filter(v => v.name !== name));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={toolbarStyle}>
        <Search size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
        <input
          style={searchInputStyle}
          placeholder="Filter volumes..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <button style={iconBtnStyle} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>
      <div style={listStyle}>
        {filtered.map(vol => (
          <div
            key={vol.name}
            style={rowStyle(hoveredRow === vol.name)}
            onMouseEnter={() => setHoveredRow(vol.name)}
            onMouseLeave={() => setHoveredRow(null)}
          >
            <HardDrive size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, minWidth: 140 }}>{vol.name}</span>
            <span style={badgeStyle('#58a6ff')}>{vol.driver}</span>
            <span style={{ opacity: 0.5, fontSize: 11, minWidth: 60 }}>{vol.size}</span>
            <span style={{
              opacity: 0.5,
              fontSize: 11,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {vol.mountPoint}
            </span>
            <span style={{ fontSize: 11, opacity: 0.6 }}>
              {vol.containers.length > 0
                ? vol.containers.join(', ')
                : <em style={{ opacity: 0.4 }}>unused</em>}
            </span>
            <button
              style={{ ...iconBtnStyle, color: '#f85149', marginLeft: 'auto' }}
              title="Remove volume"
              onClick={() => handleRemove(vol.name)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', opacity: 0.5 }}>No volumes found.</div>
        )}
      </div>
    </div>
  );
}

// ─── Networks Tab ────────────────────────────────────────────────────────────

function NetworksTab() {
  const [networks] = useState(DEMO_NETWORKS);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return networks.filter(n => n.name.toLowerCase().includes(q));
  }, [networks, filter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={toolbarStyle}>
        <Search size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
        <input
          style={searchInputStyle}
          placeholder="Filter networks..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <button style={iconBtnStyle} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>
      <div style={listStyle}>
        {filtered.map(net => (
          <div key={net.name}>
            <div
              style={rowStyle(hoveredRow === net.name)}
              onMouseEnter={() => setHoveredRow(net.name)}
              onMouseLeave={() => setHoveredRow(null)}
              onClick={() => setExpanded(expanded === net.name ? null : net.name)}
            >
              {expanded === net.name
                ? <ChevronDown size={14} style={{ flexShrink: 0 }} />
                : <ChevronRight size={14} style={{ flexShrink: 0 }} />}
              <Network size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, minWidth: 120 }}>{net.name}</span>
              <span style={badgeStyle('#a371f7')}>{net.driver}</span>
              <span style={{ opacity: 0.5, fontSize: 11, minWidth: 60 }}>{net.scope}</span>
              <span style={{ opacity: 0.5, fontSize: 11 }}>
                <Globe size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                {net.subnet}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.5 }}>
                {net.containers.length} container{net.containers.length !== 1 ? 's' : ''}
              </span>
            </div>
            {expanded === net.name && net.containers.length > 0 && (
              <div style={{ padding: '4px 0 4px 44px' }}>
                {net.containers.map(cName => (
                  <div key={cName} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 0',
                    fontSize: 12,
                    opacity: 0.7,
                  }}>
                    <Box size={12} />
                    <span>{cName}</span>
                  </div>
                ))}
              </div>
            )}
            {expanded === net.name && net.containers.length === 0 && (
              <div style={{ padding: '6px 44px', fontSize: 11, opacity: 0.4 }}>
                No containers connected to this network.
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', opacity: 0.5 }}>No networks found.</div>
        )}
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

const TAB_CONFIG: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'containers', label: 'Containers', icon: <Box size={13} /> },
  { id: 'images', label: 'Images', icon: <Layers size={13} /> },
  { id: 'compose', label: 'Compose', icon: <Server size={13} /> },
  { id: 'volumes', label: 'Volumes', icon: <HardDrive size={13} /> },
  { id: 'networks', label: 'Networks', icon: <Network size={13} /> },
];

const DockerPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('containers');

  const renderTab = () => {
    switch (activeTab) {
      case 'containers': return <ContainersTab />;
      case 'images': return <ImagesTab />;
      case 'compose': return <ComposeTab />;
      case 'volumes': return <VolumesTab />;
      case 'networks': return <NetworksTab />;
      default: return null;
    }
  };

  return (
    <div style={panelStyle}>
      <div style={tabBarStyle}>
        {TAB_CONFIG.map(t => (
          <button
            key={t.id}
            style={tabStyle(activeTab === t.id)}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {renderTab()}
      </div>
    </div>
  );
};

export default DockerPanel;
