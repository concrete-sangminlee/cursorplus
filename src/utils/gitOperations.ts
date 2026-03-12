/**
 * Orion IDE - Comprehensive Git Operations Utility Layer
 *
 * Provides fully-typed wrappers around Git commands via Electron IPC.
 * All operations communicate through `(window as any).electron?.invoke('git:*')`
 * and return strongly-typed results. No external dependencies.
 */

/* ══════════════════════════════════════════════════════════════
   INTERFACES & TYPE DEFINITIONS
   ══════════════════════════════════════════════════════════════ */

/** Status codes for individual file changes */
export type GitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'unmerged'
  | 'untracked'
  | 'ignored';

/** A single changed file with status metadata */
export interface GitFileChange {
  path: string;
  status: GitFileStatus;
  oldPath?: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
}

/** Full repository status snapshot */
export interface GitStatus {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicted: string[];
  stashCount: number;
  isDetached: boolean;
  isRebasing: boolean;
  isMerging: boolean;
  isCherryPicking: boolean;
  isBisecting: boolean;
  rebaseProgress?: { current: number; total: number };
  headCommit: string | null;
}

/** A single commit entry from git log */
export interface GitCommit {
  hash: string;
  shortHash: string;
  treeHash: string;
  author: string;
  authorEmail: string;
  authorDate: string;
  authorTimestamp: number;
  committer: string;
  committerEmail: string;
  committerDate: string;
  committerTimestamp: number;
  subject: string;
  body: string;
  parents: string[];
  refs: string[];
  isHead: boolean;
  isMergeCommit: boolean;
  signature?: GitSignature;
}

/** GPG/SSH signature information on a commit */
export interface GitSignature {
  valid: boolean;
  signer: string;
  key: string;
  fingerprint: string;
}

/** Branch information */
export interface GitBranch {
  name: string;
  fullName: string;
  current: boolean;
  isRemote: boolean;
  remote?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  lastCommitHash: string;
  lastCommitMessage: string;
  lastCommitDate: string;
  isHead: boolean;
}

/** Remote repository configuration */
export interface GitRemote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
  headBranch?: string;
  branches: string[];
}

/** Stash entry */
export interface GitStash {
  index: number;
  message: string;
  branch: string;
  date: string;
  hash: string;
  author: string;
  untracked: boolean;
}

/** Tag information */
export interface GitTag {
  name: string;
  hash: string;
  targetHash?: string;
  message: string;
  tagger?: string;
  taggerEmail?: string;
  date: string;
  isAnnotated: boolean;
}

/** Line-by-line blame information */
export interface GitBlameEntry {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  authorDate: string;
  authorTimestamp: number;
  committer: string;
  committerEmail: string;
  committerDate: string;
  summary: string;
  line: number;
  originalLine: number;
  finalLine: number;
  content: string;
  isUncommitted: boolean;
  filename: string;
}

/** A single hunk within a diff */
export interface GitHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: GitDiffLine[];
}

