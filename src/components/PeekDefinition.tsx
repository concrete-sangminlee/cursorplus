import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  X,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Edit3,
  Columns,
  FileText,
  Copy,
  Pin,
  Maximize2,
  Code2,
  FileCode,
  Hash,
  Type,
  Braces,
  Search,
  ArrowRight,
} from 'lucide-react'

/* ══════════════════════════════════════════════════════════════
   Types & Interfaces
   ══════════════════════════════════════════════════════════════ */

/** Represents a single location result from Go to Definition / References */
export interface PeekLocation {
  /** Full file path to the definition/reference */
  filePath: string
  /** 1-based line number */
  line: number
  /** 1-based column number */
  column: number
  /** 1-based end line (optional, for range highlighting) */
  endLine?: number
  /** 1-based end column (optional) */
  endColumn?: number
  /** Preview text of the line content */
  preview?: string
  /** Full file content (for rendering in the embedded editor) */
  fileContent?: string
  /** Language id for syntax highlighting */
  languageId?: string
  /** Symbol name at this location */
  symbolName?: string
  /** Kind of symbol (function, class, interface, variable, etc.) */
  symbolKind?: SymbolKind
}

export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'property'
  | 'constructor'
  | 'module'
  | 'constant'
  | 'parameter'
  | 'field'
  | 'unknown'

export type PeekMode = 'definition' | 'references' | 'implementation' | 'typeDefinition'

export interface PeekWidgetProps {
  /** List of definition/reference locations to show */
  locations: PeekLocation[]
  /** Called when the peek widget is dismissed */
  onClose: () => void
  /** Called when the user navigates to a location */
  onNavigate?: (location: PeekLocation, mode: 'open' | 'side' | 'edit') => void
  /** Called when content is edited in the peek view */
  onEdit?: (location: PeekLocation, newContent: string) => void
  /** Called when F2 is pressed to rename from peek */
  onRename?: (location: PeekLocation) => void
  /** Title to display */
  title?: string
  /** Whether to allow editing in the peek view */
  allowEditing?: boolean
  /** Initial height of the peek widget */
  initialHeight?: number
  /** Whether to show the reference list sidebar */
  showReferenceList?: boolean
  /** The peek mode */
  mode?: PeekMode
  /** Whether the peek widget is pinned */
  pinned?: boolean
  /** Called when pin state toggles */
  onPinToggle?: () => void
  /** Accent color override for the header bar */
  accentColor?: string
  /** Icon to show in the header */
  headerIcon?: React.ReactNode
}

export interface PeekDefinitionProps extends Omit<PeekWidgetProps, 'mode' | 'headerIcon' | 'accentColor'> {
  mode?: 'definition' | 'references'
}

export interface PeekReferencesProps extends Omit<PeekWidgetProps, 'mode' | 'headerIcon' | 'accentColor'> {}

export interface PeekImplementationProps extends Omit<PeekWidgetProps, 'mode' | 'headerIcon' | 'accentColor'> {}

export interface PeekTypeDefinitionProps extends Omit<PeekWidgetProps, 'mode' | 'headerIcon' | 'accentColor'> {}

/* ══════════════════════════════════════════════════════════════
   Constants
   ══════════════════════════════════════════════════════════════ */

const MIN_PEEK_HEIGHT = 120
const MAX_PEEK_HEIGHT = 600
const DEFAULT_PEEK_HEIGHT = 280
const REFERENCE_LIST_WIDTH = 280
const HEADER_HEIGHT = 30
const RESIZE_HANDLE_HEIGHT = 5
const CONTEXT_LINES_ABOVE = 8
const CONTEXT_LINES_BELOW = 15
const LINE_HEIGHT = 19
const FONT_SIZE = 13

const MODE_LABELS: Record<PeekMode, { singular: string; plural: string }> = {
  definition: { singular: 'definition', plural: 'definitions' },
  references: { singular: 'reference', plural: 'references' },
  implementation: { singular: 'implementation', plural: 'implementations' },
  typeDefinition: { singular: 'type definition', plural: 'type definitions' },
}

const MODE_ACCENTS: Record<PeekMode, string> = {
  definition: '#1b80b2',
  references: '#cc6633',
  implementation: '#6a9955',
  typeDefinition: '#b267e6',
}

const SYMBOL_ICONS: Record<SymbolKind, React.ReactNode> = {
  function: <Code2 size={12} />,
  method: <Code2 size={12} />,
  class: <Braces size={12} />,
  interface: <FileCode size={12} />,
  type: <Type size={12} />,
  enum: <Hash size={12} />,
  variable: <FileText size={12} />,
  property: <FileText size={12} />,
  constructor: <Code2 size={12} />,
  module: <FileCode size={12} />,
  constant: <Hash size={12} />,
  parameter: <FileText size={12} />,
  field: <FileText size={12} />,
  unknown: <FileText size={12} />,
}

/* ══════════════════════════════════════════════════════════════
   Mock Data - Realistic TypeScript code across multiple files
   ══════════════════════════════════════════════════════════════ */

