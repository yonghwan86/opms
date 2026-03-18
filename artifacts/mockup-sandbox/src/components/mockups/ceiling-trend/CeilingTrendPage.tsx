import { useState } from "react";
import {
  ComposedChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Search, ChevronDown } from "lucide-react";

const CEILING = { gasoline: 1724, diesel: 1713, kerosene: 1320 };
const fmt = (v: number) => v.toLocaleString("ko-KR");

const labels = Array.from({ length: 28 }, (_, i) => {
  const d = new Date("2026-02-27");
  d.setDate(d.getDate() + i);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});

const baseGasoline = [1688,1690,1695,1704,1716,1730,1760,1800,1830,1865,1890,1903,1910,1920,1905,1895,1882,1868,1855,1845,1838,1830,1825,1820,1816,1812,1808,1805];
const baseDiesel =   [1582,1585,1592,1602,1618,1635,1666,1712,1750,1790,1820,1840,1855,1865,1850,1838,1825,1812,1800,1790,1782,1776,1770,1765,1760,1756,1752,1748];
const baseKerosene = [1295,1296,1298,1302,1308,1315,1325,1338,1350,1362,1372,1378,1383,1386,1381,1375,1370,1364,1358,1352,1348,1345,1342,1340,1338,1336,1334,1332];
const stationGas =   [1720,1722,1728,1738,1752,1780,1810,1850,1880,1920,1950,1965,1978,1990,1975,1960,1948,1934,1920,1910,1902,1895,1888,1882,1876,1872,1868,1864];
const stationDsl =   [1618,1620,1624,1632,1645,1668,1694,1740,1778,1820,1854,1876,1892,1900,1885,1874,1862,1850,1840,1832,1826,1820,1815,1810,1806,1802,1798,1795];

const chartData = labels.map((label, i) => ({
  label,
  gasoline: baseGasoline[i],
  diesel: baseDiesel[i],
  kerosene: baseKerosene[i],
  stationGas: stationGas[i],
  stationDsl: stationDsl[i],
  aboveGasoline: Math.max(0, 2000 + i * 250 - (i > 14 ? (i - 14) * 400 : 0)),
  belowGasoline: Math.max(0, 8500 - i * 250 + (i > 14 ? (i - 14) * 400 : 0)),
}));

const TOOLTIP_IDX = 16;

