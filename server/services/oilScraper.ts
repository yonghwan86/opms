import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const DOWNLOAD_PAGE =
  "https://www.opinet.co.kr/user/opdown/opDownload.do";
const DOWNLOAD_DIR = "/tmp/opinet_downloads";

export async function downloadOilPriceCSV(
  startDate: string,
  endDate: string
): Promise<Buffer | null> {
  let browser;

  try {
    if (!fs.existsSync(DOWNLOAD_DIR)) {
      fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    }

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
      acceptDownloads: true,
    });

    const page = await context.newPage();

    // confirm() 다이얼로그 자동 수락
    page.on("dialog", async (dialog) => {
      console.log(`[OilScraper] 다이얼로그 수락: ${dialog.message().substring(0, 80)}`);
      await dialog.accept();
    });

    console.log("[OilScraper] 페이지 로딩...");
    await page.goto(DOWNLOAD_PAGE, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });

    // NetFunnel(B1) 완료 대기 — fn_Download 함수가 로드될 때까지 (최대 5분)
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

    // 네이티브 다운로드 방식: fn_Download(6) 호출과 동시에 download 이벤트 대기 (최대 600초)
    console.log("[OilScraper] fn_Download(6) 호출 및 다운로드 대기 (최대 600초)...");
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 600000 }),
      page.evaluate(() => { (window as any).fn_Download(6); }),
    ]);

    const suggestedFilename = download.suggestedFilename() || `opinet_${startDate}.csv`;
    const savePath = path.join(DOWNLOAD_DIR, suggestedFilename);

    await download.saveAs(savePath);
    console.log(`[OilScraper] 파일 저장 완료: ${savePath}`);

    const csvBuffer = fs.readFileSync(savePath);
    console.log(`[OilScraper] 다운로드 완료: ${csvBuffer.byteLength} bytes`);

    try { fs.unlinkSync(savePath); } catch {}

    return csvBuffer;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OilScraper] 오류:", msg);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