const MOCK_FILE_CONTENTS: Record<string, string> = {
  'src/services/UserService.ts': `import { Database } from '../database/Database';
import { User, UserCreateInput, UserUpdateInput } from '../models/User';
import { CacheManager } from '../cache/CacheManager';
import { Logger } from '../utils/Logger';
import { EventEmitter } from '../events/EventEmitter';

/**
 * Service responsible for user management operations.
 * Handles CRUD operations, caching, and event emission.
 */
export class UserService {
  private db: Database;
  private cache: CacheManager;
  private logger: Logger;
  private events: EventEmitter;

  constructor(
    db: Database,
    cache: CacheManager,
    logger: Logger,
    events: EventEmitter
  ) {
    this.db = db;
    this.cache = cache;
    this.logger = logger;
    this.events = events;
  }

  /**
   * Retrieves a user by their unique identifier.
   * Results are cached for subsequent lookups.
   */
  async getUserById(id: string): Promise<User | null> {
    const cacheKey = \`user:\${id}\`;
    const cached = await this.cache.get<User>(cacheKey);
    if (cached) {
      this.logger.debug('User cache hit', { id });
      return cached;
    }

    const user = await this.db.query<User>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );

    if (user) {
      await this.cache.set(cacheKey, user, { ttl: 300 });
    }

    return user;
  }

  /**
   * Creates a new user in the system.
   * Validates input, persists to database, and emits creation event.
   */
  async createUser(input: UserCreateInput): Promise<User> {
    this.logger.info('Creating new user', { email: input.email });

    const existing = await this.db.query<User>(
      'SELECT id FROM users WHERE email = $1',
      [input.email]
    );

    if (existing) {
      throw new Error(\`User with email \${input.email} already exists\`);
    }

    const user = await this.db.insert<User>('users', {
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    });

    await this.cache.set(\`user:\${user.id}\`, user, { ttl: 300 });
    this.events.emit('user:created', { user });

    return user;
  }

  /**
   * Updates an existing user's information.
   */
  async updateUser(id: string, input: UserUpdateInput): Promise<User> {
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error(\`User not found: \${id}\`);
    }

    const updated = await this.db.update<User>('users', id, {
      ...input,
      updatedAt: new Date(),
    });

    await this.cache.invalidate(\`user:\${id}\`);
    this.events.emit('user:updated', { user: updated });

    return updated;
  }

  /**
   * Deactivates a user account (soft delete).
   */
  async deactivateUser(id: string): Promise<void> {
    await this.updateUser(id, { isActive: false });
    await this.cache.invalidate(\`user:\${id}\`);
    this.events.emit('user:deactivated', { userId: id });
    this.logger.info('User deactivated', { id });
  }

  /**
   * Lists users with pagination and filtering support.
   */
  async listUsers(options: {
    page?: number;
    pageSize?: number;
    filter?: Partial<User>;
    sortBy?: keyof User;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ users: User[]; total: number }> {
    const { page = 1, pageSize = 20, filter, sortBy = 'createdAt', sortOrder = 'desc' } = options;
    const offset = (page - 1) * pageSize;

    const result = await this.db.queryMany<User>('users', {
      where: filter,
      orderBy: { [sortBy]: sortOrder },
      limit: pageSize,
      offset,
    });

    return { users: result.rows, total: result.count };
  }
}`,

  'src/models/User.ts': `/**
 * Core user entity representing an authenticated user in the system.
 */
export interface User {
  /** Unique identifier (UUID v4) */
  id: string;
  /** User's email address (unique) */
  email: string;
  /** Display name */
  displayName: string;
  /** Hashed password */
  passwordHash: string;
  /** URL to the user's avatar image */
  avatarUrl?: string;
  /** User's role in the system */
  role: UserRole;
  /** Whether the account is active */
  isActive: boolean;
  /** Account creation timestamp */
  createdAt: Date;
  /** Last modification timestamp */
  updatedAt: Date;
  /** Last login timestamp */
  lastLoginAt?: Date;
  /** User preferences */
  preferences: UserPreferences;
}

export type UserRole = 'admin' | 'editor' | 'viewer' | 'guest';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: NotificationSettings;
  timezone: string;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  inApp: boolean;
  digest: 'daily' | 'weekly' | 'none';
}

/**
 * Input type for creating a new user.
 * Omits auto-generated fields like id and timestamps.
 */
export interface UserCreateInput {
  email: string;
  displayName: string;
  password: string;
  role?: UserRole;
  avatarUrl?: string;
}

/**
 * Input type for updating an existing user.
 * All fields are optional - only provided fields are updated.
 */
export interface UserUpdateInput {
  email?: string;
  displayName?: string;
  password?: string;
  role?: UserRole;
  avatarUrl?: string;
  isActive?: boolean;
  preferences?: Partial<UserPreferences>;
}

/**
 * Validates a user email address format.
 */
export function validateUserEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Creates a display-safe user object by stripping sensitive fields.
 */
export function toPublicUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}`,

  'src/controllers/UserController.ts': `import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/UserService';
import { User, UserCreateInput, validateUserEmail } from '../models/User';
import { AuthMiddleware } from '../middleware/AuthMiddleware';
import { ValidationError, NotFoundError } from '../errors';

/**
 * REST API controller for user-related endpoints.
 * Handles HTTP request/response mapping and input validation.
 */
export class UserController {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  /**
   * GET /api/users/:id
   * Retrieves a single user by ID.
   */
  async getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = await this.userService.getUserById(id);

      if (!user) {
        throw new NotFoundError(\`User \${id} not found\`);
      }

      res.json({ data: user, status: 'success' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/users
   * Creates a new user account.
   */
  async createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: UserCreateInput = req.body;

      if (!input.email || !validateUserEmail(input.email)) {
        throw new ValidationError('Invalid email address');
      }

      if (!input.displayName || input.displayName.trim().length < 2) {
        throw new ValidationError('Display name must be at least 2 characters');
      }

      if (!input.password || input.password.length < 8) {
        throw new ValidationError('Password must be at least 8 characters');
      }

      const user = await this.userService.createUser(input);
      res.status(201).json({ data: user, status: 'created' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/users/:id
   * Updates an existing user's information.
   */
  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const input = req.body;

      if (input.email && !validateUserEmail(input.email)) {
        throw new ValidationError('Invalid email address');
      }

      const user = await this.userService.updateUser(id, input);
      res.json({ data: user, status: 'updated' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/users/:id
   * Deactivates a user account (soft delete).
   */
  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await this.userService.deactivateUser(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/users
   * Lists users with pagination support.
   */
  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);

      const result = await this.userService.listUsers({ page, pageSize });
      res.json({
        data: result.users,
        pagination: {
          page,
          pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / pageSize),
        },
        status: 'success',
      });
    } catch (error) {
      next(error);
    }
  }
}`,

  'src/database/Database.ts': `import { Pool, PoolClient, QueryResult } from 'pg';
import { Logger } from '../utils/Logger';

export interface QueryOptions {
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  offset?: number;
}

export interface QueryManyResult<T> {
  rows: T[];
  count: number;
}

/**
 * Database abstraction layer providing type-safe query methods.
 * Wraps a PostgreSQL connection pool with convenience methods.
 */
export class Database {
  private pool: Pool;
  private logger: Logger;

  constructor(connectionString: string, logger: Logger) {
    this.pool = new Pool({ connectionString, max: 20 });
    this.logger = logger;
  }

  /**
   * Executes a single-row query and returns the first result.
   */
  async query<T>(sql: string, params?: unknown[]): Promise<T | null> {
    const client = await this.pool.connect();
    try {
      this.logger.debug('Executing query', { sql, params });
      const result: QueryResult = await client.query(sql, params);
      return (result.rows[0] as T) || null;
    } finally {
      client.release();
    }
  }

  /**
   * Executes a multi-row query with filtering and pagination.
   */
  async queryMany<T>(
    table: string,
    options: QueryOptions = {}
  ): Promise<QueryManyResult<T>> {
    const { where, orderBy, limit, offset } = options;
    let sql = \`SELECT * FROM \${table}\`;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (where && Object.keys(where).length > 0) {
      const conditions = Object.entries(where).map(([key, value]) => {
        params.push(value);
        return \`\${key} = $\${paramIndex++}\`;
      });
      sql += \` WHERE \${conditions.join(' AND ')}\`;
    }

    if (orderBy) {
      const orderClauses = Object.entries(orderBy).map(
        ([key, dir]) => \`\${key} \${dir.toUpperCase()}\`
      );
      sql += \` ORDER BY \${orderClauses.join(', ')}\`;
    }

    if (limit !== undefined) {
      sql += \` LIMIT \${limit}\`;
    }
    if (offset !== undefined) {
      sql += \` OFFSET \${offset}\`;
    }

    const client = await this.pool.connect();
    try {
      const [dataResult, countResult] = await Promise.all([
        client.query(sql, params),
        client.query(\`SELECT COUNT(*) FROM \${table}\`),
      ]);

      return {
        rows: dataResult.rows as T[],
        count: parseInt(countResult.rows[0].count, 10),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Inserts a new record into the specified table.
   */
  async insert<T>(table: string, data: Record<string, unknown>): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => \`$\${i + 1}\`);

    const sql = \`INSERT INTO \${table} (\${keys.join(', ')}) VALUES (\${placeholders.join(', ')}) RETURNING *\`;

    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, values);
      return result.rows[0] as T;
    } finally {
      client.release();
    }
  }

  /**
   * Updates an existing record by ID.
   */
  async update<T>(
    table: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClauses = keys.map((key, i) => \`\${key} = $\${i + 1}\`);
    values.push(id);

    const sql = \`UPDATE \${table} SET \${setClauses.join(', ')} WHERE id = $\${values.length} RETURNING *\`;

    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, values);
      if (result.rows.length === 0) {
        throw new Error(\`Record not found in \${table}: \${id}\`);
      }
      return result.rows[0] as T;
    } finally {
      client.release();
    }
  }

  /**
   * Executes operations within a database transaction.
   */
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Gracefully closes the connection pool.
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.logger.info('Database connection pool closed');
  }
}`,

  'src/tests/UserService.test.ts': `import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UserService } from '../services/UserService';
import { Database } from '../database/Database';
import { CacheManager } from '../cache/CacheManager';
import { Logger } from '../utils/Logger';
import { EventEmitter } from '../events/EventEmitter';
import { User, UserCreateInput } from '../models/User';

describe('UserService', () => {
  let userService: UserService;
  let mockDb: jest.Mocked<Database>;
  let mockCache: jest.Mocked<CacheManager>;
  let mockLogger: jest.Mocked<Logger>;
  let mockEvents: jest.Mocked<EventEmitter>;

  const mockUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'john@example.com',
    displayName: 'John Doe',
    passwordHash: '$2b$10$hashed',
    role: 'editor',
    isActive: true,
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
    preferences: {
      theme: 'dark',
      language: 'en',
      notifications: { email: true, push: true, inApp: true, digest: 'weekly' },
      timezone: 'America/New_York',
    },
  };

  beforeEach(() => {
    mockDb = { query: jest.fn(), insert: jest.fn(), update: jest.fn() } as any;
    mockCache = { get: jest.fn(), set: jest.fn(), invalidate: jest.fn() } as any;
    mockLogger = { debug: jest.fn(), info: jest.fn(), error: jest.fn() } as any;
    mockEvents = { emit: jest.fn() } as any;
    userService = new UserService(mockDb, mockCache, mockLogger, mockEvents);
  });

  describe('getUserById', () => {
    it('should return cached user when available', async () => {
      mockCache.get.mockResolvedValue(mockUser);
      const result = await userService.getUserById(mockUser.id);
      expect(result).toEqual(mockUser);
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should query database on cache miss', async () => {
      mockCache.get.mockResolvedValue(null);
      mockDb.query.mockResolvedValue(mockUser);
      const result = await userService.getUserById(mockUser.id);
      expect(result).toEqual(mockUser);
      expect(mockCache.set).toHaveBeenCalled();
    });
  });

  describe('createUser', () => {
    const input: UserCreateInput = {
      email: 'jane@example.com',
      displayName: 'Jane Smith',
      password: 'securePassword123',
    };

    it('should create user and emit event', async () => {
      mockDb.query.mockResolvedValue(null);
      mockDb.insert.mockResolvedValue({ ...mockUser, ...input, id: 'new-id' });
      const result = await userService.createUser(input);
      expect(result.email).toBe(input.email);
      expect(mockEvents.emit).toHaveBeenCalledWith('user:created', expect.any(Object));
    });

    it('should throw if email already exists', async () => {
      mockDb.query.mockResolvedValue(mockUser);
      await expect(userService.createUser(input)).rejects.toThrow('already exists');
    });
  });
});`,
}

