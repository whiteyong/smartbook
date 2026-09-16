import React, { useState, useEffect } from 'react';
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
  Trash2,
  Check,
  X,
} from 'lucide-react';
import { Account, Budget, Transaction } from '../types';
import { CATEGORY_TREE } from '../data/initialLedgerData';
import { formatKRW } from '../utils/formatters';
import { CategoryBudgetModal } from './CategoryBudgetModal';

interface S5BudgetProps {
  selectedMonth: string;
  accounts: Account[];
  budgets: Budget[];
  transactions: Transaction[];
  hideAmounts: boolean;
  onUpdateBudget: (id: string, updates: Partial<Budget>) => Promise<void>;
  onAddBudget: (budget: Omit<Budget, 'id'>) => Promise<any>;
  onDeleteBudget?: (id: string) => Promise<void>;
}

export const S5Budget: React.FC<S5BudgetProps> = ({
  selectedMonth,
  accounts,
  budgets,
  transactions,
  hideAmounts,
  onUpdateBudget,
  onAddBudget,
  onDeleteBudget,
}) => {
  // Account Budget Inline Edit States (keyed by Account ID for all accounts including new & unset)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editAmountStr, setEditAmountStr] = useState<string>('');
  const [isSavingAccount, setIsSavingAccount] = useState<boolean>(false);
  // Local optimistic overrides so user sees amount update instantly without waiting
  const [localBudgetOverrides, setLocalBudgetOverrides] = useState<Record<string, number>>({});

  useEffect(() => {
    setLocalBudgetOverrides({});
  }, [selectedMonth]);

  // Category Budget Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [editingCategoryBudget, setEditingCategoryBudget] = useState<Budget | null>(null);

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
    const rawBudgetAmount = existing ? existing.amount : 0;
    const budgetAmount = localBudgetOverrides[acc.id] !== undefined ? localBudgetOverrides[acc.id] : rawBudgetAmount;

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

  // 1 & 2. 연필 아이콘 클릭 시 입력 필드 열기 (신규 계좌/미설정 계좌 상시 지원)
  const startEditAccount = (accId: string, currentAmount: number) => {
    setEditingAccountId(accId);
    setEditAmountStr(currentAmount > 0 ? String(currentAmount) : '');
  };

  const cancelAccountEdit = () => {
    setEditingAccountId(null);
    setEditAmountStr('');
  };

  // 3 & 4. 예산 금액 저장 로직 (키보드 Enter 누르면 즉시 저장, 숫자만 입력 가능)
  const saveAccountBudget = async (row: (typeof accountBudgetRows)[0]) => {
    const cleanDigits = editAmountStr.replace(/[^0-9]/g, '');
    const amountNumber = cleanDigits === '' ? 0 : parseInt(cleanDigits, 10);

    if (isNaN(amountNumber) || amountNumber < 0) {
      setEditingAccountId(null);
      return;
    }

    // 1. UI 즉시 반영 (딜레이 없는 즉시 업데이트)
    setLocalBudgetOverrides((prev) => ({ ...prev, [row.account.id]: amountNumber }));
    setEditingAccountId(null);
    setEditAmountStr('');

    // 2. 백엔드/스토리지 영구 저장
    setIsSavingAccount(true);
    try {
      const currentBudget =
        budgets.find(
          (b) => b.targetType === 'account' && b.targetId === row.account.id && b.month === selectedMonth
        ) || row.budget;

      if (currentBudget) {
        await onUpdateBudget(currentBudget.id, { amount: amountNumber });
      } else {
        await onAddBudget({
          targetType: 'account',
          targetId: row.account.id,
          targetName: row.account.alias,
          month: selectedMonth,
          amount: amountNumber,
          rollover: false,
        });
      }
    } catch (err) {
      console.error('Failed to save account budget:', err);
    } finally {
      setIsSavingAccount(false);
    }
  };

  // 3. 키보드 Enter 누르면 즉시 저장 / Esc 누르면 취소
  // 4. 텍스트나 기호 입력 불가 (0-9 이외의 키 입력 차단)
  const handleAccountInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: (typeof accountBudgetRows)[0]
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveAccountBudget(row);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelAccountEdit();
      return;
    }

    const allowedKeys = [
      'Backspace',
      'Delete',
      'Tab',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'Enter',
      'Escape',
    ];
    if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    // 모바일 가상 키보드 및 IME 입력 호환
    if (e.key === 'Unidentified' || e.key === 'Process') {
      return;
    }

    // 숫자(0-9) 이외의 텍스트, 한글, 기호(-, +, ., e 등) 일체 입력 차단
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handleAccountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 붙여넣기나 모바일 IME를 통해 기호/텍스트가 유입되더라도 숫자만 추출
    const cleanDigits = e.target.value.replace(/[^0-9]/g, '');
    setEditAmountStr(cleanDigits);
  };

  const handleAccountInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const cleanDigits = pastedText.replace(/[^0-9]/g, '');
    setEditAmountStr((prev) => (cleanDigits ? prev + cleanDigits : prev));
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
          계좌별 예산 현황
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
                {/* 1. 신규 계좌 및 미설정 계좌 연필 아이콘 상시 제공 */}
                <button
                  type="button"
                  onClick={() => {
                    if (editingAccountId === row.account.id) {
                      cancelAccountEdit();
                    } else {
                      startEditAccount(row.account.id, row.budgetAmount);
                    }
                  }}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    editingAccountId === row.account.id
                      ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-300'
                      : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'
                  }`}
                  title={row.budgetAmount > 0 ? '예산 금액 수정' : '신규 예산 설정'}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Amount Editor or Display */}
              <div>
                {/* 2. 연필 아이콘 클릭하면 입력 필드 열림 */}
                {editingAccountId === row.account.id ? (
                  <div className="space-y-1.5 mt-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                      <span>월 배정 예산 입력</span>
                      <span className="text-indigo-600 font-semibold text-[10px]">Enter 저장 / Esc 취소</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={editAmountStr}
                          onChange={handleAccountInputChange}
                          onKeyDown={(e) => handleAccountInputKeyDown(e, row)}
                          onPaste={handleAccountInputPaste}
                          placeholder="0"
                          autoFocus
                          disabled={isSavingAccount}
                          className="w-full text-sm font-bold text-slate-900 border-2 border-indigo-500 rounded-lg px-2.5 py-1.5 pr-6 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                          원
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => saveAccountBudget(row)}
                        disabled={isSavingAccount}
                        className="p-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg transition shadow-2xs shrink-0 cursor-pointer disabled:opacity-50"
                        title="즉시 저장 (Enter)"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelAccountEdit}
                        disabled={isSavingAccount}
                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition shrink-0 cursor-pointer"
                        title="취소 (Esc)"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {editAmountStr !== '' && (
                      <div className="text-[11px] font-semibold text-indigo-600">
                        {formatKRW(parseInt(editAmountStr, 10) || 0, false)}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-slate-400">월 배정 예산</div>
                    <div
                      onClick={() => startEditAccount(row.account.id, row.budgetAmount)}
                      className="text-lg font-bold text-slate-900 hover:text-indigo-600 cursor-pointer flex items-center gap-1.5 transition group"
                      title="클릭하여 예산 설정/수정"
                    >
                      {row.budgetAmount > 0 ? (
                        <span>{formatKRW(row.budgetAmount, hideAmounts)}</span>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400 bg-slate-100 group-hover:bg-indigo-50 group-hover:text-indigo-600 px-2 py-0.5 rounded transition">
                          미설정 (클릭하여 설정)
                        </span>
                      )}
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
              ) : null}
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
              setEditingCategoryBudget(null);
              setIsCategoryModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition shadow-2xs cursor-pointer"
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
                <th className="py-2.5 px-4 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {categoryBudgets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    등록된 카테고리별 예산이 없습니다. '카테고리 예산 추가' 버튼을 눌러 설정해보세요.
                  </td>
                </tr>
              ) : (
                categoryBudgets.map((bg) => {
                  const isMatchingCategory = (txCat: string, targetName: string, targetId?: string) => {
                    if (!txCat) return false;
                    if (txCat === targetName) return true;
                    if (targetId && (txCat === targetId || txCat.startsWith(targetId + ' >') || txCat.startsWith(targetId))) return true;
                    const baseName = targetName.replace(/\s*\(전체\)|\s*전체$/, '').trim();
                    if (txCat.startsWith(baseName + ' >') || txCat === baseName) return true;
                    return false;
                  };

                  const spent = monthExpenseTxs
                    .filter((t) => isMatchingCategory(t.category, bg.targetName, bg.targetId))
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
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                            bg.rollover
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {bg.rollover ? '잔액 이월' : '매월 초기화'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryBudget(bg);
                              setIsCategoryModalOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                            title="예산 수정"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          {onDeleteBudget && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (window.confirm(`'${bg.targetName}' 카테고리 예산을 삭제하시겠습니까?`)) {
                                  await onDeleteBudget(bg.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                              title="예산 삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Budget Modal */}
      <CategoryBudgetModal
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false);
          setEditingCategoryBudget(null);
        }}
        selectedMonth={selectedMonth}
        onSave={onAddBudget}
        onUpdate={onUpdateBudget}
        editingBudget={editingCategoryBudget}
        existingBudgets={budgets}
        transactions={transactions}
        hideAmounts={hideAmounts}
      />
    </div>
  );
};
