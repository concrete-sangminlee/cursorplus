/**
 * CI/CD integration utilities.
 * View build status, workflow runs, and manage deployments from within the IDE.
 */

/* ── Types ─────────────────────────────────────────────── */

export type CIProvider = 'github-actions' | 'gitlab-ci' | 'jenkins' | 'circleci' | 'vercel' | 'netlify' | 'unknown'

export type WorkflowStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'skipped'
export type StepConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out'

export interface CIConfig {
  provider: CIProvider
  repoUrl?: string
  token?: string
  baseUrl?: string
}

export interface WorkflowRun {
  id: string
  name: string
  branch: string
  commit: string
  commitMessage: string
  author: string
  status: WorkflowStatus
  conclusion?: StepConclusion
  startedAt: string
  completedAt?: string
  duration?: number
  url: string
  jobs: WorkflowJob[]
}

export interface WorkflowJob {
  id: string
  name: string
  status: WorkflowStatus
  conclusion?: StepConclusion
  startedAt?: string
  completedAt?: string
  steps: WorkflowStep[]
  runner?: string
}

export interface WorkflowStep {
  name: string
  status: WorkflowStatus
  conclusion?: StepConclusion
  number: number
  startedAt?: string
  completedAt?: string
  log?: string
}

export interface Deployment {
  id: string
  environment: string
  status: 'pending' | 'active' | 'inactive' | 'failed'
  url: string
  branch: string
  commit: string
  createdAt: string
  creator: string
}

export interface BuildNotification {
  runId: string
  name: string
  branch: string
  status: WorkflowStatus
  conclusion?: StepConclusion
  url: string
}

/* ── CI Provider Detection ────────────────────────────── */

export function detectCIProvider(files: string[]): CIProvider {
  if (files.some(f => f.includes('.github/workflows/'))) return 'github-actions'
  if (files.some(f => f.includes('.gitlab-ci.yml'))) return 'gitlab-ci'
  if (files.some(f => f.includes('Jenkinsfile'))) return 'jenkins'
  if (files.some(f => f.includes('.circleci/'))) return 'circleci'
  if (files.some(f => f.includes('vercel.json'))) return 'vercel'
  if (files.some(f => f.includes('netlify.toml'))) return 'netlify'
  return 'unknown'
}

/* ── GitHub Actions ───────────────────────────────────── */

const api = () => (window as any).api

export async function getGitHubWorkflowRuns(owner: string, repo: string, token?: string): Promise<WorkflowRun[]> {
  try {
    const result = await api()?.githubApi?.(`repos/${owner}/${repo}/actions/runs`, token)
    if (!result?.workflow_runs) return []

    return result.workflow_runs.slice(0, 20).map((run: any) => ({
      id: run.id.toString(),
      name: run.name,
      branch: run.head_branch,
      commit: run.head_sha?.slice(0, 7),
      commitMessage: run.head_commit?.message || '',
      author: run.actor?.login || '',
      status: mapGitHubStatus(run.status),
      conclusion: mapGitHubConclusion(run.conclusion),
      startedAt: run.run_started_at || run.created_at,
      completedAt: run.updated_at,
      duration: run.run_started_at ? Date.parse(run.updated_at) - Date.parse(run.run_started_at) : undefined,
      url: run.html_url,
      jobs: [],
    }))
  } catch {
    return []
  }
}

export async function getGitHubWorkflowJobs(owner: string, repo: string, runId: string, token?: string): Promise<WorkflowJob[]> {
  try {
    const result = await api()?.githubApi?.(`repos/${owner}/${repo}/actions/runs/${runId}/jobs`, token)
    if (!result?.jobs) return []

    return result.jobs.map((job: any) => ({
      id: job.id.toString(),
      name: job.name,
      status: mapGitHubStatus(job.status),
      conclusion: mapGitHubConclusion(job.conclusion),
      startedAt: job.started_at,
      completedAt: job.completed_at,
      runner: job.runner_name,
      steps: (job.steps || []).map((step: any) => ({
        name: step.name,
        status: mapGitHubStatus(step.status),
        conclusion: mapGitHubConclusion(step.conclusion),
        number: step.number,
        startedAt: step.started_at,
        completedAt: step.completed_at,
      })),
    }))
  } catch {
    return []
  }
}

