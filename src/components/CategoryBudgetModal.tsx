import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  PieChart,
  Tag,
  Coins,
  ArrowRightLeft,
  Check,
  AlertCircle,
  TrendingDown,
  Sparkles,
} from 'lucide-react';
import { Budget, Transaction } from '../types';
import { CATEGORY_TREE } from '../data/initialLedgerData';
import { formatKRW } from '../utils/formatters';

interface CategoryBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMonth: string;
  onSave: (budget: Omit<Budget, 'id'>) => Promise<any> | void;
  onUpdate?: (id: string, updates: Partial<Budget>) => Promise<any> | void;
  editingBudget?: Budget | null;
  existingBudgets: Budget[];
  transactions: Transaction[];
  hideAmounts?: boolean;
}

const QUICK_AMOUNTS = [
  { label: '+5만', value: 50000 },
  { label: '+10만', value: 100000 },
  { label: '+30만', value: 300000 },
  { label: '+50만', value: 500000 },
  { label: '+100만', value: 1000000 },
];

export const CategoryBudgetModal: React.FC<CategoryBudgetModalProps> = ({
  isOpen,
  onClose,
  selectedMonth,
  onSave,
  onUpdate,
  editingBudget,
  existingBudgets,
  transactions,
  hideAmounts = false,
}) => {
  // Available expense category groups from CATEGORY_TREE (excluding income / transfer)
  const expenseCategoryGroups = useMemo(() => {
    return CATEGORY_TREE.filter(
      (group) => group.group !== '수입' && group.group !== '이체/기타'
    );
  }, []);

  // Form states
  const [selectedGroup, setSelectedGroup] = useState<string>(
    expenseCategoryGroups[0]?.group || '식비'
  );
  const [targetCategory, setTargetCategory] = useState<string>('식비 전체');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customCategoryName, setCustomCategoryName] = useState<string>('');
  const [amount, setAmount] = useState<number>(300000);
  const [rollover, setRollover] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize or reset form when modal opens or editingBudget changes
  useEffect(() => {
    if (!isOpen) return;

    if (editingBudget) {
      const isCustom = !expenseCategoryGroups.some((grp) =>
        grp.items.includes(editingBudget.targetName) ||
        `${grp.group} 전체` === editingBudget.targetName
      );

      setIsCustomMode(isCustom);
      if (isCustom) {
        setCustomCategoryName(editingBudget.targetName);
      } else {
        const foundGroup = expenseCategoryGroups.find((grp) =>
          grp.items.includes(editingBudget.targetName) ||
          `${grp.group} 전체` === editingBudget.targetName
        );
        if (foundGroup) {
          setSelectedGroup(foundGroup.group);
        }
        setTargetCategory(editingBudget.targetName);
      }

      setAmount(editingBudget.amount);
      setRollover(!!editingBudget.rollover);
    } else {
      // Default new entry
      setIsCustomMode(false);
      setSelectedGroup(expenseCategoryGroups[0]?.group || '식비');
      setTargetCategory('식비 전체');
      setCustomCategoryName('');
      setAmount(300000);
      setRollover(false);
    }
    setErrorMsg(null);
  }, [isOpen, editingBudget, expenseCategoryGroups]);

  // Current category name determined by mode
  const currentCategoryName = useMemo(() => {
    if (isCustomMode) {
      return customCategoryName.trim();
    }
    return targetCategory.trim();
  }, [isCustomMode, customCategoryName, targetCategory]);

  // Calculate this month's actual spent for the selected category to provide context
  const currentCategorySpent = useMemo(() => {
    if (!currentCategoryName) return 0;
    const baseCat = currentCategoryName.replace(/\s*\(전체\)|\s*전체$/, '').trim();

    return transactions
      .filter((t) => {
        if (!t.occurredAt.startsWith(selectedMonth) || t.type !== 'expense') return false;
        if (t.category === currentCategoryName) return true;
        if (t.category.startsWith(baseCat + ' >') || t.category === baseCat) return true;
        return false;
      })
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions, selectedMonth, currentCategoryName]);

  // Check for duplicate category budget in the same month
  const isDuplicate = useMemo(() => {
    if (!currentCategoryName) return false;
    return existingBudgets.some(
      (b) =>
        b.targetType === 'category' &&
        b.targetName.toLowerCase() === currentCategoryName.toLowerCase() &&
        b.id !== editingBudget?.id
    );
  }, [existingBudgets, currentCategoryName, editingBudget]);

  const handleGroupSelect = (groupName: string) => {
    setSelectedGroup(groupName);
    setIsCustomMode(false);
    setTargetCategory(`${groupName} 전체`);
    setErrorMsg(null);
  };

  const handleItemSelect = (item: string) => {
    setTargetCategory(item);
    setIsCustomMode(false);
    setErrorMsg(null);
  };

  const handleAddAmount = (addVal: number) => {
    setAmount((prev) => Math.max(0, (prev || 0) + addVal));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCategoryName) {
      setErrorMsg('카테고리를 선택하거나 입력해주세요.');
      return;
    }

    if (amount <= 0) {
      setErrorMsg('배정 예산 금액을 0원보다 크게 입력해주세요.');
      return;
    }

    if (isDuplicate) {
      setErrorMsg(`'${currentCategoryName}' 카테고리 예산이 이미 등록되어 있습니다.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      if (editingBudget && onUpdate) {
        await onUpdate(editingBudget.id, {
          targetName: currentCategoryName,
          targetId: currentCategoryName.replace(/\s*전체$/, ''),
          amount,
          rollover,
        });
      } else {
        await onSave({
          targetType: 'category',
          targetId: currentCategoryName.replace(/\s*전체$/, ''),
          targetName: currentCategoryName,
          month: selectedMonth,
          amount,
          rollover,
        });
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || '예산 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.18 }}
          className="relative bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden z-10 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                <PieChart className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {editingBudget ? '카테고리 예산 수정' : '카테고리 예산 추가'}
                </h3>
                <p className="text-xs text-slate-500">
                  특정 지출 항목의 월간 한도와 이월 여부를 설정합니다.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 1. Category Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-indigo-600" />
                  지출 카테고리 선택
                </label>
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomMode(false);
                      setTargetCategory(`${selectedGroup} 전체`);
                    }}
                    className={`px-2.5 py-1 rounded-md transition ${
                      !isCustomMode
                        ? 'bg-white font-bold text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    목록에서 선택
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomMode(true);
                    }}
                    className={`px-2.5 py-1 rounded-md transition ${
                      isCustomMode
                        ? 'bg-white font-bold text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    직접 입력
                  </button>
                </div>
              </div>

              {!isCustomMode ? (
                <div className="space-y-2.5">
                  {/* Category Groups Pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {expenseCategoryGroups.map((grp) => {
                      const isSelected = selectedGroup === grp.group;
                      return (
                        <button
                          key={grp.group}
                          type="button"
                          onClick={() => handleGroupSelect(grp.group)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                          }`}
                        >
                          {grp.group}
                        </button>
                      );
                    })}
                  </div>

                  {/* Subcategories list inside selected group */}
                  <div className="bg-slate-50/70 border border-slate-200/90 rounded-xl p-3">
                    <div className="text-[11px] font-medium text-slate-500 mb-2 flex items-center justify-between">
                      <span>세부 항목 또는 전체 범위 지정</span>
                      <span className="text-indigo-600 font-bold">
                        선택: {targetCategory}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {/* Entire Group Option */}
                      <button
                        type="button"
                        onClick={() => handleItemSelect(`${selectedGroup} 전체`)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                          targetCategory === `${selectedGroup} 전체`
                            ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                            : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <Sparkles className="w-3 h-3 text-indigo-500" />
                        {selectedGroup} 전체
                      </button>

                      {/* Items */}
                      {expenseCategoryGroups
                        .find((g) => g.group === selectedGroup)
                        ?.items.map((item) => {
                          const isItemSelected = targetCategory === item;
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() => handleItemSelect(item)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                                isItemSelected
                                  ? 'bg-indigo-600 text-white font-bold'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              {item.replace(`${selectedGroup} > `, '')}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    value={customCategoryName}
                    onChange={(e) => setCustomCategoryName(e.target.value)}
                    placeholder="예: 자기계발, 반려동물, 선물/경조사"
                    className="w-full text-xs px-3 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white"
                    autoFocus
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    자유롭게 관리하고 싶은 카테고리 이름을 입력하세요.
                  </p>
                </div>
              )}
            </div>

            {/* 2. Budget Amount */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-indigo-600" />
                  월 배정 예산 금액
                </label>
                {currentCategorySpent > 0 && (
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-rose-500" />
                    이번 달 현재 지출: <strong className="text-slate-800 font-semibold">{formatKRW(currentCategorySpent, hideAmounts)}</strong>
                  </span>
                )}
              </div>

              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  ₩
                </span>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={amount === 0 ? '' : amount}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full text-sm font-bold text-slate-900 pl-8 pr-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              {/* Quick Amount Buttons */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {QUICK_AMOUNTS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => handleAddAmount(q.value)}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition"
                  >
                    {q.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAmount(0)}
                  className="px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  초기화
                </button>
              </div>
            </div>

            {/* 3. Rollover Setting */}
            <div>
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
                이월(Rollover) 규칙 설정
              </label>

              <div className="grid grid-cols-2 gap-3">
                {/* Option 1: Monthly Reset */}
                <button
                  type="button"
                  onClick={() => setRollover(false)}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    !rollover
                      ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-900">매월 초기화</span>
                    {!rollover && (
                      <div className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    남은 잔액은 이월되지 않고 매월 새로운 예산으로 산뜻하게 시작합니다. (식비, 관리비 권장)
                  </p>
                </button>

                {/* Option 2: Rollover Remaining */}
                <button
                  type="button"
                  onClick={() => setRollover(true)}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    rollover
                      ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-900">잔액 다음 달 이월</span>
                    {rollover && (
                      <div className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    아껴 쓴 잔여 예산이 다음 달 예산에 합산되어 모아서 쓸 수 있습니다. (쇼핑, 문화/여가 권장)
                  </p>
                </button>
              </div>
            </div>
          </form>

          {/* Footer */}
          <div className="px-6 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition shadow-xs flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>저장 중...</span>
                </>
              ) : (
                <span>{editingBudget ? '수정 완료' : '예산 등록'}</span>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
