/**
 * Language Server Protocol (LSP) client implementation.
 * Manages connections to language servers, handles request/response
 * lifecycle, and provides typed APIs for common LSP operations.
 */

/* ── Types ─────────────────────────────────────────────── */

export type LSPMessageType = 'request' | 'response' | 'notification'

export interface LSPMessage {
  jsonrpc: '2.0'
  id?: number | string
  method?: string
  params?: any
  result?: any
  error?: LSPError
}

export interface LSPError {
  code: number
  message: string
  data?: any
}

export interface Position {
  line: number
  character: number
}

export interface Range {
  start: Position
  end: Position
}

export interface Location {
  uri: string
  range: Range
}

export interface TextDocumentIdentifier {
  uri: string
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number
}

export interface TextDocumentItem {
  uri: string
  languageId: string
  version: number
  text: string
}

export interface TextEdit {
  range: Range
  newText: string
}

export interface TextDocumentContentChangeEvent {
  range?: Range
  rangeLength?: number
  text: string
}

export interface Diagnostic {
  range: Range
  severity?: DiagnosticSeverity
  code?: number | string
  codeDescription?: { href: string }
  source?: string
  message: string
  tags?: DiagnosticTag[]
  relatedInformation?: DiagnosticRelatedInformation[]
}

export type DiagnosticSeverity = 1 | 2 | 3 | 4 // Error, Warning, Information, Hint
export type DiagnosticTag = 1 | 2 // Unnecessary, Deprecated

export interface DiagnosticRelatedInformation {
  location: Location
  message: string
}

export interface CompletionItem {
  label: string
  kind?: CompletionItemKind
  detail?: string
  documentation?: string | MarkupContent
  deprecated?: boolean
  preselect?: boolean
  sortText?: string
  filterText?: string
  insertText?: string
  insertTextFormat?: 1 | 2 // PlainText, Snippet
  textEdit?: TextEdit
  additionalTextEdits?: TextEdit[]
  commitCharacters?: string[]
  data?: any
}

export type CompletionItemKind =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20
  | 21 | 22 | 23 | 24 | 25

export interface MarkupContent {
  kind: 'plaintext' | 'markdown'
  value: string
}

export interface Hover {
  contents: MarkupContent | string | { language: string; value: string }[]
  range?: Range
}

export interface SignatureHelp {
  signatures: SignatureInformation[]
  activeSignature?: number
  activeParameter?: number
}

export interface SignatureInformation {
  label: string
  documentation?: string | MarkupContent
  parameters?: ParameterInformation[]
}

export interface ParameterInformation {
  label: string | [number, number]
  documentation?: string | MarkupContent
}

export interface DocumentSymbol {
  name: string
  detail?: string
  kind: SymbolKind
  range: Range
  selectionRange: Range
  children?: DocumentSymbol[]
}

export type SymbolKind =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20
  | 21 | 22 | 23 | 24 | 25 | 26

export interface CodeAction {
  title: string
  kind?: string
  diagnostics?: Diagnostic[]
  isPreferred?: boolean
  edit?: WorkspaceEdit
  command?: LSPCommand
}

export interface LSPCommand {
  title: string
  command: string
  arguments?: any[]
}

export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>
  documentChanges?: (TextDocumentEdit | CreateFile | RenameFile | DeleteFile)[]
}

export interface TextDocumentEdit {
  textDocument: VersionedTextDocumentIdentifier
  edits: TextEdit[]
}

interface CreateFile { kind: 'create'; uri: string; options?: { overwrite?: boolean; ignoreIfExists?: boolean } }
interface RenameFile { kind: 'rename'; oldUri: string; newUri: string; options?: { overwrite?: boolean; ignoreIfExists?: boolean } }
interface DeleteFile { kind: 'delete'; uri: string; options?: { recursive?: boolean; ignoreIfNotExists?: boolean } }

export interface FormattingOptions {
  tabSize: number
  insertSpaces: boolean
  trimTrailingWhitespace?: boolean
  insertFinalNewline?: boolean
  trimFinalNewlines?: boolean
}

export interface RenameParams {
  textDocument: TextDocumentIdentifier
  position: Position
  newName: string
}

export interface FoldingRange {
  startLine: number
  startCharacter?: number
  endLine: number
  endCharacter?: number
  kind?: 'comment' | 'imports' | 'region'
}

export interface SelectionRange {
  range: Range
  parent?: SelectionRange
}