/** Generates mock locations for demonstrating peek definition */
export function generateMockDefinitionLocations(): PeekLocation[] {
  return [
    {
      filePath: 'src/services/UserService.ts',
      line: 11,
      column: 14,
      endLine: 11,
      endColumn: 25,
      preview: 'export class UserService {',
      fileContent: MOCK_FILE_CONTENTS['src/services/UserService.ts'],
      languageId: 'typescript',
      symbolName: 'UserService',
      symbolKind: 'class',
    },
  ]
}

/** Generates mock locations for demonstrating peek references */
export function generateMockReferenceLocations(): PeekLocation[] {
  return [
    {
      filePath: 'src/services/UserService.ts',
      line: 11,
      column: 14,
      endLine: 11,
      endColumn: 25,
      preview: 'export class UserService {',
      fileContent: MOCK_FILE_CONTENTS['src/services/UserService.ts'],
      languageId: 'typescript',
      symbolName: 'UserService',
      symbolKind: 'class',
    },
    {
      filePath: 'src/controllers/UserController.ts',
      line: 2,
      column: 10,
      endLine: 2,
      endColumn: 21,
      preview: "import { UserService } from '../services/UserService';",
      fileContent: MOCK_FILE_CONTENTS['src/controllers/UserController.ts'],
      languageId: 'typescript',
      symbolName: 'UserService',
      symbolKind: 'class',
    },
    {
      filePath: 'src/controllers/UserController.ts',
      line: 13,
      column: 11,
      endLine: 13,
      endColumn: 22,
      preview: '  private userService: UserService;',
      fileContent: MOCK_FILE_CONTENTS['src/controllers/UserController.ts'],
      languageId: 'typescript',
      symbolName: 'UserService',
      symbolKind: 'class',
    },
    {
      filePath: 'src/controllers/UserController.ts',
      line: 15,
      column: 28,
      endLine: 15,
      endColumn: 39,
      preview: '  constructor(userService: UserService) {',
      fileContent: MOCK_FILE_CONTENTS['src/controllers/UserController.ts'],
      languageId: 'typescript',
      symbolName: 'UserService',
      symbolKind: 'class',
    },
    {
      filePath: 'src/tests/UserService.test.ts',
      line: 3,
      column: 10,
      endLine: 3,
      endColumn: 21,
      preview: "import { UserService } from '../services/UserService';",
      fileContent: MOCK_FILE_CONTENTS['src/tests/UserService.test.ts'],
      languageId: 'typescript',
      symbolName: 'UserService',
      symbolKind: 'class',
    },
    {
      filePath: 'src/tests/UserService.test.ts',
      line: 11,
      column: 7,
      endLine: 11,
      endColumn: 18,
      preview: '  let userService: UserService;',
      fileContent: MOCK_FILE_CONTENTS['src/tests/UserService.test.ts'],
      languageId: 'typescript',
      symbolName: 'UserService',
      symbolKind: 'class',
    },
    {
      filePath: 'src/tests/UserService.test.ts',
      line: 38,
      column: 21,
      endLine: 38,
      endColumn: 32,
      preview: '    userService = new UserService(mockDb, mockCache, mockLogger, mockEvents);',
      fileContent: MOCK_FILE_CONTENTS['src/tests/UserService.test.ts'],
      languageId: 'typescript',
      symbolName: 'UserService',
      symbolKind: 'class',
    },
  ]
}

/** Generates mock locations for demonstrating peek implementations */
export function generateMockImplementationLocations(): PeekLocation[] {
  return [
    {
      filePath: 'src/database/Database.ts',
      line: 16,
      column: 14,
      endLine: 16,
      endColumn: 22,
      preview: 'export class Database {',
      fileContent: MOCK_FILE_CONTENTS['src/database/Database.ts'],
      languageId: 'typescript',
      symbolName: 'Database',
      symbolKind: 'class',
    },
    {
      filePath: 'src/database/Database.ts',
      line: 29,
      column: 9,
      endLine: 29,
      endColumn: 14,
      preview: '  async query<T>(sql: string, params?: unknown[]): Promise<T | null> {',
      fileContent: MOCK_FILE_CONTENTS['src/database/Database.ts'],
      languageId: 'typescript',
      symbolName: 'query',
      symbolKind: 'method',
    },
    {
      filePath: 'src/database/Database.ts',
      line: 42,
      column: 9,
      endLine: 42,
      endColumn: 18,
      preview: '  async queryMany<T>(',
      fileContent: MOCK_FILE_CONTENTS['src/database/Database.ts'],
      languageId: 'typescript',
      symbolName: 'queryMany',
      symbolKind: 'method',
    },
    {
      filePath: 'src/database/Database.ts',
      line: 89,
      column: 9,
      endLine: 89,
      endColumn: 15,
      preview: '  async insert<T>(table: string, data: Record<string, unknown>): Promise<T> {',
      fileContent: MOCK_FILE_CONTENTS['src/database/Database.ts'],
      languageId: 'typescript',
      symbolName: 'insert',
      symbolKind: 'method',
    },
  ]
}

/** Generates mock locations for demonstrating peek type definition */
export function generateMockTypeDefinitionLocations(): PeekLocation[] {
  return [
    {
      filePath: 'src/models/User.ts',
      line: 4,
      column: 18,
      endLine: 4,
      endColumn: 22,
      preview: 'export interface User {',
      fileContent: MOCK_FILE_CONTENTS['src/models/User.ts'],
      languageId: 'typescript',
      symbolName: 'User',
      symbolKind: 'interface',
    },
    {
      filePath: 'src/models/User.ts',
      line: 33,
      column: 13,
      endLine: 33,
      endColumn: 21,
      preview: "export type UserRole = 'admin' | 'editor' | 'viewer' | 'guest';",
      fileContent: MOCK_FILE_CONTENTS['src/models/User.ts'],
      languageId: 'typescript',
      symbolName: 'UserRole',
      symbolKind: 'type',
    },
    {
      filePath: 'src/models/User.ts',
      line: 35,
      column: 18,
      endLine: 35,
      endColumn: 33,
      preview: 'export interface UserPreferences {',
      fileContent: MOCK_FILE_CONTENTS['src/models/User.ts'],
      languageId: 'typescript',
      symbolName: 'UserPreferences',
      symbolKind: 'interface',
    },
    {
      filePath: 'src/models/User.ts',
      line: 53,
      column: 18,
      endLine: 53,
      endColumn: 33,
      preview: 'export interface UserCreateInput {',
      fileContent: MOCK_FILE_CONTENTS['src/models/User.ts'],
      languageId: 'typescript',
      symbolName: 'UserCreateInput',
      symbolKind: 'interface',
    },
    {
      filePath: 'src/models/User.ts',
      line: 64,
      column: 18,
      endLine: 64,
      endColumn: 33,
      preview: 'export interface UserUpdateInput {',
      fileContent: MOCK_FILE_CONTENTS['src/models/User.ts'],
      languageId: 'typescript',
      symbolName: 'UserUpdateInput',
      symbolKind: 'interface',
    },
  ]
}

