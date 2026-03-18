import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, DatabaseZap, CheckCircle2, XCircle, AlertTriangle, Download } from "lucide-react";

interface OilCollectionLog {
  id: number;
  jobType: string;
  status: string;
  targetDate: string | null;
  yesterdayDate: string | null;
  rawCount: number | null;
  analysisCount: number | null;
  rawDurationMs: number | null;
  analysisDurationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

interface PaginatedResult<T> { data: T[]; total: number; page: number; totalPages: number; }

const JOB_TYPE_LABELS: Record<string, string> = {
  scheduled_morning: "오전 확정",
  scheduled_afternoon: "오후 잠정",
  manual: "수동 수집",
  reanalyze: "분석 재실행",
  scheduled_morning_retry1: "오전 1차 재시도",
  scheduled_morning_retry2: "오전 2차 재시도",
  scheduled_afternoon_retry1: "오후 1차 재시도",
  scheduled_afternoon_retry2: "오후 2차 재시도",
  weekly_supply_price: "주간공급가격",
};

const JOB_TYPE_FILTER_OPTIONS = [
  { value: "all", label: "전체 유형" },
  { value: "scheduled_morning", label: "오전 확정" },
  { value: "scheduled_afternoon", label: "오후 잠정" },
  { value: "manual", label: "수동 수집" },
  { value: "reanalyze", label: "분석 재실행" },
  { value: "scheduled_morning_retry1", label: "오전 1차 재시도" },
  { value: "scheduled_morning_retry2", label: "오전 2차 재시도" },
  { value: "scheduled_afternoon_retry1", label: "오후 1차 재시도" },
  { value: "scheduled_afternoon_retry2", label: "오후 2차 재시도" },
  { value: "weekly_supply_price", label: "주간공급가격" },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return (
    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 gap-1">
      <CheckCircle2 className="w-3 h-3" /> 성공
    </Badge>
  );
  if (status === "partial") return (
    <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-0 gap-1">
      <AlertTriangle className="w-3 h-3" /> 부분성공
    </Badge>
  );
  if (status === "skipped") return (
    <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400 border-0 gap-1">
      <AlertTriangle className="w-3 h-3" /> 건너뜀
    </Badge>
  );
  return (
    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 gap-1">
      <XCircle className="w-3 h-3" /> 실패
    </Badge>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}초`;
  return `${Math.floor(ms / 60000)}분 ${Math.floor((ms % 60000) / 1000)}초`;
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const min = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}`;
}

function downloadCsv(logs: OilCollectionLog[]) {
  const headers = ["수집시각", "유형", "결과", "대상날짜", "원본건수", "분석건수", "수집소요(초)", "분석소요(초)", "오류내용"];
  const rows = logs.map(log => [
    formatCreatedAt(log.createdAt),
    JOB_TYPE_LABELS[log.jobType] ?? log.jobType,
    log.status === "success" ? "성공" : log.status === "partial" ? "부분성공" : log.status === "skipped" ? "건너뜀" : "실패",
    formatDate(log.targetDate),
    log.rawCount ?? "",
    log.analysisCount ?? "",
    log.rawDurationMs != null ? (log.rawDurationMs / 1000).toFixed(1) : "",
    log.analysisDurationMs != null ? (log.analysisDurationMs / 1000).toFixed(1) : "",
    log.errorMessage ?? "",
  ]);
  const csvContent = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `유가수집이력_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function OilCollectionLogsPage() {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterJobType, setFilterJobType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState(false);

  const params = new URLSearchParams({ page: String(page), pageSize: "30" });
  if (filterStatus !== "all") params.set("status", filterStatus);
  if (filterJobType !== "all") params.set("jobType", filterJobType);

  const { data, isLoading } = useQuery<PaginatedResult<OilCollectionLog>>({
    queryKey: ["/api/oil-collection-logs", { filterStatus, filterJobType, page }],
    queryFn: () => fetch(`/api/oil-collection-logs?${params.toString()}`).then(r => r.json()),
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const allParams = new URLSearchParams({ page: "1", pageSize: "10000" });
      if (filterStatus !== "all") allParams.set("status", filterStatus);
      if (filterJobType !== "all") allParams.set("jobType", filterJobType);
      const res = await fetch(`/api/oil-collection-logs?${allParams.toString()}`);
      const result: PaginatedResult<OilCollectionLog> = await res.json();
      downloadCsv(result.data);
    } finally {
      setDownloading(false);
    }
  };

  const successCount = data?.data.filter(d => d.status === "success").length ?? 0;
  const partialCount = data?.data.filter(d => d.status === "partial").length ?? 0;
  const failedCount = data?.data.filter(d => d.status === "failed").length ?? 0;

  return (
    <Layout>
      <PageHeader title="유가 수집 이력" description="유가 데이터 수집·분석 이력을 확인합니다.">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DatabaseZap className="w-4 h-4" />
            <span>총 {data?.total ?? 0}건</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={downloading || !data || data.total === 0}
            data-testid="button-download-csv"
            className="gap-1.5"
          >
            <Download className="w-4 h-4" />
            {downloading ? "다운로드 중..." : "CSV"}
          </Button>
        </div>
      </PageHeader>

      <div className="p-3 md:p-6 space-y-4">
        {/* 필터 */}
        <div className="flex flex-wrap gap-2">
          <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
            <SelectTrigger className="w-36" data-testid="select-filter-status">
              <SelectValue placeholder="전체 결과" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 결과</SelectItem>
              <SelectItem value="success">성공</SelectItem>
              <SelectItem value="partial">부분성공</SelectItem>
              <SelectItem value="failed">실패</SelectItem>
              <SelectItem value="skipped">건너뜀</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterJobType} onValueChange={v => { setFilterJobType(v); setPage(1); }}>
            <SelectTrigger className="w-44" data-testid="select-filter-jobtype">
              <SelectValue placeholder="전체 유형" />
            </SelectTrigger>
            <SelectContent>
              {JOB_TYPE_FILTER_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 현재 페이지 요약 배지 */}
          {data && (
            <div className="flex items-center gap-1.5 ml-auto text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                <CheckCircle2 className="w-3 h-3" /> {successCount}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400">
                <AlertTriangle className="w-3 h-3" /> {partialCount}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                <XCircle className="w-3 h-3" /> {failedCount}
              </span>
            </div>
          )}
        </div>

        {/* 테이블 */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">수집 시각</TableHead>
                  <TableHead className="w-28">유형</TableHead>
                  <TableHead className="w-24">결과</TableHead>
                  <TableHead className="w-24">대상 날짜</TableHead>
                  <TableHead className="text-right w-24">원본 건수</TableHead>
                  <TableHead className="text-right w-24">분석 건수</TableHead>
                  <TableHead className="text-right w-28">수집 소요</TableHead>
                  <TableHead className="text-right w-28">분석 소요</TableHead>
                  <TableHead>오류 내용</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : data?.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      수집 이력이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.data.map(log => (
                    <TableRow key={log.id} data-testid={`row-collection-log-${log.id}`}>
                      <TableCell className="text-sm tabular-nums">{formatCreatedAt(log.createdAt)}</TableCell>
                      <TableCell>
                        <span className="text-sm">{JOB_TYPE_LABELS[log.jobType] ?? log.jobType}</span>
                      </TableCell>
                      <TableCell><StatusBadge status={log.status} /></TableCell>
                      <TableCell className="text-sm tabular-nums">{formatDate(log.targetDate)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {log.rawCount != null && log.rawCount > 0 ? `${log.rawCount.toLocaleString()}건` : "-"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {log.analysisCount != null && log.analysisCount > 0 ? `${log.analysisCount.toLocaleString()}건` : "-"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {formatDuration(log.rawDurationMs)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {formatDuration(log.analysisDurationMs)}
                      </TableCell>
                      <TableCell className="text-xs text-red-600 dark:text-red-400 max-w-xs truncate">
                        {log.errorMessage ?? ""}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* 페이지네이션 */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} data-testid="button-prev-page">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {data.totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} data-testid="button-next-page">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
