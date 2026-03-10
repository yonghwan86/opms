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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Plus, Search, Pencil, Trash2, MapPin, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

// 주요 행정구역 도 목록
const DO_LIST = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시",
  "광주광역시", "대전광역시", "울산광역시", "세종특별자치시",
  "경기도", "강원특별자치도", "충청북도", "충청남도",
  "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
];

interface RegionPerm {
  id: number;
  headquartersId: number;
  teamId: number;
  doName?: string;
  siName?: string;
  gunName?: string;
  guName?: string;
  regionName: string;
  sidoCode?: string;
  sigunCode?: string;
  enabled: boolean;
  createdAt: string;
}
interface Headquarters { id: number; name: string; }
interface Team { id: number; name: string; headquartersId: number; }
interface PaginatedResult<T> { data: T[]; total: number; page: number; pageSize: number; totalPages: number; }

// 지역명 자동 생성 헬퍼
function buildRegionName(doName: string, siName: string, gunName: string, guName: string): string {
  return [doName, siName, gunName, guName].filter(Boolean).join(" ") || "";
}

export default function RegionPermissionsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isMaster, user } = useAuth();

  const defaultHq = isMaster ? "all" : String(user?.headquartersId || "");
  const defaultTeam = isMaster ? "all" : String(user?.teamId || "");

  const [filterHq, setFilterHq] = useState<string>(defaultHq);
  const [filterTeam, setFilterTeam] = useState<string>(defaultTeam);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editing, setEditing] = useState<RegionPerm | null>(null);
  const [form, setForm] = useState({
    headquartersId: "",
    teamId: "",
    doName: "",
    siName: "",
    gunName: "",
    guName: "",
    enabled: true,
  });

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

  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (search) params.set("search", search);
  if (filterHq !== "all") params.set("headquartersId", filterHq);
  if (filterTeam !== "all") params.set("teamId", filterTeam);

  const { data, isLoading } = useQuery<PaginatedResult<RegionPerm>>({
    queryKey: ["/api/hq-team-region-permissions", { search, page, filterHq, filterTeam }],
    queryFn: () => fetch(`/api/hq-team-region-permissions?${params.toString()}`).then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const regionName = buildRegionName(form.doName, form.siName, form.gunName, form.guName);
      if (!regionName) throw new Error("최소 도 단위 이상의 지역을 입력하세요.");
      const payload = {
        headquartersId: Number(form.headquartersId),
        teamId: Number(form.teamId),
        doName: form.doName || null,
        siName: form.siName || null,
        gunName: form.gunName || null,
        guName: form.guName || null,
        regionName,
        enabled: form.enabled,
      };
      if (editing) {
        return apiRequest("PATCH", `/api/hq-team-region-permissions/${editing.id}`, payload).then(r => r.json());
      }
      return apiRequest("POST", "/api/hq-team-region-permissions", payload).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/hq-team-region-permissions"] });
      toast({ title: editing ? "본부 권한이 수정되었습니다." : "본부 권한이 등록되었습니다." });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "오류", description: err?.message || "저장에 실패했습니다.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/hq-team-region-permissions/${id}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/hq-team-region-permissions"] });
      toast({ title: "삭제되었습니다." });
      setDeleteId(null);
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      headquartersId: filterHq !== "all" ? filterHq : "",
      teamId: filterTeam !== "all" ? filterTeam : "",
      doName: "", siName: "", gunName: "", guName: "", enabled: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (p: RegionPerm) => {
    setEditing(p);
    setForm({
      headquartersId: String(p.headquartersId),
      teamId: String(p.teamId),
      doName: p.doName || "",
      siName: p.siName || "",
      gunName: p.gunName || "",
      guName: p.guName || "",
      enabled: p.enabled,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const getHqName = (id: number) => hqList?.find(h => h.id === id)?.name || String(id);
  const getTeamName = (id: number) => {
    // HQ_USER의 경우 teamList가 없으므로 id를 그대로 표시
    const allTeams = teamList || [];
    return allTeams.find(t => t.id === id)?.name || (id ? `팀 ${id}` : "-");
  };

  const previewRegionName = buildRegionName(form.doName, form.siName, form.gunName, form.guName);

  return (
    <Layout>
      <PageHeader title="본부 권한 관리" description="본부+팀 조합별 접근 가능한 지역을 도/시/군/구 단위로 관리합니다.">
        {isMaster && (
          <Button onClick={openCreate} size="sm" data-testid="button-create-region">
            <Plus className="w-4 h-4 mr-1" /> 지역 추가
          </Button>
        )}
      </PageHeader>

      <div className="p-6 space-y-4">
        {/* 필터 */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="지역명 검색"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
              data-testid="input-search-region"
            />
          </div>
          {isMaster && (
            <>
              <Select value={filterHq} onValueChange={v => { setFilterHq(v); setFilterTeam("all"); setPage(1); }}>
                <SelectTrigger className="w-40" data-testid="select-filter-region-hq">
                  <SelectValue placeholder="전체 본부" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 본부</SelectItem>
                  {hqList?.map(hq => <SelectItem key={hq.id} value={String(hq.id)}>{hq.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterTeam} onValueChange={v => { setFilterTeam(v); setPage(1); }}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="전체 팀" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 팀</SelectItem>
                  {teamList?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        {/* 테이블 */}
        <Card className="border border-card-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>지역명</TableHead>
                <TableHead>도</TableHead>
                <TableHead>시</TableHead>
                <TableHead>군</TableHead>
                <TableHead>구</TableHead>
                {isMaster && <><TableHead>본부</TableHead><TableHead>팀</TableHead></>}
                <TableHead>상태</TableHead>
                {isMaster && <TableHead className="text-right">관리</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: isMaster ? 9 : 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isMaster ? 9 : 6} className="text-center py-14 text-muted-foreground">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">본부 권한 데이터가 없습니다.</p>
                    {isMaster && (
                      <p className="text-xs mt-1">상단의 "지역 추가" 버튼으로 지역을 등록하세요.</p>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((perm) => (
                  <TableRow key={perm.id} className="hover:bg-muted/20" data-testid={`row-region-${perm.id}`}>
                    <TableCell className="font-medium text-sm">{perm.regionName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{perm.doName || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{perm.siName || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{perm.gunName || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{perm.guName || "-"}</TableCell>
                    {isMaster && (
                      <>
                        <TableCell className="text-sm text-muted-foreground">{getHqName(perm.headquartersId)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{getTeamName(perm.teamId)}</TableCell>
                      </>
                    )}
                    <TableCell>
                      <Badge variant={perm.enabled ? "default" : "secondary"} className="text-xs">
                        {perm.enabled ? "활성" : "비활성"}
                      </Badge>
                    </TableCell>
                    {isMaster && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(perm)} data-testid={`button-edit-region-${perm.id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(perm.id)} data-testid={`button-delete-region-${perm.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
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
      {isMaster && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "본부 권한 수정" : "본부 권한 등록"}</DialogTitle>
              <DialogDescription>
                본부+팀 조합에 접근 가능한 지역을 도/시/군/구 단위로 설정합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              {/* 본부+팀 선택 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>본부 *</Label>
                  <Select
                    value={form.headquartersId}
                    onValueChange={v => setForm(f => ({ ...f, headquartersId: v, teamId: "" }))}
                  >
                    <SelectTrigger data-testid="select-region-hq">
                      <SelectValue placeholder="본부 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {hqList?.map(hq => <SelectItem key={hq.id} value={String(hq.id)}>{hq.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>팀 *</Label>
                  <Select
                    value={form.teamId}
                    onValueChange={v => setForm(f => ({ ...f, teamId: v }))}
                    disabled={!form.headquartersId}
                  >
                    <SelectTrigger data-testid="select-region-team">
                      <SelectValue placeholder="팀 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {dialogTeamList?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* 행정구역 입력 */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">행정구역 설정</p>
                  <span className="text-xs text-muted-foreground">(도 필수, 시/군/구는 선택)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {/* 도 */}
                  <div className="space-y-1.5">
                    <Label htmlFor="do-name" className="flex items-center gap-1">
                      도 <span className="text-destructive text-xs">*</span>
                    </Label>
                    <Select
                      value={form.doName}
                      onValueChange={v => setForm(f => ({ ...f, doName: v }))}
                    >
                      <SelectTrigger id="do-name" data-testid="select-do-name">
                        <SelectValue placeholder="도/광역시 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {DO_LIST.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 시 */}
                  <div className="space-y-1.5">
                    <Label htmlFor="si-name">시</Label>
                    <Input
                      id="si-name"
                      value={form.siName}
                      onChange={e => setForm(f => ({ ...f, siName: e.target.value }))}
                      placeholder="예: 수원시, 성남시"
                      data-testid="input-si-name"
                    />
                  </div>

                  {/* 군 */}
                  <div className="space-y-1.5">
                    <Label htmlFor="gun-name">군</Label>
                    <Input
                      id="gun-name"
                      value={form.gunName}
                      onChange={e => setForm(f => ({ ...f, gunName: e.target.value }))}
                      placeholder="예: 가평군, 양평군"
                      data-testid="input-gun-name"
                    />
                  </div>

                  {/* 구 */}
                  <div className="space-y-1.5">
                    <Label htmlFor="gu-name">구</Label>
                    <Input
                      id="gu-name"
                      value={form.guName}
                      onChange={e => setForm(f => ({ ...f, guName: e.target.value }))}
                      placeholder="예: 강남구, 종로구"
                      data-testid="input-gu-name"
                    />
                  </div>
                </div>
              </div>

              {/* 미리보기 */}
              {previewRegionName && (
                <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <Info className="w-4 h-4 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">생성될 지역명</p>
                    <p className="text-sm font-medium text-primary">{previewRegionName}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <Label>활성 상태</Label>
                <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>취소</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !form.headquartersId || !form.teamId || !form.doName}
                data-testid="button-save-region"
              >
                {saveMutation.isPending ? "저장 중..." : editing ? "수정" : "등록"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 삭제 확인 */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>본부 권한을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
