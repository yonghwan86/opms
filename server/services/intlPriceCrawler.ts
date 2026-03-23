import { db } from "../db";
import { sql } from "drizzle-orm";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseKoreanMonthDay(text: string): { month: number; day: number } | null {
  const m = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (!m) return null;
  return { month: parseInt(m[1]), day: parseInt(m[2]) };
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
  wti: number | null;
  wtiChange: number | null;
  brent: number | null;
  brentChange: number | null;
  dubai: number | null;
  dubaiChange: number | null;
  date: string | null;
}

function extractLiPriceWithChange(html: string, elementId: string): { price: number | null; change: number | null } {
  const pos = html.indexOf(`id="${elementId}"`);
  if (pos < 0) return { price: null, change: null };
  const liStart = html.lastIndexOf("<li", pos);
  const liEnd = html.indexOf("</li>", pos);
  if (liStart < 0 || liEnd < 0) return { price: null, change: null };
  const block = html.slice(liStart, liEnd + 5);
  const priceMatch = block.match(/<p class="coast">([^<]+)<\/p>/);
  const price = priceMatch ? parseNumber(priceMatch[1]) : null;
  const upMatch = block.match(/<span class="gap_up">([^<]+)<\/span>/);
  const downMatch = block.match(/<span class="gap_down">([^<]+)<\/span>/);
  let change: number | null = null;
  if (upMatch) {
    const v = parseNumber(upMatch[1]);
    change = v !== null ? v : null;
  } else if (downMatch) {
    const v = parseNumber(downMatch[1]);
    change = v !== null ? -v : null;
  }
  return { price, change };
}

function extractLiPrice(html: string, elementId: string): number | null {
  return extractLiPriceWithChange(html, elementId).price;
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
  const wtiData   = extractLiPriceWithChange(html, "textWti");
  const brentData = extractLiPriceWithChange(html, "textBrent");
  const dubaiData = extractLiPriceWithChange(html, "textDubai");

  const dateMatch = html.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  const date = dateMatch
    ? `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}`
    : null;

  console.log(`[IntlPriceCrawler] HTML 파싱 — 날짜:${date} 휘발유:${gasoline} 경유:${diesel} 등유:${kerosene} WTI:${wtiData.price}(${wtiData.change}) Brent:${brentData.price}(${brentData.change}) Dubai:${dubaiData.price}(${dubaiData.change})`);
  return {
    gasoline, diesel, kerosene,
    wti: wtiData.price, wtiChange: wtiData.change,
    brent: brentData.price, brentChange: brentData.change,
    dubai: dubaiData.price, dubaiChange: dubaiData.change,
    date,
  };
}

export interface CrudeOilData {
  wti: { price: number; change: number; changePercent: number } | null;
  brent: { price: number; change: number; changePercent: number } | null;
  dubai: { price: number; change: number; changePercent: number } | null;
  date: string | null;
}

export async function getLatestCrudeOilPrices(): Promise<CrudeOilData> {
  try {
    const rows = await db.execute(sql`
      SELECT date, wti, brent, dubai, wti_change, brent_change, dubai_change
      FROM intl_fuel_prices
      WHERE wti IS NOT NULL OR brent IS NOT NULL OR dubai IS NOT NULL
      ORDER BY date DESC
      LIMIT 2
    `);
    const data = rows.rows as {
      date: string;
      wti: string | null; brent: string | null; dubai: string | null;
      wti_change: string | null; brent_change: string | null; dubai_change: string | null;
    }[];
    if (data.length === 0) return { wti: null, brent: null, dubai: null, date: null };

    const latest = data[0];
    const prev = data[1] ?? null;

    const compute = (
      curr: string | null,
      storedChange: string | null,
      prevVal: string | null,
    ) => {
      const p = curr ? parseFloat(curr) : null;
      if (p === null || !isFinite(p)) return null;
      // Petronet이 제공하는 변동값 우선 사용
      const sc = storedChange ? parseFloat(storedChange) : null;
      if (sc !== null && isFinite(sc)) {
        const prevPrice = p - sc;
        const changePercent = prevPrice !== 0 ? (sc / prevPrice) * 100 : 0;
        return { price: p, change: sc, changePercent };
      }
      // 저장된 변동값 없을 때 이전 행과 계산
      const pv = prevVal ? parseFloat(prevVal) : null;
      const change = pv !== null ? p - pv : null;
      const changePercent = pv !== null && pv !== 0 && change !== null ? (change / pv) * 100 : null;
      return { price: p, change: change ?? 0, changePercent: changePercent ?? 0 };
    };

    return {
      wti: compute(latest.wti, latest.wti_change, prev?.wti ?? null),
      brent: compute(latest.brent, latest.brent_change, prev?.brent ?? null),
      dubai: compute(latest.dubai, latest.dubai_change, prev?.dubai ?? null),
      date: latest.date,
    };
  } catch (e) {
    console.error("[IntlPriceCrawler] getLatestCrudeOilPrices 실패:", e);
    return { wti: null, brent: null, dubai: null, date: null };
  }
}