/* ══════════════════════════════════════════════════════════════
   Helper Utilities
   ══════════════════════════════════════════════════════════════ */

/** Extract the file name from a full path */
function fileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() || path
}

/** Extract directory path from a full file path */
function dirName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : ''
}

/** Extract relative path from workspace root (heuristic) */
function relativePath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const markers = ['/src/', '/lib/', '/packages/', '/app/']
  for (const marker of markers) {
    const idx = normalized.indexOf(marker)
    if (idx !== -1) return normalized.slice(idx + 1)
  }
  const parts = normalized.split('/')
  return parts.slice(Math.max(0, parts.length - 3)).join('/')
}

/** Detect language from file extension */
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
    cs: 'csharp', cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp', swift: 'swift',
    json: 'json', yaml: 'yaml', yml: 'yaml', xml: 'xml', html: 'html',
    css: 'css', scss: 'scss', less: 'less', md: 'markdown', sql: 'sql',
    sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell',
    vue: 'vue', svelte: 'svelte', php: 'php', lua: 'lua', dart: 'dart',
  }
  return map[ext] || 'plaintext'
}

/** Build file content from a location, padding with blank lines if needed */
function buildFileContent(location: PeekLocation): string {
  if (location.fileContent) return location.fileContent
  if (!location.preview) return `// ${fileName(location.filePath)}\n// Content not available`

  const lines: string[] = []
  const targetLine = Math.max(1, location.line - CONTEXT_LINES_ABOVE)
  for (let i = 1; i < targetLine; i++) {
    lines.push('')
  }
  for (let i = 0; i < CONTEXT_LINES_ABOVE && targetLine + i < location.line; i++) {
    lines.push('')
  }
  lines.push(location.preview)
  for (let i = 0; i < CONTEXT_LINES_BELOW; i++) {
    lines.push('')
  }
  return lines.join('\n')
}

/** Group locations by file path for sidebar rendering */
function groupByFile(locations: PeekLocation[]): Map<string, PeekLocation[]> {
  const grouped = new Map<string, PeekLocation[]>()
  for (const loc of locations) {
    const existing = grouped.get(loc.filePath)
    if (existing) {
      existing.push(loc)
    } else {
      grouped.set(loc.filePath, [loc])
    }
  }
  return grouped
}

/** Get global flat index for a location within grouped results */
function getFlatIndex(locations: PeekLocation[], location: PeekLocation): number {
  return locations.findIndex(
    (l) => l.filePath === location.filePath && l.line === location.line && l.column === location.column
  )
}

/* ══════════════════════════════════════════════════════════════
   Syntax Tokenizer for preview text
   ══════════════════════════════════════════════════════════════ */

interface TokenSpan {
  text: string
  className: string
}

const TS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'class', 'interface', 'type', 'enum',
  'import', 'export', 'from', 'return', 'if', 'else', 'for', 'while', 'do',
  'new', 'this', 'extends', 'implements', 'async', 'await', 'default',
  'public', 'private', 'protected', 'static', 'readonly', 'abstract',
  'void', 'string', 'number', 'boolean', 'null', 'undefined', 'true', 'false',
  'typeof', 'keyof', 'instanceof', 'in', 'of', 'as', 'is', 'never', 'unknown',
  'any', 'super', 'switch', 'case', 'break', 'continue', 'throw', 'try',
  'catch', 'finally', 'yield', 'delete', 'with', 'debugger',
])

const PY_KEYWORDS = new Set([
  'def', 'class', 'import', 'from', 'return', 'if', 'else', 'elif',
  'for', 'while', 'try', 'except', 'finally', 'with', 'as', 'async',
  'await', 'yield', 'None', 'True', 'False', 'self', 'lambda', 'pass',
  'raise', 'break', 'continue', 'global', 'nonlocal', 'assert', 'del',
  'in', 'not', 'and', 'or', 'is',
])

const RUST_KEYWORDS = new Set([
  'fn', 'let', 'mut', 'const', 'static', 'struct', 'enum', 'impl', 'trait',
  'pub', 'use', 'mod', 'crate', 'self', 'super', 'return', 'if', 'else',
  'match', 'for', 'while', 'loop', 'break', 'continue', 'async', 'await',
  'where', 'type', 'as', 'ref', 'move', 'unsafe', 'extern', 'dyn',
])

const GO_KEYWORDS = new Set([
  'func', 'var', 'const', 'type', 'struct', 'interface', 'package', 'import',
  'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default',
  'go', 'chan', 'select', 'defer', 'break', 'continue', 'map', 'make',
  'new', 'nil', 'true', 'false', 'iota',
])

const LANG_KEYWORDS: Record<string, Set<string>> = {
  typescript: TS_KEYWORDS,
  typescriptreact: TS_KEYWORDS,
  javascript: TS_KEYWORDS,
  javascriptreact: TS_KEYWORDS,
  python: PY_KEYWORDS,
  rust: RUST_KEYWORDS,
  go: GO_KEYWORDS,
}

/** Simple keyword-based tokenizer for preview text in the reference list */
function tokenizePreview(text: string, languageId: string): TokenSpan[] {
  const langKeywords = LANG_KEYWORDS[languageId] || TS_KEYWORDS
  const tokens: TokenSpan[] = []
  let i = 0

  while (i < text.length) {
    // Whitespace
    if (/\s/.test(text[i])) {
      let j = i
      while (j < text.length && /\s/.test(text[j])) j++
      tokens.push({ text: text.slice(i, j), className: '' })
      i = j
      continue
    }

    // Single-line comment
    if (text.slice(i, i + 2) === '//' || (text[i] === '#' && languageId === 'python')) {
      tokens.push({ text: text.slice(i), className: 'peek-token-comment' })
      break
    }

    // Multi-line comment start
    if (text.slice(i, i + 2) === '/*') {
      const end = text.indexOf('*/', i + 2)
      const j = end >= 0 ? end + 2 : text.length
      tokens.push({ text: text.slice(i, j), className: 'peek-token-comment' })
      i = j
      continue
    }

    // String (single, double, or backtick)
    if (text[i] === '"' || text[i] === "'" || text[i] === '`') {
      const quote = text[i]
      let j = i + 1
      while (j < text.length && text[j] !== quote) {
        if (text[j] === '\\') j++
        j++
      }
      if (j < text.length) j++
      tokens.push({ text: text.slice(i, j), className: 'peek-token-string' })
      i = j
      continue
    }

    // Number
    if (/[0-9]/.test(text[i])) {
      let j = i
      while (j < text.length && /[0-9.xXa-fA-F_eEbBoO]/.test(text[j])) j++
      tokens.push({ text: text.slice(i, j), className: 'peek-token-number' })
      i = j
      continue
    }

    // Decorator / annotation
    if (text[i] === '@' && i + 1 < text.length && /[a-zA-Z]/.test(text[i + 1])) {
      let j = i + 1
      while (j < text.length && /[a-zA-Z0-9_]/.test(text[j])) j++
      tokens.push({ text: text.slice(i, j), className: 'peek-token-decorator' })
      i = j
      continue
    }

    // Word (identifier or keyword)
    if (/[a-zA-Z_$]/.test(text[i])) {
      let j = i
      while (j < text.length && /[a-zA-Z0-9_$]/.test(text[j])) j++
      const word = text.slice(i, j)

      let cls: string
      if (langKeywords.has(word)) {
        cls = 'peek-token-keyword'
      } else if (word[0] === word[0].toUpperCase() && /[a-z]/.test(word.slice(1))) {
        cls = 'peek-token-type'
      } else {
        cls = 'peek-token-identifier'
      }

      tokens.push({ text: word, className: cls })
      i = j
      continue
    }

    // Arrow operator
    if (text.slice(i, i + 2) === '=>') {
      tokens.push({ text: '=>', className: 'peek-token-operator' })
      i += 2
      continue
    }

    // Punctuation / operators
    tokens.push({ text: text[i], className: 'peek-token-punctuation' })
    i++
  }

  return tokens
}

