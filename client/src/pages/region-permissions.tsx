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
import { Plus, Search, Pencil, Trash2, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface RegionPerm { id: number; headquartersId: number; teamId: number; sidoCode?: string; sigunCode?: string; regionName: string; enabled: boolean; createdAt: string; }
interface Headquarters { id: number; name: string; }
interface Team { id: number; name: string; headquartersId: number; }
interface PaginatedResult<T> { data: T[]; total: number; page: number; pageSize: number; totalPages: number; }

export default function RegionPermissionsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isMaster, user } = useAuth();

  const [filterHq, setFilterHq] = useState<string>(isMaster ? "all" : String(user?.headquartersId || ""));
  const [filterTeam, setFilterTeam] = useState<string>(isMaster ? "all" : String(user?.teamId || ""));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editing, setEditing] = useState<RegionPerm | null>(null);
  const [form, setForm] = useState({ headquartersId: "", teamId: "", sidoCode: "", sigunCode: "", regionName: "", enabled: true });

  const { data: hqList } = useQuery<Headquarters[]>({
    queryKey: ["/api/headquarters", { all: true }],
    queryFn: () => fetch("/api/headquarters?all=true").then(r => r.json()),
    enabled: isMaster,
  });

  const { data: teamList } = useQuery<Team[]>({
    queryKey: ["/api/teams", { all: true, hq: filterHq }],
    queryFn: () => fetch(`/api/teams?all=true${filterHq !== "all" ? `&headquartersId=${filterHq}` : ""}`).then(r => r.json()),
    enabled: isMaster,
  });

  const { data: dialogTeamList } = useQuery<Team[]>({
    queryKey: ["/api/teams", { all: true, dialogHq: form.headquartersId }],
    queryFn: () => fetch(`/api/teams?all=true${form.headquartersId ? `&headquartersId=${form.headquartersId}` : ""}`).then(r => r.json()),
    enabled: dialogOpen && isMaster,
  });

  const params = new URLSearchParams({ page: String(page), pageSize: "15" });
  if (search) params.set("search", search);
  if (filterHq !== "all") params.set("headquartersId", filterHq);
  if (filterTeam !== "all") params.set("teamId", filterTeam);

  const { data, isLoading } = useQuery<PaginatedResult<RegionPerm>>({
    queryKey: ["/api/hq-team-region-permissions", { search, page, filterHq, filterTeam }],
    queryFn: () => fetch(`/api/hq-team-region-permissions?${params.toString()}`).then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, headquartersId: Number(form.headquartersId), teamId: Number(form.teamId) };
      if (editing) return apiRequest("PATCH", `/api/hq-team-region-permissions/${editing.id}`, payload).then(r => r.json());
      return apiRequest("POST", "/api/hq-team-region-permissions", payload).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/hq-team-region-permissions"] });
      toast({ title: editing ? "지역 권한이 수정되었습니다." : "지역 권한이 등록되었습니다." });
      closeDialog();
    },
    onError: async (err: any) => {
      const body = await err?.response?.json?.().catch(() => ({}));
      toast({ title: "오류", description: body?.message || "저장에 실패했습니다.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/hq-team-region-permissions/${id}`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/hq-team-region-permissions"] }); toast({ title: "삭제되었습니다." }); setDeleteId(null); },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ headquartersId: filterHq !== "all" ? filterHq : "", teamId: filterTeam !== "all" ? filterTeam : "", sidoCode: "", sigunCode: "", regionName: "", enabled: true });
    setDialogOpen(true);
  };

  const openEdit = (p: RegionPerm) => {
    setEditing(p);
    setForm({ headquartersId: String(p.headquartersId), teamId: String(p.teamId), sidoCode: p.sidoCode || "", sigunCode: p.sigunCode || "", regionName: p.regionName, enabled: p.enabled });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const getHqName = (id: number) => hqList?.find(h => h.id === id)?.name || String(id);
  const getTeamName = (id: number) => teamList?.find(t => t.id === id)?.name || (id ? String(id) : "-");

  return (
    <Layout>
      <PageHeader title="지역 권한 관리" description="본부+팀 조합별 접근 가능한 지역을 관리합니다.">
        {isMaster && (
          <Button onClick={openCreate} size="sm" data-testid="button-create-region">
            <Plus className="w-4 h-4 mr-1" /> 지역 권한 등록
          </Button>
        )}
      </PageHeader>

      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="지역명 검색" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" data-testid="input-search-region" />
          </div>
          {isMaster && (
            <>
              <Select value={filterHq} onValueChange={v => { setFilterHq(v); setFilterTeam("all"); setPage(1); }}>
                <SelectTrigger className="w-40" data-testid="select-filter-region-hq"><SelectValue placeholder="전체 본부" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 본부</SelectItem>
                  {hqList?.map(hq => <SelectItem key={hq.id} value={String(hq.id)}>{hq.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterTeam} onValueChange={v => { setFilterTeam(v); setPage(1); }}>
                <SelectTrigger className="w-36"><SelectValue placeholder="전체 팀" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 팀</SelectItem>
                  {teamList?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        <Card className="border border-card-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>지역명</TableHead>
                <TableHead>시도 코드</TableHead>
                <TableHead>시군 코드</TableHead>
                {isMaster && <><TableHead>본부</TableHead><TableHead>팀</TableHead></>}
                <TableHead>상태</TableHead>
                {isMaster && <TableHead className="text-right">관리</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isMaster ? 7 : 4} className="text-center py-12 text-muted-foreground">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    지역 권한 데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((perm) => (
                  <TableRow key={perm.id} className="hover:bg-muted/20" data-testid={`row-region-${perm.id}`}>
                    <TableCell className="font-medium">{perm.regionName}</TableCell>
                    <TableCell><code className="text-xs bg-muted px-2 py-0.5 rounded">{perm.sidoCode || "-"}</code></TableCell>
                    <TableCell><code className="text-xs bg-muted px-2 py-0.5 rounded">{perm.sigunCode || "-"}</code></TableCell>
                    {isMaster && (
                      <>
                        <TableCell className="text-sm text-muted-foreground">{getHqName(perm.headquartersId)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{getTeamName(perm.teamId)}</TableCell>
                      </>
                    )}
                    <TableCell><Badge variant={perm.enabled ? "default" : "secondary"}>{perm.enabled ? "활성" : "비활성"}</Badge></TableCell>
                    {isMaster && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(perm)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(perm.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    )}
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

      {isMaster && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editing ? "지역 권한 수정" : "지역 권한 등록"}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>본부 *</Label>
                  <Select value={form.headquartersId} onValueChange={v => setForm(f => ({ ...f, headquartersId: v, teamId: "" }))}>
                    <SelectTrigger data-testid="select-region-hq"><SelectValue placeholder="본부 선택" /></SelectTrigger>
                    <SelectContent>{hqList?.map(hq => <SelectItem key={hq.id} value={String(hq.id)}>{hq.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>팀 *</Label>
                  <Select value={form.teamId} onValueChange={v => setForm(f => ({ ...f, teamId: v }))} disabled={!form.headquartersId}>
                    <SelectTrigger><SelectValue placeholder="팀 선택" /></SelectTrigger>
                    <SelectContent>{dialogTeamList?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>지역명 *</Label>
                <Input value={form.regionName} onChange={e => setForm(f => ({ ...f, regionName: e.target.value }))} placeholder="예: 서울특별시 종로구" data-testid="input-region-name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>시도 코드</Label>
                  <Input value={form.sidoCode} onChange={e => setForm(f => ({ ...f, sidoCode: e.target.value }))} placeholder="예: 11" />
                </div>
                <div className="space-y-1.5">
                  <Label>시군 코드</Label>
                  <Input value={form.sigunCode} onChange={e => setForm(f => ({ ...f, sigunCode: e.target.value }))} placeholder="예: 11010" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>활성 상태</Label>
                <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>취소</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.headquartersId || !form.teamId || !form.regionName} data-testid="button-save-region">
                {editing ? "수정" : "등록"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>지역 권한을 삭제하시겠습니까?</AlertDialogTitle>
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
