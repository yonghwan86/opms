import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Pencil, Trash2, Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Headquarters {
  id: number;
  name: string;
  code: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function HeadquartersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Headquarters | null>(null);
  const [form, setForm] = useState({ name: "", code: "", enabled: true });

  const queryKey = ["/api/headquarters", { search, page }];
  const { data, isLoading } = useQuery<PaginatedResult<Headquarters>>({
    queryKey,
    queryFn: () => fetch(`/api/headquarters?search=${encodeURIComponent(search)}&page=${page}&pageSize=15`).then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        return apiRequest("PATCH", `/api/headquarters/${editing.id}`, form).then(r => r.json());
      }
      return apiRequest("POST", "/api/headquarters", form).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/headquarters"] });
      toast({ title: editing ? "본부가 수정되었습니다." : "본부가 등록되었습니다." });
      closeDialog();
    },
    onError: async (err: any) => {
      const body = await err?.response?.json?.().catch(() => ({}));
      toast({ title: "오류", description: body?.message || "저장에 실패했습니다.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/headquarters/${id}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/headquarters"] });
      toast({ title: "본부가 삭제되었습니다." });
      setDeleteId(null);
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", code: "", enabled: true });
    setDialogOpen(true);
  };

  const openEdit = (hq: Headquarters) => {
    setEditing(hq);
    setForm({ name: hq.name, code: hq.code, enabled: hq.enabled });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
  };

  return (
    <Layout>
      <PageHeader title="본부 관리" description="조직 본부를 등록하고 관리합니다.">
        <Button onClick={openCreate} size="sm" data-testid="button-create-hq">
          <Plus className="w-4 h-4 mr-1" /> 본부 등록
        </Button>
      </PageHeader>

      <div className="p-6 space-y-4">
        {/* 검색 */}
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="본부명 또는 코드 검색"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
              data-testid="input-search-hq"
            />
          </div>
        </div>

        {/* 테이블 */}
        <Card className="border border-card-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-12">ID</TableHead>
                <TableHead>본부명</TableHead>
                <TableHead>코드</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>등록일</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    본부 데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((hq) => (
                  <TableRow key={hq.id} className="hover:bg-muted/20" data-testid={`row-hq-${hq.id}`}>
                    <TableCell className="text-muted-foreground text-xs">{hq.id}</TableCell>
                    <TableCell className="font-medium">{hq.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{hq.code}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={hq.enabled ? "default" : "secondary"}>
                        {hq.enabled ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(hq.createdAt).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(hq)} data-testid={`button-edit-hq-${hq.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(hq.id)} data-testid={`button-delete-hq-${hq.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* 페이징 */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">전체 {data.total}개</p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm px-2">{page} / {data.totalPages}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 등록/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "본부 수정" : "본부 등록"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="hq-name">본부명 *</Label>
              <Input id="hq-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="예: 서울본부" data-testid="input-hq-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hq-code">코드 *</Label>
              <Input id="hq-code" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="예: HQ_SEOUL" data-testid="input-hq-code" disabled={!!editing} />
              {editing && <p className="text-xs text-muted-foreground">코드는 수정할 수 없습니다.</p>}
            </div>
            <div className="flex items-center justify-between">
              <Label>활성 상태</Label>
              <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} data-testid="switch-hq-enabled" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>취소</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name || !form.code} data-testid="button-save-hq">
              {editing ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>본부를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>이 작업은 되돌릴 수 없습니다. 해당 본부에 속한 팀이 있으면 삭제가 실패할 수 있습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
