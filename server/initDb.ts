import { pool } from "./db";

// DB 테이블 초기화 (DDL)
export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS headquarters (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        code VARCHAR(50) NOT NULL UNIQUE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        headquarters_id INTEGER NOT NULL REFERENCES headquarters(id),
        name TEXT NOT NULL,
        code VARCHAR(50) NOT NULL UNIQUE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        position_name TEXT,
        department_name TEXT,
        role VARCHAR(20) NOT NULL DEFAULT 'HQ_USER',
        headquarters_id INTEGER REFERENCES headquarters(id),
        team_id INTEGER REFERENCES teams(id),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS hq_team_region_permissions (
        id SERIAL PRIMARY KEY,
        headquarters_id INTEGER NOT NULL REFERENCES headquarters(id),
        team_id INTEGER NOT NULL REFERENCES teams(id),
        sido_code VARCHAR(20),
        sigun_code VARCHAR(20),
        region_name TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS login_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        login_at TIMESTAMP NOT NULL DEFAULT NOW(),
        ip_address VARCHAR(50),
        user_agent TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action_type VARCHAR(100) NOT NULL,
        target_type VARCHAR(100),
        target_id INTEGER,
        detail_json TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log("DB 테이블 초기화 완료");
  } finally {
    client.release();
  }
}