/** A single line within a hunk */
export interface GitDiffLine {
  type: 'add' | 'delete' | 'context';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

/** Diff for a single file */
export interface GitFileDiff {
  oldPath: string;
  newPath: string;
  status: GitFileStatus;
  isBinary: boolean;
  hunks: GitHunk[];
  additions: number;
  deletions: number;
  oldMode?: string;
  newMode?: string;
}

/** Complete diff result with stats */
export interface GitDiff {
  files: GitFileDiff[];
  totalAdditions: number;
  totalDeletions: number;
  totalFiles: number;
}

/** Diff statistics for a single file */
export interface GitDiffStat {
  file: string;
  additions: number;
  deletions: number;
  binary: boolean;
}

/** Conflict information for a single file */
export interface GitConflict {
  file: string;
  oursLabel: string;
  theirsLabel: string;
  baseLabel: string;
  markers: GitConflictMarker[];
  hasResolved: boolean;
}

/** A single conflict region within a file */
export interface GitConflictMarker {
  startLine: number;
  separatorLine: number;
  endLine: number;
  oursContent: string;
  theirsContent: string;
  baseContent?: string;
}

/** Parsed conflict sections from a file */
export interface GitConflictFile {
  path: string;
  sections: GitConflictSection[];
  totalConflicts: number;
}

/** A single conflict section with ours/theirs/base content */
export interface GitConflictSection {
  index: number;
  ours: string;
  theirs: string;
  base: string | null;
  startLine: number;
  endLine: number;
}

/** Submodule information */
export interface GitSubmodule {
  name: string;
  path: string;
  url: string;
  branch?: string;
  hash: string;
  status: 'initialized' | 'uninitialized' | 'modified' | 'conflict';
  dirty: boolean;
}

/** Worktree information */
export interface GitWorktree {
  path: string;
  head: string;
  branch: string | null;
  isMain: boolean;
  isBare: boolean;
  isDetached: boolean;
  isLocked: boolean;
  lockReason?: string;
  prunable: boolean;
}

/** Bisect status */
export interface GitBisectStatus {
  active: boolean;
  good: string[];
  bad: string[];
  remaining: number;
  currentRef: string | null;
  stepsRemaining: number;
}

/** Git configuration entry */
export interface GitConfigEntry {
  key: string;
  value: string;
  scope: 'system' | 'global' | 'local' | 'worktree';
  origin: string;
}

/** Options for log queries */
export interface GitLogOptions {
  maxCount?: number;
  skip?: number;
  author?: string;
  committer?: string;
  since?: string;
  until?: string;
  path?: string;
  grep?: string;
  all?: boolean;
  firstParent?: boolean;
  merges?: boolean;
  noMerges?: boolean;
  reverse?: boolean;
  refRange?: string;
}

/** Options for diff queries */
export interface GitDiffOptions {
  staged?: boolean;
  nameOnly?: boolean;
  stat?: boolean;
  ref1?: string;
  ref2?: string;
  contextLines?: number;
  ignoreWhitespace?: boolean;
  wordDiff?: boolean;
  path?: string;
}

/** Options for push operations */
export interface GitPushOptions {
  force?: boolean;
  forceWithLease?: boolean;
  setUpstream?: boolean;
  tags?: boolean;
  dryRun?: boolean;
  delete?: boolean;
  atomic?: boolean;
}

/** Options for pull operations */
export interface GitPullOptions {
  rebase?: boolean;
  noRebase?: boolean;
  ffOnly?: boolean;
  noFf?: boolean;
  autostash?: boolean;
  prune?: boolean;
}

/** Options for fetch operations */
export interface GitFetchOptions {
  prune?: boolean;
  all?: boolean;
  tags?: boolean;
  depth?: number;
  dryRun?: boolean;
  force?: boolean;
}

/** Options for merge operations */
export interface GitMergeOptions {
  noFastForward?: boolean;
  fastForwardOnly?: boolean;
  squash?: boolean;
  message?: string;
  strategy?: string;
  strategyOption?: string;
  noCommit?: boolean;
}

/** Options for commit operations */
export interface GitCommitOptions {
  amend?: boolean;
  signoff?: boolean;
  allowEmpty?: boolean;
  noVerify?: boolean;
  gpgSign?: boolean;
  author?: string;
  date?: string;
}

/** Options for stash operations */
export interface GitStashOptions {
  includeUntracked?: boolean;
  keepIndex?: boolean;
  staged?: boolean;
  message?: string;
}

/** Result of an IPC git operation */
interface GitIpcResult<T = string> {
  data?: T;
  error?: string;
  exitCode?: number;
  stderr?: string;
}

/* ══════════════════════════════════════════════════════════════
   IPC BRIDGE
   ══════════════════════════════════════════════════════════════ */

/**
 * Invoke a git IPC command through the Electron bridge.
 * All Git operations route through this single entry point.
 */
async function gitInvoke<T = string>(
  channel: string,
  ...args: unknown[]
): Promise<T> {
  const electron = (window as any).electron;
  if (!electron?.invoke) {
    throw new Error('Electron IPC bridge not available');
  }

  const result: GitIpcResult<T> = await electron.invoke(channel, ...args);

  if (result?.error) {
    const err = new Error(result.error);
    (err as any).exitCode = result?.exitCode;
    (err as any).stderr = result?.stderr;
    throw err;
  }

  return result?.data as T;
}

/** Shorthand for git-namespaced IPC calls */
async function git<T = string>(
  operation: string,
  ...args: unknown[]
): Promise<T> {
  return gitInvoke<T>(`git:${operation}`, ...args);
}

/* ══════════════════════════════════════════════════════════════
   1. REPOSITORY STATUS
   ══════════════════════════════════════════════════════════════ */

/** Get the full working tree status */
export async function getStatus(cwd?: string): Promise<GitStatus> {
  const raw = await git<any>('status', cwd);
  return normalizeStatus(raw);
}

/** Normalize a raw status response into GitStatus */
function normalizeStatus(raw: any): GitStatus {
  if (typeof raw === 'object' && raw !== null && 'branch' in raw) {
    return {
      branch: raw.branch ?? '',
      upstream: raw.upstream ?? null,
      ahead: raw.ahead ?? 0,
      behind: raw.behind ?? 0,
      staged: (raw.staged ?? []).map(normalizeFileChange),
      unstaged: (raw.unstaged ?? []).map(normalizeFileChange),
      untracked: raw.untracked ?? [],
      conflicted: raw.conflicted ?? [],
      stashCount: raw.stashCount ?? 0,
      isDetached: raw.isDetached ?? false,
      isRebasing: raw.isRebasing ?? false,
      isMerging: raw.isMerging ?? false,
      isCherryPicking: raw.isCherryPicking ?? false,
      isBisecting: raw.isBisecting ?? false,
      rebaseProgress: raw.rebaseProgress ?? undefined,
      headCommit: raw.headCommit ?? null,
    };
  }

  return createEmptyStatus();
}

/** Build a default empty status object */
function createEmptyStatus(): GitStatus {
  return {
    branch: '',
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    stashCount: 0,
    isDetached: false,
    isRebasing: false,
    isMerging: false,
    isCherryPicking: false,
    isBisecting: false,
    headCommit: null,
  };
}

/** Normalize a raw file change entry */
function normalizeFileChange(raw: any): GitFileChange {
  return {
    path: raw.path ?? '',
    status: raw.status ?? 'modified',
    oldPath: raw.oldPath,
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    isBinary: raw.isBinary ?? false,
  };
}

/** Get unstaged diff output */
export async function getDiff(path?: string, cwd?: string): Promise<string> {
  return git<string>('diff', { path, staged: false }, cwd);
}

/** Get staged diff output */
export async function getDiffStaged(
  path?: string,
  cwd?: string
): Promise<string> {
  return git<string>('diff', { path, staged: true }, cwd);
}

/** Get structured diff with parsed hunks */
export async function getDiffParsed(
  options?: GitDiffOptions,
  cwd?: string
): Promise<GitDiff> {
  const raw = await git<string>('diffRaw', options, cwd);
  return parseDiff(raw);
}

/** Query git log with filtering options */
export async function getLog(
  options?: GitLogOptions,
  cwd?: string
): Promise<GitCommit[]> {
  const result = await git<any[]>('log', options, cwd);
  return (result ?? []).map(normalizeCommit);
}

/** Get details of a specific commit */
export async function getCommitDetail(
  hash: string,
  cwd?: string
): Promise<GitCommit> {
  const result = await git<any>('commitDetail', hash, cwd);
  return normalizeCommit(result);
}

/** Normalize raw commit data */
function normalizeCommit(raw: any): GitCommit {
  return {
    hash: raw.hash ?? '',
    shortHash: raw.shortHash ?? (raw.hash ?? '').substring(0, 7),
    treeHash: raw.treeHash ?? '',
    author: raw.author ?? '',
    authorEmail: raw.authorEmail ?? '',
    authorDate: raw.authorDate ?? '',
    authorTimestamp: raw.authorTimestamp ?? 0,
    committer: raw.committer ?? '',
    committerEmail: raw.committerEmail ?? '',
    committerDate: raw.committerDate ?? '',
    committerTimestamp: raw.committerTimestamp ?? 0,
    subject: raw.subject ?? raw.message ?? '',
    body: raw.body ?? '',
    parents: raw.parents ?? [],
    refs: raw.refs ?? [],
    isHead: raw.isHead ?? false,
    isMergeCommit: (raw.parents ?? []).length > 1,
    signature: raw.signature ?? undefined,
  };
}

/** List all branches (local and remote) */
export async function getBranches(cwd?: string): Promise<GitBranch[]> {
  const result = await git<any[]>('branches', cwd);
  return (result ?? []).map(normalizeBranch);
}

/** Normalize raw branch data */
function normalizeBranch(raw: any): GitBranch {
  return {
    name: raw.name ?? '',
    fullName: raw.fullName ?? raw.name ?? '',
    current: raw.current ?? false,
    isRemote: raw.isRemote ?? false,
    remote: raw.remote,
    upstream: raw.upstream,
    ahead: raw.ahead ?? 0,
    behind: raw.behind ?? 0,
    lastCommitHash: raw.lastCommitHash ?? '',
    lastCommitMessage: raw.lastCommitMessage ?? '',
    lastCommitDate: raw.lastCommitDate ?? '',
    isHead: raw.isHead ?? raw.current ?? false,
  };
}

/** List all tags */
export async function getTags(cwd?: string): Promise<GitTag[]> {
  const result = await git<any[]>('tags', cwd);
  return (result ?? []).map(normalizeTag);
}

/** Normalize raw tag data */
function normalizeTag(raw: any): GitTag {
  return {
    name: raw.name ?? '',
    hash: raw.hash ?? '',
    targetHash: raw.targetHash,
    message: raw.message ?? '',
    tagger: raw.tagger,
    taggerEmail: raw.taggerEmail,
    date: raw.date ?? '',
    isAnnotated: raw.isAnnotated ?? false,
  };
}

/** List all remotes */
export async function getRemotes(cwd?: string): Promise<GitRemote[]> {
  const result = await git<any[]>('remotes', cwd);
  return (result ?? []).map(normalizeRemote);
}

/** Normalize raw remote data */
function normalizeRemote(raw: any): GitRemote {
  return {
    name: raw.name ?? '',
    fetchUrl: raw.fetchUrl ?? '',
    pushUrl: raw.pushUrl ?? raw.fetchUrl ?? '',
    headBranch: raw.headBranch,
    branches: raw.branches ?? [],
  };
}

/** List all stashes */
export async function getStashes(cwd?: string): Promise<GitStash[]> {
  const result = await git<any[]>('stashList', cwd);
  return (result ?? []).map(normalizeStash);
}

/** Normalize raw stash data */
function normalizeStash(raw: any): GitStash {
  return {
    index: raw.index ?? 0,
    message: raw.message ?? '',
    branch: raw.branch ?? '',
    date: raw.date ?? '',
    hash: raw.hash ?? '',
    author: raw.author ?? '',
    untracked: raw.untracked ?? false,
  };
}

/* ══════════════════════════════════════════════════════════════
   2. STAGING
   ══════════════════════════════════════════════════════════════ */

/** Stage specific file paths */
export async function stage(
  paths: string[],
  cwd?: string
): Promise<void> {
  await git('stage', paths, cwd);
}

/** Unstage specific file paths */
export async function unstage(
  paths: string[],
  cwd?: string
): Promise<void> {
  await git('unstage', paths, cwd);
}

/** Stage all changes including untracked files */
export async function stageAll(cwd?: string): Promise<void> {
  await git('stageAll', cwd);
}

/** Unstage all staged changes */
export async function unstageAll(cwd?: string): Promise<void> {
  await git('unstageAll', cwd);
}

/** Stage a specific hunk from a diff */
export async function stageHunk(
  filePath: string,
  hunkIndex: number,
  hunkContent: string,
  cwd?: string
): Promise<void> {
  await git('stageHunk', filePath, hunkIndex, hunkContent, cwd);
}

/** Unstage a specific hunk from a staged diff */
export async function unstageHunk(
  filePath: string,
  hunkIndex: number,
  hunkContent: string,
  cwd?: string
): Promise<void> {
  await git('unstageHunk', filePath, hunkIndex, hunkContent, cwd);
}

/** Discard working tree changes for specific paths */
export async function discardChanges(
  paths: string[],
  cwd?: string
): Promise<void> {
  await git('discardChanges', paths, cwd);
}

/** Discard all working tree changes */
export async function discardAllChanges(cwd?: string): Promise<void> {
  await git('discardAllChanges', cwd);
}

/** Stage selected lines within a hunk */
export async function stageLines(
  filePath: string,
  lineStart: number,
  lineEnd: number,
  cwd?: string
): Promise<void> {
  await git('stageLines', filePath, lineStart, lineEnd, cwd);
}

/** Unstage selected lines within a hunk */
export async function unstageLines(
  filePath: string,
  lineStart: number,
  lineEnd: number,
  cwd?: string
): Promise<void> {
  await git('unstageLines', filePath, lineStart, lineEnd, cwd);
}

/* ══════════════════════════════════════════════════════════════
   3. COMMITS
   ══════════════════════════════════════════════════════════════ */

/** Create a new commit with the given message */
export async function commit(
  message: string,
  options?: GitCommitOptions,
  cwd?: string
): Promise<string> {
  return git<string>('commit', message, options, cwd);
}

/** Amend the last commit with a new message (or keep existing) */
export async function commitAmend(
  message?: string,
  cwd?: string
): Promise<string> {
  return git<string>('commitAmend', message, cwd);
}

/** Cherry-pick a commit onto the current branch */
export async function cherryPick(
  hash: string,
  options?: { noCommit?: boolean; mainline?: number },
  cwd?: string
): Promise<void> {
  await git('cherryPick', hash, options, cwd);
}

/** Abort an in-progress cherry-pick */
export async function cherryPickAbort(cwd?: string): Promise<void> {
  await git('cherryPickAbort', cwd);
}

/** Continue an in-progress cherry-pick after resolving conflicts */
export async function cherryPickContinue(cwd?: string): Promise<void> {
  await git('cherryPickContinue', cwd);
}

/** Revert a commit, creating a new commit that undoes it */
export async function revert(
  hash: string,
  options?: { noCommit?: boolean; mainline?: number },
  cwd?: string
): Promise<void> {
  await git('revert', hash, options, cwd);
}

/** Abort an in-progress revert */
export async function revertAbort(cwd?: string): Promise<void> {
  await git('revertAbort', cwd);
}

/** Continue an in-progress revert after resolving conflicts */
export async function revertContinue(cwd?: string): Promise<void> {
  await git('revertContinue', cwd);
}

/** Soft reset: move HEAD, keep changes staged */
export async function resetSoft(
  ref: string,
  cwd?: string
): Promise<void> {
  await git('reset', ref, 'soft', cwd);
}

/** Mixed reset: move HEAD, unstage changes but keep in working tree */
export async function resetMixed(
  ref: string,
  cwd?: string
): Promise<void> {
  await git('reset', ref, 'mixed', cwd);
}

/** Hard reset: move HEAD, discard all changes */
export async function resetHard(
  ref: string,
  cwd?: string
): Promise<void> {
  await git('reset', ref, 'hard', cwd);
}

/** Reset specific files to a given ref */
export async function resetFiles(
  ref: string,
  paths: string[],
  cwd?: string
): Promise<void> {
  await git('resetFiles', ref, paths, cwd);
}

/* ══════════════════════════════════════════════════════════════
   4. BRANCHES
   ══════════════════════════════════════════════════════════════ */

/** Create a new branch at the given start point */
export async function createBranch(
  name: string,
  startPoint?: string,
  checkout?: boolean,
  cwd?: string
): Promise<void> {
  await git('createBranch', name, startPoint, checkout ?? false, cwd);
}

/** Delete a local branch */
export async function deleteBranch(
  name: string,
  force?: boolean,
  cwd?: string
): Promise<void> {
  await git('deleteBranch', name, force ?? false, cwd);
}

/** Delete a remote branch */
export async function deleteRemoteBranch(
  remote: string,
  name: string,
  cwd?: string
): Promise<void> {
  await git('deleteRemoteBranch', remote, name, cwd);
}

/** Rename a branch */
export async function renameBranch(
  oldName: string,
  newName: string,
  cwd?: string
): Promise<void> {
  await git('renameBranch', oldName, newName, cwd);
}

/** Check out an existing branch or ref */
export async function checkout(
  ref: string,
  cwd?: string
): Promise<void> {
  await git('checkout', ref, cwd);
}

/** Check out and create a new branch simultaneously */
export async function checkoutNewBranch(
  name: string,
  startPoint?: string,
  cwd?: string
): Promise<void> {
  await git('checkoutNew', name, startPoint, cwd);
}

/** Check out specific files from a ref */
export async function checkoutFiles(
  ref: string,
  paths: string[],
  cwd?: string
): Promise<void> {
  await git('checkoutFiles', ref, paths, cwd);
}

/** Merge a branch into the current branch */
export async function merge(
  branch: string,
  options?: GitMergeOptions,
  cwd?: string
): Promise<void> {
  await git('merge', branch, options, cwd);
}

/** Abort an in-progress merge */
export async function mergeAbort(cwd?: string): Promise<void> {
  await git('mergeAbort', cwd);
}

/** Continue an in-progress merge after resolving conflicts */
export async function mergeContinue(cwd?: string): Promise<void> {
  await git('mergeContinue', cwd);
}

/** Rebase current branch onto another branch */
export async function rebase(
  branch: string,
  options?: { interactive?: boolean; onto?: string; autosquash?: boolean },
  cwd?: string
): Promise<void> {
  await git('rebase', branch, options, cwd);
}

/** Abort an in-progress rebase */
export async function abortRebase(cwd?: string): Promise<void> {
  await git('rebaseAbort', cwd);
}

/** Continue an in-progress rebase after resolving conflicts */
export async function continueRebase(cwd?: string): Promise<void> {
  await git('rebaseContinue', cwd);
}

/** Skip the current commit during a rebase */
export async function skipRebase(cwd?: string): Promise<void> {
  await git('rebaseSkip', cwd);
}

/* ══════════════════════════════════════════════════════════════
   5. REMOTE OPERATIONS
   ══════════════════════════════════════════════════════════════ */

/** Fetch from a remote */
export async function fetch(
  remote?: string,
  options?: GitFetchOptions,
  cwd?: string
): Promise<void> {
  await git('fetch', remote ?? 'origin', options, cwd);
}

/** Fetch from all remotes */
export async function fetchAll(
  options?: GitFetchOptions,
  cwd?: string
): Promise<void> {
  await git('fetch', null, { ...options, all: true }, cwd);
}

/** Pull from a remote branch */
export async function pull(
  remote?: string,
  branch?: string,
  options?: GitPullOptions,
  cwd?: string
): Promise<void> {
  await git('pull', remote ?? 'origin', branch, options, cwd);
}

/** Push to a remote branch */
export async function push(
  remote?: string,
  branch?: string,
  options?: GitPushOptions,
  cwd?: string
): Promise<void> {
  await git('push', remote ?? 'origin', branch, options, cwd);
}

/** Force push with lease to a remote branch */
export async function pushForce(
  remote?: string,
  branch?: string,
  cwd?: string
): Promise<void> {
  await git('push', remote ?? 'origin', branch, { forceWithLease: true }, cwd);
}

/** Add a new remote */
export async function addRemote(
  name: string,
  url: string,
  cwd?: string
): Promise<void> {
  await git('addRemote', name, url, cwd);
}

/** Remove an existing remote */
export async function removeRemote(
  name: string,
  cwd?: string
): Promise<void> {
  await git('removeRemote', name, cwd);
}

/** Rename a remote */
export async function renameRemote(
  oldName: string,
  newName: string,
  cwd?: string
): Promise<void> {
  await git('renameRemote', oldName, newName, cwd);
}

/** Set the URL for a remote */
export async function setRemoteUrl(
  name: string,
  url: string,
  cwd?: string
): Promise<void> {
  await git('setRemoteUrl', name, url, cwd);
}

/** Set the upstream tracking branch */
export async function setUpstream(
  remote: string,
  branch: string,
  cwd?: string
): Promise<void> {
  await git('setUpstream', remote, branch, cwd);
}

/** Unset the upstream tracking branch */
export async function unsetUpstream(
  branch?: string,
  cwd?: string
): Promise<void> {
  await git('unsetUpstream', branch, cwd);
}

/* ══════════════════════════════════════════════════════════════
   6. STASH
   ══════════════════════════════════════════════════════════════ */

/** Stash current changes */
export async function stash(
  options?: GitStashOptions,
  cwd?: string
): Promise<void> {
  await git('stash', options, cwd);
}

/** Pop the topmost (or specified) stash entry */
export async function stashPop(
  index?: number,
  cwd?: string
): Promise<void> {
  await git('stashPop', index ?? 0, cwd);
}

/** Apply the topmost (or specified) stash entry without removing it */
export async function stashApply(
  index?: number,
  cwd?: string
): Promise<void> {
  await git('stashApply', index ?? 0, cwd);
}

/** Drop a specific stash entry */
export async function stashDrop(
  index: number,
  cwd?: string
): Promise<void> {
  await git('stashDrop', index, cwd);
}

/** Drop all stash entries */
export async function stashClear(cwd?: string): Promise<void> {
  await git('stashClear', cwd);
}

/** List all stash entries */
export async function stashList(cwd?: string): Promise<GitStash[]> {
  return getStashes(cwd);
}

/** Show the diff of a specific stash entry */
export async function stashShow(
  index?: number,
  cwd?: string
): Promise<string> {
  return git<string>('stashShow', index ?? 0, cwd);
}

/** Create a stash from specific files */
export async function stashFiles(
  paths: string[],
  message?: string,
  cwd?: string
): Promise<void> {
  await git('stashFiles', paths, message, cwd);
}

/* ══════════════════════════════════════════════════════════════
   7. TAGS
   ══════════════════════════════════════════════════════════════ */

/** Create a lightweight or annotated tag */
export async function createTag(
  name: string,
  options?: { message?: string; hash?: string; force?: boolean },
  cwd?: string
): Promise<void> {
  await git('createTag', name, options, cwd);
}

/** Delete a local tag */
export async function deleteTag(
  name: string,
  cwd?: string
): Promise<void> {
  await git('deleteTag', name, cwd);
}

/** Push tags to a remote */
export async function pushTags(
  remote?: string,
  tagName?: string,
  cwd?: string
): Promise<void> {
  await git('pushTags', remote ?? 'origin', tagName, cwd);
}

/** Delete a remote tag */
export async function deleteRemoteTag(
  remote: string,
  name: string,
  cwd?: string
): Promise<void> {
  await git('deleteRemoteTag', remote, name, cwd);
}

/** Verify a tag's GPG signature */
export async function verifyTag(
  name: string,
  cwd?: string
): Promise<{ valid: boolean; signer?: string }> {
  return git('verifyTag', name, cwd);
}

/* ══════════════════════════════════════════════════════════════
   8. SUBMODULES
   ══════════════════════════════════════════════════════════════ */

/** Initialize all submodules */
export async function initSubmodules(cwd?: string): Promise<void> {
  await git('submoduleInit', cwd);
}

/** Update submodules, optionally recursively */
export async function updateSubmodules(
  options?: { recursive?: boolean; remote?: boolean; init?: boolean },
  cwd?: string
): Promise<void> {
  await git('submoduleUpdate', options, cwd);
}

/** Add a new submodule */
export async function addSubmodule(
  url: string,
  path: string,
  branch?: string,
  cwd?: string
): Promise<void> {
  await git('submoduleAdd', url, path, branch, cwd);
}

/** Remove a submodule */
export async function removeSubmodule(
  path: string,
  cwd?: string
): Promise<void> {
  await git('submoduleRemove', path, cwd);
}

/** List all submodules with status */
export async function listSubmodules(
  cwd?: string
): Promise<GitSubmodule[]> {
  const result = await git<any[]>('submoduleList', cwd);
  return (result ?? []).map((raw) => ({
    name: raw.name ?? '',
    path: raw.path ?? '',
    url: raw.url ?? '',
    branch: raw.branch,
    hash: raw.hash ?? '',
    status: raw.status ?? 'uninitialized',
    dirty: raw.dirty ?? false,
  }));
}

/** Sync submodule URLs from .gitmodules */
export async function syncSubmodules(cwd?: string): Promise<void> {
  await git('submoduleSync', cwd);
}

/* ══════════════════════════════════════════════════════════════
   9. BISECT
   ══════════════════════════════════════════════════════════════ */

/** Start a bisect session between a good and bad commit */
export async function bisectStart(
  bad?: string,
  good?: string,
  cwd?: string
): Promise<string> {
  return git<string>('bisectStart', bad, good, cwd);
}

/** Mark the current commit as good */
export async function bisectGood(
  ref?: string,
  cwd?: string
): Promise<string> {
  return git<string>('bisectGood', ref, cwd);
}

/** Mark the current commit as bad */
export async function bisectBad(
  ref?: string,
  cwd?: string
): Promise<string> {
  return git<string>('bisectBad', ref, cwd);
}

/** Reset (end) the bisect session */
export async function bisectReset(cwd?: string): Promise<void> {
  await git('bisectReset', cwd);
}

/** Skip the current commit during bisect */
export async function bisectSkip(
  ref?: string,
  cwd?: string
): Promise<string> {
  return git<string>('bisectSkip', ref, cwd);
}

/** Get the current bisect status */
export async function bisectStatus(
  cwd?: string
): Promise<GitBisectStatus> {
  const result = await git<any>('bisectStatus', cwd);
  return {
    active: result?.active ?? false,
    good: result?.good ?? [],
    bad: result?.bad ?? [],
    remaining: result?.remaining ?? 0,
    currentRef: result?.currentRef ?? null,
    stepsRemaining: result?.stepsRemaining ?? 0,
  };
}

/** Run bisect with an automated test command */
export async function bisectRun(
  command: string,
  cwd?: string
): Promise<string> {
  return git<string>('bisectRun', command, cwd);
}

/** View the bisect log */
export async function bisectLog(cwd?: string): Promise<string> {
  return git<string>('bisectLog', cwd);
}

/* ══════════════════════════════════════════════════════════════
   10. WORKTREES
   ══════════════════════════════════════════════════════════════ */

/** Add a new worktree at the given path */
export async function addWorktree(
  path: string,
  branch?: string,
  options?: { newBranch?: boolean; detach?: boolean; force?: boolean },
  cwd?: string
): Promise<void> {
  await git('worktreeAdd', path, branch, options, cwd);
}

/** Remove a worktree */
export async function removeWorktree(
  path: string,
  force?: boolean,
  cwd?: string
): Promise<void> {
  await git('worktreeRemove', path, force ?? false, cwd);
}

/** List all worktrees */
export async function listWorktrees(
  cwd?: string
): Promise<GitWorktree[]> {
  const result = await git<any[]>('worktreeList', cwd);
  return (result ?? []).map((raw) => ({
    path: raw.path ?? '',
    head: raw.head ?? '',
    branch: raw.branch ?? null,
    isMain: raw.isMain ?? false,
    isBare: raw.isBare ?? false,
    isDetached: raw.isDetached ?? false,
    isLocked: raw.isLocked ?? false,
    lockReason: raw.lockReason,
    prunable: raw.prunable ?? false,
  }));
}

/** Move a worktree to a new location */
export async function moveWorktree(
  oldPath: string,
  newPath: string,
  cwd?: string
): Promise<void> {
  await git('worktreeMove', oldPath, newPath, cwd);
}

/** Lock a worktree to prevent pruning */
export async function lockWorktree(
  path: string,
  reason?: string,
  cwd?: string
): Promise<void> {
  await git('worktreeLock', path, reason, cwd);
}

/** Unlock a worktree */
export async function unlockWorktree(
  path: string,
  cwd?: string
): Promise<void> {
  await git('worktreeUnlock', path, cwd);
}

/** Prune stale worktree information */
export async function pruneWorktrees(cwd?: string): Promise<void> {
  await git('worktreePrune', cwd);
}

/* ══════════════════════════════════════════════════════════════
   11. BLAME
   ══════════════════════════════════════════════════════════════ */

/** Get line-by-line blame information for a file */
export async function blame(
  filePath: string,
  options?: {
    startLine?: number;
    endLine?: number;
    ref?: string;
    ignoreWhitespace?: boolean;
  },
  cwd?: string
): Promise<GitBlameEntry[]> {
  const result = await git<any[]>('blame', filePath, options, cwd);
  return (result ?? []).map(normalizeBlameEntry);
}

/** Normalize a raw blame entry */
function normalizeBlameEntry(raw: any): GitBlameEntry {
  const hash = raw.hash ?? '';
  return {
    hash,
    shortHash: raw.shortHash ?? hash.substring(0, 7),
    author: raw.author ?? '',
    authorEmail: raw.authorEmail ?? '',
    authorDate: raw.authorDate ?? '',
    authorTimestamp: raw.authorTimestamp ?? 0,
    committer: raw.committer ?? '',
    committerEmail: raw.committerEmail ?? '',
    committerDate: raw.committerDate ?? '',
    summary: raw.summary ?? '',
    line: raw.line ?? 0,
    originalLine: raw.originalLine ?? raw.line ?? 0,
    finalLine: raw.finalLine ?? raw.line ?? 0,
    content: raw.content ?? '',
    isUncommitted: hash === '0000000000000000000000000000000000000000' ||
                   hash.startsWith('0000000'),
    filename: raw.filename ?? '',
  };
}

/** Get blame for a specific line range */
export async function blameRange(
  filePath: string,
  startLine: number,
  endLine: number,
  cwd?: string
): Promise<GitBlameEntry[]> {
  return blame(filePath, { startLine, endLine }, cwd);
}

/* ══════════════════════════════════════════════════════════════
   12. CONFLICT DETECTION
   ══════════════════════════════════════════════════════════════ */

/** Detect all files with merge conflicts */
export async function detectConflicts(
  cwd?: string
): Promise<GitConflict[]> {
  const result = await git<any[]>('detectConflicts', cwd);
  return (result ?? []).map((raw) => ({
    file: raw.file ?? '',
    oursLabel: raw.oursLabel ?? 'HEAD',
    theirsLabel: raw.theirsLabel ?? 'incoming',
    baseLabel: raw.baseLabel ?? 'base',
    markers: (raw.markers ?? []).map(normalizeConflictMarker),
    hasResolved: raw.hasResolved ?? false,
  }));
}

/** Normalize a conflict marker */
function normalizeConflictMarker(raw: any): GitConflictMarker {
  return {
    startLine: raw.startLine ?? 0,
    separatorLine: raw.separatorLine ?? 0,
    endLine: raw.endLine ?? 0,
    oursContent: raw.oursContent ?? '',
    theirsContent: raw.theirsContent ?? '',
    baseContent: raw.baseContent,
  };
}

/** Get raw conflict markers from a file */
export async function getConflictMarkers(
  filePath: string,
  cwd?: string
): Promise<GitConflictMarker[]> {
  const result = await git<any[]>('conflictMarkers', filePath, cwd);
  return (result ?? []).map(normalizeConflictMarker);
}

/**
 * Parse a file's content to extract conflict sections.
 * This is a client-side parser that does not require IPC.
 */
export function parseConflictFile(
  content: string,
  filePath: string
): GitConflictFile {
  const lines = content.split('\n');
  const sections: GitConflictSection[] = [];
  let conflictIndex = 0;

  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      const startLine = i + 1;
      const oursLines: string[] = [];
      const theirsLines: string[] = [];
      const baseLines: string[] = [];
      let hasBase = false;
      let separatorFound = false;
      let baseStarted = false;

      i++;
      // Collect "ours" content
      while (i < lines.length && !lines[i].startsWith('=======') && !lines[i].startsWith('|||||||')) {
        if (lines[i].startsWith('|||||||')) {
          hasBase = true;
          baseStarted = true;
          i++;
          break;
        }
        oursLines.push(lines[i]);
        i++;
      }

      // Collect "base" content if diff3 style
      if (baseStarted) {
        while (i < lines.length && !lines[i].startsWith('=======')) {
          baseLines.push(lines[i]);
          i++;
        }
      }

      // Skip separator
      if (i < lines.length && lines[i].startsWith('=======')) {
        separatorFound = true;
        i++;
      }

      // Collect "theirs" content
      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
        theirsLines.push(lines[i]);
        i++;
      }

