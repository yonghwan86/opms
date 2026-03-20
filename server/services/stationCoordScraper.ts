import { db } from "../db";
import { sql } from "drizzle-orm";

let isRunning = false;
let progress = { total: 0, done: 0, failed: 0, status: "idle" as "idle" | "running" | "done" | "failed" };

export function getCoordScraperProgress() {
  return { ...progress };
}

async function fetchStationDetail(stationId: string, apiKey: string): Promise<{ gisX: number; gisY: number; stationName: string; region: string; sido: string } | null> {
  try {
    const url = `https://www.opinet.co.kr/api/detailById.do?out=json&code=${apiKey}&id=${stationId}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; kpetro-monitor/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const oil = json?.RESULT?.OIL?.[0];
    if (!oil || !oil.GIS_X_COOR || !oil.GIS_Y_COOR) return null;

    const gisX = parseFloat(oil.GIS_X_COOR);
    const gisY = parseFloat(oil.GIS_Y_COOR);
    if (!isFinite(gisX) || !isFinite(gisY) || gisX === 0 || gisY === 0) return null;

    const addr: string = oil.VAN_ADR ?? "";
    const parts = addr.trim().split(/\s+/);
    const sido = parts[0] ?? "";
    const sigungu = parts[1] ?? "";
    const region = sigungu ? `${sido} ${sigungu}` : sido;

    return { gisX, gisY, stationName: oil.OS_NM ?? stationId, region, sido };
  } catch {
    return null;
  }
}

async function batchProcess<T, R>(
  items: T[],
  fn: (item: T) => Promise<R | null>,
  concurrency: number,
  onProgress?: (done: number) => void,
): Promise<(R | null)[]> {
  const results: (R | null)[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
    if (onProgress) onProgress(Math.min(i + concurrency, items.length));
    await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

export async function runStationCoordScraper(): Promise<void> {
  if (isRunning) {
    console.log("[StationCoordScraper] 이미 실행 중");
    return;
  }
  const apiKey = process.env.OPINET_API_KEY;
  if (!apiKey) {
    console.error("[StationCoordScraper] OPINET_API_KEY 없음");
    progress = { total: 0, done: 0, failed: 0, status: "failed" };
    return;
  }

  isRunning = true;
  progress = { total: 0, done: 0, failed: 0, status: "running" };
  console.log("[StationCoordScraper] 시작");

  try {
    const rows = await db.execute(sql`
      SELECT DISTINCT station_id, station_name, region, sido
      FROM oil_price_raw
      WHERE station_id IS NOT NULL AND station_id != ''
      ORDER BY station_id
    `);

    const stations = rows.rows as { station_id: string; station_name: string; region: string; sido: string }[];
    progress.total = stations.length;
    console.log(`[StationCoordScraper] 수집 대상: ${stations.length}개 주유소`);

    let done = 0;
    let failed = 0;

    await batchProcess(
      stations,
      async (s) => {
        const detail = await fetchStationDetail(s.station_id, apiKey);
        if (detail) {
          try {
            await db.execute(sql`
              INSERT INTO gas_stations_master (station_id, station_name, gis_x, gis_y, region, sido, updated_at)
              VALUES (${s.station_id}, ${detail.stationName}, ${detail.gisX}, ${detail.gisY}, ${detail.region}, ${detail.sido}, NOW())
              ON CONFLICT (station_id) DO UPDATE SET
                station_name = EXCLUDED.station_name,
                gis_x = EXCLUDED.gis_x,
                gis_y = EXCLUDED.gis_y,
                region = EXCLUDED.region,
                sido = EXCLUDED.sido,
                updated_at = NOW()
            `);
            done++;
          } catch (e) {
            failed++;
          }
        } else {
          failed++;
        }
        progress.done = done;
        progress.failed = failed;
        return detail;
      },
      8,
      (n) => {
        if (n % 100 === 0) console.log(`[StationCoordScraper] ${n}/${stations.length} 처리 중...`);
      },
    );

    progress.status = "done";
    console.log(`[StationCoordScraper] 완료: 성공 ${done}개, 실패 ${failed}개`);
  } catch (err) {
    progress.status = "failed";
    console.error("[StationCoordScraper] 오류:", err);
  } finally {
    isRunning = false;
  }
}
