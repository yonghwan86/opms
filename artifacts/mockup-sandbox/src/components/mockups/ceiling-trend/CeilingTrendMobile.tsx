import { useState } from "react";
import {
  ComposedChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Search, ChevronDown, ChevronUp } from "lucide-react";

const CEILING = { gasoline: 1724, diesel: 1713, kerosene: 1320 };
const fmt = (v: number) => v.toLocaleString("ko-KR");

const labels = Array.from({ length: 28 }, (_, i) => {
  const d = new Date("2026-02-27");
  d.setDate(d.getDate() + i);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});

const baseGasoline = [1688,1690,1695,1704,1716,1730,1760,1800,1830,1865,1890,1903,1910,1920,1905,1895,1882,1868,1855,1845,1838,1830,1825,1820,1816,1812,1808,1805];
const baseDiesel   = [1582,1585,1592,1602,1618,1635,1666,1712,1750,1790,1820,1840,1855,1865,1850,1838,1825,1812,1800,1790,1782,1776,1770,1765,1760,1756,1752,1748];
const stationGas   = [1720,1722,1728,1738,1752,1780,1810,1850,1880,1920,1950,1965,1978,1990,1975,1960,1948,1934,1920,1910,1902,1895,1888,1882,1876,1872,1868,1864];

const chartData = labels.map((label, i) => ({
  label,
  gasoline: baseGasoline[i],
  diesel: baseDiesel[i],
  stationGas: stationGas[i],
  aboveGasoline: Math.max(0, 2000 + i * 250 - (i > 14 ? (i - 14) * 400 : 0)),
  belowGasoline: Math.max(0, 8500 - i * 250 + (i > 14 ? (i - 14) * 400 : 0)),
}));

function MobileTooltip({ active, payload, label, showStation }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const idx = chartData.findIndex(r => r.label === label);
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl px-3 py-2.5 text-xs w-[165px]">
      <p className="font-bold text-gray-800 mb-1.5 border-b border-gray-100 pb-1 text-[11px]">
        {label}{label === "03-13" ? " ★공표일" : ""}
      </p>
      {showStation && (
        <div className="mb-1.5 pb-1.5 border-b border-gray-100">
          <p className="text-gray-400 text-[9px] mb-0.5">서울셀프주유소</p>
          <p className="font-bold text-indigo-600 text-[11px]">{fmt(d.stationGas)}원</p>
          <div className="flex gap-2 mt-1">
            <span className="flex items-center gap-0.5 text-red-500 font-bold text-[9px]"><TrendingUp className="w-2.5 h-2.5" />초과 {Math.max(0, idx - 10)}일</span>
            <span className="flex items-center gap-0.5 text-blue-500 font-bold text-[9px]"><TrendingDown className="w-2.5 h-2.5" />이하 {Math.max(0, 12 - idx)}일</span>
          </div>
        </div>
      )}
      <div className="space-y-0.5 mb-1">
        <div className="flex justify-between gap-2"><span className="text-amber-600 text-[10px]">● 휘발유</span><span className="font-semibold">{fmt(d.gasoline)}원</span></div>
        <div className="flex justify-between gap-2"><span className="text-green-600 text-[10px]">● 경유</span><span className="font-semibold">{fmt(d.diesel)}원</span></div>
      </div>
      <div className="pt-1 border-t border-gray-100 flex justify-between">
        <span className="flex items-center gap-0.5 text-red-500 font-bold text-[9px]"><TrendingUp className="w-2.5 h-2.5" />{fmt(d.aboveGasoline)}</span>
        <span className="flex items-center gap-0.5 text-blue-500 font-bold text-[9px]"><TrendingDown className="w-2.5 h-2.5" />{fmt(d.belowGasoline)}</span>
      </div>
    </div>
  );
}