export interface InlayHint {
  position: Position
  label: string | InlayHintLabelPart[]
  kind?: 1 | 2 // Type, Parameter
  paddingLeft?: boolean
  paddingRight?: boolean
  tooltip?: string | MarkupContent
}

interface InlayHintLabelPart {
  value: string
  tooltip?: string | MarkupContent
  location?: Location
  command?: LSPCommand
}

export interface SemanticTokens {
  resultId?: string
  data: number[]
}

/* ── Server Capabilities ──────────────────────────────── */

export interface ServerCapabilities {
  textDocumentSync?: number | { openClose?: boolean; change?: number; save?: { includeText?: boolean } }
  completionProvider?: { triggerCharacters?: string[]; resolveProvider?: boolean }
  hoverProvider?: boolean
  signatureHelpProvider?: { triggerCharacters?: string[]; retriggerCharacters?: string[] }
  definitionProvider?: boolean
  typeDefinitionProvider?: boolean
  implementationProvider?: boolean
  referencesProvider?: boolean
  documentHighlightProvider?: boolean
  documentSymbolProvider?: boolean
  codeActionProvider?: boolean | { codeActionKinds?: string[]; resolveProvider?: boolean }
  codeLensProvider?: { resolveProvider?: boolean }
  documentFormattingProvider?: boolean
  documentRangeFormattingProvider?: boolean
  renameProvider?: boolean | { prepareProvider?: boolean }
  foldingRangeProvider?: boolean
  selectionRangeProvider?: boolean
  inlayHintProvider?: boolean
  semanticTokensProvider?: any
  workspaceSymbolProvider?: boolean
  diagnosticProvider?: { interFileDependencies?: boolean; workspaceDiagnostics?: boolean }
}

/* ── LSP Client ───────────────────────────────────────── */

export type LSPEventHandler = (method: string, params: any) => void

interface PendingRequest {
  resolve: (value: any) => void
  reject: (reason: any) => void
  method: string
  timestamp: number
  timeout: ReturnType<typeof setTimeout>
}

export class LSPClient {
  private nextId = 1
  private pendingRequests: Map<number, PendingRequest> = new Map()
  private eventHandlers: Map<string, LSPEventHandler[]> = new Map()
  private capabilities: ServerCapabilities | null = null
  private initialized = false
  private serverName = ''
  private serverVersion = ''
  private openDocuments: Map<string, { version: number; languageId: string }> = new Map()
  private requestTimeout = 30000

  constructor(
    private serverId: string,
    private send: (message: LSPMessage) => void,
  ) {}

  /* ── Lifecycle ────────────────────────── */

