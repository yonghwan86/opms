import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard, Building2, Users, Shield, FileSpreadsheet,
  MapPin, ClipboardList, LogOut, Menu, X, Activity, User2, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  masterOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "대시보드", href: "/", icon: LayoutDashboard, masterOnly: true },
  { label: "본부 관리", href: "/headquarters", icon: Building2, masterOnly: true },
  { label: "팀 관리", href: "/teams", icon: Users, masterOnly: true },
  { label: "사용자 관리", href: "/users", icon: User2, masterOnly: true },
  { label: "엑셀 업로드", href: "/users/upload", icon: FileSpreadsheet, masterOnly: true },
  { label: "지역 권한", href: "/region-permissions", icon: MapPin },
  { label: "로그인 로그", href: "/logs/login", icon: Activity, masterOnly: true },
  { label: "감사 로그", href: "/logs/audit", icon: ClipboardList, masterOnly: true },
  { label: "내 정보", href: "/my-info", icon: Shield, masterOnly: false },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [location] = useLocation();
  const { user, logout, isMaster } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const visibleNav = navItems.filter(item => {
    if (item.masterOnly && !isMaster) return false;
    if (item.href === "/my-info" && isMaster) return false;
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

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out flex-shrink-0",
        sidebarOpen ? "w-64" : "w-16"
      )}>
        {/* Header */}
        <div className="flex items-center h-16 px-3 border-b border-sidebar-border">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-sidebar-foreground truncate">유가관리 시스템</p>
                <p className="text-xs text-muted-foreground">권한 관리 플랫폼</p>
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

        {/* User info */}
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

        {/* Navigation */}
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
                  <Icon className={cn("flex-shrink-0", isActive ? "w-4 h-4" : "w-4 h-4")} />
                  {sidebarOpen && <span className="text-sm truncate">{item.label}</span>}
                  {sidebarOpen && isActive && <ChevronRight className="w-3 h-3 ml-auto text-sidebar-primary" />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-2 border-t border-sidebar-border">
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

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
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
