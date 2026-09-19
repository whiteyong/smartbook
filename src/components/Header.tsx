import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  Plus,
  AlertTriangle,
  Wallet,
} from 'lucide-react';
import { Account, LedgerTab } from '../types';

interface HeaderProps {
  currentTab?: LedgerTab;
  title: string;
  description?: string;
  selectedMonth: string; // YYYY-MM
  onMonthChange: (month: string) => void;
  accounts: Account[];
  selectedAccountId: string;
  onSelectAccountId: (accId: string) => void;
  needsAttentionCount: number;
  onOpenNeedsAttention: () => void;
  onOpenQuickAdd: () => void;
  onOpenUpload: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  title,
  description,
  selectedMonth,
  onMonthChange,
  accounts,
  selectedAccountId,
  onSelectAccountId,
  needsAttentionCount,
  onOpenNeedsAttention,
  onOpenQuickAdd,
  onOpenUpload,
}) => {
  const hideTopControls =
    currentTab === 'accounts' ||
    currentTab === 'rules' ||
    currentTab === 'upload';

  const handlePrevMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const d = new Date(year, month - 2, 1);
    const prev = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    onMonthChange(prev);
  };

  const handleNextMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const d = new Date(year, month, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    onMonthChange(next);
  };

  return (
    <header className="min-h-16 border-b border-slate-200 bg-white px-6 py-2.5 flex items-center justify-between sticky top-0 z-20 shadow-2xs">
      {/* Title */}
      <div className="py-0.5">
        <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
          {title}
        </h2>
        {description ? (
          <p className="text-xs text-slate-500 mt-1 whitespace-pre-line leading-relaxed hidden sm:block">
            {description}
          </p>
        ) : null}
      </div>

      {/* Center Month Selector & Account Filter */}
      {!hideTopControls && (
        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center gap-3">
          {/* Account Selector (Only in Dashboard & Transactions) */}
          {currentTab !== 'budget' && (
            <div className="relative">
              <select
                value={selectedAccountId}
                onChange={(e) => onSelectAccountId(e.target.value)}
                className="text-xs font-semibold bg-slate-50 border border-slate-300 text-slate-800 rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 appearance-none cursor-pointer"
              >
                <option value="all">전체 계좌 통합</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.alias} ({acc.bankName})
                  </option>
                ))}
              </select>
              <Wallet className="h-3.5 w-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {/* Month Selector */}
          <div className="flex items-center bg-slate-100/90 border border-slate-200/80 rounded-lg p-0.5">
            <button
              onClick={handlePrevMonth}
              className="p-1 hover:bg-white hover:shadow-xs rounded-md text-slate-600 transition cursor-pointer"
              title="이전 달"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="px-3 text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <img src="/icons/10_calendar_today.svg" alt="달력" className="h-3.5 w-3.5 opacity-60" />
              <span>{selectedMonth.replace('-', '년 ')}월</span>
            </div>
            <button
              onClick={handleNextMonth}
              className="p-1 hover:bg-white hover:shadow-xs rounded-md text-slate-600 transition cursor-pointer"
              title="다음 달"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Right Side Actions */}
      <div className="flex items-center gap-2 ml-auto">
        {!hideTopControls && currentTab !== 'budget' && (
          <>
            {needsAttentionCount > 0 && (
              <button
                onClick={onOpenNeedsAttention}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition shadow-2xs cursor-pointer"
                title="확인 필요 거래 보기"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                <span>확인 필요 {needsAttentionCount}건</span>
              </button>
            )}

            <button
              onClick={onOpenUpload}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition shadow-2xs cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>엑셀 업로드</span>
            </button>

            <button
              onClick={onOpenQuickAdd}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition shadow-2xs cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>수기 등록</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
};