      const endLine = i + 1;

      if (separatorFound) {
        sections.push({
          index: conflictIndex++,
          ours: oursLines.join('\n'),
          theirs: theirsLines.join('\n'),
          base: hasBase ? baseLines.join('\n') : null,
          startLine,
          endLine,
        });
      }
    }
    i++;
  }

  return {
    path: filePath,
    sections,
    totalConflicts: sections.length,
  };
}

/** Mark a file as resolved */
export async function markResolved(
  filePath: string,
  cwd?: string
): Promise<void> {
  await git('markResolved', filePath, cwd);
}

/** Mark a file as unresolved */
export async function markUnresolved(
  filePath: string,
  cwd?: string
): Promise<void> {
  await git('markUnresolved', filePath, cwd);
}

/* ══════════════════════════════════════════════════════════════
   13. GIT CONFIG
   ══════════════════════════════════════════════════════════════ */

/** Get a git configuration value */
export async function getConfig(
  key: string,
  scope?: 'local' | 'global' | 'system',
  cwd?: string
): Promise<string | null> {
  try {
    const result = await git<string>('configGet', key, scope, cwd);
    return result ?? null;
  } catch {
    return null;
  }
}

/** Set a git configuration value */
export async function setConfig(
  key: string,
  value: string,
  scope?: 'local' | 'global',
  cwd?: string
): Promise<void> {
  await git('configSet', key, value, scope ?? 'local', cwd);
}

