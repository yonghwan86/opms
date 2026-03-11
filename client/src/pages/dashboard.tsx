import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ComposedChart, Line, Bar, BarChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, AlertCircle, Fuel, DollarSign, Globe, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── 타입 ────────────────────────────────────────────────────────────────────
interface WtiResponse {
  current: { price: number; change: number; changePercent: number } | null;
  history: { date: string; value: number }[];
}
interface ExchangeRate {
  rate: number; change: number; changePercent: number;
}
interface FuelStats {
  date: string;
  averages: { gasoline: number; diesel: number; kerosene: number; gasolineChange: number; dieselChange: number; keroseneChange: number } | null;
  spread: { spread: number; maxPrice: number; maxStation: string; maxRegion: string; minPrice: number; minStation: string; minRegion: string } | null;
}
interface RegionalAvg { sido: string; avgPrice: number; }
interface DomesticHistory { date: string; gasoline: number; diesel: number; }
interface TopStation {
  rank: number; stationId: string; stationName: string; region: string;
  brand: string | null; isSelf: boolean; price?: number; prevPrice?: number; changeAmount?: number;
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
    <span className={cn("text-sm font-semibold flex items-center gap-1", up ? "text-red-500" : "text-blue-500")}>
      {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
      {up ? "+" : "-"}{displayVal}{unit}
      {percent !== undefined && (
        <span className="font-normal text-xs opacity-80">({percent > 0 ? "+" : ""}{percent.toFixed(2)}%)</span>
      )}
    </span>
  );
}

// ─── 메트릭 카드 ─────────────────────────────────────────────────────────────
function MetricCard({
  title, subtitle, icon: Icon, iconBg, loading, children,
}: {
  title: string; subtitle?: string; icon: React.ElementType; iconBg: string; loading?: boolean; children: React.ReactNode;
}) {
  return (
    <Card className="px-4 pt-4 pb-3 border border-border bg-card">
      <div className="flex items-center gap-3 mb-1">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", iconBg)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-muted-foreground leading-tight">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {loading ? (
        <div className="space-y-2 mt-3">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-5 w-28" />
        </div>
      ) : <div className="mt-3">{children}</div>}
    </Card>
  );
}

