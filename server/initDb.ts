import { pool } from "./db";

// DB 테이블 초기화 (DDL)
export async function initDb() {
  const client = await pool.connect();
  try {
    // 기존 테이블 생성 (없을 경우)
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
        password_hash TEXT,
        display_name TEXT NOT NULL,
        email VARCHAR(255) UNIQUE,
        position_name TEXT,
        department_name TEXT,
        role VARCHAR(20) NOT NULL DEFAULT 'HQ_USER',
        headquarters_id INTEGER REFERENCES headquarters(id),
        team_id INTEGER REFERENCES teams(id),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
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

      CREATE TABLE IF NOT EXISTS page_views (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        page VARCHAR(100) NOT NULL,
        device VARCHAR(10) NOT NULL DEFAULT 'pc',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "session" (
        "sid" VARCHAR NOT NULL COLLATE "default",
        "sess" JSON NOT NULL,
        "expire" TIMESTAMP(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

    // 도/시/군/구 컬럼 추가 (기존 DB에 없을 경우만 추가)
    await client.query(`
      ALTER TABLE hq_team_region_permissions
        ADD COLUMN IF NOT EXISTS do_name TEXT,
        ADD COLUMN IF NOT EXISTS si_name TEXT,
        ADD COLUMN IF NOT EXISTS gun_name TEXT,
        ADD COLUMN IF NOT EXISTS gu_name TEXT;
    `);

    // must_change_password 컬럼 추가 (기존 DB에 없을 경우만)
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // password_hash NOT NULL 제약 조건 제거 (비밀번호 미설정 사용자 지원)
    await client.query(`
      ALTER TABLE users
        ALTER COLUMN password_hash DROP NOT NULL;
    `).catch(() => {
      // 이미 nullable인 경우 무시
    });

    console.log("DB 테이블 초기화 완료");
  } finally {
    client.release();
  }
}
