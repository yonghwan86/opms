import { chromium } from "playwright";

const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const DOWNLOAD_PAGE =
  "https://www.opinet.co.kr/user/opdown/opDownload.do";

export async function downloadOilPriceCSV(
  startDate: string,
  endDate: string
): Promise<Buffer | null> {
  let browser;

  try {
    console.log(`[OilScraper] 브라우저 시작 (${startDate} ~ ${endDate})`);
    browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
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
    });

    const page = await context.newPage();

    // confirm() 다이얼로그 자동 수락
    page.on("dialog", async (dialog) => {
      console.log(`[OilScraper] 다이얼로그 수락: ${dialog.message().substring(0, 80)}`);
      await dialog.accept();
    });

    // 다운로드 URL만 타겟으로 route 등록 (전체 경로 인터셉트 시 페이지 로딩 저하 방지)
    // Opinet 실제 다운로드 URL: /user/main/main_download_csv_big.do
    let csvBuffer: Buffer | null = null;
    await page.route("**/*download*", async (route) => {
      try {
        const response = await route.fetch();
        const headers = response.headers();
        const contentType = headers["content-type"] || "";
        const contentDisposition = headers["content-disposition"] || "";

        const isCsv =
          contentType.includes("text/csv") ||
          contentType.includes("application/octet-stream") ||
          contentType.includes("application/download") ||
          contentType.includes("application/force-download") ||
          contentDisposition.toLowerCase().includes("attachment");

        if (isCsv) {
          const body = await response.body();
          csvBuffer = Buffer.from(body);
          console.log(
            `[OilScraper] CSV 응답 캡처: ${csvBuffer.byteLength} bytes, Content-Type: ${contentType}, URL: ${route.request().url().substring(0, 100)}`
          );
        }

        await route.fulfill({ response });
      } catch {
        await route.continue();
      }
    });

    console.log("[OilScraper] 페이지 로딩...");
    await page.goto(DOWNLOAD_PAGE, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });

    // NetFunnel(B1) 완료 대기 — fn_Download 함수가 로드될 때까지 (최대 5분)
    // 주의: waitForFunction(fn, arg, options) — arg에 undefined, 세 번째 인자에 timeout
    let fnReady = false;
    await page
      .waitForFunction(
        () => typeof (window as any).fn_Download === "function",
        undefined,
        { timeout: 300000 }
      )
      .then(() => { fnReady = true; })
      .catch(() => {});

    if (!fnReady) {
      throw new Error("fn_Download 함수 로드 실패 — NetFunnel 타임아웃 (5분 초과)");
    }

    console.log("[OilScraper] fn_Download 함수 확인 완료");

    // 날짜 필드 설정
    await page.evaluate(
      ({ start, end }: { start: string; end: string }) => {
        const form = document.forms.namedItem("form1") as HTMLFormElement;
        if (form) {
          const startEl = form.elements.namedItem("START_DT") as HTMLInputElement | null;
          const endEl = form.elements.namedItem("END_DT") as HTMLInputElement | null;
          if (startEl) startEl.value = start;
          if (endEl) endEl.value = end;
        }
        const sp = document.getElementById("span_start_date_picker") as HTMLInputElement | null;
        const ep = document.getElementById("span_end_date_picker") as HTMLInputElement | null;
        if (sp) sp.value = start;
        if (ep) ep.value = end;
      },
      { start: startDate, end: endDate }
    );

    console.log(`[OilScraper] 날짜 설정: ${startDate} ~ ${endDate}`);

    await page.evaluate(() => {
      const rdo4 = document.getElementById("rdo4") as HTMLInputElement | null;
      if (rdo4) rdo4.checked = true;
    });

    // fn_Download(6) 호출 후 최대 300초 폴링으로 CSV 캡처 대기
    console.log("[OilScraper] fn_Download(6) 호출...");
    await page.evaluate(() => {
      (window as any).fn_Download(6);
    });

    const deadline = Date.now() + 300_000;
    while (!csvBuffer && Date.now() < deadline) {
      await page.waitForTimeout(1000);
    }

    if (!csvBuffer) {
      console.error("[OilScraper] CSV 응답 미수신 (300초 초과)");
      return null;
    }

    console.log(`[OilScraper] 다운로드 완료: ${(csvBuffer as Buffer).byteLength} bytes`);
    return csvBuffer;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OilScraper] 오류:", msg);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
