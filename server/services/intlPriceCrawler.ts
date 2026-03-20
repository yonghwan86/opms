import { db } from "../db";
import { sql } from "drizzle-orm";

function getKSTYesterday(): { year: number; month: number; day: number; dateStr: string } {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() - 1);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const dateStr = `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
  return { year, month, day, dateStr };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseKoreanMonthDay(text: string): { month: number; day: number } | null {
  const m = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (!m) return null;
  return { month: parseInt(m[1]), day: parseInt(m[2]) };
}

function inferYear(month: number, refYear: number, refMonth: number): number {
  if (month > refMonth) return refYear - 1;
  return refYear;
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function parseNumber(s: string): number | null {
  const v = parseFloat(s.replace(/,/g, "").trim());
  return isFinite(v) ? v : null;
}

interface PetronetPriceResult {
  gasoline: number | null;
  diesel: number | null;
  kerosene: number | null;
  date: string | null;
}

function extractLiPrice(html: string, elementId: string): number | null {
  const pos = html.indexOf(`id="${elementId}"`);
  if (pos < 0) return null;
  const liStart = html.lastIndexOf("<li", pos);
  const liEnd = html.indexOf("</li>", pos);
  if (liStart < 0 || liEnd < 0) return null;
  const block = html.slice(liStart, liEnd + 5);
  const m = block.match(/<p class="coast">([^<]+)<\/p>/);
  if (!m) return null;
  return parseNumber(m[1]);
}

async function fetchPetronetDataFromMain(): Promise<PetronetPriceResult | null> {
  const res = await fetch("https://www.petronet.co.kr/v4/main.jsp", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    console.warn(`[IntlPriceCrawler] main.jsp HTTP ${res.status}`);
    return null;
  }
  const html = await res.text();

  const gasoline = extractLiPrice(html, "textB007");
  const kerosene = extractLiPrice(html, "textC001");
  const diesel   = extractLiPrice(html, "textD009");

  // 날짜 추출 (YYYY.MM.DD 형식)
  const dateMatch = html.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  const date = dateMatch
    ? `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}`
    : null;

  console.log(`[IntlPriceCrawler] HTML 파싱 — 날짜:${date} 휘발유:${gasoline} 경유:${diesel} 등유:${kerosene}`);
  return { gasoline, diesel, kerosene, date };
}

export async function runIntlPriceCrawler(): Promise<void> {
  console.log(`[IntlPriceCrawler] 수집 시작 (Petronet main.jsp HTML 스크래핑)`);

  try {
    const data = await fetchPetronetDataFromMain();
    if (!data || data.date === null) {
      console.warn(`[IntlPriceCrawler] 데이터 파싱 실패 (날짜 없음)`);
      return;
    }
    if (data.gasoline === null && data.diesel === null && data.kerosene === null) {
      console.warn(`[IntlPriceCrawler] ${data.date} 가격 데이터 없음 (휴일 또는 미업로드)`);
      return;
    }
    const dateStr = data.date;
    await db.execute(sql`
      INSERT INTO intl_fuel_prices (date, gasoline, diesel, kerosene)
      VALUES (${dateStr}, ${data.gasoline}, ${data.diesel}, ${data.kerosene})
      ON CONFLICT (date) DO UPDATE SET
        gasoline = EXCLUDED.gasoline,
        diesel = EXCLUDED.diesel,
        kerosene = EXCLUDED.kerosene
    `);
    console.log(`[IntlPriceCrawler] ${dateStr} 저장 완료 — 휘발유:${data.gasoline} 경유:${data.diesel} 등유:${data.kerosene}`);
  } catch (err) {
    console.error(`[IntlPriceCrawler] 수집 실패:`, err);
  }
}

interface CsvUpsertResult {
  saved: number;
  dates: string[];
  startDate: string | null;
  endDate: string | null;
  error?: string;
}

export async function parseAndUpsertIntlCsvBase64(base64: string): Promise<CsvUpsertResult> {
  const buffer = Buffer.from(base64, "base64");
  let text = buffer.toString("utf-8").replace(/^\uFEFF/, "");
  if (!text.includes(",")) {
    const iconv = await import("iconv-lite");
    text = iconv.decode(buffer, "euc-kr").replace(/^\uFEFF/, "");
  }
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { saved: 0, dates: [], startDate: null, endDate: null };

  const SKIP_KEYWORDS = ["전일비", "전주비", "전월동일비", "전년동일비", "평균"];

  let saved = 0;
  const savedDates: string[] = [];

  let prevMonth = 0;
  let year = new Date().getFullYear();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const rawDate = (cols[0] ?? "").trim();
    if (!rawDate || SKIP_KEYWORDS.some(k => rawDate.includes(k))) continue;

    const md = parseKoreanMonthDay(rawDate);
    if (!md) continue;

    if (prevMonth > 0 && md.month < prevMonth) year++;
    prevMonth = md.month;

    const dateStr = `${year}${pad2(md.month)}${pad2(md.day)}`;
    const gasoline = parseNumber(cols[3] ?? "");
    const kerosene = parseNumber(cols[4] ?? "");
    const diesel = parseNumber(cols[6] ?? "");

    let rowError: unknown = null;
    try {
      await db.execute(sql`
        INSERT INTO intl_fuel_prices (date, gasoline, diesel, kerosene)
        VALUES (${dateStr}, ${gasoline}, ${diesel}, ${kerosene})
        ON CONFLICT (date) DO UPDATE SET
          gasoline = EXCLUDED.gasoline,
          diesel = EXCLUDED.diesel,
          kerosene = EXCLUDED.kerosene
      `);
      saved++;
      savedDates.push(dateStr);
    } catch (e) {
      rowError = e;
      console.error(`[IntlPriceCrawler] ${dateStr} upsert 실패:`, e);
    }
    if (rowError) {
      return { saved, dates: savedDates, error: `${dateStr} 처리 중 DB 오류 발생` };
    }
  }
  const startDate = savedDates.length > 0 ? savedDates[0] : null;
  const endDate = savedDates.length > 0 ? savedDates[savedDates.length - 1] : null;
  return { saved, dates: savedDates, startDate, endDate };
}
