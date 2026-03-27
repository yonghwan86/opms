import { chromium } from "playwright";
import { existsSync, mkdirSync } from "fs";
import { readFile, unlink } from "fs/promises";
import path from "path";

const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const DOWNLOAD_PAGE =
  "https://www.opinet.co.kr/user/opdown/opDownload.do";
const DOWNLOAD_DIR = "/tmp/opinet_downloads";

export async function downloadOilPriceXLS(): Promise<Buffer | null> {
  let browser;

  try {
    if (!existsSync(DOWNLOAD_DIR)) {
      mkdirSync(DOWNLOAD_DIR, { recursive: true });
    }

    console.log("[OilScraper] 브라우저 시작 (현재판매가격 XLS)");
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
      console.log(`[OilScraper] 다이얼로그 수락: ${dialog.message().substring(0, 80)}`);
      await dialog.accept();
    });

    console.log("[OilScraper] 페이지 로딩...");
    await page.goto(DOWNLOAD_PAGE, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });

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

    console.log("[OilScraper] fn_Download(2) 호출 (사업자별 현재판매가격 엑셀) 및 다운로드 대기 (최대 600초)...");
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 600000 }),
      page.evaluate(() => { (window as any).fn_Download(2); }),
    ]);

    const suggestedFilename = download.suggestedFilename() || `opinet_current.xls`;
    const savePath = path.join(DOWNLOAD_DIR, suggestedFilename);

    await download.saveAs(savePath);
    console.log(`[OilScraper] 파일 저장 완료: ${savePath}`);

    const xlsBuffer = await readFile(savePath);
    console.log(`[OilScraper] 다운로드 완료: ${xlsBuffer.byteLength} bytes, 파일명: ${suggestedFilename}`);

    await unlink(savePath).catch(() => {});

    return xlsBuffer;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OilScraper] 오류:", msg);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
