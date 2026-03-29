/**
 * gas_stations_master 초기 동기화 스크립트
 *
 * oil_price_raw 최근 7일 DISTINCT station_id 기준으로
 * gas_stations_master에 1회 bulk upsert를 수행합니다.
 *
 * 실행: npx tsx scripts/sync-gas-stations-master.ts
 */
import { pool } from '../server/db';
import { db } from '../server/db';
import { gasStationsMaster } from '../shared/schema';
import { sql } from 'drizzle-orm';

async function syncGasStationsMaster() {
  const client = await pool.connect();
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10).replace(/-/g, '');

    console.log(`[sync] oil_price_raw 기준 날짜: ${cutoffStr} 이후 7일치 DISTINCT 조회 중...`);

    const { rows } = await client.query<{
      station_id: string;
      station_name: string;
      sido: string;
      region: string;
    }>(`
      SELECT DISTINCT ON (station_id)
        station_id,
        station_name,
        sido,
        region
      FROM oil_price_raw
      WHERE date >= $1
      ORDER BY station_id, date DESC
    `, [cutoffStr]);

    console.log(`[sync] 조회된 주유소: ${rows.length}건 — bulk upsert 시작`);

    if (rows.length === 0) {
      console.log('[sync] upsert할 데이터 없음. 종료.');
      return;
    }

    // 단일 bulk upsert (파라미터 수: rows.length × 5 ≤ 65,535 확인)
    const paramCount = rows.length * 5;
    if (paramCount > 65535) {
      throw new Error(`파라미터 초과: ${paramCount} > 65,535. 데이터를 확인하세요.`);
    }

    await db.insert(gasStationsMaster).values(
      rows.map(r => ({
        stationId: r.station_id,
        stationName: r.station_name,
        sido: r.sido,
        region: r.region,
        updatedAt: new Date(),
      }))
    ).onConflictDoUpdate({
      target: gasStationsMaster.stationId,
      set: {
        stationName: sql`EXCLUDED.station_name`,
        sido: sql`EXCLUDED.sido`,
        region: sql`EXCLUDED.region`,
        updatedAt: sql`now()`,
      },
    });

    console.log(`[sync] gas_stations_master upserted: ${rows.length}건 완료`);
  } finally {
    client.release();
    await pool.end();
  }
}

syncGasStationsMaster().catch(err => {
  console.error('[sync] 오류:', err);
  process.exit(1);
});
