import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const AuthScreen: React.FC = () => {
  const { loginWithKakao, loginWithGoogle, loginWithNaver, isLoading, lastLoginProvider } = useAuth();
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
    <div className="min-h-screen relative overflow-hidden bg-[#eef5fc] flex items-center justify-center p-4 selection:bg-indigo-500 selection:text-white">
      {/* Soft luminous pastel gradient layers as in reference image */}
      <div
        className="absolute inset-0 bg-gradient-to-tr from-[#dbeafe] via-[#eef4fe] to-[#e0e7ff] pointer-events-none"
        aria-hidden="true"
      />
      {/* Soft Sky Blue / Pastel Cyan ambient glow on left */}
      <div
        className="absolute top-[-10%] left-[-10%] w-[650px] h-[650px] rounded-full bg-[#bfdbfe]/45 blur-[130px] pointer-events-none"
        aria-hidden="true"
      />
      {/* Soft Periwinkle / Lavender ambient glow on right */}
      <div
        className="absolute bottom-[-10%] right-[-10%] w-[650px] h-[650px] rounded-full bg-[#ddd6fe]/45 blur-[140px] pointer-events-none"
        aria-hidden="true"
      />
      {/* Center luminous soft white overlay */}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_70%_70%_at_50%_45%,rgba(255,255,255,0.75),rgba(238,245,252,0))] pointer-events-none"
        aria-hidden="true"
      />

      {/* Login Card */}
      <div className="relative z-10 bg-white rounded-3xl shadow-xl shadow-slate-300/40 border border-slate-100 max-w-md w-full overflow-hidden flex flex-col animate-in fade-in duration-200">
        {/* Header with Login-selection logo image */}
        <div className="px-8 pt-8 pb-3 text-center flex items-center justify-center">
          <img
            src="/Login-selection.png?v=3"
            alt="슬기로운 가계생활"
            className="h-20 max-w-[220px] w-auto object-contain select-none"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Body - Ordered strictly by User Priority: Kakao > Naver > Google */}
        <div className="px-8 pt-4 pb-8 space-y-3">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {errorMsg}
            </div>
          )}

          {/* 1. Kakao Login */}
          <button
            onClick={handleKakaoLogin}
            disabled={isLoading}
            className="w-full h-14 px-4 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 rounded-2xl flex items-center justify-between transition-all duration-150 cursor-pointer shadow-xs active:scale-[0.99] disabled:opacity-60 group text-left"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-[#FEE500] flex items-center justify-center text-black font-black text-base shrink-0 shadow-xs">
                K
              </div>
              <span className="text-[15px] font-bold text-slate-900 group-hover:text-black">
                카카오
              </span>
            </div>
            {lastLoginProvider === 'kakao' && (
              <span className="text-xs text-slate-400 font-medium">
                최근
              </span>
            )}
          </button>

          {/* 2. Naver Login */}
          <button
            onClick={handleNaverLogin}
            disabled={isLoading}
            className="w-full h-14 px-4 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 rounded-2xl flex items-center justify-between transition-all duration-150 cursor-pointer shadow-xs active:scale-[0.99] disabled:opacity-60 group text-left"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-[#03C75A] flex items-center justify-center text-white font-black text-base shrink-0 shadow-xs">
                N
              </div>
              <span className="text-[15px] font-bold text-slate-900 group-hover:text-black">
                네이버
              </span>
            </div>
            {lastLoginProvider === 'naver' && (
              <span className="text-xs text-slate-400 font-medium">
                최근
              </span>
            )}
          </button>

          {/* 3. Google Login */}
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full h-14 px-4 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 rounded-2xl flex items-center justify-between transition-all duration-150 cursor-pointer shadow-xs active:scale-[0.99] disabled:opacity-60 group text-left"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-[#f2f4f7] border border-slate-200/80 flex items-center justify-center text-[#4285F4] font-black text-base shrink-0 shadow-xs">
                G
              </div>
              <span className="text-[15px] font-bold text-slate-900 group-hover:text-black">
                Google
              </span>
            </div>
            {lastLoginProvider === 'google' && (
              <span className="text-xs text-slate-400 font-medium">
                최근
              </span>
            )}
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