  async initialize(
    rootUri: string,
    capabilities: any = {},
    workspaceFolders?: { uri: string; name: string }[]
  ): Promise<ServerCapabilities> {
    const result = await this.request('initialize', {
      processId: null,
      rootUri,
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: true, willSave: true, willSaveWaitUntil: true, didSave: true },
          completion: {
            dynamicRegistration: true,
            completionItem: {
              snippetSupport: true,
              commitCharactersSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              deprecatedSupport: true,
              preselectSupport: true,
              labelDetailsSupport: true,
              insertReplaceSupport: true,
              resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] },
            },
            contextSupport: true,
          },
          hover: { dynamicRegistration: true, contentFormat: ['markdown', 'plaintext'] },
          signatureHelp: {
            dynamicRegistration: true,
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
              parameterInformation: { labelOffsetSupport: true },
            },
          },
          definition: { dynamicRegistration: true, linkSupport: true },
          typeDefinition: { dynamicRegistration: true, linkSupport: true },
          implementation: { dynamicRegistration: true, linkSupport: true },
          references: { dynamicRegistration: true },
          documentHighlight: { dynamicRegistration: true },
          documentSymbol: {
            dynamicRegistration: true,
            hierarchicalDocumentSymbolSupport: true,
            symbolKind: { valueSet: Array.from({ length: 26 }, (_, i) => i + 1) },
          },
          codeAction: {
            dynamicRegistration: true,
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: ['quickfix', 'refactor', 'refactor.extract', 'refactor.inline', 'refactor.rewrite', 'source', 'source.organizeImports', 'source.fixAll'],
              },
            },
            isPreferredSupport: true,
            resolveSupport: { properties: ['edit'] },
          },
          formatting: { dynamicRegistration: true },
          rangeFormatting: { dynamicRegistration: true },
          rename: { dynamicRegistration: true, prepareSupport: true },
          foldingRange: { dynamicRegistration: true },
          selectionRange: { dynamicRegistration: true },
          publishDiagnostics: { relatedInformation: true, tagSupport: { valueSet: [1, 2] }, codeDescriptionSupport: true },
          inlayHint: { dynamicRegistration: true },
          semanticTokens: {
            dynamicRegistration: true,
            tokenTypes: [
              'namespace', 'type', 'class', 'enum', 'interface', 'struct',
              'typeParameter', 'parameter', 'variable', 'property', 'enumMember',
              'event', 'function', 'method', 'macro', 'keyword', 'modifier',
              'comment', 'string', 'number', 'regexp', 'operator', 'decorator',
            ],
            tokenModifiers: [
              'declaration', 'definition', 'readonly', 'static', 'deprecated',
              'abstract', 'async', 'modification', 'documentation', 'defaultLibrary',
            ],
            formats: ['relative'],
            requests: { full: { delta: true }, range: true },
            multilineTokenSupport: false,
            overlappingTokenSupport: false,
          },
        },
        workspace: {
          workspaceFolders: true,
          configuration: true,
          didChangeConfiguration: { dynamicRegistration: true },
          symbol: { dynamicRegistration: true },
          applyEdit: true,
        },
        ...capabilities,
      },
      workspaceFolders: workspaceFolders || [{ uri: rootUri, name: rootUri.split('/').pop() || 'workspace' }],
    })

    this.capabilities = result.capabilities
    this.serverName = result.serverInfo?.name || ''
    this.serverVersion = result.serverInfo?.version || ''
    this.initialized = true

    // Send initialized notification
    this.notify('initialized', {})

    return result.capabilities
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return
    await this.request('shutdown', null)
    this.notify('exit', null)
    this.initialized = false
    this.pendingRequests.forEach(p => {
      clearTimeout(p.timeout)
      p.reject(new Error('Server shutting down'))
    })
    this.pendingRequests.clear()
    this.openDocuments.clear()
  }

  /* ── Document Sync ────────────────────── */

  didOpen(uri: string, languageId: string, version: number, text: string): void {
    this.openDocuments.set(uri, { version, languageId })
    this.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version, text },
    })
  }

  didChange(uri: string, version: number, changes: TextDocumentContentChangeEvent[]): void {
    const doc = this.openDocuments.get(uri)
    if (doc) doc.version = version
    this.notify('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: changes,
    })
  }

  didSave(uri: string, text?: string): void {
    this.notify('textDocument/didSave', {
      textDocument: { uri },
      ...(text !== undefined ? { text } : {}),
    })
  }

  didClose(uri: string): void {
    this.openDocuments.delete(uri)
    this.notify('textDocument/didClose', {
      textDocument: { uri },
    })
  }

  /* ── Completion ───────────────────────── */

  async completion(uri: string, position: Position, context?: { triggerKind: number; triggerCharacter?: string }): Promise<CompletionItem[]> {
    if (!this.capabilities?.completionProvider) return []
    const result = await this.request('textDocument/completion', {
      textDocument: { uri },
      position,
      context: context || { triggerKind: 1 },
    })
    return Array.isArray(result) ? result : result?.items || []
  }

  async completionResolve(item: CompletionItem): Promise<CompletionItem> {
    if (!this.capabilities?.completionProvider) return item
    return this.request('completionItem/resolve', item)
  }

  /* ── Hover ────────────────────────────── */

  async hover(uri: string, position: Position): Promise<Hover | null> {
    if (!this.capabilities?.hoverProvider) return null
    return this.request('textDocument/hover', {
      textDocument: { uri },
      position,
    })
  }

  /* ── Signature Help ───────────────────── */

  async signatureHelp(uri: string, position: Position, context?: any): Promise<SignatureHelp | null> {
    if (!this.capabilities?.signatureHelpProvider) return null
    return this.request('textDocument/signatureHelp', {
      textDocument: { uri },
      position,
      context,
    })
  }

  /* ── Go To ────────────────────────────── */

  async definition(uri: string, position: Position): Promise<Location | Location[] | null> {
    if (!this.capabilities?.definitionProvider) return null
    return this.request('textDocument/definition', {
      textDocument: { uri },
      position,
    })
  }

  async typeDefinition(uri: string, position: Position): Promise<Location | Location[] | null> {
    if (!this.capabilities?.typeDefinitionProvider) return null
    return this.request('textDocument/typeDefinition', {
      textDocument: { uri },
      position,
    })
  }

  async implementation(uri: string, position: Position): Promise<Location | Location[] | null> {
    if (!this.capabilities?.implementationProvider) return null
    return this.request('textDocument/implementation', {
      textDocument: { uri },
      position,
    })
  }

  async references(uri: string, position: Position, includeDeclaration = true): Promise<Location[]> {
    if (!this.capabilities?.referencesProvider) return []
    return this.request('textDocument/references', {
      textDocument: { uri },
      position,
      context: { includeDeclaration },
    }) || []
  }

  /* ── Symbols ──────────────────────────── */

  async documentSymbols(uri: string): Promise<DocumentSymbol[]> {
    if (!this.capabilities?.documentSymbolProvider) return []
    return this.request('textDocument/documentSymbol', {
      textDocument: { uri },
    }) || []
  }

  async workspaceSymbol(query: string): Promise<any[]> {
    if (!this.capabilities?.workspaceSymbolProvider) return []
    return this.request('workspace/symbol', { query }) || []
  }

  /* ── Code Actions ─────────────────────── */

  async codeAction(uri: string, range: Range, diagnostics: Diagnostic[], only?: string[]): Promise<CodeAction[]> {
    if (!this.capabilities?.codeActionProvider) return []
    return this.request('textDocument/codeAction', {
      textDocument: { uri },
      range,
      context: { diagnostics, only },
    }) || []
  }

  /* ── Formatting ───────────────────────── */

  async formatting(uri: string, options: FormattingOptions): Promise<TextEdit[]> {
    if (!this.capabilities?.documentFormattingProvider) return []
    return this.request('textDocument/formatting', {
      textDocument: { uri },
      options,
    }) || []
  }

  async rangeFormatting(uri: string, range: Range, options: FormattingOptions): Promise<TextEdit[]> {
    if (!this.capabilities?.documentRangeFormattingProvider) return []
    return this.request('textDocument/rangeFormatting', {
      textDocument: { uri },
      range,
      options,
    }) || []
  }

  /* ── Rename ───────────────────────────── */

  async prepareRename(uri: string, position: Position): Promise<Range | null> {
    if (!this.capabilities?.renameProvider) return null
    try {
      const result = await this.request('textDocument/prepareRename', {
        textDocument: { uri },
        position,
      })
      return result?.range || result
    } catch {
      return null
    }
  }

  async rename(uri: string, position: Position, newName: string): Promise<WorkspaceEdit | null> {
    if (!this.capabilities?.renameProvider) return null
    return this.request('textDocument/rename', {
      textDocument: { uri },
      position,
      newName,
    })
  }

  /* ── Folding Ranges ───────────────────── */

  async foldingRanges(uri: string): Promise<FoldingRange[]> {
    if (!this.capabilities?.foldingRangeProvider) return []
    return this.request('textDocument/foldingRange', {
      textDocument: { uri },
    }) || []
  }

  /* ── Selection Ranges ─────────────────── */

  async selectionRanges(uri: string, positions: Position[]): Promise<SelectionRange[]> {
    if (!this.capabilities?.selectionRangeProvider) return []
    return this.request('textDocument/selectionRange', {
      textDocument: { uri },
      positions,
    }) || []
  }

  /* ── Inlay Hints ──────────────────────── */

  async inlayHints(uri: string, range: Range): Promise<InlayHint[]> {
    if (!this.capabilities?.inlayHintProvider) return []
    return this.request('textDocument/inlayHint', {
      textDocument: { uri },
      range,
    }) || []
  }

  /* ── Semantic Tokens ──────────────────── */

  async semanticTokensFull(uri: string): Promise<SemanticTokens | null> {
    if (!this.capabilities?.semanticTokensProvider) return null
    return this.request('textDocument/semanticTokens/full', {
      textDocument: { uri },
    })
  }

  async semanticTokensRange(uri: string, range: Range): Promise<SemanticTokens | null> {
    if (!this.capabilities?.semanticTokensProvider) return null
    return this.request('textDocument/semanticTokens/range', {
      textDocument: { uri },
      range,
    })
  }

  /* ── Event Handling ───────────────────── */

  on(method: string, handler: LSPEventHandler): () => void {
    if (!this.eventHandlers.has(method)) {
      this.eventHandlers.set(method, [])
    }
    this.eventHandlers.get(method)!.push(handler)
    return () => {
      const handlers = this.eventHandlers.get(method)
      if (handlers) {
        const idx = handlers.indexOf(handler)
        if (idx >= 0) handlers.splice(idx, 1)
      }
    }
  }

  onDiagnostics(handler: (uri: string, diagnostics: Diagnostic[]) => void): () => void {
    return this.on('textDocument/publishDiagnostics', (_method, params) => {
      handler(params.uri, params.diagnostics)
    })
  }

  /* ── Message Handling ─────────────────── */

  handleMessage(message: LSPMessage): void {
    // Response to a request
    if (message.id !== undefined && !message.method) {
      const pending = this.pendingRequests.get(message.id as number)
      if (pending) {
        clearTimeout(pending.timeout)
        this.pendingRequests.delete(message.id as number)
        if (message.error) {
          pending.reject(new Error(`LSP error [${message.error.code}]: ${message.error.message}`))
        } else {
          pending.resolve(message.result)
        }
      }
      return
    }

    // Server notification or request
    if (message.method) {
      const handlers = this.eventHandlers.get(message.method) || []
      for (const handler of handlers) {
        try {
          handler(message.method, message.params)
        } catch {
          // ignore handler errors
        }
      }

      // Handle server requests that need a response
      if (message.id !== undefined) {
        this.handleServerRequest(message)
      }
    }
  }

  private handleServerRequest(message: LSPMessage): void {
    const respond = (result: any) => {
      this.send({ jsonrpc: '2.0', id: message.id, result })
    }

    switch (message.method) {
      case 'window/showMessage':
      case 'window/logMessage':
        respond(null)
        break

      case 'workspace/configuration':
        // Return empty configs
        respond(message.params?.items?.map(() => ({})) || [])
        break

      case 'client/registerCapability':
        respond(null)
        break

      case 'workspace/applyEdit':
        // Accept workspace edits
        respond({ applied: true })
        break

      default:
        respond(null)
    }
  }

  /* ── Request / Notify ─────────────────── */

  private request(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`LSP request timeout: ${method}`))
      }, this.requestTimeout)

      this.pendingRequests.set(id, { resolve, reject, method, timestamp: Date.now(), timeout })
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  private notify(method: string, params: any): void {
    this.send({ jsonrpc: '2.0', method, params })
  }

  /* ── Getters ──────────────────────────── */

  get isInitialized(): boolean { return this.initialized }
  get serverCapabilities(): ServerCapabilities | null { return this.capabilities }
  get name(): string { return this.serverName }
  get version(): string { return this.serverVersion }
  get id(): string { return this.serverId }
  get openDocumentUris(): string[] { return [...this.openDocuments.keys()] }
  get pendingRequestCount(): number { return this.pendingRequests.size }
}