function StaticTooltip({ showStation, fuels }: { showStation: boolean; fuels: Record<string, boolean> }) {
  const d = chartData[TOOLTIP_IDX];
  return (
    <div className="bg-white border border-gray-300 rounded-xl shadow-2xl px-3.5 py-3 text-xs w-[200px]">
      <p className="font-bold text-gray-800 mb-2 text-[11px] border-b border-gray-100 pb-1.5">03-16</p>

      {showStation && (
        <div className="mb-2 pb-2 border-b border-gray-100">
          <p className="text-gray-400 text-[10px] mb-0.5 font-medium">서울셀프주유소</p>
          {fuels.gasoline && (
            <div className="flex justify-between items-center">
              <span className="text-indigo-500 text-[10px]">● 휘발유</span>
              <span className="font-bold text-indigo-600 text-[11px]">{fmt(d.stationGas)}원</span>
            </div>
          )}
          {fuels.diesel && (
            <div className="flex justify-between items-center">
              <span className="text-violet-500 text-[10px]">● 경유</span>
              <span className="font-bold text-violet-600 text-[11px]">{fmt(d.stationDsl)}원</span>
            </div>
          )}
          <div className="flex gap-2.5 mt-1.5">
            <span className="flex items-center gap-0.5 text-red-500 font-bold text-[10px]">
              <TrendingUp className="w-3 h-3" />초과 3일
            </span>
            <span className="flex items-center gap-0.5 text-blue-500 font-bold text-[10px]">
              <TrendingDown className="w-3 h-3" />이하 11일
            </span>
          </div>
        </div>
      )}

      <div className="space-y-1 mb-2">
        {fuels.gasoline && (
          <div className="flex justify-between gap-3">
            <span className="text-amber-600">● 휘발유 평균</span>
            <span className="font-semibold text-gray-800">{fmt(d.gasoline)}원</span>
          </div>
        )}
        {fuels.diesel && (
          <div className="flex justify-between gap-3">
            <span className="text-green-600">● 경유 평균</span>
            <span className="font-semibold text-gray-800">{fmt(d.diesel)}원</span>
          </div>
        )}
        {fuels.kerosene && (
          <div className="flex justify-between gap-3">
            <span className="text-sky-500">● 등유 평균</span>
            <span className="font-semibold text-gray-800">{fmt(d.kerosene)}원</span>
          </div>
        )}
      </div>

      <div className="pt-1.5 border-t border-gray-100 flex justify-between gap-1">
        <span className="flex items-center gap-1 text-red-500 font-bold text-[10px]">
          <TrendingUp className="w-3 h-3" />{fmt(d.aboveGasoline)}개 초과
        </span>
        <span className="flex items-center gap-1 text-blue-500 font-bold text-[10px]">
          <TrendingDown className="w-3 h-3" />{fmt(d.belowGasoline)}개 이하
        </span>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label, showStation, fuels }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const idx = chartData.findIndex(r => r.label === label);
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl px-3 py-2.5 text-xs min-w-[185px]">
      <p className="font-bold text-gray-800 mb-1.5 border-b border-gray-100 pb-1">{label}{label === "03-13" ? " ★공표일" : ""}</p>
      {showStation && (
        <div className="mb-1.5 pb-1.5 border-b border-gray-100">
          <p className="text-gray-400 text-[10px] mb-0.5 font-medium">서울셀프주유소</p>
          {fuels.gasoline && <div className="flex justify-between"><span className="text-indigo-500 text-[10px]">● 휘발유</span><span className="font-bold text-indigo-600">{fmt(d.stationGas)}원</span></div>}
          {fuels.diesel && <div className="flex justify-between"><span className="text-violet-500 text-[10px]">● 경유</span><span className="font-bold text-violet-600">{fmt(d.stationDsl)}원</span></div>}
          <div className="flex gap-2 mt-1">
            <span className="flex items-center gap-0.5 text-red-500 font-bold text-[10px]"><TrendingUp className="w-3 h-3" />초과 {Math.max(0, idx - 10)}일</span>
            <span className="flex items-center gap-0.5 text-blue-500 font-bold text-[10px]"><TrendingDown className="w-3 h-3" />이하 {Math.max(0, 12 - idx)}일</span>
          </div>
        </div>
      )}
      <div className="space-y-0.5 mb-1.5">
        {fuels.gasoline && <div className="flex justify-between gap-3"><span className="text-amber-600">● 휘발유 평균</span><span className="font-semibold">{fmt(d.gasoline)}원</span></div>}
        {fuels.diesel && <div className="flex justify-between gap-3"><span className="text-green-600">● 경유 평균</span><span className="font-semibold">{fmt(d.diesel)}원</span></div>}
        {fuels.kerosene && <div className="flex justify-between gap-3"><span className="text-sky-500">● 등유 평균</span><span className="font-semibold">{fmt(d.kerosene)}원</span></div>}
      </div>
      <div className="pt-1 border-t border-gray-100 flex justify-between gap-1">
        <span className="flex items-center gap-1 text-red-500 font-bold text-[10px]"><TrendingUp className="w-3 h-3" />{fmt(d.aboveGasoline)}개</span>
        <span className="flex items-center gap-1 text-blue-500 font-bold text-[10px]"><TrendingDown className="w-3 h-3" />{fmt(d.belowGasoline)}개</span>
      </div>
    </div>
  );
}