/** Unset a git configuration value */
export async function unsetConfig(
  key: string,
  scope?: 'local' | 'global',
  cwd?: string
): Promise<void> {
  await git('configUnset', key, scope ?? 'local', cwd);
}

/** Get the configured user name */
export async function getUserName(cwd?: string): Promise<string | null> {
  return getConfig('user.name', undefined, cwd);
}

/** Get the configured user email */
export async function getUserEmail(cwd?: string): Promise<string | null> {
  return getConfig('user.email', undefined, cwd);
}

/** Set the user name */
export async function setUserName(
  name: string,
  global?: boolean,
  cwd?: string
): Promise<void> {
  await setConfig('user.name', name, global ? 'global' : 'local', cwd);
}

/** Set the user email */
export async function setUserEmail(
  email: string,
  global?: boolean,
  cwd?: string
): Promise<void> {
  await setConfig('user.email', email, global ? 'global' : 'local', cwd);
}

/** List all configuration entries */
export async function listConfig(
  scope?: 'local' | 'global' | 'system',
  cwd?: string
): Promise<GitConfigEntry[]> {
  const result = await git<any[]>('configList', scope, cwd);
  return (result ?? []).map((raw) => ({
    key: raw.key ?? '',
    value: raw.value ?? '',
    scope: raw.scope ?? 'local',
    origin: raw.origin ?? '',
  }));
}

