import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, ChevronLeft, ChevronRight, LineChart as LineChartIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

interface StationSearchRow {
  date: string;
  stationId: string;
  stationName: string;
  brand: string | null;
  isSelf: boolean;
  address: string | null;
  region: string;
  sido: string;
  gasoline: number | null;
  diesel: number | null;
  kerosene: number | null;
  supplyGasoline: number | null;
  supplyDiesel: number | null;
  supplyKerosene: number | null;
}

const SIDO_LIST = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종시",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

type FuelType = "gasoline" | "diesel" | "kerosene";
const FUELS: { type: FuelType; label: string }[] = [
  { type: "gasoline", label: "휘발유" },
  { type: "diesel",   label: "경유" },
  { type: "kerosene", label: "등유" },
];

const BRAND_LOGO: Record<string, string> = {
  'SK에너지':       '/brand-logos/ico_logo_sk.gif',
  'GS칼텍스':       '/brand-logos/ico_logo_gs.gif',
  'HD현대오일뱅크': '/brand-logos/ico_logo_hy.gif',
  'S-OIL':          '/brand-logos/ico_logo_soil.gif',
  'NH-OIL':         '/brand-logos/ico_nho_new.gif',
  '알뜰(ex)':       '/brand-logos/icon_rtx_new2.gif',
  '알뜰주유소':     '/brand-logos/icon_rto_new2.gif',
  '자가상표':       '/brand-logos/icon_pb2.gif',
};

