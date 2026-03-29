import { useState } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

const LITERS_PER_BARREL = 158.987;

const FIXED_TAX = {
  gasoline: 693.72,
  diesel:   475.88,
  kerosene:  72.45,
} as const;

type Fuel = "gasoline" | "diesel" | "kerosene";

const FUEL_LABEL: Record<Fuel, string> = {
  gasoline: "휘발유",
  diesel:   "경유",
  kerosene: "등유",
};

const FUEL_COLOR: Record<Fuel, string> = {
  gasoline: "#eab308",
  diesel:   "#22c55e",
  kerosene: "#38bdf8",
};

const TAX_DETAIL: Record<Fuel, { label: string; amount: number }[]> = {
  gasoline: [
    { label: "교통에너지환경세", amount: 492.00 },
    { label: "교육세", amount: 73.80 },
    { label: "주행세", amount: 127.92 },
    { label: "부가세 (변동)", amount: 0 },
  ],
  diesel: [
    { label: "교통에너지환경세", amount: 337.50 },
    { label: "교육세", amount: 50.63 },
    { label: "주행세", amount: 87.75 },
    { label: "부가세 (변동)", amount: 0 },
  ],
  kerosene: [
    { label: "개별소비세", amount: 63.00 },
    { label: "교육세", amount: 9.45 },
    { label: "부가세 (변동)", amount: 0 },
  ],
};

const rawData = [
  { date: "02/20", intlG: 79.92,  intlD: 92.07,  intlK: 87.5,  exch: 1430, domG: 1689, domD: 1590, domK: 1107 },
  { date: "02/23", intlG: 79.76,  intlD: 91.03,  intlK: 86.5,  exch: 1432, domG: 1691, domD: 1593, domK: 1108 },
  { date: "02/24", intlG: 81.33,  intlD: 91.87,  intlK: 87.2,  exch: 1435, domG: 1691, domD: 1594, domK: 1109 },
  { date: "02/25", intlG: 81.45,  intlD: 91.69,  intlK: 87.1,  exch: 1437, domG: 1692, domD: 1595, domK: 1109 },
  { date: "02/26", intlG: 81.73,  intlD: 91.88,  intlK: 87.3,  exch: 1438, domG: 1692, domD: 1596, domK: 1110 },
  { date: "02/27", intlG: 82.10,  intlD: 92.28,  intlK: 87.6,  exch: 1440, domG: 1693, domD: 1597, domK: 1110 },
  { date: "03/02", intlG: 92.77,  intlD: 114.51, intlK: 108.8, exch: 1460, domG: 1702, domD: 1607, domK: 1118 },
  { date: "03/03", intlG: 98.67,  intlD: 125.24, intlK: 118.9, exch: 1468, domG: 1723, domD: 1635, domK: 1130 },
  { date: "03/04", intlG: 104.33, intlD: 140.59, intlK: 133.6, exch: 1475, domG: 1777, domD: 1729, domK: 1155 },
  { date: "03/05", intlG: 110.95, intlD: 152.19, intlK: 144.6, exch: 1483, domG: 1834, domD: 1830, domK: 1183 },
  { date: "03/06", intlG: 121.33, intlD: 154.74, intlK: 147.0, exch: 1490, domG: 1872, domD: 1887, domK: 1197 },
  { date: "03/09", intlG: 147.47, intlD: 184.41, intlK: 175.2, exch: 1493, domG: 1903, domD: 1926, domK: 1218 },
  { date: "03/10", intlG: 127.40, intlD: 160.37, intlK: 152.4, exch: 1493, domG: 1907, domD: 1932, domK: 1219 },
  { date: "03/11", intlG: 129.17, intlD: 163.56, intlK: 155.4, exch: 1494, domG: 1904, domD: 1927, domK: 1218 },
  { date: "03/12", intlG: 143.44, intlD: 193.50, intlK: 183.8, exch: 1495, domG: 1899, domD: 1919, domK: 1215 },
  { date: "03/13", intlG: 149.76, intlD: 191.48, intlK: 181.9, exch: 1497, domG: 1864, domD: 1873, domK: 1202 },
  { date: "03/16", intlG: 153.48, intlD: 189.93, intlK: 180.4, exch: 1497, domG: 1833, domD: 1832, domK: 1193 },
  { date: "03/17", intlG: 152.16, intlD: 197.20, intlK: 187.3, exch: 1497, domG: 1828, domD: 1826, domK: 1190 },
  { date: "03/18", intlG: 153.10, intlD: 197.87, intlK: 187.9, exch: 1498, domG: 1824, domD: 1822, domK: 1188 },
  { date: "03/19", intlG: 165.24, intlD: 223.49, intlK: 212.3, exch: 1497, domG: 1822, domD: 1819, domK: 1187 },
  { date: "03/20", intlG: 158.40, intlD: 213.10, intlK: 202.4, exch: 1495, domG: 1820, domD: 1815, domK: 1186 },
  { date: "03/21", intlG: 152.30, intlD: 205.80, intlK: 195.5, exch: 1492, domG: 1818, domD: 1812, domK: 1185 },
  { date: "03/24", intlG: 146.10, intlD: 198.20, intlK: 188.3, exch: 1488, domG: 1815, domD: 1808, domK: 1183 },
  { date: "03/25", intlG: 143.80, intlD: 194.50, intlK: 184.8, exch: 1485, domG: 1812, domD: 1805, domK: 1182 },
  { date: "03/26", intlG: 141.50, intlD: 191.30, intlK: 181.7, exch: 1483, domG: 1810, domD: 1803, domK: 1181 },
  { date: "03/27", intlG: 139.20, intlD: 188.10, intlK: 178.7, exch: 1481, domG: 1808, domD: 1800, domK: 1180 },
  { date: "03/28", intlG: 137.80, intlD: 185.90, intlK: 176.6, exch: 1479, domG: 1806, domD: 1798, domK: 1179 },
];