/* ── Server Registry ──────────────────────────────────── */

export interface LanguageServerConfig {
  id: string
  name: string
  languages: string[]
  command: string
  args?: string[]
  transport: 'stdio' | 'tcp' | 'pipe'
  port?: number
  initializationOptions?: any
  settings?: any
}

const BUILT_IN_SERVERS: LanguageServerConfig[] = [
  {
    id: 'typescript',
    name: 'TypeScript Language Server',
    languages: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
    command: 'typescript-language-server',
    args: ['--stdio'],
    transport: 'stdio',
    settings: {
      typescript: {
        inlayHints: {
          includeInlayParameterNameHints: 'all',
          includeInlayFunctionParameterTypeHints: true,
          includeInlayVariableTypeHints: true,
          includeInlayPropertyDeclarationTypeHints: true,
          includeInlayFunctionLikeReturnTypeHints: true,
          includeInlayEnumMemberValueHints: true,
        },
      },
    },
  },
  {
    id: 'python',
    name: 'Pylsp',
    languages: ['python'],
    command: 'pylsp',
    transport: 'stdio',
  },
  {
    id: 'rust',
    name: 'rust-analyzer',
    languages: ['rust'],
    command: 'rust-analyzer',
    transport: 'stdio',
    settings: {
      'rust-analyzer': {
        checkOnSave: { command: 'clippy' },
        inlayHints: {
          typeHints: { enable: true },
          parameterHints: { enable: true },
          chainingHints: { enable: true },
        },
      },
    },
  },
  {
    id: 'go',
    name: 'gopls',
    languages: ['go'],
    command: 'gopls',
    args: ['serve'],
    transport: 'stdio',
    settings: {
      gopls: {
        usePlaceholders: true,
        analyses: { unusedparams: true },
        hints: {
          assignVariableTypes: true,
          constantValues: true,
          parameterNames: true,
        },
      },
    },
  },
  {
    id: 'html',
    name: 'HTML Language Server',
    languages: ['html'],
    command: 'vscode-html-language-server',
    args: ['--stdio'],
    transport: 'stdio',
  },
  {
    id: 'css',
    name: 'CSS Language Server',
    languages: ['css', 'scss', 'less'],
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    transport: 'stdio',
  },
  {
    id: 'json',
    name: 'JSON Language Server',
    languages: ['json', 'jsonc'],
    command: 'vscode-json-language-server',
    args: ['--stdio'],
    transport: 'stdio',
  },
  {
    id: 'yaml',
    name: 'YAML Language Server',
    languages: ['yaml'],
    command: 'yaml-language-server',
    args: ['--stdio'],
    transport: 'stdio',
  },
  {
    id: 'lua',
    name: 'Lua Language Server',
    languages: ['lua'],
    command: 'lua-language-server',
    transport: 'stdio',
  },
  {
    id: 'clangd',
    name: 'clangd',
    languages: ['c', 'cpp', 'cuda', 'objc'],
    command: 'clangd',
    transport: 'stdio',
  },
]