/** Tokenize a full line of code content for the embedded viewer */
function tokenizeLine(text: string, languageId: string): TokenSpan[] {
  return tokenizePreview(text, languageId)
}

/* ══════════════════════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════════════════════ */

/** Tiny icon button for the peek title bar */
function PeekIconButton({
  icon,
  title,
  onClick,
  color,
  isActive,
  disabled,
}: {
  icon: React.ReactNode
  title: string
  onClick: () => void
  color: string
  isActive?: boolean
  disabled?: boolean
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        padding: 0,
        margin: 0,
        border: 'none',
        borderRadius: 3,
        cursor: disabled ? 'default' : 'pointer',
        color,
        backgroundColor: hovered || isActive
          ? 'rgba(255, 255, 255, 0.15)'
          : 'transparent',
        transition: 'background-color 100ms',
        flexShrink: 0,
        outline: 'none',
        opacity: disabled ? 0.35 : isActive ? 1 : hovered ? 0.95 : 0.8,
      }}
    >
      {icon}
    </button>
  )
}

/** Vertical divider for the title bar */
function PeekDivider() {
  return (
    <div
      style={{
        width: 1,
        height: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        margin: '0 2px',
        flexShrink: 0,
      }}
    />
  )
}

/** Reference list item in the sidebar */
function ReferenceItem({
  location,
  index,
  isActive,
  onClick,
  onDoubleClick,
  languageId,
}: {
  location: PeekLocation
  index: number
  isActive: boolean
  onClick: () => void
  onDoubleClick: () => void
  languageId: string
}) {
  const tokens = useMemo(
    () => tokenizePreview(location.preview || '', languageId),
    [location.preview, languageId]
  )
  const [hovered, setHovered] = useState(false)

  const symbolIcon = location.symbolKind
    ? SYMBOL_ICONS[location.symbolKind]
    : null

  return (
    <div
      role="option"
      aria-selected={isActive}
      tabIndex={-1}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '3px 8px 3px 12px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        backgroundColor: isActive
          ? 'var(--bg-active, rgba(4, 57, 94, 0.7))'
          : hovered
            ? 'var(--bg-hover, rgba(4, 57, 94, 0.35))'
            : 'transparent',
        borderLeft: isActive
          ? '2px solid var(--accent-primary, #1b80b2)'
          : '2px solid transparent',
        fontSize: '12px',
        lineHeight: '18px',
        userSelect: 'none',
        transition: 'background-color 80ms ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          color: 'var(--text-primary, #e8e8e8)',
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {symbolIcon && (
          <span style={{ flexShrink: 0, opacity: 0.6, display: 'inline-flex' }}>
            {symbolIcon}
          </span>
        )}
        {!symbolIcon && <FileText size={12} style={{ flexShrink: 0, opacity: 0.5 }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {location.symbolName || relativePath(location.filePath)}
        </span>
        <span
          style={{
            color: 'var(--text-secondary, #858585)',
            flexShrink: 0,
            marginLeft: 'auto',
            fontSize: '11px',
          }}
        >
          :{location.line}
        </span>
      </div>
      {location.preview && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            lineHeight: '16px',
            color: 'var(--text-secondary, #a0a0a0)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            paddingLeft: symbolIcon ? 16 : 16,
          }}
        >
          {tokens.map((t, i) => (
            <span key={i} className={t.className}>
              {t.text}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** File group header in the reference list sidebar */
function FileGroupHeader({
  filePath,
  count,
  isExpanded,
  onToggle,
  accentColor,
}: {
  filePath: string
  count: number
  isExpanded: boolean
  onToggle: () => void
  accentColor: string
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--text-primary, #e8e8e8)',
        backgroundColor: hovered
          ? 'var(--bg-hover, rgba(255, 255, 255, 0.06))'
          : 'var(--bg-secondary, rgba(255, 255, 255, 0.03))',
        userSelect: 'none',
        lineHeight: '22px',
        transition: 'background-color 80ms ease',
      }}
    >
      <ChevronRight
        size={12}
        style={{
          flexShrink: 0,
          transition: 'transform 120ms ease',
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
          opacity: 0.6,
        }}
      />
      <FileCode size={13} style={{ opacity: 0.7, flexShrink: 0 }} />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
        title={filePath}
      >
        {fileName(filePath)}
      </span>
      <span
        style={{
          fontSize: '10px',
          fontWeight: 500,
          color: 'var(--text-primary, #e8e8e8)',
          flexShrink: 0,
          marginLeft: 'auto',
          opacity: 0.7,
        }}
      >
        {count}
      </span>
      <span
        style={{
          fontSize: '10px',
          color: 'var(--text-secondary, #858585)',
          flexShrink: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 120,
          whiteSpace: 'nowrap',
        }}
        title={dirName(filePath)}
      >
        {dirName(filePath)}
      </span>
    </div>
  )
}

/** Inline code viewer with syntax highlighting using pre/code and token-based coloring */
function InlineCodeViewer({
  content,
  languageId,
  targetLine,
  targetEndLine,
  targetColumn,
  targetEndColumn,
  onLineDoubleClick,
  height,
}: {
  content: string
  languageId: string
  targetLine: number
  targetEndLine?: number
  targetColumn?: number
  targetEndColumn?: number
  onLineDoubleClick?: (line: number) => void
  height: number
}) {
  const viewerRef = useRef<HTMLPreElement>(null)
  const lines = useMemo(() => content.split('\n'), [content])
  const endLine = targetEndLine || targetLine

  // Determine visible range (show context around target)
  const startVisible = Math.max(0, targetLine - 1 - CONTEXT_LINES_ABOVE)
  const endVisible = Math.min(lines.length, endLine + CONTEXT_LINES_BELOW)
  const visibleLines = lines.slice(startVisible, endVisible)

  // Scroll to target line on mount and when it changes
  useEffect(() => {
    if (viewerRef.current) {
      const targetOffset = Math.max(0, (targetLine - 1 - startVisible - 3)) * LINE_HEIGHT
      viewerRef.current.scrollTop = targetOffset
    }
  }, [targetLine, startVisible])

  return (
    <pre
      ref={viewerRef}
      style={{
        margin: 0,
        padding: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: FONT_SIZE,
        lineHeight: `${LINE_HEIGHT}px`,
        overflow: 'auto',
        height,
        backgroundColor: 'var(--bg-primary, #1e1e1e)',
        color: 'var(--text-primary, #d4d4d4)',
        tabSize: 2,
        whiteSpace: 'pre',
        userSelect: 'text',
      }}
    >
      <code style={{ display: 'block', minWidth: 'fit-content' }}>
        {visibleLines.map((line, idx) => {
          const lineNumber = startVisible + idx + 1
          const isTarget = lineNumber >= targetLine && lineNumber <= endLine
          const tokens = tokenizeLine(line, languageId)

          return (
            <div
              key={lineNumber}
              onDoubleClick={() => onLineDoubleClick?.(lineNumber)}
              style={{
                display: 'flex',
                minHeight: LINE_HEIGHT,
                backgroundColor: isTarget
                  ? 'rgba(27, 128, 178, 0.15)'
                  : 'transparent',
                borderLeft: isTarget
                  ? '3px solid var(--accent-primary, #1b80b2)'
                  : '3px solid transparent',
                cursor: 'text',
              }}
            >
              {/* Line number gutter */}
              <span
                style={{
                  display: 'inline-block',
                  width: 48,
                  minWidth: 48,
                  textAlign: 'right',
                  paddingRight: 12,
                  color: isTarget
                    ? 'var(--accent-primary, #1b80b2)'
                    : 'var(--text-muted, #545d68)',
                  userSelect: 'none',
                  fontSize: '12px',
                  fontWeight: isTarget ? 600 : 400,
                  flexShrink: 0,
                }}
              >
                {lineNumber}
              </span>
              {/* Code content */}
              <span
                style={{
                  flex: 1,
                  paddingRight: 16,
                  whiteSpace: 'pre',
                }}
              >
                {tokens.length > 0 ? (
                  tokens.map((t, tIdx) => (
                    <span key={tIdx} className={t.className}>
                      {t.text}
                    </span>
                  ))
                ) : (
                  '\u00A0'
                )}
              </span>
            </div>
          )
        })}
      </code>
    </pre>
  )
}

/** Search input for filtering references in the sidebar */
function ReferenceSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 6px',
        borderBottom: '1px solid var(--border-color, rgba(128, 128, 128, 0.35))',
        backgroundColor: 'var(--bg-primary, #1e1e1e)',
      }}
    >
      <Search size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          background: 'none',
          border: 'none',
          outline: 'none',
          color: 'var(--text-primary, #e8e8e8)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          lineHeight: '18px',
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('')
            inputRef.current?.focus()
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            opacity: 0.6,
          }}
        >
          <X size={11} />
        </button>
      )}
    </div>
  )
}