function BrandIcon({ brand }: { brand: string | null }) {
  if (!brand) return <span className="text-muted-foreground text-xs">—</span>;
  const src = BRAND_LOGO[brand];
  if (!src) return <span className="text-muted-foreground text-xs">{brand.slice(0, 2)}</span>;
  return <img src={src} alt={brand} title={brand} className="h-6 w-auto mx-auto" />;
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  const day = new Date(Number(y), Number(m) - 1, Number(d)).getDay();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${y}.${m}.${d}(${days[day]})`;
}

function formatPrice(p: number | null): string {
  if (p == null) return "—";
  return p.toLocaleString("ko-KR") + "원";
}

function shortRegion(region: string, sido: string): string {
  return region.startsWith(sido + " ") ? region.slice(sido.length + 1) : region;
}

export default function StationSearchPage() {
  const [inputValue, setInputValue] = useState("");
  const [searchName, setSearchName] = useState("");
  const [sido, setSido]             = useState("all");
  const [subRegion, setSubRegion]   = useState("all");
  const [fuel, setFuel]             = useState<FuelType>("gasoline");
  const [graphOpen, setGraphOpen]   = useState(false);
  const [graphFuels, setGraphFuels] = useState<Set<FuelType>>(new Set<FuelType>(["gasoline", "diesel"]));

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  function toggleGraphFuel(f: FuelType) {
    setGraphFuels(prev => {
      const next = new Set(prev);
      if (next.has(f)) {
        if (next.size > 1) next.delete(f);
      } else {
        next.add(f);
      }
      return next;
    });
  }

  // 자동완성 상태
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeSuggest, setActiveSuggest] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSuggestRef = useRef(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [tableScroll, setTableScroll] = useState({ canLeft: false, canRight: true });

  const handleTableScroll = useCallback(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    setTableScroll({
      canLeft: el.scrollLeft > 0,
      canRight: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  const enabled = searchName.trim().length > 0;

  // ── 자동완성 fetch (디바운스 300ms) ──────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (skipSuggestRef.current) {
      skipSuggestRef.current = false;
      return;
    }
    if (inputValue.trim().length < 2) {
      setSuggestions([]);
      setShowSuggest(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: inputValue.trim() });
        if (sido !== "all") params.set("sido", sido);
        if (subRegion !== "all") params.set("region", subRegion);
        const res = await fetch(`/api/station-search/suggest?${params}`);
        if (!res.ok) return;
        const data: string[] = await res.json();
        setSuggestions(data);
        setShowSuggest(data.length > 0);
        setActiveSuggest(-1);
      } catch { /* ignore */ }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [inputValue, sido, subRegion]);

  // ── 외부 클릭 시 드롭다운 닫기 ──────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggest(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── 검색 결과 변경 시 스크롤 상태 초기화 ─────────────────────────────
  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    handleTableScroll();
  }, [searchName, handleTableScroll]);

  // ── 자동완성 선택 ────────────────────────────────────────────────────────
  const selectSuggestion = useCallback((name: string) => {
    skipSuggestRef.current = true;
    setInputValue(name);
    setSearchName(name);
    setShowSuggest(false);
    setSuggestions([]);
  }, []);

  // ── 세부지역 목록 ─────────────────────────────────────────────────────────
  const { data: subRegions = [] } = useQuery<string[]>({
    queryKey: ["/api/station-search/subregions", sido],
    queryFn: async () => {
      const res = await fetch(`/api/station-search/subregions?sido=${encodeURIComponent(sido)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: sido !== "all",
    staleTime: 5 * 60_000,
  });

  // ── 검색 결과 ─────────────────────────────────────────────────────────────
  const { data: rows = [], isLoading, isFetching } = useQuery<StationSearchRow[]>({
    queryKey: ["/api/station-search", searchName, sido, subRegion],
    queryFn: async () => {
      const params = new URLSearchParams({ name: searchName });
      if (sido !== "all") params.set("sido", sido);
      if (subRegion !== "all") params.set("region", subRegion);
      const res = await fetch(`/api/station-search?${params}`);
      if (!res.ok) throw new Error("검색 실패");
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });

  function handleSearch() {
    const v = inputValue.trim();
    if (v.length < 1) return;
    setSearchName(v);
    setShowSuggest(false);
  }

  function handleSidoChange(val: string) {
    setSido(val);
    setSubRegion("all");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showSuggest && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggest(i => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggest(i => Math.max(i - 1, -1));
        return;
      }
      if (e.key === "Enter" && activeSuggest >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeSuggest]);
        return;
      }
      if (e.key === "Escape") {
        setShowSuggest(false);
        return;
      }
    }
    if (e.key === "Enter") handleSearch();
  }

  const loading = enabled && (isLoading || isFetching);

  function getPrice(row: StationSearchRow): number | null { return row[fuel]; }
  function getSupply(row: StationSearchRow): number | null {
    if (fuel === "gasoline") return row.supplyGasoline;
    if (fuel === "diesel")   return row.supplyDiesel;
    return row.supplyKerosene;
  }
  function getExcess(row: StationSearchRow): number | null {
    const p = getPrice(row);
    const s = getSupply(row);
    if (p == null || s == null) return null;
    return p - s;
  }

  const fuelLabel = FUELS.find(f => f.type === fuel)?.label ?? "";

  const stationGroups = useMemo(() => {
    const map = new Map<string, StationSearchRow[]>();
    for (const row of rows) {
      if (!map.has(row.stationId)) map.set(row.stationId, []);
      map.get(row.stationId)!.push(row);
    }
    return Array.from(map.entries()).map(([stationId, groupRows]) => ({
      stationId,
      rows: [...groupRows].sort((a, b) => b.date.localeCompare(a.date)),
    }));
  }, [rows]);

  const uniqueStationCount = stationGroups.length;
  const hasResults = rows.length > 0;

  const chartData = useMemo(() => {
    if (uniqueStationCount !== 1) return [];
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map(r => ({
      date: r.date.slice(4, 6) + "/" + r.date.slice(6, 8),
      fullDate: r.date,
      gasoline: r.gasoline,
      diesel: r.diesel,
      kerosene: r.kerosene,
    }));
  }, [rows, uniqueStationCount]);

  const mobileTicks = useMemo(() => {
    if (chartData.length <= 4) return chartData.map(d => d.date);
    const len = chartData.length;
    const idxs = [0, Math.floor((len - 1) / 3), Math.floor((len - 1) * 2 / 3), len - 1];
    return idxs.map(i => chartData[i].date);
  }, [chartData]);

  const FUEL_COLORS: Record<FuelType, string> = {
    gasoline: "#eab308",
    diesel:   "#22c55e",
    kerosene: "#38bdf8",
  };

  return (
    <Layout>
      <PageHeader
        title="주유소 가격 검색"
        subtitle="주유소 상호명으로 최근 20일 유가 이력을 조회합니다"
      />

      <div className="px-4 md:px-6 pt-2 pb-4 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">

          {/* 자동완성 검색창 */}
          <div ref={wrapperRef} className="relative flex gap-2">
            <div className="relative">
              <Input
                data-testid="input-station-name"
                placeholder="주유소 상호 검색"
                value={inputValue}
                onChange={e => { setInputValue(e.target.value); }}
                onKeyDown={handleKeyDown}
                onFocus={() => { if (suggestions.length > 0) setShowSuggest(true); }}
                className="w-[268px] sm:w-96"
                autoComplete="off"
              />
              {/* 자동완성 드롭다운 */}
              {showSuggest && suggestions.length > 0 && (
                <ul className="absolute left-0 top-full mt-1 z-50 w-full bg-popover border rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                  {suggestions.map((name, i) => (
                    <li
                      key={name}
                      data-testid={`suggest-item-${i}`}
                      onMouseDown={e => { e.preventDefault(); selectSuggestion(name); }}
                      className={cn(
                        "px-3 py-2 text-sm cursor-pointer transition-colors",
                        i === activeSuggest
                          ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                          : "hover:bg-muted",
                      )}
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              data-testid="button-search"
              onClick={handleSearch}
              className="bg-green-600 hover:bg-green-700 text-white shrink-0"
            >
              <Search className="w-4 h-4 mr-1" />
              검색
            </Button>
          </div>

          {/* 시도 드롭다운 */}
          <Select value={sido} onValueChange={handleSidoChange}>
            <SelectTrigger data-testid="select-sido" className="w-32">
              <SelectValue placeholder="시도 전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">시도 전체</SelectItem>
              {SIDO_LIST.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 세부지역 드롭다운 — 항상 표시 */}
          <Select value={subRegion} onValueChange={setSubRegion} disabled={sido === "all"}>
            <SelectTrigger data-testid="select-subregion" className="w-36 disabled:opacity-50">
              <SelectValue placeholder={sido === "all" ? "세부지역" : "전체"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {subRegions.map(r => (
                <SelectItem key={r} value={r}>{shortRegion(r, sido)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 유종 탭 + 그래프 버튼 */}
        <div className="flex items-center gap-2 flex-nowrap">
          {FUELS.map(f => (
            <button
              key={f.type}
              data-testid={`tab-fuel-${f.type}`}
              onClick={() => setFuel(f.type)}
              style={fuel === f.type ? { backgroundColor: FUEL_COLORS[f.type] } : undefined}
            className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap shrink-0",
                fuel === f.type
                  ? "text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {f.label}
            </button>
          ))}
          <div className="w-px h-5 bg-border shrink-0" />
          <button
            data-testid="button-graph"
            disabled={!hasResults}
            onClick={() => setGraphOpen(true)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0",
              hasResults
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                : "bg-muted text-muted-foreground opacity-40 cursor-not-allowed",
            )}
            title="가격 추이 그래프"
          >
            <LineChartIcon className="w-4 h-4" />
            그래프
          </button>
        </div>
      </div>

      {/* 가격 추이 그래프 팝업 */}
      <Dialog open={graphOpen} onOpenChange={setGraphOpen}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content
            className={cn(
              "fixed left-[50%] top-[50%] z-50 w-[95vw] max-w-lg translate-x-[-50%] translate-y-[-50%] border bg-background shadow-xl duration-200",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
              "rounded-xl overflow-hidden p-0",
            )}
            onPointerDownOutside={e => e.preventDefault()}
            onInteractOutside={e => e.preventDefault()}
            onEscapeKeyDown={e => e.preventDefault()}
          >
            <div className="px-5 pt-5 pb-3 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-[15px] font-bold tracking-tight">가격 추이 그래프 (최근 20일)</DialogTitle>
                <button
                  data-testid="button-graph-close"
                  onClick={() => setGraphOpen(false)}
                  className="rounded-full p-1.5 hover:bg-muted transition-colors -mr-1"
                  aria-label="닫기"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            <div className="px-5 pt-4 pb-5 space-y-4">
              {/* 유종 토글 */}
              <div className="flex gap-2">
                {FUELS.map(f => (
                  <button
                    key={f.type}
                    data-testid={`graph-fuel-${f.type}`}
                    onClick={() => toggleGraphFuel(f.type)}
                    style={{
                      minHeight: 44,
                      backgroundColor: graphFuels.has(f.type) ? FUEL_COLORS[f.type] : undefined,
                    }}
                    className={cn(
                      "flex-1 rounded-lg text-sm font-semibold transition-all border",
                      graphFuels.has(f.type)
                        ? "text-white border-transparent shadow-sm"
                        : "bg-muted/60 text-muted-foreground border-border hover:bg-muted",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* 차트 or 안내 메시지 */}
              {uniqueStationCount >= 2 ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground text-center px-4">
                  한 업체만 검색하여 선택하여 주시기 바랍니다.
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  데이터가 없습니다.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 10, right: 12, left: 8, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#111827", fontWeight: 700 }}
                      tickLine={false}
                      axisLine={{ stroke: "#e5e7eb" }}
                      ticks={isMobile ? mobileTicks : undefined}
                      interval={isMobile ? "preserveStartEnd" : 0}
                      height={32}
                      tickMargin={8}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#374151", fontWeight: 700 }}
                      tickFormatter={v => `${Number(v).toLocaleString("ko-KR")}원`}
                      domain={["auto", "auto"]}
                      tickCount={5}
                      width={65}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-sm space-y-1.5">
                            <p className="font-bold text-foreground">{label}</p>
                            {payload.map((p: any) => (
                              <p key={p.dataKey} className="flex items-center gap-2" style={{ color: p.color }}>
                                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                                <span className="font-semibold">
                                  {p.dataKey === "gasoline" ? "휘발유" : p.dataKey === "diesel" ? "경유" : "등유"}:
                                </span>
                                <span>{p.value != null ? Number(p.value).toLocaleString("ko-KR") + "원" : "—"}</span>
                              </p>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 13, paddingTop: 8 }}
                      iconType="circle"
                      iconSize={10}
                      formatter={(val: string) =>
                        val === "gasoline" ? "휘발유" : val === "diesel" ? "경유" : "등유"
                      }
                    />
                    {graphFuels.has("gasoline") && (
                      <Line
                        type="monotone"
                        dataKey="gasoline"
                        stroke={FUEL_COLORS.gasoline}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: FUEL_COLORS.gasoline, strokeWidth: 2, stroke: "#fff" }}
                        activeDot={{ r: 6, fill: FUEL_COLORS.gasoline, strokeWidth: 2, stroke: "#fff" }}
                        connectNulls
                      />
                    )}
                    {graphFuels.has("diesel") && (
                      <Line
                        type="monotone"
                        dataKey="diesel"
                        stroke={FUEL_COLORS.diesel}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: FUEL_COLORS.diesel, strokeWidth: 2, stroke: "#fff" }}
                        activeDot={{ r: 6, fill: FUEL_COLORS.diesel, strokeWidth: 2, stroke: "#fff" }}
                        connectNulls
                      />
                    )}
                    {graphFuels.has("kerosene") && (
                      <Line
                        type="monotone"
                        dataKey="kerosene"
                        stroke={FUEL_COLORS.kerosene}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: FUEL_COLORS.kerosene, strokeWidth: 2, stroke: "#fff" }}
                        activeDot={{ r: 6, fill: FUEL_COLORS.kerosene, strokeWidth: 2, stroke: "#fff" }}
                        connectNulls
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      {/* 결과 */}
      <div className="px-4 md:px-6 pb-8">
        {!enabled ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
            <Search className="w-10 h-10 opacity-30" />
            <p className="text-sm">주유소 상호를 입력하고 검색하세요</p>
          </div>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
            <Search className="w-10 h-10 opacity-30" />
            <p className="text-sm">검색 결과가 없습니다</p>
            <p className="text-xs">상호명을 다시 확인하거나 지역을 변경해보세요</p>
          </div>
        ) : (
          <div className="relative" style={{ overflow: "hidden" }}>
          <div className="rounded-xl border bg-card" style={{ overflow: "hidden" }}>
          <div ref={tableScrollRef} onScroll={handleTableScroll} style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }} className="[&::-webkit-scrollbar]:hidden">
            <table className="text-sm w-full" style={{ minWidth: "700px" }}>
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="py-3 px-1.5 md:px-3 text-left whitespace-nowrap">일자</th>
                  <th className="py-3 px-3 text-left whitespace-nowrap">상호</th>
                  <th className="py-3 px-2 text-center whitespace-nowrap w-12">상표</th>
                  <th className="py-3 px-2 text-center whitespace-nowrap w-10">셀프</th>
                  <th className="py-3 px-3 text-left whitespace-nowrap">
                    <span className="md:hidden">지역</span>
                    <span className="hidden md:inline">주소</span>
                  </th>
                  <th className="py-3 px-2 text-right whitespace-nowrap">
                    현재가<span className="text-[10px] ml-0.5">({fuelLabel})</span>
                  </th>
                  <th className="py-3 px-2 text-right whitespace-nowrap">
                    공급가<span className="text-[10px] ml-0.5">({fuelLabel})</span>
                  </th>
                  <th className="py-3 px-2 text-right whitespace-nowrap">마진</th>
                </tr>
              </thead>
              <tbody>
                {stationGroups.map((group, groupIdx) => (
                  <Fragment key={group.stationId}>
                    {groupIdx > 0 && (
                      <tr>
                        <td colSpan={8} className="py-0 border-t-4 border-muted/60" />
                      </tr>
                    )}
                    {group.rows.map((row, rowIdx) => {
                      const price  = getPrice(row);
                      const supply = getSupply(row);
                      const excess = getExcess(row);
                      return (
                        <tr
                          key={`${row.stationId}-${row.date}`}
                          data-testid={`row-station-${row.stationId}-${row.date}`}
                          className={cn(
                            "border-b last:border-0 transition-colors hover:bg-muted/30",
                            rowIdx % 2 === 0 ? "bg-background" : "bg-muted/10",
                          )}
                        >
                          <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground text-xs">
                            {formatDate(row.date)}
                          </td>
                          <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                            {row.stationName}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <BrandIcon brand={row.brand} />
                          </td>
                          <td className="py-2.5 px-2 text-center text-xs">
                            {row.isSelf
                              ? <span className="text-green-600 font-medium">✓</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground text-xs whitespace-nowrap">
                            <span className="hidden md:inline">{row.address ?? "—"}</span>
                            <span className="md:hidden">{row.region ?? "—"}</span>
                          </td>
                          <td className="py-2.5 px-2 text-right font-semibold whitespace-nowrap">
                            {price != null
                              ? <span>{price.toLocaleString("ko-KR")}원</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2.5 px-2 text-right whitespace-nowrap text-muted-foreground">
                            {formatPrice(supply)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-semibold whitespace-nowrap">
                            {excess == null
                              ? <span className="text-muted-foreground">—</span>
                              : <span className="text-amber-600 dark:text-amber-400">
                                  {excess > 0 ? "+" : ""}{excess.toLocaleString("ko-KR")}원
                                </span>}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/20">
            총 {stationGroups.length}개 업체 · 최근 20일 데이터 기준
          </div>
          </div>
          {tableScroll.canLeft && (
            <div className="fixed left-2 top-1/2 -translate-y-1/2 z-20 pointer-events-none md:hidden">
              <div className="bg-card/80 backdrop-blur-sm border border-border rounded-full p-1 shadow-sm">
                <ChevronLeft className="w-4 h-4 text-muted-foreground animate-pulse" />
              </div>
            </div>
          )}
          {tableScroll.canRight && (
            <div className="fixed right-2 top-1/2 -translate-y-1/2 z-20 pointer-events-none md:hidden">
              <div className="bg-card/80 backdrop-blur-sm border border-border rounded-full p-1 shadow-sm">
                <ChevronRight className="w-4 h-4 text-muted-foreground animate-pulse" />
              </div>
            </div>
          )}
          </div>
        )}
      </div>
    </Layout>
  );
}
