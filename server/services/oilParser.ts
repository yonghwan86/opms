import iconv from "iconv-lite";
import type { InsertOilPriceRaw } from "@shared/schema";

export interface OilPriceRow {
  stationId: string;
  stationName: string;
  address: string;
  region: string;
  sido: string;
  date: string;
  brand: string;
  isSelf: boolean;
  premiumGasoline: number | null;
  gasoline: number | null;
  diesel: number | null;
  kerosene: number | null;
}

function parsePrice(val: string): number | null {
  const n = parseInt(val.trim(), 10);
  if (isNaN(n) || n === 0) return null;
  return n;
}

function extractSido(region: string): string {
  return region.trim().split(" ")[0] || region.trim();
}

export function parseOilPriceCSV(buffer: Buffer): OilPriceRow[] {
  const text = iconv.decode(buffer, "EUC-KR");
  const lines = text.split(/\r?\n/);
  const rows: OilPriceRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (i === 0) continue;
    if (line.startsWith('"기준')) continue;

    const cols = line
      .split(",")
      .map((c) => c.replace(/^"|"$/g, "").trim());

    if (cols.length < 11) continue;

    const [stationId, region, stationName, address, date, brand, selfStr, premiumRaw, gasolineRaw, dieselRaw, keroseneRaw] = cols;

    if (!stationId || !date || date.length !== 8) continue;

    rows.push({
      stationId,
      stationName,
      address,
      region,
      sido: extractSido(region),
      date,
      brand,
      isSelf: selfStr === "셀프",
      premiumGasoline: parsePrice(premiumRaw),
      gasoline: parsePrice(gasolineRaw),
      diesel: parsePrice(dieselRaw),
      kerosene: parsePrice(keroseneRaw),
    });
  }

  return rows;
}

export function toInsertOilPriceRaw(rows: OilPriceRow[]): InsertOilPriceRaw[] {
  return rows.map((r) => ({
    stationId: r.stationId,
    stationName: r.stationName,
    address: r.address,
    region: r.region,
    sido: r.sido,
    date: r.date,
    brand: r.brand,
    isSelf: r.isSelf,
    premiumGasoline: r.premiumGasoline,
    gasoline: r.gasoline,
    diesel: r.diesel,
    kerosene: r.kerosene,
  }));
}
