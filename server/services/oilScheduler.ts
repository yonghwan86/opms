import cron from "node-cron";
import { downloadOilPriceCSV } from "./oilScraper";
import { parseOilPriceCSV, toInsertOilPriceRaw } from "./oilParser";
import { runAnalysis } from "./oilAnalyzer";
import { storage } from "../storage";
import { sendPushToAll } from "./pushService";
import { fetchFuelAveragesWithRetry, setCachedFuelAverages } from "./opinetApi";

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

// 오전/오후 수집 각각 중복 푸시 방지 (당일 기준)
let lastMorningPushDate = "";
let lastAfternoonPushDate = "";

async function sendUserPush(dateKey: string, message: string, slot: "morning" | "afternoon"): Promise<void> {
  const guard = slot === "morning" ? lastMorningPushDate : lastAfternoonPushDate;
  if (guard === dateKey) {
    console.log(`[PushScheduler] ${slot === "morning" ? "오전" : "오후"} 푸시 이미 발송됨(${dateKey}), 건너뜀`);
    return;
  }
  try {
    const subs = await storage.getAllPushSubscriptions();
    if (subs.length === 0) {
      console.log("[PushScheduler] 구독자 없음, 건너뜀");
      if (slot === "morning") lastMorningPushDate = dateKey;
      else lastAfternoonPushDate = dateKey;
      return;
    }
    const payload = {
      title: "유가 모니터링",
      body: message,
      icon: "/icon-192.png",
      url: "/oil-prices",
    };
    const { sent, failed } = await sendPushToAll(subs, payload);
    if (slot === "morning") lastMorningPushDate = dateKey;
    else lastAfternoonPushDate = dateKey;
    console.log(`[PushScheduler] ${slot === "morning" ? "오전" : "오후"} 푸시 발송 완료: 성공 ${sent}건, 실패 ${failed}건`);
  } catch (err) {
    console.error("[PushScheduler] 푸시 발송 오류:", err);
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

    // CSV에 실제로 존재하는 날짜를 기준으로 분석 (오피넷 미게시 날짜 무시)
    const csvDates = [...new Set(rows.map((r) => r.date))].sort();
    const analysisToday = csvDates[csvDates.length - 1] ?? todayStr;
    const analysisYesterday = csvDates[csvDates.length - 2] ?? yesterdayStr;
    console.log(`[OilScheduler] 분석 기준일: ${analysisYesterday} → ${analysisToday} (CSV 내 날짜: ${csvDates.join(", ")})`);

    const analysisResults = runAnalysis(rows, analysisToday, analysisYesterday);
    await storage.saveOilPriceAnalysis(analysisResults);
    console.log(`[OilScheduler] 분석 저장 완료: ${analysisResults.length}건`);

    return {
      success: true,
      rawCount: insertRows.length,
      analysisCount: analysisResults.length,
      today: analysisToday,
      yesterday: analysisYesterday,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OilScheduler] 오류:", msg);
    return { success: false, rawCount: 0, analysisCount: 0, today: todayStr, yesterday: yesterdayStr, error: msg };
  }
}

function getMorningDates(): { today: string; yesterday: string } {
  const kstNow = getKSTNow();
  const kstYesterday = new Date(kstNow);
  kstYesterday.setUTCDate(kstYesterday.getUTCDate() - 1);
  const kstDayBefore = new Date(kstYesterday);
  kstDayBefore.setUTCDate(kstDayBefore.getUTCDate() - 1);
  return { today: getDateStr(kstYesterday), yesterday: getDateStr(kstDayBefore) };
}

interface RunJobOptions {
  source: string;
  slot: "morning" | "afternoon";
  pushMessage: string;
  notifyMasterOnSuccess?: boolean;
  jobDates?: { today: string; yesterday: string };
}

