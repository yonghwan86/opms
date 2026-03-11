import * as fs from "fs";
import * as path from "path";
import { parseOilPriceCSV, toInsertOilPriceRaw } from "../server/services/oilParser";
import { db } from "../server/db";
import { oilPriceRaw } from "../shared/schema";
import { sql } from "drizzle-orm";

const CSV_FILES = [
  "attached_assets/과거_판매가격(주유소)20260101-20260131_1773204553033.csv",
  "attached_assets/과거_판매가격(주유소)20260201-20260228_1773204553033.csv",
  "attached_assets/과거_판매가격(주유소)20260301-20260311_1773204553032.csv",
];

const CHUNK = 500;

async function main() {
  for (const filePath of CSV_FILES) {
    const label = path.basename(filePath);
    console.log(`\n▶ 처리 중: ${label}`);

    const buffer = fs.readFileSync(filePath);
    const rows = parseOilPriceCSV(buffer);
    console.log(`  파싱: ${rows.length.toLocaleString()}건`);

    const insertRows = toInsertOilPriceRaw(rows);
    let done = 0;

    for (let i = 0; i < insertRows.length; i += CHUNK) {
      const batch = insertRows.slice(i, i + CHUNK);
      await db
        .insert(oilPriceRaw)
        .values(batch)
        .onConflictDoUpdate({
          target: [oilPriceRaw.stationId, oilPriceRaw.date],
          set: {
            stationName: sql`EXCLUDED.station_name`,
            address: sql`EXCLUDED.address`,
            region: sql`EXCLUDED.region`,
            sido: sql`EXCLUDED.sido`,
            brand: sql`EXCLUDED.brand`,
            isSelf: sql`EXCLUDED.is_self`,
            premiumGasoline: sql`EXCLUDED.premium_gasoline`,
            gasoline: sql`EXCLUDED.gasoline`,
            diesel: sql`EXCLUDED.diesel`,
            kerosene: sql`EXCLUDED.kerosene`,
          },
        });
      done += batch.length;
      if (done % 10000 === 0) console.log(`  진행: ${done.toLocaleString()}/${insertRows.length.toLocaleString()}`);
    }
    console.log(`  ✓ 완료: ${done.toLocaleString()}건 upsert`);
  }

  const result = await db.execute(
    sql`SELECT date, COUNT(*) as cnt FROM oil_price_raw GROUP BY date ORDER BY date`
  );
  console.log("\n=== 날짜별 데이터 현황 ===");
  for (const row of result.rows) {
    console.log(`  ${row.date}: ${Number(row.cnt).toLocaleString()}건`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("임포트 실패:", e);
  process.exit(1);
});
