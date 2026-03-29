import { useState } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

const LITERS_PER_BARREL = 158.987;

const FIXED_TAX: Record<Fuel, number> = {
  gasoline: 693.72,
  diesel:   475.88,
  kerosene:  72.45,
};

type Fuel = "gasoline" | "diesel" | "kerosene";

const FUEL_LABEL: Record<Fuel, string> = {
  gasoline: "휘발유",
  diesel:   "경유",
  kerosene: "등유",
};

const FUEL_COLOR: Record<Fuel, string> = {
  gasoline: "#ca8a04",
  diesel:   "#16a34a",
  kerosene: "#0284c7",
};

const ANNOUNCEMENT_DATES = ["03/13", "03/27"];

const rawData = [
  { date: "12/30", intlG: 67.2,  intlD: 79.1,  intlK: 75.1,  exch: 1470, domG: 1728, domD: 1630, domK: 1331 },
  { date: "01/06", intlG: 68.5,  intlD: 80.3,  intlK: 76.3,  exch: 1468, domG: 1724, domD: 1625, domK: 1330 },
  { date: "01/13", intlG: 70.1,  intlD: 81.9,  intlK: 77.8,  exch: 1465, domG: 1720, domD: 1620, domK: 1328 },
  { date: "01/20", intlG: 71.8,  intlD: 83.2,  intlK: 79.1,  exch: 1462, domG: 1716, domD: 1616, domK: 1326 },
  { date: "01/27", intlG: 70.5,  intlD: 82.0,  intlK: 77.9,  exch: 1460, domG: 1712, domD: 1612, domK: 1324 },
  { date: "02/03", intlG: 71.2,  intlD: 82.8,  intlK: 78.7,  exch: 1458, domG: 1709, domD: 1609, domK: 1322 },
  { date: "02/10", intlG: 72.4,  intlD: 84.1,  intlK: 79.9,  exch: 1455, domG: 1706, domD: 1606, domK: 1320 },
  { date: "02/17", intlG: 73.8,  intlD: 85.5,  intlK: 81.2,  exch: 1452, domG: 1704, domD: 1604, domK: 1318 },
  { date: "02/20", intlG: 79.9,  intlD: 92.1,  intlK: 87.5,  exch: 1430, domG: 1689, domD: 1590, domK: 1312 },
  { date: "02/24", intlG: 81.3,  intlD: 91.9,  intlK: 87.2,  exch: 1435, domG: 1691, domD: 1594, domK: 1313 },
  { date: "02/27", intlG: 82.1,  intlD: 92.3,  intlK: 87.7,  exch: 1440, domG: 1693, domD: 1597, domK: 1314 },
  { date: "03/03", intlG: 98.7,  intlD: 125.2, intlK: 118.9, exch: 1468, domG: 1723, domD: 1635, domK: 1324 },
  { date: "03/06", intlG: 121.3, intlD: 154.7, intlK: 147.0, exch: 1490, domG: 1872, domD: 1887, domK: 1474 },
  { date: "03/10", intlG: 127.4, intlD: 160.4, intlK: 152.4, exch: 1493, domG: 1907, domD: 1932, domK: 1584 },
  { date: "03/13", intlG: 149.8, intlD: 191.5, intlK: 181.9, exch: 1497, domG: 1864, domD: 1873, domK: 1574 },
  { date: "03/17", intlG: 152.2, intlD: 197.2, intlK: 187.3, exch: 1497, domG: 1828, domD: 1826, domK: 1526 },
  { date: "03/20", intlG: 158.4, intlD: 213.1, intlK: 202.4, exch: 1495, domG: 1820, domD: 1818, domK: 1515 },
  { date: "03/24", intlG: 146.1, intlD: 198.2, intlK: 188.3, exch: 1488, domG: 1819, domD: 1816, domK: 1509 },
  { date: "03/27", intlG: 139.2, intlD: 188.1, intlK: 178.7, exch: 1481, domG: 1839, domD: 1835, domK: 1516 },
  { date: "03/28", intlG: 137.8, intlD: 185.9, intlK: 176.6, exch: 1479, domG: 1856, domD: 1850, domK: 1526 },
];

function buildChartData(fuel: Fuel) {
  const tax = FIXED_TAX[fuel];
  return rawData.map(r => {
    const retail = fuel === "gasoline" ? r.domG : fuel === "diesel" ? r.domD : r.domK;
    const intlUsd = fuel === "gasoline" ? r.intlG : fuel === "diesel" ? r.intlD : r.intlK;
    const pretax  = Math.round(retail * (10 / 11) - tax);
    const intlKrw = Math.round((intlUsd * r.exch) / LITERS_PER_BARREL);
    return {
      date: r.date,
      retail,
      pretax,
      intlKrw,
      taxBurden: retail - pretax,
      margin: pretax - intlKrw,
      exch: r.exch,
      intlUsd,
    };
  });
}

const fmt = (v: number) => v.toLocaleString("ko-KR");

