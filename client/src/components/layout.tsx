import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, Users, Shield, FileSpreadsheet,
  MapPin, ClipboardList, LogOut, Menu, X, Activity, User2, ChevronRight, Fuel,
  Bell, BellOff, Upload, Eye, DatabaseZap, Search, SmilePlus, Globe, TrendingUp,
  BrainCircuit, BotMessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { usePush } from "@/hooks/use-push";
import { apiRequest } from "@/lib/queryClient";

const appIconSrc = "/icon-192.png";
import kpetroCiSrc from "@assets/kpetro-ci.png";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  masterOnly?: boolean;
  hqUserOnly?: boolean;
  devOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "대시보드", href: "/", icon: LayoutDashboard },
  { label: "공개 대시보드", href: "/public", icon: Globe, devOnly: true },
  { label: "최고가격제 변동추이", href: "/ceiling-trend", icon: TrendingUp },
  { label: "유가 분석", href: "/oil-prices", icon: Fuel },
  { label: "AI 유가 예측", href: "/ai-forecast", icon: BrainCircuit },
  { label: "주유소 가격 검색", href: "/station-search", icon: Search },
  { label: "CSV 업로드", href: "/oil-prices/upload", icon: Upload, masterOnly: true },
  { label: "본부 권한", href: "/region-permissions", icon: MapPin, masterOnly: true },
  { label: "사용자 관리", href: "/users", icon: User2, masterOnly: true },
  { label: "엑셀 업로드(사용자)", href: "/users/upload", icon: FileSpreadsheet, masterOnly: true },
  { label: "로그인 로그", href: "/logs/login", icon: Activity, masterOnly: true },
  { label: "감사 로그", href: "/logs/audit", icon: ClipboardList, masterOnly: true },
  { label: "페이지 뷰 로그", href: "/logs/page-views", icon: Eye, masterOnly: true },
  { label: "유가 수집 이력", href: "/logs/oil-collection", icon: DatabaseZap, masterOnly: true },
  { label: "AI 예측 로그", href: "/logs/ai-forecast", icon: BotMessageSquare, masterOnly: true },
  { label: "만족도 조사 결과", href: "/logs/satisfaction", icon: SmilePlus, masterOnly: true },
];

const PAGE_LABELS: Record<string, string> = {
  "/": "대시보드",
  "/public": "공개 대시보드",
  "/oil-prices": "유가 분석",
  "/ai-forecast": "AI 유가 예측",
  "/station-search": "주유소 가격 검색",
  "/ceiling-trend": "최고가격제 변동추이",
  "/oil-prices/upload": "CSV 업로드",
  "/region-permissions": "본부 권한",
  "/users": "사용자 관리",
  "/users/upload": "엑셀 업로드(사용자)",
  "/logs/login": "로그인 로그",
  "/logs/audit": "감사 로그",
  "/logs/page-views": "페이지 뷰 로그",
  "/logs/oil-collection": "유가 수집 이력",
  "/logs/ai-forecast": "AI 예측 로그",
  "/logs/satisfaction": "만족도 조사 결과",
  "/my-info": "내 정보",
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  const [location] = useLocation();
  const { user, logout, isMaster } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { state: pushState, subscribe, unsubscribe } = usePush();
  const isMobile = useIsMobile();
  const lastTrackedPage = useRef<string>("");

  useEffect(() => {
    if (!user || location === "/login") return;
    const pageName = PAGE_LABELS[location] || location;
    if (lastTrackedPage.current === location) return;
    lastTrackedPage.current = location;
    fetch("/api/logs/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: pageName, device: isMobile ? "mobile" : "pc" }),
    }).catch(() => {});
  }, [location, user, isMobile]);

  useEffect(() => {
    if (!user) return;
    const clearBadge = () => {
      if ("clearAppBadge" in navigator) {
        (navigator as any).clearAppBadge().catch(() => {});
      }
      fetch("/api/push/badge-reset", { method: "POST", credentials: "include" }).catch(() => {});
    };
    clearBadge();
    const onVisibility = () => { if (document.visibilityState === "visible") clearBadge(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [user]);

  const visibleNav = navItems.filter(item => {
    if (item.masterOnly && !isMaster) return false;
    if (item.hqUserOnly && isMaster) return false;
    if (item.devOnly && import.meta.env.PROD && !isMaster) return false;
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
    if (pushState === "unsupported") {
      toast({ title: "알림 미지원", description: "iOS는 홈 화면에 앱을 추가한 후 알림을 사용할 수 있습니다.", variant: "destructive" });
    } else if (pushState === "subscribed") {
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

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* 모바일 전용 상단 바 */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 z-50 flex items-center px-3 bg-sidebar border-b border-sidebar-border">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-sidebar-foreground"
          onClick={() => setSidebarOpen(true)}
          data-testid="button-mobile-menu"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div className="flex-1 flex items-center gap-2 ml-1">
          <img src={appIconSrc} alt="앱 아이콘" className="w-6 h-6 rounded flex-shrink-0" />
          <span className="text-sm font-semibold text-sidebar-foreground">유가 이상징후 탐지 시스템</span>
        </div>
        <img src={kpetroCiSrc} alt="한국석유관리원" className="h-7 object-contain flex-shrink-0" data-testid="img-kpetro-ci" />
      </header>

      {/* 모바일 오버레이 배경 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <aside className={cn(
        "flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out flex-shrink-0",
        "max-md:fixed max-md:top-0 max-md:left-0 max-md:h-full max-md:z-40",
        sidebarOpen
          ? "w-52 max-md:translate-x-0"
          : "w-14 max-md:-translate-x-full"
      )}>
        {/* 헤더 */}
        <div className="flex items-center h-16 px-3 border-b border-sidebar-border">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <img src={appIconSrc} alt="앱 아이콘" className="w-8 h-8 rounded-lg flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-sidebar-foreground leading-tight">유가 이상징후<br />탐지 시스템</p>
              </div>
            </div>
          ) : (
            <img src={appIconSrc} alt="앱 아이콘" className="w-8 h-8 rounded-lg mx-auto" />
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
                  onClick={() => {
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
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
                pushState === "unsupported" ? "이 기기에서 알림 미지원" :
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
                   pushState === "unsupported" ? "알림 미지원" :
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

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-y-auto min-w-0 pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className={cn(
      "flex items-start justify-between gap-3 px-4 py-3 md:px-6 md:py-5 border-b border-border bg-background",
      children ? "flex-wrap" : ""
    )}>
      <div className="min-w-0">
        <h1 className="text-lg md:text-xl font-semibold text-foreground leading-tight">{title}</h1>
        {description && <p className="text-xs md:text-sm text-muted-foreground mt-0.5 leading-snug">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2 flex-shrink-0">{children}</div>}
    </div>
  );
}
