import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Upload,
  Receipt,
  Sliders,
  Wallet,
  Building2,
  Shield,
  Eye,
  EyeOff,
  LogOut,
  Mail,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Account } from '../types';
import { formatKRW } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

export type LedgerTab = 'dashboard' | 'upload' | 'transactions' | 'rules' | 'budget' | 'accounts';

interface SidebarProps {
  currentTab: LedgerTab;
  onTabChange: (tab: LedgerTab) => void;
  accounts: Account[];
  hideAmounts?: boolean;
  onToggleHideAmounts?: () => void;
  needsAttentionCount: number;
}

interface MenuItem {
  id: LedgerTab;
  label: string;
  subLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'dashboard',
    label: '가계 대시보드',
    subLabel: '가계 상황 월간 요약',
    icon: LayoutDashboard,
  },
  {
    id: 'upload',
    label: '은행 엑셀 업로드',
    subLabel: '간편한 거래내역 추가',
    icon: Upload,
  },
  {
    id: 'transactions',
    label: '거래 내역 관리',
    subLabel: '거래 상세 조회 · 분류',
    icon: Receipt,
  },
  {
    id: 'rules',
    label: '자동 분류 규칙',
    subLabel: '규칙 맞춤 설정 · 자동 적용',
    icon: Sliders,
  },
  {
    id: 'budget',
    label: '예산 현황',
    subLabel: '목표 예산 · 지출 관리',
    icon: Wallet,
  },
  {
    id: 'accounts',
    label: '계좌 및 잔액 관리',
    subLabel: '계좌 등록 · 관리',
    icon: Building2,
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  accounts,
  needsAttentionCount,
}) => {
  const { user, logout } = useAuth();
  // GNB 보유 자산 합계 전용 금액 숨기기 상태
  const [hideGnbTotalAssets, setHideGnbTotalAssets] = useState<boolean>(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState<boolean>(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute total liquid assets from accounts
  const totalAssets = accounts.reduce(
    (sum, acc) => sum + (acc.currentBalance ?? acc.initialBalance ?? 0),
    0
  );

  const getProviderText = () => {
    if (!user) return '게스트 모드';
    switch (user.provider) {
      case 'kakao':
        return '카카오 계정 연동';
      case 'google':
        return 'Google 계정 연동';
      case 'naver':
        return '네이버 계정 연동';
      default:
        return '게스트 모드';
    }
  };

  const getProviderBadge = () => {
    if (!user) return null;
    switch (user.provider) {
      case 'kakao':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FEE500] text-[#191919]">
            카카오
          </span>
        );
      case 'google':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            Google
          </span>
        );
      case 'naver':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#03C75A] text-white">
            네이버
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-300">
            게스트
          </span>
        );
    }
  };

  const emailInitial = (user?.email || user?.displayName || 'U').charAt(0).toUpperCase();

  return (
    <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col justify-between border-r border-slate-800 shrink-0 h-screen sticky top-0 select-none">
      <div>
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-900/50">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">
                슬기로운 가계생활
              </h1>
              <p className="text-[11px] text-slate-400 mt-0.5">계좌 연동 없이 엑셀 파일로 깔끔하게</p>
            </div>
          </div>
        </div>

        {/* Total Assets Summary Card */}
        <div className="mx-3.5 my-3.5 p-3.5 rounded-xl bg-slate-800/70 border border-slate-700/60">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium flex items-center gap-1">
              <Shield className="h-3.5 w-3.5 text-emerald-400" />
              보유 자산 합계
            </span>
            <button
              onClick={() => setHideGnbTotalAssets((prev) => !prev)}
              className="p-1 hover:text-white rounded text-slate-400 transition cursor-pointer"
              title={hideGnbTotalAssets ? '보유 자산 금액 보이기' : '보유 자산 금액 숨기기'}
              aria-label={hideGnbTotalAssets ? '보유 자산 금액 보이기' : '보유 자산 금액 숨기기'}
            >
              {hideGnbTotalAssets ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="mt-1.5 text-lg font-bold text-white tracking-tight">
            {formatKRW(totalAssets, hideGnbTotalAssets)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            <span>{accounts.length}개 통장 합산</span>
          </div>
        </div>

        {/* Navigation Menus */}
        <nav className="px-2 space-y-1 mt-1">
          {MENU_ITEMS.map((item) => {
            const isActive = currentTab === item.id;
            const IconComponent = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-7 w-7 rounded-lg flex items-center justify-center transition-colors ${
                      isActive
                        ? 'bg-indigo-700/80 text-white'
                        : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'
                    }`}
                  >
                    <IconComponent className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <div className={isActive ? 'text-white font-bold' : 'text-slate-300'}>
                      {item.label}
                    </div>
                    <div className="text-[10px] text-slate-400 font-normal opacity-80">
                      {item.subLabel}
                    </div>
                  </div>
                </div>

                {/* Badges */}
                {item.id === 'dashboard' && needsAttentionCount > 0 && (
                  <span className="rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold px-1.5 py-0.5">
                    {needsAttentionCount}
                  </span>
                )}
                {item.id === 'upload' && (
                  <span className="rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-medium px-1.5 py-0.5">
                    빠름
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User & Security Footer (Clickable with Popover Menu) */}
      <div className="relative p-3.5 border-t border-slate-800 bg-slate-950/50" ref={userMenuRef}>
        {/* User Info & Logout Popover */}
        {isUserMenuOpen && (
          <div
            id="gnb-user-dropdown-popover"
            className="absolute bottom-full left-3 right-3 mb-2 bg-slate-800 rounded-xl shadow-2xl border border-slate-700/80 p-3.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
          >
            {/* Provider Badge Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-700/70">
              <span className="text-[11px] font-medium text-slate-400">로그인 계정</span>
              <div>{getProviderBadge()}</div>
            </div>

            {/* Logged in Email Info */}
            <div className="py-2.5 border-b border-slate-700/70 flex items-center gap-2 min-w-0">
              <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <div
                id="gnb-user-email-display"
                className="text-xs text-slate-200 font-normal truncate select-all"
                title={user?.email || ''}
              >
                {user?.email || '이메일 정보 없음'}
              </div>
            </div>

            {/* Logout Action Button */}
            <div className="pt-2">
              <button
                id="gnb-logout-button"
                onClick={async () => {
                  setIsUserMenuOpen(false);
                  await logout();
                }}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              >
                <LogOut className="h-3.5 w-3.5 text-rose-400" />
                <span>로그아웃</span>
              </button>
            </div>
          </div>
        )}

        {/* Clickable User Row Button in GNB */}
        <button
          id="gnb-user-profile-button"
          type="button"
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className={`w-full flex items-center justify-between p-1.5 -m-1.5 rounded-xl transition text-left cursor-pointer ${
            isUserMenuOpen
              ? 'bg-slate-800 ring-1 ring-slate-700'
              : 'hover:bg-slate-800/80'
          }`}
          title={user?.email || '계정 정보 및 로그아웃'}
          aria-expanded={isUserMenuOpen}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-7 w-7 rounded-full bg-indigo-600 border border-indigo-400/30 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs">
              {emailInitial}
            </div>
            <div className="text-left min-w-0">
              <div className="text-xs font-semibold text-slate-200 truncate" title={user?.email || ''}>
                {user?.email || '로그인 계정'}
              </div>
              <div className="text-[10px] text-slate-400 truncate">{getProviderText()}</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 pl-1 text-slate-400">
            {isUserMenuOpen ? (
              <ChevronDown className="h-4 w-4 text-slate-300" />
            ) : (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </button>
      </div>
    </aside>
  );
};
