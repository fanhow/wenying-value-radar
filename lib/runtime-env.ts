/**
 * Runtime bindings are installed by the Cloudflare Worker entry point.
 * Local previews and tests intentionally leave the database undefined and
 * continue to use the bundled snapshots.
 */

declare global {
  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    run<T = unknown>(): Promise<T>;
    all<T = unknown>(): Promise<{ results?: T[] }>;
    first<T = unknown>(): Promise<T | null>;
  }

  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T>;
  }

  interface Fetcher {
    fetch(request: Request | string, init?: RequestInit): Promise<Response>;
  }

  var __WENYING_DB: D1Database | undefined;
}

export function setRuntimeDatabase(database: D1Database | undefined) {
  globalThis.__WENYING_DB = database;
}

export function getRuntimeDatabase() {
  return globalThis.__WENYING_DB;
}
