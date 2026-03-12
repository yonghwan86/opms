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

function getKSTNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function getKSTDateStr(): string {
  return getDateStr(getKSTNow());
}

function getKSTHour(): number {
  return getKSTNow().getUTCHours();
}

let lastUserPushDate = "";

async function sendUserPush(todayStr: string): Promise<void> {
  if (lastUserPushDate === todayStr) {
    console.log("[PushScheduler] 오늘 사용자 푸시 이미 발송됨, 건너뜀");
    return;
  }
  try {
    const subs = await storage.getAllPushSubscriptions();
    if (subs.length === 0) {
      console.log("[PushScheduler] 구독자 없음, 건너뜀");
      lastUserPushDate = todayStr;
      return;
    }
    const payload = {
      title: "유가 모니터링",
      body: "오늘의 유가 데이터가 업데이트되었습니다.",
      icon: "/icon-192.png",
      url: "/oil-prices",
    };
    const { sent, failed } = await sendPushToAll(subs, payload);
    lastUserPushDate = todayStr;
    console.log(`[PushScheduler] 사용자 푸시 발송 완료: 성공 ${sent}건, 실패 ${failed}건`);
  } catch (err) {
    console.error("[PushScheduler] 사용자 푸시 발송 오류:", err);
  }
}

async function sendMasterPush(title: string, body: string): Promise<void> {
  try {
    const subs = await storage.getMasterPushSubscriptions();
    if (subs.length === 0) return;
    const payload = { title, body, icon: "/icon-192.png", url: "/oil-prices" };
    const { sent, failed } = await sendPushToAll(subs, payload);
    console.log(`[PushScheduler] 마스터 푸시 발송: 성공 ${sent}건, 실패 ${failed}건`);
  } catch (err) {
    console.error("[PushScheduler] 마스터 푸시 발송 오류:", err);
  }
}

export async function runOilPriceJob(today?: string, yesterday?: string): Promise<{
  success: boolean;
  rawCount: number;
  analysisCount: number;
  today: string;
  yesterday: string;
  error?: string;
}> {
  const kstNow = getKSTNow();
  const kstYesterday = new Date(kstNow);
  kstYesterday.setUTCDate(kstYesterday.getUTCDate() - 1);

  const todayStr = today ?? getDateStr(kstNow);
  const yesterdayStr = yesterday ?? getDateStr(kstYesterday);

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

async function runWithRetryAndNotify(source: string, notifyMasterOnSuccess = false): Promise<void> {
  const result = await runOilPriceJob();
  console.log(`[OilScheduler] ${source} 수집 결과:`, result);

  if (result.success && result.analysisCount > 0) {
    await sendUserPush(result.today);
    if (notifyMasterOnSuccess) {
      await sendMasterPush(`${source} 수집 성공`, `수집 완료: 원본 ${result.rawCount}건, 분석 ${result.analysisCount}건`);
    }
    return;
  }

  if (result.success && result.analysisCount === 0) {
    console.log(`[OilScheduler] ${source}: 원본은 받았으나 분석 데이터 0건 (오피넷 미제공 가능성), 10분 후 재시도`);
  } else {
    console.log(`[OilScheduler] ${source} 실패, 10분 후 재시도 예정`);
  }

  setTimeout(async () => {
    console.log(`[OilScheduler] ${source} 재시도 시작`);
    const retry = await runOilPriceJob();
    console.log(`[OilScheduler] ${source} 재시도 결과:`, retry);

    if (retry.success && retry.analysisCount > 0) {
      await sendUserPush(retry.today);
    } else {
      await sendMasterPush(
        "유가 수집 최종 실패",
        `${source} 재시도까지 실패했습니다.\n오류: ${retry.error ?? `분석 ${retry.analysisCount}건`}\n수동 수집이 필요합니다.`,
      );
    }
  }, 10 * 60 * 1000);
}

async function checkAndRecoverOnStartup(): Promise<void> {
  try {
    const kstNow = getKSTNow();
    const kstHour = kstNow.getUTCHours();
    const kstMinute = kstNow.getUTCMinutes();
    if (kstHour < 9 || (kstHour === 9 && kstMinute < 10)) {
      const targetKST = new Date(kstNow);
      targetKST.setUTCHours(9, 15, 0, 0);
      const delayMs = targetKST.getTime() - kstNow.getTime();
      console.log(`[OilScheduler] 시작 복구: 현재 KST ${kstHour}:${String(kstMinute).padStart(2, "0")} (9:10 이전), ${Math.round(delayMs / 60000)}분 후 재확인 예약`);
      setTimeout(() => checkAndRecoverOnStartup(), delayMs);
      return;
    }

    const todayStr = getKSTDateStr();
    const analysis = await storage.getOilPriceAnalysis({ analysisDate: todayStr });

    if (analysis.length > 0) {
      console.log(`[OilScheduler] 시작 복구: 오늘(${todayStr}) 분석 데이터 ${analysis.length}건 존재, 수집 불필요`);
      return;
    }

    console.log(`[OilScheduler] 시작 복구: 오늘(${todayStr}) 분석 데이터 없음, 자동 수집 시작`);
    await runWithRetryAndNotify("시작 복구", true);
  } catch (err) {
    console.error("[OilScheduler] 시작 복구 확인 오류:", err);
  }
}

export function startOilScheduler(): void {
  cron.schedule("10 9 * * *", async () => {
    console.log("[OilScheduler] 정기 수집 시작 (매일 오전 9시 10분)");
    await runWithRetryAndNotify("정기 수집");
  }, { timezone: "Asia/Seoul" });

  console.log("[OilScheduler] 스케줄러 등록 완료 (수집: 오전 9시 10분 KST / 수집 성공 시 사용자 푸시 자동 발송)");

  setTimeout(() => checkAndRecoverOnStartup(), 5000);
}
