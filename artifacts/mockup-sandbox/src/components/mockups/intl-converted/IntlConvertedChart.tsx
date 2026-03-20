import { useState } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, Area,
} from "recharts";

const LITERS_PER_BARREL = 158.987;

type FuelType = "gasoline" | "diesel";

const rawData = [
  { date: "02/20", intlG: 79.92, intlD: 92.07, exch: 1430, domG: 1689, domD: 1590 },
  { date: "02/23", intlG: 79.76, intlD: 91.03, exch: 1432, domG: 1691, domD: 1593 },
  { date: "02/24", intlG: 81.33, intlD: 91.87, exch: 1435, domG: 1691, domD: 1594 },
  { date: "02/25", intlG: 81.45, intlD: 91.69, exch: 1437, domG: 1692, domD: 1595 },
  { date: "02/26", intlG: 81.73, intlD: 91.88, exch: 1438, domG: 1692, domD: 1596 },
  { date: "02/27", intlG: 82.10, intlD: 92.28, exch: 1440, domG: 1693, domD: 1597 },
  { date: "03/02", intlG: 92.77, intlD: 114.51, exch: 1460, domG: 1702, domD: 1607 },
  { date: "03/03", intlG: 98.67, intlD: 125.24, exch: 1468, domG: 1723, domD: 1635 },
  { date: "03/04", intlG: 104.33, intlD: 140.59, exch: 1475, domG: 1777, domD: 1729 },
  { date: "03/05", intlG: 110.95, intlD: 152.19, exch: 1483, domG: 1834, domD: 1830 },
  { date: "03/06", intlG: 121.33, intlD: 154.74, exch: 1490, domG: 1872, domD: 1887 },
  { date: "03/09", intlG: 147.47, intlD: 184.41, exch: 1493, domG: 1903, domD: 1926 },
  { date: "03/10", intlG: 127.40, intlD: 160.37, exch: 1493, domG: 1907, domD: 1932 },
  { date: "03/11", intlG: 129.17, intlD: 163.56, exch: 1494, domG: 1904, domD: 1927 },
  { date: "03/12", intlG: 143.44, intlD: 193.50, exch: 1495, domG: 1899, domD: 1919 },
  { date: "03/13", intlG: 149.76, intlD: 191.48, exch: 1497, domG: 1864, domD: 1873 },
  { date: "03/16", intlG: 153.48, intlD: 189.93, exch: 1497, domG: 1833, domD: 1832 },
  { date: "03/17", intlG: 152.16, intlD: 197.20, exch: 1497, domG: 1828, domD: 1826 },
  { date: "03/18", intlG: 153.10, intlD: 197.87, exch: 1498, domG: 1824, domD: 1822 },
  { date: "03/19", intlG: 165.24, intlD: 223.49, exch: 1497, domG: 1822, domD: 1819 },
];

const chartData = rawData.map(r => {
  const convG = Math.round((r.intlG * r.exch) / LITERS_PER_BARREL);
  const convD = Math.round((r.intlD * r.exch) / LITERS_PER_BARREL);
  return {
    date: r.date,
    exch: r.exch,
    intlGasoline_usd: r.intlG,
    intlDiesel_usd: r.intlD,
    convGasoline: convG,
    convDiesel: convD,
    domGasoline: r.domG,
    domDiesel: r.domD,
    marginG: r.domG - convG,
    marginD: r.domD - convD,
  };
});

const fmt = (v: number) => v.toLocaleString("ko-KR");