/** Status bar at the bottom of the reference list showing counts */
function ReferenceStatusBar({
  totalFiles,
  totalReferences,
  filteredCount,
  isFiltered,
}: {
  totalFiles: number
  totalReferences: number
  filteredCount?: number
  isFiltered: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '2px 8px',
        fontSize: '10px',
        color: 'var(--text-secondary, #858585)',
        borderTop: '1px solid var(--border-color, rgba(128, 128, 128, 0.35))',
        backgroundColor: 'var(--bg-secondary, #252526)',
        userSelect: 'none',
        lineHeight: '16px',
        flexShrink: 0,
      }}
    >
      <span>
        {isFiltered
          ? `${filteredCount} of ${totalReferences} results`
          : `${totalReferences} results in ${totalFiles} files`}
      </span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PeekWidget - The shared base component used by all variants
   ══════════════════════════════════════════════════════════════ */

export function PeekWidget({
  locations,
  onClose,
  onNavigate,
  onEdit,
  onRename,
  title,
  allowEditing = false,
  initialHeight,
  showReferenceList,
  mode = 'references',
  pinned = false,
  onPinToggle,
  accentColor,
  headerIcon,
}: PeekWidgetProps) {
  /* ── State ─────────────────────────────────────────────── */
  const [activeIndex, setActiveIndex] = useState(0)
  const [peekHeight, setPeekHeight] = useState(initialHeight || DEFAULT_PEEK_HEIGHT)
  const [isEditing, setIsEditing] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => {
    return new Set(locations.map((l) => l.filePath))
  })
  const [searchFilter, setSearchFilter] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(REFERENCE_LIST_WIDTH)

  /* ── Refs ──────────────────────────────────────────────── */
  const containerRef = useRef<HTMLDivElement>(null)
  const referenceListRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef(false)
  const resizeStartRef = useRef({ y: 0, height: 0 })
  const sidebarResizingRef = useRef(false)
  const sidebarResizeStartRef = useRef({ x: 0, width: 0 })

  /* ── Derived state ─────────────────────────────────────── */
  const accent = accentColor || MODE_ACCENTS[mode] || '#1b80b2'
  const activeLocation = locations[activeIndex] || locations[0]
  const showSidebar = showReferenceList ?? (locations.length > 1)
  const groupedLocations = useMemo(() => groupByFile(locations), [locations])
  const languageId = activeLocation?.languageId || detectLanguage(activeLocation?.filePath || '')
  const content = useMemo(() => {
    return activeLocation ? buildFileContent(activeLocation) : ''
  }, [activeLocation])

  const labels = MODE_LABELS[mode]
  const displayTitle = useMemo(() => {
    if (title) return title
    const count = locations.length
    return `${count} ${count === 1 ? labels.singular : labels.plural}`
  }, [title, mode, locations.length, labels])

  /* ── Filtered locations for search ────────────────────── */
  const filteredLocations = useMemo(() => {
    if (!searchFilter.trim()) return locations
    const lowerFilter = searchFilter.toLowerCase()
    return locations.filter((loc) => {
      const searchText = [
        loc.filePath,
        loc.preview,
        loc.symbolName,
        String(loc.line),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return searchText.includes(lowerFilter)
    })
  }, [locations, searchFilter])

  const filteredGrouped = useMemo(() => groupByFile(filteredLocations), [filteredLocations])

  /* ── Build flat reference list with file group indices ── */
  const referenceItems = useMemo(() => {
    const items: Array<
      | { type: 'header'; filePath: string; count: number }
      | { type: 'ref'; location: PeekLocation; flatIndex: number }
    > = []
    let flatIndex = 0
    for (const [filePath, locs] of filteredGrouped) {
      items.push({ type: 'header', filePath, count: locs.length })
      for (const loc of locs) {
        const globalIndex = getFlatIndex(locations, loc)
        items.push({ type: 'ref', location: loc, flatIndex: globalIndex })
        flatIndex++
      }
    }
    return items
  }, [filteredGrouped, locations])

  /* ── Ensure active index is within bounds ──────────────── */
  useEffect(() => {
    if (activeIndex >= locations.length) {
      setActiveIndex(Math.max(0, locations.length - 1))
    }
  }, [locations.length, activeIndex])

  /* ── Reset edit state when switching locations ─────────── */
  useEffect(() => {
    setIsEditing(false)
  }, [activeIndex])

  /* ── Navigation callbacks ──────────────────────────────── */
  const goToPrevious = useCallback(() => {
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : locations.length - 1))
  }, [locations.length])

  const goToNext = useCallback(() => {
    setActiveIndex((prev) => (prev < locations.length - 1 ? prev + 1 : 0))
  }, [locations.length])

  const handleSelectReference = useCallback((index: number) => {
    setActiveIndex(index)
  }, [])

  const handleOpenReference = useCallback(
    (location: PeekLocation) => {
      onNavigate?.(location, 'open')
    },
    [onNavigate]
  )

  const handleOpenToSide = useCallback(() => {
    if (activeLocation) {
      onNavigate?.(activeLocation, 'side')
    }
  }, [activeLocation, onNavigate])

  const handleToggleEdit = useCallback(() => {
    if (!allowEditing) return
    setIsEditing((prev) => !prev)
  }, [allowEditing])

  const handleCopyPath = useCallback(() => {
    if (activeLocation) {
      navigator.clipboard.writeText(`${activeLocation.filePath}:${activeLocation.line}`).catch(() => {
        /* silently ignore clipboard errors */
      })
    }
  }, [activeLocation])

  /* ── File group expand/collapse ────────────────────────── */
  const toggleFileGroup = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) {
        next.delete(filePath)
      } else {
        next.add(filePath)
      }
      return next
    })
  }, [])

  /* ── Vertical resize handling ──────────────────────────── */
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      resizingRef.current = true
      resizeStartRef.current = { y: e.clientY, height: peekHeight }

      const handleResizeMove = (moveEvent: MouseEvent) => {
        if (!resizingRef.current) return
        const delta = moveEvent.clientY - resizeStartRef.current.y
        const newHeight = Math.min(
          MAX_PEEK_HEIGHT,
          Math.max(MIN_PEEK_HEIGHT, resizeStartRef.current.height + delta)
        )
        setPeekHeight(newHeight)
      }

      const handleResizeEnd = () => {
        resizingRef.current = false
        document.removeEventListener('mousemove', handleResizeMove)
        document.removeEventListener('mouseup', handleResizeEnd)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleResizeMove)
      document.addEventListener('mouseup', handleResizeEnd)
    },
    [peekHeight]
  )

  /* ── Sidebar horizontal resize handling ────────────────── */
  const handleSidebarResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      sidebarResizingRef.current = true
      sidebarResizeStartRef.current = { x: e.clientX, width: sidebarWidth }

      const handleMove = (moveEvent: MouseEvent) => {
        if (!sidebarResizingRef.current) return
        const delta = sidebarResizeStartRef.current.x - moveEvent.clientX
        const newWidth = Math.min(500, Math.max(180, sidebarResizeStartRef.current.width + delta))
        setSidebarWidth(newWidth)
      }

      const handleEnd = () => {
        sidebarResizingRef.current = false
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleEnd)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleEnd)
    },
    [sidebarWidth]
  )

  /* ── Keyboard handling ─────────────────────────────────── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape closes the peek widget
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      // Don't handle navigation keys when editing
      if (isEditing && e.key !== 'F2') return

      // F2 for rename from peek
      if (e.key === 'F2') {
        e.preventDefault()
        if (onRename && activeLocation) {
          onRename(activeLocation)
        } else if (allowEditing) {
          handleToggleEdit()
        }
        return
      }

      // Ctrl+Enter / Cmd+Enter opens full file
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && activeLocation) {
        e.preventDefault()
        onNavigate?.(activeLocation, 'open')
        return
      }

      // Enter in reference list opens the file
      if (
        e.key === 'Enter' &&
        !e.ctrlKey &&
        !e.metaKey &&
        referenceListRef.current?.contains(document.activeElement) &&
        activeLocation
      ) {
        e.preventDefault()
        onNavigate?.(activeLocation, 'open')
        return
      }

      // Alt+Up/Down for reference navigation
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault()
        goToPrevious()
        return
      }
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault()
        goToNext()
        return
      }

      // Up/Down in reference list
      if (e.key === 'ArrowUp' && referenceListRef.current?.contains(document.activeElement)) {
        e.preventDefault()
        goToPrevious()
        return
      }
      if (e.key === 'ArrowDown' && referenceListRef.current?.contains(document.activeElement)) {
        e.preventDefault()
        goToNext()
        return
      }

      // Home/End in reference list
      if (e.key === 'Home' && referenceListRef.current?.contains(document.activeElement)) {
        e.preventDefault()
        setActiveIndex(0)
        return
      }
      if (e.key === 'End' && referenceListRef.current?.contains(document.activeElement)) {
        e.preventDefault()
        setActiveIndex(locations.length - 1)
        return
      }

      // Ctrl+C to copy file path
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !window.getSelection()?.toString()) {
        handleCopyPath()
        return
      }
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('keydown', handleKeyDown)
      return () => container.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    onClose, isEditing, allowEditing, handleToggleEdit, onRename,
    activeLocation, onNavigate, goToPrevious, goToNext, locations.length,
    handleCopyPath,
  ])

  /* ── Focus management ──────────────────────────────────── */
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  /* ── Scroll active reference into view ─────────────────── */
  useEffect(() => {
    if (!referenceListRef.current) return
    const activeItem = referenceListRef.current.querySelector('[aria-selected="true"]')
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeIndex])

  /* ── Bail if no locations ──────────────────────────────── */
  if (!locations.length) return null

  const totalFiles = groupedLocations.size

  /* ── Render ────────────────────────────────────────────── */
  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-label={`Peek: ${displayTitle}`}
      style={{
        position: 'relative',
        width: '100%',
        height: peekHeight + HEADER_HEIGHT + RESIZE_HANDLE_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        border: `2px solid ${accent}`,
        backgroundColor: 'var(--bg-primary, #1e1e1e)',
        boxShadow: 'var(--shadow-md, 0 2px 8px rgba(0, 0, 0, 0.3))',
        outline: 'none',
        zIndex: 10,
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* ── Title Bar ─────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: HEADER_HEIGHT,
          minHeight: HEADER_HEIGHT,
          backgroundColor: accent,
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: 500,
          paddingLeft: 8,
          paddingRight: 4,
          gap: 4,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        {/* Header icon */}
        {headerIcon && (
          <span style={{ display: 'inline-flex', opacity: 0.9, marginRight: 2 }}>
            {headerIcon}
          </span>
        )}

        {/* File path breadcrumb */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flex: 1,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              opacity: 0.9,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
            }}
            title={activeLocation.filePath}
          >
            {relativePath(activeLocation.filePath)}
          </span>
          <span style={{ opacity: 0.65, fontSize: '11px' }}>
            :{activeLocation.line}:{activeLocation.column}
          </span>
        </div>

        {/* Navigation counter */}
        {locations.length > 1 && (
          <span
            style={{
              fontSize: '11px',
              opacity: 0.85,
              whiteSpace: 'nowrap',
              marginRight: 2,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {activeIndex + 1} of {locations.length}
          </span>
        )}

        {/* Navigation arrows */}
        {locations.length > 1 && (
          <>
            <PeekIconButton
              icon={<ChevronUp size={14} />}
              title="Previous result (Alt+Up)"
              onClick={goToPrevious}
              color="#ffffff"
            />
            <PeekIconButton
              icon={<ChevronDown size={14} />}
              title="Next result (Alt+Down)"
              onClick={goToNext}
              color="#ffffff"
            />
          </>
        )}

        <PeekDivider />

        {/* Action buttons */}
        <PeekIconButton
          icon={<Copy size={13} />}
          title="Copy path (Ctrl+C)"
          onClick={handleCopyPath}
          color="#ffffff"
        />

        {allowEditing && (
          <PeekIconButton
            icon={<Edit3 size={13} />}
            title={isEditing ? 'Stop editing (F2)' : 'Edit in peek (F2)'}
            onClick={handleToggleEdit}
            color="#ffffff"
            isActive={isEditing}
          />
        )}

        <PeekIconButton
          icon={<Columns size={13} />}
          title="Open to side"
          onClick={handleOpenToSide}
          color="#ffffff"
        />

        {onPinToggle && (
          <PeekIconButton
            icon={<Pin size={13} />}
            title={pinned ? 'Unpin peek' : 'Pin peek'}
            onClick={onPinToggle}
            color="#ffffff"
            isActive={pinned}
          />
        )}

        <PeekIconButton
          icon={<Maximize2 size={13} />}
          title="Open in full editor (Ctrl+Enter)"
          onClick={() => activeLocation && onNavigate?.(activeLocation, 'open')}
          color="#ffffff"
        />

        <PeekDivider />

        <PeekIconButton
          icon={<X size={14} />}
          title="Close (Escape)"
          onClick={onClose}
          color="#ffffff"
        />
      </div>

      {/* ── Body ──────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* ── Embedded code viewer ────────────────────────── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            borderRight: showSidebar
              ? '1px solid var(--border-color, rgba(128, 128, 128, 0.35))'
              : 'none',
          }}
        >
          <InlineCodeViewer
            content={content}
            languageId={languageId}
            targetLine={activeLocation.line}
            targetEndLine={activeLocation.endLine}
            targetColumn={activeLocation.column}
            targetEndColumn={activeLocation.endColumn}
            height={peekHeight}
            onLineDoubleClick={(line) => {
              if (activeLocation) {
                onNavigate?.(
                  { ...activeLocation, line },
                  'open'
                )
              }
            }}
          />
        </div>

        {/* ── Sidebar horizontal resize handle ────────────── */}
        {showSidebar && (
          <div
            onMouseDown={handleSidebarResizeStart}
            style={{
              width: 4,
              cursor: 'ew-resize',
              backgroundColor: 'transparent',
              flexShrink: 0,
              zIndex: 1,
            }}
            title="Drag to resize sidebar"
          />
        )}

        {/* ── Reference list sidebar ─────────────────────── */}
        {showSidebar && (
          <div
            style={{
              width: sidebarWidth,
              minWidth: sidebarWidth,
              maxWidth: sidebarWidth,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              backgroundColor: 'var(--bg-secondary, #252526)',
            }}
          >
            {/* Sidebar title */}
            <div
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-secondary, #cccccc)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                borderBottom: '1px solid var(--border-color, rgba(128, 128, 128, 0.35))',
                userSelect: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                flexShrink: 0,
              }}
            >
              {headerIcon && (
                <span style={{ display: 'inline-flex', opacity: 0.6 }}>
                  {headerIcon}
                </span>
              )}
              {displayTitle}
            </div>

            {/* Search filter input */}
            {locations.length > 5 && (
              <ReferenceSearchInput
                value={searchFilter}
                onChange={setSearchFilter}
                placeholder="Filter results..."
              />
            )}

            {/* Scrollable reference list */}
            <div
              ref={referenceListRef}
              role="listbox"
              aria-label={displayTitle}
              tabIndex={0}
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                outline: 'none',
              }}
              onFocus={() => {
                const activeItem = referenceListRef.current?.querySelector('[aria-selected="true"]')
                if (activeItem) {
                  activeItem.scrollIntoView({ block: 'nearest' })
                }
              }}
            >
              {referenceItems.map((item, idx) => {
                if (item.type === 'header') {
                  return (
                    <FileGroupHeader
                      key={`header-${item.filePath}`}
                      filePath={item.filePath}
                      count={item.count}
                      isExpanded={expandedFiles.has(item.filePath)}
                      onToggle={() => toggleFileGroup(item.filePath)}
                      accentColor={accent}
                    />
                  )
                }

                if (!expandedFiles.has(item.location.filePath)) return null

                const refLangId = item.location.languageId || detectLanguage(item.location.filePath)

                return (
                  <ReferenceItem
                    key={`ref-${item.flatIndex}-${item.location.filePath}-${item.location.line}`}
                    location={item.location}
                    index={item.flatIndex}
                    isActive={item.flatIndex === activeIndex}
                    onClick={() => handleSelectReference(item.flatIndex)}
                    onDoubleClick={() => handleOpenReference(item.location)}
                    languageId={refLangId}
                  />
                )
              })}

              {/* Empty state */}
              {filteredLocations.length === 0 && (
                <div
                  style={{
                    padding: '16px 8px',
                    textAlign: 'center',
                    color: 'var(--text-muted, #808080)',
                    fontSize: '12px',
                  }}
                >
                  {searchFilter ? 'No matching results' : 'No results found'}
                </div>
              )}
            </div>

            {/* Status bar at bottom */}
            <ReferenceStatusBar
              totalFiles={totalFiles}
              totalReferences={locations.length}
              filteredCount={filteredLocations.length}
              isFiltered={searchFilter.trim().length > 0}
            />
          </div>
        )}
      </div>

      {/* ── Resize handle ─────────────────────────────────── */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          height: RESIZE_HANDLE_HEIGHT,
          minHeight: RESIZE_HANDLE_HEIGHT,
          cursor: 'ns-resize',
          backgroundColor: 'transparent',
          borderTop: `1px solid ${accent}`,
          position: 'relative',
          flexShrink: 0,
        }}
        title="Drag to resize"
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 32,
            height: 2,
            borderRadius: 1,
            backgroundColor: 'var(--text-muted, rgba(128, 128, 128, 0.5))',
          }}
        />
      </div>

      {/* ── Injected CSS for token colors ─────────────────── */}
      <style>{`
        .peek-token-keyword {
          color: var(--accent-primary, #569cd6);
          font-weight: 500;
        }
        .peek-token-string {
          color: #ce9178;
        }
        .peek-token-comment {
          color: #6a9955;
          font-style: italic;
        }
        .peek-token-number {
          color: #b5cea8;
        }
        .peek-token-punctuation {
          color: var(--text-primary, #d4d4d4);
        }
        .peek-token-identifier {
          color: var(--text-primary, #9cdcfe);
        }
        .peek-token-type {
          color: #4ec9b0;
        }
        .peek-token-decorator {
          color: #dcdcaa;
        }
        .peek-token-operator {
          color: var(--text-primary, #d4d4d4);
        }
      `}</style>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PeekDefinition - Inline embedded editor showing definition
   Default export - the primary peek view
   ══════════════════════════════════════════════════════════════ */

