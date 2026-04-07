import * as iconv from "iconv-lite";

const TARGET_COMPANIES = ["SK에너지", "GS칼텍스", "HD현대오일뱅크", "S-OIL"];

export interface WeeklySupplyRow {
  week: string;
  company: string;
  premiumGasoline: number | null;
  gasoline: number | null;
  diesel: number | null;
  kerosene: number | null;
}

function parsePrice(val: string | undefined): number | null {
  if (!val) return null;
  const cleaned = val.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === "") return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function getMostRecentWeekKey(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = String(kst.getUTCFullYear());
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const date = kst.getUTCDate();
  const firstOfMonth = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1));
  const firstDay = firstOfMonth.getUTCDay();
  const firstMonOfWeek1 = firstDay === 0 ? -5 : firstDay <= 1 ? 1 - firstDay + 1 : 1 - firstDay + 8;
  const weekNum = Math.ceil((date - firstMonOfWeek1 + 1) / 7);
  const ww = String(Math.max(1, weekNum)).padStart(2, "0");
  return `${yyyy}${mm}${ww}`;
}

function deriveWeekKey(periodText: string): string | null {
  const match = periodText.match(/(\d{2})년\s*(\d{2})월\s*(\d+)주/);
  if (!match) return null;
  const yyyy = String(2000 + parseInt(match[1], 10));
  const mm = match[2].padStart(2, "0");
  const ww = match[3].padStart(2, "0");
  return `${yyyy}${mm}${ww}`;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}

function parseTableFromHtml(
  html: string
): { weekKey: string | null; rows: Record<string, string[]> } {
  const periodMatch = html.match(
    /(\d{2})년\s*(\d{2})월\s*(\d+)주\s*~\s*(\d{2})년\s*(\d{2})월\s*(\d+)주/
  );
  const periodText = periodMatch ? periodMatch[0] : null;

  const rows: Record<string, string[]> = {};

  const trRegex = /<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const rowHtml = trMatch[1];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(stripTags(cellMatch[1]));
    }
    if (cells.length > 1 && TARGET_COMPANIES.includes(cells[0])) {
      rows[cells[0]] = cells.slice(1);
    }
  }

  return { weekKey: periodText, rows };
}

