import type { OilPriceRow } from "./oilParser";
import type { InsertOilPriceAnalysis } from "@shared/schema";

type FuelType = "gasoline" | "diesel" | "kerosene";
const FUEL_TYPES: FuelType[] = ["gasoline", "diesel", "kerosene"];
const FUEL_LABEL: Record<FuelType, string> = {
  gasoline: "휘발유",
  diesel: "경유",
  kerosene: "등유",
};

function getPrice(row: OilPriceRow, fuel: FuelType): number | null {
  if (fuel === "gasoline") return row.gasoline;
  if (fuel === "diesel") return row.diesel;
  if (fuel === "kerosene") return row.kerosene;
  return null;
}

function makeRecord(
  analysisDate: string,
  analysisType: string,
  subType: string,
  fuelType: string,
  rank: number,
  row: OilPriceRow,
  price: number | null,
  priceChange: number | null,
  priceDiff: number | null
): InsertOilPriceAnalysis {
  return {
    analysisDate,
    analysisType,
    subType,
    fuelType,
    rank,
    region: row.region,
    sido: row.sido,
    stationName: row.stationName,
    stationId: row.stationId,
    price,
    priceChange,
    priceDiff,
  };
}

export function runAnalysis(
  rows: OilPriceRow[],
  today: string,
  yesterday: string
): InsertOilPriceAnalysis[] {
  const results: InsertOilPriceAnalysis[] = [];

  const todayRows = rows.filter((r) => r.date === today);
  const yesterdayRows = rows.filter((r) => r.date === yesterday);
  const yesterdayMap = new Map<string, OilPriceRow>();
  for (const r of yesterdayRows) {
    yesterdayMap.set(r.stationId, r);
  }

  for (const fuel of FUEL_TYPES) {
    const fuelLabel = FUEL_LABEL[fuel];

    // ── 분석 1: MAX_MIN — 최고가 / 최저가 top 10 ──────────────────────────────
    const withPrice = todayRows
      .map((r) => ({ row: r, price: getPrice(r, fuel) }))
      .filter((x): x is { row: OilPriceRow; price: number } => x.price !== null);

    const sorted = [...withPrice].sort((a, b) => b.price - a.price);

    // 최고가 top 10
    sorted.slice(0, 10).forEach(({ row, price }, idx) => {
      results.push(makeRecord(today, "MAX_MIN", "HIGH", fuelLabel, idx + 1, row, price, null, null));
    });

    // 최저가 top 10 (역순)
    [...withPrice]
      .sort((a, b) => a.price - b.price)
      .slice(0, 10)
      .forEach(({ row, price }, idx) => {
        results.push(makeRecord(today, "MAX_MIN", "LOW", fuelLabel, idx + 1, row, price, null, null));
      });

    // ── 분석 2: CHANGE — 전일대비 가격변동 top 10 ─────────────────────────────
    const changes: { row: OilPriceRow; todayPrice: number; change: number }[] = [];
    for (const r of todayRows) {
      const todayPrice = getPrice(r, fuel);
      if (todayPrice === null) continue;
      const yRow = yesterdayMap.get(r.stationId);
      if (!yRow) continue;
      const yPrice = getPrice(yRow, fuel);
      if (yPrice === null) continue;
      const change = todayPrice - yPrice;
      if (change === 0) continue;
      changes.push({ row: r, todayPrice, change });
    }

    // 상승 top 10
    changes
      .filter((c) => c.change > 0)
      .sort((a, b) => b.change - a.change)
      .slice(0, 10)
      .forEach(({ row, todayPrice, change }, idx) => {
        results.push(makeRecord(today, "CHANGE", "RISE", fuelLabel, idx + 1, row, todayPrice, change, null));
      });

    // 하락 top 10
    changes
      .filter((c) => c.change < 0)
      .sort((a, b) => a.change - b.change)
      .slice(0, 10)
      .forEach(({ row, todayPrice, change }, idx) => {
        results.push(makeRecord(today, "CHANGE", "FALL", fuelLabel, idx + 1, row, todayPrice, change, null));
      });
  }

  // ── 분석 3: DIFF — 휘발유-경유 가격차이 top 10 ─────────────────────────────
  const diffs: { row: OilPriceRow; diff: number }[] = [];
  for (const r of todayRows) {
    const g = r.gasoline;
    const d = r.diesel;
    if (g === null || d === null) continue;
    diffs.push({ row: r, diff: g - d });
  }

  // 차이 큰 순 top 10
  diffs
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 10)
    .forEach(({ row, diff }, idx) => {
      results.push(
        makeRecord(today, "DIFF", "WIDE", "휘발유-경유", idx + 1, row, row.gasoline, null, diff)
      );
    });

  // 차이 작은 순 top 10
  [...diffs]
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 10)
    .forEach(({ row, diff }, idx) => {
      results.push(
        makeRecord(today, "DIFF", "NARROW", "휘발유-경유", idx + 1, row, row.gasoline, null, diff)
      );
    });

  return results;
}