async function runWithRetryAndNotify(opts: RunJobOptions): Promise<void> {
  const { source, slot, pushMessage, notifyMasterOnSuccess = false, jobDates } = opts;
  const result = await runOilPriceJob(jobDates?.today, jobDates?.yesterday);
  console.log(`[OilScheduler] ${source} 수집 결과:`, result);

  if (result.success && result.analysisCount > 0) {
    await sendUserPush(result.today, pushMessage, slot);
    if (notifyMasterOnSuccess) {
      await sendMasterPush(`${source} 수집 성공`, `수집 완료: 원본 ${result.rawCount}건, 분석 ${result.analysisCount}건`);
    }
    return;
  }

  if (result.success && result.analysisCount === 0) {
    console.log(`[OilScheduler] ${source}: 원본은 받았으나 분석 데이터 0건 (오피넷 미제공 가능성), 10분 후 재시도`);
    await sendMasterPush("수집 주의", `${source}: 데이터 수집됐으나 분석 0건 — 10분 후 재시도합니다.`);
  } else {
    console.log(`[OilScheduler] ${source} 실패, 10분 후 재시도 예정`);
    await sendMasterPush("수집 실패", `${source}: 수집 실패 (${result.error ?? "오류 미상"}) — 10분 후 재시도합니다.`);
  }

  setTimeout(async () => {
    console.log(`[OilScheduler] ${source} 재시도 시작`);
    const retry = await runOilPriceJob(jobDates?.today, jobDates?.yesterday);
    console.log(`[OilScheduler] ${source} 재시도 결과:`, retry);

    if (retry.success && retry.analysisCount > 0) {
      await sendUserPush(retry.today, pushMessage, slot);
      if (notifyMasterOnSuccess) {
        await sendMasterPush(`${source} 재시도 성공`, `재시도 수집 완료: 원본 ${retry.rawCount}건, 분석 ${retry.analysisCount}건`);
      }
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

    // 오전 9:10 이전 → 9:15에 재확인
    if (kstHour < 9 || (kstHour === 9 && kstMinute < 10)) {
      const targetKST = new Date(kstNow);
      targetKST.setUTCHours(9, 15, 0, 0);
      const delayMs = targetKST.getTime() - kstNow.getTime();
      console.log(`[OilScheduler] 시작 복구: KST ${kstHour}:${String(kstMinute).padStart(2, "0")} (9:10 이전), ${Math.round(delayMs / 60000)}분 후 재확인`);
      setTimeout(() => checkAndRecoverOnStartup(), delayMs);
      return;
    }

    const kstYesterday = new Date(kstNow);
    kstYesterday.setUTCDate(kstYesterday.getUTCDate() - 1);
    const todayStr = getDateStr(kstNow);
    const yesterdayStr = getDateStr(kstYesterday);

    // 오후 16:00 이후 → 당일 잠정값도 확인
    if (kstHour >= 16) {
      const availableDates = await storage.getOilAvailableDates();
      const latestAvailable = availableDates[0];

      if (latestAvailable && latestAvailable >= todayStr) {
        console.log(`[OilScheduler] 시작 복구: DB 최신(${latestAvailable}) ≥ 오늘(${todayStr}), 수집 불필요`);
        return;
      }

      if (latestAvailable && latestAvailable >= yesterdayStr) {
        // 어제 확정값은 있지만 오늘 잠정값이 없음 → 오후 잠정 수집
        console.log(`[OilScheduler] 시작 복구(오후): 오늘(${todayStr}) 데이터 없음, 잠정값 수집 시작`);
        await runWithRetryAndNotify({
          source: "시작 복구(오후 잠정)",
          slot: "afternoon",
          pushMessage: "오늘 유가 데이터(잠정)가 업데이트되었습니다.",
          notifyMasterOnSuccess: true,
        });
      } else {
        // 어제 확정값도 없음 → 둘 다 수집
        console.log(`[OilScheduler] 시작 복구(오후): 어제(${yesterdayStr}) 데이터도 없음, 전체 수집 시작`);
        await runWithRetryAndNotify({
          source: "시작 복구(오전 확정)",
          slot: "morning",
          pushMessage: "전일 유가 확정값이 업데이트되었습니다.",
          notifyMasterOnSuccess: true,
          jobDates: getMorningDates(),
        });
        await runWithRetryAndNotify({
          source: "시작 복구(오후 잠정)",
          slot: "afternoon",
          pushMessage: "오늘 유가 데이터(잠정)가 업데이트되었습니다.",
          notifyMasterOnSuccess: false,
        });
      }
      return;
    }

    // 9:10 ~ 16:00 → 오전 확정값 무조건 수집 (잠정값이 이미 있어도 덮어씌움)
    console.log(`[OilScheduler] 시작 복구(오전): KST ${kstHour}시, 전날 확정값 수집 시작`);
    await runWithRetryAndNotify({
      source: "시작 복구(오전 확정)",
      slot: "morning",
      pushMessage: "전일 유가 확정값이 업데이트되었습니다.",
      notifyMasterOnSuccess: true,
      jobDates: getMorningDates(),
    });
  } catch (err) {
    console.error("[OilScheduler] 시작 복구 확인 오류:", err);
  }
}

async function fetchOpinetFuelAverages(isStartup = false): Promise<void> {
  console.log("[OpinetScheduler] 유류 평균 수집 시작");
  const retryDelay = isStartup ? 10 * 1000 : 5 * 60 * 1000;
  const result = await fetchFuelAveragesWithRetry(3, retryDelay);
  if (!result) {
    setCachedFuelAverages(null);
    console.warn("[OpinetScheduler] 유류 평균 수집 실패, 캐시 초기화 (DB fallback 사용)");
  }
}

export function startOilScheduler(): void {
  // 오전 9:10 — 전날 확정값 수집 (무조건 실행, 잠정값 덮어씌움)
  cron.schedule("10 9 * * *", async () => {
    console.log("[OilScheduler] 오전 수집 시작 (전날 확정값, 매일 09:10 KST)");
    await runWithRetryAndNotify({
      source: "오전 정기 수집",
      slot: "morning",
      pushMessage: "전일 유가 확정값이 업데이트되었습니다.",
      jobDates: getMorningDates(),
    });
  }, { timezone: "Asia/Seoul" });

  // 오후 16:10 — 당일 잠정값 수집 (오늘 데이터 없을 때만)
  cron.schedule("10 16 * * *", async () => {
    console.log("[OilScheduler] 오후 수집 확인 (당일 잠정값, 매일 16:10 KST)");
    const todayStr = getKSTDateStr();
    const availableDates = await storage.getOilAvailableDates();
    const latestAvailable = availableDates[0];

    if (latestAvailable && latestAvailable >= todayStr) {
      console.log(`[OilScheduler] 오후 수집 건너뜀: 오늘(${todayStr}) 데이터 이미 존재`);
      return;
    }

    console.log(`[OilScheduler] 오후 수집 시작: 오늘(${todayStr}) 데이터 없음`);
    await runWithRetryAndNotify({
      source: "오후 정기 수집",
      slot: "afternoon",
      pushMessage: "오늘 유가 데이터(잠정)가 업데이트되었습니다.",
    });
  }, { timezone: "Asia/Seoul" });

  cron.schedule("0 1,2,9,12,16,19 * * *", async () => {
    console.log("[OpinetScheduler] 정기 유류 평균 수집 (KST)");
    await fetchOpinetFuelAverages();
  }, { timezone: "Asia/Seoul" });

  console.log("[OilScheduler] 스케줄러 등록 완료 (오전 확정 09:10 / 오후 잠정 16:10 / 유류 평균 1,2,9,12,16,19시 KST)");

  setTimeout(() => checkAndRecoverOnStartup(), 5000);

  setTimeout(() => {
    console.log("[OpinetScheduler] 서버 시작 직후 유류 평균 즉시 수집");
    fetchOpinetFuelAverages(true);
  }, 3000);
}