/* ══════════════════════════════════════════════════════════════
   14. DIFF PARSING
   ══════════════════════════════════════════════════════════════ */

/**
 * Parse a raw unified diff string into structured GitDiff.
 * This is a client-side parser that does not require IPC.
 */
export function parseDiff(rawDiff: string): GitDiff {
  const files: GitFileDiff[] = [];
  const diffBlocks = rawDiff.split(/^diff --git /m).filter(Boolean);

  for (const block of diffBlocks) {
    const fileDiff = parseSingleFileDiff(block);
    if (fileDiff) {
      files.push(fileDiff);
    }
  }

  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const file of files) {
    totalAdditions += file.additions;
    totalDeletions += file.deletions;
  }

  return {
    files,
    totalAdditions,
    totalDeletions,
    totalFiles: files.length,
  };
}

/** Parse a single file diff block */
function parseSingleFileDiff(block: string): GitFileDiff | null {
  const lines = block.split('\n');
  if (lines.length === 0) return null;

  // Parse header: "a/path b/path"
  const headerMatch = lines[0].match(/^a\/(.+?)\s+b\/(.+?)$/);
  const oldPath = headerMatch ? headerMatch[1] : '';
  const newPath = headerMatch ? headerMatch[2] : oldPath;

  // Detect status
  let status: GitFileStatus = 'modified';
  let isBinary = false;
  let oldMode: string | undefined;
  let newMode: string | undefined;

  for (const line of lines.slice(0, 10)) {
    if (line.startsWith('new file mode')) {
      status = 'added';
      newMode = line.replace('new file mode ', '').trim();
    } else if (line.startsWith('deleted file mode')) {
      status = 'deleted';
      oldMode = line.replace('deleted file mode ', '').trim();
    } else if (line.startsWith('rename from')) {
      status = 'renamed';
    } else if (line.startsWith('copy from')) {
      status = 'copied';
    } else if (line.startsWith('old mode')) {
      oldMode = line.replace('old mode ', '').trim();
    } else if (line.startsWith('new mode')) {
      newMode = line.replace('new mode ', '').trim();
    } else if (line.includes('Binary files')) {
      isBinary = true;
    }
  }

  // Parse hunks
  const hunks = parseHunks(lines);

  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const hunkLine of hunk.lines) {
      if (hunkLine.type === 'add') additions++;
      if (hunkLine.type === 'delete') deletions++;
    }
  }

  return {
    oldPath,
    newPath,
    status,
    isBinary,
    hunks,
    additions,
    deletions,
    oldMode,
    newMode,
  };
}