export function CeilingTrendPage() {
  const [fuels, setFuels] = useState({ gasoline: true, diesel: true, kerosene: false });
  const [search, setSearch] = useState("서울셀프주유소");
  const [showStation, setShowStation] = useState(true);

  const toggleFuel = (f: keyof typeof fuels) => setFuels(p => ({ ...p, [f]: !p[f] }));

  const fuelConfig = [
    { key: "gasoline", label: "휘발유", dot: "bg-amber-400", ceiling: CEILING.gasoline, ceilingColor: "#d97706" },
    { key: "diesel",   label: "경유",   dot: "bg-green-500", ceiling: CEILING.diesel,   ceilingColor: "#16a34a" },
    { key: "kerosene", label: "등유",   dot: "bg-sky-400",   ceiling: CEILING.kerosene, ceilingColor: "#0284c7" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-5 font-sans">
      <div className="max-w-[1100px] mx-auto space-y-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">최고가격제 이후 변동추이</h1>
          <p className="text-xs text-gray-400 mt-0.5">석유 최고가격 공표 전후 4주(28일) 구간 유가 추이</p>
        </div>

        {/* 필터: 한 줄 (공표일 + 시도 + 시군구 + 주유소 검색) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5 font-medium">공표일</p>
              <button className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                2026-03-13 <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5 font-medium">시도</p>
              <button className="flex items-center gap-1.5 border border-gray-200 text-xs text-gray-700 px-3 py-1.5 rounded-lg">전국 <ChevronDown className="w-3 h-3" /></button>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5 font-medium">시군구</p>
              <button className="flex items-center gap-1.5 border border-gray-100 text-xs text-gray-400 px-3 py-1.5 rounded-lg bg-gray-50" disabled>전체 <ChevronDown className="w-3 h-3" /></button>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="flex-1 min-w-[200px]">
              <p className="text-[10px] text-gray-400 mb-0.5 font-medium">주유소 검색 <span className="text-gray-300">(선택된 유종 개별 추이 오버레이)</span></p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowStation(e.target.value.length > 0); }}
                  placeholder="주유소 이름 검색..."
                  className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 차트 카드 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">최고가격 공표 전후 유가 변동</p>
              <p className="text-xs text-gray-400 mt-0.5">수평 점선: 최고가격 기준</p>
            </div>
            {/* 유종 토글 — 차트 우상단 */}
            <div className="flex gap-1.5">
              {fuelConfig.map(({ key, label, dot }) => (
                <button
                  key={key}
                  onClick={() => toggleFuel(key as keyof typeof fuels)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                    fuels[key as keyof typeof fuels]
                      ? "border-gray-300 text-gray-800 bg-white font-medium shadow-sm"
                      : "border-gray-100 text-gray-400 bg-gray-50"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${dot} ${fuels[key as keyof typeof fuels] ? "" : "opacity-30"}`} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 차트 + 정적 툴팁 오버레이 */}
          <div className="relative">
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 80, left: 12, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} interval={3} height={32} tickMargin={8} />
                <YAxis tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} tickFormatter={v => `${fmt(v)}원`} domain={[1270, 2050]} tickCount={7} width={72} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip showStation={showStation} fuels={fuels} />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8}
                  formatter={v => {
                    if (v === "stationGas") return `서울셀프주유소 (휘발유)`;
                    if (v === "stationDsl") return `서울셀프주유소 (경유)`;
                    if (v === "gasoline")  return "휘발유 평균";
                    if (v === "diesel")    return "경유 평균";
                    if (v === "kerosene")  return "등유 평균";
                    return v;
                  }}
                />
                {fuelConfig.filter(f => fuels[f.key as keyof typeof fuels]).map(f => (
                  <ReferenceLine key={f.key} y={f.ceiling} stroke={f.ceilingColor} strokeDasharray="6 3" strokeWidth={1.5}
                    label={{ value: `${f.label} 상한 ${fmt(f.ceiling)}원`, position: "insideRight", fontSize: 9, fill: f.ceilingColor, dx: 8 }}
                  />
                ))}
                <ReferenceLine x="03-13" stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1.5}
                  label={{ value: "공표일", position: "top", fontSize: 10, fill: "#3b82f6" }}
                />
                {fuels.gasoline && <Line type="monotone" dataKey="gasoline" stroke="#eab308" strokeWidth={2.5} dot={false} name="gasoline" connectNulls />}
                {fuels.diesel   && <Line type="monotone" dataKey="diesel"   stroke="#22c55e" strokeWidth={2.5} dot={false} name="diesel"   connectNulls />}
                {fuels.kerosene && <Line type="monotone" dataKey="kerosene" stroke="#38bdf8" strokeWidth={2.5} dot={false} name="kerosene" connectNulls />}
                {showStation && fuels.gasoline && <Line type="monotone" dataKey="stationGas" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 2" dot={false} name="stationGas" connectNulls />}
                {showStation && fuels.diesel   && <Line type="monotone" dataKey="stationDsl" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 2" dot={false} name="stationDsl" connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>

            {/* 정적 툴팁 — 03-16 지점 시뮬레이션 */}
            <div className="absolute" style={{ top: 60, right: 140 }}>
              <StaticTooltip showStation={showStation} fuels={fuels} />
            </div>
          </div>

          {/* 범례 설명바 */}
          <div className="mt-2 pt-2.5 border-t border-gray-100 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-gray-500 items-center">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-red-500" />
              <span className="text-red-500 font-bold">빨간색 ↑</span> = 최고가보다 비싼 업체 수
            </span>
            <span className="w-px h-4 bg-gray-200" />
            <span className="flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-blue-500 font-bold">파란색 ↓</span> = 최고가보다 싼 업체 수
            </span>
            <span className="w-px h-4 bg-gray-200" />
            <span className="text-gray-400">주유소 검색 시: 최고가 초과/미만 누계 횟수</span>
          </div>
        </div>
      </div>
    </div>
  );
}
