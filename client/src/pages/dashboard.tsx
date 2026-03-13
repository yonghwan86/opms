import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ComposedChart, Line, Bar, BarChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, AlertCircle, Fuel, DollarSign, Globe, BarChart2, HelpCircle, Pencil, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const regionShort = (r: string) => r.includes(" ") ? r.split(" ").slice(1).join(" ") : r;

// ─── 날씨 위젯 ───────────────────────────────────────────────────────────────
const HQ_COORDS: Record<string, { lat: number; lon: number }> = {
  HQ_SUDNAM:   { lat: 37.4563, lon: 126.7052 }, // 인천
  HQ_SUDBUK:   { lat: 37.5665, lon: 126.9780 }, // 서울
  HQ_DAEJEON:  { lat: 36.3504, lon: 127.3845 }, // 대전
  HQ_CHUNGBUK: { lat: 36.6424, lon: 127.4890 }, // 청주
  HQ_GWANGJU:  { lat: 35.1595, lon: 126.8526 }, // 광주
  HQ_JEONBUK:  { lat: 35.8242, lon: 127.1480 }, // 전주
  HQ_BUSAN:    { lat: 35.1796, lon: 129.0756 }, // 부산
  HQ_DAEGU:    { lat: 35.8714, lon: 128.6014 }, // 대구
  HQ_GANGWON:  { lat: 37.8813, lon: 127.7298 }, // 춘천
  HQ_JEJU:     { lat: 33.4996, lon: 126.5312 }, // 제주
};
const SEOUL = { lat: 37.5665, lon: 126.9780 };

function wmoToWeather(code: number): { icon: string; desc: string } {
  if (code === 0) return { icon: "☀️", desc: "맑음" };
  if (code <= 2) return { icon: "🌤", desc: "구름조금" };
  if (code === 3) return { icon: "☁️", desc: "흐림" };
  if (code <= 48) return { icon: "🌫", desc: "안개" };
  if (code <= 67) return { icon: "🌧", desc: "비" };
  if (code <= 77) return { icon: "❄️", desc: "눈" };
  if (code <= 82) return { icon: "🌦", desc: "소나기" };
  return { icon: "⛈", desc: "뇌우" };
}