/**
 * Parse hunk sections from diff lines.
 * Exported for use in partial-staging UIs.
 */
export function parseHunks(lines: string[]): GitHunk[] {
  const hunks: GitHunk[] = [];
  let currentHunk: GitHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const hunkMatch = line.match(
      /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/
    );

    if (hunkMatch) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[3], 10);
      currentHunk = {
        oldStart: oldLine,
        oldLines: parseInt(hunkMatch[2] ?? '1', 10),
        newStart: newLine,
        newLines: parseInt(hunkMatch[4] ?? '1', 10),
        header: line,
        lines: [],
      };
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'add',
        content: line.substring(1),
        oldLineNumber: null,
        newLineNumber: newLine++,
      });
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'delete',
        content: line.substring(1),
        oldLineNumber: oldLine++,
        newLineNumber: null,
      });
    } else if (line.startsWith(' ') || line === '') {
      currentHunk.lines.push({
        type: 'context',
        content: line.startsWith(' ') ? line.substring(1) : line,
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      });
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}

/** Get diff statistics without full content */
export async function getDiffStats(
  options?: { staged?: boolean; ref1?: string; ref2?: string },
  cwd?: string
): Promise<GitDiffStat[]> {
  const result = await git<any[]>('diffStats', options, cwd);
  return (result ?? []).map((raw) => ({
    file: raw.file ?? '',
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    binary: raw.binary ?? false,
  }));
}