async function fetchOpinetPage(prodCd: string): Promise<string> {
  const url = `https://www.opinet.co.kr/user/dopavcow/dopAvcowCompanyList.do?prodCd=${prodCd}`;
  console.log(`[WeeklySupplyScraper] fetch: ${url}`);

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      Referer: "https://www.opinet.co.kr/user/main/mainView.do",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} (prodCd=${prodCd})`);

  const contentType = res.headers.get("content-type") || "";
  const buf = Buffer.from(await res.arrayBuffer());

  // Detect EUC-KR encoding
  if (/euc-kr|ks_c_5601/i.test(contentType)) {
    return iconv.decode(buf, "euc-kr");
  }
  const preview = buf.toString("binary", 0, 2000);
  if (/charset=EUC-KR|charset=ks_c/i.test(preview)) {
    return iconv.decode(buf, "euc-kr");
  }

  return buf.toString("utf-8");
}

export async function scrapeWeeklySupplyPrices(): Promise<WeeklySupplyRow[]> {
  try {
    // ── 1단계: 휘발유(B034) 페이지 fetch + 파싱 ─────────────────────────────
    console.log("[WeeklySupplyScraper] 1단계: 휘발유(B034) 페이지 fetch");
    const gasolineHtml = await fetchOpinetPage("B034");
    const { weekKey: parsedWeekKey, rows: gasolineRows } =
      parseTableFromHtml(gasolineHtml);

    console.log(
      `[WeeklySupplyScraper] 휘발유 파싱 — weekKey raw: ${parsedWeekKey}, 회사 수: ${Object.keys(gasolineRows).length}`
    );

    let weekStart: string;
    if (parsedWeekKey) {
      const derived = deriveWeekKey(parsedWeekKey);
      if (!derived)
        throw new Error(
          `weekKey 산출 실패: "${parsedWeekKey}" — 오피넷 미공표 또는 HTML 구조 변경`
        );
      weekStart = derived;
      console.log(`[WeeklySupplyScraper] weekKey 산출: ${weekStart}`);
    } else {
      throw new Error(
        "주차 기간 파싱 실패: 오피넷 페이지에서 주차 정보를 읽을 수 없습니다. " +
          "오피넷 미공표 또는 페이지 구조 변경 가능성"
      );
    }

    if (Object.keys(gasolineRows).length === 0) {
      throw new Error(
        "정유사 데이터 없음: 페이지가 JavaScript로 렌더링되거나 NetFunnel에 막혔을 가능성"
      );
    }

    // ── 2단계: 경유(D047) 페이지 fetch + 파싱 ─────────────────────────────
    console.log("[WeeklySupplyScraper] 2단계: 경유(D047) 페이지 fetch");
    const dieselPrices = await fetchFuelPrices("D047", "경유");

    // ── 3단계: 등유(C004) 페이지 fetch + 파싱 ─────────────────────────────
    console.log("[WeeklySupplyScraper] 3단계: 등유(C004) 페이지 fetch");
    const kerosenePrices = await fetchFuelPrices("C004", "등유");

    // ── 4단계: 결과 병합 ────────────────────────────────────────────────────
    const results: WeeklySupplyRow[] = [];

    for (const company of TARGET_COMPANIES) {
      const cells = gasolineRows[company] ?? [];
      let premiumGasoline: number | null = null;
      let gasoline: number | null = null;
      if (cells.length >= 2) {
        premiumGasoline = parsePrice(cells[0]);
        gasoline = parsePrice(cells[1]);
      } else if (cells.length === 1) {
        gasoline = parsePrice(cells[0]);
      }

      results.push({
        week: weekStart,
        company,
        premiumGasoline,
        gasoline,
        diesel: dieselPrices[company] ?? null,
        kerosene: kerosenePrices[company] ?? null,
      });
    }

    const found = results
      .filter((r) => r.gasoline !== null || r.diesel !== null)
      .map((r) => r.company);
    const missing = TARGET_COMPANIES.filter((c) => !found.includes(c));
    if (missing.length > 0) {
      console.warn(
        `[WeeklySupplyScraper] 경고: 일부 정유사 데이터 없음 — 누락: [${missing.join(", ")}]`
      );
    }

    console.log(
      `[WeeklySupplyScraper] 파싱 완료: ${results.length}건 (기준주: ${weekStart})`
    );
    results.forEach((r) =>
      console.log(
        `  ${r.company}: 고급=${r.premiumGasoline}, 보통=${r.gasoline}, 경유=${r.diesel}, 등유=${r.kerosene}`
      )
    );

    return results;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[WeeklySupplyScraper] 오류:", msg);
    throw err;
  }
}

async function fetchFuelPrices(
  prodCd: string,
  label: string
): Promise<Record<string, number | null>> {
  try {
    const html = await fetchOpinetPage(prodCd);
    const { rows } = parseTableFromHtml(html);
    const prices: Record<string, number | null> = {};

    for (const company of TARGET_COMPANIES) {
      const cells = rows[company] ?? [];
      let price: number | null = null;
      for (const cell of cells) {
        const p = parsePrice(cell);
        if (p !== null) {
          price = p;
          break;
        }
      }
      prices[company] = price;
    }

    console.log(
      `[WeeklySupplyScraper] ${label} 파싱 완료:`,
      Object.entries(prices)
        .map(([c, p]) => `${c}=${p}`)
        .join(", ")
    );
    return prices;
  } catch (err) {
    console.warn(
      `[WeeklySupplyScraper] ${label} 페이지 파싱 실패 (무시):`,
      err instanceof Error ? err.message : String(err)
    );
    return {};
  }
}
