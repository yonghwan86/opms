import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [, navigate] = useLocation();
  const { login, loginPending } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ username, password });
      navigate("/");
    } catch (err: any) {
      const msg = err?.message || "로그인에 실패했습니다.";
      toast({ title: "로그인 실패", description: msg, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex flex-col w-1/2 bg-primary p-12 text-primary-foreground">
        <div className="flex items-center gap-3 mb-auto">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold">유가관리 시스템</span>
        </div>
        <div className="mb-auto">
          <h1 className="text-4xl font-bold mb-4 leading-tight">
            안전하고 효율적인<br />권한 관리 플랫폼
          </h1>
          <p className="text-primary-foreground/70 text-lg leading-relaxed">
            본부 · 팀 · 사용자 조직 구조와<br />
            지역 접근 권한을 통합 관리합니다.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "본부 관리", icon: "🏢" },
            { label: "팀 관리", icon: "👥" },
            { label: "지역 권한", icon: "📍" },
          ].map(item => (
            <div key={item.label} className="bg-white/10 rounded-xl p-4 text-center">
              <div className="text-2xl mb-2">{item.icon}</div>
              <p className="text-sm font-medium">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">유가관리 시스템</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground">로그인</h2>
            <p className="text-muted-foreground mt-1.5 text-sm">계정 정보를 입력하여 접속하세요</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm font-medium">아이디</Label>
              <Input
                id="username"
                type="text"
                placeholder="아이디를 입력하세요"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                data-testid="input-username"
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium">비밀번호</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  data-testid="input-password"
                  className="h-11 pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground"
                  onClick={() => setShowPw(!showPw)}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-medium"
              disabled={loginPending}
              data-testid="button-login"
            >
              {loginPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              로그인
            </Button>
          </form>

          <div className="mt-8 p-4 bg-muted/50 rounded-lg border border-border">
            <p className="text-xs text-muted-foreground font-medium mb-2">테스트 계정</p>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">마스터:</span> master / master1234!
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">일반 사용자:</span> seoul1_user / user1234!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
