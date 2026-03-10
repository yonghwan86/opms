import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Eye, EyeOff, Loader2, ArrowLeft, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Step = "login" | "setup-password";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [, navigate] = useLocation();
  const { login, loginPending, setupPassword, setupPasswordPending } = useAuth();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await login({ email: email.trim().toLowerCase(), password });
      if (result.needsPasswordSetup) {
        // 최초 로그인 또는 초기화 → 비밀번호 설정 단계로
        setStep("setup-password");
        setPassword("");
      } else {
        navigate("/");
      }
    } catch (err: any) {
      const msg = err?.message || "로그인에 실패했습니다.";
      toast({ title: "로그인 실패", description: msg, variant: "destructive" });
    }
  };

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: "비밀번호 오류", description: "비밀번호는 8자 이상이어야 합니다.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "비밀번호 불일치", description: "비밀번호와 확인이 일치하지 않습니다.", variant: "destructive" });
      return;
    }
    try {
      await setupPassword({ email: email.trim().toLowerCase(), newPassword });
      navigate("/");
    } catch (err: any) {
      const msg = err?.message || "비밀번호 설정에 실패했습니다.";
      toast({ title: "오류", description: msg, variant: "destructive" });
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
            { label: "본부 권한", icon: "📍" },
          ].map(item => (
            <div key={item.label} className="bg-white/10 rounded-xl p-4 text-center">
              <div className="text-2xl mb-2">{item.icon}</div>
              <p className="text-sm font-medium">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">유가관리 시스템</span>
          </div>

          {step === "login" ? (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-foreground">로그인</h2>
                <p className="text-muted-foreground mt-1.5 text-sm">이메일과 비밀번호를 입력하세요</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium">이메일</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    data-testid="input-email"
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
                    <span className="font-medium text-foreground">마스터:</span> master@example.com / master1234!
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">일반 사용자:</span> kim.seoul@example.com (최초 로그인 → 비밀번호 설정)
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="mb-8">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <KeyRound className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">비밀번호 설정</h2>
                <p className="text-muted-foreground mt-1.5 text-sm">
                  처음 로그인하셨습니다. 사용할 비밀번호를 직접 설정해주세요.
                </p>
                <p className="text-xs text-primary font-medium mt-2">{email}</p>
              </div>

              <form onSubmit={handleSetupPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword" className="text-sm font-medium">새 비밀번호</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPw ? "text" : "password"}
                      placeholder="8자 이상 입력하세요"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      data-testid="input-new-password"
                      className="h-11 pr-10"
                    />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground" onClick={() => setShowNewPw(!showNewPw)} tabIndex={-1}>
                      {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">비밀번호 확인</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPw ? "text" : "password"}
                      placeholder="비밀번호를 다시 입력하세요"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      data-testid="input-confirm-password"
                      className="h-11 pr-10"
                    />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground" onClick={() => setShowConfirmPw(!showConfirmPw)} tabIndex={-1}>
                      {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive">비밀번호가 일치하지 않습니다.</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 font-medium"
                  disabled={setupPasswordPending || newPassword !== confirmPassword || newPassword.length < 8}
                  data-testid="button-set-password"
                >
                  {setupPasswordPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  비밀번호 설정 완료
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setStep("login"); setNewPassword(""); setConfirmPassword(""); }}
                  data-testid="button-back-login"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" /> 로그인으로 돌아가기
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
