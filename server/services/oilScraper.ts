import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CHROMIUM_PATH =
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const DOWNLOAD_PAGE =
  "https://www.opinet.co.kr/user/opdown/opDownload.do";

export async function downloadOilPriceCSV(
  startDate: string,
  endDate: string
): Promise<Buffer | null> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "opinet-"));
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
      ],
    });

    const context = await browser.newContext({
      acceptDownloads: true,
      downloadsPath: tmpDir,
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

    console.log("[OilScraper] 페이지 로딩...");
    await page.goto(DOWNLOAD_PAGE, {
      waitUntil: "load",
      timeout: 30000,
    });

    // NetFunnel(B1) 완료 대기 — AJAX 콘텐츠(fn_Download 함수)가 로드될 때까지
    await page.waitForFunction(
      () => typeof (window as any).fn_Download === "function",
      { timeout: 20000 }
    ).catch(() => {
      console.log("[OilScraper] fn_Download 함수 대기 타임아웃 — 계속 진행");
    });

    console.log("[OilScraper] fn_Download 함수 확인 완료");

    // 날짜 필드 설정
    // form1.START_DT / END_DT (hidden, checkDate 검증용)
    // span_start_date_picker / span_end_date_picker (date range 계산용)
    await page.evaluate(
      ({ start, end }: { start: string; end: string }) => {
        const form = document.forms.namedItem("form1") as HTMLFormElement;
        if (form) {
          const startEl = form.elements.namedItem("START_DT") as HTMLInputElement | null;
          const endEl = form.elements.namedItem("END_DT") as HTMLInputElement | null;
          if (startEl) startEl.value = start;
          if (endEl) endEl.value = end;
        }
        // 날짜 범위 계산용 datepicker 필드
        const sp = document.getElementById("span_start_date_picker") as HTMLInputElement | null;
        const ep = document.getElementById("span_end_date_picker") as HTMLInputElement | null;
        if (sp) sp.value = start;
        if (ep) ep.value = end;
      },
      { start: startDate, end: endDate }
    );

    console.log(`[OilScraper] 날짜 설정: ${startDate} ~ ${endDate}`);

    // rdo4 라디오 버튼: 일별(X) 선택 확인 (과거판매가격 섹션)
    await page.evaluate(() => {
      const rdo4 = document.getElementById("rdo4") as HTMLInputElement | null;
      if (rdo4) rdo4.checked = true;
    });

    // 다운로드 이벤트를 먼저 등록한 후 fn_Download(6) 호출
    console.log("[OilScraper] fn_Download(6) 호출 + 다운로드 대기...");
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 150000 }),
      page.evaluate(() => {
        (window as any).fn_Download(6);
      }),
    ]);

    console.log(`[OilScraper] 다운로드 시작: ${download.suggestedFilename()}`);

    const downloadPath = await download.path();
    if (!downloadPath) {
      const failure = await download.failure();
      console.error("[OilScraper] 다운로드 실패:", failure);
      return null;
    }

    const buffer = fs.readFileSync(downloadPath);
    console.log(
      `[OilScraper] 다운로드 완료: ${buffer.byteLength} bytes, 파일명: ${download.suggestedFilename()}`
    );

    return buffer;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OilScraper] 오류:", msg);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
