import { useState } from "react";
import {
  ComposedChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Search, ChevronDown } from "lucide-react";

const CEILING = { gasoline: 1724, diesel: 1713, kerosene: 1320 };

const labels = [
  "02-28","03-01","03-02","03-03","03-04","03-05","03-06","03-07",
  "03-08","03-09","03-10","03-11","03-12","03-13","03-14","03-15",
  "03-16","03-17","03-18","03-19","03-20","03-21","03-22","03-23",
  "03-24","03-25","03-26","03-27",
];

const baseGasoline = [
  1688,1690,1695,1704,1716,1730,1760,1800,1830,1865,1890,1903,1910,1920,
  1905,1895,1882,1868,1855,1845,1838,1830,1825,1820,1816,1812,1808,1805,
];
const baseDiesel = [
  1582,1585,1592,1602,1618,1635,1666,1712,1750,1790,1820,1840,1855,1865,
  1850,1838,1825,1812,1800,1790,1782,1776,1770,1765,1760,1756,1752,1748,
];
const stationGasoline = [
  1720,1722,1728,1738,1752,1780,1810,1850,1880,1920,1950,1965,1978,1990,
  1975,1960,1948,1934,1920,1910,1902,1895,1888,1882,1876,1872,1868,1864,
];

const chartData = labels.map((label, i) => ({
  label,
  gasoline: baseGasoline[i],
  diesel: baseDiesel[i],
  stationGasoline: stationGasoline[i],
  aboveGasoline: Math.round(3000 + i * 80 - (i > 13 ? (i - 13) * 120 : 0)),
  belowGasoline: Math.round(7500 - i * 80 + (i > 13 ? (i - 13) * 120 : 0)),
}));

const fmt = (v: number) => v.toLocaleString("ko-KR");

function CustomTooltip({ active, payload, label, showStation }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const isEffective = label === "03-13";
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[180px]">
      <p className="font-bold text-gray-800 mb-1.5 text-[11px]">{label}{isEffective ? " (공표일)" : ""}</p>
      {showStation && (
        <div className="mb-2 pb-2 border-b border-gray-100">
          <p className="text-gray-500 text-[10px] mb-0.5">서울셀프주유소 (개별)</p>
          <p className="font-semibold text-amber-600">{fmt(d.stationGasoline)}원</p>
          <div className="flex gap-3 mt-1">
            <span className="flex items-center gap-0.5 text-red-500 font-semibold">
              <TrendingUp className="w-3 h-3" />
              기준초과 {Math.max(0, i - 8) * 1 + 3}일
            </span>
            <span className="flex items-center gap-0.5 text-blue-500 font-semibold">
              <TrendingDown className="w-3 h-3" />
              기준이하 {Math.max(0, 14 - i)}일
            </span>
          </div>
        </div>
      )}
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4">
          <span className="text-amber-600">● 휘발유 평균</span>
          <span className="font-semibold text-gray-800">{fmt(d.gasoline)}원</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-green-600">● 경유 평균</span>
          <span className="font-semibold text-gray-800">{fmt(d.diesel)}원</span>
        </div>
      </div>
      <div className="mt-2 pt-1.5 border-t border-gray-100 flex justify-between">
        <span className="flex items-center gap-1 text-red-500 font-semibold text-[10px]">
          <TrendingUp className="w-3 h-3" />
          {fmt(d.aboveGasoline)}개 초과
        </span>
        <span className="flex items-center gap-1 text-blue-500 font-semibold text-[10px]">
          <TrendingDown className="w-3 h-3" />
          {fmt(d.belowGasoline)}개 이하
        </span>
      </div>
    </div>
  );
}

const i = 0;