const CustomTooltip = ({ active, payload, label, fuel }: any) => {
  if (!active || !payload?.length) return null;
  const d = chartData.find(r => r.date === label);
  if (!d) return null;
  const isGas = fuel === "gasoline";
  const conv = isGas ? d.convGasoline : d.convDiesel;
  const dom = isGas ? d.domGasoline : d.domDiesel;
  const margin = dom - conv;
  const intlUsd = isGas ? d.intlGasoline_usd : d.intlDiesel_usd;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm min-w-[210px]">
      <p className="font-bold text-gray-800 mb-2 border-b pb-1">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">국제({isGas ? "휘발유" : "경유"})</span>
          <span className="font-semibold text-blue-700">${intlUsd.toFixed(2)}/Bbl</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">  환율</span>
          <span className="text-gray-600">{fmt(d.exch)}원/$</span>
        </div>
        <div className="flex justify-between gap-4 border-t pt-1 mt-1">
          <span className="text-gray-500">국제 환산가</span>
          <span className="font-bold text-blue-600">{fmt(conv)}원/L</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">국내 평균가</span>
          <span className="font-bold text-yellow-600">{fmt(dom)}원/L</span>
        </div>
        <div className={`flex justify-between gap-4 border-t pt-1 mt-1 ${margin >= 0 ? "text-orange-600" : "text-green-600"}`}>
          <span className="font-semibold">국내 - 환산</span>
          <span className="font-bold">{margin >= 0 ? "+" : ""}{fmt(margin)}원/L</span>
        </div>
      </div>
    </div>
  );
};

