import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComposedChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, Globe, Fuel, BarChart2, ShieldCheck,
  MapPin, Loader2,
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

        {/* ── 중단 2열: 유가 연동분석(2/3) + 지역별 순위(1/3) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">

          {/* 국제-국내 유가 연동분석 (2/3) */}
          <Card className="border border-border bg-card lg:col-span-2">
            <div className="px-5 pt-3 pb-0">
              <div className="flex flex-col gap-1 pb-2 border-b border-border">
                <h2 className="text-sm md:text-base font-semibold text-foreground">국제-국내 유가 연동 분석</h2>
                <p className="text-xs md:text-sm text-muted-foreground">WTI 국제 유가 vs 국내 평균 유가</p>
              </div>
              <p className="text-xs text-muted-foreground mt-2 mb-1 leading-relaxed">
                ※ 국제 유가(WTI) 변동은 통상 <span className="font-medium text-foreground">2~3주 후</span> 국내 주유소 가격에 반영됩니다.
              </p>
            </div>
            <div className="px-2 pb-2 pt-1">
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#111827", fontWeight: 700, textAnchor: "middle" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e5e7eb" }}
                    interval={Math.max(0, Math.floor(chartData.length / 6) - 1)}
                    height={36}
                    padding={{ left: 24, right: 24 }}
                    tickMargin={10}
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
          </Card>

          {/* 지역별 평균 유가 순위 (1/3) */}
          <Card className="border border-border bg-card flex flex-col">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
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
            <div className="px-3 pt-3 pb-2">
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
          </Card>
        </div>

        {/* 푸터 */}
        <div className="text-center text-xs text-muted-foreground py-4 border-t border-border">
          <p>이 페이지의 유가 정보는 오피넷 및 Yahoo Finance 데이터를 기반으로 합니다.</p>
          <p className="mt-1">© 한국석유관리원 유가 이상징후 탐지 시스템</p>
        </div>
      </div>
    </div>
  );
}
