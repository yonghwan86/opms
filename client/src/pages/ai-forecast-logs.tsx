import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AiForecastLog {
  id: number;
  runAt: string;
  status: string;
  mape: number | null;
  anomalyCount: number;
  durationMs: number | null;
  errorMessage: string | null;
}

interface LogsResponse {
  data: AiForecastLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return (
      <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white" data-testid={`badge-status-success`}>
        <CheckCircle2 className="w-3 h-3 mr-1" /> 성공
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" data-testid={`badge-status-failed`}>
      <XCircle className="w-3 h-3 mr-1" /> 실패
    </Badge>
  );
}

function MapeBadge({ mape }: { mape: number | null }) {
  if (mape === null) return <span className="text-muted-foreground text-xs">-</span>;
  const isHigh = mape > 5;
  return (
    <span className={cn("text-sm font-medium", isHigh ? "text-red-500" : "text-emerald-600")}>
      {isHigh && <AlertTriangle className="w-3 h-3 inline mr-1" />}
      {mape.toFixed(2)}%
    </span>
  );
}

function formatRunAt(runAt: string): string {
  try {
    const d = new Date(runAt);
    return d.toLocaleString("ko-KR", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return runAt;
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}초`;
}

export default function AiForecastLogsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery<LogsResponse>({
    queryKey: ["/api/logs/ai-forecast", page],
    queryFn: () => fetch(`/api/logs/ai-forecast?page=${page}&pageSize=${pageSize}`).then(r => r.json()),
  });

  return (
    <Layout>
      <PageHeader
        title="AI 예측 로그"
        description="AI 유가 예측 실행 이력 (마스터 전용)"
      />
      <div className="p-4 md:p-6 space-y-4">
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : !data?.data?.length ? (
              <div className="py-16 text-center text-muted-foreground">
                <p>실행 이력이 없습니다.</p>
                <p className="text-sm mt-1">데이터 수집 성공 후 자동 실행됩니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">실행 일시</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">상태</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">MAPE</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">이상 업소</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">소요시간</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">오류</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((log) => (
                      <tr
                        key={log.id}
                        className="border-b hover:bg-muted/30 transition-colors"
                        data-testid={`row-log-${log.id}`}
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          {formatRunAt(log.runAt)}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={log.status} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <MapeBadge mape={log.mape} />
                        </td>
                        <td className="px-4 py-2.5 text-right" data-testid={`text-anomaly-count-${log.id}`}>
                          {log.anomalyCount ?? 0}건
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {formatDuration(log.durationMs)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-red-400 max-w-xs truncate">
                          {log.errorMessage ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              총 {data.total}건 ({data.page}/{data.totalPages} 페이지)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage(p => p + 1)}
                data-testid="button-next-page"
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
