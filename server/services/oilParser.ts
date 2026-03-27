import iconv from "iconv-lite";
import * as XLSX from "xlsx";
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

function parsePriceNum(val: unknown): number | null {
  if (val === undefined || val === null || val === "") return null;
  const n = typeof val === "number" ? Math.round(val) : parseInt(String(val).trim(), 10);
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

export function parseOilPriceXLS(buffer: Buffer): OilPriceRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // A2 셀: "기준일자 : 20260327" 에서 날짜 추출
  const a2Val = String(sheet["A2"]?.v ?? "").trim();
  const dateMatch = a2Val.match(/(\d{8})/);
  const date = dateMatch ? dateMatch[1] : "";

  if (!date) {
    console.warn("[OilParser] XLS A2 셀에서 날짜 추출 실패:", a2Val);
  } else {
    console.log(`[OilParser] XLS 기준일자: ${date}`);
  }

  // A1=제목, A2=기준일자, A3=빈행, A4=헤더, A5부터 데이터
  const rows: OilPriceRow[] = [];
  let rowIdx = 5;

  while (true) {
    const stationIdCell = sheet[`A${rowIdx}`];
    if (!stationIdCell) break;

    const stationId = String(stationIdCell.v ?? "").trim();
    if (!stationId) break;

    const region = String(sheet[`B${rowIdx}`]?.v ?? "").trim();
    const stationName = String(sheet[`C${rowIdx}`]?.v ?? "").trim();
    const address = String(sheet[`D${rowIdx}`]?.v ?? "").trim();
    const brand = String(sheet[`E${rowIdx}`]?.v ?? "").trim();
    const selfStr = String(sheet[`F${rowIdx}`]?.v ?? "").trim();
    const premiumRaw = sheet[`G${rowIdx}`]?.v;
    const gasolineRaw = sheet[`H${rowIdx}`]?.v;
    const dieselRaw = sheet[`I${rowIdx}`]?.v;
    const keroseneRaw = sheet[`J${rowIdx}`]?.v;

    rows.push({
      stationId,
      stationName,
      address,
      region,
      sido: extractSido(region),
      date,
      brand,
      isSelf: selfStr === "셀프",
      premiumGasoline: parsePriceNum(premiumRaw),
      gasoline: parsePriceNum(gasolineRaw),
      diesel: parsePriceNum(dieselRaw),
      kerosene: parsePriceNum(keroseneRaw),
    });

    rowIdx++;
  }

  console.log(`[OilParser] XLS 파싱 완료: ${rows.length}건 (기준일: ${date})`);
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