export async function rerunGitHubWorkflow(owner: string, repo: string, runId: string, token?: string): Promise<boolean> {
  try {
    await api()?.githubApiPost?.(`repos/${owner}/${repo}/actions/runs/${runId}/rerun`, token)
    return true
  } catch {
    return false
  }
}

export async function cancelGitHubWorkflow(owner: string, repo: string, runId: string, token?: string): Promise<boolean> {
  try {
    await api()?.githubApiPost?.(`repos/${owner}/${repo}/actions/runs/${runId}/cancel`, token)
    return true
  } catch {
    return false
  }
}

/* ── Deployment Tracking ──────────────────────────────── */

export async function getDeployments(owner: string, repo: string, token?: string): Promise<Deployment[]> {
  try {
    const result = await api()?.githubApi?.(`repos/${owner}/${repo}/deployments`, token)
    if (!Array.isArray(result)) return []

    return result.slice(0, 10).map((d: any) => ({
      id: d.id.toString(),
      environment: d.environment,
      status: 'active',
      url: d.payload?.web_url || '',
      branch: d.ref,
      commit: d.sha?.slice(0, 7),
      createdAt: d.created_at,
      creator: d.creator?.login || '',
    }))
  } catch {
    return []
  }
}

/* ── Workflow Config Generators ────────────────────────── */

export function generateGitHubActionsCI(projectType: string): string {
  switch (projectType) {
    case 'node':
      return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x, 22.x]

    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build --if-present
      - run: npm test
`

    case 'python':
      return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ['3.10', '3.11', '3.12']

    steps:
      - uses: actions/checkout@v4
      - name: Set up Python \${{ matrix.python-version }}
        uses: actions/setup-python@v5
        with:
          python-version: \${{ matrix.python-version }}
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install pytest
      - name: Run tests
        run: pytest
`

    case 'go':
      return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'
      - run: go build ./...
      - run: go test ./...
`

    case 'rust':
      return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      - run: cargo build --release
      - run: cargo test
`

    default:
      return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: echo "Add your build steps here"
      - name: Test
        run: echo "Add your test steps here"
`
  }
}

export function generateDockerfile(projectType: string): string {
  switch (projectType) {
    case 'node':
      return `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
`

    case 'python':
      return `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`

    case 'go':
      return `FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app/server .

FROM alpine:latest
COPY --from=builder /app/server /server
EXPOSE 8080
CMD ["/server"]
`

    default:
      return `FROM ubuntu:22.04
WORKDIR /app
COPY . .
CMD ["echo", "Configure your Dockerfile"]
`
  }
}

/* ── Helpers ──────────────────────────────────────────── */

function mapGitHubStatus(status: string): WorkflowStatus {
  switch (status) {
    case 'queued':
    case 'waiting':
      return 'queued'
    case 'in_progress':
    case 'pending':
      return 'in_progress'
    case 'completed':
      return 'completed'
    default:
      return 'queued'
  }
}

function mapGitHubConclusion(conclusion: string | null): StepConclusion | undefined {
  if (!conclusion) return undefined
  switch (conclusion) {
    case 'success': return 'success'
    case 'failure': return 'failure'
    case 'cancelled': return 'cancelled'
    case 'skipped': return 'skipped'
    case 'timed_out': return 'timed_out'
    default: return undefined
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

export function getStatusColor(status: WorkflowStatus, conclusion?: StepConclusion): string {
  if (conclusion === 'success') return '#3fb950'
  if (conclusion === 'failure') return '#f85149'
  if (conclusion === 'cancelled') return '#8b949e'
  if (status === 'in_progress') return '#d29922'
  if (status === 'queued') return '#8b949e'
  return '#8b949e'
}

export function getStatusIcon(status: WorkflowStatus, conclusion?: StepConclusion): string {
  if (conclusion === 'success') return '✓'
  if (conclusion === 'failure') return '✗'
  if (conclusion === 'cancelled') return '⊘'
  if (conclusion === 'skipped') return '→'
  if (status === 'in_progress') return '◉'
  if (status === 'queued') return '◎'
  return '·'
}
