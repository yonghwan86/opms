import { spawn } from "child_process";
import path from "path";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";

const PYTHON_DIR = path.join(process.cwd(), "server", "python");
const TIMEOUT_MS = 15 * 60 * 1000;

function runPythonScript(scriptName: string, args: string[] = []): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(PYTHON_DIR, scriptName);
    const proc = spawn("python3", [scriptPath, ...args], {
      env: { ...process.env },
      timeout: TIMEOUT_MS,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Python script ${scriptName} timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 1 });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function hasForecastForToday(): Promise<boolean> {
  try {
    const today = new Date();
    const kstNow = new Date(today.getTime() + 9 * 60 * 60 * 1000);
    const runDate = kstNow.toISOString().slice(0, 10).replace(/-/g, "");
    const result = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM oil_price_forecasts
      WHERE run_date = ${runDate} AND scope = 'national'
    `);
    const cnt = Number((result.rows[0] as any)?.cnt ?? 0);
    return cnt > 0;
  } catch {
    return false;
  }
}

async function updateActualPrices(): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE oil_price_forecasts f
      SET actual_price = h.gasoline_avg
      FROM domestic_avg_price_history h
      WHERE f.target_date = h.date
        AND f.fuel_type = 'gasoline'
        AND f.scope = 'national'
        AND f.actual_price IS NULL
        AND h.gasoline_avg IS NOT NULL
    `);
    await db.execute(sql`
      UPDATE oil_price_forecasts f
      SET actual_price = h.diesel_avg
      FROM domestic_avg_price_history h
      WHERE f.target_date = h.date
        AND f.fuel_type = 'diesel'
        AND f.scope = 'national'
        AND f.actual_price IS NULL
        AND h.diesel_avg IS NOT NULL
    `);
  } catch (err) {
    console.error("[ForecastService] actual_price 업데이트 실패:", err);
  }
}

async function computeWeeklyMape(): Promise<number | null> {
  try {
    const result = await db.execute(sql`
      SELECT AVG(ABS(actual_price - forecast_price) / NULLIF(actual_price, 0)) * 100 as mape
      FROM oil_price_forecasts
      WHERE actual_price IS NOT NULL
        AND scope = 'national'
        AND fuel_type = 'gasoline'
        AND run_date >= to_char(NOW() - INTERVAL '7 days', 'YYYYMMDD')
    `);
    const mapeStr = (result.rows[0] as any)?.mape;
    return mapeStr !== null && mapeStr !== undefined ? parseFloat(String(mapeStr)) : null;
  } catch {
    return null;
  }
}

async function updateDomesticAvgHistory(): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO domestic_avg_price_history (date, gasoline_avg, diesel_avg, kerosene_avg)
      SELECT
        date,
        AVG(gasoline) FILTER (WHERE gasoline IS NOT NULL) as gasoline_avg,
        AVG(diesel) FILTER (WHERE diesel IS NOT NULL) as diesel_avg,
        AVG(kerosene) FILTER (WHERE kerosene IS NOT NULL) as kerosene_avg
      FROM oil_price_raw
      WHERE date IS NOT NULL
      GROUP BY date
      ON CONFLICT (date) DO UPDATE SET
        gasoline_avg = EXCLUDED.gasoline_avg,
        diesel_avg = EXCLUDED.diesel_avg,
        kerosene_avg = EXCLUDED.kerosene_avg
    `);
    console.log("[ForecastService] domestic_avg_price_history 업데이트 완료");
  } catch (err) {
    console.error("[ForecastService] domestic_avg_price_history 업데이트 실패:", err);
  }
}

async function updateExchangeRateHistory(): Promise<void> {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/USDKRW=X?interval=1d&range=90d";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; oil-monitor/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);
    const json = await res.json() as any;
    const result = json?.chart?.result?.[0];
    if (!result) return;
    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const close = closes[i];
      if (!ts || close === null || close === undefined) continue;
      const dateStr = new Date(ts * 1000).toISOString().slice(0, 10);
      await db.execute(sql`
        INSERT INTO exchange_rate_history (date, rate)
        VALUES (${dateStr}, ${close})
        ON CONFLICT (date) DO UPDATE SET rate = EXCLUDED.rate
      `);
    }
    console.log("[ForecastService] exchange_rate_history 업데이트 완료");
  } catch (err) {
    console.error("[ForecastService] 환율 이력 업데이트 실패:", err);
  }
}

async function saveForecastLog(opts: {
  status: string;
  mape: number | null;
  anomalyCount: number;
  durationMs: number;
  errorMessage?: string;
}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO ai_forecast_logs (run_at, status, mape, anomaly_count, duration_ms, error_message)
      VALUES (NOW(), ${opts.status}, ${opts.mape}, ${opts.anomalyCount}, ${opts.durationMs}, ${opts.errorMessage ?? null})
    `);
  } catch (err) {
    console.error("[ForecastService] 로그 저장 실패:", err);
  }
}

