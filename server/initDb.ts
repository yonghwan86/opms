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

    // badge_count 컬럼 추가 — users 테이블 (기존 DB에 없을 경우만)
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS badge_count INTEGER NOT NULL DEFAULT 0;
    `);

    // intl_fuel_prices 테이블 생성 (국제 유류 제품가격)
    await client.query(`
      CREATE TABLE IF NOT EXISTS intl_fuel_prices (
        date VARCHAR(8) PRIMARY KEY,
        gasoline NUMERIC,
        diesel NUMERIC,
        kerosene NUMERIC,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    // 원유 3종 컬럼 추가 (기존 테이블에 없는 경우)
    await client.query(`ALTER TABLE intl_fuel_prices ADD COLUMN IF NOT EXISTS wti NUMERIC;`);
    await client.query(`ALTER TABLE intl_fuel_prices ADD COLUMN IF NOT EXISTS brent NUMERIC;`);
    await client.query(`ALTER TABLE intl_fuel_prices ADD COLUMN IF NOT EXISTS dubai NUMERIC;`);
    // Petronet 제공 전일 대비 변동값 컬럼
    await client.query(`ALTER TABLE intl_fuel_prices ADD COLUMN IF NOT EXISTS wti_change NUMERIC;`);
    await client.query(`ALTER TABLE intl_fuel_prices ADD COLUMN IF NOT EXISTS brent_change NUMERIC;`);
    await client.query(`ALTER TABLE intl_fuel_prices ADD COLUMN IF NOT EXISTS dubai_change NUMERIC;`);

    // oil_weekly_supply_prices 테이블 생성 (주간공급가격)
    await client.query(`
      CREATE TABLE IF NOT EXISTS oil_weekly_supply_prices (
        id SERIAL PRIMARY KEY,
        week VARCHAR(8) NOT NULL,
        company VARCHAR(50) NOT NULL,
        premium_gasoline NUMERIC(10, 2),
        gasoline NUMERIC(10, 2),
        diesel NUMERIC(10, 2),
        kerosene NUMERIC(10, 2),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS oil_weekly_supply_week_company_idx
        ON oil_weekly_supply_prices (week, company);
    `);

    // ── AI 유가 예측 테이블 신설 ──────────────────────────────────────────────

    // domestic_avg_price_history: 전국 일별 평균가 누적
    await client.query(`
      CREATE TABLE IF NOT EXISTS domestic_avg_price_history (
        id SERIAL PRIMARY KEY,
        date VARCHAR(8) NOT NULL UNIQUE,
        gasoline_avg NUMERIC,
        diesel_avg NUMERIC,
        kerosene_avg NUMERIC,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // exchange_rate_history: 원/달러 환율 이력
    await client.query(`
      CREATE TABLE IF NOT EXISTS exchange_rate_history (
        id SERIAL PRIMARY KEY,
        date VARCHAR(10) NOT NULL UNIQUE,
        rate NUMERIC NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // oil_price_forecasts: 예측 결과
    await client.query(`
      CREATE TABLE IF NOT EXISTS oil_price_forecasts (
        id SERIAL PRIMARY KEY,
        run_date VARCHAR(8) NOT NULL,
        target_date VARCHAR(8) NOT NULL,
        fuel_type VARCHAR(20) NOT NULL,
        scope VARCHAR(20) NOT NULL DEFAULT 'national',
        scope_id VARCHAR(50),
        forecast_price NUMERIC NOT NULL,
        forecast_lower NUMERIC,
        forecast_upper NUMERIC,
        actual_price NUMERIC,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT oil_price_forecasts_run_fuel_scope_target_idx
          UNIQUE (run_date, fuel_type, scope, scope_id, target_date)
      );
    `);

    // policy_events: 유류세 등 정책 이벤트
    await client.query(`
      CREATE TABLE IF NOT EXISTS policy_events (
        id SERIAL PRIMARY KEY,
        event_date VARCHAR(10) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // ai_forecast_logs: 예측 실행 이력
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_forecast_logs (
        id SERIAL PRIMARY KEY,
        run_at TIMESTAMP NOT NULL DEFAULT NOW(),
        status VARCHAR(20) NOT NULL,
        mape NUMERIC,
        anomaly_count INTEGER DEFAULT 0,
        duration_ms INTEGER,
        error_message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // ai_forecast_settings: 임계값 등 설정
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_forecast_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(50) NOT NULL UNIQUE,
        threshold_won NUMERIC,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // user_satisfactions 테이블에 comment 컬럼 추가 (기존 DB에 없는 경우)
    await client.query(`
      ALTER TABLE user_satisfactions
        ADD COLUMN IF NOT EXISTS comment VARCHAR(200);
    `);

    // public_access_logs 테이블 생성 (공개 대시보드 접속 로그)
    await client.query(`
      CREATE TABLE IF NOT EXISTS public_access_logs (
        id SERIAL PRIMARY KEY,
        accessed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        ip_address VARCHAR(50),
        device VARCHAR(10) NOT NULL DEFAULT 'pc',
        user_agent TEXT,
        endpoint VARCHAR(200) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS public_access_logs_accessed_at_idx ON public_access_logs (accessed_at);
    `);

    console.log("DB 테이블 초기화 완료");
  } finally {
    client.release();
  }
}
