import cron from "node-cron";
import { downloadOilPriceXLS } from "./oilScraper";
import { parseOilPriceXLS, toInsertOilPriceRaw, type OilPriceRow } from "./oilParser";
import { runAnalysis } from "./oilAnalyzer";
import { storage } from "../storage";
import { sendPushToAll } from "./pushService";
import { fetchFuelAveragesWithRetry, setCachedFuelAverages } from "./opinetApi";
import { scrapeWeeklySupplyPrices } from "./weeklySupplyScraper";
import { isKoreanHoliday } from "./koreanHoliday";
import { db } from "../db";
import { sql } from "drizzle-orm";

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
    const { sent, failed, expiredEndpoints } = await sendPushToAll(subs, payload);
    if (slot === "morning") lastMorningPushDate = dateKey;
    else lastAfternoonPushDate = dateKey;
    if (expiredEndpoints.length > 0) {
      await Promise.all(expiredEndpoints.map((ep) => storage.deletePushSubscription(ep)));
      console.log(`[PushScheduler] 만료된 구독 ${expiredEndpoints.length}건 자동 삭제`);
    }
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
    const { sent, failed, expiredEndpoints } = await sendPushToAll(subs, payload);
    if (expiredEndpoints.length > 0) {
      await Promise.all(expiredEndpoints.map((ep) => storage.deletePushSubscription(ep)));
      console.log(`[PushScheduler] 만료된 마스터 구독 ${expiredEndpoints.length}건 자동 삭제`);
    }
    console.log(`[PushScheduler] 마스터 푸시 발송: 성공 ${sent}건, 실패 ${failed}건`);
  } catch (err) {
    console.error("[PushScheduler] 마스터 푸시 발송 오류:", err);
  }
}

function dbRawToOilPriceRow(r: {
  stationId: string;
  stationName: string;
  address: string | null;
  region: string;
  sido: string;
  date: string;
  brand: string | null;
  isSelf: boolean;
  premiumGasoline: number | null;
  gasoline: number | null;
  diesel: number | null;
  kerosene: number | null;
}): OilPriceRow {
  return {
    stationId: r.stationId,
    stationName: r.stationName,
    address: r.address ?? "",
    region: r.region,
    sido: r.sido,
    date: r.date,
    brand: r.brand ?? "",
    isSelf: r.isSelf,
    premiumGasoline: r.premiumGasoline ?? null,
    gasoline: r.gasoline ?? null,
    diesel: r.diesel ?? null,
    kerosene: r.kerosene ?? null,
  };
}

async function runAnalysisWithDbRetry(
  allRows: OilPriceRow[],
  analysisToday: string,
  analysisYesterday: string,
  maxAttempts = 3,
  retryDelayMs = 30_000,
): Promise<number> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const analysisResults = runAnalysis(allRows, analysisToday, analysisYesterday);
      await storage.saveOilPriceAnalysis(analysisResults);
      if (attempt > 1) {
        console.log(`[OilScheduler] 분석 저장 ${attempt}차 시도 성공: ${analysisResults.length}건`);
      }
      return analysisResults.length;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        console.warn(`[OilScheduler] 분석 저장 ${attempt}차 실패 (${msg}), ${retryDelayMs / 1000}초 후 재시도`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      } else {
        throw err;
      }
    }
  }
  return 0;
}

export async function runAnalysisOnlyFromDB(targetDate: string, yesterdayDate: string, jobType = "reanalyze"): Promise<{
  success: boolean;
  analysisCount: number;
  error?: string;
}> {
  console.log(`[OilScheduler] DB 원본 분석 재실행: ${yesterdayDate} → ${targetDate}`);
  const analysisStart = Date.now();
  try {
    const todayRaw = await storage.getOilPriceRawByDate(targetDate);
    if (todayRaw.length === 0) {
      await storage.saveOilCollectionLog({ jobType, status: "failed", targetDate, yesterdayDate, rawCount: 0, analysisCount: 0, errorMessage: `DB에 ${targetDate} 원본 데이터 없음` });
      return { success: false, analysisCount: 0, error: `DB에 ${targetDate} 원본 데이터 없음` };
    }
    const yesterdayRaw = await storage.getOilPriceRawByDate(yesterdayDate);
    const allRows = [...todayRaw.map(dbRawToOilPriceRow), ...yesterdayRaw.map(dbRawToOilPriceRow)];
    console.log(`[OilScheduler] DB 원본: 오늘 ${todayRaw.length}건, 어제 ${yesterdayRaw.length}건`);
    const analysisCount = await runAnalysisWithDbRetry(allRows, targetDate, yesterdayDate);
    const analysisDurationMs = Date.now() - analysisStart;
    console.log(`[OilScheduler] DB 원본 분석 저장 완료: ${analysisCount}건 (${analysisDurationMs}ms)`);
    await storage.saveOilCollectionLog({ jobType, status: "success", targetDate, yesterdayDate, rawCount: todayRaw.length, analysisCount, analysisDurationMs });
    return { success: true, analysisCount };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OilScheduler] DB 원본 분석 오류:", msg);
    await storage.saveOilCollectionLog({ jobType, status: "failed", targetDate, yesterdayDate, analysisDurationMs: Date.now() - analysisStart, errorMessage: msg });
    return { success: false, analysisCount: 0, error: msg };
  }
}

