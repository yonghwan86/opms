import { useState } from "react";
import {
  ComposedChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Search, ChevronDown } from "lucide-react";

const CEILING = { gasoline: 1724, diesel: 1713 };
const fmt = (v: number) => v.toLocaleString("ko-KR");

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

const stationGasData = [1720,1722,1728,1738,1752,1780,1810,1850,1880,1920,1950,1965,1978,1990,1975,1960,1948,1934,1920,1910,1902,1895,1888,1882,1876,1872,1868,1864];
const stationDslData = [1618,1620,1624,1632,1645,1668,1694,1740,1778,1820,1854,1876,1892,1900,1885,1874,1862,1850,1840,1832,1826,1820,1815,1810,1806,1802,1798,1795];

const ceilingData = Array.from({ length: 28 }, (_, i) => {
  const day = i - 14;
  const base = 1690 + Math.max(0, day) * 18 - Math.max(0, day - 8) * 12;
  return {
    label: (() => {
      const d = new Date("2026-02-27");
      d.setDate(d.getDate() + i);
      return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })(),
    gasoline: Math.round(base),
    diesel: Math.round(base - 11),
    stationGas: stationGasData[i],
    stationDsl: stationDslData[i],
    aboveCount: Math.max(0, 2000 + i * 250 - (i > 14 ? (i - 14) * 400 : 0)),
    belowCount: Math.max(0, 8500 - i * 250 + (i > 14 ? (i - 14) * 400 : 0)),
  };
});

function CeilingTooltip({ active, payload, label, showStation, fuels }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const idx = ceilingData.findIndex(r => r.label === label);
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl px-3 py-2.5 text-xs min-w-[185px]">
      <p className="font-bold text-gray-800 mb-1.5 border-b border-gray-100 pb-1">{label}{label === "03-13" ? " ★공표일" : ""}</p>
      {showStation && (
        <div className="mb-1.5 pb-1.5 border-b border-gray-100">
          <p className="text-gray-400 text-[10px] mb-0.5">서울셀프주유소</p>
          {fuels.gasoline && <div className="flex justify-between"><span className="text-indigo-500 text-[10px]">● 휘발유</span><span className="font-bold text-indigo-600">{fmt(d.stationGas)}원</span></div>}
          {fuels.diesel   && <div className="flex justify-between"><span className="text-violet-500 text-[10px]">● 경유</span><span className="font-bold text-violet-600">{fmt(d.stationDsl)}원</span></div>}
          <div className="flex gap-2 mt-1">
            <span className="flex items-center gap-0.5 text-red-500 font-bold text-[10px]"><TrendingUp className="w-3 h-3" />초과 {Math.max(0, idx - 10)}일</span>
            <span className="flex items-center gap-0.5 text-blue-500 font-bold text-[10px]"><TrendingDown className="w-3 h-3" />이하 {Math.max(0, 12 - idx)}일</span>
          </div>
        </div>
      )}
      <div className="space-y-0.5 mb-1.5">
        {fuels.gasoline && <div className="flex justify-between gap-3"><span className="text-amber-600">● 휘발유 평균</span><span className="font-semibold">{fmt(d.gasoline)}원</span></div>}
        {fuels.diesel   && <div className="flex justify-between gap-3"><span className="text-green-600">● 경유 평균</span><span className="font-semibold">{fmt(d.diesel)}원</span></div>}
      </div>
      <div className="pt-1 border-t border-gray-100 flex justify-between gap-1">
        <span className="flex items-center gap-1 text-red-500 font-bold text-[10px]"><TrendingUp className="w-3 h-3" />{fmt(d.aboveCount)}개 초과</span>
        <span className="flex items-center gap-1 text-blue-500 font-bold text-[10px]"><TrendingDown className="w-3 h-3" />{fmt(d.belowCount)}개 이하</span>
      </div>
    </div>
  );
}

type Tab = "global" | "regional" | "ceiling";