/** Parse a raw --stat output into DiffStat entries */
export function parseDiffStatOutput(statOutput: string): GitDiffStat[] {
  const stats: GitDiffStat[] = [];
  const lines = statOutput.split('\n');

  for (const line of lines) {
    // Match lines like: " src/file.ts | 42 ++++----"
    const match = line.match(
      /^\s*(.+?)\s+\|\s+(\d+)\s+(\+*)(-*)$/
    );
    if (match) {
      const file = match[1].trim();
      const additions = match[3].length;
      const deletions = match[4].length;
      stats.push({ file, additions, deletions, binary: false });
      continue;
    }

    // Match binary lines like: " src/image.png | Bin 0 -> 1234 bytes"
    const binMatch = line.match(/^\s*(.+?)\s+\|\s+Bin/);
    if (binMatch) {
      stats.push({
        file: binMatch[1].trim(),
        additions: 0,
        deletions: 0,
        binary: true,
      });
    }
  }

  return stats;
}

/* ══════════════════════════════════════════════════════════════
   UTILITY HELPERS
   ══════════════════════════════════════════════════════════════ */

/** Check if a path is inside a Git repository */
export async function isGitRepository(path: string): Promise<boolean> {
  try {
    await git('isRepo', path);
    return true;
  } catch {
    return false;
  }
}

