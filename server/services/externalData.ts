interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs = 5 * 60 * 1000): T {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export interface WtiData {
  price: number;
  change: number;
  changePercent: number;
}

export interface WtiHistory {
  date: string;
  value: number;
}

export interface ExchangeRateData {
  rate: number;
  change: number;
  changePercent: number;
}

async function yahooFinance(symbol: string, range: string): Promise<any> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; oil-monitor/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("Yahoo Finance: 데이터 없음");
  return result;
}

export async function getWtiData(): Promise<WtiData | null> {
  const cached = getCached<WtiData>("wti_current");
  if (cached) return cached;

  try {
    const result = await yahooFinance("CL=F", "5d");
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const valid = closes.filter((v): v is number => v != null);
    if (valid.length < 2) return null;

    const price = valid[valid.length - 1];
    const prev = valid[valid.length - 2];
    const change = price - prev;
    const changePercent = (change / prev) * 100;

    return setCached("wti_current", { price, change, changePercent });
  } catch (e) {
    console.error("[ExternalData] WTI 조회 실패:", e);
    return null;
  }
}

export async function getWtiHistory(): Promise<WtiHistory[]> {
  const cached = getCached<WtiHistory[]>("wti_history");
  if (cached) return cached;

  try {
    const result = await yahooFinance("CL=F", "3mo");
    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

    const history: WtiHistory[] = timestamps
      .map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        value: closes[i] ?? null,
      }))
      .filter((h): h is WtiHistory => h.value !== null);

    return setCached("wti_history", history);
  } catch (e) {
    console.error("[ExternalData] WTI 히스토리 조회 실패:", e);
    return [];
  }
}

export async function getExchangeRate(): Promise<ExchangeRateData | null> {
  const cached = getCached<ExchangeRateData>("exchange_rate");
  if (cached) return cached;

  try {
    const result = await yahooFinance("USDKRW=X", "5d");
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const valid = closes.filter((v): v is number => v != null);
    if (valid.length < 2) return null;

    const rate = valid[valid.length - 1];
    const prev = valid[valid.length - 2];
    const change = rate - prev;
    const changePercent = (change / prev) * 100;

    return setCached("exchange_rate", { rate, change, changePercent });
  } catch (e) {
    console.error("[ExternalData] 환율 조회 실패:", e);
    return null;
  }
}
