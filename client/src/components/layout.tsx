import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, Users, Shield, FileSpreadsheet,
  MapPin, ClipboardList, LogOut, Menu, X, Activity, User2, ChevronRight, Fuel,
  Bell, BellOff, Upload
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { usePush } from "@/hooks/use-push";
import { apiRequest } from "@/lib/queryClient";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  masterOnly?: boolean;
  hqUserOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "대시보드", href: "/", icon: LayoutDashboard, masterOnly: true },
  { label: "유가 분석", href: "/oil-prices", icon: Fuel },
  { label: "유가 CSV 업로드", href: "/oil-prices/upload", icon: Upload, masterOnly: true },
  { label: "본부 권한", href: "/region-permissions", icon: MapPin },
  { label: "사용자 관리", href: "/users", icon: User2, masterOnly: true },
  { label: "엑셀 업로드", href: "/users/upload", icon: FileSpreadsheet, masterOnly: true },
  { label: "로그인 로그", href: "/logs/login", icon: Activity, masterOnly: true },
  { label: "감사 로그", href: "/logs/audit", icon: ClipboardList, masterOnly: true },
  { label: "내 정보", href: "/my-info", icon: Shield, hqUserOnly: true },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const [location] = useLocation();
  const { user, logout, isMaster } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { state: pushState, subscribe, unsubscribe } = usePush();

  const visibleNav = navItems.filter(item => {
    if (item.masterOnly && !isMaster) return false;
    if (item.hqUserOnly && isMaster) return false;
    return true;
  });

  const handleLogout = async () => {
    try {
      await logout();
      qc.clear();
      window.location.href = "/login";
    } catch {
      toast({ title: "로그아웃 실패", variant: "destructive" });
    }
  };

  const handleBell = async () => {
    if (pushState === "subscribed") {
      const ok = await unsubscribe();
      if (ok) toast({ title: "알림 구독 해제", description: "푸시 알림이 해제되었습니다." });
    } else if (pushState === "default") {
      const ok = await subscribe();
      if (ok) toast({ title: "알림 구독 완료", description: "유가 데이터 업데이트 시 알림을 받습니다." });
      else toast({ title: "알림 권한 거부됨", description: "브라우저 설정에서 알림을 허용해주세요.", variant: "destructive" });
    } else if (pushState === "denied") {
      toast({ title: "알림이 차단됨", description: "브라우저 주소창 자물쇠 아이콘에서 알림 권한을 허용해주세요.", variant: "destructive" });
    }
  };

  const handleTestPush = async () => {
    try {
      await apiRequest("POST", "/api/push/send-test", {});
      toast({ title: "테스트 푸시 발송", description: "잠시 후 알림이 도착합니다." });
    } catch (e: any) {
      const msg = e?.message || "오류 발생";
      toast({ title: "테스트 실패", description: msg, variant: "destructive" });
    }
  };

  const isMobileOpen = sidebarOpen;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* 모바일 오버레이 배경 */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <aside className={cn(
        "flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out flex-shrink-0",
        "max-md:fixed max-md:top-0 max-md:left-0 max-md:h-full max-md:z-40",
        sidebarOpen ? "w-52" : "w-14 max-md:w-14"
      )}>
        {/* 헤더 */}
        <div className="flex items-center h-16 px-3 border-b border-sidebar-border">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-sidebar-foreground truncate">유가모니터링 시스템</p>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-8 w-8 flex-shrink-0"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            data-testid="button-toggle-sidebar"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>

        {/* 사용자 정보 */}
        {sidebarOpen && user && (
          <div className="px-3 py-3 border-b border-sidebar-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary">{user.displayName[0]}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-sidebar-foreground truncate">{user.displayName}</p>
                <Badge variant={user.role === "MASTER" ? "default" : "secondary"} className="text-[10px] h-4 px-1">
                  {user.role === "MASTER" ? "마스터" : "사용자"}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* 네비게이션 */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-md px-2 py-2 mb-0.5 cursor-pointer transition-colors",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isActive
                      ? "bg-sidebar-primary/10 text-sidebar-primary font-medium"
                      : "text-sidebar-foreground/80",
                    !sidebarOpen && "justify-center"
                  )}
                  data-testid={`nav-${item.href.replace(/\//g, "-")}`}
                  title={!sidebarOpen ? item.label : undefined}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {sidebarOpen && <span className="text-sm truncate">{item.label}</span>}
                  {sidebarOpen && isActive && <ChevronRight className="w-3 h-3 ml-auto text-sidebar-primary" />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* 알림 + 로그아웃 */}
        <div className="p-2 border-t border-sidebar-border space-y-1">
          {pushState !== "unsupported" && (
            <div className="relative">
              <Button
                variant="ghost"
                className={cn(
                  "w-full text-muted-foreground",
                  pushState === "subscribed" && "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10",
                  pushState !== "subscribed" && "hover:text-foreground hover:bg-sidebar-accent",
                  !sidebarOpen && "justify-center px-0"
                )}
                onClick={handleBell}
                disabled={pushState === "loading"}
                data-testid="button-push-bell"
                title={
                  pushState === "subscribed" ? "알림 구독 중 (클릭하여 해제)" :
                  pushState === "denied" ? "알림이 차단됨" :
                  "알림 구독"
                }
              >
                {pushState === "subscribed" ? (
                  <Bell className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <BellOff className="w-4 h-4 flex-shrink-0" />
                )}
                {sidebarOpen && (
                  <span className="ml-2 text-sm">
                    {pushState === "subscribed" ? "알림 구독 중" :
                     pushState === "denied" ? "알림 차단됨" :
                     pushState === "loading" ? "처리 중..." :
                     "알림 구독"}
                  </span>
                )}
                {pushState === "subscribed" && sidebarOpen && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                )}
              </Button>
              {pushState === "subscribed" && !sidebarOpen && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
              )}
            </div>
          )}
          {isMaster && pushState === "subscribed" && (
            <Button
              variant="ghost"
              size="sm"
              className={cn("w-full text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent", !sidebarOpen && "justify-center px-0")}
              onClick={handleTestPush}
              data-testid="button-test-push"
              title="테스트 푸시"
            >
              <Bell className="w-3.5 h-3.5 flex-shrink-0" />
              {sidebarOpen && <span className="ml-2">테스트 알림 발송</span>}
            </Button>
          )}
          <Button
            variant="ghost"
            className={cn("w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10", !sidebarOpen && "justify-center px-0")}
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && <span className="ml-2 text-sm">로그아웃</span>}
          </Button>
        </div>
      </aside>

      {/* 메인 콘텐츠 - 모바일에선 사이드바가 fixed라 밀리지 않음 */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}

// 페이지 헤더 공통 컴포넌트
export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-background">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