// ─── 커스텀 툴팁 ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-sm space-y-1.5">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.dataKey === "wti" ? `$${Number(p.value).toFixed(2)}` : `${fmt(Number(p.value))}원`}
        </p>
      ))}
    </div>
  );
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();

  const { data: wtiRes, isLoading: wtiLoading } = useQuery<WtiResponse>({
    queryKey: ["/api/dashboard/wti"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const { data: fx, isLoading: fxLoading } = useQuery<ExchangeRate>({
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

  const reportItems = riseStations.filter(s => (s.changeAmount ?? 0) >= 100);
  const wti = wtiRes?.current;
  const avg = fuelStats?.averages;
  const spread = fuelStats?.spread;
  const latestDateFmt = latestDate
    ? `${latestDate.slice(0, 4)}.${latestDate.slice(4, 6)}.${latestDate.slice(6, 8)} 기준`
    : "";

  return (
    <Layout>
      <PageHeader
        title="대시보드"
        description={`안녕하세요, ${user?.displayName}님! 유가 가격의 현재 현황을 확인하세요.`}
      />

      <div className="p-5 space-y-5">
        {/* ── 상단 4 카드 ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

          {/* WTI 국제 유가 */}
          <MetricCard title="국제 유가 (WTI)" icon={Globe} iconBg="bg-blue-500" loading={wtiLoading}>
            {wti ? (
              <>
                <p className="text-3xl font-bold text-foreground tracking-tight">{fmtUsd(wti.price)}</p>
                <div className="mt-1.5">
                  <ChangeChip val={wti.change} unit="$" percent={wti.changePercent} decimals={2} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">데이터 없음</p>
            )}
          </MetricCard>

          {/* 국내 유류 평균 */}
          <MetricCard title="국내 유류 평균" icon={Fuel} iconBg="bg-orange-500" loading={fuelLoading}>
            {avg ? (
              <div className="space-y-2">
                {[
                  { label: "휘발유", val: avg.gasoline, change: avg.gasolineChange },
                  { label: "경유", val: avg.diesel, change: avg.dieselChange },
                  { label: "등유", val: avg.kerosene, change: avg.keroseneChange },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground w-10 flex-shrink-0">{row.label}</span>
                    <span className="text-base font-bold text-foreground">{fmtPrice(row.val)}</span>
                    <ChangeChip val={row.change} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">데이터 없음</p>
            )}
          </MetricCard>

          {/* KRW-USD 환율 */}
          <MetricCard title="KRW-USD 환율" icon={DollarSign} iconBg="bg-emerald-500" loading={fxLoading}>
            {fx ? (
              <>
                <p className="text-3xl font-bold text-foreground tracking-tight">{fmt(Math.round(fx.rate))}원</p>
                <div className="mt-1.5">
                  <ChangeChip val={fx.change} percent={fx.changePercent} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">데이터 없음</p>
            )}
          </MetricCard>

          {/* 전국 편차 */}
          <MetricCard title="전국 휘발유 가격 편차" subtitle="최고가 − 최저가 격차" icon={BarChart2} iconBg="bg-purple-500" loading={fuelLoading}>
            {spread ? (
              <>
                <p className="text-3xl font-bold text-foreground tracking-tight">{fmt(spread.spread)}원</p>
                <div className="space-y-1 mt-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-red-500 font-semibold text-xs flex-shrink-0">최고</span>
                    <span className="text-foreground truncate flex-1 mx-1 text-xs">
                      {spread.maxStation.length > 9 ? spread.maxStation.slice(0, 9) + "…" : spread.maxStation}
                    </span>
                    <span className="font-bold text-foreground text-sm flex-shrink-0">{fmtPrice(spread.maxPrice)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-blue-500 font-semibold text-xs flex-shrink-0">최저</span>
                    <span className="text-foreground truncate flex-1 mx-1 text-xs">
                      {spread.minStation.length > 9 ? spread.minStation.slice(0, 9) + "…" : spread.minStation}
                    </span>
                    <span className="font-bold text-foreground text-sm flex-shrink-0">{fmtPrice(spread.minPrice)}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">데이터 없음</p>
            )}
          </MetricCard>
        </div>

        {/* ── 국제-국내 유가 연동 분석 차트 ── */}
        <Card className="border border-border bg-card">
          <div className="px-5 pt-4 pb-2 flex items-start justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">국제-국내 유가 연동 분석</h2>
              <p className="text-sm text-muted-foreground mt-0.5">WTI 국제 유가 vs 국내 평균 유가</p>
            </div>
            <div className="flex flex-col items-start gap-1.5">
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">최근 3개월</span>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="inline-block w-3 h-px border-t-2 border-dashed border-muted-foreground/50 align-middle" />
                국제 유가(WTI) 변동은 통상 <span className="font-medium text-foreground">2~3주 후</span> 국내 주유소 가격에 반영됩니다.
              </p>
            </div>
          </div>
          <div className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={chartData} margin={{ top: 14, right: 8, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e5e7eb" }}
                  interval={Math.max(1, Math.floor(chartData.length / 8))}
                />
                <YAxis
                  yAxisId="wti"
                  orientation="left"
                  tick={{ fontSize: 12, fill: "#3b82f6" }}
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
                  tick={{ fontSize: 12, fill: "#6b7280" }}
                  tickFormatter={v => `${fmt(v)}원`}
                  domain={["auto", "auto"]}
                  tickCount={6}
                  width={64}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 13, paddingTop: 14 }}
                  iconType="circle"
                  iconSize={10}
                  formatter={(val) => {
                    if (val === "wti") return "WTI (국제)";
                    if (val === "gasoline") return "휘발유 주유평균";
                    if (val === "diesel") return "경유 주유평균";
                    return val;
                  }}
                />
                <Line yAxisId="wti" type="monotone" dataKey="wti" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="wti" connectNulls />
                <Line yAxisId="domestic" type="monotone" dataKey="gasoline" stroke="#f97316" strokeWidth={2.5} dot={false} name="gasoline" connectNulls />
                <Line yAxisId="domestic" type="monotone" dataKey="diesel" stroke="#22c55e" strokeWidth={2.5} dot={false} name="diesel" connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ── 하단 3섹션 ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* 지역별 평균 유가 순위 */}
          <Card className="border border-border bg-card">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">지역별 평균 유가 순위</h2>
              <p className="text-sm text-muted-foreground mt-0.5">휘발유 기준 시/도별 평균</p>
            </div>
            <div className="px-3 pt-3 pb-2">
              {regionalLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : regional.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">데이터 없음</p>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={regional} layout="vertical" margin={{ top: 4, right: 50, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[
                        Math.min(...regional.map(r => r.avgPrice)) - 15,
                        Math.max(...regional.map(r => r.avgPrice)) + 8,
                      ]}
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
                      width={42}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(v: any) => [`${fmt(Number(v))}원`, "평균 휘발유"]}
                      contentStyle={{ fontSize: 13 }}
                    />
                    <Bar
                      dataKey="avgPrice"
                      fill="#3b82f6"
                      radius={[0, 4, 4, 0]}
                      barSize={20}
                      label={{ position: "right", fontSize: 13, fill: "#0f172a", fontWeight: 800, formatter: (v: number) => `${fmt(v)}` }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* 가격 급변 주유소 TOP 5 */}
          <Card className="border border-border bg-card flex flex-col">
            <div className="px-5 py-4 border-b border-border flex-shrink-0">
              <h2 className="text-base font-semibold text-foreground">가격 급변 주유소 TOP 5</h2>
              <p className="text-sm text-muted-foreground mt-0.5">전일 대비 휘발유 가격 상승</p>
            </div>
            <div className="flex-1 flex flex-col divide-y divide-border">
              {riseStations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">데이터 없음</p>
              ) : (
                riseStations.slice(0, 5).map((s, idx) => (
                  <div key={s.stationId} className="px-5 flex items-center gap-3 flex-1" data-testid={`alert-station-${s.stationId}`}>
                    <span className="text-base font-bold text-muted-foreground/50 w-5 flex-shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">{s.stationName}</span>
                        {s.brand && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">{s.brand}</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{s.region}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-foreground">{s.price != null ? fmtPrice(s.price) : "—"}</p>
                      {s.changeAmount != null && (
                        <p className="text-xs text-red-500 font-semibold">▲ {fmt(s.changeAmount)}원</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* 최근 AI 분석 리포트 */}
          <Card className="border border-border bg-card flex flex-col max-h-[430px]">
            <div className="px-5 py-4 border-b border-border flex-shrink-0">
              <h2 className="text-base font-semibold text-foreground">최근 AI 분석 리포트</h2>
              <p className="text-sm text-muted-foreground mt-0.5">100원 이상 급변 감지 이벤트</p>
            </div>
            <div className="p-4 space-y-2.5 overflow-y-auto flex-1 min-h-0">
              {reportItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <AlertCircle className="w-8 h-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">감지된 이상 징후 없음</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">전일 대비 100원 이상 변동 주유소 없음</p>
                </div>
              ) : (
                reportItems.slice(0, 10).map((s) => (
                  <div key={s.stationId} className="flex gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                    <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground leading-snug">
                        <span className="font-semibold">{s.region}</span>{" "}
                        <span className="text-primary font-medium">{s.stationName}</span>
                      </p>
                      <p className="text-sm text-red-600 font-bold mt-0.5">
                        비정상 가격 폭등 +{fmt(s.changeAmount ?? 0)}원
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{latestDateFmt}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