function CustomTooltip({ active, payload, label, fuel }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const color = FUEL_COLOR[fuel as Fuel];
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs min-w-[220px]">
      <p className="font-bold text-gray-700 mb-2 pb-1 border-b border-gray-100">{label}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">국제가 환산</span>
          <span className="font-semibold text-blue-600">{fmt(d.intlKrw)}원/L</span>
        </div>
        <div className="flex justify-between gap-4 text-gray-400 text-[11px]">
          <span>{d.intlUsd.toFixed(1)}$/Bbl × {fmt(d.exch)}원 ÷ 158.987</span>
        </div>
        <div className="flex justify-between gap-4 pt-1">
          <span style={{ color }} className="font-medium">국내 세전가</span>
          <span style={{ color }} className="font-bold">{fmt(d.pretax)}원/L</span>
        </div>
        <div className="h-px bg-gray-100 my-1" />
        <div className="flex justify-between gap-4">
          <span className="text-orange-500 font-medium">정제·유통 마진</span>
          <span className="font-bold text-orange-600">+{fmt(d.margin)}원/L</span>
        </div>
      </div>
    </div>
  );
}

export function TaxAwareChart() {
  const [fuel, setFuel] = useState<Fuel>("gasoline");
  const data = buildChartData(fuel);
  const color = FUEL_COLOR[fuel];
  const latest = data[data.length - 1];

  const allVals = data.flatMap(d => [d.retail, d.pretax, d.intlKrw]);
  const yMin = Math.floor(Math.min(...allVals) / 100) * 100 - 50;
  const yMax = Math.ceil(Math.max(...allVals)  / 100) * 100 + 50;

  return (
    <div className="min-h-screen bg-gray-50 p-5 font-sans">

      {/* 헤더 */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-base font-bold text-gray-900">국제-국내 제품가격 비교</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            국제가 환산(원/L) · 국내 세전가(원/L) · 국내 판매가(원/L) — 최근 90일
          </p>
        </div>
        {/* 유종 탭 */}
        <div className="flex gap-1">
          {(["gasoline", "diesel", "kerosene"] as Fuel[]).map(f => (
            <button
              key={f}
              onClick={() => setFuel(f)}
              className={`px-3 py-1 rounded text-xs font-semibold border transition-all ${
                fuel === f
                  ? "text-white border-transparent shadow-sm"
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-100"
              }`}
              style={fuel === f ? { backgroundColor: FUEL_COLOR[f], borderColor: FUEL_COLOR[f] } : {}}
            >
              {FUEL_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-4 mt-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">국내 세전가 (최근)</p>
          <p className="text-lg font-bold" style={{ color }}>{fmt(latest.pretax)}<span className="text-xs font-normal text-gray-400 ml-1">원/L</span></p>
          <p className="text-xs text-gray-300 mt-0.5">판매가×(10/11)−고정세금</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">국제가 환산 (최근)</p>
          <p className="text-lg font-bold text-blue-600">{fmt(latest.intlKrw)}<span className="text-xs font-normal text-gray-400 ml-1">원/L</span></p>
          <p className="text-xs text-gray-300 mt-0.5">$/Bbl×환율÷158.987</p>
        </div>
        <div className="bg-white border border-orange-100 rounded-xl p-3 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">정제·유통 마진</p>
          <p className="text-lg font-bold text-orange-600">+{fmt(latest.margin)}<span className="text-xs font-normal text-gray-400 ml-1">원/L</span></p>
          <p className="text-xs text-gray-300 mt-0.5">세전가 − 국제환산가</p>
        </div>
      </div>

      {/* 메인 차트 */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-400">
            단위 통일(원/L): 국제가는 <span className="font-medium text-gray-600">$/Bbl × 환율 ÷ 158.987</span> 으로 환산
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-0.5 bg-blue-500 rounded" />국제가 환산
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: color }} />국내 세전가
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={data} margin={{ top: 8, right: 20, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="marginFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f97316" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="taxFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.10} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
              interval={2}
              height={28}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `${fmt(v)}`}
              width={58}
              tickCount={7}
            />
            <Tooltip content={<CustomTooltip fuel={fuel} />} />

            {/* 공시일 수직선 */}
            {ANNOUNCEMENT_DATES.map(d => (
              <ReferenceLine
                key={d}
                x={d}
                stroke="#d1d5db"
                strokeDasharray="4 3"
                label={{ value: "공시", position: "top", fontSize: 10, fill: "#9ca3af" }}
              />
            ))}

            {/* 실선: 국제가 환산 */}
            <Line
              type="monotone"
              dataKey="intlKrw"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              name="국제가 환산 (원/L)"
            />
            {/* 실선: 국내 세전가 */}
            <Line
              type="monotone"
              dataKey="pretax"
              stroke={color}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5 }}
              name="국내 세전가 (원/L)"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 세금 구조 설명 */}
      <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 flex gap-6">
        <div>
          <span className="font-semibold">세전가 공식:</span>{" "}
          판매가 × (10/11) − 고정세금({FIXED_TAX[fuel].toFixed(0)}원/L)
        </div>
        <div className="text-blue-500">
          고정세금 = 교통·교육·주행세 합산 (탄력세율 적용, 매주 금요일 자동 갱신)
        </div>
        <div className="text-orange-600 font-medium">
          두 선 간격 = 정제·유통 마진 (세전가 − 국제환산가)
        </div>
      </div>
    </div>
  );
}
