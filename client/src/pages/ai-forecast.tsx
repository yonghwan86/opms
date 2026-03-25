import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { AlertTriangle, TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type FuelType = "gasoline" | "diesel";

interface ForecastPoint {
  date: string;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
  actual?: number | null;
  phase?: number;
}

interface HistoryPoint {
  date: string;
  price: number | null;
}

interface NationalForecastData {
  runDate: string | null;
  fuelType: string;
  mape: number | null;
  history: HistoryPoint[];
  forecast: ForecastPoint[];
  dataAvailable: boolean;
}

interface CorrPoint {
  lag: number;
  r: number;
}

interface LagAnalysisData {
  wti: { optimalLag: number; correlations: CorrPoint[]; dataAvailable: boolean };
  brent: { optimalLag: number; correlations: CorrPoint[]; dataAvailable: boolean };
  dubai: { optimalLag: number; correlations: CorrPoint[]; dataAvailable: boolean };
  dataAvailable: boolean;
  rowCount?: number;
}

interface MarginAnomaly {
  stationId: string;
  stationName: string;
  brand: string | null;
  region: string;
  sido: string;
  salePrice: number;
  supplyPrice: number;
  margin: number;
  forecastDev: number;
}

interface MarginData {
  anomalies: MarginAnomaly[];
  total: number;
  fuelType: string;
  forecastPrice: number | null;
}

function formatDate(dateStr: string): string {
  if (dateStr.length === 8) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  return dateStr;
}

function formatDateShort(dateStr: string): string {
  if (dateStr.length === 8) {
    return `${parseInt(dateStr.slice(4, 6))}/${parseInt(dateStr.slice(6, 8))}`;
  }
  return dateStr;
}

function MapeBadge({ mape }: { mape: number | null }) {
  if (mape === null) return <Badge variant="secondary" data-testid="badge-mape-null">MAPE 미산출</Badge>;
  const isHigh = mape > 5;
  return (
    <Badge
      variant={isHigh ? "destructive" : "default"}
      className={cn(!isHigh && "bg-emerald-500 hover:bg-emerald-600")}
      data-testid="badge-mape"
    >
      {isHigh && <AlertTriangle className="w-3 h-3 mr-1" />}
      MAPE {mape.toFixed(1)}%{isHigh ? " ⚠ 재학습 검토" : " ✓"}
    </Badge>
  );
}

function LagTab() {
  const { data, isLoading } = useQuery<LagAnalysisData>({
    queryKey: ["/api/forecast/lag-analysis"],
  });

  const crudeList = [
    { key: "wti" as const, label: "WTI 원유", color: "#f59e0b" },
    { key: "brent" as const, label: "브렌트 원유", color: "#3b82f6" },
    { key: "dubai" as const, label: "두바이 원유", color: "#8b5cf6" },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data?.dataAvailable) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          시차 분석을 위한 데이터가 부족합니다. 국제 유가와 국내 평균가 데이터가 모두 수집된 후 분석이 가능합니다.
          {data?.rowCount !== undefined && ` (현재 공통 데이터: ${data.rowCount}일)`}
        </AlertDescription>
      </Alert>
    );
  }

  const wtiCorrs = data.wti.correlations ?? [];
  const brentCorrs = data.brent.correlations ?? [];
  const dubaiCorrs = data.dubai.correlations ?? [];
  const maxLen = Math.max(wtiCorrs.length, brentCorrs.length, dubaiCorrs.length);
  const corrChartData = Array.from({ length: maxLen }, (_, i) => ({
    lag: `Lag ${i}`,
    WTI: wtiCorrs[i]?.r ?? null,
    브렌트: brentCorrs[i]?.r ?? null,
    두바이: dubaiCorrs[i]?.r ?? null,
    wtiOptimal: i === data.wti.optimalLag,
  }));

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          교차상관(Cross-Correlation) 분석을 통해 국제 원유가와 국내 판매가 사이의 최적 시차(Lag)를 산출합니다.
          Prophet 모델은 이 시차를 적용한 외부 회귀변수를 사용해 예측합니다.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {crudeList.map(({ key, label, color }) => {
          const info = data?.[key];
          return (
            <Card key={key} data-testid={`card-lag-${key}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold" style={{ color }} data-testid={`text-lag-${key}`}>
                    {info?.optimalLag ?? 7}
                  </span>
                  <span className="text-sm text-muted-foreground mb-1">일</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">→ 국내 판매가 반영 최적 시차</p>
                {info?.correlations?.length > 0 && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                    r = {(info.correlations[info.optimalLag]?.r ?? 0).toFixed(3)}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {corrChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">교차상관 계수 (국제 원유가 → 국내 휘발유)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={corrChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="lag" tick={{ fontSize: 10 }} tickLine={false} />
                <YAxis domain={[-1, 1]} tick={{ fontSize: 10 }} tickLine={false} tickFormatter={(v) => v.toFixed(1)} />
                <Tooltip
                  formatter={(val: number, name: string) => [val?.toFixed ? val.toFixed(3) : val, name]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Line dataKey="WTI" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                <Line dataKey="브렌트" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
                <Line dataKey="두바이" stroke="#8b5cf6" strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ForecastChart({ fuel }: { fuel: FuelType }) {
  const { data, isLoading } = useQuery<NationalForecastData>({
    queryKey: ["/api/forecast/national", fuel],
    queryFn: () => fetch(`/api/forecast/national?fuel=${fuel}&days=14`).then(r => r.json()),
  });

  if (isLoading) return <Skeleton className="h-80 w-full" />;

  if (!data?.dataAvailable) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          아직 예측 데이터가 없습니다. 데이터 수집이 완료된 후 자동으로 예측이 실행됩니다.
          (매일 유가 수집 성공 후 자동 실행)
        </AlertDescription>
      </Alert>
    );
  }

  const historyData = (data.history ?? []).map(h => ({
    date: formatDateShort(h.date),
    rawDate: h.date,
    actual: h.price,
    forecastP1: null as number | null,
    forecastP2: null as number | null,
    lowerP1: null as number | null,
    upperP1: null as number | null,
    lowerP2: null as number | null,
    upperP2: null as number | null,
  }));

  const lastHistoryActual = historyData.length > 0 ? historyData[historyData.length - 1].actual : null;

  const forecastData = (data.forecast ?? []).map((f, i) => ({
    date: formatDateShort(f.date),
    rawDate: f.date,
    actual: f.actual ?? null,
    forecastP1: f.phase === 1 ? f.forecast : null,
    forecastP2: f.phase === 2 ? f.forecast : null,
    lowerP1: f.phase === 1 ? f.lower : null,
    upperP1: f.phase === 1 ? f.upper : null,
    lowerP2: f.phase === 2 ? f.lower : null,
    upperP2: f.phase === 2 ? f.upper : null,
  }));

  // Bridge point connecting history to forecast
  const bridgePoint = lastHistoryActual !== null && data.forecast?.[0] ? [{
    date: historyData[historyData.length - 1]?.date ?? "",
    rawDate: historyData[historyData.length - 1]?.rawDate ?? "",
    actual: null as number | null,
    forecastP1: lastHistoryActual,
    forecastP2: null as number | null,
    lowerP1: lastHistoryActual,
    upperP1: lastHistoryActual,
    lowerP2: null as number | null,
    upperP2: null as number | null,
  }] : [];

  // Connect P1 last point to P2 first point
  const p1Data = forecastData.filter(f => f.forecastP1 !== null);
  const lastP1Item = p1Data[p1Data.length - 1];
  const firstP2Item = forecastData.find(f => f.forecastP2 !== null);
  const p1ToP2Bridge = lastP1Item && firstP2Item ? [{
    date: lastP1Item.date,
    rawDate: lastP1Item.rawDate,
    actual: null as number | null,
    forecastP1: null as number | null,
    forecastP2: lastP1Item.forecastP1,
    lowerP1: null as number | null,
    upperP1: null as number | null,
    lowerP2: lastP1Item.lowerP1,
    upperP2: lastP1Item.upperP1,
  }] : [];

  const chartData = [...historyData, ...bridgePoint, ...forecastData.slice(0, p1Data.length), ...p1ToP2Bridge, ...forecastData.slice(p1Data.length)];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-background border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
        <p className="font-semibold">{label}</p>
        {payload.map((p: any) => p.value !== null && p.value !== undefined && (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: {p.value?.toFixed ? p.value.toFixed(0) : p.value}원
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <MapeBadge mape={data.mape} />
        {data.runDate && (
          <span className="text-xs text-muted-foreground" data-testid="text-run-date">
            예측 기준일: {formatDate(data.runDate)}
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} interval="preserveStartEnd" />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fontSize: 10 }}
            tickLine={false}
            tickFormatter={(v) => v.toLocaleString()}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: "12px" }} />

          {/* D+1~7 신뢰구간 (진하게) */}
          <Area dataKey="upperP1" fill="#3b82f640" stroke="transparent" legendType="none" name="신뢰구간 상한(D+1~7)" />
          <Area dataKey="lowerP1" fill="white" stroke="transparent" legendType="none" name="신뢰구간 하한(D+1~7)" />

          {/* D+8~14 신뢰구간 (흐리게) */}
          <Area dataKey="upperP2" fill="#3b82f618" stroke="transparent" legendType="none" name="신뢰구간 상한(D+8~14)" />
          <Area dataKey="lowerP2" fill="white" stroke="transparent" legendType="none" name="신뢰구간 하한(D+8~14)" />

          {/* 실제값 */}
          <Line dataKey="actual" stroke="#10b981" strokeWidth={2} dot={false} name="실제값" connectNulls />

          {/* D+1~7 예측 (진한 파란색 실선) */}
          <Line
            dataKey="forecastP1"
            stroke="#3b82f6"
            strokeWidth={2.5}
            strokeDasharray="5 3"
            dot={false}
            name="예측 D+1~7"
            connectNulls
          />

          {/* D+8~14 예측 (흐린 파란색 점선) */}
          <Line
            dataKey="forecastP2"
            stroke="#93c5fd"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            name="예측 D+8~14"
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-emerald-500" />
          <span>실제값 (과거 30일)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-0.5 bg-blue-500" style={{ borderTop: "2px dashed #3b82f6", background: "transparent" }} />
          <span>예측 D+1~7 (진하게)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-0.5" style={{ borderTop: "2px dashed #93c5fd", background: "transparent" }} />
          <span>예측 D+8~14 (흐리게)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-blue-500/15 border border-blue-500/30 rounded-sm" />
          <span>신뢰구간 95%</span>
        </div>
      </div>
    </div>
  );
}

function ForecastTab() {
  const [fuel, setFuel] = useState<FuelType>("gasoline");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={fuel === "gasoline" ? "default" : "outline"}
          size="sm"
          onClick={() => setFuel("gasoline")}
          data-testid="button-fuel-gasoline"
        >
          휘발유
        </Button>
        <Button
          variant={fuel === "diesel" ? "default" : "outline"}
          size="sm"
          onClick={() => setFuel("diesel")}
          data-testid="button-fuel-diesel"
        >
          경유
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {fuel === "gasoline" ? "휘발유" : "경유"} 가격 예측 (향후 14일)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ForecastChart fuel={fuel} />
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Prophet 모델 기반. 외부 회귀변수: 최적 시차 적용 국제 제품가 (USD/배럴 → KRW/리터) + 환율.
          D+1~7은 진하게, D+8~14는 흐리게 표시됩니다. 신뢰구간은 95% 수준입니다.
          "추정 마진(브랜드별 공급가 기준)" 계산은 마진 이상 탐지 탭에서 확인 가능합니다.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function MarginTab() {
  const [fuel, setFuel] = useState<FuelType>("gasoline");

  const { data, isLoading } = useQuery<MarginData>({
    queryKey: ["/api/forecast/high-margin", fuel],
    queryFn: () => fetch(`/api/forecast/high-margin?fuel=${fuel}`).then(r => r.json()),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={fuel === "gasoline" ? "default" : "outline"}
          size="sm"
          onClick={() => setFuel("gasoline")}
          data-testid="button-margin-fuel-gasoline"
        >
          휘발유
        </Button>
        <Button
          variant={fuel === "diesel" ? "default" : "outline"}
          size="sm"
          onClick={() => setFuel("diesel")}
          data-testid="button-margin-fuel-diesel"
        >
          경유
        </Button>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>추정 마진 (브랜드별 공급가 기준)</strong>: 판매가 - 정유사 공급가.
          공급가는 오피넷 주간공급가격 기준 (세금 포함).
          이중 필터: 지역평균 +1.5σ 초과 AND 예측 편차 +1.5σ 초과 동시 충족 업소만 표시합니다.
          권한 기반 지역 자동 필터가 적용됩니다.
        </AlertDescription>
      </Alert>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : !data || data.anomalies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <TrendingUp className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">이상 업소 없음</p>
            <p className="text-sm mt-1">
              {data?.total === 0
                ? "현재 이중 필터 조건(지역평균+1.5σ 초과 AND 예측 편차+1.5σ 초과)에 해당하는 업소가 없습니다."
                : "예측 데이터가 없거나 공급가 데이터가 수집되지 않았습니다."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              이상 업소 {data.total}건
              {data.forecastPrice && (
                <span className="font-normal text-muted-foreground ml-2">
                  (예측가: {data.forecastPrice.toLocaleString()}원/리터)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">주유소명</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">브랜드</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">지역</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">판매가</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">공급가</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">추정 마진</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">예측 편차</th>
                  </tr>
                </thead>
                <tbody>
                  {data.anomalies.map((a, idx) => (
                    <tr
                      key={a.stationId}
                      className="border-b hover:bg-muted/30 transition-colors"
                      data-testid={`row-anomaly-${a.stationId}`}
                    >
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{a.stationName}</span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{a.brand ?? "-"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{a.region}</td>
                      <td className="px-4 py-2.5 text-right">{a.salePrice.toLocaleString()}원</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{a.supplyPrice.toLocaleString()}원</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-red-500 font-semibold">+{a.margin.toLocaleString()}원</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-amber-500">{a.forecastDev.toLocaleString()}원</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AiForecastPage() {
  return (
    <Layout>
      <PageHeader
        title="AI 유가 예측"
        description="Prophet 모델 기반 향후 14일 국내 유가 예측 · 시차 분석 · 마진 이상 탐지"
      />
      <div className="p-4 md:p-6 space-y-4">
        <Tabs defaultValue="forecast">
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="lag" data-testid="tab-lag">시차 분석</TabsTrigger>
            <TabsTrigger value="forecast" data-testid="tab-forecast">가격 예측</TabsTrigger>
            <TabsTrigger value="margin" data-testid="tab-margin">마진 이상 탐지</TabsTrigger>
          </TabsList>

          <TabsContent value="lag" className="mt-4">
            <LagTab />
          </TabsContent>

          <TabsContent value="forecast" className="mt-4">
            <ForecastTab />
          </TabsContent>

          <TabsContent value="margin" className="mt-4">
            <MarginTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