export async function runIntlPriceCrawler(): Promise<{ success: boolean; date: string | null }> {
  console.log(`[IntlPriceCrawler] 수집 시작 (Petronet main.jsp HTML 스크래핑)`);

  try {
    const data = await fetchPetronetDataFromMain();
    if (!data || data.date === null) {
      console.warn(`[IntlPriceCrawler] 데이터 파싱 실패 (날짜 없음)`);
      return { success: false, date: null };
    }
    const hasProduct = data.gasoline !== null || data.diesel !== null || data.kerosene !== null;
    const hasCrude   = data.wti !== null || data.brent !== null || data.dubai !== null;
    if (!hasProduct && !hasCrude) {
      console.warn(`[IntlPriceCrawler] ${data.date} 가격 데이터 없음 (휴일 또는 미업로드)`);
      return { success: false, date: data.date };
    }
    const dateStr = data.date;
    await db.execute(sql`
      INSERT INTO intl_fuel_prices (date, gasoline, diesel, kerosene, wti, brent, dubai, wti_change, brent_change, dubai_change)
      VALUES (${dateStr}, ${data.gasoline}, ${data.diesel}, ${data.kerosene}, ${data.wti}, ${data.brent}, ${data.dubai}, ${data.wtiChange}, ${data.brentChange}, ${data.dubaiChange})
      ON CONFLICT (date) DO UPDATE SET
        gasoline    = COALESCE(EXCLUDED.gasoline,    intl_fuel_prices.gasoline),
        diesel      = COALESCE(EXCLUDED.diesel,      intl_fuel_prices.diesel),
        kerosene    = COALESCE(EXCLUDED.kerosene,    intl_fuel_prices.kerosene),
        wti         = COALESCE(EXCLUDED.wti,         intl_fuel_prices.wti),
        brent       = COALESCE(EXCLUDED.brent,       intl_fuel_prices.brent),
        dubai       = COALESCE(EXCLUDED.dubai,       intl_fuel_prices.dubai),
        wti_change   = COALESCE(EXCLUDED.wti_change,   intl_fuel_prices.wti_change),
        brent_change = COALESCE(EXCLUDED.brent_change, intl_fuel_prices.brent_change),
        dubai_change = COALESCE(EXCLUDED.dubai_change, intl_fuel_prices.dubai_change)
    `);
    console.log(`[IntlPriceCrawler] ${dateStr} 저장 완료 — WTI:${data.wti}(${data.wtiChange}) Brent:${data.brent}(${data.brentChange}) Dubai:${data.dubai}(${data.dubaiChange})`);
    return { success: true, date: dateStr };
  } catch (err) {
    console.error(`[IntlPriceCrawler] 수집 실패:`, err);
    return { success: false, date: null };
  }
}

interface CsvUpsertResult {
  saved: number;
  dates: string[];
  startDate: string | null;
  endDate: string | null;
  error?: string;
}

// ─── DB 기반 원유 3종 히스토리 조회 ───────────────────────────────────────────
export async function getCrudeDbHistory(): Promise<{
  wti: { date: string; value: number }[];
  brent: { date: string; value: number }[];
  dubai: { date: string; value: number }[];
}> {
  const rows = await db.execute(sql`
    SELECT date, wti, brent, dubai
    FROM intl_fuel_prices
    WHERE date >= to_char(NOW() - INTERVAL '100 days', 'YYYYMMDD')
    ORDER BY date ASC
  `);
  const wti: { date: string; value: number }[] = [];
  const brent: { date: string; value: number }[] = [];
  const dubai: { date: string; value: number }[] = [];
  for (const r of rows.rows as any[]) {
    const raw = String(r.date ?? "");
    const isoDate = raw.length === 8
      ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
      : raw;
    if (r.wti != null)   wti.push({ date: isoDate, value: Number(r.wti) });
    if (r.brent != null) brent.push({ date: isoDate, value: Number(r.brent) });
    if (r.dubai != null) dubai.push({ date: isoDate, value: Number(r.dubai) });
  }
  return { wti, brent, dubai };
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
  let firstDataRow = true;

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
    const diesel = parseNumber(cols[5] ?? "") ?? parseNumber(cols[6] ?? "");

    if (firstDataRow) {
      console.log(`[IntlPriceCrawler] CSV 첫행 컬럼 디버그 — 날짜:${dateStr} cols:${cols.slice(0, 10).map((v, i) => `[${i}]${v.trim()}`).join(" ")}`);
      console.log(`[IntlPriceCrawler] 파싱결과 — 휘발유(col3):${gasoline} 등유(col4):${kerosene} 경유(col5/6):${diesel}`);
      firstDataRow = false;
    }

    let rowError: unknown = null;
    try {
      await db.execute(sql`
        INSERT INTO intl_fuel_prices (date, gasoline, diesel, kerosene)
        VALUES (${dateStr}, ${gasoline}, ${diesel}, ${kerosene})
        ON CONFLICT (date) DO UPDATE SET
          gasoline = EXCLUDED.gasoline,
          diesel = COALESCE(EXCLUDED.diesel, intl_fuel_prices.diesel),
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
