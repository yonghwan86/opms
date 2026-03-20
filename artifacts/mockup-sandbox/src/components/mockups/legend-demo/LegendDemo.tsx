import { useState } from "react";
import {
  ComposedChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

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
}));

const SERIES_CONFIG: Record<string, { label: string; color: string; dashed: boolean }> = {
  gasoline:   { label: "휘발유 평균",       color: "#eab308", dashed: false },
  diesel:     { label: "경유 평균",         color: "#22c55e", dashed: false },
  kerosene:   { label: "등유 평균",         color: "#38bdf8", dashed: false },
  stationGas: { label: "서울셀프주유소 (휘발유)", color: "#6366f1", dashed: true  },
  stationDsl: { label: "서울셀프주유소 (경유)",   color: "#8b5cf6", dashed: true  },
};

function renderLegend(props: any) {
  const { payload } = props;
  if (!payload) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", justifyContent: "center", paddingTop: "10px" }}>
      {payload.map((entry: any) => {
        const cfg = SERIES_CONFIG[entry.dataKey];
        if (!cfg) return null;
        return (
          <div
            key={entry.dataKey}
            style={{ display: "flex", alignItems: "center", gap: "5px" }}
          >
            <svg width="28" height="10" style={{ flexShrink: 0 }}>
              <line
                x1="1" y1="5" x2="27" y2="5"
                stroke={cfg.color}
                strokeWidth="2.5"
                strokeDasharray={cfg.dashed ? "5 5" : undefined}
                strokeLinecap="round"
              />
            </svg>
            <span style={{ fontSize: "11px", color: "#374151" }}>{cfg.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const fuelConfig = [
  { key: "gasoline", label: "휘발유", dot: "#eab308", ceiling: CEILING.gasoline },
  { key: "diesel",   label: "경유",   dot: "#22c55e", ceiling: CEILING.diesel   },
  { key: "kerosene", label: "등유",   dot: "#38bdf8", ceiling: CEILING.kerosene },
];

export function LegendDemo() {
  const [fuels, setFuels] = useState({ gasoline: true, diesel: true, kerosene: true });
  const [showStation, setShowStation] = useState(true);

  const toggleFuel = (f: keyof typeof fuels) =>
    setFuels(p => ({ ...p, [f]: !p[f] }));

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-[900px] mx-auto space-y-5">

        <div>
          <h1 className="text-lg font-bold text-gray-900">범례 아이콘 수정 데모</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            실선 시리즈 → 실선 아이콘 ·  점선 시리즈 → 점선 아이콘
          </p>
        </div>

        {/* 비교: Before / After */}
        <div className="grid grid-cols-2 gap-4">
          {/* Before */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
              Before — 동그라미 아이콘 (iconType="circle")
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={6} height={24} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${fmt(v)}`} domain={[1270, 2050]} width={55} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => `${fmt(v)}원`} />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => SERIES_CONFIG[v]?.label ?? v}
                />
                <ReferenceLine x="03-13" stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1.5} />
                {fuels.gasoline && <Line type="monotone" dataKey="gasoline"   stroke="#eab308" strokeWidth={2} dot={false} name="gasoline"   />}
                {fuels.diesel   && <Line type="monotone" dataKey="diesel"     stroke="#22c55e" strokeWidth={2} dot={false} name="diesel"     />}
                {fuels.kerosene && <Line type="monotone" dataKey="kerosene"   stroke="#38bdf8" strokeWidth={2} dot={false} name="kerosene"   />}
                {showStation && fuels.gasoline && <Line type="monotone" dataKey="stationGas" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 2" dot={false} name="stationGas" />}
                {showStation && fuels.diesel   && <Line type="monotone" dataKey="stationDsl" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 2" dot={false} name="stationDsl" />}
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-center text-orange-500 mt-1 font-medium">
              ⚠ 점선(------) 시리즈도 동그라미 아이콘으로 표시됨
            </p>
          </div>

          {/* After */}
          <div className="bg-white rounded-xl border-2 border-blue-400 shadow-sm p-4">
            <p className="text-xs font-semibold text-blue-600 mb-3 uppercase tracking-wide">
              After — 커스텀 SVG Legend
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={6} height={24} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${fmt(v)}`} domain={[1270, 2050]} width={55} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => `${fmt(v)}원`} />
                <Legend content={renderLegend} />
                <ReferenceLine x="03-13" stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1.5} />
                {fuels.gasoline && <Line type="monotone" dataKey="gasoline"   stroke="#eab308" strokeWidth={2} dot={false} name="gasoline"   />}
                {fuels.diesel   && <Line type="monotone" dataKey="diesel"     stroke="#22c55e" strokeWidth={2} dot={false} name="diesel"     />}
                {fuels.kerosene && <Line type="monotone" dataKey="kerosene"   stroke="#38bdf8" strokeWidth={2} dot={false} name="kerosene"   />}
                {showStation && fuels.gasoline && <Line type="monotone" dataKey="stationGas" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 2" dot={false} name="stationGas" />}
                {showStation && fuels.diesel   && <Line type="monotone" dataKey="stationDsl" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 2" dot={false} name="stationDsl" />}
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-center text-green-600 mt-1 font-medium">
              ✓ 실선은 실선 아이콘, 점선(------) 시리즈는 점선 아이콘으로 표시
            </p>
          </div>
        </div>

        {/* 범례 단독 확대 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wide">
            범례 아이콘 확대 비교
          </p>
          <div className="grid grid-cols-2 gap-6">

            {/* Before 범례 */}
            <div>
              <p className="text-[11px] text-gray-400 mb-2">Before</p>
              <div className="flex flex-col gap-2">
                {Object.entries(SERIES_CONFIG).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-2">
                    <svg width="10" height="10">
                      <circle cx="5" cy="5" r="4" fill={cfg.color} />
                    </svg>
                    <span className="text-[12px] text-gray-600">{cfg.label}</span>
                    {cfg.dashed && (
                      <span className="text-[10px] text-orange-400 ml-1">← 점선인데 동그라미</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* After 범례 */}
            <div>
              <p className="text-[11px] text-gray-400 mb-2">After</p>
              <div className="flex flex-col gap-2">
                {Object.entries(SERIES_CONFIG).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-2">
                    <svg width="28" height="10">
                      <line
                        x1="1" y1="5" x2="27" y2="5"
                        stroke={cfg.color}
                        strokeWidth="2.5"
                        strokeDasharray={cfg.dashed ? "5 5" : undefined}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-[12px] text-gray-600">{cfg.label}</span>
                    {cfg.dashed && (
                      <span className="text-[10px] text-green-500 ml-1">← 점선 아이콘 ✓</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 필터 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
          <span className="text-xs text-gray-500 font-medium">유종 표시:</span>
          {fuelConfig.map(f => (
            <button
              key={f.key}
              onClick={() => toggleFuel(f.key as keyof typeof fuels)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                fuels[f.key as keyof typeof fuels]
                  ? "border-gray-300 text-gray-800 bg-white font-medium shadow-sm"
                  : "border-gray-100 text-gray-400 bg-gray-50"
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: f.dot, opacity: fuels[f.key as keyof typeof fuels] ? 1 : 0.3 }} />
              {f.label}
            </button>
          ))}
          <div className="w-px h-5 bg-gray-200" />
          <button
            onClick={() => setShowStation(p => !p)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
              showStation
                ? "border-indigo-300 text-indigo-700 bg-indigo-50 font-medium"
                : "border-gray-100 text-gray-400 bg-gray-50"
            }`}
          >
            주유소 개별추이
          </button>
        </div>

      </div>
    </div>
  );
}