/** Get the root directory of the Git repository */
export async function getRepositoryRoot(cwd?: string): Promise<string | null> {
  try {
    return await git<string>('repoRoot', cwd);
  } catch {
    return null;
  }
}

/** Get the current HEAD ref (branch name or commit hash) */
export async function getHead(cwd?: string): Promise<string | null> {
  try {
    return await git<string>('head', cwd);
  } catch {
    return null;
  }
}

/** Get a short summary of the working tree */
export async function getShortStatus(
  cwd?: string
): Promise<{ staged: number; unstaged: number; untracked: number; conflicted: number }> {
  try {
    const status = await getStatus(cwd);
    return {
      staged: status.staged.length,
      unstaged: status.unstaged.length,
      untracked: status.untracked.length,
      conflicted: status.conflicted.length,
    };
  } catch {
    return { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 };
  }
}

/** Clean untracked files from the working tree */
export async function clean(
  options?: { dryRun?: boolean; force?: boolean; directories?: boolean; ignored?: boolean },
  cwd?: string
): Promise<string[]> {
  return git<string[]>('clean', options, cwd);
}

/** Show the content of a file at a specific ref */
export async function showFile(
  ref: string,
  filePath: string,
  cwd?: string
): Promise<string> {
  return git<string>('showFile', ref, filePath, cwd);
}

/** Get the abbreviated ref name for a given hash */
export async function getRefName(
  hash: string,
  cwd?: string
): Promise<string | null> {
  try {
    return await git<string>('refName', hash, cwd);
  } catch {
    return null;
  }
}

/** Get the number of commits between two refs */
export async function getCommitCount(
  from: string,
  to: string,
  cwd?: string
): Promise<number> {
  try {
    const result = await git<number>('commitCount', from, to, cwd);
    return result ?? 0;
  } catch {
    return 0;
  }
}

/** Search commit messages with grep */
export async function searchCommits(
  query: string,
  options?: { maxCount?: number; all?: boolean; regexp?: boolean },
  cwd?: string
): Promise<GitCommit[]> {
  const result = await git<any[]>('searchCommits', query, options, cwd);
  return (result ?? []).map(normalizeCommit);
}

/** Get the merge base between two refs */
export async function getMergeBase(
  ref1: string,
  ref2: string,
  cwd?: string
): Promise<string | null> {
  try {
    return await git<string>('mergeBase', ref1, ref2, cwd);
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════
   DISPLAY FORMATTERS
   ══════════════════════════════════════════════════════════════ */

/** Format a commit date as a human-readable relative string */
export function formatCommitDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffDay / 365);

    if (diffSec < 30) return 'just now';
    if (diffMin < 1) return `${diffSec}s ago`;
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    if (diffWeek < 5) return `${diffWeek}w ago`;
    if (diffMonth < 12) return `${diffMonth}mo ago`;
    return `${diffYear}y ago`;
  } catch {
    return dateStr;
  }
}

/** Get a single-character icon for a file status */
export function getStatusIcon(status: GitFileStatus): string {
  const icons: Record<GitFileStatus, string> = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    copied: 'C',
    unmerged: 'U',
    untracked: '?',
    ignored: '!',
  };
  return icons[status] ?? '?';
}

/** Get the display color for a file status */
export function getStatusColor(status: GitFileStatus): string {
  const colors: Record<GitFileStatus, string> = {
    added: '#2ea043',
    modified: '#d29922',
    deleted: '#f85149',
    renamed: '#58a6ff',
    copied: '#58a6ff',
    unmerged: '#f85149',
    untracked: '#8b949e',
    ignored: '#484f58',
  };
  return colors[status] ?? '#8b949e';
}

/** Get a human-readable label for a file status */
export function getStatusLabel(status: GitFileStatus): string {
  const labels: Record<GitFileStatus, string> = {
    added: 'Added',
    modified: 'Modified',
    deleted: 'Deleted',
    renamed: 'Renamed',
    copied: 'Copied',
    unmerged: 'Conflict',
    untracked: 'Untracked',
    ignored: 'Ignored',
  };
  return labels[status] ?? 'Unknown';
}

/** Format a file path for display, truncating long paths */
export function formatFilePath(
  filePath: string,
  maxLength: number = 60
): string {
  if (filePath.length <= maxLength) return filePath;

  const parts = filePath.split('/');
  if (parts.length <= 2) return filePath;

  // Keep first and last segments, abbreviate middle
  const first = parts[0];
  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2];

  const abbreviated = `${first}/.../${secondLast}/${last}`;
  if (abbreviated.length <= maxLength) return abbreviated;

  return `.../${secondLast}/${last}`;
}

/** Format diff statistics as a summary string */
export function formatDiffStats(additions: number, deletions: number): string {
  const parts: string[] = [];
  if (additions > 0) parts.push(`+${additions}`);
  if (deletions > 0) parts.push(`-${deletions}`);
  return parts.join(' ') || 'no changes';
}

/** Generate a compact commit graph character for log display */
export function getGraphChar(
  isHead: boolean,
  isMerge: boolean,
  hasMultipleParents: boolean
): string {
  if (isHead) return '*';
  if (isMerge || hasMultipleParents) return 'M';
  return 'o';
}

/** Format branch name for display, stripping remote prefix */
export function formatBranchName(fullName: string): string {
  if (fullName.startsWith('refs/heads/')) {
    return fullName.replace('refs/heads/', '');
  }
  if (fullName.startsWith('refs/remotes/')) {
    return fullName.replace('refs/remotes/', '');
  }
  return fullName;
}

/** Build a human-readable ahead/behind summary */
export function formatAheadBehind(ahead: number, behind: number): string {
  if (ahead === 0 && behind === 0) return 'up to date';
  const parts: string[] = [];
  if (ahead > 0) parts.push(`${ahead} ahead`);
  if (behind > 0) parts.push(`${behind} behind`);
  return parts.join(', ');
}