export function PublicDashboardTabs() {
  const [tab, setTab] = useState<Tab>("ceiling");
  const [fuels, setFuels] = useState({ gasoline: true, diesel: true });
  const [search, setSearch] = useState("서울셀프주유소");
  const [showStation, setShowStation] = useState(true);
  const toggleFuel = (f: keyof typeof fuels) => setFuels(p => ({ ...p, [f]: !p[f] }));

  const TABS: { key: Tab; label: string }[] = [
    { key: "global",   label: "국제-국내 유가" },
    { key: "regional", label: "지역별 추이" },
    { key: "ceiling",  label: "최고가격제 변동추이" },
  ];

  const tabBar = (
    <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg self-start">
      {TABS.map(t => (
        <button key={t.key} onClick={() => setTab(t.key)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === t.key ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans">
      <div className="w-full max-w-[920px] mx-auto space-y-3">

        {/* 기존 두 탭 - 단일 카드 */}
        {tab !== "ceiling" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {tab === "global" ? "국제-국내 유가 연동 분석" : "지역별 유가 추이"}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {tab === "global" ? "WTI 국제 유가 vs 국내 평균 유가" : "전국 시도별 90일 유가 추이"}
                </p>
              </div>
              {tabBar}
            </div>
            {tab === "global" && (
              <>
                <p className="text-xs text-gray-400 mb-2">※ WTI 변동은 통상 <strong className="text-gray-600">2~3주 후</strong> 국내 주유소 가격에 반영됩니다.</p>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={wtiData} margin={{ top: 8, right: 8, left: 8, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} height={28} tickMargin={6} />
                    <YAxis yAxisId="wti" orientation="left" tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} domain={[50, 100]} tickCount={5} width={44} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="dom" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `${fmt(v)}원`} domain={[1600, 2000]} tickCount={5} width={68} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" iconSize={10} />
                    <Line yAxisId="wti" type="monotone" dataKey="wti" stroke="#64748b" strokeWidth={2.5} dot={false} name="WTI (국제)" connectNulls />
                    <Line yAxisId="dom" type="monotone" dataKey="gasoline" stroke="#eab308" strokeWidth={2.5} dot={false} name="휘발유" connectNulls />
                    <Line yAxisId="dom" type="monotone" dataKey="diesel"   stroke="#22c55e" strokeWidth={2.5} dot={false} name="경유"   connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </>
            )}
            {tab === "regional" && (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={regionData} margin={{ top: 8, right: 8, left: 8, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} height={28} tickMargin={6} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${fmt(v)}원`} domain={[1280, 1980]} tickCount={5} width={68} axisLine={false} tickLine={false} />
                  <Tooltip /><Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" iconSize={10} />
                  <Line type="monotone" dataKey="gasoline" stroke="#eab308" strokeWidth={2.5} dot={false} name="휘발유" connectNulls />
                  <Line type="monotone" dataKey="diesel"   stroke="#22c55e" strokeWidth={2.5} dot={false} name="경유"   connectNulls />
                  <Line type="monotone" dataKey="kerosene" stroke="#60a5fa" strokeWidth={2.5} dot={false} name="등유"   connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* 최고가격제 탭 — 확장 레이아웃 */}
        {tab === "ceiling" && (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">최고가격제 이후 변동추이</h2>
                <p className="text-xs text-gray-400 mt-0.5">석유 최고가격 공표 전후 4주 구간 유가 추이</p>
              </div>
              {tabBar}
            </div>

            {/* 필터 1행: 공표일 + 시도 + 시군구 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 space-y-2.5">
              <div className="flex flex-wrap gap-3 items-center">
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5 font-medium">공표일</p>
                  <button className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">2026-03-13 <ChevronDown className="w-3 h-3" /></button>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5 font-medium">시도</p>
                  <button className="flex items-center gap-1.5 border border-gray-200 text-xs text-gray-700 px-3 py-1.5 rounded-lg">전국 <ChevronDown className="w-3 h-3" /></button>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 mb-0.5 font-medium">시군구</p>
                  <button disabled className="flex items-center gap-1.5 border border-gray-100 text-xs text-gray-400 px-3 py-1.5 rounded-lg bg-gray-50">전체 <ChevronDown className="w-3 h-3" /></button>
                </div>
              </div>
              {/* 필터 2행: 주유소 검색 */}
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5 font-medium">주유소 검색 <span className="text-gray-300">(선택된 유종의 개별 가격 추이 오버레이)</span></p>
                <div className="relative max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" value={search}
                    onChange={e => { setSearch(e.target.value); setShowStation(e.target.value.length > 0); }}
                    placeholder="주유소 이름 검색..."
                    className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
            </div>

            {/* 차트 카드 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs text-gray-400">수평 점선: 최고가격 기준 (휘발유 <strong className="text-amber-600">1,724원</strong> / 경유 <strong className="text-green-600">1,713원</strong>)</p>
                {/* 유종 토글 — 차트 우상단 */}
                <div className="flex gap-1.5">
                  {[{ k: "gasoline", l: "휘발유", dot: "bg-amber-400" }, { k: "diesel", l: "경유", dot: "bg-green-500" }].map(f => (
                    <button key={f.k} onClick={() => toggleFuel(f.k as keyof typeof fuels)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${fuels[f.k as keyof typeof fuels] ? "border-gray-300 text-gray-800 bg-white font-medium shadow-sm" : "border-gray-100 text-gray-400 bg-gray-50"}`}>
                      <span className={`w-2 h-2 rounded-full ${f.dot} ${fuels[f.k as keyof typeof fuels] ? "" : "opacity-30"}`} />{f.l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={ceilingData} margin={{ top: 10, right: 80, left: 12, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#374151", fontWeight: 600 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} interval={3} height={32} tickMargin={8} />
                    <YAxis tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} tickFormatter={v => `${fmt(v)}원`} domain={[1550, 2050]} tickCount={6} width={72} axisLine={false} tickLine={false} />
                    <Tooltip content={<CeilingTooltip showStation={showStation} fuels={fuels} />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8}
                      formatter={v => v === "stationGas" ? "서울셀프주유소 (휘발유)" : v === "stationDsl" ? "서울셀프주유소 (경유)" : v === "gasoline" ? "휘발유 평균" : "경유 평균"} />
                    {fuels.gasoline && <ReferenceLine y={CEILING.gasoline} stroke="#d97706" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: "1,724원", position: "insideRight", fontSize: 9, fill: "#d97706", dx: 8 }} />}
                    {fuels.diesel   && <ReferenceLine y={CEILING.diesel}   stroke="#16a34a" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: "1,713원", position: "insideRight", fontSize: 9, fill: "#16a34a", dx: 8 }} />}
                    <ReferenceLine x="03-13" stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: "공표일", position: "top", fontSize: 10, fill: "#3b82f6" }} />
                    {fuels.gasoline && <Line type="monotone" dataKey="gasoline"   stroke="#eab308" strokeWidth={2.5} dot={false} name="gasoline"   connectNulls />}
                    {fuels.diesel   && <Line type="monotone" dataKey="diesel"     stroke="#22c55e" strokeWidth={2.5} dot={false} name="diesel"     connectNulls />}
                    {showStation && fuels.gasoline && <Line type="monotone" dataKey="stationGas" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 2" dot={false} name="stationGas" connectNulls />}
                    {showStation && fuels.diesel   && <Line type="monotone" dataKey="stationDsl" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 2" dot={false} name="stationDsl" connectNulls />}
                  </ComposedChart>
                </ResponsiveContainer>

                {/* 정적 툴팁 오버레이 — 03-16 지점 */}
                <div className="absolute" style={{ top: 55, right: 130 }}>
                  <div className="bg-white border border-gray-300 rounded-xl shadow-2xl px-3.5 py-3 text-xs w-[195px]">
                    <p className="font-bold text-gray-800 mb-1.5 border-b border-gray-100 pb-1.5 text-[11px]">03-16</p>
                    {showStation && (
                      <div className="mb-2 pb-2 border-b border-gray-100">
                        <p className="text-gray-400 text-[10px] mb-0.5 font-medium">서울셀프주유소</p>
                        {fuels.gasoline && <div className="flex justify-between items-center"><span className="text-indigo-500 text-[10px]">● 휘발유</span><span className="font-bold text-indigo-600 text-[11px]">1,948원</span></div>}
                        {fuels.diesel   && <div className="flex justify-between items-center"><span className="text-violet-500 text-[10px]">● 경유</span><span className="font-bold text-violet-600 text-[11px]">1,862원</span></div>}
                        <div className="flex gap-2.5 mt-1.5">
                          <span className="flex items-center gap-0.5 text-red-500 font-bold text-[10px]"><TrendingUp className="w-3 h-3" />초과 3일</span>
                          <span className="flex items-center gap-0.5 text-blue-500 font-bold text-[10px]"><TrendingDown className="w-3 h-3" />이하 11일</span>
                        </div>
                      </div>
                    )}
                    <div className="space-y-1 mb-2">
                      {fuels.gasoline && <div className="flex justify-between gap-3"><span className="text-amber-600">● 휘발유 평균</span><span className="font-semibold text-gray-800">1,855원</span></div>}
                      {fuels.diesel   && <div className="flex justify-between gap-3"><span className="text-green-600">● 경유 평균</span><span className="font-semibold text-gray-800">1,800원</span></div>}
                    </div>
                    <div className="pt-1.5 border-t border-gray-100 flex justify-between gap-1">
                      <span className="flex items-center gap-1 text-red-500 font-bold text-[10px]"><TrendingUp className="w-3 h-3" />4,200개 초과</span>
                      <span className="flex items-center gap-1 text-blue-500 font-bold text-[10px]"><TrendingDown className="w-3 h-3" />7,300개 이하</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2 pt-2.5 border-t border-gray-100 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-gray-500">
                <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-red-500" /><span className="text-red-500 font-bold">빨간색 ↑</span> = 기준가보다 비싼 업체 수</span>
                <span className="w-px h-4 bg-gray-200" />
                <span className="flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5 text-blue-500" /><span className="text-blue-500 font-bold">파란색 ↓</span> = 기준가보다 싼 업체 수</span>
                <span className="w-px h-4 bg-gray-200" />
                <span className="text-gray-400">주유소 검색 시: 기준가 초과/미만 누계 횟수</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
