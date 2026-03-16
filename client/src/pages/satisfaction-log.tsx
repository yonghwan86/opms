import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, SmilePlus, ChevronLeft, ChevronRight, Download } from "lucide-react";

interface SatisfactionRow {
  id: number;
  rating: string;
  created_at: string;
  username: string;
  display_name: string;
}

interface PaginatedResult {
  data: SatisfactionRow[];
  total: number;
  page: number;
  totalPages: number;
}

const RATING_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  매우만족: { label: "매우 만족 😄", variant: "default", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  만족:     { label: "만족 🙂",      variant: "default", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  보통:     { label: "보통 😐",      variant: "secondary", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" },
  불만족:   { label: "불만족 🙁",    variant: "outline", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
  매우불만족: { label: "매우 불만족 😠", variant: "destructive", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

function RatingBadge({ rating }: { rating: string }) {
  const meta = RATING_META[rating];
  if (!meta) return <span className="text-sm text-muted-foreground">{rating}</span>;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  );
}

export default function SatisfactionLogPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (search) params.set("search", search);

  const { data, isLoading } = useQuery<PaginatedResult>({
    queryKey: ["/api/satisfaction/list", { search, page }],
    queryFn: () => fetch(`/api/satisfaction/list?${params.toString()}`).then(r => r.json()),
  });

  const ratingCounts = data?.data.reduce<Record<string, number>>((acc, row) => {
    acc[row.rating] = (acc[row.rating] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Layout>
      <PageHeader title="만족도 조사 결과" description="사용자 만족도 조사 응답 내역을 조회합니다.">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(`/api/satisfaction/list?pageSize=10000&format=csv`, "_blank")}
          data-testid="button-csv-satisfaction"
        >
          <Download className="w-4 h-4 mr-1.5" />
          CSV 다운로드
        </Button>
      </PageHeader>

      <div className="p-3 md:p-6 space-y-4">
        {data && data.total > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(RATING_META).map(([key, meta]) => (
              <span key={key} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${meta.color}`}>
                {meta.label}
                <span className="font-bold">{ratingCounts?.[key] ?? 0}명</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="사용자 검색"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
              data-testid="input-search-satisfaction"
            />
          </div>
        </div>

        <Card className="border border-card-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-12">ID</TableHead>
                <TableHead>사용자</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>만족도</TableHead>
                <TableHead>응답 일시</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <SmilePlus className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    만족도 조사 응답이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/20" data-testid={`row-satisfaction-${row.id}`}>
                    <TableCell className="text-muted-foreground text-xs">{row.id}</TableCell>
                    <TableCell className="font-mono text-sm">{row.username}</TableCell>
                    <TableCell>{row.display_name}</TableCell>
                    <TableCell><RatingBadge rating={row.rating} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(row.created_at).toLocaleString("ko-KR")}
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
              <Button
                variant="outline" size="icon" className="h-8 w-8"
                disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                data-testid="button-prev-page-satisfaction"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm px-2">{page} / {data.totalPages}</span>
              <Button
                variant="outline" size="icon" className="h-8 w-8"
                disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}
                data-testid="button-next-page-satisfaction"
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