export function IntlConvertedChart() {
  const [fuel, setFuel] = useState<FuelType>("gasoline");

  const isGas = fuel === "gasoline";
  const convKey = isGas ? "convGasoline" : "convDiesel";
  const domKey = isGas ? "domGasoline" : "domDiesel";
  const marginKey = isGas ? "marginG" : "marginD";

  const lastRow = chartData[chartData.length - 1];
  const latestConv = isGas ? lastRow.convGasoline : lastRow.convDiesel;
  const latestDom = isGas ? lastRow.domGasoline : lastRow.domDiesel;
  const latestMargin = latestDom - latestConv;
  const latestIntlUsd = isGas ? lastRow.intlGasoline_usd : lastRow.intlDiesel_usd;

  const allVals = chartData.flatMap(d => [
    isGas ? d.convGasoline : d.convDiesel,
    isGas ? d.domGasoline : d.domDiesel,
  ]);
  const minVal = Math.min(...allVals) - 80;
  const maxVal = Math.max(...allVals) + 80;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">

        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">국제-국내 유가 비교 (동일 단위 환산)</h1>
          <p className="text-sm text-gray-500 mt-1">
            국제 제품가격($/Bbl) → <span className="font-medium text-blue-700">환율 × ÷158.987L</span> → 원/L 환산 후 국내 평균가와 비교
          </p>
        </div>

        {/* 유종 탭 */}
        <div className="flex gap-2 mb-5">
          {(["gasoline", "diesel"] as FuelType[]).map(f => (
            <button
              key={f}
              onClick={() => setFuel(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                fuel === f
                  ? f === "gasoline"
                    ? "bg-yellow-400 border-yellow-400 text-white shadow"
                    : "bg-emerald-500 border-emerald-500 text-white shadow"
                  : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f === "gasoline" ? "휘발유" : "경유"}
            </button>
          ))}
        </div>

        {/* 핵심 지표 카드 3개 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs text-blue-600 font-medium mb-1">국제 환산가 (3/19)</p>
            <p className="text-2xl font-bold text-blue-700">{fmt(latestConv)}원</p>
            <p className="text-xs text-blue-500 mt-1">${latestIntlUsd.toFixed(2)}/Bbl × {fmt(lastRow.exch)}원 ÷ 158.987L</p>
          </div>
          <div className={`border rounded-xl p-4 ${isGas ? "bg-yellow-50 border-yellow-200" : "bg-emerald-50 border-emerald-200"}`}>
            <p className={`text-xs font-medium mb-1 ${isGas ? "text-yellow-600" : "text-emerald-600"}`}>국내 평균가 (3/19)</p>
            <p className={`text-2xl font-bold ${isGas ? "text-yellow-700" : "text-emerald-700"}`}>{fmt(latestDom)}원</p>
            <p className={`text-xs mt-1 ${isGas ? "text-yellow-500" : "text-emerald-500"}`}>오피넷 전국 평균 (원/L)</p>
          </div>
          <div className={`border rounded-xl p-4 ${latestMargin >= 0 ? "bg-orange-50 border-orange-200" : "bg-green-50 border-green-200"}`}>
            <p className={`text-xs font-medium mb-1 ${latestMargin >= 0 ? "text-orange-600" : "text-green-600"}`}>
              국내 - 환산 차이
            </p>
            <p className={`text-2xl font-bold ${latestMargin >= 0 ? "text-orange-700" : "text-green-700"}`}>
              {latestMargin >= 0 ? "+" : ""}{fmt(latestMargin)}원
            </p>
            <p className={`text-xs mt-1 ${latestMargin >= 0 ? "text-orange-500" : "text-green-500"}`}>
              {latestMargin >= 0 ? "국내가 더 비쌈 (세금·유통비 등)" : "국제 환산가가 더 비쌈"}
            </p>
          </div>
        </div>

        {/* 메인 차트 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-gray-800">
                {isGas ? "휘발유" : "경유"} — 국제 환산가 vs 국내 평균가 (원/L)
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">2026년 2/20 ~ 3/19 (최근 30일)</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-blue-500 inline-block rounded" style={{borderTop:"2px dashed #3b82f6", display:"inline-block"}} />국제 환산가</span>
              <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-yellow-400 inline-block rounded" />국내 평균가</span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="marginFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#6b7280", fontWeight: 600 }}
                tickLine={false} axisLine={{ stroke: "#e5e7eb" }}
                interval={3} height={32} tickMargin={8}
              />
              <YAxis
                domain={[minVal, maxVal]}
                tick={{ fontSize: 11, fill: "#6b7280", fontWeight: 600 }}
                tickFormatter={v => `${fmt(v)}`}
                tickCount={6} width={62} axisLine={false} tickLine={false}
              />
              <Tooltip content={<CustomTooltip fuel={fuel} />} />
              <Line
                dataKey={convKey}
                name="국제 환산가"
                stroke="#3b82f6"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              <Line
                dataKey={domKey}
                name="국내 평균가"
                stroke={isGas ? "#eab308" : "#22c55e"}
                strokeWidth={2.5}
                dot={{ r: 3, fill: isGas ? "#eab308" : "#22c55e", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* 차이(마진) 보조 차트 */}
          <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
            <p className="text-xs font-semibold text-gray-500 mb-2">국내 - 국제환산 차이 (원/L) — 양수: 국내가 더 비쌈</p>
            <ResponsiveContainer width="100%" height={120}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f8f8f8" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickLine={false} axisLine={false}
                  interval={3} height={24} tickMargin={6}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  tickFormatter={v => `${v > 0 ? "+" : ""}${fmt(v)}`}
                  width={62} axisLine={false} tickLine={false} tickCount={4}
                />
                <Tooltip
                  formatter={(v: number) => [`${v > 0 ? "+" : ""}${fmt(v)}원/L`, "차이 (국내-환산)"]}
                  contentStyle={{ fontSize: 11 }}
                />
                <ReferenceLine y={0} stroke="#d1d5db" strokeWidth={1.5} />
                <Area
                  type="monotone"
                  dataKey={marginKey}
                  name="차이"
                  fill={chartData[chartData.length - 1][marginKey as keyof typeof chartData[0]] as number >= 0
                    ? "#fed7aa" : "#bbf7d0"}
                  stroke={chartData[chartData.length - 1][marginKey as keyof typeof chartData[0]] as number >= 0
                    ? "#f97316" : "#22c55e"}
                  strokeWidth={1.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 하단 설명 */}
        <div className="mt-4 bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
          <strong>환산 공식:</strong> 국제 제품가격($/Bbl) × 당일 환율(원/$) ÷ 158.987(L/Bbl) = 원/L
          &nbsp;·&nbsp; 국내가격에는 교통세·부가세·유통마진 등이 포함되어 있어 차이가 발생합니다.
          {fuel === "diesel" && (
            <span className="ml-1 text-orange-700 font-semibold">
              경유는 최근 국제 환산가가 국내가를 역전하는 현상 발생 (3월 중순 이후).
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
