import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, ChevronLeft, ChevronRight, Download, Monitor, Smartphone, Users, CalendarDays, Percent } from "lucide-react";

interface PublicAccessLog {
  id: number;
  accessedAt: string;
  ipAddress: string | null;
  device: string;
  userAgent: string | null;
  endpoint: string;
}

interface PaginatedResult {
  data: PublicAccessLog[];
  total: number;
  page: number;
  totalPages: number;
}

interface Stats {
  todayVisits: number;
  weekVisits: number;
  mobilePercent: number;
}

const ENDPOINT_LABELS: Record<string, string> = {
  "/api/public/wti": "원유 시세",
  "/api/public/exchange-rate": "환율",
  "/api/public/fuel-stats": "유가 통계",
  "/api/public/regional-averages": "지역별 평균",
  "/api/public/domestic-history": "국내 이력",
  "/api/public/ceiling-prices": "최고가격제",
  "/api/public/ceiling-prices/all": "최고가격제 목록",
  "/api/public/ceiling-trend": "최고가격제 추이",
  "/api/public/ceiling-trend/station": "주유소 추이",
  "/api/public/stations/suggest": "주유소 검색",
  "/api/public/stations/subregions": "세부지역",
  "/api/public/geocode": "위치 감지",
  "/api/public/intl-vs-domestic": "국제-국내 비교",
  "/api/public/satisfaction": "만족도 조사",
  "/api/public/dashboard-enabled": "대시보드 상태",
};

function endpointLabel(ep: string) {
  return ENDPOINT_LABELS[ep] ?? ep.replace("/api/public/", "");
}

const KNOWN_ENDPOINTS = Object.keys(ENDPOINT_LABELS);

export default function PublicAccessLogsPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterDevice, setFilterDevice] = useState("all");
  const [filterEndpoint, setFilterEndpoint] = useState("all");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (filterDevice !== "all") params.set("device", filterDevice);
  if (filterEndpoint !== "all") params.set("endpoint", filterEndpoint);

  const { data, isLoading } = useQuery<PaginatedResult>({
    queryKey: ["/api/admin/public-access-logs", { dateFrom, dateTo, filterDevice, filterEndpoint, page }],
    queryFn: () => fetch(`/api/admin/public-access-logs?${params.toString()}`).then(r => r.json()),
  });

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/admin/public-access-logs/stats"],
    queryFn: () => fetch("/api/admin/public-access-logs/stats").then(r => r.json()),
    staleTime: 60_000,
  });

  const handleReset = () => {
    setDateFrom("");
    setDateTo("");
    setFilterDevice("all");
    setFilterEndpoint("all");
    setPage(1);
  };

  const handleCsvDownload = () => {
    const csvParams = new URLSearchParams();
    if (dateFrom) csvParams.set("dateFrom", dateFrom);
    if (dateTo) csvParams.set("dateTo", dateTo);
    if (filterDevice !== "all") csvParams.set("device", filterDevice);
    if (filterEndpoint !== "all") csvParams.set("endpoint", filterEndpoint);
    window.open(`/api/admin/public-access-logs/csv?${csvParams.toString()}`, "_blank");
  };

  return (
    <Layout>
      <PageHeader title="공개 대시보드 접속 로그" description="외부 공개 API 호출 기록을 조회합니다. 봇/크롤러 제외, 90일 보존.">
        <Button variant="outline" size="sm" onClick={handleCsvDownload} data-testid="button-csv-public-access">
          <Download className="w-4 h-4 mr-1.5" />
          CSV 다운로드
        </Button>
      </PageHeader>

      <div className="p-3 md:p-6 space-y-4">
        {/* 요약 카드 */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="px-4 py-3 flex items-center gap-3 border border-border">
            <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
              <CalendarDays className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">오늘 방문 수 <span className="text-[10px]">(IP 기준)</span></p>
              {statsLoading ? <Skeleton className="h-6 w-16 mt-0.5" /> : (
                <p className="text-xl font-bold text-foreground" data-testid="stat-today-visits">{stats?.todayVisits ?? 0}</p>
              )}
            </div>
          </Card>
          <Card className="px-4 py-3 flex items-center gap-3 border border-border">
            <div className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">이번 주 방문 수 <span className="text-[10px]">(IP 기준)</span></p>
              {statsLoading ? <Skeleton className="h-6 w-16 mt-0.5" /> : (
                <p className="text-xl font-bold text-foreground" data-testid="stat-week-visits">{stats?.weekVisits ?? 0}</p>
              )}
            </div>
          </Card>
          <Card className="px-4 py-3 flex items-center gap-3 border border-border">
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">모바일 비율 <span className="text-[10px]">(7일)</span></p>
              {statsLoading ? <Skeleton className="h-6 w-16 mt-0.5" /> : (
                <p className="text-xl font-bold text-foreground" data-testid="stat-mobile-percent">{stats?.mobilePercent ?? 0}%</p>
              )}
            </div>
          </Card>
        </div>

        {/* 필터 */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              className="w-36 text-sm"
              data-testid="input-date-from"
            />
            <span className="text-muted-foreground text-sm">~</span>
            <Input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
              className="w-36 text-sm"
              data-testid="input-date-to"
            />
          </div>
          <Select value={filterDevice} onValueChange={v => { setFilterDevice(v); setPage(1); }}>
            <SelectTrigger className="w-32" data-testid="select-filter-device-public">
              <SelectValue placeholder="전체 기기" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 기기</SelectItem>
              <SelectItem value="pc">PC</SelectItem>
              <SelectItem value="mobile">모바일</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterEndpoint} onValueChange={v => { setFilterEndpoint(v); setPage(1); }}>
            <SelectTrigger className="w-44" data-testid="select-filter-endpoint">
              <SelectValue placeholder="전체 엔드포인트" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 엔드포인트</SelectItem>
              {KNOWN_ENDPOINTS.map(ep => (
                <SelectItem key={ep} value={ep}>{endpointLabel(ep)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(dateFrom || dateTo || filterDevice !== "all" || filterEndpoint !== "all") && (
            <Button variant="ghost" size="sm" onClick={handleReset} data-testid="button-reset-filter">
              초기화
            </Button>
          )}
        </div>

        {/* 테이블 */}
        <Card className="border border-card-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-12">ID</TableHead>
                <TableHead>접속 일시</TableHead>
                <TableHead>IP 주소</TableHead>
                <TableHead>기기</TableHead>
                <TableHead>엔드포인트</TableHead>
                <TableHead className="hidden md:table-cell">User-Agent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    접속 로그가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/20" data-testid={`row-public-access-${log.id}`}>
                    <TableCell className="text-muted-foreground text-xs">{log.id}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(log.accessedAt).toLocaleString("ko-KR")}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.ipAddress ?? "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        {log.device === "mobile"
                          ? <Smartphone className="w-3.5 h-3.5" />
                          : <Monitor className="w-3.5 h-3.5" />}
                        {log.device === "mobile" ? "모바일" : "PC"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-mono">
                        {endpointLabel(log.endpoint)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell max-w-[200px]">
                      <p className="text-xs text-muted-foreground truncate" title={log.userAgent ?? ""}>
                        {log.userAgent ?? "-"}
                      </p>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">전체 {data.total.toLocaleString()}개</p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline" size="icon" className="h-8 w-8"
                disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                data-testid="button-prev-page-public-access"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm px-2">{page} / {data.totalPages}</span>
              <Button
                variant="outline" size="icon" className="h-8 w-8"
                disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}
                data-testid="button-next-page-public-access"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
