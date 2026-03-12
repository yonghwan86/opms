import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, ChevronLeft, ChevronRight, Download, Monitor, Smartphone } from "lucide-react";

interface PageViewLog {
  id: number;
  userId: number;
  page: string;
  device: string;
  createdAt: string;
  username: string;
  displayName: string;
}

interface PaginatedResult<T> { data: T[]; total: number; page: number; totalPages: number; }

export default function PageViewLogsPage() {
  const [filterPage, setFilterPage] = useState<string>("all");
  const [filterDevice, setFilterDevice] = useState<string>("all");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (filterPage !== "all") params.set("pageFilter", filterPage);
  if (filterDevice !== "all") params.set("device", filterDevice);

  const { data, isLoading } = useQuery<PaginatedResult<PageViewLog>>({
    queryKey: ["/api/page-views", { filterPage, filterDevice, page }],
    queryFn: () => fetch(`/api/page-views?${params.toString()}`).then(r => r.json()),
  });

  const uniquePages = data?.data ? [...new Set(data.data.map(d => d.page))] : [];

  const handleCsvDownload = () => {
    window.open("/api/logs/page-view/csv", "_blank");
  };

  return (
    <Layout>
      <PageHeader title="페이지 뷰 로그" description="사용자별 페이지 조회 이력을 확인합니다.">
        <Button variant="outline" size="sm" onClick={handleCsvDownload} data-testid="button-csv-pageview">
          <Download className="w-4 h-4 mr-1.5" />
          CSV 다운로드
        </Button>
      </PageHeader>

      <div className="p-3 md:p-6 space-y-4">
        <div className="flex gap-2">
          <Select value={filterPage} onValueChange={v => { setFilterPage(v); setPage(1); }}>
            <SelectTrigger className="w-44" data-testid="select-filter-page">
              <SelectValue placeholder="전체 페이지" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 페이지</SelectItem>
              {uniquePages.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterDevice} onValueChange={v => { setFilterDevice(v); setPage(1); }}>
            <SelectTrigger className="w-36" data-testid="select-filter-device">
              <SelectValue placeholder="전체 기기" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 기기</SelectItem>
              <SelectItem value="pc">PC</SelectItem>
              <SelectItem value="mobile">모바일</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="border border-card-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-12">ID</TableHead>
                <TableHead>사용자</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>페이지</TableHead>
                <TableHead>기기</TableHead>
                <TableHead>조회 시각</TableHead>
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
                    <Eye className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    페이지 뷰 로그가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/20" data-testid={`row-pageview-${log.id}`}>
                    <TableCell className="text-muted-foreground text-xs">{log.id}</TableCell>
                    <TableCell className="font-mono text-sm">{log.username}</TableCell>
                    <TableCell>{log.displayName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{log.page}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        {log.device === "mobile" ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
                        {log.device === "mobile" ? "모바일" : "PC"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("ko-KR")}
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
