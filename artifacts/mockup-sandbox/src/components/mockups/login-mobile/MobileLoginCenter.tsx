import { useState } from "react";
import { User, Eye, EyeOff, ArrowLeft } from "lucide-react";

export function MobileLoginCenter() {
  const [step, setStep] = useState<"username" | "password">("username");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-[390px] min-h-[844px] bg-white overflow-hidden rounded-[40px] shadow-2xl border border-gray-200 flex flex-col relative">

        {/* 상단 초록 배경 헤더 — 가운데 정렬 */}
        <div className="bg-[#f0f7f0] px-6 pt-16 pb-10 flex flex-col items-center gap-8">
          {/* KPetro CI */}
          <img
            src="/__mockup/images/kpetro-ci.png"
            alt="한국석유관리원"
            className="h-14 object-contain"
          />

          {/* 앱 아이콘 + 제목 */}
          <div className="flex flex-col items-center gap-3 text-center">
            <img
              src="/__mockup/images/app-icon.jpeg"
              alt="앱 아이콘"
              className="w-16 h-16 rounded-xl shadow-sm"
            />
            <h1 className="text-xl font-bold text-gray-800 leading-snug">
              유가 이상징후 탐지 시스템
            </h1>
          </div>
        </div>

        {/* 흰색 카드 */}
        <div className="flex-1 bg-white rounded-t-3xl -mt-4 px-6 pt-8 pb-8 flex flex-col">

          {step === "username" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">로그인</h2>
                <p className="text-sm text-gray-500 mt-1">아이디(ID)를 입력하세요</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">아이디(ID)</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="아이디(ID)"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full h-11 pl-10 pr-3 rounded-md border border-green-600 text-sm outline-none focus:ring-2 focus:ring-green-600 bg-white text-gray-900 placeholder-gray-400"
                    />
                  </div>
                </div>
                <button
                  onClick={() => username.trim() && setStep("password")}
                  className="w-full h-12 rounded-md bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors"
                >
                  다음
                </button>
              </div>
            </>
          )}

          {step === "password" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">비밀번호 입력</h2>
                <p className="text-sm text-green-600 font-medium mt-1">{username || "kito86"}</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">비밀번호</label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      placeholder="비밀번호를 입력하세요"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-11 pl-3 pr-10 rounded-md border border-green-600 text-sm outline-none focus:ring-2 focus:ring-green-600 bg-white text-gray-900 placeholder-gray-400"
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button className="w-full h-12 rounded-md bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors">
                  로그인
                </button>
                <button onClick={() => setStep("username")}
                  className="w-full flex items-center justify-center gap-1 text-sm text-gray-500 py-2">
                  <ArrowLeft className="w-4 h-4" /> 아이디 변경
                </button>
              </div>
            </>
          )}

          <div className="mt-auto pt-8 text-center">
            <p className="text-xs text-gray-400">dev.kito86</p>
          </div>
        </div>
      </div>
    </div>
  );
}
