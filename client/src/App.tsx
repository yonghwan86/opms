import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import UsersPage from "@/pages/users";
import UsersUploadPage from "@/pages/users-upload";
import RegionPermissionsPage from "@/pages/region-permissions";
import LoginLogsPage from "@/pages/login-logs";
import AuditLogsPage from "@/pages/audit-logs";
import MyInfoPage from "@/pages/my-info";
import OilPricesPage from "@/pages/oil-prices";
import OilUploadPage from "@/pages/oil-upload";
import NotFound from "@/pages/not-found";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function ProtectedRoute({ component: Component, masterOnly = false }: { component: React.ComponentType; masterOnly?: boolean }) {
  const { user, isLoading, isMaster } = useAuth();
  const [, navigate] = useLocation();

  if (isLoading) return <LoadingScreen />;

  if (!user) {
    setTimeout(() => navigate("/login"), 0);
    return <LoadingScreen />;
  }

  if (masterOnly && !isMaster) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <p className="text-4xl font-bold text-foreground">403</p>
          <p className="text-muted-foreground text-lg">접근 권한이 없습니다.</p>
          <p className="text-sm text-muted-foreground">이 페이지는 관리자(MASTER)만 접근 가능합니다.</p>
        </div>
      </div>
    );
  }

  return <Component />;
}

// 홈: MASTER → 대시보드, HQ_USER → 내 정보
function HomeRoute() {
  const { user, isLoading, isMaster } = useAuth();
  const [, navigate] = useLocation();

  if (isLoading) return <LoadingScreen />;
  if (!user) {
    setTimeout(() => navigate("/login"), 0);
    return <LoadingScreen />;
  }
  if (!isMaster) {
    setTimeout(() => navigate("/my-info"), 0);
    return <LoadingScreen />;
  }
  return <DashboardPage />;
}

function Router() {
  const { user, isLoading } = useAuth();
  const [location, navigate] = useLocation();

  if (!isLoading && user && location === "/login") {
    setTimeout(() => navigate("/"), 0);
    return null;
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={HomeRoute} />
      <Route path="/users" component={() => <ProtectedRoute component={UsersPage} masterOnly />} />
      <Route path="/users/upload" component={() => <ProtectedRoute component={UsersUploadPage} masterOnly />} />
      <Route path="/region-permissions" component={() => <ProtectedRoute component={RegionPermissionsPage} />} />
      <Route path="/logs/login" component={() => <ProtectedRoute component={LoginLogsPage} masterOnly />} />
      <Route path="/logs/audit" component={() => <ProtectedRoute component={AuditLogsPage} masterOnly />} />
      <Route path="/my-info" component={() => <ProtectedRoute component={MyInfoPage} />} />
      <Route path="/oil-prices" component={() => <ProtectedRoute component={OilPricesPage} />} />
      <Route path="/oil-prices/upload" component={() => <ProtectedRoute component={OilUploadPage} masterOnly />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
