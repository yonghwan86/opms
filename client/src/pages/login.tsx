import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Eye, EyeOff, Loader2, ArrowLeft, KeyRound, TrendingUp, TrendingDown, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import kpetroCiSrc from "@assets/kpetro-ci.png";
import loginIconSrc from "@assets/file_1773328850418_1773332426820.jpeg";

type Step = "username" | "password" | "setup-password";

// ─── 원형 게이지 ──────────────────────────────────────────────────────────────
function CircleGauge({ value, label, color, percent }: { value: string; label: string; color: string; percent: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const dash = circ * 0.75;
  const filled = dash * percent;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-[135deg]">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
          <p className="text-[11px] text-white/70 leading-none mb-1">{label}</p>
          <p className="text-xs font-bold text-white leading-none">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ─── 라인 차트 ────────────────────────────────────────────────────────────────
function MiniLineChart() {
  const pts = [18, 22, 17, 25, 21, 28, 24, 32, 29, 36, 33, 40];
  const w = 160, h = 60;
  const min = Math.min(...pts), max = Math.max(...pts);
  const toX = (i: number) => (i / (pts.length - 1)) * w;
  const toY = (v: number) => h - ((v - min) / (max - min)) * (h - 8) - 4;
  const polyline = pts.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const area = `${toX(0)},${h} ${polyline} ${toX(pts.length - 1)},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(t => (
        <line key={t} x1="0" y1={h * t} x2={w} y2={h * t}
          stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      ))}
      <polygon points={area} fill="url(#chartGrad)" />
      <polyline points={polyline} fill="none" stroke="#00d4ff" strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 4px #00d4ff)" }} />
      <circle cx={toX(pts.length - 1)} cy={toY(pts[pts.length - 1])} r="3"
        fill="#00d4ff" style={{ filter: "drop-shadow(0 0 6px #00d4ff)" }} />
    </svg>
  );
}

// ─── 지도 점 (한국 주요 도시 위치) ────────────────────────────────────────────
const MAP_DOTS = [
  { x: 38, y: 12 }, { x: 52, y: 18 }, { x: 28, y: 28 }, { x: 60, y: 25 },
  { x: 35, y: 35 }, { x: 55, y: 40 }, { x: 42, y: 48 }, { x: 30, y: 55 },
  { x: 62, y: 52 }, { x: 48, y: 58 }, { x: 25, y: 62 }, { x: 55, y: 65 },
  { x: 38, y: 68 }, { x: 45, y: 75 }, { x: 30, y: 78 }, { x: 52, y: 80 },
  { x: 40, y: 85 }, { x: 20, y: 70 }, { x: 65, y: 60 }, { x: 58, y: 72 },
];

function KoreaMapDots() {
  return (
    <div className="relative w-full h-full">
      {MAP_DOTS.map((dot, i) => (
        <div key={i} className="absolute" style={{ left: `${dot.x}%`, top: `${dot.y}%` }}>
          <div className="relative">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400"
              style={{ boxShadow: "0 0 6px #00d4ff, 0 0 12px #00d4ff40",
                animation: `pulse ${1.5 + (i % 3) * 0.5}s ease-in-out infinite alternate` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 왼쪽 패널 ────────────────────────────────────────────────────────────────
function BrandPanel() {
  return (
    <div className="hidden lg:flex flex-col w-[52%] relative overflow-hidden"
      style={{ background: "linear-gradient(145deg, #0a1628 0%, #0d2744 40%, #083344 70%, #051e2e 100%)" }}>

      {/* 배경 장식 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #00d4ff 0%, transparent 70%)" }} />
        <div className="absolute bottom-[-10%] left-[-10%] w-80 h-80 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #0080ff 0%, transparent 70%)" }} />
      </div>

      {/* 로고 */}
      <div className="relative z-10 flex items-center gap-3 p-8 pb-0">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-white/20"
          style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}>
          <Shield className="w-4 h-4 text-cyan-300" />
        </div>
        <span className="text-base font-bold text-white">유가모니터링 시스템</span>
      </div>

      {/* 대시보드 카드들 */}
      <div className="relative z-10 flex-1 px-8 pt-6 pb-4">

        {/* 라인 차트 카드 */}
        <div className="mb-4 ml-auto w-52 rounded-xl p-3 border border-white/10"
          style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)" }}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-white/75 font-medium">휘발유 가격 추이</p>
            <span className="text-[10px] text-cyan-400 font-medium">▲ 32원</span>
          </div>
          <div className="h-14">
            <MiniLineChart />
          </div>
        </div>

        {/* 게이지 카드 2개 */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 rounded-xl p-3 border border-white/10 flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)" }}>
            <CircleGauge value="1,640원" label="휘발유 /L" color="#00d4ff" percent={0.72} />
          </div>
          <div className="flex-1 rounded-xl p-3 border border-white/10 flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)" }}>
            <CircleGauge value="1,490원" label="경유 /L" color="#4ade80" percent={0.58} />
          </div>
        </div>

        {/* 배지 */}
        <div className="flex gap-2 mb-6">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-cyan-400/50"
            style={{ background: "rgba(0,212,255,0.15)" }}>
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs text-cyan-200 font-semibold">실시간 변동률</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-emerald-400/50"
            style={{ background: "rgba(74,222,128,0.15)" }}>
            <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-emerald-200 font-semibold">오늘의 최저가</span>
          </div>
        </div>

        {/* 텍스트 */}
        <div className="mb-3">
          <h1 className="text-3xl font-bold text-white leading-tight mb-2">
            실시간 유가 정보<br />모니터링 플랫폼
          </h1>
          <p className="text-sm text-white/60 leading-relaxed mb-3">
            오피넷 기반 전국 주유소 가격 정보를<br />
            지역별 · 유종별로 실시간 분석합니다.
          </p>
          {/* 크레딧 */}
          <div className="flex items-center justify-between pt-2.5 border-t border-white/10">
            <span className="text-[11px] text-white/55 font-medium tracking-wide">K Petro 한국석유관리원</span>
            <span className="text-[11px] text-white/40 tracking-wide">dev. kito86</span>
          </div>
        </div>

        {/* 한국 지도 점 */}
        <div className="relative h-36 opacity-80">
          <KoreaMapDots />
        </div>
      </div>
    </div>
  );
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [step, setStep] = useState<Step>("username");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [, navigate] = useLocation();
  const { checkUser, checkUserPending, login, loginPending, setupPassword, setupPasswordPending } = useAuth();
  const { toast } = useToast();

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await checkUser(username.trim().toLowerCase());
      if (!result.exists) {
        toast({ title: "로그인 실패", description: "등록되지 않은 아이디입니다.", variant: "destructive" });
        return;
      }
      if (result.needsPasswordSetup) {
        setStep("setup-password");
      } else {
        setStep("password");
      }
    } catch (err: any) {
      toast({ title: "오류", description: err?.message || "서버 오류가 발생했습니다.", variant: "destructive" });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await login({ username: username.trim().toLowerCase(), password });
      if (result.needsPasswordSetup) {
        setStep("setup-password");
        setPassword("");
      } else {
        navigate("/");
      }
    } catch (err: any) {
      toast({ title: "로그인 실패", description: err?.message || "비밀번호가 올바르지 않습니다.", variant: "destructive" });
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
      await setupPassword({ username: username.trim().toLowerCase(), newPassword });
      navigate("/");
    } catch (err: any) {
      toast({ title: "오류", description: err?.message || "비밀번호 설정에 실패했습니다.", variant: "destructive" });
    }
  };

  const goBackToUsername = () => {
    setStep("username");
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="min-h-screen bg-background flex">
      <BrandPanel />

      {/* 오른쪽 로그인 패널 */}
      <div className="flex-1 flex flex-col lg:items-center lg:justify-center bg-white">
        {/* 모바일 전용 상단: KPetro CI + 아이콘(좌)+제목(우) */}
        <div className="lg:hidden px-8 pt-10 pb-0">
          <div className="mb-10">
            <img src={kpetroCiSrc} alt="한국석유관리원" className="h-12 object-contain" data-testid="img-kpetro-ci-login" />
          </div>
          <div className="flex items-center gap-3 mb-10">
            <img src={loginIconSrc} alt="앱 아이콘" className="w-14 h-14 rounded-xl flex-shrink-0" data-testid="img-app-icon-login" />
            <h1 className="text-xl font-bold text-foreground leading-snug whitespace-nowrap">
              유가 이상징후 탐지 시스템
            </h1>
          </div>
        </div>

        <div className="w-full lg:max-w-sm px-8 lg:px-0 pb-10 lg:pb-0">

          {/* Step 1: 아이디 입력 */}
          {step === "username" && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-foreground">로그인</h2>
                <p className="text-muted-foreground mt-1.5 text-sm">아이디(ID)를 입력하세요</p>
              </div>
              <form onSubmit={handleUsernameSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-sm font-medium">아이디(ID)</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="username"
                      type="text"
                      placeholder="아이디(ID)"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoFocus
                      autoComplete="username"
                      data-testid="input-username"
                      className="h-11 pl-10"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full h-12 font-semibold rounded-full !bg-green-600 hover:!bg-green-700 !text-white" disabled={checkUserPending} data-testid="button-next">
                  {checkUserPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  다음
                </Button>
              </form>
            </>
          )}

          {/* Step 2-A: 비밀번호 입력 */}
          {step === "password" && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-foreground">비밀번호 입력</h2>
                <p className="text-sm text-primary font-medium mt-1.5">{username}</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
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
                      autoFocus
                      autoComplete="current-password"
                      data-testid="input-password"
                      className="h-11 pr-10"
                    />
                    <Button type="button" variant="ghost" size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground"
                      onClick={() => setShowPw(!showPw)} tabIndex={-1}>
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 font-medium" disabled={loginPending} data-testid="button-login">
                  {loginPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  로그인
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={goBackToUsername} data-testid="button-back-username">
                  <ArrowLeft className="w-4 h-4 mr-1" /> 아이디 변경
                </Button>
              </form>
            </>
          )}

          {/* Step 2-B: 비밀번호 설정 */}
          {step === "setup-password" && (
            <>
              <div className="mb-8">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <KeyRound className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">비밀번호 설정</h2>
                <p className="text-muted-foreground mt-1.5 text-sm">
                  처음 로그인하셨습니다. 사용할 비밀번호를 직접 설정해주세요.
                </p>
                <p className="text-xs text-primary font-medium mt-2">{username}</p>
              </div>
              <form onSubmit={handleSetupPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword" className="text-sm font-medium">새 비밀번호</Label>
                  <div className="relative">
                    <Input id="newPassword" type={showNewPw ? "text" : "password"}
                      placeholder="8자 이상 입력하세요" value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required autoFocus minLength={8} data-testid="input-new-password" className="h-11 pr-10" />
                    <Button type="button" variant="ghost" size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground"
                      onClick={() => setShowNewPw(!showNewPw)} tabIndex={-1}>
                      {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">비밀번호 확인</Label>
                  <div className="relative">
                    <Input id="confirmPassword" type={showConfirmPw ? "text" : "password"}
                      placeholder="비밀번호를 다시 입력하세요" value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required data-testid="input-confirm-password" className="h-11 pr-10" />
                    <Button type="button" variant="ghost" size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground"
                      onClick={() => setShowConfirmPw(!showConfirmPw)} tabIndex={-1}>
                      {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive">비밀번호가 일치하지 않습니다.</p>
                  )}
                </div>
                <Button type="submit" className="w-full h-11 font-medium"
                  disabled={setupPasswordPending || newPassword !== confirmPassword || newPassword.length < 8}
                  data-testid="button-set-password">
                  {setupPasswordPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  비밀번호 설정 완료
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={goBackToUsername} data-testid="button-back-username">
                  <ArrowLeft className="w-4 h-4 mr-1" /> 아이디 변경
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