export function CeilingTrendPage() {
  const [sido, setSido] = useState("전국");
  const [fuels, setFuels] = useState({ gasoline: true, diesel: true, kerosene: false });
  const [showStation, setShowStation] = useState(true);
  const [search, setSearch] = useState("서울셀프주유소");

  const toggleFuel = (f: keyof typeof fuels) =>
    setFuels(p => ({ ...p, [f]: !p[f] }));

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 font-sans">
      <div className="max-w-[1100px] mx-auto space-y-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">최고가격제 이후 변동추이</h1>
          <p className="text-xs text-gray-500 mt-0.5">석유 최고가격 공표 전후 4주(28일) 구간 유가 추이</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
          <div>
            <p className="text-[10px] text-gray-400 mb-0.5 font-medium">공표일</p>
            <button className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
              2026-03-13
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          <div className="w-px h-8 bg-gray-200" />

          <div className="flex gap-2">
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5 font-medium">시도</p>
              <button className="flex items-center gap-1.5 border border-gray-200 text-xs text-gray-700 px-3 py-1.5 rounded-lg bg-white">
                {sido}
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5 font-medium">시군구</p>
              <button className="flex items-center gap-1.5 border border-gray-200 text-xs text-gray-400 px-3 py-1.5 rounded-lg bg-gray-50" disabled>
                전체
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="w-px h-8 bg-gray-200" />

          <div>
            <p className="text-[10px] text-gray-400 mb-0.5 font-medium">유종</p>
            <div className="flex gap-2">
              {[
                { key: "gasoline", label: "휘발유", color: "bg-amber-400" },
                { key: "diesel", label: "경유", color: "bg-green-500" },
                { key: "kerosene", label: "등유", color: "bg-sky-400" },
              ].map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => toggleFuel(key as keyof typeof fuels)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                    fuels[key as keyof typeof fuels]
                      ? "border-gray-300 text-gray-800 bg-white font-medium"
                      : "border-gray-100 text-gray-400 bg-gray-50"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${color} ${fuels[key as keyof typeof fuels] ? "opacity-100" : "opacity-30"}`} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="w-px h-8 bg-gray-200" />

          <div className="flex-1 min-w-[180px]">
            <p className="text-[10px] text-gray-400 mb-0.5 font-medium">주유소 검색</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setShowStation(e.target.value.length > 0);
                }}
                placeholder="주유소 이름 검색..."
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-start justify-between mb-1">
            <div>
              <p className="text-sm font-semibold text-gray-800">최고가격 공표 전후 유가 변동</p>
              <p className="text-xs text-gray-400 mt-0.5">
                수평 점선: 최고가격 기준 (휘발유 <span className="text-amber-600 font-bold">1,724원</span> / 경유 <span className="text-green-600 font-bold">1,713원</span>)
              </p>
            </div>
            <div className="text-right text-[10px] text-gray-400">
              <p>공표일: 2026-03-13</p>
              <p>전국 평균 기준</p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={370}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: 12, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
                interval={3}
                height={32}
                tickMargin={8}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }}
                tickFormatter={v => `${fmt(v)}원`}
                domain={[1550, 2020]}
                tickCount={6}
                width={72}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip showStation={showStation} />} />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                iconType="circle"
                iconSize={10}
                formatter={(val) => {
                  if (val === "gasoline") return "휘발유 평균";
                  if (val === "diesel") return "경유 평균";
                  if (val === "stationGasoline") return "서울셀프주유소 (휘발유)";
                  return val;
                }}
              />
              <ReferenceLine
                y={CEILING.gasoline}
                stroke="#d97706"
                strokeDasharray="6 3"
                strokeWidth={1.5}
                label={{ value: "휘발유 상한 1,724원", position: "insideTopRight", fontSize: 10, fill: "#d97706", dy: -4 }}
              />
              <ReferenceLine
                y={CEILING.diesel}
                stroke="#16a34a"
                strokeDasharray="6 3"
                strokeWidth={1.5}
                label={{ value: "경유 상한 1,713원", position: "insideBottomRight", fontSize: 10, fill: "#16a34a", dy: 12 }}
              />
              <ReferenceLine
                x="03-13"
                stroke="#3b82f6"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: "공표일", position: "top", fontSize: 10, fill: "#3b82f6" }}
              />
              {fuels.gasoline && (
                <Line
                  type="monotone"
                  dataKey="gasoline"
                  stroke="#eab308"
                  strokeWidth={2.5}
                  dot={false}
                  name="gasoline"
                  connectNulls
                />
              )}
              {fuels.diesel && (
                <Line
                  type="monotone"
                  dataKey="diesel"
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  dot={false}
                  name="diesel"
                  connectNulls
                />
              )}
              {showStation && (
                <Line
                  type="monotone"
                  dataKey="stationGasoline"
                  stroke="#6366f1"
                  strokeWidth={2}
                  strokeDasharray="5 2"
                  dot={false}
                  name="stationGasoline"
                  connectNulls
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 flex items-center gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-red-500" />
            <span><span className="font-bold text-red-500">빨간색 ↑</span> = 기준가보다 비싼 업체 수</span>
          </div>
          <div className="w-px h-4 bg-blue-200" />
          <div className="flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4 text-blue-500" />
            <span><span className="font-bold text-blue-500">파란색 ↓</span> = 기준가보다 싼 업체 수</span>
          </div>
          <div className="w-px h-4 bg-blue-200" />
          <span className="text-gray-400">주유소 검색 시: 기준가 초과/미만 <strong>누계 횟수</strong></span>
        </div>
      </div>
    </div>
  );
}
