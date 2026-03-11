import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { User2, Building2, Users, MapPin } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface Headquarters { id: number; name: string; code: string; }
interface Team { id: number; name: string; code: string; }
interface RegionPerm { id: number; regionName: string; sidoCode?: string; sigunCode?: string; enabled: boolean; }

export default function MyInfoPage() {
  const { user } = useAuth();

  const { data: hqList } = useQuery<Headquarters[]>({
    queryKey: ["/api/headquarters", { all: true }],
    queryFn: () => fetch("/api/headquarters?all=true").then(r => r.json()),
  });

  const { data: teamList } = useQuery<Team[]>({
    queryKey: ["/api/teams", { all: true }],
    queryFn: () => fetch("/api/teams?all=true").then(r => r.json()),
  });

  const { data: regionData, isLoading: regionLoading } = useQuery<{ data: RegionPerm[] }>({
    queryKey: ["/api/hq-team-region-permissions", { mine: true }],
    queryFn: () => fetch("/api/hq-team-region-permissions?pageSize=100").then(r => r.json()),
    enabled: !!user,
  });

  const myHq = hqList?.find(h => h.id === user?.headquartersId);
  const myTeam = teamList?.find(t => t.id === user?.teamId);

  const infoItems = [
    { label: "아이디", value: user?.username, icon: User2 },
    { label: "이름", value: user?.displayName },
    { label: "이메일", value: user?.email },
    { label: "직책", value: user?.positionName || "-" },
    { label: "권한", value: user?.role },
  ];

  return (
    <Layout>
      <PageHeader title="내 정보" description="내 계정 정보 및 접근 가능한 지역을 확인합니다." />

      <div className="p-6 space-y-6">
        {/* 계정 정보 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 프로필 카드 */}
          <Card className="border border-card-border p-6 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <span className="text-3xl font-bold text-primary">{user?.displayName?.[0] || "?"}</span>
            </div>
            <h2 className="text-lg font-bold text-foreground">{user?.displayName}</h2>
            <p className="text-sm text-muted-foreground mb-3">@{user?.username}</p>
            <Badge variant={user?.role === "MASTER" ? "default" : "secondary"} className="text-sm px-3 py-1">
              {user?.role === "MASTER" ? "마스터" : "일반 사용자"}
            </Badge>
          </Card>

          {/* 상세 정보 */}
          <Card className="border border-card-border p-5 lg:col-span-2">
            <h3 className="font-semibold text-sm text-foreground mb-4">계정 상세 정보</h3>
            <div className="space-y-3">
              {infoItems.map(item => (
                <div key={item.label} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium text-foreground">{item.value || "-"}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* 조직 정보 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border border-card-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm text-foreground">소속 본부</h3>
            </div>
            {myHq ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">본부명</span>
                  <span className="font-medium">{myHq.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">코드</span>
                  <code className="text-sm bg-muted px-2 py-0.5 rounded">{myHq.code}</code>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">소속 본부 없음</p>
            )}
          </Card>

          <Card className="border border-card-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm text-foreground">소속 팀</h3>
            </div>
            {myTeam ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">팀명</span>
                  <span className="font-medium">{myTeam.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">코드</span>
                  <code className="text-sm bg-muted px-2 py-0.5 rounded">{myTeam.code}</code>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">소속 팀 없음</p>
            )}
          </Card>
        </div>

        {/* 접근 가능 지역 */}
        <Card className="border border-card-border">
          <div className="px-5 py-4 border-b border-card-border flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm text-foreground">본부 권한 - 접근 가능한 지역 목록</h3>
            {regionData && (
              <Badge variant="secondary" className="ml-auto text-xs">{regionData.data?.length || 0}개</Badge>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>지역명</TableHead>
                <TableHead>도</TableHead>
                <TableHead>시</TableHead>
                <TableHead>군</TableHead>
                <TableHead>구</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regionLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : !regionData?.data?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <MapPin className="w-6 h-6 mx-auto mb-2 opacity-30" />
                    접근 가능한 지역이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                regionData.data.map((perm: any) => (
                  <TableRow key={perm.id} data-testid={`row-myregion-${perm.id}`}>
                    <TableCell className="font-medium text-sm">{perm.regionName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{perm.doName || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{perm.siName || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{perm.gunName || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{perm.guName || "-"}</TableCell>
                    <TableCell><Badge variant={perm.enabled ? "default" : "secondary"}>{perm.enabled ? "활성" : "비활성"}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </Layout>
  );
}
