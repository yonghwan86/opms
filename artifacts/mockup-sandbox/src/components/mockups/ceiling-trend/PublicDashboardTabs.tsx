import { useState } from "react";
import {
  ComposedChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";

const CEILING = { gasoline: 1724, diesel: 1713 };

const wtiData = [
  { label: "12-17", wti: 55.2, gasoline: 1691, diesel: 1584 },
  { label: "01-05", wti: 72.1, gasoline: 1708, diesel: 1605 },
  { label: "01-19", wti: 71.8, gasoline: 1715, diesel: 1612 },
  { label: "02-02", wti: 70.4, gasoline: 1689, diesel: 1582 },
  { label: "02-16", wti: 69.8, gasoline: 1691, diesel: 1585 },
  { label: "03-02", wti: 82.5, gasoline: 1785, diesel: 1700 },
  { label: "03-13", wti: 91.3, gasoline: 1895, diesel: 1915 },
  { label: "03-16", wti: 95.1, gasoline: 1910, diesel: 1930 },
];

const regionData = [
  { label: "12-17", gasoline: 1691, diesel: 1584, kerosene: 1317 },
  { label: "01-01", gasoline: 1700, diesel: 1593, kerosene: 1320 },
  { label: "01-19", gasoline: 1710, diesel: 1601, kerosene: 1324 },
  { label: "02-02", gasoline: 1689, diesel: 1582, kerosene: 1314 },
  { label: "02-16", gasoline: 1692, diesel: 1590, kerosene: 1313 },
  { label: "03-02", gasoline: 1772, diesel: 1695, kerosene: 1365 },
  { label: "03-13", gasoline: 1912, diesel: 1930, kerosene: 1521 },
  { label: "03-16", gasoline: 1895, diesel: 1910, kerosene: 1508 },
];

const ceilingTrendData28 = Array.from({ length: 28 }, (_, i) => {
  const day = i - 14;
  const base = 1690 + Math.max(0, day) * 18 - Math.max(0, day - 8) * 12;
  return {
    label: (() => {
      const d = new Date("2026-02-27");
      d.setDate(d.getDate() + i);
      return `${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    })(),
    gasoline: Math.round(base),
    diesel: Math.round(base - 11),
    aboveCount: Math.max(0, 2000 + i * 250 - (i > 14 ? (i - 14) * 400 : 0)),
    belowCount: Math.max(0, 8500 - i * 250 + (i > 14 ? (i - 14) * 400 : 0)),
  };
});

const fmt = (v: number) => v.toLocaleString("ko-KR");

function CeilingTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const isEffective = label === "03-13";
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[170px]">
      <p className="font-bold text-gray-800 mb-1.5">{label}{isEffective ? " ★공표일" : ""}</p>
      <div className="space-y-0.5 mb-2">
        <div className="flex justify-between gap-3">
          <span className="text-amber-600">● 휘발유</span>
          <span className="font-semibold">{fmt(d?.gasoline)}원</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-green-600">● 경유</span>
          <span className="font-semibold">{fmt(d?.diesel)}원</span>
        </div>
      </div>
      <div className="pt-1.5 border-t border-gray-100 flex justify-between gap-2">
        <span className="flex items-center gap-1 text-red-500 font-bold text-[10px]">
          <TrendingUp className="w-3 h-3" />{fmt(d?.aboveCount ?? 0)}개 초과
        </span>
        <span className="flex items-center gap-1 text-blue-500 font-bold text-[10px]">
          <TrendingDown className="w-3 h-3" />{fmt(d?.belowCount ?? 0)}개 이하
        </span>
      </div>
    </div>
  );
}

type Tab = "global" | "regional" | "ceiling";

export function PublicDashboardTabs() {
  const [tab, setTab] = useState<Tab>("ceiling");

  const tabs: { key: Tab; label: string }[] = [
    { key: "global", label: "국제-국내 유가" },
    { key: "regional", label: "지역별 추이" },
    { key: "ceiling", label: "최고가격제 변동추이" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans flex items-start justify-center">
      <div className="w-full max-w-[880px]">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {tab === "global" && "국제-국내 유가 연동 분석"}
                {tab === "regional" && "지역별 유가 추이"}
                {tab === "ceiling" && "최고가격제 이후 변동추이"}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {tab === "global" && "WTI 국제 유가 vs 국내 평균 유가"}
                {tab === "regional" && "전국 시도별 90일 유가 추이"}
                {tab === "ceiling" && "최고가격 공표 기준 전후 28일"}
              </p>
            </div>
            <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    tab === t.key
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {tab === "ceiling" && (
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 font-medium">공표일</span>
                <button className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg font-semibold">2026-03-13 ▾</button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 font-medium">지역</span>
                <button className="text-xs border border-gray-200 text-gray-700 px-2.5 py-1 rounded-lg">전국 ▾</button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 font-medium">유종</span>
                <div className="flex gap-1.5">
                  {[{k:"gasoline",l:"휘발유",c:"bg-amber-400"},{k:"diesel",l:"경유",c:"bg-green-500"}].map(f => (
                    <button key={f.k} className="flex items-center gap-1 text-xs border border-gray-200 px-2 py-1 rounded-lg font-medium">
                      <span className={`w-2 h-2 rounded-full ${f.c}`} />{f.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "global" && (
            <>
              <p className="text-xs text-gray-400 mb-2">※ 국제 유가(WTI) 변동은 통상 <strong className="text-gray-600">2~3주 후</strong> 국내 주유소 가격에 반영됩니다.</p>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={wtiData} margin={{ top: 8, right: 8, left: 8, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} height={28} tickMargin={6} />
                  <YAxis yAxisId="wti" orientation="left" tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} tickFormatter={v => `$${v}`} domain={[50, 100]} tickCount={5} width={44} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="dom" orientation="right" tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} tickFormatter={v => `${fmt(v)}원`} domain={[1600, 2000]} tickCount={5} width={68} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" iconSize={10} />
                  <Line yAxisId="wti" type="monotone" dataKey="wti" stroke="#64748b" strokeWidth={2.5} dot={false} name="WTI (국제)" connectNulls />
                  <Line yAxisId="dom" type="monotone" dataKey="gasoline" stroke="#eab308" strokeWidth={2.5} dot={false} name="휘발유" connectNulls />
                  <Line yAxisId="dom" type="monotone" dataKey="diesel" stroke="#22c55e" strokeWidth={2.5} dot={false} name="경유" connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </>
          )}

          {tab === "regional" && (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={regionData} margin={{ top: 8, right: 8, left: 8, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} height={28} tickMargin={6} />
                <YAxis tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} tickFormatter={v => `${fmt(v)}원`} domain={[1280, 1980]} tickCount={5} width={68} axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" iconSize={10} />
                <Line type="monotone" dataKey="gasoline" stroke="#eab308" strokeWidth={2.5} dot={false} name="휘발유" connectNulls />
                <Line type="monotone" dataKey="diesel" stroke="#22c55e" strokeWidth={2.5} dot={false} name="경유" connectNulls />
                <Line type="monotone" dataKey="kerosene" stroke="#60a5fa" strokeWidth={2.5} dot={false} name="등유" connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {tab === "ceiling" && (
            <>
              <p className="text-xs text-gray-400 mb-1">수평 점선: 최고가격 기준 (휘발유 <strong className="text-amber-600">1,724원</strong> / 경유 <strong className="text-green-600">1,713원</strong>)</p>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={ceilingTrendData28} margin={{ top: 8, right: 8, left: 8, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#374151", fontWeight: 600 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} height={28} interval={3} tickMargin={6} />
                  <YAxis tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} tickFormatter={v => `${fmt(v)}원`} domain={[1580, 1980]} tickCount={5} width={68} axisLine={false} tickLine={false} />
                  <Tooltip content={<CeilingTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" iconSize={10} />
                  <ReferenceLine y={CEILING.gasoline} stroke="#d97706" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: "1,724원", position: "insideTopRight", fontSize: 10, fill: "#d97706", dy: -3 }} />
                  <ReferenceLine y={CEILING.diesel} stroke="#16a34a" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: "1,713원", position: "insideBottomRight", fontSize: 10, fill: "#16a34a", dy: 12 }} />
                  <ReferenceLine x="03-13" stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: "공표일", position: "top", fontSize: 10, fill: "#3b82f6" }} />
                  <Line type="monotone" dataKey="gasoline" stroke="#eab308" strokeWidth={2.5} dot={false} name="휘발유 평균" connectNulls />
                  <Line type="monotone" dataKey="diesel" stroke="#22c55e" strokeWidth={2.5} dot={false} name="경유 평균" connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="mt-2 pt-2 border-t border-gray-100 flex gap-4 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-red-500" /><span className="text-red-500 font-bold">빨간색 ↑</span> 기준가 초과 업체 수</span>
                <span className="flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5 text-blue-500" /><span className="text-blue-500 font-bold">파란색 ↓</span> 기준가 이하 업체 수</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