function todayLabel(): string {
  const d = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function DateWeatherWidget({ isMaster, headquartersCode }: { isMaster: boolean; headquartersCode?: string | null }) {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geoReady, setGeoReady] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      const fallback = !isMaster && headquartersCode && HQ_COORDS[headquartersCode]
        ? HQ_COORDS[headquartersCode]
        : SEOUL;
      setCoords(fallback);
      setGeoReady(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGeoReady(true);
      },
      () => {
        const fallback = !isMaster && headquartersCode && HQ_COORDS[headquartersCode]
          ? HQ_COORDS[headquartersCode]
          : SEOUL;
        setCoords(fallback);
        setGeoReady(true);
      },
      { timeout: 5000 }
    );
  }, [isMaster, headquartersCode]);

  const { data: weather, isLoading: wxLoading } = useQuery({
    queryKey: ["weather", coords?.lat, coords?.lon],
    queryFn: async () => {
      if (!coords) return null;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code&timezone=Asia/Seoul`;
      const res = await fetch(url);
      const data = await res.json();
      const c = data.current;
      return {
        temp: Math.round(c.temperature_2m),
        humidity: c.relative_humidity_2m,
        precipProb: c.precipitation_probability,
        weather: wmoToWeather(c.weather_code),
      };
    },
    enabled: geoReady && !!coords,
    staleTime: 10 * 60 * 1000,
  });

  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap justify-end">
      <span className="flex items-center gap-1.5 text-foreground font-medium">
        📅 {todayLabel()}
      </span>
      {!geoReady || wxLoading ? (
        <Skeleton className="h-5 w-40" />
      ) : weather ? (
        <span className="flex items-center gap-1.5">
          <span className="text-base leading-none">{weather.weather.icon}</span>
          <span className="font-semibold text-foreground">{weather.temp}°C</span>
          <span>{weather.weather.desc}</span>
          <span className="text-xs opacity-70">· 강수 {weather.precipProb}% 습도 {weather.humidity}%</span>
        </span>
      ) : null}
    </div>
  );
}

// ─── 타입 ────────────────────────────────────────────────────────────────────
interface WtiResponse {
  current: { price: number; change: number; changePercent: number } | null;
  history: { date: string; value: number }[];
}
interface ExchangeRate {
  rate: number; change: number; changePercent: number;
}
interface SpreadData {
  spread: number; maxPrice: number; maxStation: string; maxRegion: string;
  minPrice: number; minStation: string; minRegion: string;
}
interface FuelStats {
  date: string;
  averages: { gasoline: number; diesel: number; kerosene: number; gasolineChange: number; dieselChange: number; keroseneChange: number } | null;
  spread: { gasoline: SpreadData | null; diesel: SpreadData | null } | null;
}
interface RegionalAvg { sido: string; avgPrice: number; avgDiesel: number | null; }
interface DomesticHistory { date: string; gasoline: number; diesel: number; }
interface RegionalHistory { date: string; gasoline: number | null; diesel: number | null; kerosene: number | null; }
interface TopStation {
  rank: number; stationId: string; stationName: string; region: string;
  brand: string | null; isSelf: boolean; price?: number; prevPrice?: number; changeAmount?: number;
}
interface CeilingPrice {
  id: number; gasoline: string | null; diesel: string | null; kerosene: string | null;
  effectiveDate: string; note: string | null; createdBy: number | null; createdAt: string;
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("ko-KR");
const fmtPrice = (n: number) => `${fmt(n)}원`;
const fmtUsd = (n: number) => `$${n.toFixed(2)}`;

function ChangeChip({ val, unit = "원", percent, decimals = 0 }: { val: number; unit?: string; percent?: number; decimals?: number }) {
  const isZero = decimals > 0 ? Math.abs(val) < Math.pow(10, -(decimals + 1)) : Math.round(val) === 0;
  if (isZero) return (
    <span className="text-muted-foreground text-sm flex items-center gap-1">
      <Minus className="w-4 h-4" /> 변동없음
    </span>
  );
  const up = val > 0;
  const displayVal = decimals > 0 ? Math.abs(val).toFixed(decimals) : fmt(Math.abs(Math.round(val)));
  return (
    <span className={cn("text-xs md:text-sm font-semibold flex items-center gap-0.5 md:gap-1 whitespace-nowrap", up ? "text-red-500" : "text-blue-500")}>
      {up ? <TrendingUp className="w-3 h-3 md:w-4 md:h-4" /> : <TrendingDown className="w-3 h-3 md:w-4 md:h-4" />}
      {up ? "+" : "-"}{displayVal}{unit}
      {percent !== undefined && (
        <span className="font-normal text-xs opacity-80">({percent > 0 ? "+" : ""}{percent.toFixed(2)}%)</span>
      )}
    </span>
  );
}

// ─── 메트릭 카드 ─────────────────────────────────────────────────────────────
function MetricCard({
  title, subtitle, source, live, headerRight, icon: Icon, iconBg, loading, children,
}: {
  title: string; subtitle?: string; source?: string; live?: boolean; headerRight?: React.ReactNode; icon: React.ElementType; iconBg: string; loading?: boolean; children: React.ReactNode;
}) {
  return (
    <Card className="px-3 pt-3 pb-2 md:px-4 md:pt-4 md:pb-3 border border-border bg-card flex flex-col">
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className={cn("w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0", iconBg)}>
            <Icon className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-semibold text-muted-foreground leading-tight truncate">{title}</p>
            {subtitle && <p className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {live && !loading ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5" data-testid="badge-live">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            실시간
          </span>
        ) : headerRight ?? null}
      </div>
      {loading ? (
        <div className="space-y-2 mt-3">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-5 w-28" />
        </div>
      ) : <div className="mt-3 flex-1">{children}</div>}
      {source && <p className="text-[10px] text-muted-foreground/50 mt-2 text-right">출처: {source}</p>}
    </Card>
  );
}

// ─── 커스텀 툴팁 ─────────────────────────────────────────────────────────────
const FUEL_NAME_KO: Record<string, string> = {
  gasoline: "휘발유",
  diesel: "경유",
  kerosene: "등유",
  wti: "WTI",
};

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-sm space-y-1.5">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {FUEL_NAME_KO[p.dataKey] ?? p.name}: {p.dataKey === "wti" ? `$${Number(p.value).toFixed(2)}` : `${fmt(Number(p.value))}원`}
        </p>
      ))}
    </div>
  );
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, isMaster } = useAuth();
  const isMobile = useIsMobile();
  const isGlobal = isMaster || !user?.headquartersId;

  const { data: wtiRes, isLoading: wtiLoading } = useQuery<WtiResponse>({
    queryKey: ["/api/dashboard/wti"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const { data: fx } = useQuery<ExchangeRate>({
    queryKey: ["/api/dashboard/exchange-rate"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const { data: fuelStats, isLoading: fuelLoading } = useQuery<FuelStats>({
    queryKey: ["/api/dashboard/fuel-stats"],
    staleTime: 2 * 60 * 1000,
  });
  const { data: regional = [], isLoading: regionalLoading } = useQuery<RegionalAvg[]>({
    queryKey: ["/api/dashboard/regional-averages"],
    staleTime: 2 * 60 * 1000,
  });
  const { data: domesticHistory = [] } = useQuery<DomesticHistory[]>({
    queryKey: ["/api/dashboard/domestic-history"],
    staleTime: 2 * 60 * 1000,
  });
  const { data: availableDates = [] } = useQuery<string[]>({
    queryKey: ["/api/oil-prices/available-dates"],
    staleTime: 5 * 60 * 1000,
  });
  const latestDate = availableDates[0] ?? "";
  const prevDate = availableDates[1] ?? latestDate;

  const riseQueryKey = latestDate
    ? `/api/oil-prices/top-stations?type=RISE&fuel=gasoline&date=${latestDate}&prevDate=${prevDate}`
    : null;
  const { data: riseStations = [] } = useQuery<TopStation[]>({
    queryKey: [riseQueryKey],
    enabled: !!riseQueryKey,
    staleTime: 2 * 60 * 1000,
  });
  const fallQueryKey = latestDate
    ? `/api/oil-prices/top-stations?type=FALL&fuel=gasoline&date=${latestDate}&prevDate=${prevDate}`
    : null;
  const { data: fallStations = [] } = useQuery<TopStation[]>({
    queryKey: [fallQueryKey],
    enabled: !!fallQueryKey,
    staleTime: 2 * 60 * 1000,
  });
  const riseQueryKeyDiesel = latestDate
    ? `/api/oil-prices/top-stations?type=RISE&fuel=diesel&date=${latestDate}&prevDate=${prevDate}`
    : null;
  const { data: riseStationsDiesel = [] } = useQuery<TopStation[]>({
    queryKey: [riseQueryKeyDiesel],
    enabled: !!riseQueryKeyDiesel,
    staleTime: 2 * 60 * 1000,
  });
  const fallQueryKeyDiesel = latestDate
    ? `/api/oil-prices/top-stations?type=FALL&fuel=diesel&date=${latestDate}&prevDate=${prevDate}`
    : null;
  const { data: fallStationsDiesel = [] } = useQuery<TopStation[]>({
    queryKey: [fallQueryKeyDiesel],
    enabled: !!fallQueryKeyDiesel,
    staleTime: 2 * 60 * 1000,
  });
  const lowQueryKey = latestDate
    ? `/api/oil-prices/top-stations?type=LOW&fuel=gasoline&date=${latestDate}`
    : null;
  const { data: lowStations = [] } = useQuery<TopStation[]>({
    queryKey: [lowQueryKey],
    enabled: !!lowQueryKey,
    staleTime: 2 * 60 * 1000,
  });
  const highQueryKey = latestDate
    ? `/api/oil-prices/top-stations?type=HIGH&fuel=gasoline&date=${latestDate}`
    : null;
  const { data: highStations = [] } = useQuery<TopStation[]>({
    queryKey: [highQueryKey],
    enabled: !!highQueryKey,
    staleTime: 2 * 60 * 1000,
  });
  const lowQueryKeyDiesel = latestDate
    ? `/api/oil-prices/top-stations?type=LOW&fuel=diesel&date=${latestDate}`
    : null;
  const { data: lowStationsDiesel = [] } = useQuery<TopStation[]>({
    queryKey: [lowQueryKeyDiesel],
    enabled: !!lowQueryKeyDiesel,
    staleTime: 2 * 60 * 1000,
  });
  const highQueryKeyDiesel = latestDate
    ? `/api/oil-prices/top-stations?type=HIGH&fuel=diesel&date=${latestDate}`
    : null;
  const { data: highStationsDiesel = [] } = useQuery<TopStation[]>({
    queryKey: [highQueryKeyDiesel],
    enabled: !!highQueryKeyDiesel,
    staleTime: 2 * 60 * 1000,
  });

  const { data: regionalHistory = [] } = useQuery<RegionalHistory[]>({
    queryKey: ["/api/dashboard/regional-price-history"],
    staleTime: 5 * 60 * 1000,
  });

  // 캐러셀 슬라이드 (0=상승, 1=하락, 2=최고가, 3=최저가) — 자동 회전 없음
  const [carouselSlide, setCarouselSlide] = useState(0);
  const [carouselFuel, setCarouselFuel] = useState<'gasoline' | 'diesel'>('gasoline');
  const carouselTouchRef = useRef({ startX: 0, startY: 0 });
  const TOTAL_SLIDES = 4;

  // 유가 분석 카드 탭 (MASTER=국제-국내 연동, HQ_USER=지역별 추이)
  const [oilAnalysisTab, setOilAnalysisTab] = useState<'global' | 'regional'>(isMaster ? 'global' : 'regional');

  // 지역별 순위 탭
  const [regionalTab, setRegionalTab] = useState<'gasoline' | 'diesel'>('gasoline');
  // 편차 카드 탭
  const [spreadTab, setSpreadTab] = useState<'gasoline' | 'diesel'>('gasoline');

  // 석유 최고가격제
  const { toast } = useToast();
  const { data: ceilingData = [], isLoading: ceilingLoading } = useQuery<CeilingPrice[]>({
    queryKey: ["/api/dashboard/ceiling-prices"],
    staleTime: 5 * 60 * 1000,
  });
  const [ceilingOpen, setCeilingOpen] = useState(false);
  const [ceilingForm, setCeilingForm] = useState({ gasoline: "", diesel: "", kerosene: "", effectiveDate: "", note: "" });
  const ceilingMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/admin/ceiling-prices", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/ceiling-prices"] });
      setCeilingOpen(false);
      toast({ title: "저장 완료", description: "석유 최고가격제가 업데이트되었습니다." });
    },
    onError: () => toast({ title: "저장 실패", variant: "destructive" }),
  });

  // PC 여부 감지 (lg = 1024px 이상)
  const [isLg, setIsLg] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  useEffect(() => {
    const check = () => setIsLg(window.innerWidth >= 1024);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 왼쪽 카드 높이 계산 (세 카드 공통 기준)
  const leftCardH = useMemo(() => {
    const sorted = [...regional].sort((a, b) =>
      regionalTab === 'diesel' ? ((b.avgDiesel ?? 0) - (a.avgDiesel ?? 0)) : (b.avgPrice - a.avgPrice)
    );
    const chartH = Math.max(340, sorted.length * 28 + 20);
    return chartH + 100; // 헤더(~80px) + 상하 패딩(~20px)
  }, [regional, regionalTab]);

  // 차트 데이터 병합 (WTI + 국내)
  const chartData = useMemo(() => {
    const domMap = new Map(domesticHistory.map(d => [
      `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`,
      d,
    ]));
    const wtiMap = new Map((wtiRes?.history ?? []).map(h => [h.date, h.value]));
    const allDates = new Set([
      ...domesticHistory.map(d => `${d.date.slice(0, 4)}-${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`),
      ...(wtiRes?.history ?? []).map(h => h.date),
    ]);
    return Array.from(allDates).sort().map(date => ({
      date,
      label: date.slice(5),
      wti: wtiMap.get(date) ?? null,
      gasoline: domMap.get(date)?.gasoline ?? null,
      diesel: domMap.get(date)?.diesel ?? null,
    }));
  }, [wtiRes, domesticHistory]);

  const regionalChartData = useMemo(() => {
    return regionalHistory.map(d => ({
      label: `${d.date.slice(4, 6)}-${d.date.slice(6, 8)}`,
      gasoline: d.gasoline,
      diesel: d.diesel,
      kerosene: d.kerosene,
    }));
  }, [regionalHistory]);

  const displayChartData = useMemo(() =>
    isMobile ? chartData.slice(-7) : chartData,
  [isMobile, chartData]);

  const displayRegionalChartData = useMemo(() =>
    isMobile ? regionalChartData.slice(-7) : regionalChartData,
  [isMobile, regionalChartData]);

  const riseAlerts = [
    ...riseStations.filter(s => (s.changeAmount ?? 0) >= 100).map(s => ({ ...s, fuelType: 'gasoline' as const })),
    ...riseStationsDiesel.filter(s => (s.changeAmount ?? 0) >= 100).map(s => ({ ...s, fuelType: 'diesel' as const })),
  ];
  const fallAlerts = [
    ...fallStations.filter(s => Math.abs(s.changeAmount ?? 0) >= 100).map(s => ({ ...s, fuelType: 'gasoline' as const })),
    ...fallStationsDiesel.filter(s => Math.abs(s.changeAmount ?? 0) >= 100).map(s => ({ ...s, fuelType: 'diesel' as const })),
  ];
  const allAlerts = [
    ...riseAlerts.map(s => ({ ...s, dir: 'rise' as const })),
    ...fallAlerts.map(s => ({ ...s, dir: 'fall' as const })),
  ].sort((a, b) => Math.abs(b.changeAmount ?? 0) - Math.abs(a.changeAmount ?? 0));
  const topRegion = (() => {
    const counts: Record<string, number> = {};
    allAlerts.forEach(s => { const r = regionShort(s.region); counts[r] = (counts[r] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  })();
  const maxMover = allAlerts[0];

  const reportHeadline = (() => {
    const total = allAlerts.length;
    const riseCount = riseAlerts.length;
    const fallCount = fallAlerts.length;
    if (total === 0) return "유가 안정세 — 급변 감지 없음";
    const maxChange = Math.abs(maxMover?.changeAmount ?? 0);
    if (topRegion && topRegion[1] / total > 0.5 && total >= 3) {
      const trend = fallCount >= riseCount ? "급락" : "급등";
      return `${topRegion[0]} 집중 ${trend} 현상`;
    }
    if (maxChange >= 300) return `최대 ${fmt(maxChange)}원 초과 급변 경보`;
    if (fallCount >= 2 * riseCount && fallCount >= 3) return `전국 ${fallCount}곳 대규모 가격 인하`;
    if (riseCount >= 2 * fallCount && riseCount >= 3) return `광역 급등 주의 — ${riseCount}곳 상승`;
    if (riseCount > 0 && fallCount > 0) return `급등 ${riseCount}곳 · 급락 ${fallCount}곳 혼조세`;
    if (riseCount > 0) return `급등 주유소 ${riseCount}곳 감지`;
    if (fallCount > 0) return `급락 주유소 ${fallCount}곳 감지`;
    return "100원 이상 급변 감지 이벤트";
  })();

  const reportReason = (() => {
    const total = allAlerts.length;
    const riseCount = riseAlerts.length;
    const fallCount = fallAlerts.length;
    const riseSub = <><span className="text-red-500">급등 {riseCount}곳</span>, <span className="text-blue-500">급락 {fallCount}곳</span></>;
    if (total === 0) return { main: "전일 대비 100원 이상 변동된 주유소가 감지되지 않았습니다." };
    const maxChange = Math.abs(maxMover?.changeAmount ?? 0);
    if (topRegion && topRegion[1] / total > 0.5 && total >= 3) {
      return { main: `급변 감지된 주유소 ${total}곳 중 ${topRegion[1]}곳(${Math.round(topRegion[1] / total * 100)}%)이 ${topRegion[0]} 지역에 집중되어 있습니다.` };
    }
    if (maxChange >= 300) return {
      main: `오늘 가장 크게 변동한 주유소의 변동폭이 ${fmt(maxChange)}원으로, 300원 기준을 초과했습니다.`,
      sub: riseSub,
    };
    if (fallCount >= 2 * riseCount && fallCount >= 3) return {
      main: `전일 대비 100원 이상 하락한 주유소가 ${fallCount}곳으로,`,
      sub: <><span className="text-red-500">급등 주유소({riseCount}곳)</span>의 2배를 넘었습니다.</>,
    };
    if (riseCount >= 2 * fallCount && riseCount >= 3) return {
      main: `전일 대비 100원 이상 상승한 주유소가 ${riseCount}곳으로,`,
      sub: <><span className="text-blue-500">급락 주유소({fallCount}곳)</span>의 2배를 넘었습니다.</>,
    };
    if (riseCount > 0 && fallCount > 0) return {
      main: `전일 대비 100원 이상 변동 주유소가 동시에 감지되었습니다.`,
      sub: riseSub,
    };
    if (riseCount > 0) return { main: `전일 대비 100원 이상 상승한 주유소가 ${riseCount}곳 감지되었습니다.` };
    if (fallCount > 0) return { main: `전일 대비 100원 이상 하락한 주유소가 ${fallCount}곳 감지되었습니다.` };
    return { main: "전일 대비 100원 이상 변동된 주유소가 감지되었습니다." };
  })();

  const wti = wtiRes?.current;
  const avg = fuelStats?.averages;
  const spread = fuelStats?.spread;
  const latestDateFmt = latestDate
    ? `${latestDate.slice(0, 4)}.${latestDate.slice(4, 6)}.${latestDate.slice(6, 8)} 기준`
    : "";
  const shortDateLabel = latestDate
    ? `(${parseInt(latestDate.slice(4, 6))}.${parseInt(latestDate.slice(6, 8))} 기준)`
    : "";

  return (
    <Layout>
      <PageHeader
        title="대시보드"
        description={`안녕하세요, ${user?.displayName}님! 유가 가격의 현재 현황을 확인하세요.`}
      >
        <DateWeatherWidget isMaster={isMaster} headquartersCode={user?.headquartersCode} />
      </PageHeader>

      <div className="p-3 md:p-5 space-y-4 md:space-y-5">
        {/* ── 상단 4 카드 ── */}
        <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">

          {/* WTI 국제 유가 */}
          <MetricCard title="국제 유가 (WTI)" icon={Globe} iconBg="bg-amber-600" loading={wtiLoading} source="Yahoo Finance" live>
            {wti ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xl md:text-3xl font-bold text-foreground tracking-tight">{fmtUsd(wti.price)}</p>
                  {fx && (
                    <div className="flex flex-col items-end border border-border rounded-md px-2 py-1.5 bg-muted/40">
                      <span className="text-sm md:text-lg font-bold text-foreground whitespace-nowrap leading-tight">{fmt(Math.round(fx.rate))}원/달러</span>
                      <ChangeChip val={fx.change} unit="원" percent={fx.changePercent} />
                    </div>
                  )}
                </div>
                <div className="mt-1.5">
                  <ChangeChip val={wti.change} unit="$" percent={wti.changePercent} decimals={2} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">데이터 없음</p>
            )}
          </MetricCard>

          {/* 석유 최고가격제 */}
          <MetricCard
            title="석유 최고가격제"
            subtitle={ceilingData[0] ? `적용일 ${ceilingData[0].effectiveDate}` : undefined}
            icon={ShieldCheck}
            iconBg="bg-indigo-600"
            loading={ceilingLoading}
            source="산업통상자원부"
            headerRight={
              isMaster ? (
                <button
                  onClick={() => {
                    const cur = ceilingData[0];
                    setCeilingForm({
                      gasoline: cur?.gasoline ?? "",
                      diesel: cur?.diesel ?? "",
                      kerosene: cur?.kerosene ?? "",
                      effectiveDate: cur?.effectiveDate ?? new Date().toISOString().slice(0, 10),
                      note: "",
                    });
                    setCeilingOpen(true);
                  }}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  data-testid="button-ceiling-edit"
                  title="최고가격 수정"
                >
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </button>
              ) : undefined
            }
          >
            {ceilingData.length > 0 ? (() => {
              const cur = ceilingData[0];
              const prev = ceilingData[1];
              const rows = [
                { label: "휘발유", cur: cur.gasoline, prev: prev?.gasoline },
                { label: "경유", cur: cur.diesel, prev: prev?.diesel },
                { label: "등유", cur: cur.kerosene, prev: prev?.kerosene },
              ];
              return (
                <div className="space-y-2">
                  {rows.map(row => {
                    const curVal = row.cur ? Number(row.cur) : null;
                    const prevVal = row.prev ? Number(row.prev) : null;
                    const diff = curVal !== null && prevVal !== null ? curVal - prevVal : null;
                    return (
                      <div key={row.label} className="flex items-center justify-between gap-1">
                        <span className="text-xs md:text-sm text-muted-foreground w-8 md:w-10 flex-shrink-0">{row.label}</span>
                        <span className="text-sm md:text-base font-bold text-foreground whitespace-nowrap flex-shrink-0">
                          {curVal !== null ? fmtPrice(curVal) : "—"}
                        </span>
                        <span className="flex-shrink-0">
                          {diff !== null ? <ChangeChip val={diff} /> : <span className="text-xs text-muted-foreground">—</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })() : (
              <p className="text-sm text-muted-foreground">{isMaster ? "우상단 연필 버튼으로 입력하세요" : "데이터 없음"}</p>
            )}
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
                    <span className="text-xs md:text-sm text-muted-foreground w-8 md:w-10 flex-shrink-0">{row.label}</span>
                    <span className="text-sm md:text-base font-bold text-foreground whitespace-nowrap flex-shrink-0">{fmtPrice(row.val)}</span>
                    <span className="flex-shrink-0"><ChangeChip val={row.change} /></span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">데이터 없음</p>
            )}
          </MetricCard>

          {/* 전국 편차 */}
          <MetricCard
            title={`${isGlobal ? "전국" : "관할 지역"} ${spreadTab === 'diesel' ? '경유' : '휘발유'} 가격 편차`}
            subtitle="최고가 − 최저가 격차"
            icon={BarChart2} iconBg={spreadTab === 'diesel' ? "bg-emerald-500" : "bg-yellow-400"} loading={fuelLoading} source="오피넷"
            headerRight={
              <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                <div className="flex items-center gap-0.5">
                  {(['gasoline', 'diesel'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setSpreadTab(tab)}
                      className={cn(
                        "w-6 h-5 flex items-center justify-center rounded text-[11px] font-semibold transition-colors",
                        spreadTab === tab
                          ? tab === 'gasoline'
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                      data-testid={`tab-spread-${tab}`}
                    >
                      {tab === 'gasoline' ? '휘' : '경'}
                    </button>
                  ))}
                </div>
                {shortDateLabel && (
                  <span className="text-[10px] text-muted-foreground/70 leading-none">{shortDateLabel}</span>
                )}
              </div>
            }
          >
            {(() => {
              const sp = spread?.[spreadTab] ?? null;
              return sp ? (
                <>
                  <p className="text-xl md:text-3xl font-bold text-foreground tracking-tight">{fmt(sp.spread)}원</p>
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
                            <p className="font-semibold text-sm leading-snug">{row.station}</p>
                            <p className="text-sm text-muted-foreground">{row.region}</p>
                            <div className="flex items-center gap-2 pt-0.5">
                              <span className={cn(
                                "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white",
                                spreadTab === "gasoline" ? "bg-yellow-400" : "bg-emerald-500"
                              )}>
                                {spreadTab === "gasoline" ? "휘" : "경"}
                              </span>
                              <p className="font-bold text-base">{fmtPrice(row.price)}</p>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <span className="font-bold text-foreground text-sm flex-shrink-0">{fmtPrice(row.price)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">데이터 없음</p>
              );
            })()}
          </MetricCard>
        </div>

        {/* ── 유가 분석 카드 (탭: 국제-국내 연동 / 지역별 추이) ── */}
        <Card className="border border-border bg-card">
          <div className="px-5 pt-3 pb-0">
            <div className="flex flex-col gap-2 pb-2 border-b border-border">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm md:text-base font-semibold text-foreground leading-snug">
                  {isMobile
                    ? '유가 연동 분석'
                    : oilAnalysisTab === 'global' ? '국제-국내 유가 연동 분석' : `${isGlobal ? "전국" : "관할 지역"} 유가 추이`}
                </h2>
                <div className="flex gap-1 flex-shrink-0">
                  {([['global', isMobile ? '국제' : '국제-국내 유가'], ['regional', '지역별 추이']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setOilAnalysisTab(key)}
                      data-testid={`tab-oil-${key}`}
                      className={cn(
                        "text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap",
                        oilAnalysisTab === key
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >{label}</button>
                  ))}
                </div>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground">
                {oilAnalysisTab === 'global'
                  ? 'WTI 국제 유가 vs 국내 평균 유가'
                  : `${isGlobal ? "전국" : "관할"} 시/도 평균 휘발유·경유 (${isMobile ? '최근 1주일' : '최근 3개월'})`}
              </p>
            </div>
            {oilAnalysisTab === 'global' && (
              <p className="text-xs text-muted-foreground mt-2 mb-1 leading-relaxed">
                ※ 국제 유가(WTI) 변동은 통상 <span className="font-medium text-foreground">2~3주 후</span> 국내 주유소 가격에 반영됩니다.
              </p>
            )}
          </div>
          <div className="px-2 pb-2 pt-1">
            {oilAnalysisTab === 'global' ? (
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={displayChartData} margin={{ top: 10, right: 8, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#111827", fontWeight: 700, textAnchor: "middle" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e5e7eb" }}
                    interval={isMobile ? 1 : Math.max(0, Math.floor(displayChartData.length / 6) - 1)}
                    height={36}
                    padding={{ left: 24, right: 24 }}
                    tickMargin={10}
                  />
                  <YAxis
                    yAxisId="wti"
                    orientation="left"
                    tick={{ fontSize: 12, fill: "#374151", fontWeight: 700 }}
                    tickFormatter={v => `$${v}`}
                    domain={["auto", "auto"]}
                    tickCount={6}
                    width={56}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="domestic"
                    orientation="right"
                    tick={{ fontSize: 12, fill: "#374151", fontWeight: 700 }}
                    tickFormatter={v => `${fmt(v)}원`}
                    domain={["auto", "auto"]}
                    tickCount={6}
                    width={64}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: isMobile ? 11 : 13, paddingTop: 8 }}
                    iconType="circle"
                    iconSize={10}
                    formatter={(val) => {
                      if (val === "wti") return isMobile ? "WTI" : "WTI (국제)";
                      if (val === "gasoline") return "휘발유";
                      if (val === "diesel") return "경유";
                      return val;
                    }}
                  />
                  <Line yAxisId="wti" type="monotone" dataKey="wti" stroke="#64748b" strokeWidth={2.5} dot={false} name="wti" connectNulls />
                  <Line yAxisId="domestic" type="monotone" dataKey="gasoline" stroke="#eab308" strokeWidth={2.5} dot={false} name="gasoline" connectNulls />
                  <Line yAxisId="domestic" type="monotone" dataKey="diesel" stroke="#22c55e" strokeWidth={2.5} dot={false} name="diesel" connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              displayRegionalChartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[340px]">
                  <p className="text-sm text-muted-foreground">데이터 없음</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={displayRegionalChartData} margin={{ top: 10, right: 8, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12, fill: "#111827", fontWeight: 700, textAnchor: "middle" }}
                      tickLine={false}
                      axisLine={{ stroke: "#e5e7eb" }}
                      interval={isMobile ? 1 : Math.max(0, Math.floor(displayRegionalChartData.length / 8) - 1)}
                      height={36}
                      padding={{ left: 24, right: 24 }}
                      tickMargin={10}
                    />
                    <YAxis
                      orientation="left"
                      tick={{ fontSize: 12, fill: "#374151", fontWeight: 700 }}
                      tickFormatter={v => `${fmt(v)}원`}
                      domain={["auto", "auto"]}
                      tickCount={6}
                      width={70}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 13, paddingTop: 8 }}
                      iconType="circle"
                      iconSize={10}
                      formatter={(val) => {
                        if (val === "gasoline") return "휘발유";
                        if (val === "diesel") return "경유";
                        return val;
                      }}
                    />
                    <Line type="monotone" dataKey="gasoline" stroke="#eab308" strokeWidth={2.5} dot={false} name="gasoline" connectNulls />
                    <Line type="monotone" dataKey="diesel" stroke="#22c55e" strokeWidth={2.5} dot={false} name="diesel" connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              )
            )}
          </div>
        </Card>

        {/* ── 하단 3섹션 ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 items-start">

          {/* 지역별 평균 유가 순위 */}
          {(() => {
            const isDiesel = regionalTab === 'diesel';
            const sorted = [...regional].sort((a, b) =>
              isDiesel ? ((b.avgDiesel ?? 0) - (a.avgDiesel ?? 0)) : (b.avgPrice - a.avgPrice)
            );
            const vals = sorted.map(r => isDiesel ? (r.avgDiesel ?? 0) : r.avgPrice).filter(Boolean);
            const domMin = vals.length ? Math.min(...vals) - 15 : 0;
            const domMax = vals.length ? Math.max(...vals) + 8 : 100;
            return (
              <Card className="border border-border bg-card flex flex-col" style={{ height: isLg ? leftCardH : undefined }}>
                <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">지역별 평균 유가 순위</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{isDiesel ? "경유" : "휘발유"} {user?.teamId ? "시/군별" : "시/도별"} 평균 {shortDateLabel}</p>
                  </div>
                  <div className="flex gap-1">
                    {(['gasoline', 'diesel'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setRegionalTab(tab)}
                        className={cn(
                          "text-xs px-2.5 py-1 rounded-md font-medium transition-colors",
                          regionalTab === tab
                            ? tab === 'gasoline' ? "bg-yellow-400 text-white" : "bg-emerald-500 text-white"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        )}
                      >
                        {tab === 'gasoline' ? '휘발유' : '경유'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-3 pt-3 pb-2">
                  {regionalLoading ? (
                    <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                  ) : sorted.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">데이터 없음</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(340, sorted.length * 28 + 20)}>
                      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 50, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                        <XAxis
                          type="number"
                          domain={[domMin, domMax]}
                          tick={{ fontSize: 12, fill: "#374151", fontWeight: 600 }}
                          tickFormatter={v => fmt(v)}
                          tickLine={false}
                          axisLine={false}
                          tickCount={4}
                        />
                        <YAxis
                          type="category"
                          dataKey="sido"
                          tick={{ fontSize: 13, fill: "#374151", fontWeight: 600 }}
                          width={52}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: string) => v.includes(' ') ? v.split(' ').slice(1).join(' ') : v}
                        />
                        <Tooltip
                          formatter={(v: any) => [`${fmt(Number(v))}원`, isDiesel ? "평균 경유" : "평균 휘발유"]}
                          labelFormatter={(label: string) => label.includes(' ') ? label.split(' ').slice(1).join(' ') : label}
                          contentStyle={{ fontSize: 13 }}
                        />
                        <Bar
                          dataKey={isDiesel ? "avgDiesel" : "avgPrice"}
                          fill={isDiesel ? "#22c55e" : "#facc15"}
                          radius={[0, 4, 4, 0]}
                          barSize={20}
                          label={{ position: "right", fontSize: 13, fill: "#0f172a", fontWeight: 800, formatter: (v: number) => `${fmt(v)}` }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            );
          })()}

          {/* 가격 급변 주유소 TOP 10 — 캐러셀 (스와이프 가능) */}
          {(() => {
            const isDieselCarousel = carouselFuel === 'diesel';
            const fuelLabel = isDieselCarousel ? '경유' : '휘발유';
            const slides = [
              { label: "가격 상승 TOP 10", desc: "전일 대비 최대 상승", stations: isDieselCarousel ? riseStationsDiesel : riseStations, arrow: "▲", priceColor: "text-red-500" },
              { label: "가격 하락 TOP 10", desc: "전일 대비 최대 하락", stations: isDieselCarousel ? fallStationsDiesel : fallStations, arrow: "▼", priceColor: "text-blue-500" },
              { label: "최고가 TOP 10", desc: `${isGlobal ? "전국" : "관할 지역"} ${fuelLabel} 최고가`, stations: isDieselCarousel ? highStationsDiesel : highStations, arrow: null, priceColor: "text-orange-500" },
              { label: "최저가 TOP 10", desc: `${isGlobal ? "전국" : "관할 지역"} ${fuelLabel} 최저가`, stations: isDieselCarousel ? lowStationsDiesel : lowStations, arrow: null, priceColor: "text-emerald-600" },
            ];
            const slide = slides[carouselSlide];
            const handleTouchStart = (e: React.TouchEvent) => {
              carouselTouchRef.current.startX = e.touches[0].clientX;
              carouselTouchRef.current.startY = e.touches[0].clientY;
            };
            const handleTouchEnd = (e: React.TouchEvent) => {
              const dx = e.changedTouches[0].clientX - carouselTouchRef.current.startX;
              const dy = e.changedTouches[0].clientY - carouselTouchRef.current.startY;
              if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
                if (dx < 0) setCarouselSlide(s => (s + 1) % TOTAL_SLIDES);
                else setCarouselSlide(s => (s - 1 + TOTAL_SLIDES) % TOTAL_SLIDES);
              }
            };
            return (
              <Card className="border border-border bg-card flex flex-col" style={{ height: isLg ? leftCardH : undefined }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                <div className="px-5 py-4 border-b border-border flex-shrink-0 flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">{slide.label}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{slide.desc} {shortDateLabel}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {/* 휘발유/경유 탭 */}
                    <div className="flex gap-1">
                      {(['gasoline', 'diesel'] as const).map(fuel => (
                        <button
                          key={fuel}
                          onClick={() => setCarouselFuel(fuel)}
                          data-testid={`carousel-fuel-${fuel}`}
                          className={cn(
                            "text-xs px-2.5 py-1 rounded-md font-medium transition-colors",
                            carouselFuel === fuel
                              ? fuel === 'gasoline' ? "bg-yellow-500 text-white" : "bg-green-600 text-white"
                              : "text-muted-foreground hover:bg-muted"
                          )}
                        >{fuel === 'gasoline' ? '휘발유' : '경유'}</button>
                      ))}
                    </div>
                    {/* 슬라이드 닷 */}
                    <div className="flex items-center gap-0.5">
                      {slides.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setCarouselSlide(i)}
                          data-testid={`dot-carousel-${i}`}
                          style={{ minWidth: 20, minHeight: 24 }}
                          className="flex items-center justify-center"
                        >
                          <span className={cn(
                            "block rounded-full transition-all",
                            i === carouselSlide ? "w-2.5 h-2.5 bg-primary" : "w-1.5 h-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                          )} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-border min-h-0">
                  {slide.stations.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">데이터 없음</p>
                  ) : (
                    slide.stations.slice(0, 10).map((s, idx) => (
                      <div key={s.stationId} className="px-5 flex items-center gap-3 py-3" data-testid={`alert-station-${s.stationId}`}>
                        <span className="text-base font-bold text-muted-foreground/50 w-5 flex-shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground truncate">{s.stationName}</span>
                            {s.brand && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">{s.brand}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={cn(
                              "text-[10px] font-semibold px-1.5 py-0 rounded leading-4",
                              isDieselCarousel ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                            )}>{fuelLabel}</span>
                            <span className="text-xs text-muted-foreground">
                              <span className="md:hidden">{regionShort(s.region)}</span>
                              <span className="hidden md:inline">{s.region}</span>
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-foreground">{s.price != null ? fmtPrice(s.price) : "—"}</p>
                          {slide.arrow && s.changeAmount != null && (
                            <p className={cn("text-xs font-semibold", slide.priceColor)}>
                              {slide.arrow} {fmt(Math.abs(s.changeAmount))}원
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            );
          })()}

          {/* 최근 AI 분석 리포트 */}
          <Card className="border border-border bg-card flex flex-col" style={{ height: isLg ? leftCardH : undefined }}>
            <div className="px-5 py-4 border-b border-border flex-shrink-0">
              <h2 className="text-base font-semibold text-foreground">일일 AI 분석 리포트</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-sm text-muted-foreground">{reportHeadline} {shortDateLabel}</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <button data-testid="btn-report-reason" className="text-muted-foreground/50 hover:text-muted-foreground transition-colors flex-shrink-0">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="start" className="w-72 text-sm p-3">
                    <p className="text-foreground leading-relaxed">{reportReason.main}</p>
                    {reportReason.sub && (
                      <p className="text-foreground font-semibold mt-1">{reportReason.sub}</p>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="p-4 space-y-2.5 overflow-y-auto flex-1 min-h-0">
              {allAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <AlertCircle className="w-8 h-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">감지된 이상 징후 없음</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">전일 대비 100원 이상 변동 주유소 없음</p>
                </div>
              ) : (
                <>
                  {/* 요약 박스 */}
                  <div className="rounded-lg bg-muted/60 border border-border p-3 mb-1">
                    <p className="text-sm font-semibold text-foreground">
                      오늘 {isGlobal ? "전국" : "관할 지역"} <span className="text-primary">{allAlerts.length}개</span> 주유소 이상 감지
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      급등 <span className="text-red-500 font-semibold">{riseAlerts.length}곳</span>
                      <span className="mx-1.5 text-border">|</span>
                      급락 <span className="text-blue-500 font-semibold">{fallAlerts.length}곳</span>
                    </p>
                    {topRegion && (
                      <p className="text-xs text-muted-foreground mt-1">
                        집중 지역 <span className="font-medium text-foreground">{topRegion[0]}</span> {topRegion[1]}곳
                        {maxMover && (
                          <> · 최대 변동 <span className="font-medium text-foreground">{maxMover.stationName.replace(/주유소$/, '')} {maxMover.dir === 'rise' ? '+' : '-'}{fmt(Math.abs(maxMover.changeAmount ?? 0))}원</span></>
                        )}
                      </p>
                    )}
                  </div>
                  {/* 개별 목록 */}
                  {allAlerts.map((s) => (
                    <div key={s.stationId + s.dir} className={cn("flex gap-3 p-3 rounded-lg border", s.dir === 'rise' ? "bg-red-50 border-red-100" : "bg-blue-50 border-blue-100")}>
                      <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", s.dir === 'rise' ? "bg-red-500" : "bg-blue-500")} />
                      <div className="min-w-0">
                        <p className="text-sm text-foreground leading-snug">
                          <span className="font-semibold">
                            <span className="md:hidden">{regionShort(s.region)}</span>
                            <span className="hidden md:inline">{s.region}</span>
                          </span>
                          {" · "}
                          <span className="text-primary font-medium">{s.stationName}</span>
                        </p>
                        <p className={cn("text-sm font-bold mt-0.5 flex items-center gap-1.5", s.dir === 'rise' ? "text-red-600" : "text-blue-600")}>
                          <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded", s.fuelType === 'diesel' ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700")}>
                            {s.fuelType === 'diesel' ? '경유' : '휘발유'}
                          </span>
                          {s.dir === 'rise' ? '가격 급등' : '가격 급락'} {s.dir === 'rise' ? '+' : '-'}{fmt(Math.abs(s.changeAmount ?? 0))}원
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
      {/* 석유 최고가격제 편집 Dialog (MASTER 전용) */}
      <Dialog open={ceilingOpen} onOpenChange={setCeilingOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>석유 최고가격제 수정</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ceilingMutation.mutate({
                gasoline: ceilingForm.gasoline ? Number(ceilingForm.gasoline) : null,
                diesel: ceilingForm.diesel ? Number(ceilingForm.diesel) : null,
                kerosene: ceilingForm.kerosene ? Number(ceilingForm.kerosene) : null,
                effectiveDate: ceilingForm.effectiveDate,
                note: ceilingForm.note || null,
              });
            }}
            className="space-y-4 mt-2"
          >
            {[
              { key: "gasoline" as const, label: "휘발유 (원/L)" },
              { key: "diesel" as const, label: "경유 (원/L)" },
              { key: "kerosene" as const, label: "등유 (원/L)" },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`ceiling-${key}`}>{label}</Label>
                <Input
                  id={`ceiling-${key}`}
                  type="number"
                  step="0.01"
                  placeholder="가격 입력"
                  value={ceilingForm[key]}
                  onChange={(e) => setCeilingForm(f => ({ ...f, [key]: e.target.value }))}
                  data-testid={`input-ceiling-${key}`}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="ceiling-date">적용일</Label>
              <Input
                id="ceiling-date"
                type="date"
                required
                value={ceilingForm.effectiveDate}
                onChange={(e) => setCeilingForm(f => ({ ...f, effectiveDate: e.target.value }))}
                data-testid="input-ceiling-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ceiling-note">비고 (선택)</Label>
              <Textarea
                id="ceiling-note"
                placeholder="변경 사유 등"
                value={ceilingForm.note}
                onChange={(e) => setCeilingForm(f => ({ ...f, note: e.target.value }))}
                data-testid="input-ceiling-note"
                rows={2}
              />
            </div>
            <Button type="submit" className="w-full" disabled={ceilingMutation.isPending} data-testid="button-ceiling-save">
              {ceilingMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
