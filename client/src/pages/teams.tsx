import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Pencil, Trash2, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Team { id: number; headquartersId: number; name: string; code: string; enabled: boolean; createdAt: string; }
interface Headquarters { id: number; name: string; code: string; }
interface PaginatedResult<T> { data: T[]; total: number; page: number; pageSize: number; totalPages: number; }

export default function TeamsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterHq, setFilterHq] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState({ name: "", code: "", headquartersId: "", enabled: true });

  const { data: hqList } = useQuery<Headquarters[]>({
    queryKey: ["/api/headquarters", { all: true }],
    queryFn: () => fetch("/api/headquarters?all=true").then(r => r.json()),
  });

  const hqUrl = filterHq !== "all" ? `&headquartersId=${filterHq}` : "";
  const { data, isLoading } = useQuery<PaginatedResult<Team>>({
    queryKey: ["/api/teams", { search, page, filterHq }],
    queryFn: () => fetch(`/api/teams?search=${encodeURIComponent(search)}&page=${page}&pageSize=15${hqUrl}`).then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, headquartersId: Number(form.headquartersId) };
      if (editing) return apiRequest("PATCH", `/api/teams/${editing.id}`, payload).then(r => r.json());
      return apiRequest("POST", "/api/teams", payload).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: editing ? "팀이 수정되었습니다." : "팀이 등록되었습니다." });
      closeDialog();
    },
    onError: async (err: any) => {
      const body = await err?.response?.json?.().catch(() => ({}));
      toast({ title: "오류", description: body?.message || "저장에 실패했습니다.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/teams/${id}`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/teams"] }); toast({ title: "팀이 삭제되었습니다." }); setDeleteId(null); },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const openCreate = () => { setEditing(null); setForm({ name: "", code: "", headquartersId: "", enabled: true }); setDialogOpen(true); };
  const openEdit = (t: Team) => { setEditing(t); setForm({ name: t.name, code: t.code, headquartersId: String(t.headquartersId), enabled: t.enabled }); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const getHqName = (id: number) => hqList?.find(h => h.id === id)?.name || String(id);

  return (
    <Layout>
      <PageHeader title="팀 관리" description="각 본부의 팀을 등록하고 관리합니다.">
        <Button onClick={openCreate} size="sm" data-testid="button-create-team">
          <Plus className="w-4 h-4 mr-1" /> 팀 등록
        </Button>
      </PageHeader>

      <div className="p-6 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="팀명 또는 코드 검색" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" data-testid="input-search-team" />
          </div>
          <Select value={filterHq} onValueChange={v => { setFilterHq(v); setPage(1); }}>
            <SelectTrigger className="w-44" data-testid="select-filter-hq">
              <SelectValue placeholder="전체 본부" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 본부</SelectItem>
              {hqList?.map(hq => <SelectItem key={hq.id} value={String(hq.id)}>{hq.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card className="border border-card-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-12">ID</TableHead>
                <TableHead>팀명</TableHead>
                <TableHead>코드</TableHead>
                <TableHead>소속 본부</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>등록일</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    팀 데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((team) => (
                  <TableRow key={team.id} className="hover:bg-muted/20" data-testid={`row-team-${team.id}`}>
                    <TableCell className="text-muted-foreground text-xs">{team.id}</TableCell>
                    <TableCell className="font-medium">{team.name}</TableCell>
                    <TableCell><code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{team.code}</code></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{getHqName(team.headquartersId)}</TableCell>
                    <TableCell><Badge variant={team.enabled ? "default" : "secondary"}>{team.enabled ? "활성" : "비활성"}</Badge></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(team.createdAt).toLocaleDateString("ko-KR")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(team)} data-testid={`button-edit-team-${team.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(team.id)} data-testid={`button-delete-team-${team.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "팀 수정" : "팀 등록"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>소속 본부 *</Label>
              <Select value={form.headquartersId} onValueChange={v => setForm(f => ({ ...f, headquartersId: v }))}>
                <SelectTrigger data-testid="select-hq"><SelectValue placeholder="본부 선택" /></SelectTrigger>
                <SelectContent>{hqList?.map(hq => <SelectItem key={hq.id} value={String(hq.id)}>{hq.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>팀명 *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="예: 서울1팀" data-testid="input-team-name" />
            </div>
            <div className="space-y-1.5">
              <Label>코드 *</Label>
              <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="예: SEOUL_T1" disabled={!!editing} data-testid="input-team-code" />
              {editing && <p className="text-xs text-muted-foreground">코드는 수정할 수 없습니다.</p>}
            </div>
            <div className="flex items-center justify-between">
              <Label>활성 상태</Label>
              <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>취소</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name || !form.code || !form.headquartersId} data-testid="button-save-team">
              {editing ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>팀을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
