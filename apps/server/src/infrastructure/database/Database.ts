import pg from "pg";

const { Pool } = pg;

export function createDatabase(connectionString: string): pg.Pool {
  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
  });
}
