/**
 * Database access layer.
 *
 * Raw parameterised SQL on purpose: the hand-written migrations in
 * drizzle/*.sql are the single source of truth, and there is no second
 * hand-maintained schema to drift out of sync with them. Every value that
 * reaches a query is a bound parameter - no string interpolation anywhere.
 *
 * Transaction mode pooling (Supabase Supavisor :6543) forbids named prepared
 * statements, so nothing here uses them.
 */
import { Pool, type PoolClient, type QueryResultRow } from "pg";

export type SqlParams = readonly unknown[];

/** Domain errors mapped from PostgreSQL SQLSTATEs. */
export class DbError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly constraint?: string,
  ) {
    super(message);
    this.name = "DbError";
  }
}

export const PG = {
  UNIQUE_VIOLATION: "23505",
  EXCLUSION_VIOLATION: "23P01",
  FOREIGN_KEY_VIOLATION: "23503",
  CHECK_VIOLATION: "23514",
  NOT_NULL_VIOLATION: "23502",
  INVALID_TEXT_REPRESENTATION: "22P02",
} as const;

type PgLikeError = { code?: string; constraint?: string; message?: string };

function toDbError(err: unknown): DbError {
  const e = err as PgLikeError;
  const code = e?.code ?? "UNKNOWN";
  // The driver message is only used internally; routes must never echo it.
  const message =
    code === PG.EXCLUSION_VIOLATION
      ? "slot_taken"
      : code === PG.UNIQUE_VIOLATION
        ? "duplicate"
        : code === PG.FOREIGN_KEY_VIOLATION
          ? "invalid_reference"
          : code === PG.CHECK_VIOLATION || code === PG.NOT_NULL_VIOLATION
            ? "invalid_data"
            : "database_error";
  return new DbError(message, code, e?.constraint);
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new DbError("DATABASE_URL is not configured", "NOT_CONFIGURED");
  }
  pool = new Pool({
    connectionString,
    // Serverless + PgBouncer: keep the pool tiny or the app exhausts
    // connections under load.
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    application_name: "edura",
    // Supabase requires TLS. A local database in development does not.
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: false },
  });
  pool.on("error", (err) => {
    console.error("[db] idle client error", err.message);
  });
  return pool;
}

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Run a parameterised query. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: SqlParams = [],
): Promise<T[]> {
  try {
    const res = await getPool().query<T>(text, params as unknown[]);
    return res.rows;
  } catch (err) {
    throw toDbError(err);
  }
}

/** Run a query expected to return at most one row. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: SqlParams = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Run `fn` inside a single transaction on one connection. Booking creation and
 * every money/status transition go through here so a failure leaves no partial
 * state behind.
 */
export async function withTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(new TxClient(client));
    await client.query("commit");
    return result;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* the connection is being discarded anyway */
    }
    throw err instanceof DbError ? err : toDbError(err);
  } finally {
    client.release();
  }
}

/** Thin wrapper so transaction callers cannot forget the connection. */
export class TxClient {
  constructor(private readonly client: PoolClient) {}

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: SqlParams = [],
  ): Promise<T[]> {
    try {
      const res = await this.client.query<T>(text, params as unknown[]);
      return res.rows;
    } catch (err) {
      throw toDbError(err);
    }
  }

  async one<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: SqlParams = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }
}

/**
 * Row-level lock on a tutor, used by the booking path in addition to the
 * exclusion constraint: the lock serialises the read of "is this slot free"
 * with the write, so callers get a clean, deterministic conflict answer
 * instead of racing and relying on the index to reject one of them.
 */
export async function lockTutor(tx: TxClient, tutorId: string): Promise<void> {
  await tx.query("select id from tutors where id = $1 for update", [tutorId]);
}
