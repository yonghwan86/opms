import { chromium } from "playwright";
import type { Page } from "playwright";

const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";

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

// Parse the table on the current page, returning all cell values per company row
async function parseCompanyTable(page: Page): Promise<{
  weekKey: string | null;
  rows: Record<string, string[]>;
}> {
  const result = await page.evaluate((companies: string[]) => {
    // Extract period text for week key
    const body = document.body?.innerText || "";
    const periodMatch = body.match(/(\d{2})년\s*(\d{2})월\s*(\d+)주\s*~\s*(\d{2})년\s*(\d{2})월\s*(\d+)주/);
    const periodText = periodMatch ? periodMatch[0] : null;

    // Find the company price table
    const tables = document.querySelectorAll("table");
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length < 2) continue;

      const headerCells = Array.from(rows[0].querySelectorAll("td, th"))
        .map((c) => (c as HTMLElement).textContent?.trim() || "");

      const hasCompanyHeader = headerCells.some(
        (h) => h.includes("구분") || h.includes("정유사")
      );
      const hasPriceHeader = headerCells.some(
        (h) => h.includes("휘발유") || h.includes("경유") || h.includes("등유") || h.includes("가격")
      );
      if (!hasCompanyHeader || !hasPriceHeader) continue;

      const hasTargetCompany = rows.some((tr) => {
        const firstCell = tr.querySelector("td, th");
        const text = (firstCell as HTMLElement)?.textContent?.trim() || "";
        return companies.includes(text);
      });
      if (!hasTargetCompany) continue;

      const companyRows: Record<string, string[]> = {};
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("td, th")).map(
          (c) => (c as HTMLElement).textContent?.trim() || ""
        );
        if (cells.length > 0 && companies.includes(cells[0])) {
          companyRows[cells[0]] = cells.slice(1);
        }
      }

      return { weekKey: periodText, rows: companyRows };
    }
    return { weekKey: null, rows: {} };
  }, TARGET_COMPANIES);

  return {
    weekKey: result.weekKey ? deriveWeekKey(result.weekKey) : null,
    rows: result.rows,
  };
}

// Navigate to a fuel-type-specific page and extract the first numeric price per company
async function scrapeAdditionalFuelPage(
  page: Page,
  prodCd: string,
  label: string
): Promise<Record<string, number | null>> {
  try {
    const url = `https://www.opinet.co.kr/user/dopavcow/dopAvcowCompanyList.do?prodCd=${prodCd}`;
    console.log(`[WeeklySupplyScraper] ${label} 페이지 이동: ${url}`);
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(2000);

    const { rows } = await parseCompanyTable(page);
    const prices: Record<string, number | null> = {};

    for (const company of TARGET_COMPANIES) {
      const cells = rows[company] ?? [];
      // Find the first cell that parses as a valid price
      let price: number | null = null;
      for (const cell of cells) {
        const p = parsePrice(cell);
        if (p !== null) { price = p; break; }
      }
      prices[company] = price;
    }

    console.log(
      `[WeeklySupplyScraper] ${label} 파싱 완료:`,
      Object.entries(prices).map(([c, p]) => `${c}=${p}`).join(", ")
    );
    return prices;
  } catch (err) {
    console.warn(`[WeeklySupplyScraper] ${label} 페이지 파싱 실패 (무시):`, err instanceof Error ? err.message : String(err));
    return {};
  }
}