export async function runOilPriceJob(today?: string, yesterday?: string, jobType = "manual"): Promise<{
  success: boolean;
  rawSaved: boolean;
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

  console.log(`[OilScheduler] 수집 시작: ${todayStr} (1일치)`);

  let rawSaved = false;
  let rawCount = 0;
  let analysisToday = todayStr;
  const analysisYesterday = yesterdayStr;
  const rawStart = Date.now();
  let rawDurationMs: number | undefined;
  let analysisDurationMs: number | undefined;

  try {
    const buffer = await downloadOilPriceXLS();
    if (!buffer) {
      await storage.saveOilCollectionLog({ jobType, status: "failed", targetDate: todayStr, yesterdayDate: yesterdayStr, rawCount: 0, analysisCount: 0, errorMessage: "XLS 다운로드 실패" });
      return { success: false, rawSaved: false, rawCount: 0, analysisCount: 0, today: todayStr, yesterday: yesterdayStr, error: "XLS 다운로드 실패" };
    }

    const rows = parseOilPriceXLS(buffer);
    console.log(`[OilScheduler] 파싱 완료: ${rows.length}건`);

    const insertRows = toInsertOilPriceRaw(rows);
    await storage.saveOilPriceRaw(insertRows);
    rawCount = insertRows.length;
    rawSaved = true;
    rawDurationMs = Date.now() - rawStart;
    console.log(`[OilScheduler] 원본 저장 완료: ${rawCount}건 (${rawDurationMs}ms)`);

    const csvDates = [...new Set(rows.map((r) => r.date))].sort();
    analysisToday = csvDates[csvDates.length - 1] ?? todayStr;

    const dbYesterdayRaw = await storage.getOilPriceRawByDate(analysisYesterday);
    const dbYesterdayRows = dbYesterdayRaw.map(dbRawToOilPriceRow);
    console.log(`[OilScheduler] 분석 기준일: ${analysisYesterday} → ${analysisToday} (DB 어제 ${dbYesterdayRows.length}건 보완)`);

    const analysisStart = Date.now();
    const allRows = [...rows, ...dbYesterdayRows];
    const analysisCount = await runAnalysisWithDbRetry(allRows, analysisToday, analysisYesterday);
    analysisDurationMs = Date.now() - analysisStart;
    console.log(`[OilScheduler] 분석 저장 완료: ${analysisCount}건 (${analysisDurationMs}ms)`);

    await storage.saveOilCollectionLog({ jobType, status: "success", targetDate: analysisToday, yesterdayDate: analysisYesterday, rawCount, analysisCount, rawDurationMs, analysisDurationMs });

    return {
      success: true,
      rawSaved: true,
      rawCount,
      analysisCount,
      today: analysisToday,
      yesterday: analysisYesterday,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[OilScheduler] 오류:", msg);
    const status = rawSaved ? "partial" : "failed";
    await storage.saveOilCollectionLog({ jobType, status, targetDate: analysisToday, yesterdayDate: analysisYesterday, rawCount, analysisCount: 0, rawDurationMs, analysisDurationMs, errorMessage: msg });
    return { success: false, rawSaved, rawCount, analysisCount: 0, today: analysisToday, yesterday: analysisYesterday, error: msg };
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

// ─── 슬롯별 중복 실행 방지 잠금 ───────────────────────────────────────────────
const collectionStartedAt: Record<string, number | null> = {
  morning: null,
  afternoon: null,
};
const COLLECTION_LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15분 — stuck 시 자동 해제
const COLLECTION_HEARTBEAT_MS = 5 * 60 * 1000;     // 5분마다 타임스탬프 갱신 (재시도 대기 중 만료 방지)

function isSlotRunning(slot: string): boolean {
  const startedAt = collectionStartedAt[slot];
  if (!startedAt) return false;
  if (Date.now() - startedAt > COLLECTION_LOCK_TIMEOUT_MS) {
    console.warn(`[OilScheduler] ${slot} 수집 잠금 타임아웃 초과(15분) — 자동 해제`);
    collectionStartedAt[slot] = null;
    return false;
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// ──────────────────────────────────────────────────────────────────────────────

async function runWithRetryAndNotify(opts: RunJobOptions): Promise<void> {
  const { slot } = opts;

  if (isSlotRunning(slot)) {
    const elapsed = Math.round((Date.now() - collectionStartedAt[slot]!) / 1000);
    console.log(`[OilScheduler] ${slot} 수집 이미 진행 중 (${elapsed}초 경과) — 중복 실행 방지 skip`);
    return;
  }

  collectionStartedAt[slot] = Date.now();

  // 하트비트: 5분마다 타임스탬프 갱신 → 재시도 대기(10분) 중 15분 timeout 조기 해제 방지
  const heartbeat = setInterval(() => {
    if (collectionStartedAt[slot] !== null) {
      collectionStartedAt[slot] = Date.now();
    }
  }, COLLECTION_HEARTBEAT_MS);

  try {
    await runCollectionWithRetries(opts);
  } finally {
    clearInterval(heartbeat);
    collectionStartedAt[slot] = null;
  }
}

async function runCollectionWithRetries(opts: RunJobOptions): Promise<void> {
  const { source, slot, pushMessage, notifyMasterOnSuccess = false, jobDates } = opts;
  const baseJobType = slot === "morning" ? "scheduled_morning" : "scheduled_afternoon";
  const result = await runOilPriceJob(jobDates?.today, jobDates?.yesterday, baseJobType);
  console.log(`[OilScheduler] ${source} 수집 결과:`, result);

  if (result.success && result.analysisCount > 0) {
    await sendUserPush(result.today, pushMessage, slot);
    if (notifyMasterOnSuccess) {
      await sendMasterPush(`${source} 수집 성공`, `수집 완료: 원본 ${result.rawCount}건, 분석 ${result.analysisCount}건`);
    }
    // AI 예측 트리거: 수집 성공 시 당일 예측 미완료이면 실행
    try {
      const { runIfNotDoneToday, checkPriceChangeAlert } = await import("./forecastService");
      setImmediate(() => {
        runIfNotDoneToday().catch((e) => console.error("[OilScheduler] forecastService 오류:", e));
        checkPriceChangeAlert(result.today).catch((e) => console.error("[OilScheduler] 가격변동 알림 오류:", e));
      });
    } catch (e) {
      console.error("[OilScheduler] forecastService import 오류:", e);
    }
    return;
  }

  // 원본은 저장됐지만 분석 실패 → 분석만 재시도 (Chrome 불필요)
  const analysisFailed = result.rawSaved && !result.success;

  if (result.success && result.analysisCount === 0) {
    console.log(`[OilScheduler] ${source}: 원본은 받았으나 분석 데이터 0건 (오피넷 미제공 가능성), 10분 후 재시도`);
    await sendMasterPush("수집 주의", `${source}: 데이터 수집됐으나 분석 0건 — 10분 후 재시도합니다.`);
  } else if (analysisFailed) {
    console.log(`[OilScheduler] ${source}: 원본 저장 성공, 분석만 실패 (${result.error ?? "오류 미상"}) — 분석만 재시도합니다.`);
    await sendMasterPush("분석 저장 실패", `${source}: 원본 ${result.rawCount}건 저장 성공, 분석 저장 실패 (${result.error ?? "오류 미상"}) — 분석만 재시도합니다.`);
  } else {
    console.log(`[OilScheduler] ${source} 실패, 10분 후 재시도 예정`);
    await sendMasterPush("수집 실패", `${source}: 수집 실패 (${result.error ?? "오류 미상"}) — 10분 후 재시도합니다.`);
  }

  const retryFn = async (label: string, retryJobType: string) => {
    if (analysisFailed || result.rawSaved) {
      // 원본이 DB에 있으면 분석만 재실행
      console.log(`[OilScheduler] ${source} ${label}: 분석만 재실행 (DB 원본 사용)`);
      return runAnalysisOnlyFromDB(result.today, result.yesterday, retryJobType);
    }
    // 원본 저장도 실패했으면 전체 재수집
    console.log(`[OilScheduler] ${source} ${label}: 전체 재수집`);
    return runOilPriceJob(jobDates?.today, jobDates?.yesterday, retryJobType);
  };

  // 재시도 전에 다른 경로로 이미 수집 성공했는지 DB 확인
  const checkAlreadySucceeded = async (): Promise<boolean> => {
    try {
      if (slot === "morning") {
        // 오늘 09:30 KST(= 00:30 UTC) 이후 성공 로그 존재 여부
        const cutoffUTC = new Date(getKSTNow());
        cutoffUTC.setUTCHours(0, 30, 0, 0);
        return await storage.hasSuccessfulMorningLog(result.today, cutoffUTC);
      } else {
        // 오후: 오늘 날짜 데이터가 DB에 존재하면 성공
        const availableDates = await storage.getOilAvailableDates();
        return availableDates.length > 0 && availableDates[0] >= result.today;
      }
    } catch {
      return false;
    }
  };

  // 1차 재시도 (10분 후) — await sleep으로 잠금 유지 (setTimeout 중첩 방식 대비 공백 없음)
  await sleep(10 * 60 * 1000);
  if (await checkAlreadySucceeded()) {
    console.log(`[OilScheduler] ${source} 1차 재시도 건너뜀 — 다른 경로로 이미 수집 성공됨 (${result.today})`);
    return;
  }
  console.log(`[OilScheduler] ${source} 1차 재시도 시작`);
  const retry1 = await retryFn("1차 재시도", `${baseJobType}_retry1`);
  console.log(`[OilScheduler] ${source} 1차 재시도 결과:`, retry1);

  if (retry1.success && retry1.analysisCount > 0) {
    await sendUserPush(result.today, pushMessage, slot);
    await sendMasterPush(`${source} 1차 재시도 성공`, `재시도 완료: 분석 ${retry1.analysisCount}건`);
    return;
  }

  console.log(`[OilScheduler] ${source} 1차 재시도 실패, 10분 후 2차 재시도 예정`);
  await sendMasterPush("1차 재시도 실패", `${source}: 1차 재시도 실패 — 10분 후 2차 재시도합니다.`);

  // 2차 재시도 (20분 후) — await sleep으로 잠금 유지
  await sleep(10 * 60 * 1000);
  if (await checkAlreadySucceeded()) {
    console.log(`[OilScheduler] ${source} 2차 재시도 건너뜀 — 다른 경로로 이미 수집 성공됨 (${result.today})`);
    return;
  }
  console.log(`[OilScheduler] ${source} 2차 재시도 시작`);
  const retry2 = await retryFn("2차 재시도", `${baseJobType}_retry2`);
  console.log(`[OilScheduler] ${source} 2차 재시도 결과:`, retry2);

  if (retry2.success && retry2.analysisCount > 0) {
    await sendUserPush(result.today, pushMessage, slot);
    await sendMasterPush(`${source} 2차 재시도 성공`, `2차 재시도 완료: 분석 ${retry2.analysisCount}건`);
  } else {
    await sendMasterPush(
      "유가 수집 최종 실패",
      `${source} 2차 재시도까지 실패했습니다.\n오류: ${retry2.error ?? `분석 ${retry2.analysisCount}건`}\n수동 수집이 필요합니다.`,
    );
  }
}

async function checkAndRecoverOnStartup(): Promise<void> {
  try {
    const kstNow = getKSTNow();
    const kstHour = kstNow.getUTCHours();
    const kstMinute = kstNow.getUTCMinutes();

    // 오전 9:30 이전 → 9:35에 재확인
    if (kstHour < 9 || (kstHour === 9 && kstMinute < 30)) {
      const targetKST = new Date(kstNow);
      targetKST.setUTCHours(9, 35, 0, 0);
      const delayMs = targetKST.getTime() - kstNow.getTime();
      console.log(`[OilScheduler] 시작 복구: KST ${kstHour}:${String(kstMinute).padStart(2, "0")} (9:30 이전), ${Math.round(delayMs / 60000)}분 후 재확인`);
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
        // 수집은 완료됐으나 예측이 미완료일 수 있으므로 별도 트리거 (runIfNotDoneToday 내부에서 중복 방지)
        setImmediate(() => {
          import("./forecastService")
            .then(({ runIfNotDoneToday }) => runIfNotDoneToday())
            .catch((e) => console.error("[OilScheduler] 시작 예측 트리거(오후) 오류:", e));
        });
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

    // 9:30 ~ 16:00 → 오늘 오전(09:30 KST 이후) 수집 성공 로그가 있으면 건너뜀
    // oil_collection_logs 기반으로 체크 (oil_price_analysis DELETE→INSERT 공백 문제 방지)
    const morningDates = getMorningDates();
    // 09:30 KST = 00:30 UTC. kstNow는 9h 앞당긴 Date이므로 같은 날짜 UTC 00:30으로 세팅
    const todayMorningUTC = new Date(kstNow);
    todayMorningUTC.setUTCHours(0, 30, 0, 0);
    const alreadyDone = await storage.hasSuccessfulMorningLog(morningDates.today, todayMorningUTC);
    if (alreadyDone) {
      console.log(`[OilScheduler] 시작 복구(오전): 오늘 오전 ${morningDates.today} 수집 성공 로그 확인됨, 건너뜀`);
      // 수집은 완료됐으나 예측이 미완료일 수 있으므로 별도 트리거 (runIfNotDoneToday 내부에서 중복 방지)
      setImmediate(() => {
        import("./forecastService")
          .then(({ runIfNotDoneToday }) => runIfNotDoneToday())
          .catch((e) => console.error("[OilScheduler] 시작 예측 트리거(오전) 오류:", e));
      });
      return;
    }
    console.log(`[OilScheduler] 시작 복구(오전): KST ${kstHour}시, 오늘 오전 수집 미완료 → 수집 시작`);
    await runWithRetryAndNotify({
      source: "시작 복구(오전 확정)",
      slot: "morning",
      pushMessage: "전일 유가 확정값이 업데이트되었습니다.",
      notifyMasterOnSuccess: true,
      jobDates: morningDates,
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

async function runIntlPriceCrawlerWithRetry(retryCount = 0): Promise<void> {
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 60 * 60 * 1000; // 1시간
  const jobType = retryCount === 0 ? "intl_price" : `intl_price_retry${retryCount}`;
  const start = Date.now();

  try {
    const { runIntlPriceCrawler } = await import("./intlPriceCrawler");
    const result = await runIntlPriceCrawler();
    const durationMs = Date.now() - start;

    if (result.success) {
      console.log(`[IntlPriceCrawler] 수집 완료 (날짜: ${result.date})`);
      await storage.saveOilCollectionLog({
        jobType,
        status: "success",
        targetDate: result.date ?? undefined,
        rawCount: 1,
        rawDurationMs: durationMs,
      });
      return;
    }

    // 수집 실패 또는 데이터 없음 → 재시도
    if (retryCount < MAX_RETRIES) {
      const errMsg = `Petronet 미갱신 또는 데이터 없음 — ${RETRY_DELAY_MS / 60000}분 후 재시도 (${retryCount + 1}/${MAX_RETRIES})`;
      console.warn(`[IntlPriceCrawler] ${errMsg}`);
      await storage.saveOilCollectionLog({
        jobType,
        status: "skipped",
        targetDate: result.date ?? undefined,
        rawDurationMs: durationMs,
        errorMessage: errMsg,
      });
      setTimeout(() => runIntlPriceCrawlerWithRetry(retryCount + 1), RETRY_DELAY_MS);
    } else {
      const errMsg = "최대 재시도 횟수 초과, 이전 데이터 유지";
      console.error(`[IntlPriceCrawler] ${errMsg}`);
      await storage.saveOilCollectionLog({
        jobType,
        status: "failed",
        targetDate: result.date ?? undefined,
        rawDurationMs: durationMs,
        errorMessage: errMsg,
      });
    }
  } catch (e) {
    const durationMs = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[IntlPriceCrawler] 실행 오류:", e);
    await storage.saveOilCollectionLog({
      jobType,
      status: "failed",
      rawDurationMs: durationMs,
      errorMessage: msg,
    });
    if (retryCount < MAX_RETRIES) {
      setTimeout(() => runIntlPriceCrawlerWithRetry(retryCount + 1), RETRY_DELAY_MS);
    }
  }
}

export async function runWeeklySupplyJob(retryCount = 0): Promise<void> {
  const jobType = "weekly_supply_price";
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 60 * 60 * 1000; // 1시간
  const start = Date.now();
  console.log(`[WeeklySupplyScheduler] 주간공급가격 수집 시작${retryCount > 0 ? ` (재시도 ${retryCount}/${MAX_RETRIES})` : ""}`);
  try {
    // 현재 DB의 최신 주차 조회 (수집 전)
    const latestDbWeek = await storage.getLatestWeeklySupplyWeek();
    console.log(`[WeeklySupplyScheduler] DB 최신 주차: ${latestDbWeek ?? "없음"}`);

    const rows = await scrapeWeeklySupplyPrices();
    if (rows.length === 0) {
      await storage.saveOilCollectionLog({ jobType, status: "failed", errorMessage: "파싱된 데이터 없음 (정유사 4사 행 미발견)" });
      await sendMasterPush("주간공급가격 수집 실패", "테이블 파싱 후 대상 정유사 데이터가 없습니다.");
      return;
    }

    const scrapedWeek = rows[0]?.week ?? "";

    // 새 주차 데이터인지 확인: 오피넷이 아직 업데이트 전이면 재시도
    if (latestDbWeek && scrapedWeek <= latestDbWeek) {
      console.warn(`[WeeklySupplyScheduler] 오피넷 미갱신 — 수집 주차(${scrapedWeek}) ≤ DB 최신(${latestDbWeek}), 새 데이터 없음`);
      await storage.saveOilCollectionLog({
        jobType,
        status: "skipped",
        errorMessage: `오피넷 미갱신: 수집 주차(${scrapedWeek}) = DB 최신(${latestDbWeek})${retryCount < MAX_RETRIES ? ` — 1시간 후 재시도 (${retryCount + 1}/${MAX_RETRIES})` : " — 최대 재시도 초과"}`,
      });

      if (retryCount < MAX_RETRIES) {
        await sendMasterPush(
          "주간공급가격 미갱신",
          `오피넷이 아직 업데이트되지 않았습니다 (${scrapedWeek}).\n1시간 후 재시도합니다. (${retryCount + 1}/${MAX_RETRIES})`,
        );
        console.log(`[WeeklySupplyScheduler] 1시간 후 재시도 예정 (${retryCount + 1}/${MAX_RETRIES})`);
        setTimeout(() => runWeeklySupplyJob(retryCount + 1), RETRY_DELAY_MS);
      } else {
        await sendMasterPush(
          "주간공급가격 수집 확인 필요",
          `${MAX_RETRIES}회 재시도 후에도 새 주차 데이터가 없습니다 (${scrapedWeek}).\n오피넷을 직접 확인하거나 수동 수집이 필요합니다.`,
        );
        console.warn(`[WeeklySupplyScheduler] 최대 재시도 횟수(${MAX_RETRIES}) 초과 — 수동 확인 필요`);
      }
      return;
    }

    const insertRows = rows.map(r => ({
      week: r.week,
      company: r.company,
      premiumGasoline: r.premiumGasoline != null ? String(r.premiumGasoline) : null,
      gasoline: r.gasoline != null ? String(r.gasoline) : null,
      diesel: r.diesel != null ? String(r.diesel) : null,
      kerosene: r.kerosene != null ? String(r.kerosene) : null,
    }));
    await storage.upsertWeeklySupplyPrices(insertRows);
    const durationMs = Date.now() - start;

    // 유종별 수집 완료 여부 검증
    const hasGasoline = rows.some(r => r.gasoline !== null || r.premiumGasoline !== null);
    const hasDiesel = rows.some(r => r.diesel !== null);
    const hasKerosene = rows.some(r => r.kerosene !== null);
    const missingFuels = [!hasGasoline && "휘발유", !hasDiesel && "경유", !hasKerosene && "등유"].filter(Boolean);
    const collectionStatus = missingFuels.length === 0 ? "success" : "partial";

    if (missingFuels.length > 0) {
      console.warn(`[WeeklySupplyScheduler] 일부 유종 수집 미완: [${missingFuels.join(", ")}] — partial 처리`);
      await sendMasterPush("주간공급가격 수집 일부 미완", `수집 미완 유종: ${missingFuels.join(", ")} (나머지는 저장됨)`);
    }

    await storage.saveOilCollectionLog({ jobType, status: collectionStatus, rawCount: rows.length, analysisDurationMs: durationMs });
    console.log(`[WeeklySupplyScheduler] 수집 완료: ${rows.length}건 (${durationMs}ms, ${collectionStatus}, 주차: ${scrapedWeek})`);

    const wk = scrapedWeek;
    const pushBody = wk.length === 8
      ? `${wk.slice(0, 4)}년 ${wk.slice(4, 6)}월 ${parseInt(wk.slice(6, 8))}주 공급가격 데이터가 업데이트되었습니다.`
      : `${wk} 주간 공급가격 데이터가 업데이트되었습니다.`;
    const allSubs = await storage.getAllPushSubscriptions();
    if (allSubs.length > 0) {
      const payload = { title: "주간공급가격 업데이트", body: pushBody, icon: "/icon-192.png", url: "/oil-prices" };
      const { sent, failed, expiredEndpoints } = await sendPushToAll(allSubs, payload);
      if (expiredEndpoints.length > 0) {
        await Promise.all(expiredEndpoints.map(ep => storage.deletePushSubscription(ep)));
      }
      console.log(`[WeeklySupplyScheduler] 푸시 발송: 성공 ${sent}건, 실패 ${failed}건`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[WeeklySupplyScheduler] 오류:", msg);
    await storage.saveOilCollectionLog({ jobType, status: "failed", errorMessage: msg, analysisDurationMs: Date.now() - start });
    await sendMasterPush("주간공급가격 수집 오류", `오류: ${msg}`);
  }
}

async function checkAndRecoverIntlPriceOnStartup(): Promise<void> {
  try {
    const kstNow = getKSTNow();
    const kstHour = kstNow.getUTCHours();
    const kstMinute = kstNow.getUTCMinutes();
    const kstDayOfWeek = kstNow.getUTCDay(); // 0=일, 1=월, 2=화, ..., 6=토

    // 화~토(2~6)에만 실행 (Petronet 업데이트 요일)
    if (kstDayOfWeek < 2 || kstDayOfWeek > 6) {
      console.log(`[IntlPriceCrawler] 시작 복구: 오늘 요일(${kstDayOfWeek}) 화~토 아님 → 건너뜀`);
      return;
    }

    // 08:30 이전이면 cron이 직접 실행할 예정이므로 건너뜀
    if (kstHour < 8 || (kstHour === 8 && kstMinute < 30)) {
      console.log(`[IntlPriceCrawler] 시작 복구: KST ${kstHour}:${String(kstMinute).padStart(2, "0")} (08:30 이전) → cron 대기`);
      return;
    }

    // DB에서 최근 intl_fuel_prices 최신 날짜 확인 (제품가격 기준)
    const result = await db.execute(sql`
      SELECT date FROM intl_fuel_prices
      WHERE gasoline IS NOT NULL OR diesel IS NOT NULL OR kerosene IS NOT NULL
      ORDER BY date DESC LIMIT 1
    `);
    const latestDate = result.rows[0]?.date as string | undefined;

    // 최근 2일 이내 데이터가 이미 있으면 건너뜀
    // (정상 최대 공백: 토→화 3일 차이. threshold 2일이면 토요일 데이터가 화요일 기준 "오래됨"으로 판단 → 복구 실행)
    const kstTwoDaysAgo = new Date(kstNow);
    kstTwoDaysAgo.setUTCDate(kstTwoDaysAgo.getUTCDate() - 2);
    const twoDaysAgoStr = getDateStr(kstTwoDaysAgo);

    if (latestDate && latestDate >= twoDaysAgoStr) {
      console.log(`[IntlPriceCrawler] 시작 복구: 최근 데이터 존재 (${latestDate}) → 건너뜀`);
      return;
    }

    console.log(`[IntlPriceCrawler] 시작 복구: 최근 intl 데이터 없음 (최신: ${latestDate ?? "없음"}, 기준: ${twoDaysAgoStr}) → 즉시 수집 시작`);
    await runIntlPriceCrawlerWithRetry();
  } catch (err) {
    console.error("[IntlPriceCrawler] 시작 복구 확인 오류:", err);
  }
}

export function startOilScheduler(): void {
  // 오전 9:30 — 전날 확정값 수집 (무조건 실행, 잠정값 덮어씌움)
  cron.schedule("30 9 * * *", async () => {
    console.log("[OilScheduler] 오전 수집 시작 (전날 확정값, 매일 09:30 KST)");
    await runWithRetryAndNotify({
      source: "오전 정기 수집",
      slot: "morning",
      pushMessage: "전일 유가 확정값이 업데이트되었습니다.",
      jobDates: getMorningDates(),
    });
  }, { timezone: "Asia/Seoul" });

  // 오후 16:30 — 당일 잠정값 수집 (오늘 데이터 없을 때만)
  cron.schedule("30 16 * * *", async () => {
    console.log("[OilScheduler] 오후 수집 확인 (당일 잠정값, 매일 16:30 KST)");
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

  cron.schedule("0 9,12,16,19 * * *", async () => {
    console.log("[OpinetScheduler] 정기 유류 평균 수집 (KST)");
    await fetchOpinetFuelAverages();
  }, { timezone: "Asia/Seoul" });

  // 금요일 13:00 KST — 금요일이 평일이면 수집
  cron.schedule("0 13 * * 5", async () => {
    const today = getKSTNow();
    console.log(`[WeeklySupplyScheduler] 금요일 13:00 KST 트리거 (${getDateStr(today)})`);
    if (isKoreanHoliday(today)) {
      console.log("[WeeklySupplyScheduler] 오늘은 한국 공휴일 → 수집 건너뜀 (월요일에 수집 예정)");
      await storage.saveOilCollectionLog({ jobType: "weekly_supply_price", status: "skipped", errorMessage: "금요일 공휴일로 인해 건너뜀" });
      return;
    }
    await runWeeklySupplyJob();
  }, { timezone: "Asia/Seoul" });

  // 월요일 13:00 KST — 직전 금요일이 공휴일이었으면 수집
  cron.schedule("0 13 * * 1", async () => {
    const today = getKSTNow();
    const lastFriday = new Date(today);
    lastFriday.setUTCDate(lastFriday.getUTCDate() - 3);
    console.log(`[WeeklySupplyScheduler] 월요일 13:00 KST 트리거 (${getDateStr(today)}), 직전 금요일: ${getDateStr(lastFriday)}`);
    if (!isKoreanHoliday(lastFriday)) {
      console.log("[WeeklySupplyScheduler] 직전 금요일이 평일 → 이미 금요일에 수집됨, 건너뜀");
      await storage.saveOilCollectionLog({ jobType: "weekly_supply_price", status: "skipped", errorMessage: "직전 금요일 평일 수집됨으로 건너뜀" });
      return;
    }
    await runWeeklySupplyJob();
  }, { timezone: "Asia/Seoul" });

  // 화~토 08:30 KST — Petronet 국제가격(석유제품+원유 3종) 크롤링
  cron.schedule("30 8 * * 2-6", async () => {
    console.log("[IntlPriceCrawler] 정기 수집 시작 (화~토 08:30 KST)");
    await runIntlPriceCrawlerWithRetry();
  }, { timezone: "Asia/Seoul" });

  // 매월 1일 02:00 KST — 임계값 자동 갱신
  cron.schedule("0 2 1 * *", async () => {
    console.log("[ForecastService] 월간 임계값 갱신 시작 (매월 1일 02:00 KST)");
    try {
      const { runThresholdCalibrator } = await import("./forecastService");
      const result = await runThresholdCalibrator();
      const body = `임계값 갱신됨: ${result.oldThreshold ?? "없음"}원 → ${result.newThreshold ?? "실패"}원`;
      await sendMasterPush("AI 임계값 갱신", body);
      console.log("[ForecastService] 임계값 갱신 완료:", result);
    } catch (e) {
      console.error("[ForecastService] 임계값 갱신 오류:", e);
    }
  }, { timezone: "Asia/Seoul" });

  console.log("[OilScheduler] 스케줄러 등록 완료 (오전 확정 09:30 / 오후 잠정 16:30 / 유류 평균 9,12,16,19시 KST / 주간공급가격 금·월 13:00 KST / 국제제품가격 화~토 08:30 KST / AI 임계값 갱신 매월1일 02:00 KST)");

  setTimeout(() => checkAndRecoverOnStartup(), 5000);

  // 서버 시작 복구: 08:30 이후 시작 시 intl 데이터 누락이면 즉시 수집
  setTimeout(() => checkAndRecoverIntlPriceOnStartup(), 7000);

  setTimeout(() => {
    console.log("[OpinetScheduler] 서버 시작 직후 유류 평균 즉시 수집");
    fetchOpinetFuelAverages(true);
  }, 3000);
}
