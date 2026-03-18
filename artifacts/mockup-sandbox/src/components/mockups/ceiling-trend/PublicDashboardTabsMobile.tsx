import { useState } from "react";
import {
  ComposedChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Search, ChevronDown } from "lucide-react";

const CEILING = { gasoline: 1724, diesel: 1713 };
const fmt = (v: number) => v.toLocaleString("ko-KR");

const wtiData = [
  { label: "01-05", wti: 72.1, gasoline: 1708, diesel: 1605 },
  { label: "01-19", wti: 71.8, gasoline: 1715, diesel: 1612 },
  { label: "02-02", wti: 70.4, gasoline: 1689, diesel: 1582 },
  { label: "02-16", wti: 69.8, gasoline: 1691, diesel: 1585 },
  { label: "03-02", wti: 82.5, gasoline: 1785, diesel: 1700 },
  { label: "03-13", wti: 91.3, gasoline: 1895, diesel: 1915 },
  { label: "03-16", wti: 95.1, gasoline: 1910, diesel: 1930 },
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

type Tab = "global" | "regional" | "ceiling";

const TAB_LABELS: Record<Tab, string> = {
  global: "국제유가",
  regional: "지역별",
  ceiling: "최고가격제",
};

export function PublicDashboardTabsMobile() {
  const [tab, setTab] = useState<Tab>("ceiling");
  const [fuels, setFuels] = useState({ gasoline: true, diesel: true });
  const [search, setSearch] = useState("서울셀프주유소");
  const [showStation, setShowStation] = useState(true);
  const toggleFuel = (f: keyof typeof fuels) => setFuels(p => ({ ...p, [f]: !p[f] }));

  return (
    <div className="min-h-screen bg-gray-50 font-sans" style={{ width: 390, margin: "0 auto" }}>
      {/* 모바일 헤더 */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 sticky top-0 z-10">
        <h1 className="text-base font-bold text-gray-900">유가 현황 대시보드</h1>
      </div>

      <div className="px-3 pt-3 pb-6 space-y-3">

        {/* 모바일 탭 — 짧은 레이블 */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {(["global", "regional", "ceiling"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t ? "bg-blue-600 text-white shadow-sm" : "text-gray-500"}`}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* 국제-국내 유가 탭 */}
        {tab === "global" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
            <p className="text-xs font-semibold text-gray-800 mb-0.5">국제-국내 유가 연동</p>
            <p className="text-[10px] text-gray-400 mb-2">WTI 변동은 2~3주 후 반영</p>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={wtiData} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} height={24} tickMargin={4} />
                <YAxis yAxisId="wti" orientation="left" tick={{ fontSize: 9 }} tickFormatter={v => `$${v}`} domain={[60, 100]} tickCount={4} width={32} axisLine={false} tickLine={false} />
                <YAxis yAxisId="dom" orientation="right" tick={{ fontSize: 9 }} tickFormatter={v => `${Math.round(v / 10) * 10}`} domain={[1600, 1970]} tickCount={4} width={40} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line yAxisId="wti" type="monotone" dataKey="wti" stroke="#64748b" strokeWidth={2} dot={false} name="WTI" connectNulls />
                <Line yAxisId="dom" type="monotone" dataKey="gasoline" stroke="#eab308" strokeWidth={2} dot={false} name="휘발유" connectNulls />
                <Line yAxisId="dom" type="monotone" dataKey="diesel"   stroke="#22c55e" strokeWidth={2} dot={false} name="경유"   connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="mt-1.5 flex gap-3 text-[9px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-500 inline-block" />WTI</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block" />휘발유</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block" />경유</span>
            </div>
          </div>
        )}

        {/* 지역별 탭 */}
        {tab === "regional" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
            <p className="text-xs font-semibold text-gray-800 mb-0.5">지역별 유가 추이</p>
            <p className="text-[10px] text-gray-400 mb-2">전국 90일 평균</p>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={[{label:"01-05",gasoline:1700,diesel:1593,kerosene:1320},{label:"01-19",gasoline:1710,diesel:1601,kerosene:1324},{label:"02-02",gasoline:1689,diesel:1582,kerosene:1314},{label:"02-16",gasoline:1692,diesel:1590,kerosene:1313},{label:"03-02",gasoline:1772,diesel:1695,kerosene:1365},{label:"03-13",gasoline:1912,diesel:1930,kerosene:1521},{label:"03-16",gasoline:1895,diesel:1910,kerosene:1508}]} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} height={24} tickMargin={4} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${Math.round(v / 100) * 100}`} domain={[1280, 1970]} tickCount={5} width={40} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="gasoline" stroke="#eab308" strokeWidth={2} dot={false} name="휘발유" connectNulls />
                <Line type="monotone" dataKey="diesel"   stroke="#22c55e" strokeWidth={2} dot={false} name="경유"   connectNulls />
                <Line type="monotone" dataKey="kerosene" stroke="#38bdf8" strokeWidth={2} dot={false} name="등유"   connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 최고가격제 탭 */}
        {tab === "ceiling" && (
          <>
            {/* 필터 패널 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-3 space-y-2.5">
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
                  <input type="text" value={search}
                    onChange={e => { setSearch(e.target.value); setShowStation(e.target.value.length > 0); }}
                    placeholder="주유소 이름 검색..."
                    className="w-full pl-7 pr-3 py-2 text-[11px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
            </div>

            {/* 차트 카드 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
              {/* 유종 토글 — 카드 우상단 */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] text-gray-400">수평 점선: 최고가격 기준</p>
                <div className="flex gap-1">
                  {[{ k: "gasoline", l: "휘발유", dot: "bg-amber-400" }, { k: "diesel", l: "경유", dot: "bg-green-500" }].map(f => (
                    <button key={f.k} onClick={() => toggleFuel(f.k as keyof typeof fuels)}
                      className={`flex items-center gap-1 text-[10px] px-1.5 py-1 rounded-md border transition-all ${fuels[f.k as keyof typeof fuels] ? "border-gray-300 text-gray-700 bg-white font-semibold" : "border-gray-100 text-gray-400 bg-gray-50"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${f.dot} ${fuels[f.k as keyof typeof fuels] ? "" : "opacity-30"}`} />{f.l}
                    </button>
                  ))}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={ceilingData} margin={{ top: 8, right: 44, left: 4, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#374151", fontWeight: 600 }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} interval={6} height={28} tickMargin={6} />
                  <YAxis tick={{ fontSize: 9, fill: "#374151", fontWeight: 600 }} tickFormatter={v => `${Math.round(v / 100) * 100}`} domain={[1550, 2050]} tickCount={5} width={38} axisLine={false} tickLine={false} />
                  <Tooltip />
                  {fuels.gasoline && <ReferenceLine y={CEILING.gasoline} stroke="#d97706" strokeDasharray="5 3" strokeWidth={1.5} label={{ value: "1,724", position: "insideRight", fontSize: 8, fill: "#d97706", dx: 4 }} />}
                  {fuels.diesel   && <ReferenceLine y={CEILING.diesel}   stroke="#16a34a" strokeDasharray="5 3" strokeWidth={1.5} label={{ value: "1,713", position: "insideRight", fontSize: 8, fill: "#16a34a", dx: 4 }} />}
                  <ReferenceLine x="03-13" stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: "공표일", position: "top", fontSize: 9, fill: "#3b82f6" }} />
                  {fuels.gasoline && <Line type="monotone" dataKey="gasoline"   stroke="#eab308" strokeWidth={2}   dot={false} connectNulls />}
                  {fuels.diesel   && <Line type="monotone" dataKey="diesel"     stroke="#22c55e" strokeWidth={2}   dot={false} connectNulls />}
                  {showStation && fuels.gasoline && <Line type="monotone" dataKey="stationGas" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="5 2" dot={false} connectNulls />}
                  {showStation && fuels.diesel   && <Line type="monotone" dataKey="stationDsl" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="5 2" dot={false} connectNulls />}
                </ComposedChart>
              </ResponsiveContainer>

              {/* 화살표 설명 + 툴팁 예시 */}
              <div className="mt-2 pt-2 border-t border-gray-100 flex gap-3 text-[9px] flex-wrap text-gray-500">
                <span className="flex items-center gap-1 text-red-500 font-bold"><TrendingUp className="w-3 h-3" />빨간↑ 초과업체수</span>
                <span className="flex items-center gap-1 text-blue-500 font-bold"><TrendingDown className="w-3 h-3" />파란↓ 이하업체수</span>
              </div>
            </div>

            {/* 터치 툴팁 예시 */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
              <p className="text-[10px] text-gray-400 font-medium mb-2">그래프 터치 시 나타나는 정보 예시</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-[9px] text-gray-400 mb-1 text-center">지역 평균 터치</p>
                  <div className="bg-white border border-gray-300 rounded-lg shadow-md px-2.5 py-2 text-[10px]">
                    <p className="font-bold mb-1 border-b border-gray-100 pb-1">03-16</p>
                    <div className="space-y-0.5 mb-1.5">
                      <div className="flex justify-between"><span className="text-amber-600">● 휘발유</span><span className="font-semibold">1,855원</span></div>
                      <div className="flex justify-between"><span className="text-green-600">● 경유</span><span className="font-semibold">1,800원</span></div>
                    </div>
                    <div className="flex justify-between border-t border-gray-100 pt-1">
                      <span className="flex items-center gap-0.5 text-red-500 font-bold text-[9px]"><TrendingUp className="w-2.5 h-2.5" />4,200개</span>
                      <span className="flex items-center gap-0.5 text-blue-500 font-bold text-[9px]"><TrendingDown className="w-2.5 h-2.5" />7,300개</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-[9px] text-gray-400 mb-1 text-center">주유소 검색 시</p>
                  <div className="bg-white border border-gray-300 rounded-lg shadow-md px-2.5 py-2 text-[10px]">
                    <p className="font-bold mb-1 border-b border-gray-100 pb-1">03-16</p>
                    <div className="mb-1.5 pb-1.5 border-b border-gray-100">
                      <p className="text-[9px] text-gray-400">서울셀프주유소</p>
                      <p className="font-bold text-indigo-600">1,948원</p>
                      <div className="flex gap-1 mt-0.5">
                        <span className="flex items-center gap-0.5 text-red-500 font-bold text-[9px]"><TrendingUp className="w-2.5 h-2.5" />3일</span>
                        <span className="flex items-center gap-0.5 text-blue-500 font-bold text-[9px]"><TrendingDown className="w-2.5 h-2.5" />11일</span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-0.5 text-red-500 font-bold text-[9px]"><TrendingUp className="w-2.5 h-2.5" />4,200개</span>
                      <span className="flex items-center gap-0.5 text-blue-500 font-bold text-[9px]"><TrendingDown className="w-2.5 h-2.5" />7,300개</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