export function CeilingTrendMobile() {
  const [fuels, setFuels] = useState({ gasoline: true, diesel: true, kerosene: false });
  const [search, setSearch] = useState("서울셀프주유소");
  const [showStation, setShowStation] = useState(true);
  const [filterOpen, setFilterOpen] = useState(true);

  const toggleFuel = (f: keyof typeof fuels) => setFuels(p => ({ ...p, [f]: !p[f] }));

  return (
    <div className="min-h-screen bg-gray-50 font-sans" style={{ width: 390, margin: "0 auto" }}>
      {/* 모바일 헤더 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <h1 className="text-base font-bold text-gray-900">최고가격제 이후 변동추이</h1>
        <p className="text-[10px] text-gray-400 mt-0.5">공표 전후 28일 유가 추이</p>
      </div>

      <div className="px-3 pt-3 pb-6 space-y-3">
        {/* 필터 패널 (접기/펼치기) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setFilterOpen(p => !p)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-700"
          >
            <span className="flex items-center gap-2 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              공표일: 2026-03-13 · 전국 전체
            </span>
            {filterOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {filterOpen && (
            <div className="px-4 pb-3 pt-0 space-y-3 border-t border-gray-100">
              {/* 1행: 공표일 + 시도 + 시군구 */}
              <div className="flex gap-2 flex-wrap">
                <div>
                  <p className="text-[9px] text-gray-400 mb-0.5 font-medium">공표일</p>
                  <button className="flex items-center gap-1 bg-blue-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">
                    2026-03-13 <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 mb-0.5 font-medium">시도</p>
                  <button className="flex items-center gap-1 border border-gray-200 text-[11px] text-gray-700 px-2.5 py-1.5 rounded-lg">전국 <ChevronDown className="w-3 h-3" /></button>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 mb-0.5 font-medium">시군구</p>
                  <button disabled className="flex items-center gap-1 border border-gray-100 text-[11px] text-gray-400 px-2.5 py-1.5 rounded-lg bg-gray-50">전체 <ChevronDown className="w-3 h-3" /></button>
                </div>
              </div>

              {/* 2행: 주유소 검색 */}
              <div>
                <p className="text-[9px] text-gray-400 mb-0.5 font-medium">주유소 검색</p>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setShowStation(e.target.value.length > 0); }}
                    placeholder="주유소 이름 검색..."
                    className="w-full pl-7 pr-3 py-2 text-[11px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 차트 카드 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
          {/* 유종 토글 — 차트 카드 상단 우측 */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-gray-400 font-medium">수평 점선: 최고가격 기준</p>
            <div className="flex gap-1">
              {[
                { key: "gasoline", label: "휘발유", dot: "bg-amber-400" },
                { key: "diesel",   label: "경유",   dot: "bg-green-500" },
                { key: "kerosene", label: "등유",   dot: "bg-sky-400" },
              ].map(({ key, label, dot }) => (
                <button
                  key={key}
                  onClick={() => toggleFuel(key as keyof typeof fuels)}
                  className={`flex items-center gap-1 text-[10px] px-1.5 py-1 rounded-md border transition-all ${
                    fuels[key as keyof typeof fuels]
                      ? "border-gray-300 text-gray-700 bg-white font-semibold"
                      : "border-gray-100 text-gray-400 bg-gray-50"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${dot} ${fuels[key as keyof typeof fuels] ? "" : "opacity-30"}`} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 60, left: 4, bottom: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#374151", fontWeight: 600 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} interval={6} height={28} tickMargin={6} />
              <YAxis tick={{ fontSize: 9, fill: "#374151", fontWeight: 600 }} tickFormatter={v => `${Math.round(v / 100) * 100}`} domain={[1550, 2020]} tickCount={5} width={40} axisLine={false} tickLine={false} />
              <Tooltip content={<MobileTooltip showStation={showStation} />} />
              {fuels.gasoline && <ReferenceLine y={CEILING.gasoline} stroke="#d97706" strokeDasharray="5 3" strokeWidth={1.5} label={{ value: "1,724", position: "insideRight", fontSize: 8, fill: "#d97706", dx: 4 }} />}
              {fuels.diesel   && <ReferenceLine y={CEILING.diesel}   stroke="#16a34a" strokeDasharray="5 3" strokeWidth={1.5} label={{ value: "1,713", position: "insideRight", fontSize: 8, fill: "#16a34a", dx: 4 }} />}
              <ReferenceLine x="03-13" stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: "공표일", position: "top", fontSize: 9, fill: "#3b82f6" }} />
              {fuels.gasoline && <Line type="monotone" dataKey="gasoline"   stroke="#eab308" strokeWidth={2}   dot={false} connectNulls />}
              {fuels.diesel   && <Line type="monotone" dataKey="diesel"     stroke="#22c55e" strokeWidth={2}   dot={false} connectNulls />}
              {showStation && fuels.gasoline && <Line type="monotone" dataKey="stationGas" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="5 2" dot={false} connectNulls />}
            </ComposedChart>
          </ResponsiveContainer>

          {/* 모바일 범례 */}
          <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-gray-500">
            {fuels.gasoline && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block" />휘발유 평균</span>}
            {fuels.diesel   && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block" />경유 평균</span>}
            {showStation && fuels.gasoline && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-indigo-500 inline-block border-dashed" style={{borderTop:"2px dashed #6366f1", height:0}} />서울셀프(휘발유)</span>}
          </div>

          {/* 화살표 범례 설명 */}
          <div className="mt-2 pt-2 border-t border-gray-100 flex gap-3 text-[9px] flex-wrap">
            <span className="flex items-center gap-1 text-red-500 font-bold"><TrendingUp className="w-3 h-3" />빨간↑ 초과업체</span>
            <span className="flex items-center gap-1 text-blue-500 font-bold"><TrendingDown className="w-3 h-3" />파란↓ 이하업체</span>
            <span className="text-gray-400">주유소검색시: 누계횟수</span>
          </div>
        </div>

        {/* 정적 툴팁 예시 카드 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
          <p className="text-[10px] text-gray-400 font-medium mb-2">그래프 터치 시 나타나는 정보 예시</p>
          <div className="flex gap-2">
            <div>
              <p className="text-[9px] text-gray-400 mb-1">지역 평균 터치 시</p>
              <div className="bg-white border border-gray-300 rounded-lg shadow-md px-2.5 py-2 text-[10px] w-[150px]">
                <p className="font-bold text-gray-800 mb-1 border-b border-gray-100 pb-1">03-16</p>
                <div className="space-y-0.5 mb-1.5">
                  <div className="flex justify-between gap-2"><span className="text-amber-600">● 휘발유</span><span className="font-semibold">1,855원</span></div>
                  <div className="flex justify-between gap-2"><span className="text-green-600">● 경유</span><span className="font-semibold">1,800원</span></div>
                </div>
                <div className="flex justify-between pt-1 border-t border-gray-100">
                  <span className="flex items-center gap-0.5 text-red-500 font-bold text-[9px]"><TrendingUp className="w-2.5 h-2.5" />4,200개</span>
                  <span className="flex items-center gap-0.5 text-blue-500 font-bold text-[9px]"><TrendingDown className="w-2.5 h-2.5" />7,300개</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-[9px] text-gray-400 mb-1">주유소 검색 시</p>
              <div className="bg-white border border-gray-300 rounded-lg shadow-md px-2.5 py-2 text-[10px] w-[150px]">
                <p className="font-bold text-gray-800 mb-1 border-b border-gray-100 pb-1">03-16</p>
                <div className="mb-1.5 pb-1.5 border-b border-gray-100">
                  <p className="text-[9px] text-gray-400">서울셀프주유소</p>
                  <p className="font-bold text-indigo-600">1,948원</p>
                  <div className="flex gap-1.5 mt-0.5">
                    <span className="flex items-center gap-0.5 text-red-500 font-bold text-[9px]"><TrendingUp className="w-2.5 h-2.5" />초과 3일</span>
                    <span className="flex items-center gap-0.5 text-blue-500 font-bold text-[9px]"><TrendingDown className="w-2.5 h-2.5" />이하 11일</span>
                  </div>
                </div>
                <div className="flex justify-between pt-0.5">
                  <span className="flex items-center gap-0.5 text-red-500 font-bold text-[9px]"><TrendingUp className="w-2.5 h-2.5" />4,200개</span>
                  <span className="flex items-center gap-0.5 text-blue-500 font-bold text-[9px]"><TrendingDown className="w-2.5 h-2.5" />7,300개</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
