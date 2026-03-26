import { db } from "./db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

interface IntlRow {
  date: string;
  wti: number | null;
  brent: number | null;
  dubai: number | null;
  gasoline: number | null;
  diesel: number | null;
  kerosene: number | null;
}

export async function seedHistoricalData(): Promise<void> {
  try {
    // 1. intl_fuel_prices 2025년 데이터 확인 후 삽입
    const intlCheck = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM intl_fuel_prices WHERE date LIKE '2025%'
    `);
    const intlCount = parseInt(String((intlCheck.rows[0] as any)?.cnt ?? "0"));

    if (intlCount < 200) {
      const seedPath = path.join(process.cwd(), "server", "data", "intl_fuel_2025_seed.json");
      if (fs.existsSync(seedPath)) {
        const rows: IntlRow[] = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
        let inserted = 0;
        for (const row of rows) {
          const result = await db.execute(sql`
            INSERT INTO intl_fuel_prices (date, wti, brent, dubai, gasoline, diesel, kerosene)
            VALUES (${row.date}, ${row.wti}, ${row.brent}, ${row.dubai}, ${row.gasoline}, ${row.diesel}, ${row.kerosene})
            ON CONFLICT (date) DO NOTHING
          `);
          inserted += (result as any).rowCount ?? 0;
        }
        console.log(`[SeedHistorical] intl_fuel_prices 2025년 ${inserted}행 삽입 완료 (기존 ${intlCount}행)`);
      } else {
        console.warn("[SeedHistorical] intl_fuel_2025_seed.json 파일 없음, 건너뜀");
      }
    } else {
      console.log(`[SeedHistorical] intl_fuel_prices 2025년 이미 ${intlCount}행 존재, 건너뜀`);
    }

    // 2. domestic_avg_price_history 2025년 데이터 확인 후 oil_price_raw 집계 삽입
    const domCheck = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM domestic_avg_price_history WHERE date LIKE '2025%'
    `);
    const domCount = parseInt(String((domCheck.rows[0] as any)?.cnt ?? "0"));

    if (domCount < 300) {
      const aggResult = await db.execute(sql`
        INSERT INTO domestic_avg_price_history (date, gasoline_avg, diesel_avg, kerosene_avg)
        SELECT
          date,
          ROUND(AVG(NULLIF(gasoline, 0))::numeric, 2) AS gasoline_avg,
          ROUND(AVG(NULLIF(diesel, 0))::numeric, 2)   AS diesel_avg,
          ROUND(AVG(NULLIF(kerosene, 0))::numeric, 2) AS kerosene_avg
        FROM oil_price_raw
        WHERE date LIKE '2025%'
        GROUP BY date
        HAVING COUNT(*) >= 100
        ON CONFLICT (date) DO NOTHING
      `);
      const domInserted = (aggResult as any).rowCount ?? 0;
      console.log(`[SeedHistorical] domestic_avg_price_history 2025년 ${domInserted}행 삽입 완료 (기존 ${domCount}행)`);
    } else {
      console.log(`[SeedHistorical] domestic_avg_price_history 2025년 이미 ${domCount}행 존재, 건너뜀`);
    }
  } catch (err) {
    console.error("[SeedHistorical] 이력 데이터 시드 실패:", err);
  }
}
