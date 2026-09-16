import React from 'react';
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
  UserCheck,
} from 'lucide-react';
import { Account } from '../types';
import { formatKRW } from '../utils/formatters';

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
    subLabel: '현금흐름 · 수지 요약',
    icon: LayoutDashboard,
  },
  {
    id: 'upload',
    label: '은행 엑셀 업로드',
    subLabel: '열 매핑 · 중복/이체 감지',
    icon: Upload,
  },
  {
    id: 'transactions',
    label: '거래 내역 관리',
    subLabel: '상세 조회 · 거래 분할',
    icon: Receipt,
  },
  {
    id: 'rules',
    label: '자동 분류 규칙',
    subLabel: '우선순위 엔진 · 재적용',
    icon: Sliders,
  },
  {
    id: 'budget',
    label: '봉투 분리형 예산',
    subLabel: '통장별 예산 상한 통제',
    icon: Wallet,
  },
  {
    id: 'accounts',
    label: '계좌 및 잔액 관리',
    subLabel: '수기 등록 · 1원 대조',
    icon: Building2,
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  accounts,
  needsAttentionCount,
}) => {
  // GNB 보유 자산 합계 전용 금액 숨기기 상태
  const [hideGnbTotalAssets, setHideGnbTotalAssets] = React.useState<boolean>(false);

  // Compute total liquid assets from accounts
  const totalAssets = accounts.reduce(
    (sum, acc) => sum + (acc.currentBalance ?? acc.initialBalance ?? 0),
    0
  );

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
              <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                가정용 가계부
                <span className="text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded-md">
                  PC 우선
                </span>
              </h1>
              <p className="text-[11px] text-slate-400 mt-0.5">스크래핑 없이 엑셀로 종결</p>
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
              className="p-1 hover:text-white rounded text-slate-400 transition"
              title={hideGnbTotalAssets ? '보유 자산 금액 보이기' : '보유 자산 금액 숨기기'}
              aria-label={hideGnbTotalAssets ? '보유 자산 금액 보이기' : '보유 자산 금액 숨기기'}
            >
              {hideGnbTotalAssets ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="mt-1.5 text-lg font-bold text-white tracking-tight">
            {formatKRW(totalAssets, hideGnbTotalAssets)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
            <span>{accounts.length}개 통장 합산</span>
            <span className="text-emerald-400 font-medium">1원 단위 무결성</span>
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
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
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

      {/* User & Security Footer */}
      <div className="p-3.5 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold">
              <UserCheck className="h-3.5 w-3.5 text-indigo-400" />
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-slate-300">가계 관리자</div>
              <div className="text-[10px] text-slate-500">로컬 암호화 · 금융 보안</div>
            </div>
          </div>
          <span
            className="h-2 w-2 rounded-full bg-emerald-400 shadow-xs shadow-emerald-400/50"
            title="데이터 안전 보관 중"
          ></span>
        </div>
      </div>
    </aside>
  );
};
