import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Search, Activity, ChevronLeft, ChevronRight, Monitor } from "lucide-react";

interface LoginLog {
  id: number;
  userId: number;
  loginAt: string;
  ipAddress?: string;
  userAgent?: string;
  username: string;
  displayName: string;
}

interface PaginatedResult<T> { data: T[]; total: number; page: number; totalPages: number; }

export default function LoginLogsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (search) params.set("search", search);

  const { data, isLoading } = useQuery<PaginatedResult<LoginLog>>({
    queryKey: ["/api/login-logs", { search, page }],
    queryFn: () => fetch(`/api/login-logs?${params.toString()}`).then(r => r.json()),
  });

  const formatUA = (ua?: string) => {
    if (!ua) return "-";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari")) return "Safari";
    return ua.slice(0, 30) + "...";
  };

  return (
    <Layout>
      <PageHeader title="로그인 로그" description="시스템 로그인 이력을 조회합니다." />

      <div className="p-3 md:p-6 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="사용자 검색" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" data-testid="input-search-loginlog" />
          </div>
        </div>

        <Card className="border border-card-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-12">ID</TableHead>
                <TableHead>사용자</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>IP 주소</TableHead>
                <TableHead>브라우저</TableHead>
                <TableHead>로그인 시각</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    로그인 로그가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/20" data-testid={`row-loginlog-${log.id}`}>
                    <TableCell className="text-muted-foreground text-xs">{log.id}</TableCell>
                    <TableCell className="font-mono text-sm">{log.username}</TableCell>
                    <TableCell>{log.displayName}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{log.ipAddress || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Monitor className="w-3.5 h-3.5" />
                        {formatUA(log.userAgent)}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(log.loginAt).toLocaleString("ko-KR")}
                    </TableCell>
                  </TableRow>
                ))
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
