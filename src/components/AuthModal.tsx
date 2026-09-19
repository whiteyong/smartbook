import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const AuthScreen: React.FC = () => {
  const { loginWithKakao, loginWithGoogle, loginWithNaver, isLoading } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleKakaoLogin = async () => {
    setErrorMsg(null);
    try {
      await loginWithKakao();
    } catch (err: any) {
      setErrorMsg(err?.message || '카카오 로그인 처리 중 오류가 발생했습니다.');
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Google 로그인 처리 중 오류가 발생했습니다.');
    }
  };

  const handleNaverLogin = async () => {
    setErrorMsg(null);
    try {
      await loginWithNaver();
    } catch (err: any) {
      setErrorMsg(err?.message || '네이버 로그인 처리 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden flex flex-col animate-in fade-in duration-200">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center border-b border-slate-100">
          <div className="h-12 w-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mx-auto mb-3 shadow-md">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">가계부 서비스 로그인</h1>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            안전한 데이터 관리와 클라우드 동기화를 위해<br />
            소셜 계정으로 로그인해 주세요.
          </p>
        </div>

        {/* Body - Ordered strictly by User Priority: Kakao > Google > Naver */}
        <div className="p-8 space-y-3">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
              {errorMsg}
            </div>
          )}

          {/* 1. Kakao Login (우선순위 1) */}
          <button
            onClick={handleKakaoLogin}
            disabled={isLoading}
            className="w-full h-12 px-4 rounded-xl flex items-center justify-center gap-3 font-bold text-sm transition duration-150 cursor-pointer shadow-xs active:scale-[0.99] disabled:opacity-60 bg-[#FEE500] text-[#191919] hover:bg-[#FADA0A]"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.8 6.6l-1.2 4.4c-.1.4.3.7.6.5l5.2-3.4c.2 0 .4.1.6.1 5.5 0 10-3.6 10-8s-4.5-8-10-8z" />
            </svg>
            <span>카카오 로그인</span>
          </button>

          {/* 2. Google Login (우선순위 2) */}
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full h-12 px-4 rounded-xl flex items-center justify-center gap-3 font-bold text-sm transition duration-150 cursor-pointer border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 shadow-xs active:scale-[0.99] disabled:opacity-60"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.88c2.27-2.09 3.66-5.17 3.66-9.09z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.1C3.26 21.4 7.34 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.32a7.18 7.18 0 0 1 0-4.64v-3.1H1.25a11.96 11.96 0 0 0 0 10.84l4.03-3.1z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.6 1.25 6.58l4.03 3.1c.95-2.83 3.6-4.93 6.72-4.93z"
              />
            </svg>
            <span>Google 로그인</span>
          </button>

          {/* 3. Naver Login (우선순위 3) */}
          <button
            onClick={handleNaverLogin}
            disabled={isLoading}
            className="w-full h-12 px-4 rounded-xl flex items-center justify-center gap-3 font-bold text-sm transition duration-150 cursor-pointer shadow-xs active:scale-[0.99] disabled:opacity-60 bg-[#03C75A] text-white hover:bg-[#02b350]"
          >
            <svg className="h-4 w-4 shrink-0 fill-white" viewBox="0 0 24 24">
              <path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z" />
            </svg>
            <span>네이버 로그인</span>
          </button>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-400">
          개인 금융 데이터는 철저히 암호화되어 보호됩니다.
        </div>
      </div>
    </div>
  );
};
