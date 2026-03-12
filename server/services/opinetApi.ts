export interface FuelAverages {
  gasoline: number;
  diesel: number;
  kerosene: number;
  gasolineChange: number;
  dieselChange: number;
  keroseneChange: number;
  tradeDate: string;
  fetchedAt: number;
}

let cachedFuelAverages: FuelAverages | null = null;

export function getCachedFuelAverages(): FuelAverages | null {
  return cachedFuelAverages;
}

export function setCachedFuelAverages(data: FuelAverages | null): void {
  cachedFuelAverages = data;
}

interface OilItem {
  PRODCD: string;
  PRICE: string;
  DIFF: string;
  TRADE_DT: string;
}

const PRODUCT_CODES = {
  GASOLINE: "B027",
  DIESEL: "D047",
  KEROSENE: "C004",
} as const;

export async function fetchFuelAverages(): Promise<FuelAverages> {
  const apiKey = process.env.OPINET_API_KEY;
  if (!apiKey) {
    throw new Error("OPINET_API_KEY 환경 변수가 설정되지 않았습니다.");
  }

  const url = `https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${apiKey}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; oil-monitor/1.0)" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Opinet API HTTP ${res.status}`);
  }

  const json = await res.json();
  const oilList: OilItem[] = json?.RESULT?.OIL ?? [];

  if (oilList.length === 0) {
    throw new Error("Opinet API: OIL_LIST 비어있음");
  }

  const findProduct = (code: string): OilItem | undefined =>
    oilList.find((item) => item.PRODCD === code);

  const gasItem = findProduct(PRODUCT_CODES.GASOLINE);
  const dieselItem = findProduct(PRODUCT_CODES.DIESEL);
  const keroItem = findProduct(PRODUCT_CODES.KEROSENE);

  if (!gasItem || !dieselItem) {
    throw new Error("Opinet API: 휘발유/경유 데이터 누락");
  }

  const gasPrice = parseFloat(gasItem.PRICE);
  const dieselPrice = parseFloat(dieselItem.PRICE);
  const keroPrice = keroItem ? parseFloat(keroItem.PRICE) : 0;
  const gasDiff = parseFloat(gasItem.DIFF);
  const dieselDiff = parseFloat(dieselItem.DIFF);
  const keroDiff = keroItem ? parseFloat(keroItem.DIFF) : 0;

  if (!Number.isFinite(gasPrice) || !Number.isFinite(dieselPrice) ||
      !Number.isFinite(gasDiff) || !Number.isFinite(dieselDiff)) {
    throw new Error("Opinet API: 가격/변동 데이터가 유효한 숫자가 아닙니다");
  }

  const result: FuelAverages = {
    gasoline: Math.round(gasPrice),
    diesel: Math.round(dieselPrice),
    kerosene: Number.isFinite(keroPrice) ? Math.round(keroPrice) : 0,
    gasolineChange: gasDiff,
    dieselChange: dieselDiff,
    keroseneChange: Number.isFinite(keroDiff) ? keroDiff : 0,
    tradeDate: gasItem.TRADE_DT,
    fetchedAt: Date.now(),
  };

  setCachedFuelAverages(result);
  console.log(
    `[OpinetApi] 유류 평균 수집 완료: 휘발유 ${result.gasoline}원(${result.gasolineChange > 0 ? "+" : ""}${result.gasolineChange}), ` +
    `경유 ${result.diesel}원(${result.dieselChange > 0 ? "+" : ""}${result.dieselChange}), ` +
    `등유 ${result.kerosene}원(${result.keroseneChange > 0 ? "+" : ""}${result.keroseneChange}), ` +
    `기준일: ${result.tradeDate}`,
  );

  return result;
}

export async function fetchFuelAveragesWithRetry(maxRetries = 3, retryDelayMs = 5 * 60 * 1000): Promise<FuelAverages | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetchFuelAverages();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[OpinetApi] 수집 실패 (${attempt}/${maxRetries}): ${msg}`);

      if (attempt < maxRetries) {
        console.log(`[OpinetApi] ${retryDelayMs / 1000}초 후 재시도 예정`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  console.error("[OpinetApi] 최대 재시도 횟수 초과, DB fallback 사용 필요");
  return null;
}
