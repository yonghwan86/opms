import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Users, MapPin, Activity, TrendingUp, Shield, ClipboardList } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";

interface DashboardStats {
  headquartersCount: number;
  teamsCount: number;
  usersCount: number;
  recentLoginCount: number;
}

interface AuditLogItem {
  id: number;
  actionType: string;
  targetType?: string;
  createdAt: string;
  username?: string;
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "로그인",
  LOGOUT: "로그아웃",
  CREATE: "생성",
  UPDATE: "수정",
  DELETE: "삭제",
  RESET_PASSWORD: "비밀번호 초기화",
  EXCEL_UPLOAD: "엑셀 업로드",
};

const TARGET_LABELS: Record<string, string> = {
  user: "사용자",
  headquarters: "본부",
  team: "팀",
  region_permission: "지역 권한",
};

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: auditData, isLoading: auditLoading } = useQuery<{ data: AuditLogItem[]; total: number }>({
    queryKey: ["/api/audit-logs", { page: 1, pageSize: 10 }],
    queryFn: () => fetch("/api/audit-logs?page=1&pageSize=10").then(r => r.json()),
  });

  const statCards = [
    { label: "본부 수", value: stats?.headquartersCount, icon: Building2, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950", href: "/headquarters" },
    { label: "팀 수", value: stats?.teamsCount, icon: Users, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950", href: "/teams" },
    { label: "사용자 수", value: stats?.usersCount, icon: Shield, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950", href: "/users" },
    { label: "최근 24h 로그인", value: stats?.recentLoginCount, icon: Activity, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950", href: "/logs/login" },
  ];

  return (
    <Layout>
      <PageHeader
        title="대시보드"
        description={`안녕하세요, ${user?.displayName}님! 시스템 현황을 확인하세요.`}
      />
      <div className="p-6 space-y-6">
        {/* 통계 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link href={card.href} key={card.label}>
                <Card className="p-5 cursor-pointer hover:border-primary/30 transition-colors group border border-card-border bg-card">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${card.color}`} />
                    </div>
                    <TrendingUp className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-16 mb-1" />
                  ) : (
                    <p className="text-2xl font-bold text-foreground" data-testid={`stat-${card.label}`}>
                      {card.value?.toLocaleString() ?? "-"}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground mt-0.5">{card.label}</p>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* 최근 감사 로그 */}
        <Card className="border border-card-border bg-card">
          <div className="px-5 py-4 border-b border-card-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm text-foreground">최근 감사 로그</h2>
            </div>
            <Link href="/logs/audit">
              <span className="text-xs text-primary hover:underline cursor-pointer">전체 보기</span>
            </Link>
          </div>
          <div className="divide-y divide-border">
            {auditLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))
            ) : auditData?.data.length === 0 ? (
              <div className="px-5 py-8 text-center text-muted-foreground text-sm">감사 로그가 없습니다.</div>
            ) : (
              auditData?.data.map((log) => (
                <div key={log.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    <Activity className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-foreground">
                      <span className="font-medium text-primary">{log.username || "시스템"}</span>
                      {" "}
                      {TARGET_LABELS[log.targetType || ""] && `[${TARGET_LABELS[log.targetType || ""]}]`}
                      {" "}
                      {ACTION_LABELS[log.actionType] || log.actionType}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {new Date(log.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