class LanguageServerRegistry {
  private servers: Map<string, LanguageServerConfig> = new Map()
  private clients: Map<string, LSPClient> = new Map()

  constructor() {
    for (const server of BUILT_IN_SERVERS) {
      this.servers.set(server.id, server)
    }
  }

  register(config: LanguageServerConfig): void {
    this.servers.set(config.id, config)
  }

  unregister(id: string): void {
    this.servers.delete(id)
    const client = this.clients.get(id)
    if (client) {
      client.shutdown().catch(() => {})
      this.clients.delete(id)
    }
  }

  getServerForLanguage(languageId: string): LanguageServerConfig | undefined {
    for (const server of this.servers.values()) {
      if (server.languages.includes(languageId)) return server
    }
    return undefined
  }

  getClient(serverId: string): LSPClient | undefined {
    return this.clients.get(serverId)
  }

  setClient(serverId: string, client: LSPClient): void {
    this.clients.set(serverId, client)
  }

  getAllServers(): LanguageServerConfig[] {
    return [...this.servers.values()]
  }

  getActiveClients(): LSPClient[] {
    return [...this.clients.values()].filter(c => c.isInitialized)
  }

  async stopAll(): Promise<void> {
    const shutdowns = [...this.clients.values()].map(c => c.shutdown().catch(() => {}))
    await Promise.all(shutdowns)
    this.clients.clear()
  }
}

