import cron from "node-cron";
import { downloadOilPriceCSV } from "./oilScraper";
import { parseOilPriceCSV, toInsertOilPriceRaw } from "./oilParser";
import { runAnalysis } from "./oilAnalyzer";
import { storage } from "../storage";

function getDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export async function runOilPriceJob(today?: string, yesterday?: string): Promise<{
  success: boolean;
  rawCount: number;
  analysisCount: number;
  today: string;
  yesterday: string;
  error?: string;
}> {
  const now = new Date();
  const todayDate = new Date(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);

  const todayStr = today ?? getDateStr(todayDate);
  const yesterdayStr = yesterday ?? getDateStr(yesterdayDate);

  console.log(`[OilScheduler] 수집 시작: ${yesterdayStr} ~ ${todayStr}`);

  try {
    const buffer = await downloadOilPriceCSV(yesterdayStr, todayStr);
    if (!buffer) {
      return { success: false, rawCount: 0, analysisCount: 0, today: todayStr, yesterday: yesterdayStr, error: "CSV 다운로드 실패" };
    }

    const rows = parseOilPriceCSV(buffer);
    console.log(`[OilScheduler] 파싱 완료: ${rows.length}건`);

    const insertRows = toInsertOilPriceRaw(rows);
    await storage.saveOilPriceRaw(insertRows);
    console.log(`[OilScheduler] 원본 저장 완료: ${insertRows.length}건`);

    const analysisResults = runAnalysis(rows, todayStr, yesterdayStr);
    await storage.saveOilPriceAnalysis(analysisResults);
    console.log(`[OilScheduler] 분석 저장 완료: ${analysisResults.length}건`);

    return {
      success: true,
      rawCount: insertRows.length,
      analysisCount: analysisResults.length,
      today: todayStr,
      yesterday: yesterdayStr,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OilScheduler] 오류:", msg);
    return { success: false, rawCount: 0, analysisCount: 0, today: todayStr, yesterday: yesterdayStr, error: msg };
  }
}

export function startOilScheduler(): void {
  cron.schedule("10 9 * * *", async () => {
    console.log("[OilScheduler] 정기 수집 시작 (매일 오전 9시 10분)");
    const result = await runOilPriceJob();
    console.log("[OilScheduler] 정기 수집 완료:", result);
  }, {
    timezone: "Asia/Seoul",
  });
  console.log("[OilScheduler] 스케줄러 등록 완료 (매일 오전 9시 10분 KST)");
}