export default function PeekDefinition({
  locations,
  onClose,
  onNavigate,
  onEdit,
  title,
  allowEditing = false,
  initialHeight,
  showReferenceList,
  mode = 'definition',
  pinned = false,
  onPinToggle,
}: PeekDefinitionProps) {
  return (
    <PeekWidget
      locations={locations}
      onClose={onClose}
      onNavigate={onNavigate}
      onEdit={onEdit}
      title={title}
      allowEditing={allowEditing}
      initialHeight={initialHeight}
      showReferenceList={showReferenceList}
      mode={mode}
      pinned={pinned}
      onPinToggle={onPinToggle}
      accentColor={MODE_ACCENTS[mode]}
      headerIcon={<Code2 size={14} />}
    />
  )
}

/* ══════════════════════════════════════════════════════════════
   PeekReferences - Peek view for "Find All References"
   ══════════════════════════════════════════════════════════════ */

export function PeekReferences({
  locations,
  onClose,
  onNavigate,
  onEdit,
  title,
  allowEditing = false,
  initialHeight,
  showReferenceList = true,
  pinned = false,
  onPinToggle,
}: PeekReferencesProps) {
  const displayTitle = title || (() => {
    const count = locations.length
    return `${count} ${count === 1 ? 'reference' : 'references'}`
  })()

  return (
    <PeekWidget
      locations={locations}
      onClose={onClose}
      onNavigate={onNavigate}
      onEdit={onEdit}
      title={displayTitle}
      allowEditing={allowEditing}
      initialHeight={initialHeight}
      showReferenceList={showReferenceList}
      mode="references"
      pinned={pinned}
      onPinToggle={onPinToggle}
      accentColor={MODE_ACCENTS.references}
      headerIcon={<Search size={14} />}
    />
  )
}

