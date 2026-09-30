// Database access — SQLite via Node's built-in `node:sqlite` (no native deps).
// All queries use prepared statements with bound parameters (SQL-injection safe).
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type Row = Record<string, unknown>;
export type Params = SQLInputValue[] | Record<string, SQLInputValue>;

export class Database {
  readonly raw: DatabaseSync;
  private cache = new Map<string, ReturnType<DatabaseSync['prepare']>>();

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA temp_store = MEMORY;
    `);
  }

  private stmt(sql: string) {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  private bind(params?: Params): SQLInputValue[] {
    if (!params) return [];
    return Array.isArray(params) ? params : [params as unknown as SQLInputValue];
  }

  get<T = Row>(sql: string, params?: Params): T | undefined {
    return this.stmt(sql).get(...this.bind(params)) as T | undefined;
  }

  all<T = Row>(sql: string, params?: Params): T[] {
    return this.stmt(sql).all(...this.bind(params)) as T[];
  }

  run(sql: string, params?: Params) {
    return this.stmt(sql).run(...this.bind(params));
  }

  /** Run `fn` inside a transaction; rolls back on throw. */
  tx<T>(fn: () => T): T {
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.raw.exec('COMMIT');
      return out;
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }

  close() {
    this.raw.close();
  }
}

export const newId = (prefix = '') => `${prefix}${randomUUID().replace(/-/g, '')}`;
export const nowIso = () => new Date().toISOString();

/** Apply pending SQL migrations in version order. */
export function migrate(db: Database, dir: string) {
  db.raw.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
  if (!existsSync(dir)) throw new Error(`Migrations directory not found: ${dir}`);
  const applied = new Set(db.all<{ version: string }>('SELECT version FROM schema_migrations').map((r) => r.version));
  const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const ran: string[] = [];
  for (const f of files) {
    const version = f.split('_')[0]!;
    if (applied.has(version)) continue;
    const sql = readFileSync(path.join(dir, f), 'utf8');
    db.tx(() => {
      db.raw.exec(sql);
      db.run('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
    });
    ran.push(f);
  }
  return ran;
}
