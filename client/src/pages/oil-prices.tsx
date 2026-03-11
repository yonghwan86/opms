import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── 지역 단축 (도명 제거) ────────────────────────────────────────────────────
const regionShort = (r: string) => r.includes(" ") ? r.split(" ").slice(1).join(" ") : r;

// ─── 타입 ────────────────────────────────────────────────────────────────────
interface OilTopStation {
  rank: number;
  stationId: string;
  stationName: string;
  region: string;
  sido: string;
  brand: string | null;
  isSelf: boolean;
  price?: number;
  prevPrice?: number;
  changeAmount?: number;
  gasoline?: number;
  diesel?: number;
  kerosene?: number;
  diff?: number;
}

type AnalysisType = "HIGH" | "LOW" | "RISE" | "FALL" | "WIDE";
type FuelType = "gasoline" | "diesel" | "kerosene";

// ─── 상수 ────────────────────────────────────────────────────────────────────
const TABS: { type: AnalysisType; label: string; emoji: string }[] = [
  { type: "HIGH", label: "최고가", emoji: "🔴" },
  { type: "LOW", label: "최저가", emoji: "🔵" },
  { type: "RISE", label: "가격상승", emoji: "📈" },
  { type: "FALL", label: "가격하락", emoji: "📉" },
  { type: "WIDE", label: "가격차", emoji: "↕" },
];

const FUELS: { type: FuelType; label: string }[] = [
  { type: "gasoline", label: "휘발유" },
  { type: "diesel", label: "경유" },
  { type: "kerosene", label: "등유" },
];

const SIDO_LIST = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종시",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