function computeChartData(fuel: Fuel) {
  const fixedTax = FIXED_TAX[fuel];
  return rawData.map(r => {
    const retail = fuel === "gasoline" ? r.domG : fuel === "diesel" ? r.domD : r.domK;
    const intlUsd = fuel === "gasoline" ? r.intlG : fuel === "diesel" ? r.intlD : r.intlK;
    const vatAmt = retail / 11;
    const pretax = Math.round(retail * (10 / 11) - fixedTax);
    const intlKrw = Math.round((intlUsd * r.exch) / LITERS_PER_BARREL);
    const gap = pretax - intlKrw;
    // 스택 방식: base(intlKrw) + gapFill = pretax
    return {
      date: r.date,
      pretax,
      intlKrw,
      gapFill: gap, // intlKrw 위에 쌓이는 gap 영역
      gap,
      retail,
      exch: r.exch,
      vatAmt: Math.round(vatAmt),
    };
  });
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

const CustomTooltip = ({ active, payload, label, fuel }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const gap = d.pretax - d.intlKrw;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs shadow-xl min-w-[210px]">
      <p className="text-zinc-300 font-semibold mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-zinc-400">국내 판매가</span>
          <span className="text-white font-medium">{fmt(d.retail)}원/L</span>
        </div>
        <div className="flex justify-between gap-4">
          <span style={{ color: FUEL_COLOR[fuel as Fuel] }}>국내 세전가</span>
          <span style={{ color: FUEL_COLOR[fuel as Fuel] }} className="font-semibold">{fmt(d.pretax)}원/L</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-sky-400">국제가 환산</span>
          <span className="text-sky-400 font-semibold">{fmt(d.intlKrw)}원/L</span>
        </div>
        <div className="h-px bg-zinc-700 my-1" />
        <div className="flex justify-between gap-4">
          <span className="text-orange-400">정제·유통 마진</span>
          <span className="text-orange-400 font-bold">+{fmt(gap)}원/L</span>
        </div>
        <div className="flex justify-between gap-4 text-zinc-500">
          <span>환율</span>
          <span>{fmt(d.exch)}원/$</span>
        </div>
      </div>
    </div>
  );
};