export const languageServerRegistry = new LanguageServerRegistry()

/* ── File URI Helpers ─────────────────────────────────── */

export function pathToUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.startsWith('/')) return `file://${normalized}`
  return `file:///${normalized}`
}

export function uriToPath(uri: string): string {
  if (!uri.startsWith('file://')) return uri
  let path = uri.slice(7)
  // Handle Windows paths: file:///C:/path → C:/path
  if (/^\/[a-zA-Z]:/.test(path)) path = path.slice(1)
  return path.replace(/\//g, '/')
}

/* ── Completion Kind Labels ───────────────────────────── */

export const COMPLETION_KIND_LABELS: Record<number, string> = {
  1: 'Text', 2: 'Method', 3: 'Function', 4: 'Constructor', 5: 'Field',
  6: 'Variable', 7: 'Class', 8: 'Interface', 9: 'Module', 10: 'Property',
  11: 'Unit', 12: 'Value', 13: 'Enum', 14: 'Keyword', 15: 'Snippet',
  16: 'Color', 17: 'File', 18: 'Reference', 19: 'Folder', 20: 'EnumMember',
  21: 'Constant', 22: 'Struct', 23: 'Event', 24: 'Operator', 25: 'TypeParameter',
}

export const SYMBOL_KIND_LABELS: Record<number, string> = {
  1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class',
  6: 'Method', 7: 'Property', 8: 'Field', 9: 'Constructor', 10: 'Enum',
  11: 'Interface', 12: 'Function', 13: 'Variable', 14: 'Constant', 15: 'String',
  16: 'Number', 17: 'Boolean', 18: 'Array', 19: 'Object', 20: 'Key',
  21: 'Null', 22: 'EnumMember', 23: 'Struct', 24: 'Event', 25: 'Operator', 26: 'TypeParameter',
}

export const DIAGNOSTIC_SEVERITY_LABELS: Record<number, string> = {
  1: 'Error', 2: 'Warning', 3: 'Information', 4: 'Hint',
}