/* ══════════════════════════════════════════════════════════════
   PeekImplementation - Peek view for "Go to Implementation"
   ══════════════════════════════════════════════════════════════ */

export function PeekImplementation({
  locations,
  onClose,
  onNavigate,
  onEdit,
  title,
  allowEditing = false,
  initialHeight,
  showReferenceList,
  pinned = false,
  onPinToggle,
}: PeekImplementationProps) {
  const displayTitle = title || (() => {
    const count = locations.length
    return `${count} ${count === 1 ? 'implementation' : 'implementations'}`
  })()

  return (
    <PeekWidget
      locations={locations}
      onClose={onClose}
      onNavigate={onNavigate}
      onEdit={onEdit}
      title={displayTitle}
      allowEditing={allowEditing}
      initialHeight={initialHeight}
      showReferenceList={showReferenceList}
      mode="implementation"
      pinned={pinned}
      onPinToggle={onPinToggle}
      accentColor={MODE_ACCENTS.implementation}
      headerIcon={<Braces size={14} />}
    />
  )
}

/* ══════════════════════════════════════════════════════════════
   PeekTypeDefinition - Peek view for "Go to Type Definition"
   ══════════════════════════════════════════════════════════════ */

export function PeekTypeDefinition({
  locations,
  onClose,
  onNavigate,
  onEdit,
  title,
  allowEditing = false,
  initialHeight,
  showReferenceList,
  pinned = false,
  onPinToggle,
}: PeekTypeDefinitionProps) {
  const displayTitle = title || (() => {
    const count = locations.length
    return `${count} ${count === 1 ? 'type definition' : 'type definitions'}`
  })()

  return (
    <PeekWidget
      locations={locations}
      onClose={onClose}
      onNavigate={onNavigate}
      onEdit={onEdit}
      title={displayTitle}
      allowEditing={allowEditing}
      initialHeight={initialHeight}
      showReferenceList={showReferenceList}
      mode="typeDefinition"
      pinned={pinned}
      onPinToggle={onPinToggle}
      accentColor={MODE_ACCENTS.typeDefinition}
      headerIcon={<Type size={14} />}
    />
  )
}
