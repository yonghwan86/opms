import cron from "node-cron";
import { downloadOilPriceCSV } from "./oilScraper";
import { parseOilPriceCSV, toInsertOilPriceRaw } from "./oilParser";
import { runAnalysis } from "./oilAnalyzer";
import { storage } from "../storage";
import { sendPushToAll } from "./pushService";

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
  // 매일 오전 9시 10분 KST — 유가 CSV 수집 & DB 저장
  cron.schedule("10 9 * * *", async () => {
    console.log("[OilScheduler] 정기 수집 시작 (매일 오전 9시 10분)");
    const result = await runOilPriceJob();
    console.log("[OilScheduler] 정기 수집 완료:", result);
  }, { timezone: "Asia/Seoul" });

  // 매일 오전 9시 30분 KST — 구독자 전원 푸시 알림
  cron.schedule("30 9 * * *", async () => {
    console.log("[PushScheduler] 정기 푸시 발송 시작 (매일 오전 9시 30분)");
    try {
      const subs = await storage.getAllPushSubscriptions();
      if (subs.length === 0) {
        console.log("[PushScheduler] 구독자 없음, 건너뜀");
        return;
      }
      const payload = {
        title: "유가 모니터링",
        body: "오늘의 유가 데이터가 업데이트되었습니다.",
        icon: "/icon-192.png",
        url: "/oil-prices",
      };
      const { sent, failed } = await sendPushToAll(subs, payload);
      console.log(`[PushScheduler] 푸시 발송 완료: 성공 ${sent}건, 실패 ${failed}건`);
    } catch (err) {
      console.error("[PushScheduler] 푸시 발송 오류:", err);
    }
  }, { timezone: "Asia/Seoul" });

  console.log("[OilScheduler] 스케줄러 등록 완료 (수집: 오전 9시 10분 / 푸시: 오전 9시 30분 KST)");
}
