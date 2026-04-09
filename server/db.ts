import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: false,
});

// 연결 끊김 시 자동 복구 — 에러를 삼켜야 pool이 죽지 않음
pool.on("error", (err) => {
  console.error("[DB Pool] 연결 오류 (자동 복구 시도):", err.message);
});

export const db = drizzle(pool, { schema });
export { pool };
