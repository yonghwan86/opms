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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Plus, Search, Pencil, User2, ChevronLeft, ChevronRight, KeyRound, Eye } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: number; username: string; displayName: string; email: string; positionName?: string;
  departmentName?: string; role: string; headquartersId?: number; teamId?: number; enabled: boolean; createdAt: string;
}
interface Headquarters { id: number; name: string; code: string; }
interface Team { id: number; name: string; code: string; headquartersId: number; }
interface PaginatedResult<T> { data: T[]; total: number; page: number; pageSize: number; totalPages: number; }

export default function UsersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterHq, setFilterHq] = useState<string>("all");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<User | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetPwUserId, setResetPwUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: "", password: "", displayName: "", email: "",
    positionName: "", departmentName: "", role: "HQ_USER",
    headquartersId: "", teamId: "", enabled: true
  });

  const { data: hqList } = useQuery<Headquarters[]>({
    queryKey: ["/api/headquarters", { all: true }],
    queryFn: () => fetch("/api/headquarters?all=true").then(r => r.json()),
  });

  const { data: teamList } = useQuery<Team[]>({
    queryKey: ["/api/teams", { all: true, hq: filterHq }],
    queryFn: () => fetch(`/api/teams?all=true${filterHq !== "all" ? `&headquartersId=${filterHq}` : ""}`).then(r => r.json()),
  });

  const { data: dialogTeamList } = useQuery<Team[]>({
    queryKey: ["/api/teams", { all: true, dialogHq: form.headquartersId }],
    queryFn: () => fetch(`/api/teams?all=true${form.headquartersId ? `&headquartersId=${form.headquartersId}` : ""}`).then(r => r.json()),
    enabled: dialogOpen,
  });

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", "15");
  if (search) params.set("search", search);
  if (filterHq !== "all") params.set("headquartersId", filterHq);
  if (filterTeam !== "all") params.set("teamId", filterTeam);
  if (filterRole !== "all") params.set("role", filterRole);

  const { data, isLoading } = useQuery<PaginatedResult<User>>({
    queryKey: ["/api/users", { search, page, filterHq, filterTeam, filterRole }],
    queryFn: () => fetch(`/api/users?${params.toString()}`).then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        ...form,
        headquartersId: form.headquartersId ? Number(form.headquartersId) : null,
        teamId: form.teamId ? Number(form.teamId) : null,
      };
      if (editing) {
        if (!payload.password) delete payload.password;
        return apiRequest("PATCH", `/api/users/${editing.id}`, payload).then(r => r.json());
      }
      return apiRequest("POST", "/api/users", payload).then(r => r.json());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: editing ? "사용자가 수정되었습니다." : "사용자가 등록되었습니다." });
      closeDialog();
    },
    onError: async (err: any) => {
      const body = await err?.response?.json?.().catch(() => ({}));
      toast({ title: "오류", description: body?.message || "저장에 실패했습니다.", variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/users/${userId}/reset-password`, { password: newPassword || undefined });
      return res.json();
    },
    onSuccess: (data) => {
      setResetResult(data.temporaryPassword);
      qc.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: () => toast({ title: "비밀번호 초기화 실패", variant: "destructive" }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ username: "", password: "", displayName: "", email: "", positionName: "", departmentName: "", role: "HQ_USER", headquartersId: "", teamId: "", enabled: true });
    setDialogOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ username: u.username, password: "", displayName: u.displayName, email: u.email, positionName: u.positionName || "", departmentName: u.departmentName || "", role: u.role, headquartersId: u.headquartersId ? String(u.headquartersId) : "", teamId: u.teamId ? String(u.teamId) : "", enabled: u.enabled });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const getHqName = (id?: number | null) => hqList?.find(h => h.id === id)?.name || "-";
  const getTeamName = (id?: number | null) => teamList?.find(t => t.id === id)?.name || (id ? String(id) : "-");

  return (
    <Layout>
      <PageHeader title="사용자 관리" description="시스템 사용자를 등록하고 관리합니다.">
        <Button onClick={openCreate} size="sm" data-testid="button-create-user">
          <Plus className="w-4 h-4 mr-1" /> 사용자 등록
        </Button>
      </PageHeader>

      <div className="p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="이름, 아이디, 이메일 검색" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" data-testid="input-search-user" />
          </div>
          <Select value={filterHq} onValueChange={v => { setFilterHq(v); setFilterTeam("all"); setPage(1); }}>
            <SelectTrigger className="w-36" data-testid="select-filter-user-hq"><SelectValue placeholder="전체 본부" /></SelectTrigger>
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
          <Select value={filterRole} onValueChange={v => { setFilterRole(v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue placeholder="전체 권한" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 권한</SelectItem>
              <SelectItem value="MASTER">MASTER</SelectItem>
              <SelectItem value="HQ_USER">HQ_USER</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="border border-card-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>아이디</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>권한</TableHead>
                <TableHead>본부</TableHead>
                <TableHead>팀</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <User2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    사용자 데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((user) => (
                  <TableRow key={user.id} className="hover:bg-muted/20" data-testid={`row-user-${user.id}`}>
                    <TableCell className="font-mono text-sm">{user.username}</TableCell>
                    <TableCell className="font-medium">{user.displayName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === "MASTER" ? "default" : "secondary"} className="text-xs">
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{getHqName(user.headquartersId)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{getTeamName(user.teamId)}</TableCell>
                    <TableCell><Badge variant={user.enabled ? "default" : "destructive"} className="text-xs">{user.enabled ? "활성" : "비활성"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailUser(user)} title="상세보기"><Eye className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(user)} data-testid={`button-edit-user-${user.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-500 hover:text-orange-600" onClick={() => { setResetPwUserId(user.id); setNewPassword(""); setResetResult(null); }} title="비밀번호 초기화">
                          <KeyRound className="w-3.5 h-3.5" />
                        </Button>
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
            <p className="text-sm text-muted-foreground">전체 {data.total}명</p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-sm px-2">{page} / {data.totalPages}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </div>

      {/* 사용자 상세 */}
      <Dialog open={!!detailUser} onOpenChange={() => setDetailUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>사용자 상세 정보</DialogTitle></DialogHeader>
          {detailUser && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="font-bold text-primary">{detailUser.displayName[0]}</span>
                </div>
                <div>
                  <p className="font-semibold">{detailUser.displayName}</p>
                  <p className="text-sm text-muted-foreground">@{detailUser.username}</p>
                </div>
                <Badge variant={detailUser.role === "MASTER" ? "default" : "secondary"} className="ml-auto">{detailUser.role}</Badge>
              </div>
              {[
                ["이메일", detailUser.email],
                ["직책", detailUser.positionName || "-"],
                ["부서", detailUser.departmentName || "-"],
                ["본부", getHqName(detailUser.headquartersId)],
                ["팀", getTeamName(detailUser.teamId)],
                ["등록일", new Date(detailUser.createdAt).toLocaleDateString("ko-KR")],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 비밀번호 초기화 */}
      <Dialog open={!!resetPwUserId} onOpenChange={() => { setResetPwUserId(null); setResetResult(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>비밀번호 초기화</DialogTitle></DialogHeader>
          {resetResult ? (
            <div className="py-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mx-auto">
                <KeyRound className="w-6 h-6 text-green-600" />
              </div>
              <p className="text-sm text-muted-foreground">초기화된 임시 비밀번호:</p>
              <code className="block text-lg font-bold font-mono bg-muted px-4 py-2 rounded-lg">{resetResult}</code>
              <p className="text-xs text-muted-foreground">사용자에게 이 임시 비밀번호를 전달하세요.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">새 비밀번호를 입력하거나 빈칸으로 두면 자동 생성됩니다.</p>
                <Input placeholder="새 비밀번호 (선택)" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} data-testid="input-new-password" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetPwUserId(null)}>취소</Button>
                <Button onClick={() => resetPwUserId && resetPasswordMutation.mutate(resetPwUserId)} disabled={resetPasswordMutation.isPending}>
                  초기화
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 등록/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "사용자 수정" : "사용자 등록"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>아이디 *</Label>
                <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="username" disabled={!!editing} data-testid="input-user-username" />
              </div>
              <div className="space-y-1.5">
                <Label>{editing ? "비밀번호 (변경 시)" : "비밀번호 *"}</Label>
                <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" data-testid="input-user-password" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>이름 *</Label>
                <Input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="홍길동" data-testid="input-user-name" />
              </div>
              <div className="space-y-1.5">
                <Label>이메일 *</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" data-testid="input-user-email" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>직책</Label>
                <Input value={form.positionName} onChange={e => setForm(f => ({ ...f, positionName: e.target.value }))} placeholder="사원, 주임, 대리..." />
              </div>
              <div className="space-y-1.5">
                <Label>부서</Label>
                <Input value={form.departmentName} onChange={e => setForm(f => ({ ...f, departmentName: e.target.value }))} placeholder="영업부, IT운영부..." />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>본부</Label>
                <Select value={form.headquartersId} onValueChange={v => setForm(f => ({ ...f, headquartersId: v, teamId: "" }))}>
                  <SelectTrigger><SelectValue placeholder="본부 선택" /></SelectTrigger>
                  <SelectContent>{hqList?.map(hq => <SelectItem key={hq.id} value={String(hq.id)}>{hq.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>팀</Label>
                <Select value={form.teamId} onValueChange={v => setForm(f => ({ ...f, teamId: v }))} disabled={!form.headquartersId}>
                  <SelectTrigger><SelectValue placeholder="팀 선택" /></SelectTrigger>
                  <SelectContent>{dialogTeamList?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>권한</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HQ_USER">HQ_USER</SelectItem>
                    <SelectItem value="MASTER">MASTER</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between pt-6">
                <Label>활성 상태</Label>
                <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>취소</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.username || !form.displayName || !form.email || (!editing && !form.password)} data-testid="button-save-user">
              {editing ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
