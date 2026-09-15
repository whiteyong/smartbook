import React, { useState } from 'react';
import {
  Wallet,
  TrendingDown,
  Copy,
  Plus,
  Zap,
  AlertCircle,
  CheckCircle2,
  Edit2,
  Save,
} from 'lucide-react';
import { Account, Budget, Transaction } from '../types';
import { CATEGORY_TREE } from '../data/initialLedgerData';
import { formatKRW } from '../utils/formatters';

interface S5BudgetProps {
  selectedMonth: string;
  accounts: Account[];
  budgets: Budget[];
  transactions: Transaction[];
  hideAmounts: boolean;
  onUpdateBudget: (id: string, updates: Partial<Budget>) => Promise<void>;
  onAddBudget: (budget: Omit<Budget, 'id'>) => Promise<any>;
}

export const S5Budget: React.FC<S5BudgetProps> = ({
  selectedMonth,
  accounts,
  budgets,
  transactions,
  hideAmounts,
  onUpdateBudget,
  onAddBudget,
}) => {
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);

  // Month transactions (이체 제외 지출만)
  const monthExpenseTxs = transactions.filter(
    (t) => t.occurredAt.startsWith(selectedMonth) && t.type === 'expense'
  );

  const [currYear, currMonthNum] = selectedMonth.split('-').map(Number);
  const today = new Date().getDate();
  const daysInMonth = new Date(currYear, currMonthNum, 0).getDate();
  const monthPaceExpected = Math.round((today / daysInMonth) * 100);

  // Account Budgets
  const accountBudgetRows = accounts.map((acc) => {
    const existing = budgets.find(
      (b) => b.targetType === 'account' && b.targetId === acc.id && b.month === selectedMonth
    );
    const budgetAmount = existing ? existing.amount : 0;

    // Actual spending (이체 제외 출금 합계)
    const spent = monthExpenseTxs
      .filter((t) => t.accountId === acc.id)
      .reduce((sum, t) => sum + t.amount, 0);

    const percent = budgetAmount > 0 ? Math.round((spent / budgetAmount) * 100) : 0;
    const remaining = budgetAmount - spent;

    return {
      budget: existing,
      account: acc,
      budgetAmount,
      spent,
      percent,
      remaining,
      isPaceWarning: percent > monthPaceExpected + 10 && percent <= 100,
      isOver: percent > 100,
    };
  });

  // Category Budgets
  const categoryBudgets = budgets.filter(
    (b) => b.targetType === 'category' && b.month === selectedMonth
  );

  // Handle Copy from Previous Month
  const handleCopyPrevMonth = async () => {
    const prevD = new Date(currYear, currMonthNum - 2, 1);
    const prevMonthStr = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
    const prevBudgets = budgets.filter((b) => b.month === prevMonthStr);

    if (prevBudgets.length === 0) {
      alert(`전월(${prevMonthStr})에 설정된 예산 데이터가 없습니다.`);
      return;
    }

    for (const pb of prevBudgets) {
      const already = budgets.find(
        (b) => b.targetType === pb.targetType && b.targetId === pb.targetId && b.month === selectedMonth
      );
      if (!already) {
        await onAddBudget({
          targetType: pb.targetType,
          targetId: pb.targetId,
          targetName: pb.targetName,
          month: selectedMonth,
          amount: pb.amount,
          rollover: pb.rollover,
        });
      }
    }
    alert(`전월 예산 ${prevBudgets.length}개 항목이 ${selectedMonth}월로 복사되었습니다.`);
  };

  const startEdit = (bg: Budget) => {
    setEditingBudgetId(bg.id);
    setEditAmount(bg.amount);
  };

  const saveEdit = async (bId: string) => {
    await onUpdateBudget(bId, { amount: editAmount });
    setEditingBudgetId(null);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 pb-20">
      {/* Top Banner & Copy Action */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Wallet className="h-5 w-5 text-indigo-600" />
            {selectedMonth.replace('-', '년 ')}월 통장 분리형 봉투 예산
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            "예산은 숫자가 아니라 통장 잔액으로 지킨다." 이달 경과일({today}일/{daysInMonth}일, {monthPaceExpected}%) 대비 지출 속도를 추적합니다.
          </p>
        </div>

        <button
          onClick={handleCopyPrevMonth}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition shadow-2xs"
        >
          <Copy className="h-3.5 w-3.5" />
          <span>전월 예산 그대로 복사</span>
        </button>
      </div>

      {/* Row 1: 4 Account Envelope Cards */}
      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
          통장 봉투별 예산 현황 (물리적 예산)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {accountBudgetRows.map((row) => (
            <div
              key={row.account.id}
              className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.account.color }}></span>
                  {row.account.alias}
                </span>
                {row.budget && (
                  <button
                    onClick={() => startEdit(row.budget!)}
                    className="text-slate-400 hover:text-slate-700 p-1"
                    title="예산 금액 수정"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Amount Editor or Display */}
              <div>
                {editingBudgetId === row.budget?.id ? (
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      value={editAmount}
                      onChange={(e) => setEditAmount(Number(e.target.value))}
                      className="w-full text-xs font-bold border border-indigo-400 rounded px-2 py-1"
                    />
                    <button
                      onClick={() => saveEdit(row.budget!.id)}
                      className="p-1 bg-indigo-600 text-white rounded"
                    >
                      <Save className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-slate-400">월 배정 예산</div>
                    <div className="text-lg font-bold text-slate-900">
                      {row.budgetAmount > 0 ? formatKRW(row.budgetAmount, hideAmounts) : '미설정'}
                    </div>
                  </>
                )}
              </div>

              {/* Spending vs Budget */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">실제 출금(지출)</span>
                <span className="font-bold text-slate-800">{formatKRW(row.spent, hideAmounts)}</span>
              </div>

              {/* Progress Bar */}
              <div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      row.isOver ? 'bg-rose-500' : row.isPaceWarning ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(row.percent, 100)}%` }}
                  ></div>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700">{row.percent}%</span>
                  <span
                    className={`font-semibold ${
                      row.remaining < 0 ? 'text-rose-600' : 'text-slate-500'
                    }`}
                  >
                    {row.remaining < 0 ? `초과 ${formatKRW(Math.abs(row.remaining), hideAmounts)}` : `잔여 ${formatKRW(row.remaining, hideAmounts)}`}
                  </span>
                </div>
              </div>

              {/* Warnings */}
              {row.isOver ? (
                <div className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded-md font-bold flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>예산 초과 지출 발생</span>
                </div>
              ) : row.isPaceWarning ? (
                <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md font-semibold flex items-center gap-1">
                  <Zap className="h-3 w-3 shrink-0" />
                  <span>지출 페이스 주의 (월말 초과 예상)</span>
                </div>
              ) : (
                <div className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  <span>안정적인 지출 페이스</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Row 2: Category Budgets Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              카테고리별 예산 병행 설정 (상세 지출 관리)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              통장 구분과 무관하게 식비, 주거비, 대중교통 등 핵심 카테고리별 상한선을 별도로 지정할 수 있습니다.
            </p>
          </div>
          <button
            onClick={() => {
              const catName = prompt('추가할 카테고리명을 입력하세요 (예: 식비, 문화/여가):');
              const amountStr = prompt('월 배정 예산 금액(원):', '300000');
              if (catName && amountStr) {
                onAddBudget({
                  targetType: 'category',
                  targetId: catName.trim(),
                  targetName: catName.trim(),
                  month: selectedMonth,
                  amount: Number(amountStr),
                  rollover: false,
                });
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5" /> 카테고리 예산 추가
          </button>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">카테고리</th>
                <th className="py-2.5 px-4 text-right">배정 예산</th>
                <th className="py-2.5 px-4 text-right">실제 지출 실적</th>
                <th className="py-2.5 px-4 text-right">소진율 (%)</th>
                <th className="py-2.5 px-4 text-right">잔여액</th>
                <th className="py-2.5 px-4 text-center">이월 규칙</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {categoryBudgets.map((bg) => {
                const spent = monthExpenseTxs
                  .filter((t) => t.category.startsWith(bg.targetName))
                  .reduce((sum, t) => sum + t.amount, 0);
                const percent = bg.amount > 0 ? Math.round((spent / bg.amount) * 100) : 0;
                const rem = bg.amount - spent;

                return (
                  <tr key={bg.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-bold text-slate-900">{bg.targetName}</td>
                    <td className="py-3 px-4 text-right font-semibold">{formatKRW(bg.amount, hideAmounts)}</td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">{formatKRW(spent, hideAmounts)}</td>
                    <td className="py-3 px-4 text-right font-bold">
                      <span
                        className={`px-2 py-0.5 rounded ${
                          percent > 100
                            ? 'bg-rose-100 text-rose-800'
                            : percent > 85
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {percent}%
                      </span>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-bold ${
                        rem < 0 ? 'text-rose-600' : 'text-slate-700'
                      }`}
                    >
                      {formatKRW(rem, hideAmounts)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[11px] text-slate-500">
                        {bg.rollover ? '남은 잔액 이월' : '매월 초기화'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
