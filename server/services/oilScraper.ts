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
        "--single-process",
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

    // confirm() 다이얼로그 자동 수락 — fn_Download() 내부 confirm에서 필요
    page.on("dialog", async (dialog) => {
      console.log(`[OilScraper] 다이얼로그 수락: ${dialog.message().substring(0, 80)}`);
      await dialog.accept();
    });

    // CSV 응답 버퍼를 직접 캡처 (download 이벤트 대신 HTTP 응답 가로채기)
    let csvBuffer: Buffer | null = null;
    let csvCaptured = false;

    await page.route("**/*", async (route) => {
      const request = route.request();

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

        if (isCsv && !csvCaptured) {
          const body = await response.body();
          csvBuffer = Buffer.from(body);
          csvCaptured = true;
          console.log(
            `[OilScraper] CSV 응답 캡처: ${csvBuffer.byteLength} bytes, Content-Type: ${contentType}, URL: ${request.url().substring(0, 100)}`
          );
        }

        await route.fulfill({ response });
      } catch {
        await route.continue();
      }
    });

    console.log("[OilScraper] 페이지 로딩...");
    await page.goto(DOWNLOAD_PAGE, {
      waitUntil: "load",
      timeout: 60000,
    });

    // NetFunnel(B1) 완료 대기 — fn_Download 함수가 로드될 때까지
    await page
      .waitForFunction(
        () => typeof (window as any).fn_Download === "function",
        { timeout: 30000 }
      )
      .catch(() => {
        console.log("[OilScraper] fn_Download 함수 대기 타임아웃 — 계속 진행");
      });

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

    // fn_Download(6) 호출 후 최대 300초 동안 CSV 응답 대기
    console.log("[OilScraper] fn_Download(6) 호출...");
    await page.evaluate(() => {
      (window as any).fn_Download(6);
    });

    // CSV 캡처될 때까지 폴링 (300초 / 1초 간격)
    const deadline = Date.now() + 300_000;
    while (!csvCaptured && Date.now() < deadline) {
      await page.waitForTimeout(1000);
    }

    if (!csvCaptured || !csvBuffer) {
      console.error("[OilScraper] CSV 응답 미수신 (300초 초과)");
      return null;
    }

    console.log(`[OilScraper] 다운로드 완료: ${csvBuffer.byteLength} bytes`);
    return csvBuffer;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OilScraper] 오류:", msg);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
