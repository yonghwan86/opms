import { chromium } from "playwright";

const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";

const TARGET_COMPANIES = ["SK에너지", "GS칼텍스", "HD현대오일뱅크", "S-OIL"];

export interface WeeklySupplyRow {
  weekStart: string;
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

function getMostRecentMonday(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(kst);
  monday.setUTCDate(kst.getUTCDate() - diff);
  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(monday.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function deriveWeekStartFromPeriod(periodText: string): string | null {
  const match = periodText.match(/(\d{2})년\s*(\d{2})월\s*(\d+)주/);
  if (!match) return null;

  const year = 2000 + parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const weekNum = parseInt(match[3], 10);

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstDay = firstOfMonth.getUTCDay();
  const firstMonday = firstDay <= 1
    ? 1 + (1 - firstDay)
    : 1 + (8 - firstDay);

  const targetDate = new Date(Date.UTC(year, month - 1, firstMonday + (weekNum - 1) * 7));
  const y = targetDate.getUTCFullYear();
  const m = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(targetDate.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
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

    console.log("[WeeklySupplyScraper] 3단계: 회사별 탭 이동 (fnOpenURL)");
    const nav2 = page.waitForNavigation({ waitUntil: "load", timeout: 60000 });
    await page.evaluate(() => {
      (window as any).fnOpenURL("/user/dopavcow/dopAvcowCompanyList.do", "B3");
    });
    await nav2;
    await page.waitForTimeout(3000);
    console.log("[WeeklySupplyScraper] 회사별 페이지 로딩 완료:", page.url());

    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || "");
    if (title.toLowerCase().includes("error") || bodyText.includes("The service is not available")) {
      throw new Error(`회사별 페이지 로딩 실패 (title: ${title}, body: ${bodyText.slice(0, 100)})`);
    }

    const periodText = await page.evaluate(() => {
      const body = document.body?.innerText || "";
      const match = body.match(/(\d{2})년\s*(\d{2})월\s*(\d+)주\s*~\s*(\d{2})년\s*(\d{2})월\s*(\d+)주/);
      return match ? match[0] : null;
    });
    console.log("[WeeklySupplyScraper] 조회 기간:", periodText || "(미확인)");

    let weekStart: string;
    if (periodText) {
      const derived = deriveWeekStartFromPeriod(periodText);
      if (derived) {
        weekStart = derived;
        console.log(`[WeeklySupplyScraper] 페이지 기간에서 weekStart 산출: ${weekStart}`);
      } else {
        weekStart = getMostRecentMonday();
        console.log(`[WeeklySupplyScraper] 기간 파싱 실패, 시스템 날짜 fallback: ${weekStart}`);
      }
    } else {
      weekStart = getMostRecentMonday();
      console.log(`[WeeklySupplyScraper] 기간 텍스트 없음, 시스템 날짜 fallback: ${weekStart}`);
    }

    console.log("[WeeklySupplyScraper] 4단계: 테이블 데이터 파싱");
    const tableData = await page.evaluate((targetCompanies: string[]) => {
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
          (h) => h.includes("휘발유") || h.includes("경유") || h.includes("등유")
        );
        if (!hasCompanyHeader || !hasPriceHeader) continue;

        const hasTargetCompany = rows.some((tr) => {
          const firstCell = tr.querySelector("td, th");
          const text = (firstCell as HTMLElement)?.textContent?.trim() || "";
          return targetCompanies.includes(text);
        });
        if (!hasTargetCompany) continue;

        return rows.map((tr) => {
          const cells = Array.from(tr.querySelectorAll("td, th"));
          return cells.map((c) => (c as HTMLElement).textContent?.trim() || "");
        });
      }
      return null;
    }, TARGET_COMPANIES);

    if (!tableData || tableData.length === 0) {
      throw new Error("대상 정유사 데이터가 포함된 테이블을 찾을 수 없음");
    }

    console.log(`[WeeklySupplyScraper] 테이블 행 수: ${tableData.length}`);

    const results: WeeklySupplyRow[] = [];

    for (const row of tableData) {
      if (row.length < 2) continue;
      const companyName = row[0]?.trim() ?? "";
      if (!TARGET_COMPANIES.includes(companyName)) continue;

      results.push({
        weekStart,
        company: companyName,
        premiumGasoline: parsePrice(row[1]),
        gasoline: parsePrice(row[2]),
        diesel: parsePrice(row[3]),
        kerosene: parsePrice(row[4]),
      });
    }

    if (results.length !== TARGET_COMPANIES.length) {
      const found = results.map((r) => r.company);
      const missing = TARGET_COMPANIES.filter((c) => !found.includes(c));
      console.warn(`[WeeklySupplyScraper] 경고: 일부 정유사 누락 — 발견: [${found.join(", ")}], 누락: [${missing.join(", ")}]`);
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
