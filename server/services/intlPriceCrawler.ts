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

async function fetchPetronetData(
  year: number, month: number, day: number
): Promise<{ gasoline: number | null; diesel: number | null; kerosene: number | null } | null> {
  const y = String(year);
  const m = pad2(month);
  const d = pad2(day);
  const url =
    `https://www.petronet.co.kr/v4/excel/KDFQ0200_x.jsp` +
    `?term=d&bq=1&bw=01&by=${y}&bm=${m}&bd=${d}` +
    `&aq=1&aw=01&ay=${y}&am=${m}&ad=${d}` +
    `&ProdCDList=B007,C001,D009`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://www.petronet.co.kr/v4/sub.jsp",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    console.warn(`[IntlPriceCrawler] HTTP ${res.status}`);
    return null;
  }
  const html = await res.text();

  const trMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const tr of trMatches) {
    const cells = (tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) ?? []).map(td =>
      stripHtmlTags(td.replace(/<td[^>]*>/i, "").replace(/<\/td>/i, ""))
    );
    if (cells.length < 3) continue;
    const dateCell = cells.find(c => /\d{1,2}월\s*\d{1,2}일/.test(c));
    if (!dateCell) continue;
    const md = parseKoreanMonthDay(dateCell);
    if (!md || md.month !== month || md.day !== day) continue;

    const nums = cells
      .filter(c => /^[\d,.-]+$/.test(c.replace(/\s/g, "")))
      .map(parseNumber)
      .filter((n): n is number => n !== null && n > 0);

    if (nums.length < 3) continue;
    return { gasoline: nums[0], kerosene: nums[1], diesel: nums[2] };
  }
  return null;
}

export async function runIntlPriceCrawler(): Promise<void> {
  const { year, month, day, dateStr } = getKSTYesterday();
  console.log(`[IntlPriceCrawler] 수집 시작: ${dateStr} (전일)`);

  const existing = await db.execute(sql`SELECT date FROM intl_fuel_prices WHERE date = ${dateStr}`);
  if (existing.rows.length > 0) {
    console.log(`[IntlPriceCrawler] ${dateStr} 이미 존재 → 건너뜀`);
    return;
  }

  try {
    const data = await fetchPetronetData(year, month, day);
    if (!data || (data.gasoline === null && data.diesel === null && data.kerosene === null)) {
      console.warn(`[IntlPriceCrawler] ${dateStr} 데이터 없음 (휴일 또는 미업로드)`);
      return;
    }
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

export async function parseAndUpsertIntlCsvBase64(base64: string): Promise<{ saved: number; dates: string[] }> {
  const buffer = Buffer.from(base64, "base64");
  let text = buffer.toString("utf-8").replace(/^\uFEFF/, "");
  if (!text.includes(",")) {
    const iconv = await import("iconv-lite");
    text = iconv.decode(buffer, "euc-kr").replace(/^\uFEFF/, "");
  }
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { saved: 0, dates: [] };

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
    } catch { }
  }
  return { saved, dates: savedDates };
}
