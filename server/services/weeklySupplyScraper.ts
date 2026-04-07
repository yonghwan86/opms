/**
 * 오피넷 정유사 공급가격 수집
 * - B034 페이지 한 번 fetch → HTML 내 chartData JSON 추출
 * - A1=고급휘발유, A2=일반휘발유, A5=경유, A3=등유
 * - YYYY 필드("26년03월4주")로 주차 키(20260304) 산출
 */

const TARGET_COMPANIES = ["SK에너지", "GS칼텍스", "HD현대오일뱅크", "S-OIL"];

export interface WeeklySupplyRow {
  week: string;
  company: string;
  premiumGasoline: number | null;
  gasoline: number | null;
  diesel: number | null;
  kerosene: number | null;
}

interface ChartEntry {
  YYYY: string;
  POLL_DIV_CD: string;
  A1?: number;
  A2?: number;
  A5?: number;
  A3?: number;
  [key: string]: unknown;
}

function deriveWeekKey(yyyy: string): string | null {
  // "26년03월4주" 또는 "2026년03월4주" 형식
  const m = yyyy.match(/(\d{2,4})년\s*(\d{1,2})월\s*(\d+)주/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const fullYear = year < 100 ? 2000 + year : year;
  const mm = String(m[2]).padStart(2, "0");
  const ww = String(m[3]).padStart(2, "0");
  return `${fullYear}${mm}${ww}`;
}

async function fetchChartData(): Promise<ChartEntry[]> {
  const url =
    "https://www.opinet.co.kr/user/dopavcow/dopAvcowCompanyList.do?prodCd=B034";
  console.log(`[WeeklySupplyScraper] fetch: ${url}`);

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
      Connection: "keep-alive",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const html = await res.text();

  // chartData = [...]; 추출
  const match = html.match(/chartData\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    // 디버그: HTML 앞부분 로그
    console.error(
      "[WeeklySupplyScraper] chartData 변수 없음. HTML 앞 500자:",
      html.substring(0, 500)
    );
    throw new Error(
      "chartData 변수를 찾을 수 없습니다. 오피넷 페이지 구조 변경 가능성"
    );
  }

  const entries: ChartEntry[] = JSON.parse(match[1]);
  console.log(
    `[WeeklySupplyScraper] chartData 추출 완료: ${entries.length}건`
  );
  return entries;
}

export async function scrapeWeeklySupplyPrices(): Promise<WeeklySupplyRow[]> {
  const entries = await fetchChartData();

  if (entries.length === 0) {
    throw new Error("chartData가 비어있습니다. 오피넷 미공표 상태일 수 있습니다.");
  }

  // 주차 키 산출
  const weekRaw = entries[0].YYYY;
  const weekKey = deriveWeekKey(weekRaw);
  if (!weekKey) {
    throw new Error(
      `주차 파싱 실패: "${weekRaw}" — 예상 형식: "26년03월4주"`
    );
  }
  console.log(`[WeeklySupplyScraper] 주차: ${weekRaw} → ${weekKey}`);

  // 회사별 데이터 병합
  const results: WeeklySupplyRow[] = [];

  for (const company of TARGET_COMPANIES) {
    const entry = entries.find((e) => e.POLL_DIV_CD === company);
    if (!entry) {
      console.warn(`[WeeklySupplyScraper] ${company} 데이터 없음`);
      results.push({
        week: weekKey,
        company,
        premiumGasoline: null,
        gasoline: null,
        diesel: null,
        kerosene: null,
      });
      continue;
    }

    const row: WeeklySupplyRow = {
      week: weekKey,
      company,
      premiumGasoline: typeof entry.A1 === "number" ? entry.A1 : null,
      gasoline: typeof entry.A2 === "number" ? entry.A2 : null,
      diesel: typeof entry.A5 === "number" ? entry.A5 : null,
      kerosene: typeof entry.A3 === "number" ? entry.A3 : null,
    };
    results.push(row);
    console.log(
      `  ${company}: 고급=${row.premiumGasoline}, 보통=${row.gasoline}, 경유=${row.diesel}, 등유=${row.kerosene}`
    );
  }

  console.log(
    `[WeeklySupplyScraper] 파싱 완료: ${results.length}건 (기준주: ${weekKey})`
  );
  return results;
}
