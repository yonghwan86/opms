import { useState } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
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
  gasoline: "#eab308",
  diesel:   "#22c55e",
  kerosene: "#38bdf8",
};

const ENFORCEMENT_DATES = ["03/13", "03/27"];

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
    const retail  = fuel === "gasoline" ? r.domG : fuel === "diesel" ? r.domD : r.domK;
    const intlUsd = fuel === "gasoline" ? r.intlG : fuel === "diesel" ? r.intlD : r.intlK;
    const pretax  = Math.round(retail * (10 / 11) - tax);
    const intlKrw = Math.round((intlUsd * r.exch) / LITERS_PER_BARREL);
    return { date: r.date, pretax, intlKrw, exch: r.exch, intlUsd };
  });
}

const fmt = (v: number) => v.toLocaleString("ko-KR");

function CustomTooltip({ active, payload, label, fuel }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const color = FUEL_COLOR[fuel as Fuel];
  const diff = d.pretax - d.intlKrw;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs min-w-[200px]">
      <p className="font-semibold text-gray-700 mb-1.5 pb-1 border-b border-gray-100">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-blue-500">국제가 환산</span>
          <span className="font-semibold text-blue-600">{fmt(d.intlKrw)}원/L</span>
        </div>
        <div className="text-gray-400 text-[10px] -mt-0.5 mb-0.5">
          {d.intlUsd.toFixed(1)}$/Bbl × {fmt(d.exch)}원 ÷ 158.987
        </div>
        <div className="flex justify-between gap-4">
          <span style={{ color }}>국내 세전가</span>
          <span className="font-semibold" style={{ color }}>{fmt(d.pretax)}원/L</span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-gray-100 text-gray-500">
          <span>가격 차이</span>
          <span className={`font-semibold ${diff >= 0 ? "text-orange-500" : "text-blue-500"}`}>
            {diff >= 0 ? "+" : ""}{fmt(diff)}원/L
          </span>
        </div>
      </div>
    </div>
  );
}

function CustomLegend({ fuel }: { fuel: Fuel }) {
  const color = FUEL_COLOR[fuel];
  const label = FUEL_LABEL[fuel];
  return (
    <div className="flex justify-center gap-8 mt-1 text-xs text-gray-500">
      <span className="flex items-center gap-1.5">
        <svg width="28" height="10">
          <line x1="0" y1="5" x2="28" y2="5" stroke="#3b82f6" strokeWidth="2" />
          <circle cx="14" cy="5" r="3" fill="#3b82f6" />
        </svg>
        {label} 국제가 환산 (원/L)
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="28" height="10">
          <line x1="0" y1="5" x2="28" y2="5" stroke={color} strokeWidth="2" />
          <circle cx="14" cy="5" r="3" fill={color} />
        </svg>
        {label} 국내 세전가 (원/L)
      </span>
    </div>
  );
}

export function TaxAwareChart() {
  const [fuel, setFuel] = useState<Fuel>("gasoline");
  const data = buildChartData(fuel);
  const color = FUEL_COLOR[fuel];

  const allVals = data.flatMap(d => [d.pretax, d.intlKrw]);
  const yMin = Math.floor(Math.min(...allVals) / 50) * 50 - 50;
  const yMax = Math.ceil(Math.max(...allVals)  / 50) * 50 + 50;

  return (
    <div className="bg-white p-5 font-sans">

      {/* 헤더 */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <h1 className="text-base font-bold text-gray-900">국제-국내 제품가격 비교</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            국제 석유제품가(원/L) vs 국내 세전가(원/L), 최근 90일
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
                  ? "text-white border-transparent"
                  : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
              style={fuel === f ? { backgroundColor: FUEL_COLOR[f], borderColor: FUEL_COLOR[f] } : {}}
            >
              {FUEL_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {/* 차트 */}
      <ResponsiveContainer width="100%" height={330}>
        <ComposedChart data={data} margin={{ top: 32, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
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
            tickFormatter={v => fmt(v)}
            width={56}
            tickCount={7}
          />
          <Tooltip content={<CustomTooltip fuel={fuel} />} />

          {ENFORCEMENT_DATES.map(d => (
            <ReferenceLine
              key={d}
              x={d}
              stroke="#d1d5db"
              strokeDasharray="4 3"
              label={{ value: "시행일", position: "top", fontSize: 10, fill: "#9ca3af" }}
            />
          ))}

          <Line
            type="monotone"
            dataKey="intlKrw"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "#3b82f6", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="pretax"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            legendType="none"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* 레전드 */}
      <CustomLegend fuel={fuel} />
    </div>
  );
}
