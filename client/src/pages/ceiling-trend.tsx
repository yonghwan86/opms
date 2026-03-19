import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComposedChart, Line, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Search, ChevronDown, ShieldCheck, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── 타입 ─────────────────────────────────────────────────────────────────────
interface CeilingPrice {
  id: number;
  gasoline: string | null;
  diesel: string | null;
  kerosene: string | null;
  effectiveDate: string;
  note: string | null;
}

interface TrendRow {
  date: string;
  gasolineAvg: number | null;
  dieselAvg: number | null;
  keroseneAvg: number | null;
  gasolineAbove: number;
  gasolineBelow: number;
  dieselAbove: number;
  dieselBelow: number;
  keroseneAbove: number;
  keroseneBelow: number;
  baseGas: number | null;
  baseDiesel: number | null;
  baseKerosene: number | null;
}

interface StationRow {
  date: string;
  gasoline: number | null;
  diesel: number | null;
  kerosene: number | null;
}

interface StationSuggest {
  stationId: string;
  stationName: string;
  region: string;
}

// ─── 유틸 ──────────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("ko-KR");
const stripSidoPrefix = (s: string, sido: string) =>
  sido ? s.replace(new RegExp(`^${sido}\\s*`), "") : s;

function toLabel(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// ─── 도 목록 ──────────────────────────────────────────────────────────────────
const SIDO_LIST = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종시",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

// ─── 유종 설정 ─────────────────────────────────────────────────────────────────
const FUEL_CONFIG = [
  { key: "gasoline", label: "휘발유", dot: "bg-yellow-500", stroke: "#eab308", ceilingColor: "#d97706", stationStroke: "#6366f1", stationKey: "stationGas" },
  { key: "diesel",   label: "경유",   dot: "bg-green-500", stroke: "#22c55e", ceilingColor: "#16a34a", stationStroke: "#8b5cf6", stationKey: "stationDsl" },
  { key: "kerosene", label: "등유",   dot: "bg-sky-400",   stroke: "#38bdf8", ceilingColor: "#0284c7", stationStroke: "#ec4899", stationKey: "stationKero" },
] as const;

type FuelKey = "gasoline" | "diesel" | "kerosene";

// ─── 커스텀 툴팁 ───────────────────────────────────────────────────────────────
function DiffBadge({ val, base }: { val: number | null; base: number | null }) {
  if (val == null || base == null) return null;
  const diff = val - base;
  if (diff === 0) return null;
  const isUp = diff > 0;
  return (
    <span
      className={isUp ? "text-red-500" : "text-blue-500"}
      style={{ fontSize: 9, marginLeft: 2, fontWeight: 700 }}
    >
      ({isUp ? "↑" : "↓"}{Math.abs(diff).toLocaleString("ko-KR")}원)
    </span>
  );
}

function CustomTooltip({ active, payload, label, fuels, stationName, stationData, ceilingDate, effectiveDateRaw }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  const isPublishDay = label === ceilingDate;
  const activeFuelConf = FUEL_CONFIG.filter(f => fuels[f.key]);

  // 공표일 주유소 기준가격 (해당 주유소의 공표일 실제가격)
  const stationBaseRow = stationData?.find((r: StationRow) => r.date === effectiveDateRaw);

  // 누계일 계산: 공표일 이후부터 현재 날짜까지, 공표일 주유소 가격 기준
  const stationAbove: Record<string, number> = {};
  const stationBelow: Record<string, number> = {};
  if (stationName && stationData?.length) {
    const currentDateStr = d.dateRaw;
    FUEL_CONFIG.forEach(f => {
      if (!fuels[f.key]) return;
      let above = 0; let below = 0;
      const baseVal = stationBaseRow?.[f.key as keyof StationRow] as number | null;
      for (const row of stationData) {
        if (row.date < effectiveDateRaw) continue;  // 공표일 이전 제외
        if (row.date > currentDateStr) break;
        const stVal = row[f.key as keyof StationRow] as number | null;
        if (stVal != null && baseVal != null) {
          if (stVal > baseVal) above++;
          else below++;
        }
      }
      stationAbove[f.key] = above;
      stationBelow[f.key] = below;
    });
  }

  const aboveVal = fuels.gasoline ? (d.gasolineAbove ?? 0) :
                   fuels.diesel   ? (d.dieselAbove ?? 0) :
                   (d.keroseneAbove ?? 0);
  const belowVal = fuels.gasoline ? (d.gasolineBelow ?? 0) :
                   fuels.diesel   ? (d.dieselBelow ?? 0) :
                   (d.keroseneBelow ?? 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl px-3 py-2.5 text-xs min-w-[200px]">
      <p className="font-bold text-gray-800 mb-1.5 border-b border-gray-100 pb-1">
        {label}{isPublishDay ? " ★공표일" : ""}
      </p>

      {stationName && (
        <div className="mb-1.5 pb-1.5 border-b border-gray-100">
          <p className="text-gray-400 text-[10px] mb-0.5 font-medium truncate max-w-[170px]">{stationName}</p>
          {activeFuelConf.map(f => {
            const stVal = d[f.stationKey] as number | null;
            if (stVal == null) return null;
            const base = stationBaseRow?.[f.key as keyof StationRow] as number | null;
            return (
              <div key={f.key} className="flex justify-between items-center">
                <span style={{ color: f.stationStroke }} className="text-[10px]">● {f.label}</span>
                <span style={{ color: f.stationStroke }} className="font-bold">
                  {fmt(stVal)}원<DiffBadge val={stVal} base={base} />
                </span>
              </div>
            );
          })}
          <div className="flex gap-2 mt-1">
            <span className="flex items-center gap-0.5 text-red-500 font-bold text-[10px]">
              <TrendingUp className="w-3 h-3" />초과 {stationAbove[activeFuelConf[0]?.key ?? "gasoline"] ?? 0}일
            </span>
            <span className="flex items-center gap-0.5 text-blue-500 font-bold text-[10px]">
              <TrendingDown className="w-3 h-3" />이하 {stationBelow[activeFuelConf[0]?.key ?? "gasoline"] ?? 0}일
            </span>
          </div>
        </div>
      )}

      <div className="space-y-0.5 mb-1.5">
        {fuels.gasoline && d.gasolineAvg != null && (
          <div className="flex justify-between items-center gap-3">
            <span className="text-amber-600">● 휘발유 평균</span>
            <span className="font-semibold text-gray-800">
              {fmt(d.gasolineAvg)}원<DiffBadge val={d.gasolineAvg} base={d.baseGas} />
            </span>
          </div>
        )}
        {fuels.diesel && d.dieselAvg != null && (
          <div className="flex justify-between items-center gap-3">
            <span className="text-green-600">● 경유 평균</span>
            <span className="font-semibold text-gray-800">
              {fmt(d.dieselAvg)}원<DiffBadge val={d.dieselAvg} base={d.baseDiesel} />
            </span>
          </div>
        )}
        {fuels.kerosene && d.keroseneAvg != null && (
          <div className="flex justify-between items-center gap-3">
            <span className="text-sky-500">● 등유 평균</span>
            <span className="font-semibold text-gray-800">
              {fmt(d.keroseneAvg)}원<DiffBadge val={d.keroseneAvg} base={d.baseKerosene} />
            </span>
          </div>
        )}
      </div>

      <div className="pt-1 border-t border-gray-100 flex justify-between gap-1">
        <span className="flex items-center gap-1 text-red-500 font-bold text-[10px]">
          <TrendingUp className="w-3 h-3" />{fmt(aboveVal)}업체
        </span>
        <span className="flex items-center gap-1 text-blue-500 font-bold text-[10px]">
          <TrendingDown className="w-3 h-3" />{fmt(belowVal)}업체
        </span>
      </div>
    </div>
  );
}

// ─── 주유소 검색 드롭다운 ──────────────────────────────────────────────────────
function StationSearch({ value, onChange, onSelect, sido }: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (station: { stationId: string; stationName: string }) => void;
  sido: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: suggestions = [] } = useQuery<StationSuggest[]>({
    queryKey: ["/api/public/stations/suggest", value, sido],
    queryFn: () => {
      if (value.trim().length < 1) return Promise.resolve([]);
      const params = new URLSearchParams({ q: value });
      if (sido) params.set("sido", sido);
      return fetch(`/api/public/stations/suggest?${params}`).then(r => r.json());
    },
    enabled: value.trim().length >= 1,
    staleTime: 30_000,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = () => {
    setOpen(false);
    if (suggestions.length > 0) {
      const first = suggestions[0];
      onSelect(first);
      onChange(first.stationName);
    }
  };

  return (
    <div ref={ref} className="relative flex-1 min-w-[200px] md:max-w-[400px]">
      <p className="text-[10px] text-gray-400 mb-0.5 font-medium">
        주유소 검색 <span className="text-gray-300">(선택된 유종 개별 추이 오버레이)</span>
      </p>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={value}
            onChange={e => { onChange(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={e => { if (e.key === "Enter") handleSearch(); }}
            placeholder="주유소 이름 검색..."
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            data-testid="input-station-search"
          />
        </div>
        <button
          onClick={handleSearch}
          data-testid="button-station-search"
          className="flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
        >
          검색
        </button>
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map(s => (
            <button
              key={s.stationId}
              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex justify-between items-center"
              onClick={() => { onSelect(s); onChange(s.stationName); setOpen(false); }}
            >
              <span className="font-medium text-gray-800 truncate">{s.stationName}</span>
              <span className="text-gray-400 ml-2 flex-shrink-0 text-[10px]">{s.region}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
export default function CeilingTrendPage() {
  const { toast } = useToast();
  const [fuels, setFuels] = useState<Record<FuelKey, boolean>>({
    gasoline: true, diesel: true, kerosene: false,
  });
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSido, setSelectedSido] = useState("");
  const [selectedSigungu, setSelectedSigungu] = useState("");
  const [showDateMenu, setShowDateMenu] = useState(false);
  const [showSidoMenu, setShowSidoMenu] = useState(false);
  const [stationSearch, setStationSearch] = useState("");
  const [selectedStation, setSelectedStation] = useState<{ stationId: string; stationName: string } | null>(null);
  const [showAvg, setShowAvg] = useState(true);

  const dateRef = useRef<HTMLDivElement>(null);
  const sidoRef = useRef<HTMLDivElement>(null);

  // 전체 최고가격제 목록
  const { data: allCeilings = [], isLoading: ceilingsLoading } = useQuery<CeilingPrice[]>({
    queryKey: ["/api/public/ceiling-prices/all"],
    staleTime: 5 * 60 * 1000,
  });

  // 선택일 초기화 (최신)
  useEffect(() => {
    if (allCeilings.length && !selectedDate) {
      setSelectedDate(allCeilings[0].effectiveDate);
    }
  }, [allCeilings, selectedDate]);

  // 선택된 공표일의 최고가격 데이터
  const selectedCeiling = useMemo(
    () => allCeilings.find(c => c.effectiveDate === selectedDate) ?? null,
    [allCeilings, selectedDate],
  );

  // 시군구 목록 (sido 변경 시)
  const { data: sigunguList = [] } = useQuery<string[]>({
    queryKey: ["/api/public/stations/subregions", selectedSido],
    queryFn: () => selectedSido
      ? fetch(`/api/public/stations/subregions?sido=${encodeURIComponent(selectedSido)}`).then(r => r.json())
      : Promise.resolve([]),
    enabled: !!selectedSido,
    staleTime: 60_000,
  });

  // 트렌드 데이터
  const { data: trendData = [], isLoading: trendLoading } = useQuery<TrendRow[]>({
    queryKey: ["/api/public/ceiling-trend", selectedDate, selectedSido, selectedSigungu],
    queryFn: () => {
      if (!selectedDate) return Promise.resolve([]);
      const params = new URLSearchParams({ effectiveDate: selectedDate });
      if (selectedSido) params.set("sido", selectedSido);
      if (selectedSigungu) params.set("sigungu", selectedSigungu);
      return fetch(`/api/public/ceiling-trend?${params}`).then(r => r.json());
    },
    enabled: !!selectedDate,
    staleTime: 2 * 60 * 1000,
  });

  // 주유소 개별 데이터
  const { data: stationData = [] } = useQuery<StationRow[]>({
    queryKey: ["/api/public/ceiling-trend/station", selectedDate, selectedStation?.stationId],
    queryFn: () => {
      if (!selectedDate || !selectedStation) return Promise.resolve([]);
      const params = new URLSearchParams({ effectiveDate: selectedDate, stationId: selectedStation.stationId });
      return fetch(`/api/public/ceiling-trend/station?${params}`).then(r => r.json());
    },
    enabled: !!selectedDate && !!selectedStation,
    staleTime: 2 * 60 * 1000,
  });

  // 차트 데이터 병합
  const chartData = useMemo(() => {
    const stationMap = new Map<string, StationRow>(stationData.map(r => [r.date, r]));
    const cGas = selectedCeiling?.gasoline ? Number(selectedCeiling.gasoline) : 0;
    const cDiesel = selectedCeiling?.diesel ? Number(selectedCeiling.diesel) : 0;
    const cKero = selectedCeiling?.kerosene ? Number(selectedCeiling.kerosene) : 0;

    return trendData.map(row => {
      const st = stationMap.get(row.date);
      return {
        ...row,
        label: toLabel(row.date),
        dateRaw: row.date,
        stationGas: st?.gasoline ?? null,
        stationDsl: st?.diesel ?? null,
        stationKero: st?.kerosene ?? null,
        ceiling_gasoline: cGas || null,
        ceiling_diesel: cDiesel || null,
        ceiling_kerosene: cKero || null,
        baseGas: row.baseGas,
        baseDiesel: row.baseDiesel,
        baseKerosene: row.baseKerosene,
      };
    });
  }, [trendData, stationData, selectedCeiling]);

  // 공표일 X축 레이블 (날짜 → MM-DD)
  const ceilingLabel = selectedDate ? toLabel(selectedDate.replace(/-/g, "")) : "";

  // YAxis 도메인
  const allPrices = chartData.flatMap(d => [
    fuels.gasoline ? d.gasolineAvg : null,
    fuels.diesel ? d.dieselAvg : null,
    fuels.kerosene ? d.keroseneAvg : null,
    fuels.gasoline && selectedStation ? d.stationGas : null,
    fuels.diesel && selectedStation ? d.stationDsl : null,
    fuels.kerosene && selectedStation ? d.stationKero : null,
  ].filter((v): v is number => v != null));
  const ceilingPrices = [
    fuels.gasoline && selectedCeiling?.gasoline ? Number(selectedCeiling.gasoline) : null,
    fuels.diesel && selectedCeiling?.diesel ? Number(selectedCeiling.diesel) : null,
    fuels.kerosene && selectedCeiling?.kerosene ? Number(selectedCeiling.kerosene) : null,
  ].filter((v): v is number => v != null);
  const allVals = [...allPrices, ...ceilingPrices].filter(Boolean);
  const yMin = allVals.length ? Math.floor((Math.min(...allVals) - 30) / 10) * 10 : 1000;
  const yMax = allVals.length ? Math.ceil((Math.max(...allVals) + 30) / 10) * 10 : 2200;

  // 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) setShowDateMenu(false);
      if (sidoRef.current && !sidoRef.current.contains(e.target as Node)) setShowSidoMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleFuel = (f: FuelKey) => setFuels(p => ({ ...p, [f]: !p[f] }));

  // CSV 다운로드
  const todayStr = new Date().toISOString().slice(0, 10);
  const csvStartDate = useMemo(() => {
    if (!selectedDate) return "";
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, [selectedDate]);
  const csvPeriodLabel = csvStartDate ? `${csvStartDate} ~ ${todayStr}` : "";

  const handleDownloadCsv = async () => {
    if (!selectedDate) return;
    try {
      const params = new URLSearchParams({ effectiveDate: selectedDate });
      const resp = await fetch(`/api/ceiling-trend/export?${params}`, { credentials: "include" });
      if (!resp.ok) { toast({ title: "다운로드 실패", description: "서버 오류가 발생했습니다.", variant: "destructive" }); return; }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `최고가격제_변동추이_${selectedDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "다운로드 실패", description: "네트워크 오류가 발생했습니다.", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4">
        {/* 페이지 헤더 */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-bold text-foreground">최고가격제 이후 변동추이</h1>
            <p className="text-xs text-muted-foreground mt-0.5">석유 최고가격 공표 전후 4주(28일) 구간 유가 추이</p>
          </div>
        </div>

        {/* 필터 패널 */}
        <div className="bg-card rounded-xl border border-border shadow-sm px-4 py-3">
          <div className="flex flex-wrap gap-3 items-end">

            {/* 공표일 선택 */}
            <div ref={dateRef} className="relative">
              <p className="text-[10px] text-muted-foreground mb-0.5 font-medium">공표일</p>
              <button
                onClick={() => setShowDateMenu(p => !p)}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg"
                data-testid="button-select-date"
              >
                {selectedDate || "선택 중..."} <ChevronDown className="w-3 h-3" />
              </button>
              {showDateMenu && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg min-w-[160px] max-h-48 overflow-y-auto">
                  {ceilingsLoading
                    ? <p className="text-xs text-muted-foreground px-3 py-2">로딩 중...</p>
                    : allCeilings.map(c => (
                      <button
                        key={c.id}
                        className={cn(
                          "w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center justify-between gap-2",
                          c.effectiveDate === selectedDate && "bg-primary/10 font-semibold text-primary",
                        )}
                        onClick={() => { setSelectedDate(c.effectiveDate); setShowDateMenu(false); }}
                      >
                        <span>{c.effectiveDate}</span>
                        {c.note && <span className="text-muted-foreground text-[10px] truncate max-w-[80px]">{c.note}</span>}
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className="w-px h-8 bg-border" />

            {/* 시도 + 시군구 (모바일에서 한 줄) */}
            <div className="flex items-end gap-2">
              {/* 시도 선택 */}
              <div ref={sidoRef} className="relative">
                <p className="text-[10px] text-muted-foreground mb-0.5 font-medium">시도</p>
                <button
                  onClick={() => setShowSidoMenu(p => !p)}
                  className="flex items-center gap-1.5 border border-border text-xs text-foreground px-3 py-1.5 rounded-lg"
                  data-testid="button-select-sido"
                >
                  {selectedSido || "전국"} <ChevronDown className="w-3 h-3" />
                </button>
                {showSidoMenu && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg min-w-[110px] max-h-64 overflow-y-auto">
                    <button
                      className={cn("w-full text-left px-3 py-2 text-xs hover:bg-muted", !selectedSido && "font-semibold text-primary")}
                      onClick={() => { setSelectedSido(""); setSelectedSigungu(""); setShowSidoMenu(false); }}
                    >
                      전국
                    </button>
                    {SIDO_LIST.map(s => (
                      <button
                        key={s}
                        className={cn("w-full text-left px-3 py-2 text-xs hover:bg-muted", selectedSido === s && "font-semibold text-primary")}
                        onClick={() => { setSelectedSido(s); setSelectedSigungu(""); setShowSidoMenu(false); }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 시군구 선택 */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5 font-medium">시군구</p>
                {selectedSido && sigunguList.length > 0 ? (
                  <select
                    value={selectedSigungu}
                    onChange={e => setSelectedSigungu(e.target.value)}
                    className="border border-border text-xs text-foreground px-3 py-1.5 rounded-lg bg-background appearance-none pr-7 cursor-pointer"
                    data-testid="select-sigungu"
                  >
                    <option value="">전체</option>
                    {sigunguList.map(s => <option key={s} value={s}>{stripSidoPrefix(s, selectedSido)}</option>)}
                  </select>
                ) : (
                  <button disabled className="flex items-center gap-1.5 border border-border/50 text-xs text-muted-foreground px-3 py-1.5 rounded-lg bg-muted/30">
                    전체 <ChevronDown className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="w-px h-8 bg-border" />

            {/* 주유소 검색 */}
            <StationSearch
              value={stationSearch}
              onChange={v => { setStationSearch(v); if (!v.trim()) setSelectedStation(null); }}
              onSelect={s => { setSelectedStation(s); setStationSearch(s.stationName); }}
              sido={selectedSido}
            />

            <div className="w-px h-8 bg-border hidden md:block" />

            {/* CSV 다운로드 버튼 (PC 전용) */}
            <div className="hidden md:flex flex-col items-start gap-0.5">
              <p className="text-[10px] text-muted-foreground font-medium">데이터 내보내기</p>
              <button
                onClick={handleDownloadCsv}
                disabled={!selectedDate}
                data-testid="button-csv-download"
                className={cn(
                  "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all font-medium",
                  selectedDate
                    ? "border-indigo-500 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900"
                    : "border-border/50 text-muted-foreground bg-muted/30 cursor-not-allowed",
                )}
              >
                <Download className="w-3.5 h-3.5" />
                CSV 다운로드
              </button>
              {csvPeriodLabel && (
                <p className="text-[9px] text-muted-foreground">{csvPeriodLabel}</p>
              )}
            </div>
          </div>
        </div>

        {/* 선택된 최고가격 표시 */}
        {selectedCeiling && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            <span className="text-muted-foreground font-medium whitespace-nowrap">- 최고가 :</span>
            {FUEL_CONFIG.map((f, i) => {
              const val = selectedCeiling[f.key];
              return val ? (
                <span key={f.key} className="flex items-center gap-1 whitespace-nowrap">
                  {i > 0 && <span className="text-muted-foreground mr-0.5">,</span>}
                  <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", f.dot)} />
                  <span className="text-foreground">{f.label}</span>
                  <span className="font-bold text-foreground">{fmt(Number(val))}원</span>
                </span>
              ) : null;
            })}
          </div>
        )}

        {/* 차트 카드 */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-4">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <div>
              <p className="text-sm font-semibold text-foreground">최고가격 공표 전후 유가 변동</p>
              <p className="text-xs text-muted-foreground mt-0.5">수평 점선: 최고가격 기준</p>
            </div>
            {/* 지역평균선 체크박스 + 유종 토글 */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* 지역평균선 체크박스 */}
              <label
                className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none border border-border rounded-lg px-2.5 py-1.5 bg-card"
                data-testid="label-show-avg"
              >
                <input
                  type="checkbox"
                  checked={showAvg}
                  onChange={e => setShowAvg(e.target.checked)}
                  data-testid="checkbox-show-avg"
                  className="w-3 h-3 accent-indigo-600"
                />
                지역평균선
              </label>
              <div className="w-px h-5 bg-border" />
              {/* 유종 토글 */}
              {FUEL_CONFIG.map(f => (
                <button
                  key={f.key}
                  onClick={() => toggleFuel(f.key)}
                  data-testid={`button-fuel-${f.key}`}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all",
                    fuels[f.key]
                      ? "border-border text-foreground bg-card font-medium shadow-sm"
                      : "border-border/50 text-muted-foreground bg-muted/30",
                  )}
                >
                  <span className={cn("w-2 h-2 rounded-full", f.dot, !fuels[f.key] && "opacity-30")} />
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {trendLoading ? (
            <div className="space-y-2 py-10">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-60 w-full" />
            </div>
          ) : trendData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              {selectedDate ? "해당 기간의 데이터가 없습니다." : "공표일을 선택하세요."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={chartData} margin={{ top: 30, right: 8, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  interval={3}
                  height={32}
                  tickMargin={8}
                  padding={{ left: 0, right: 0 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontWeight: 600 }}
                  tickFormatter={v => `${fmt(v)}원`}
                  domain={[yMin, yMax]}
                  tickCount={7}
                  width={72}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      fuels={fuels}
                      stationName={selectedStation?.stationName}
                      stationData={stationData}
                      ceilingDate={ceilingLabel}
                      effectiveDateRaw={selectedDate ? selectedDate.replace(/-/g, "") : ""}
                    />
                  }
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  iconType="circle"
                  iconSize={8}
                  formatter={(v: string) => {
                    if (v === "stationGas") return `${selectedStation?.stationName ?? "주유소"} (휘발유)`;
                    if (v === "stationDsl") return `${selectedStation?.stationName ?? "주유소"} (경유)`;
                    if (v === "stationKero") return `${selectedStation?.stationName ?? "주유소"} (등유)`;
                    if (v === "gasolineAvg") return "휘발유 지역평균";
                    if (v === "dieselAvg") return "경유 지역평균";
                    if (v === "keroseneAvg") return "등유 지역평균";
                    return v;
                  }}
                />

                {/* 최고가격 수평 기준선 */}
                {selectedCeiling && (() => {
                  const activeFuels = FUEL_CONFIG.filter(f => fuels[f.key] && selectedCeiling[f.key]);
                  const combinedLabel = `최고가: ${activeFuels.map(f => `${f.label} ${fmt(Number(selectedCeiling[f.key]))}원`).join(', ')}`;
                  return activeFuels.map((f, i) => (
                    <ReferenceLine
                      key={f.key}
                      y={Number(selectedCeiling[f.key])}
                      stroke={f.ceilingColor}
                      strokeDasharray="6 3"
                      strokeWidth={1.5}
                      label={i === 0 ? { value: combinedLabel, position: "insideBottomRight", fontSize: 9, fill: "#6b7280", dy: 28 } : undefined}
                    />
                  ));
                })()}

                {/* 공표일 수직선 */}
                {ceilingLabel && (
                  <ReferenceLine
                    x={ceilingLabel}
                    stroke="#3b82f6"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: "공표일", position: "top", fontSize: 10, fill: "#3b82f6" }}
                  />
                )}

                {/* 평균 추이 라인 (점선, showAvg 시에만) */}
                {showAvg && fuels.gasoline && <Line type="monotone" dataKey="gasolineAvg" stroke="#eab308" strokeWidth={2.5} strokeDasharray="5 2" dot={false} name="gasolineAvg" connectNulls />}
                {showAvg && fuels.diesel   && <Line type="monotone" dataKey="dieselAvg"   stroke="#22c55e" strokeWidth={2.5} strokeDasharray="5 2" dot={false} name="dieselAvg"   connectNulls />}
                {showAvg && fuels.kerosene && <Line type="monotone" dataKey="keroseneAvg" stroke="#38bdf8" strokeWidth={2.5} strokeDasharray="5 2" dot={false} name="keroseneAvg" connectNulls />}

                {/* 주유소 개별 라인 (실선, 오버레이) */}
                {selectedStation && fuels.gasoline && (
                  <Line type="monotone" dataKey="stationGas"  stroke="#6366f1" strokeWidth={2} dot={false} name="stationGas"  connectNulls />
                )}
                {selectedStation && fuels.diesel && (
                  <Line type="monotone" dataKey="stationDsl"  stroke="#8b5cf6" strokeWidth={2} dot={false} name="stationDsl"  connectNulls />
                )}
                {selectedStation && fuels.kerosene && (
                  <Line type="monotone" dataKey="stationKero" stroke="#ec4899" strokeWidth={2} dot={false} name="stationKero" connectNulls />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {/* 범례 설명바 */}
          <div className="mt-2 pt-2.5 border-t border-border flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground items-center">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-red-500" />
              <span className="text-red-500 font-bold">빨간색 ↑</span> = 최근 공표일 평균가격보다 높은 업체 수
            </span>
            <span className="w-px h-4 bg-border" />
            <span className="flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-blue-500 font-bold">파란색 ↓</span> = 최근 공표일 평균가격보다 낮은 업체 수
            </span>
            <span className="w-px h-4 bg-border" />
            <span>주유소 검색 시: 최근 공표일 해당 주유소가격 기준 해당일 가격 초과/이하 누계 횟수</span>
            <span className="hidden md:inline text-muted-foreground/50 ml-auto">· 오피넷데이터 활용</span>
          </div>
        </div>
      </div>

    </Layout>
  );
}