export function TaxAwareChart() {
  const [fuel, setFuel] = useState<Fuel>("gasoline");
  const data = computeChartData(fuel);
  const latest = data[data.length - 1];
  const fuelColor = FUEL_COLOR[fuel];
  const taxDetails = TAX_DETAIL[fuel];
  const fixedTax = FIXED_TAX[fuel];
  const latestVat = latest.vatAmt;
  const totalTax = fixedTax + latestVat;

  const yMin = Math.floor(Math.min(...data.map(d => d.intlKrw)) / 100) * 100 - 100;
  const yMax = Math.ceil(Math.max(...data.map(d => d.pretax)) / 100) * 100 + 100;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-5 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-1 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-white">국제-국내 제품가격 비교</h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              국내 세전가(원/L) vs 국제 제품가 환산(원/L) · 최근 90일
            </p>
          </div>
          {/* 유종 탭 */}
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
            {(["gasoline", "diesel", "kerosene"] as Fuel[]).map(f => (
              <button
                key={f}
                onClick={() => setFuel(f)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  fuel === f
                    ? "text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                style={fuel === f ? { backgroundColor: fuelColor + "33", color: FUEL_COLOR[f], border: `1px solid ${FUEL_COLOR[f]}55` } : {}}
              >
                {FUEL_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 현황 카드 */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <p className="text-zinc-500 text-xs mb-1">국내 판매가</p>
          <p className="text-white font-bold text-lg">{fmt(latest.retail)}원</p>
          <p className="text-zinc-500 text-xs">원/L</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <p className="text-zinc-500 text-xs mb-1">국내 세전가</p>
          <p className="font-bold text-lg" style={{ color: fuelColor }}>{fmt(latest.pretax)}원</p>
          <p className="text-zinc-500 text-xs">판매가×(10/11)−고정세</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <p className="text-zinc-500 text-xs mb-1">국제가 환산</p>
          <p className="text-sky-400 font-bold text-lg">{fmt(latest.intlKrw)}원</p>
          <p className="text-zinc-500 text-xs">$/Bbl×환율÷158.987</p>
        </div>
        <div className="bg-zinc-900 border border-orange-900/50 rounded-lg p-3">
          <p className="text-zinc-500 text-xs mb-1">정제·유통 마진 (Gap)</p>
          <p className="text-orange-400 font-bold text-lg">+{fmt(latest.gap)}원</p>
          <p className="text-zinc-500 text-xs">세전가 − 국제환산가</p>
        </div>
      </div>

      {/* 차트 */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
        <ResponsiveContainer width="100%" height={330}>
          <ComposedChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="gapGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval={3}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `${(v / 1000).toFixed(1)}k`}
              width={40}
            />
            <Tooltip content={<CustomTooltip fuel={fuel} />} />
            <Legend
              formatter={val =>
                val === "pretax"
                  ? `${FUEL_LABEL[fuel]} 국내 세전가 (원/L)`
                  : val === "intlKrw"
                  ? `${FUEL_LABEL[fuel]} 국제가 환산 (원/L)`
                  : ""
              }
              wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }}
            />
            {/* Gap 음영: intlKrw(투명) + gapFill(주황) 스택으로 두 라인 사이 영역 채움 */}
            <Area
              type="monotone"
              dataKey="intlKrw"
              stackId="gap"
              stroke="none"
              fill="transparent"
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="gapFill"
              stackId="gap"
              stroke="none"
              fill="url(#gapGradient)"
              legendType="none"
            />
            {/* 국제가 환산 라인 */}
            <Line
              type="monotone"
              dataKey="intlKrw"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={false}
              name="intlKrw"
            />
            {/* 국내 세전가 라인 */}
            <Line
              type="monotone"
              dataKey="pretax"
              stroke={fuelColor}
              strokeWidth={2.5}
              dot={false}
              name="pretax"
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-zinc-600 text-xs text-center mt-1">
          음영 영역 = 정제·수송·유통 마진 | 환율: {fmt(latest.exch)}원/$ (최근)
        </p>
      </div>

      {/* 세금 구조 패널 */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">
            적용 중인 세금 구조
            <span className="ml-2 text-xs text-zinc-500 font-normal">(2026년 3월 기준 · 탄력세율 적용)</span>
          </h2>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">매주 금요일 14:00 자동 갱신</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {/* 고정세금 */}
          <div className="col-span-2">
            <p className="text-xs text-zinc-500 mb-2">유종별 고정세금 (정부 고시, 탄력세율 적용)</p>
            <div className="space-y-1.5">
              {taxDetails.map(({ label, amount }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-zinc-400 text-xs">{label}</span>
                  {amount > 0 ? (
                    <span className="text-zinc-200 text-xs font-medium tabular-nums">{amount.toFixed(2)}원/L</span>
                  ) : (
                    <span className="text-zinc-500 text-xs tabular-nums">판매가 ÷ 11</span>
                  )}
                </div>
              ))}
              <div className="h-px bg-zinc-700 mt-2 mb-1" />
              <div className="flex justify-between items-center">
                <span className="text-zinc-300 text-xs font-semibold">고정세 합계</span>
                <span style={{ color: fuelColor }} className="text-xs font-bold tabular-nums">{fixedTax.toFixed(2)}원/L</span>
              </div>
            </div>
          </div>
          {/* 세전가 공식 */}
          <div className="bg-zinc-800 rounded-lg p-3 flex flex-col justify-center">
            <p className="text-xs text-zinc-500 mb-2">세전가 계산식</p>
            <div className="text-xs space-y-1.5 text-zinc-300">
              <div>판매가 <span className="text-zinc-500">×</span> <span className="text-white">(10/11)</span></div>
              <div className="text-zinc-500">− 고정세금 ({fixedTax.toFixed(0)}원)</div>
              <div className="h-px bg-zinc-700" />
              <div style={{ color: fuelColor }} className="font-bold">= {fmt(latest.pretax)}원/L</div>
            </div>
            <div className="mt-3 pt-2 border-t border-zinc-700">
              <p className="text-xs text-zinc-500 mb-1">국제가 환산식</p>
              <div className="text-xs text-zinc-300">
                $/Bbl <span className="text-zinc-500">×</span> 환율
              </div>
              <div className="text-zinc-500 text-xs">÷ 158.987 (L/Bbl)</div>
              <div className="text-sky-400 font-bold text-xs mt-0.5">= {fmt(latest.intlKrw)}원/L</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
