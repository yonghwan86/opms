import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
  ceilingGasoline: number | null;
  ceilingDiesel: number | null;
  ceilingKerosene: number | null;
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

  // 자동완성 상태
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeSuggest, setActiveSuggest] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabled = searchName.trim().length > 0;

  // ── 자동완성 fetch (디바운스 300ms) ──────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
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

  // ── 자동완성 선택 ────────────────────────────────────────────────────────
  const selectSuggestion = useCallback((name: string) => {
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
  function getCeiling(row: StationSearchRow): number | null {
    if (fuel === "gasoline") return row.ceilingGasoline;
    if (fuel === "diesel")   return row.ceilingDiesel;
    return row.ceilingKerosene;
  }
  function getExcess(row: StationSearchRow): number | null {
    const p = getPrice(row);
    const c = getCeiling(row);
    if (p == null || c == null) return null;
    return p - c;
  }

  const fuelLabel = FUELS.find(f => f.type === fuel)?.label ?? "";

  return (
    <Layout>
      <PageHeader
        title="주유소 가격 검색"
        subtitle="주유소 상호명으로 최근 10일 유가 이력을 조회합니다"
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
                className="w-72 sm:w-96"
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

        {/* 유종 탭 */}
        <div className="flex gap-2">
          {FUELS.map(f => (
            <button
              key={f.type}
              data-testid={`tab-fuel-${f.type}`}
              onClick={() => setFuel(f.type)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                fuel === f.type
                  ? "bg-green-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

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
          <div className="relative">
          <div className="rounded-xl border bg-card overflow-x-auto [&::-webkit-scrollbar]:hidden">
            <table className="text-sm w-auto">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="py-3 px-1.5 md:px-3 text-left whitespace-nowrap">일자</th>
                  <th className="py-3 px-3 text-left whitespace-nowrap w-[336px]">상호</th>
                  <th className="py-3 px-2 text-center whitespace-nowrap w-12">상표</th>
                  <th className="py-3 px-2 text-center whitespace-nowrap w-10">셀프</th>
                  <th className="py-3 px-3 text-left whitespace-nowrap hidden md:table-cell w-48">주소</th>
                  <th className="py-3 px-2 text-right whitespace-nowrap">
                    현재가<span className="text-[10px] ml-0.5">({fuelLabel})</span>
                  </th>
                  <th className="py-3 px-2 text-right whitespace-nowrap">
                    최고가격제<span className="text-[10px] ml-0.5">({fuelLabel})</span>
                  </th>
                  <th className="py-3 px-2 text-right whitespace-nowrap">초과</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const price   = getPrice(row);
                  const ceiling = getCeiling(row);
                  const excess  = getExcess(row);
                  return (
                    <tr
                      key={`${row.stationId}-${row.date}`}
                      data-testid={`row-station-${row.stationId}-${row.date}`}
                      className={cn(
                        "border-b last:border-0 transition-colors hover:bg-muted/30",
                        idx % 2 === 0 ? "bg-background" : "bg-muted/10",
                      )}
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground text-xs">
                        {formatDate(row.date)}
                      </td>
                      <td className="py-2.5 px-3 font-medium w-[336px] max-w-[336px] overflow-hidden">
                        <span className="block truncate" title={row.stationName}>
                          {row.stationName}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <BrandIcon brand={row.brand} />
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs">
                        {row.isSelf
                          ? <span className="text-green-600 font-medium">✓</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell text-muted-foreground text-xs w-48 max-w-[12rem] overflow-hidden">
                        <span className="block truncate" title={row.address ?? ""}>
                          {row.address ?? "—"}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold whitespace-nowrap">
                        {price != null
                          ? <span>{price.toLocaleString("ko-KR")}원</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap text-muted-foreground">
                        {formatPrice(ceiling)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold whitespace-nowrap">
                        {excess == null
                          ? <span className="text-muted-foreground">—</span>
                          : excess > 0
                            ? <span className="text-red-500">+{excess.toLocaleString("ko-KR")}원</span>
                            : <span className="text-muted-foreground">{excess.toLocaleString("ko-KR")}원</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/20">
              총 {rows.length}건 · 최근 10일 데이터 기준
            </div>
          </div>
            <div className="absolute right-0 top-0 h-full flex items-center pointer-events-none md:hidden">
              <div className="w-10 h-full bg-gradient-to-l from-card to-transparent rounded-r-xl" />
              <ChevronRight className="absolute right-1 w-4 h-4 text-muted-foreground animate-pulse" />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
