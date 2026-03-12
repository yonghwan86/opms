import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ClipboardList, ChevronLeft, ChevronRight, Download } from "lucide-react";

interface AuditLog {
  id: number;
  userId?: number;
  username?: string;
  actionType: string;
  targetType?: string;
  targetId?: number;
  detailJson?: string;
  createdAt: string;
}

interface PaginatedResult<T> { data: T[]; total: number; page: number; totalPages: number; }

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "로그인", LOGOUT: "로그아웃",
  CREATE: "생성", UPDATE: "수정", DELETE: "삭제",
  RESET_PASSWORD: "비밀번호 초기화", EXCEL_UPLOAD: "엑셀 업로드",
};

const TARGET_LABELS: Record<string, string> = {
  user: "사용자", headquarters: "본부", team: "팀", region_permission: "지역 권한",
};

const ACTION_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CREATE: "default", UPDATE: "secondary", DELETE: "destructive",
  LOGIN: "outline", LOGOUT: "outline", RESET_PASSWORD: "secondary", EXCEL_UPLOAD: "default",
};

const ACTION_TYPES = ["LOGIN", "LOGOUT", "CREATE", "UPDATE", "DELETE", "RESET_PASSWORD", "EXCEL_UPLOAD"];
const TARGET_TYPES = ["user", "headquarters", "team", "region_permission"];

export default function AuditLogsPage() {
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterTarget, setFilterTarget] = useState<string>("all");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (filterAction !== "all") params.set("actionType", filterAction);
  if (filterTarget !== "all") params.set("targetType", filterTarget);

  const { data, isLoading } = useQuery<PaginatedResult<AuditLog>>({
    queryKey: ["/api/audit-logs", { filterAction, filterTarget, page }],
    queryFn: () => fetch(`/api/audit-logs?${params.toString()}`).then(r => r.json()),
  });

  return (
    <Layout>
      <PageHeader title="감사 로그" description="시스템 변경 이력 및 감사 로그를 조회합니다.">
        <Button variant="outline" size="sm" onClick={() => window.open("/api/logs/audit/csv", "_blank")} data-testid="button-csv-auditlog">
          <Download className="w-4 h-4 mr-1.5" />
          CSV 다운로드
        </Button>
      </PageHeader>

      <div className="p-3 md:p-6 space-y-4">
        <div className="flex gap-2">
          <Select value={filterAction} onValueChange={v => { setFilterAction(v); setPage(1); }}>
            <SelectTrigger className="w-44" data-testid="select-filter-action">
              <SelectValue placeholder="전체 액션" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 액션</SelectItem>
              {ACTION_TYPES.map(a => <SelectItem key={a} value={a}>{ACTION_LABELS[a] || a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTarget} onValueChange={v => { setFilterTarget(v); setPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="전체 대상" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 대상</SelectItem>
              {TARGET_TYPES.map(t => <SelectItem key={t} value={t}>{TARGET_LABELS[t] || t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card className="border border-card-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-12">ID</TableHead>
                <TableHead>사용자</TableHead>
                <TableHead>액션</TableHead>
                <TableHead>대상 유형</TableHead>
                <TableHead>대상 ID</TableHead>
                <TableHead>상세</TableHead>
                <TableHead>발생 시각</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    감사 로그가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((log) => {
                  let detail = "";
                  try { if (log.detailJson) detail = JSON.stringify(JSON.parse(log.detailJson), null, 0); } catch {}
                  return (
                    <TableRow key={log.id} className="hover:bg-muted/20" data-testid={`row-auditlog-${log.id}`}>
                      <TableCell className="text-muted-foreground text-xs">{log.id}</TableCell>
                      <TableCell className="font-mono text-sm">{log.username || "시스템"}</TableCell>
                      <TableCell>
                        <Badge variant={ACTION_BADGE_VARIANT[log.actionType] || "secondary"} className="text-xs">
                          {ACTION_LABELS[log.actionType] || log.actionType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{TARGET_LABELS[log.targetType || ""] || log.targetType || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.targetId || "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate font-mono">{detail || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("ko-KR")}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">전체 {data.total}개</p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-sm px-2">{page} / {data.totalPages}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