async function sendMasterPushNotification(title: string, body: string): Promise<void> {
  try {
    const { sendPushToAll } = await import("./pushService");
    const subs = await storage.getMasterPushSubscriptions();
    if (subs.length === 0) return;
    const payload = { title, body, icon: "/icon-192.png", url: "/ai-forecast" };
    const { expiredEndpoints } = await sendPushToAll(subs, payload);
    if (expiredEndpoints.length > 0) {
      await Promise.all(expiredEndpoints.map((ep) => storage.deletePushSubscription(ep)));
    }
  } catch (err) {
    console.error("[ForecastService] 마스터 푸시 발송 실패:", err);
  }
}

export async function runIfNotDoneToday(): Promise<void> {
  const start = Date.now();
  console.log("[ForecastService] AI 예측 실행 시작");

  // 실제값 backfill은 항상 실행 (이미 예측 완료된 날도 새 데이터 반영)
  await updateDomesticAvgHistory();
  await updateActualPrices();

  const alreadyDone = await hasForecastForToday();
  if (alreadyDone) {
    console.log("[ForecastService] 오늘 이미 예측 완료됨 — 건너뜀");
    return;
  }

  try {
    await updateExchangeRateHistory();

    const { stdout, stderr, exitCode } = await runPythonScript("prophet_model.py");
    const durationMs = Date.now() - start;

    let prophetResult: any = null;
    let anomalyCount = 0;
    let mape: number | null = null;

    if (exitCode !== 0) {
      const errMsg = stderr || stdout || "Prophet 예측 실패";
      console.error("[ForecastService] Prophet 실패:", errMsg);
      await saveForecastLog({ status: "failed", mape: null, anomalyCount: 0, durationMs, errorMessage: errMsg });
      await sendMasterPushNotification("AI 예측 실패", `오류: ${errMsg.slice(0, 100)}`);
      return;
    }

    try {
      prophetResult = JSON.parse(stdout);
    } catch {
      const errMsg = "Prophet 결과 파싱 실패";
      await saveForecastLog({ status: "failed", mape: null, anomalyCount: 0, durationMs, errorMessage: errMsg });
      await sendMasterPushNotification("AI 예측 실패", errMsg);
      return;
    }

    const gasoline_mape = prophetResult?.results?.gasoline?.mape;
    const diesel_mape = prophetResult?.results?.diesel?.mape;
    mape = gasoline_mape !== null && gasoline_mape !== undefined ? Number(gasoline_mape) : null;

    // 주유소별 예측 (station_adjuster.py): argv[1]=fuel_type, argv[2]=station_id(생략=전체)
    for (const fuelArg of ["gasoline", "diesel"]) {
      try {
        const { stdout: stationStdout, exitCode: stationExit } = await runPythonScript("station_adjuster.py", [fuelArg]);
        if (stationExit === 0) {
          const stationResult = JSON.parse(stationStdout);
          console.log(`[ForecastService] 주유소별 예측(${fuelArg}) 완료: ${stationResult?.count ?? 0}개소`);
        } else {
          console.warn(`[ForecastService] station_adjuster(${fuelArg}) 비정상 종료`);
        }
      } catch (err) {
        console.warn(`[ForecastService] station_adjuster(${fuelArg}) 실패 (비중요):`, err);
      }
    }

    try {
      const { stdout: margStdout } = await runPythonScript("margin_detector.py", ["gasoline"]);
      const margResult = JSON.parse(margStdout);
      anomalyCount = margResult?.total ?? 0;
    } catch {
      anomalyCount = 0;
    }

    const computedMape = await computeWeeklyMape();
    if (computedMape !== null) mape = computedMape;

    await saveForecastLog({ status: "success", mape, anomalyCount, durationMs });

    const mapeText = mape !== null ? `MAPE ${mape.toFixed(1)}%` : "MAPE 미산출";
    await sendMasterPushNotification(
      "AI 예측 완료",
      `예측 완료 (${mapeText}, 이상업소 ${anomalyCount}건)`
    );

    if (mape !== null && mape > 5) {
      await sendMasterPushNotification(
        "모델 재학습 검토 필요",
        `MAPE ${mape.toFixed(1)}% — 허용 기준(5%) 초과. 재학습 검토를 권장합니다.`
      );
    }

    console.log(`[ForecastService] 예측 완료: MAPE=${mape}, 이상업소=${anomalyCount}, ${durationMs}ms`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - start;
    console.error("[ForecastService] 예측 실행 오류:", msg);
    await saveForecastLog({ status: "failed", mape: null, anomalyCount: 0, durationMs, errorMessage: msg });
    await sendMasterPushNotification("AI 예측 오류", `예외: ${msg.slice(0, 100)}`);
  }
}

export async function runThresholdCalibrator(): Promise<{ oldThreshold: number | null; newThreshold: number | null }> {
  try {
    const { stdout, exitCode } = await runPythonScript("threshold_calibrator.py");
    if (exitCode !== 0) return { oldThreshold: null, newThreshold: null };
    const result = JSON.parse(stdout);
    return { oldThreshold: result.oldThreshold ?? null, newThreshold: result.newThreshold ?? null };
  } catch {
    return { oldThreshold: null, newThreshold: null };
  }
}

export async function checkPriceChangeAlert(today: string): Promise<void> {
  try {
    const result = await db.execute(sql`
      WITH price_pairs AS (
        SELECT
          h1.gasoline_avg as today_price,
          h2.gasoline_avg as yesterday_price,
          ABS(h1.gasoline_avg - h2.gasoline_avg) as change_amount
        FROM domestic_avg_price_history h1
        JOIN domestic_avg_price_history h2 ON h2.date = to_char(to_date(h1.date, 'YYYYMMDD') - INTERVAL '1 day', 'YYYYMMDD')
        WHERE h1.date = ${today}
      )
      SELECT pp.change_amount, afs.threshold_won
      FROM price_pairs pp, ai_forecast_settings afs
      WHERE afs.key = 'price_change_threshold'
        AND pp.today_price IS NOT NULL
        AND pp.yesterday_price IS NOT NULL
    `);
    if (result.rows.length === 0) return;
    const row = result.rows[0] as any;
    const changeAmount = parseFloat(String(row.change_amount ?? "0"));
    const threshold = parseFloat(String(row.threshold_won ?? "999999"));
    if (changeAmount > threshold) {
      await sendMasterPushNotification(
        "정책 이벤트 가능성",
        `전일 대비 유가 변동 ${changeAmount.toFixed(0)}원 — 임계값(${threshold.toFixed(0)}원) 초과. 정책 이벤트 여부를 확인해주세요.`
      );
    }
  } catch (err) {
    console.error("[ForecastService] 가격 변동 알림 확인 실패:", err);
  }
}

export async function getLagAnalysis(): Promise<any> {
  try {
    const { stdout, exitCode } = await runPythonScript("lag_analyzer.py");
    if (exitCode !== 0) return null;
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

export async function getMarginAnomalies(fuelType: string, sidoFilter?: string[]): Promise<any> {
  try {
    const args = [fuelType];
    if (sidoFilter && sidoFilter.length > 0) {
      args.push(sidoFilter.join(","));
    }
    const { stdout, exitCode } = await runPythonScript("margin_detector.py", args);
    if (exitCode !== 0) return { anomalies: [], total: 0 };
    return JSON.parse(stdout);
  } catch {
    return { anomalies: [], total: 0 };
  }
}