// ─── 날짜 포맷 ───────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(4, 6));
  const day = Number(dateStr.slice(6, 8));
  const d = new Date(year, month - 1, day);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${year}년 ${month}월 ${day}일(${days[d.getDay()]})`;
}

function parseToDate(dateStr: string): Date {
  return new Date(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(4, 6)) - 1,
    Number(dateStr.slice(6, 8)),
  );
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR") + "원";
}

// ─── 날짜 내비게이터 ──────────────────────────────────────────────────────────
function DateNavigator({
  availableDates,
  value,
  onChange,
}: {
  availableDates: string[];
  value: string;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const dateSet = useMemo(() => new Set(availableDates), [availableDates]);
  const currentIndex = availableDates.indexOf(value);

  // availableDates는 내림차순(최신→과거)이므로: 과거=index 증가, 최신=index 감소
  const canPrev = currentIndex < availableDates.length - 1;
  const canNext = currentIndex > 0;

  const selectedDate = value ? parseToDate(value) : undefined;

  return (
    <div className="flex items-center gap-1" data-testid="date-navigator">
      <Button
        variant="outline"
        size="icon"
        onClick={() => canPrev && onChange(availableDates[currentIndex + 1])}
        disabled={!canPrev}
        className="h-9 w-9 flex-shrink-0"
        data-testid="btn-date-prev"
        title="이전 날짜"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-52 justify-start gap-2 font-normal text-left"
            data-testid="trigger-date"
          >
            <CalendarIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="truncate">
              {value ? formatDate(value) : "날짜 선택"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            defaultMonth={selectedDate}
            onSelect={(date) => {
              if (!date) return;
              const str = toDateString(date);
              if (dateSet.has(str)) {
                onChange(str);
                setOpen(false);
              }
            }}
            disabled={(date) => !dateSet.has(toDateString(date))}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="icon"
        onClick={() => canNext && onChange(availableDates[currentIndex - 1])}
        disabled={!canNext}
        className="h-9 w-9 flex-shrink-0"
        data-testid="btn-date-next"
        title="다음 날짜"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── 스켈레톤 ────────────────────────────────────────────────────────────────
function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex gap-2">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────
export default function OilPricesPage() {
  const { isMaster } = useAuth();
  const isMobile = useIsMobile();

  const [activeTab, setActiveTab] = useState<AnalysisType>("HIGH");
  const [selectedFuel, setSelectedFuel] = useState<FuelType>("gasoline");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedRegion, setSelectedRegion] = useState<string>("ALL");

  // 가용 날짜 조회
  const { data: availableDates = [] } = useQuery<string[]>({
    queryKey: ["/api/oil-prices/available-dates"],
    staleTime: 5 * 60 * 1000,
  });

  // 날짜 기본값 설정 (최신 날짜)
  const resolvedDate = selectedDate || availableDates[0] || "";

  // 관할 내 시/군/구 목록 조회 (날짜 기준, HQ_USER 전용)
  const { data: subregions = [] } = useQuery<string[]>({
    queryKey: ["/api/oil-prices/subregions", resolvedDate],
    queryFn: () =>
      resolvedDate
        ? fetch(`/api/oil-prices/subregions?date=${resolvedDate}`, { credentials: "include" }).then(r => r.json())
        : Promise.resolve([]),
    enabled: !isMaster && !!resolvedDate,
    staleTime: 5 * 60 * 1000,
  });

  // 지역 파라미터 조합
  const regionParam = useMemo(() => {
    if (selectedRegion === "ALL") return "";
    if (isMaster) {
      // MASTER: sido 파라미터로 처리
      return `&sido=${encodeURIComponent(selectedRegion)}`;
    } else {
      // HQ_USER: region 파라미터
      return `&region=${encodeURIComponent(selectedRegion)}`;
    }
  }, [selectedRegion, isMaster]);

  // TOP 주유소 쿼리
  const stationsQueryKey = resolvedDate
    ? `/api/oil-prices/top-stations?type=${activeTab}&fuel=${selectedFuel}&date=${resolvedDate}${regionParam}`
    : null;

  const { data: stations = [], isLoading } = useQuery<OilTopStation[]>({
    queryKey: [stationsQueryKey],
    enabled: !!stationsQueryKey,
    staleTime: 2 * 60 * 1000,
  });

  // 지역 드롭다운 옵션
  const regionOptions = useMemo(() => {
    if (isMaster) {
      return [
        { value: "ALL", label: "전국 전체" },
        ...SIDO_LIST.map(s => ({ value: s, label: s })),
      ];
    } else {
      return [
        { value: "ALL", label: "전체 (내 관할)" },
        ...subregions.map(r => ({ value: r, label: isMobile ? regionShort(r) : r })),
      ];
    }
  }, [isMaster, subregions, isMobile]);

  // 현재 탭 정보
  const currentTab = TABS.find(t => t.type === activeTab)!;
  const regionLabel = regionOptions.find(r => r.value === selectedRegion)?.label ?? "전체";

  // 탭 전환 시 fuel 초기화
  const handleTabChange = (tab: AnalysisType) => {
    setActiveTab(tab);
    if (tab === "WIDE" && selectedFuel === "kerosene") {
      setSelectedFuel("gasoline");
    }
  };

  return (
    <Layout>
      <PageHeader title="유가 분석" description="오피넷 기준 주유소별 가격 분석 TOP 10" />

      <div className="p-3 md:p-6 space-y-4 md:space-y-5">
        {/* 컨트롤바 */}
        <div className="flex flex-wrap gap-2 md:gap-3 items-center">
          <DateNavigator
            availableDates={availableDates}
            value={resolvedDate}
            onChange={setSelectedDate}
          />

          <Select
            value={selectedRegion}
            onValueChange={setSelectedRegion}
            data-testid="select-region"
          >
            <SelectTrigger className="w-48" data-testid="trigger-region">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {regionOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value} data-testid={`option-region-${opt.value}`}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 탭 */}
        <Tabs value={activeTab} onValueChange={v => handleTabChange(v as AnalysisType)}>
          <TabsList className="flex gap-0.5 md:gap-1 h-auto p-1 bg-muted">
            {TABS.map(tab => (
              <TabsTrigger
                key={tab.type}
                value={tab.type}
                className="flex-1 text-xs md:text-sm px-1.5 md:px-3 py-1.5"
                data-testid={`tab-${tab.type.toLowerCase()}`}
              >
                <span className="md:hidden">{tab.emoji}</span>
                <span className="hidden md:inline">{tab.emoji} </span>
                <span>{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map(tab => (
            <TabsContent key={tab.type} value={tab.type} className="mt-4">
              <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                {/* 카드 헤더 */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {tab.emoji} {tab.label} TOP 10
                    </h2>
                    {resolvedDate && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(resolvedDate)} 기준 · {regionLabel}
                      </p>
                    )}
                  </div>

                  {/* 연료 선택 */}
                  {tab.type === "WIDE" ? (
                    <div className="flex gap-1" data-testid="fuel-selector-wide">
                      {([
                        { value: "gasoline" as FuelType, label: "휘발유-경유" },
                        { value: "diesel" as FuelType, label: "경유-등유" },
                      ] as const).map(f => (
                        <Button
                          key={f.value}
                          variant={selectedFuel === f.value ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedFuel(f.value)}
                          data-testid={`btn-wide-${f.value}`}
                          className="text-xs"
                        >
                          {f.label}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-1" data-testid="fuel-selector">
                      {FUELS.map(f => (
                        <Button
                          key={f.type}
                          variant={selectedFuel === f.type ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedFuel(f.type)}
                          data-testid={`btn-fuel-${f.type}`}
                          className="text-xs"
                        >
                          {f.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 테이블 */}
                {!resolvedDate ? (
                  <div className="py-16 text-center text-muted-foreground text-sm">
                    날짜를 선택해 주세요.
                  </div>
                ) : isLoading ? (
                  <TableSkeleton cols={tab.type === "WIDE" ? 8 : tab.type === "RISE" || tab.type === "FALL" ? 8 : 6} />
                ) : stations.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-muted-foreground text-sm">아직 수집된 데이터가 없습니다.</p>
                    <p className="text-muted-foreground text-xs mt-1">관리자가 데이터를 수집하면 표시됩니다.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <StationTable type={tab.type} stations={stations} fuelType={selectedFuel} />
                  </div>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Layout>
  );
}

// ─── 브랜드 아이콘 ───────────────────────────────────────────────────────────
function BrandIcon({ brand }: { brand: string | null }) {
  if (!brand) return <span className="text-muted-foreground text-xs">—</span>;

  const icons: Record<string, React.ReactNode> = {
    'SK에너지': (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="SK에너지">
        <circle cx="11" cy="11" r="11" fill="#E31837"/>
        <circle cx="11" cy="6.5" r="3.2" fill="white" opacity="0.88"/>
        <circle cx="11" cy="15.5" r="3.2" fill="white" opacity="0.88"/>
        <circle cx="6.5" cy="11" r="3.2" fill="white" opacity="0.88"/>
        <circle cx="15.5" cy="11" r="3.2" fill="white" opacity="0.88"/>
        <circle cx="11" cy="11" r="2.2" fill="#E31837"/>
      </svg>
    ),
    'GS칼텍스': (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="GS칼텍스">
        <circle cx="11" cy="11" r="11" fill="#00733E"/>
        <path d="M15.5 8.5 A6 6 0 1 0 15.5 13.5" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <line x1="12" y1="11" x2="15.5" y2="11" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    ),
    'HD현대오일뱅크': (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="HD현대오일뱅크">
        <circle cx="11" cy="11" r="11" fill="#003087"/>
        <rect x="5.5" y="6.5" width="3" height="9" rx="1" fill="white"/>
        <rect x="13.5" y="6.5" width="3" height="9" rx="1" fill="white"/>
        <rect x="6.5" y="10" width="9" height="2" rx="1" fill="white"/>
      </svg>
    ),
    'S-OIL': (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="S-OIL">
        <circle cx="11" cy="11" r="11" fill="#FF5F00"/>
        <path d="M11 4.5 C11 4.5 16.5 9.5 16.5 13 C16.5 16 14 18.5 11 18.5 C8 18.5 5.5 16 5.5 13 C5.5 9.5 11 4.5 11 4.5Z" fill="white" opacity="0.9"/>
        <path d="M11 10 C11 10 13.5 12.5 13.5 14 C13.5 15.4 12.4 16.5 11 16.5 C9.6 16.5 8.5 15.4 8.5 14 C8.5 12.5 11 10 11 10Z" fill="#FF5F00"/>
      </svg>
    ),
    'NH-OIL': (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="NH-OIL">
        <circle cx="11" cy="11" r="11" fill="#00843D"/>
        <path d="M11 17 C11 17 5 13 5 8.5 C5 6 7.5 4 10 5 C10.6 5.2 11 5.5 11 5.5 C11 5.5 11.4 5.2 12 5 C14.5 4 17 6 17 8.5 C17 13 11 17 11 17Z" fill="white" opacity="0.9"/>
        <line x1="11" y1="17" x2="11" y2="8" stroke="#00843D" strokeWidth="1.5"/>
      </svg>
    ),
    '알뜰(ex)': (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="알뜰(ex)">
        <circle cx="11" cy="11" r="11" fill="#4B7BE5"/>
        <polygon points="11,3.5 18,7.5 18,14.5 11,18.5 4,14.5 4,7.5" fill="none" stroke="white" strokeWidth="1.8"/>
        <circle cx="11" cy="11" r="2.5" fill="white" opacity="0.9"/>
      </svg>
    ),
    '알뜰주유소': (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="알뜰주유소">
        <circle cx="11" cy="11" r="11" fill="#4B7BE5"/>
        <polygon points="11,3.5 18,7.5 18,14.5 11,18.5 4,14.5 4,7.5" fill="none" stroke="white" strokeWidth="1.8"/>
        <circle cx="11" cy="11" r="2.5" fill="white" opacity="0.9"/>
      </svg>
    ),
    '자가상표': (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="자가상표">
        <circle cx="11" cy="11" r="11" fill="#94A3B8"/>
        <path d="M11 4.5 L18 10.5 L18 18.5 L14 18.5 L14 14 L8 14 L8 18.5 L4 18.5 L4 10.5 Z" fill="white" opacity="0.9"/>
      </svg>
    ),
  };

  return (
    <span className="inline-flex items-center justify-center" title={brand}>
      {icons[brand] ?? (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="11" cy="11" r="11" fill="#CBD5E1"/>
          <circle cx="11" cy="11" r="4" fill="white" opacity="0.8"/>
        </svg>
      )}
    </span>
  );
}

// ─── 테이블 컴포넌트 ─────────────────────────────────────────────────────────
function StationTable({ type, stations, fuelType }: { type: AnalysisType; stations: OilTopStation[]; fuelType?: FuelType }) {
  if (type === "HIGH" || type === "LOW") {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 text-muted-foreground text-xs">
            <th className="text-center py-2.5 px-1.5 md:px-3 font-medium w-10">순위</th>
            <th className="text-left py-2.5 px-1.5 md:px-3 font-medium">상호</th>
            <th className="text-center py-2.5 px-1.5 md:px-3 font-medium w-10">상표</th>
            <th className="hidden md:table-cell text-center py-2.5 px-3 font-medium w-16">셀프</th>
            <th className="text-left py-2.5 px-1.5 md:px-3 font-medium">지역</th>
            <th className="text-right py-2.5 px-1.5 md:px-3 font-medium w-20 md:w-24">가격</th>
          </tr>
        </thead>
        <tbody>
          {stations.map((s) => (
            <tr key={s.stationId} className="border-t border-border hover:bg-muted/30 transition-colors" data-testid={`row-station-${s.stationId}`}>
              <td className="py-3 px-1.5 md:px-3 text-center">
                <RankBadge rank={s.rank} type={type} />
              </td>
              <td className="py-3 px-1.5 md:px-3 font-medium text-foreground whitespace-nowrap">{s.stationName}</td>
              <td className="py-3 px-1 md:px-3 text-center"><BrandIcon brand={s.brand} /></td>
              <td className="hidden md:table-cell py-3 px-3 text-center">
                <span className={s.isSelf ? "text-primary font-medium" : "text-muted-foreground"}>
                  {s.isSelf ? "✓" : "—"}
                </span>
              </td>
              <td className="py-3 px-1.5 md:px-3 text-muted-foreground text-xs whitespace-nowrap">
                <span className="md:hidden">{regionShort(s.region)}</span>
                <span className="hidden md:inline">{s.region}</span>
              </td>
              <td className="py-3 px-1.5 md:px-3 text-right font-semibold text-foreground whitespace-nowrap">
                {s.price != null ? formatPrice(s.price) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (type === "RISE" || type === "FALL") {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 text-muted-foreground text-xs">
            <th className="text-center py-2.5 px-1.5 md:px-3 font-medium w-10">순위</th>
            <th className="text-left py-2.5 px-1.5 md:px-3 font-medium">상호</th>
            <th className="text-center py-2.5 px-1.5 md:px-3 font-medium w-10">상표</th>
            <th className="hidden md:table-cell text-center py-2.5 px-3 font-medium w-16">셀프</th>
            <th className="text-left py-2.5 px-1.5 md:px-3 font-medium">지역</th>
            <th className="text-right py-2.5 px-1.5 md:px-3 font-medium w-20 md:w-24">현재가</th>
            <th className="hidden md:table-cell text-right py-2.5 px-3 font-medium w-24">전일가</th>
            <th className="text-right py-2.5 px-1.5 md:px-3 font-medium w-20 md:w-24">변동</th>
          </tr>
        </thead>
        <tbody>
          {stations.map((s) => (
            <tr key={s.stationId} className="border-t border-border hover:bg-muted/30 transition-colors" data-testid={`row-station-${s.stationId}`}>
              <td className="py-3 px-1.5 md:px-3 text-center">
                <RankBadge rank={s.rank} type={type} />
              </td>
              <td className="py-3 px-1.5 md:px-3 font-medium text-foreground whitespace-nowrap">{s.stationName}</td>
              <td className="py-3 px-1 md:px-3 text-center"><BrandIcon brand={s.brand} /></td>
              <td className="hidden md:table-cell py-3 px-3 text-center">
                <span className={s.isSelf ? "text-primary font-medium" : "text-muted-foreground"}>
                  {s.isSelf ? "✓" : "—"}
                </span>
              </td>
              <td className="py-3 px-1.5 md:px-3 text-muted-foreground text-xs whitespace-nowrap">
                <span className="md:hidden">{regionShort(s.region)}</span>
                <span className="hidden md:inline">{s.region}</span>
              </td>
              <td className="py-3 px-1.5 md:px-3 text-right font-semibold whitespace-nowrap">{s.price != null ? formatPrice(s.price) : "—"}</td>
              <td className="hidden md:table-cell py-3 px-3 text-right text-muted-foreground whitespace-nowrap">{s.prevPrice != null ? formatPrice(s.prevPrice) : "—"}</td>
              <td className="py-3 px-1.5 md:px-3 text-right font-semibold whitespace-nowrap">
                {s.changeAmount != null ? (
                  <span className={cn(
                    type === "RISE" ? "text-red-500" : "text-blue-500"
                  )}>
                    {type === "RISE" ? "▲" : "▼"} {Math.abs(s.changeAmount).toLocaleString("ko-KR")}원
                  </span>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // WIDE
  const isDieselKerosene = fuelType === "diesel";
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-muted/50 text-muted-foreground text-xs">
          <th className="text-center py-2.5 px-1.5 md:px-3 font-medium w-10">순위</th>
          <th className="text-left py-2.5 px-1.5 md:px-3 font-medium">상호</th>
          <th className="text-center py-2.5 px-1.5 md:px-3 font-medium w-10">상표</th>
          <th className="hidden md:table-cell text-center py-2.5 px-3 font-medium w-16">셀프</th>
          <th className="text-left py-2.5 px-1.5 md:px-3 font-medium">지역</th>
          <th className="text-right py-2.5 px-1.5 md:px-3 font-medium w-20 md:w-24">{isDieselKerosene ? "경유" : "휘발유"}</th>
          <th className="text-right py-2.5 px-1.5 md:px-3 font-medium w-20 md:w-24">{isDieselKerosene ? "등유" : "경유"}</th>
          <th className="text-right py-2.5 px-1.5 md:px-3 font-medium w-20 md:w-24">차이</th>
        </tr>
      </thead>
      <tbody>
        {stations.map((s) => (
          <tr key={s.stationId} className="border-t border-border hover:bg-muted/30 transition-colors" data-testid={`row-station-${s.stationId}`}>
            <td className="py-3 px-1.5 md:px-3 text-center">
              <RankBadge rank={s.rank} type="WIDE" />
            </td>
            <td className="py-3 px-1.5 md:px-3 font-medium text-foreground whitespace-nowrap">{s.stationName}</td>
            <td className="py-3 px-1 md:px-3 text-center"><BrandIcon brand={s.brand} /></td>
            <td className="hidden md:table-cell py-3 px-3 text-center">
              <span className={s.isSelf ? "text-primary font-medium" : "text-muted-foreground"}>
                {s.isSelf ? "✓" : "—"}
              </span>
            </td>
            <td className="py-3 px-1.5 md:px-3 text-muted-foreground text-xs whitespace-nowrap">
              <span className="md:hidden">{regionShort(s.region)}</span>
              <span className="hidden md:inline">{s.region}</span>
            </td>
            <td className="py-3 px-1.5 md:px-3 text-right whitespace-nowrap">
              {isDieselKerosene
                ? (s.diesel != null ? formatPrice(s.diesel) : "—")
                : (s.gasoline != null ? formatPrice(s.gasoline) : "—")}
            </td>
            <td className="py-3 px-1.5 md:px-3 text-right whitespace-nowrap">
              {isDieselKerosene
                ? (s.kerosene != null ? formatPrice(s.kerosene) : "—")
                : (s.diesel != null ? formatPrice(s.diesel) : "—")}
            </td>
            <td className="py-3 px-1.5 md:px-3 text-right font-semibold text-orange-500 whitespace-nowrap">
              {s.diff != null ? `+${s.diff.toLocaleString("ko-KR")}원` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── 순위 배지 ───────────────────────────────────────────────────────────────
function RankBadge({ rank, type }: { rank: number; type: AnalysisType }) {
  if (rank <= 3) {
    const colors: Record<number, string> = {
      1: "bg-yellow-100 text-yellow-700 border-yellow-300",
      2: "bg-gray-100 text-gray-600 border-gray-300",
      3: "bg-orange-100 text-orange-600 border-orange-300",
    };
    return (
      <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs font-bold", colors[rank])}>
        {rank}
      </span>
    );
  }
  return <span className="text-muted-foreground text-xs">{rank}</span>;
}
