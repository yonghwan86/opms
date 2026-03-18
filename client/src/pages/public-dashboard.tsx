import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComposedChart, Line, BarChart, Bar, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, Globe, Fuel, BarChart2, ShieldCheck,
  MapPin, Loader2, Search, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const appIconSrc = "/icon-192.png";

// ─── 시도 약어 매핑 (Nominatim → DB 형식) ────────────────────────────────────
const SIDO_ABBREV: Record<string, string> = {
  '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천',
  '광주광역시': '광주', '대전광역시': '대전', '울산광역시': '울산', '세종특별자치시': '세종시',
  '경기도': '경기', '강원특별자치도': '강원', '강원도': '강원', '충청북도': '충북', '충청남도': '충남',
  '전라북도': '전북', '전북특별자치도': '전북', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남',
  '제주특별자치도': '제주',
};

// ─── 역지오코딩 → DB region 문자열 변환 ───────────────────────────────────────
async function resolveRegionFromCoords(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`,
      { headers: { "Accept-Language": "ko" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address ?? {};
    const stateRaw: string = addr.state ?? "";
    const sidoAbbrev = SIDO_ABBREV[stateRaw] || stateRaw;
    if (!sidoAbbrev) return null;

    // 시군구 추출: county(시/군/구) → city_district(광역시의 구) → town → suburb 순
    // city는 광역시명과 동일할 수 있어 제외
    const rawSigungu: string =
      addr.county ??
      addr.city_district ??
      addr.town ??
      addr.suburb ??
      "";

    // 광역시/세종: sigungu가 없거나 stateRaw와 동일하면 sido만 반환 (API에서 sidoFilter로 처리)
    const isMetroSido = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종시"].includes(sidoAbbrev);
    if (!rawSigungu || rawSigungu === stateRaw) {
      return sidoAbbrev;
    }
    // 광역시의 구 단위 (예: "서울 강남구")
    if (isMetroSido) {
      return `${sidoAbbrev} ${rawSigungu}`.trim();
    }
    // 도 단위 시/군/구 (예: "충북 청주시")
    return `${sidoAbbrev} ${rawSigungu}`.trim();
  } catch {
    return null;
  }
}

// ─── 위치 훅 ─────────────────────────────────────────────────────────────────
function useGeoRegion() {
  const [region, setRegion] = useState<string | null | undefined>(undefined); // undefined=감지중, null=거부/실패
  useEffect(() => {
    if (!navigator.geolocation) { setRegion(null); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const r = await resolveRegionFromCoords(pos.coords.latitude, pos.coords.longitude);
        setRegion(r);
      },
      () => setRegion(null),
      { timeout: 6000 }
    );
  }, []);
  return region;
}

// ─── 타입 ────────────────────────────────────────────────────────────────────
interface WtiResponse { current: { price: number; change: number; changePercent: number } | null; history: { date: string; value: number }[]; }
interface ExchangeRate { rate: number; change: number; changePercent: number; }
interface SpreadData { spread: number; maxPrice: number; maxStation: string; maxRegion: string; minPrice: number; minStation: string; minRegion: string; }
interface FuelStats { date: string; averages: { gasoline: number; diesel: number; kerosene: number; gasolineChange: number; dieselChange: number; keroseneChange: number } | null; spread: { gasoline: SpreadData | null; diesel: SpreadData | null } | null; }
interface RegionalAvg { sido: string; avgPrice: number; avgDiesel: number | null; }
interface DomesticHistory { date: string; gasoline: number; diesel: number; }
interface CeilingPrice { id: number; gasoline: string | null; diesel: string | null; kerosene: string | null; effectiveDate: string; note: string | null; }
interface CeilingTrendRow { date: string; gasolineAvg: number | null; dieselAvg: number | null; keroseneAvg: number | null; gasolineAbove: number; gasolineBelow: number; dieselAbove: number; dieselBelow: number; keroseneAbove: number; keroseneBelow: number; baseGas: number | null; baseDiesel: number | null; baseKerosene: number | null; }
interface StationRow { date: string; gasoline: number | null; diesel: number | null; kerosene: number | null; }
interface StationSuggest { stationId: string; stationName: string; region: string; }

// ─── 최고가 유종 설정 ─────────────────────────────────────────────────────────
const CEIL_FUEL_CONFIG = [
  { key: "gasoline" as const, label: "휘발유", dot: "bg-amber-400", stroke: "#eab308", ceilingColor: "#d97706", stationStroke: "#6366f1", stationKey: "stationGas" },
  { key: "diesel"   as const, label: "경유",   dot: "bg-green-500", stroke: "#22c55e", ceilingColor: "#16a34a", stationStroke: "#8b5cf6", stationKey: "stationDsl" },
  { key: "kerosene" as const, label: "등유",   dot: "bg-sky-400",   stroke: "#38bdf8", ceilingColor: "#0284c7", stationStroke: "#ec4899", stationKey: "stationKero" },
];

const SIDO_LIST = ["서울","부산","대구","인천","광주","대전","울산","세종시","경기","강원","충북","충남","전북","전남","경북","경남","제주"];

function toLabel8(d: string) { return d.length === 8 ? `${d.slice(4,6)}-${d.slice(6,8)}` : d; }

// ─── DiffBadge ────────────────────────────────────────────────────────────────
function DiffBadge({ val, base }: { val: number | null; base: number | null }) {
  if (val == null || base == null) return null;
  const diff = val - base;
  if (diff === 0) return <span className="ml-1 text-[9px] text-gray-400 font-normal">±0</span>;
  const color = diff > 0 ? "text-red-500" : "text-blue-500";
  const arrow = diff > 0 ? "↑" : "↓";
  return <span className={`ml-1 text-[9px] font-bold ${color}`}>{arrow}{fmt(Math.abs(diff))}</span>;
}

// ─── 최고가격제 툴팁 ──────────────────────────────────────────────────────────
function CeilTooltip({ active, payload, label, fuels, stationName, stationData, ceilingLabel, effectiveDateRaw }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const isPublish = label === ceilingLabel;
  const activeFuels = CEIL_FUEL_CONFIG.filter(f => fuels[f.key]);

  // 공표일 주유소 기준가격
  const stationBaseRow = stationData?.find((r: StationRow) => r.date === effectiveDateRaw);

  // 누계일 계산: 공표일 이후부터 현재 날짜까지
  const stationAbove: Record<string, number> = {};
  const stationBelow: Record<string, number> = {};
  if (stationName && stationData?.length) {
    const currentDateStr = d.dateRaw;
    CEIL_FUEL_CONFIG.forEach(f => {
      if (!fuels[f.key]) return;
      let above = 0; let below = 0;
      const baseVal = stationBaseRow?.[f.key as keyof StationRow] as number | null;
      for (const row of stationData) {
        if (row.date < effectiveDateRaw) continue;
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

  const aboveVal = fuels.gasoline ? (d.gasolineAbove ?? 0) : fuels.diesel ? (d.dieselAbove ?? 0) : (d.keroseneAbove ?? 0);
  const belowVal = fuels.gasoline ? (d.gasolineBelow ?? 0) : fuels.diesel ? (d.dieselBelow ?? 0) : (d.keroseneBelow ?? 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl px-3 py-2.5 text-xs min-w-[200px]">
      <p className="font-bold text-gray-800 mb-1.5 border-b border-gray-100 pb-1">{label}{isPublish ? " ★공표일" : ""}</p>
      {stationName && (
        <div className="mb-1.5 pb-1.5 border-b border-gray-100">
          <p className="text-gray-400 text-[10px] mb-0.5 font-medium truncate max-w-[170px]">{stationName}</p>
          {activeFuels.map(f => {
            const stVal = d[f.stationKey];
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
              <TrendingUp className="w-3 h-3" />초과 {stationAbove[activeFuels[0]?.key ?? "gasoline"] ?? 0}일
            </span>
            <span className="flex items-center gap-0.5 text-blue-500 font-bold text-[10px]">
              <TrendingDown className="w-3 h-3" />이하 {stationBelow[activeFuels[0]?.key ?? "gasoline"] ?? 0}일
            </span>
          </div>
        </div>
      )}
      <div className="space-y-0.5 mb-1.5">
        {fuels.gasoline && d.gasolineAvg != null && (
          <div className="flex justify-between items-center gap-3">
            <span className="text-amber-600">● 휘발유 평균</span>
            <span className="font-semibold text-gray-800">{fmt(d.gasolineAvg)}원<DiffBadge val={d.gasolineAvg} base={d.baseGas} /></span>
          </div>
        )}
        {fuels.diesel && d.dieselAvg != null && (
          <div className="flex justify-between items-center gap-3">
            <span className="text-green-600">● 경유 평균</span>
            <span className="font-semibold text-gray-800">{fmt(d.dieselAvg)}원<DiffBadge val={d.dieselAvg} base={d.baseDiesel} /></span>
          </div>
        )}
        {fuels.kerosene && d.keroseneAvg != null && (
          <div className="flex justify-between items-center gap-3">
            <span className="text-sky-500">● 등유 평균</span>
            <span className="font-semibold text-gray-800">{fmt(d.keroseneAvg)}원<DiffBadge val={d.keroseneAvg} base={d.baseKerosene} /></span>
          </div>
        )}
      </div>
      <div className="pt-1 border-t border-gray-100 flex justify-between gap-1">
        <span className="flex items-center gap-1 text-red-500 font-bold text-[10px]"><TrendingUp className="w-3 h-3" />{fmt(aboveVal)}업체</span>
        <span className="flex items-center gap-1 text-blue-500 font-bold text-[10px]"><TrendingDown className="w-3 h-3" />{fmt(belowVal)}업체</span>
      </div>
    </div>
  );
}

// ─── 주유소 검색 인라인 컴포넌트 ─────────────────────────────────────────────
function PubStationSearch({ value, onChange, onSelect, sido }: {
  value: string; onChange: (v: string) => void;
  onSelect: (s: StationSuggest) => void; sido: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: suggestions = [] } = useQuery<StationSuggest[]>({
    queryKey: ["/api/public/stations/suggest", value, sido],
    queryFn: () => {
      if (value.trim().length < 1) return Promise.resolve([]);
      const p = new URLSearchParams({ q: value });
      if (sido) p.set("sido", sido);
      return fetch(`/api/public/stations/suggest?${p}`).then(r => r.json());
    },
    enabled: value.trim().length >= 1,
    staleTime: 30_000,
  });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative flex-1 min-w-[180px]">
      <p className="text-[10px] text-gray-400 mb-0.5 font-medium">주유소 검색 <span className="text-gray-300">(개별 추이 오버레이)</span></p>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input type="text" value={value} onChange={e => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          placeholder="주유소 이름 검색..." className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {suggestions.map(s => (
            <button key={s.stationId} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex justify-between items-center"
              onClick={() => { onSelect(s); onChange(s.stationName); setOpen(false); }}>
              <span className="font-medium text-gray-800 truncate">{s.stationName}</span>
              <span className="text-gray-400 ml-2 flex-shrink-0 text-[10px]">{s.region}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("ko-KR");
const fmtPrice = (n: number) => `${fmt(n)}원`;
const fmtUsd = (n: number) => `$${n.toFixed(2)}`;

function todayLabel() {
  const d = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function ChangeChip({ val, unit = "원", percent, decimals = 0 }: { val: number; unit?: string; percent?: number; decimals?: number }) {
  const isZero = decimals > 0 ? Math.abs(val) < Math.pow(10, -(decimals + 1)) : Math.round(val) === 0;
  if (isZero) return <span className="text-muted-foreground text-sm flex items-center gap-1"><Minus className="w-4 h-4" /> 변동없음</span>;
  const up = val > 0;
  const displayVal = decimals > 0 ? Math.abs(val).toFixed(decimals) : fmt(Math.abs(Math.round(val)));
  return (
    <span className={cn("text-xs md:text-sm font-semibold flex items-center gap-0.5 md:gap-1 whitespace-nowrap", up ? "text-red-500" : "text-blue-500")}>
      {up ? <TrendingUp className="w-3 h-3 md:w-4 md:h-4" /> : <TrendingDown className="w-3 h-3 md:w-4 md:h-4" />}
      {up ? "+" : "-"}{displayVal}{unit}
      {percent !== undefined && <span className="font-normal text-xs opacity-80">({percent > 0 ? "+" : ""}{percent.toFixed(2)}%)</span>}
    </span>
  );
}

function MetricCard({ title, subtitle, source, live, icon: Icon, iconBg, loading, children }: {
  title: string; subtitle?: string; source?: string; live?: boolean; icon: React.ElementType; iconBg: string; loading?: boolean; children: React.ReactNode;
}) {
  return (
    <Card className="px-3 pt-3 pb-2 md:px-4 md:pt-4 md:pb-3 border border-border bg-card flex flex-col">
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
          <div className={cn("w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0", iconBg)}>
            <Icon className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs md:text-sm font-semibold text-muted-foreground leading-tight truncate">{title}</p>
            {subtitle && <p className="text-xs text-muted-foreground/90 mt-0.5 leading-tight">{subtitle}</p>}
          </div>
        </div>
        {live && !loading && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />실시간
          </span>
        )}
      </div>
      {loading ? (
        <div className="space-y-2 mt-3"><Skeleton className="h-9 w-36" /><Skeleton className="h-5 w-28" /></div>
      ) : <div className="mt-3 flex-1">{children}</div>}
      {source && <p className="text-[10px] text-muted-foreground/70 mt-2 text-right">출처: {source}</p>}
    </Card>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-sm space-y-1.5">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey === "wti" ? "WTI" : p.dataKey === "gasoline" ? "휘발유" : "경유"}:{" "}
          {p.dataKey === "wti" ? `$${Number(p.value).toFixed(2)}` : `${fmt(Number(p.value))}원`}
        </p>
      ))}
    </div>
  );
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
export default function PublicDashboardPage() {
  const geoRegion = useGeoRegion(); // undefined=감지중, null=전국, string=시군구
  const isGeoLoading = geoRegion === undefined;
  const regionParam = geoRegion ? `?region=${encodeURIComponent(geoRegion)}` : "";
  const regionLabel = geoRegion ?? "전국";

  const [spreadTab, setSpreadTab] = useState<'gasoline' | 'diesel'>('gasoline');
  const [regionalTab, setRegionalTab] = useState<'gasoline' | 'diesel'>('gasoline');
  const [chartTab, setChartTab] = useState<'intl' | 'regional' | 'ceiling'>('ceiling');

  // 최고가격제 탭 상태
  const [ceilFuels, setCeilFuels] = useState({ gasoline: true, diesel: true, kerosene: false });
  const [ceilDate, setCeilDate] = useState("");
  const [ceilSido, setCeilSido] = useState("");
  const [ceilSigungu, setCeilSigungu] = useState("");
  const [ceilDateMenu, setCeilDateMenu] = useState(false);
  const [ceilSidoMenu, setCeilSidoMenu] = useState(false);
  const [ceilStationSearch, setCeilStationSearch] = useState("");
  const [ceilStation, setCeilStation] = useState<StationSuggest | null>(null);
  const ceilDateRef = useRef<HTMLDivElement>(null);
  const ceilSidoRef = useRef<HTMLDivElement>(null);

  const { data: wtiRes, isLoading: wtiLoading } = useQuery<WtiResponse>({
    queryKey: ["/api/public/wti"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const { data: fx } = useQuery<ExchangeRate>({
    queryKey: ["/api/public/exchange-rate"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const { data: ceilingData = [], isLoading: ceilingLoading } = useQuery<CeilingPrice[]>({
    queryKey: ["/api/public/ceiling-prices"],
    staleTime: 5 * 60 * 1000,
  });
  const { data: fuelStats, isLoading: fuelLoading } = useQuery<FuelStats>({
    queryKey: ["/api/public/fuel-stats", geoRegion],
    queryFn: () => fetch(`/api/public/fuel-stats${regionParam}`).then(r => r.json()),
    enabled: !isGeoLoading,
    staleTime: 2 * 60 * 1000,
  });
  const { data: regional = [], isLoading: regionalLoading } = useQuery<RegionalAvg[]>({
    queryKey: ["/api/public/regional-averages", geoRegion],
    queryFn: () => fetch(`/api/public/regional-averages${regionParam}`).then(r => r.json()),
    enabled: !isGeoLoading,
    staleTime: 2 * 60 * 1000,
  });
  const { data: domesticHistory = [] } = useQuery<DomesticHistory[]>({
    queryKey: ["/api/public/domestic-history"],
    staleTime: 5 * 60 * 1000,
  });

  const chartData = useMemo(() => {
    const domMap = new Map(domesticHistory.map(d => [
      `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`, d,
    ]));
    const wtiMap = new Map((wtiRes?.history ?? []).map(h => [h.date, h.value]));
    const allDates = new Set([
      ...domesticHistory.map(d => `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`),
      ...(wtiRes?.history ?? []).map(h => h.date),
    ]);
    return Array.from(allDates).sort().map(date => ({
      date, label: date.slice(5),
      wti: wtiMap.get(date) ?? null,
      gasoline: domMap.get(date)?.gasoline ?? null,
      diesel: domMap.get(date)?.diesel ?? null,
    }));
  }, [wtiRes, domesticHistory]);

  const wti = wtiRes?.current;
  const avg = fuelStats?.averages;
  const spread = fuelStats?.spread;

  const sortedRegional = useMemo(() =>
    [...regional].sort((a, b) =>
      regionalTab === 'diesel' ? ((b.avgDiesel ?? 0) - (a.avgDiesel ?? 0)) : (b.avgPrice - a.avgPrice)
    ), [regional, regionalTab]);

  const vals = sortedRegional.map(r => regionalTab === 'diesel' ? (r.avgDiesel ?? 0) : r.avgPrice).filter(Boolean);
  const domMin = vals.length ? Math.min(...vals) - 15 : 0;
  const domMax = vals.length ? Math.max(...vals) + 8 : 100;

  // 최고가격제 전체 목록 (공표일 선택용)
  const { data: allCeilings = [], isLoading: allCeilingsLoading } = useQuery<CeilingPrice[]>({
    queryKey: ["/api/public/ceiling-prices/all"],
    staleTime: 10 * 60 * 1000,
  });

  // ceilDate 초기화 (최신 공표일)
  useEffect(() => {
    if (allCeilings.length && !ceilDate && chartTab === 'ceiling') {
      setCeilDate(allCeilings[0].effectiveDate);
    }
  }, [allCeilings, ceilDate, chartTab]);

  const selectedCeiling = useMemo(
    () => allCeilings.find(c => c.effectiveDate === ceilDate) ?? null,
    [allCeilings, ceilDate],
  );

  // 시군구 목록
  const { data: ceilSigunguList = [] } = useQuery<string[]>({
    queryKey: ["/api/public/stations/subregions", ceilSido],
    queryFn: () => ceilSido ? fetch(`/api/public/stations/subregions?sido=${encodeURIComponent(ceilSido)}`).then(r => r.json()) : Promise.resolve([]),
    enabled: !!ceilSido,
    staleTime: 60_000,
  });

  // 트렌드 데이터
  const { data: ceilTrendData = [], isLoading: ceilTrendLoading } = useQuery<CeilingTrendRow[]>({
    queryKey: ["/api/public/ceiling-trend", ceilDate, ceilSido, ceilSigungu],
    queryFn: () => {
      if (!ceilDate) return Promise.resolve([]);
      const p = new URLSearchParams({ effectiveDate: ceilDate });
      if (ceilSido) p.set("sido", ceilSido);
      if (ceilSigungu) p.set("sigungu", ceilSigungu);
      return fetch(`/api/public/ceiling-trend?${p}`).then(r => r.json());
    },
    enabled: !!ceilDate && chartTab === 'ceiling',
    staleTime: 2 * 60 * 1000,
  });

  // 주유소 개별 데이터
  const { data: ceilStationData = [] } = useQuery<StationRow[]>({
    queryKey: ["/api/public/ceiling-trend/station", ceilDate, ceilStation?.stationId],
    queryFn: () => {
      if (!ceilDate || !ceilStation) return Promise.resolve([]);
      const p = new URLSearchParams({ effectiveDate: ceilDate, stationId: ceilStation.stationId });
      return fetch(`/api/public/ceiling-trend/station?${p}`).then(r => r.json());
    },
    enabled: !!ceilDate && !!ceilStation,
    staleTime: 2 * 60 * 1000,
  });

  // 차트 데이터 병합 (최고가격제 탭)
  const ceilChartData = useMemo(() => {
    const stMap = new Map<string, StationRow>(ceilStationData.map(r => [r.date, r]));
    return ceilTrendData.map(row => {
      const st = stMap.get(row.date);
      return {
        ...row,
        label: toLabel8(row.date),
        dateRaw: row.date,
        baseGas: row.baseGas,
        baseDiesel: row.baseDiesel,
        baseKerosene: row.baseKerosene,
        stationGas:  st?.gasoline ?? null,
        stationDsl:  st?.diesel ?? null,
        stationKero: st?.kerosene ?? null,
      };
    });
  }, [ceilTrendData, ceilStationData]);

  const ceilLabel = ceilDate ? toLabel8(ceilDate.replace(/-/g, "")) : "";

  // YAxis 도메인 (최고가격제)
  const ceilAllPrices = ceilChartData.flatMap(d => [
    ceilFuels.gasoline ? d.gasolineAvg : null,
    ceilFuels.diesel   ? d.dieselAvg   : null,
    ceilFuels.kerosene ? d.keroseneAvg : null,
    ceilFuels.gasoline && ceilStation ? d.stationGas  : null,
    ceilFuels.diesel   && ceilStation ? d.stationDsl  : null,
    ceilFuels.kerosene && ceilStation ? d.stationKero : null,
  ].filter((v): v is number => v != null));
  const ceilPriceVals = [
    ceilFuels.gasoline && selectedCeiling?.gasoline ? Number(selectedCeiling.gasoline) : null,
    ceilFuels.diesel   && selectedCeiling?.diesel   ? Number(selectedCeiling.diesel)   : null,
    ceilFuels.kerosene && selectedCeiling?.kerosene ? Number(selectedCeiling.kerosene) : null,
  ].filter((v): v is number => v != null);
  const ceilYVals = [...ceilAllPrices, ...ceilPriceVals];
  const ceilYMin = ceilYVals.length ? Math.floor((Math.min(...ceilYVals) - 30) / 10) * 10 : 1000;
  const ceilYMax = ceilYVals.length ? Math.ceil((Math.max(...ceilYVals) + 30) / 10) * 10 : 2200;

  // 외부 클릭 닫기 (최고가격제 탭 드롭다운)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ceilDateRef.current && !ceilDateRef.current.contains(e.target as Node)) setCeilDateMenu(false);
      if (ceilSidoRef.current && !ceilSidoRef.current.contains(e.target as Node)) setCeilSidoMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 h-14 max-w-screen-xl mx-auto">
          <div className="flex items-center gap-2.5">
            <img src={appIconSrc} alt="앱 아이콘" className="w-7 h-7 rounded-lg" />
            <div>
              <p className="text-sm font-semibold text-foreground leading-tight">유가 이상징후 탐지 시스템</p>
              <p className="text-xs text-muted-foreground">공개 유가 현황 정보</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isGeoLoading ? (
              <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> 위치 확인 중...</span>
            ) : (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {geoRegion ? geoRegion : "전국 기준"}
              </span>
            )}
            <span className="text-muted-foreground/50">|</span>
            <span>📅 {todayLabel()}</span>
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto p-3 md:p-5 space-y-4">

        {/* ── 상단 4 카드 ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">

          {/* WTI */}
          <MetricCard title="국제 유가 (WTI)" icon={Globe} iconBg="bg-amber-600" loading={wtiLoading} source="Yahoo Finance" live>
            {wti ? (
              <>
                <div className="flex items-center justify-between gap-1.5 overflow-hidden">
                  <p className="text-xl md:text-3xl font-bold text-foreground tracking-tight shrink-0">{fmtUsd(wti.price)}</p>
                  {fx && (
                    <div className="flex flex-col items-end shrink-0 border border-border rounded-lg px-2 py-1 bg-muted/70">
                      <span className="text-[11px] md:text-sm font-bold text-foreground whitespace-nowrap leading-tight">{fmt(Math.round(fx.rate))}원/달러</span>
                      <ChangeChip val={fx.change} unit="원" />
                    </div>
                  )}
                </div>
                <div className="mt-1.5"><ChangeChip val={wti.change} unit="$" percent={wti.changePercent} decimals={2} /></div>
              </>
            ) : <p className="text-sm text-muted-foreground">데이터 없음</p>}
          </MetricCard>

          {/* 석유 최고가격제 */}
          <MetricCard
            title="석유 최고가격제"
            subtitle={ceilingData[0] ? `적용일 ${ceilingData[0].effectiveDate}` : undefined}
            icon={ShieldCheck} iconBg="bg-indigo-600" loading={ceilingLoading} source="산업통상자원부"
          >
            {ceilingData.length > 0 ? (() => {
              const cur = ceilingData[0];
              const prev = ceilingData[1];
              return (
                <div className="space-y-2">
                  {[
                    { label: "휘발유", cur: cur.gasoline, prev: prev?.gasoline },
                    { label: "경유", cur: cur.diesel, prev: prev?.diesel },
                    { label: "등유", cur: cur.kerosene, prev: prev?.kerosene },
                  ].map(row => {
                    const curVal = row.cur ? Number(row.cur) : null;
                    const prevVal = row.prev ? Number(row.prev) : null;
                    const diff = curVal !== null && prevVal !== null ? curVal - prevVal : null;
                    return (
                      <div key={row.label} className="flex items-center justify-between gap-1">
                        <span className="text-xs md:text-sm text-muted-foreground w-10 md:w-12 flex-shrink-0">{row.label}</span>
                        <span className="text-sm md:text-base font-bold text-foreground whitespace-nowrap flex-shrink-0">{curVal !== null ? fmtPrice(curVal) : "—"}</span>
                        <span className="flex-shrink-0">{diff !== null ? <ChangeChip val={diff} /> : <span className="text-xs text-muted-foreground">—</span>}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })() : <p className="text-sm text-muted-foreground">데이터 없음</p>}
          </MetricCard>

          {/* 국내 유류 평균 */}
          <MetricCard title="국내 유류 평균" icon={Fuel} iconBg="bg-orange-500" loading={fuelLoading} source="오피넷" live>
            {avg ? (
              <div className="space-y-2">
                {[
                  { label: "휘발유", val: avg.gasoline, change: avg.gasolineChange },
                  { label: "경유", val: avg.diesel, change: avg.dieselChange },
                  { label: "등유", val: avg.kerosene, change: avg.keroseneChange },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-1">
                    <span className="text-xs md:text-sm text-muted-foreground w-10 md:w-12 flex-shrink-0">{row.label}</span>
                    <span className="text-sm md:text-base font-bold text-foreground whitespace-nowrap flex-shrink-0">{fmtPrice(row.val)}</span>
                    <span className="flex-shrink-0"><ChangeChip val={row.change} /></span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">데이터 없음</p>}
          </MetricCard>

          {/* 유가 가격 편차 (위치 기반) */}
          <MetricCard
            title={`${regionLabel} 유가 가격 편차`}
            subtitle="최고가 − 최저가 격차"
            icon={BarChart2}
            iconBg={spreadTab === 'diesel' ? "bg-emerald-500" : "bg-yellow-400"}
            loading={fuelLoading || isGeoLoading}
            source="오피넷"
          >
            {(() => {
              const sp = spread?.[spreadTab] ?? null;
              return sp ? (
                <>
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xl md:text-3xl font-bold text-foreground tracking-tight">{fmt(sp.spread)}원</p>
                    <div className="flex gap-1">
                      {(['gasoline', 'diesel'] as const).map(tab => (
                        <button key={tab} onClick={() => setSpreadTab(tab)}
                          className={cn("w-8 h-6 flex items-center justify-center rounded text-xs font-semibold transition-colors",
                            spreadTab === tab
                              ? tab === 'gasoline' ? "bg-yellow-100 text-yellow-700" : "bg-emerald-100 text-emerald-700"
                              : "text-muted-foreground hover:bg-muted"
                          )}>
                          {tab === 'gasoline' ? '휘' : '경'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5 mt-2">
                    {[
                      { label: "최고", labelColor: "text-red-500", station: sp.maxStation, region: sp.maxRegion, price: sp.maxPrice },
                      { label: "최저", labelColor: "text-blue-500", station: sp.minStation, region: sp.minRegion, price: sp.minPrice },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between gap-1">
                        <span className={cn("font-semibold text-xs flex-shrink-0", row.labelColor)}>{row.label}</span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="text-foreground text-xs truncate flex-1 mx-1 text-left underline decoration-dotted underline-offset-2 cursor-pointer">
                              {row.station}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent side="top" className="w-56 p-3 space-y-2">
                            <p className="font-semibold text-sm">{row.station}</p>
                            <p className="text-sm text-muted-foreground">{row.region}</p>
                            <p className="font-bold text-base">{fmtPrice(row.price)}</p>
                          </PopoverContent>
                        </Popover>
                        <span className="font-bold text-foreground text-sm flex-shrink-0">{fmtPrice(row.price)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <p className="text-sm text-muted-foreground">데이터 없음</p>;
            })()}
          </MetricCard>
        </div>

        {/* ── 차트 섹션 (3탭) ── */}
        <Card className="border border-border bg-card">
          {/* 탭 헤더 */}
          <div className="px-4 pt-3 pb-0 border-b border-border flex items-center gap-1 flex-wrap">
            {([
              { id: 'intl', label: '국제-국내 연동' },
              { id: 'regional', label: '지역별 순위' },
              { id: 'ceiling', label: '최고가격제 변동추이' },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setChartTab(t.id)}
                className={cn(
                  "text-xs px-3 py-2 font-medium border-b-2 transition-colors -mb-px",
                  chartTab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}>
                {t.label}
              </button>
            ))}
          </div>

          {/* 탭 1: 국제-국내 연동 */}
          {chartTab === 'intl' && (
            <div>
              <div className="px-5 pt-3 pb-0">
                <div className="flex flex-col gap-1 pb-2">
                  <h2 className="text-sm md:text-base font-semibold text-foreground">국제-국내 유가 연동 분석</h2>
                  <p className="text-xs text-muted-foreground">WTI 국제 유가 vs 국내 평균 유가</p>
                </div>
                <p className="text-xs text-muted-foreground mb-1 leading-relaxed">
                  ※ 국제 유가(WTI) 변동은 통상 <span className="font-medium text-foreground">2~3주 후</span> 국내 주유소 가격에 반영됩니다.
                </p>
              </div>
              <div className="px-2 pb-3 pt-1">
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="label"
                      tick={{ fontSize: 11, fill: "#111827", fontWeight: 700, textAnchor: "middle" }}
                      tickLine={false} axisLine={{ stroke: "#e5e7eb" }}
                      interval={Math.max(0, Math.floor(chartData.length / 6) - 1)}
                      height={36} padding={{ left: 24, right: 24 }} tickMargin={10}
                    />
                    <YAxis yAxisId="wti" orientation="left"
                      tick={{ fontSize: 12, fill: "#374151", fontWeight: 700 }}
                      tickFormatter={v => `$${v}`} domain={["auto", "auto"]} tickCount={6} width={56} axisLine={false} tickLine={false}
                    />
                    <YAxis yAxisId="domestic" orientation="right"
                      tick={{ fontSize: 12, fill: "#374151", fontWeight: 700 }}
                      tickFormatter={v => `${fmt(v)}원`} domain={["auto", "auto"]} tickCount={6} width={64} axisLine={false} tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} iconType="circle" iconSize={10}
                      formatter={(val) => val === "wti" ? "WTI (국제)" : val === "gasoline" ? "휘발유" : "경유"}
                    />
                    <Line yAxisId="wti" type="monotone" dataKey="wti" stroke="#64748b" strokeWidth={2.5} dot={false} name="wti" connectNulls />
                    <Line yAxisId="domestic" type="monotone" dataKey="gasoline" stroke="#eab308" strokeWidth={2.5} dot={false} name="gasoline" connectNulls />
                    <Line yAxisId="domestic" type="monotone" dataKey="diesel" stroke="#22c55e" strokeWidth={2.5} dot={false} name="diesel" connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* 탭 2: 지역별 순위 */}
          {chartTab === 'regional' && (
            <div>
              <div className="px-5 py-3 flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-base font-semibold text-foreground">지역별 평균 유가 순위</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {regionalTab === 'diesel' ? "경유" : "휘발유"}{" "}
                    {isGeoLoading ? "위치 확인 중" : geoRegion ? `${geoRegion} 시/군/구별` : "시/도별"} 평균
                  </p>
                </div>
                <div className="flex gap-1">
                  {(['gasoline', 'diesel'] as const).map(tab => (
                    <button key={tab} onClick={() => setRegionalTab(tab)}
                      className={cn("text-xs px-2.5 py-1 rounded-md font-medium transition-colors",
                        regionalTab === tab
                          ? tab === 'gasoline' ? "bg-yellow-400 text-white" : "bg-emerald-500 text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}>
                      {tab === 'gasoline' ? '휘발유' : '경유'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-3 pb-3">
                {regionalLoading || isGeoLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : sortedRegional.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">데이터 없음</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(340, sortedRegional.length * 28 + 20)}>
                    <BarChart data={sortedRegional} layout="vertical" margin={{ top: 4, right: 50, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" domain={[domMin, domMax]}
                        tick={{ fontSize: 12, fill: "#374151", fontWeight: 600 }}
                        tickFormatter={v => fmt(v)} tickLine={false} axisLine={false} tickCount={4}
                      />
                      <YAxis type="category" dataKey="sido"
                        tick={{ fontSize: 13, fill: "#374151", fontWeight: 600 }}
                        width={52} tickLine={false} axisLine={false}
                        tickFormatter={(v: string) => v.includes(' ') ? v.split(' ').slice(1).join(' ') : v}
                      />
                      <Tooltip
                        formatter={(v: any) => [`${fmt(Number(v))}원`, regionalTab === 'diesel' ? "평균 경유" : "평균 휘발유"]}
                        labelFormatter={(label: string) => label.includes(' ') ? label.split(' ').slice(1).join(' ') : label}
                        contentStyle={{ fontSize: 13 }}
                      />
                      <Bar dataKey={regionalTab === 'diesel' ? "avgDiesel" : "avgPrice"}
                        fill={regionalTab === 'diesel' ? "#22c55e" : "#facc15"}
                        radius={[0, 4, 4, 0]} barSize={20}
                        label={{ position: "right", fontSize: 13, fill: "#0f172a", fontWeight: 800, formatter: (v: number) => `${fmt(v)}` }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* 탭 3: 최고가격제 변동추이 */}
          {chartTab === 'ceiling' && (
            <div className="p-4 space-y-3">
              {/* 필터 */}
              <div className="flex flex-wrap gap-3 items-end">
                {/* 공표일 */}
                <div ref={ceilDateRef} className="relative">
                  <p className="text-[10px] text-gray-400 mb-0.5 font-medium">공표일</p>
                  <button onClick={() => setCeilDateMenu(p => !p)}
                    className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg">
                    {ceilDate || "선택 중..."} <ChevronDown className="w-3 h-3" />
                  </button>
                  {ceilDateMenu && (
                    <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg min-w-[160px] max-h-48 overflow-y-auto">
                      {allCeilingsLoading
                        ? <p className="text-xs text-muted-foreground px-3 py-2">로딩 중...</p>
                        : allCeilings.map(c => (
                          <button key={c.id} onClick={() => { setCeilDate(c.effectiveDate); setCeilDateMenu(false); }}
                            className={cn("w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center justify-between gap-2",
                              c.effectiveDate === ceilDate && "bg-primary/10 font-semibold text-primary")}>
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
                  {/* 시도 */}
                  <div ref={ceilSidoRef} className="relative">
                    <p className="text-[10px] text-gray-400 mb-0.5 font-medium">시도</p>
                    <button onClick={() => setCeilSidoMenu(p => !p)}
                      className="flex items-center gap-1.5 border border-border text-xs text-foreground px-3 py-1.5 rounded-lg">
                      {ceilSido || "전국"} <ChevronDown className="w-3 h-3" />
                    </button>
                    {ceilSidoMenu && (
                      <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg min-w-[110px] max-h-64 overflow-y-auto">
                        <button className={cn("w-full text-left px-3 py-2 text-xs hover:bg-muted", !ceilSido && "font-semibold text-primary")}
                          onClick={() => { setCeilSido(""); setCeilSigungu(""); setCeilSidoMenu(false); }}>전국</button>
                        {SIDO_LIST.map(s => (
                          <button key={s} className={cn("w-full text-left px-3 py-2 text-xs hover:bg-muted", ceilSido === s && "font-semibold text-primary")}
                            onClick={() => { setCeilSido(s); setCeilSigungu(""); setCeilSidoMenu(false); }}>{s}</button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 시군구 */}
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5 font-medium">시군구</p>
                    {ceilSido && ceilSigunguList.length > 0 ? (
                      <select value={ceilSigungu} onChange={e => setCeilSigungu(e.target.value)}
                        className="border border-border text-xs text-foreground px-3 py-1.5 rounded-lg bg-background">
                        <option value="">전체</option>
                        {ceilSigunguList.map(s => <option key={s} value={s}>{s.replace(new RegExp(`^${ceilSido}\\s*`), "")}</option>)}
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
                <PubStationSearch
                  value={ceilStationSearch}
                  onChange={v => { setCeilStationSearch(v); if (!v.trim()) setCeilStation(null); }}
                  onSelect={s => setCeilStation(s)}
                  sido={ceilSido}
                />

                {/* 유종 토글 */}
                <div className="flex gap-1.5 ml-auto">
                  {CEIL_FUEL_CONFIG.map(f => (
                    <button key={f.key}
                      onClick={() => setCeilFuels(p => ({ ...p, [f.key]: !p[f.key] }))}
                      className={cn("flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all",
                        ceilFuels[f.key]
                          ? "border-border text-foreground bg-card font-medium shadow-sm"
                          : "border-border/50 text-muted-foreground bg-muted/30")}>
                      <span className={cn("w-2 h-2 rounded-full", f.dot, !ceilFuels[f.key] && "opacity-30")} />
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 차트 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">최고가격 공표 전후 유가 변동</p>
                    <p className="text-xs text-muted-foreground">수평 점선: 최고가격 기준</p>
                  </div>
                </div>
                {ceilTrendLoading ? (
                  <div className="space-y-2 py-8"><Skeleton className="h-4 w-full" /><Skeleton className="h-60 w-full" /></div>
                ) : ceilChartData.length === 0 ? (
                  <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                    {ceilDate ? "해당 기간의 데이터가 없습니다." : "공표일을 선택하세요."}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={ceilChartData} margin={{ top: 30, right: 90, left: 12, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="label"
                        tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }}
                        tickLine={false} axisLine={{ stroke: "#e5e7eb" }}
                        interval={3} height={32} tickMargin={8}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }}
                        tickFormatter={v => `${fmt(v)}원`}
                        domain={[ceilYMin, ceilYMax]} tickCount={7} width={72} axisLine={false} tickLine={false}
                      />
                      <Tooltip content={<CeilTooltip fuels={ceilFuels} stationName={ceilStation?.stationName} stationData={ceilStationData} ceilingLabel={ceilLabel} effectiveDateRaw={ceilDate ? ceilDate.replace(/-/g, "") : ""} />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8}
                        formatter={(v: string) => {
                          if (v === "stationGas")  return `${ceilStation?.stationName ?? "주유소"} (휘발유)`;
                          if (v === "stationDsl")  return `${ceilStation?.stationName ?? "주유소"} (경유)`;
                          if (v === "stationKero") return `${ceilStation?.stationName ?? "주유소"} (등유)`;
                          if (v === "gasolineAvg") return "휘발유 평균";
                          if (v === "dieselAvg")   return "경유 평균";
                          if (v === "keroseneAvg") return "등유 평균";
                          return v;
                        }}
                      />
                      {/* 최고가 기준선 */}
                      {selectedCeiling && CEIL_FUEL_CONFIG.filter(f => ceilFuels[f.key]).map(f => {
                        const val = selectedCeiling[f.key];
                        if (!val) return null;
                        return <ReferenceLine key={f.key} y={Number(val)} stroke={f.ceilingColor} strokeDasharray="6 3" strokeWidth={1.5}
                          label={{ value: `${f.label} ${fmt(Number(val))}원`, position: "insideRight", fontSize: 9, fill: f.ceilingColor, dx: 8 }} />;
                      })}
                      {/* 공표일 수직선 */}
                      {ceilLabel && <ReferenceLine x={ceilLabel} stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1.5}
                        label={{ value: "공표일", position: "top", fontSize: 10, fill: "#3b82f6" }} />}
                      {/* 평균 라인 */}
                      {ceilFuels.gasoline && <Line type="monotone" dataKey="gasolineAvg" stroke="#eab308" strokeWidth={2.5} dot={false} name="gasolineAvg" connectNulls />}
                      {ceilFuels.diesel   && <Line type="monotone" dataKey="dieselAvg"   stroke="#22c55e" strokeWidth={2.5} dot={false} name="dieselAvg"   connectNulls />}
                      {ceilFuels.kerosene && <Line type="monotone" dataKey="keroseneAvg" stroke="#38bdf8" strokeWidth={2.5} dot={false} name="keroseneAvg" connectNulls />}
                      {/* 주유소 오버레이 */}
                      {ceilStation && ceilFuels.gasoline  && <Line type="monotone" dataKey="stationGas"  stroke="#6366f1" strokeWidth={2} strokeDasharray="5 2" dot={false} name="stationGas"  connectNulls />}
                      {ceilStation && ceilFuels.diesel    && <Line type="monotone" dataKey="stationDsl"  stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 2" dot={false} name="stationDsl"  connectNulls />}
                      {ceilStation && ceilFuels.kerosene  && <Line type="monotone" dataKey="stationKero" stroke="#ec4899" strokeWidth={2} strokeDasharray="5 2" dot={false} name="stationKero" connectNulls />}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
                <div className="mt-2 pt-2.5 border-t border-border flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground items-center">
                  <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-red-500" /><span className="text-red-500 font-bold">빨간색 ↑</span> = 최근 공표일 평균가격보다 높은 업체 수</span>
                  <span className="w-px h-4 bg-border hidden sm:block" />
                  <span className="flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5 text-blue-500" /><span className="text-blue-500 font-bold">파란색 ↓</span> = 최근 공표일 평균가격보다 낮은 업체 수</span>
                  {ceilStation && (
                    <>
                      <span className="w-px h-4 bg-border hidden sm:block" />
                      <span className="text-[10px] text-muted-foreground/70">툴팁: 최근 공표일 해당 주유소가격 기준 누계 횟수</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* 푸터 */}
        <div className="text-center text-xs text-muted-foreground py-4 border-t border-border">
          <p>이 페이지의 유가 정보는 오피넷 및 Yahoo Finance 데이터를 기반으로 합니다.</p>
          <p className="mt-1">© 한국석유관리원 유가 이상징후 탐지 시스템</p>
        </div>
      </div>
    </div>
  );
}