export async function scrapeWeeklySupplyPrices(): Promise<WeeklySupplyRow[]> {
  let browser;
  try {
    console.log("[WeeklySupplyScraper] 브라우저 시작");
    browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-setuid-sandbox",
        "--no-first-run",
        "--no-zygote",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--hide-scrollbars",
        "--metrics-recording-only",
        "--mute-audio",
        "--safebrowsing-disable-auto-update",
      ],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      locale: "ko-KR",
      acceptDownloads: true,
    });

    const page = await context.newPage();

    page.on("dialog", async (dialog) => {
      console.log(`[WeeklySupplyScraper] 다이얼로그 수락: ${dialog.message().substring(0, 80)}`);
      await dialog.accept();
    });

    console.log("[WeeklySupplyScraper] 1단계: 메인 페이지 방문 (세션 생성)");
    await page.goto("https://www.opinet.co.kr/user/main/mainView.do", {
      waitUntil: "load",
      timeout: 60000,
    });
    await page.waitForTimeout(5000);

    console.log("[WeeklySupplyScraper] 2단계: NetFunnel → 제품별 주간공급가격 페이지");
    const nav1 = page.waitForNavigation({ waitUntil: "load", timeout: 60000 });
    await page.evaluate(() => {
      (window as any).NetFunnel_Action({ action_id: "B3" }, function () {
        window.location.href = "/user/dopdavcow/dopAvcowSelect.do";
      });
    });
    await nav1;
    await page.waitForTimeout(3000);
    console.log("[WeeklySupplyScraper] 제품별 페이지 로딩 완료:", page.url());

    console.log("[WeeklySupplyScraper] 3단계: 회사별 탭 이동 (fnOpenURL) - 휘발유(B034)");
    const nav2 = page.waitForNavigation({ waitUntil: "load", timeout: 60000 });
    await page.evaluate(() => {
      (window as any).fnOpenURL("/user/dopavcow/dopAvcowCompanyList.do?prodCd=B034", "B3");
    });
    await nav2;
    await page.waitForTimeout(3000);
    console.log("[WeeklySupplyScraper] 휘발유 회사별 페이지 로딩 완료:", page.url());

    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || "");
    if (title.toLowerCase().includes("error") || bodyText.includes("The service is not available")) {
      throw new Error(`회사별 페이지 로딩 실패 (title: ${title}, body: ${bodyText.slice(0, 100)})`);
    }

    // ── 4단계: 휘발유 페이지 파싱 ────────────────────────────────────────────────
    console.log("[WeeklySupplyScraper] 4단계: 휘발유 테이블 데이터 파싱");
    const { weekKey: parsedWeekKey, rows: gasolineRows } = await parseCompanyTable(page);

    let weekStart: string;
    if (parsedWeekKey) {
      weekStart = parsedWeekKey;
      console.log(`[WeeklySupplyScraper] 페이지 기간에서 weekKey 산출: ${weekStart}`);
    } else {
      throw new Error("주차 기간 파싱 실패: 오피넷 페이지에서 주차 정보를 읽을 수 없습니다. 오피넷 미공표 또는 페이지 구조 변경 가능성");
    }

    // ── 5단계: 경유(D047) 페이지 파싱 ────────────────────────────────────────────
    const dieselPrices = await scrapeAdditionalFuelPage(page, "D047", "경유");

    // ── 6단계: 등유(C004) 페이지 파싱 ────────────────────────────────────────────
    const kerosenePrices = await scrapeAdditionalFuelPage(page, "C004", "등유");

    // ── 7단계: 결과 병합 ───────────────────────────────────────────────────────
    const results: WeeklySupplyRow[] = [];

    for (const company of TARGET_COMPANIES) {
      const cells = gasolineRows[company] ?? [];
      // 휘발유 페이지: col[0]=고급휘발유, col[1]=보통휘발유 (또는 col[0]=보통휘발유)
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

    // 누락된 회사 경고
    const found = results.filter((r) => r.gasoline !== null || r.diesel !== null).map((r) => r.company);
    const missing = TARGET_COMPANIES.filter((c) => !found.includes(c));
    if (missing.length > 0) {
      console.warn(`[WeeklySupplyScraper] 경고: 일부 정유사 데이터 없음 — 누락: [${missing.join(", ")}]`);
    }

    console.log(`[WeeklySupplyScraper] 파싱 완료: ${results.length}건 (기준주: ${weekStart})`);
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
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
