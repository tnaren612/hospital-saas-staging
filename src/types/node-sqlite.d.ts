/**
 * Minimal ambient declarations for Node's built-in `node:sqlite` module.
 *
 * The project pins `@types/node@^20`, which predates `node:sqlite` (stable
 * types landed in @types/node 22.x). Rather than bump the dependency (which
 * risks type regressions across the codebase), we declare just the surface we
 * use. These must stay in sync with the actual Node runtime (>= 22.5).
 */

declare module "node:sqlite" {
  export type SQLiteValue =
    | string
    | number
    | bigint
    | Uint8Array
    | null;

  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    run(...params: unknown[]): StatementResultingChanges;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    iterate(...params: unknown[]): IterableIterator<unknown>;
  }

  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
    enableDoubleQuotedStringLiterals?: boolean;
    allowExtension?: boolean;
    timeout?: number;
  }

  export class DatabaseSync {
    constructor(path?: string, options?: DatabaseSyncOptions);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
    open(): void;
    location: string;
  }
}
