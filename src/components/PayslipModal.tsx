import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Plus, Trash2, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { Transaction, PayslipItem } from '../types';
import { formatKRW } from '../utils/formatters';
import { validatePayslip } from '../utils/payslipParser';

interface PayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction;
  initialItems?: PayslipItem[];
  attachedFileName?: string;
  attachmentUrl?: string;
  isDirectInputMode?: boolean;
  onSave: (items: PayslipItem[]) => Promise<void>;
}

export const PayslipModal: React.FC<PayslipModalProps> = ({
  isOpen,
  onClose,
  transaction,
  initialItems,
  attachedFileName,
  attachmentUrl,
  isDirectInputMode = false,
  onSave,
}) => {
  const [items, setItems] = useState<PayslipItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Esc key listener & auto focus
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const timer = setTimeout(() => {
      firstInputRef.current?.focus();
      firstInputRef.current?.select();
    }, 100);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, onClose]);

  // Initialize items when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (isDirectInputMode) {
      // 5-B 직접 입력 모드:
      // 공제 항목명을 미리 채워두고 금액만 비움 (0원)
      // 지급 합계의 초깃값은 통장 입금액으로 채움
      const defaultDirectItems: PayslipItem[] = [
        { type: 'payment', name: '기본급', amount: transaction.amount, standardCode: 'BASE_PAY' },
        { type: 'payment', name: '식대(비과세)', amount: 0, standardCode: 'MEAL' },
        { type: 'deduction', name: '국민연금', amount: 0, standardCode: 'PENSION' },
        { type: 'deduction', name: '건강보험 · 장기요양', amount: 0, standardCode: 'HEALTH' },
        { type: 'deduction', name: '고용보험', amount: 0, standardCode: 'EMPLOYMENT' },
        { type: 'deduction', name: '소득세 · 지방소득세', amount: 0, standardCode: 'INCOME_TAX' },
      ];
      setItems(defaultDirectItems);
    } else if (initialItems && initialItems.length > 0) {
      setItems(initialItems);
    } else if (transaction.payslip && transaction.payslip.length > 0) {
      setItems(transaction.payslip);
    } else {
      // 기본 초기화 (급여 기본급 + 4대보험/세금)
      const defaultItems: PayslipItem[] = [
        { type: 'payment', name: '기본급', amount: transaction.amount, standardCode: 'BASE_PAY' },
        { type: 'payment', name: '식대(비과세)', amount: 0, standardCode: 'MEAL' },
        { type: 'deduction', name: '국민연금', amount: 0, standardCode: 'PENSION' },
        { type: 'deduction', name: '건강보험 · 장기요양', amount: 0, standardCode: 'HEALTH' },
        { type: 'deduction', name: '고용보험', amount: 0, standardCode: 'EMPLOYMENT' },
        { type: 'deduction', name: '소득세 · 지방소득세', amount: 0, standardCode: 'INCOME_TAX' },
      ];
      setItems(defaultItems);
    }
  }, [isOpen, isDirectInputMode, initialItems, transaction]);

  // Validation calculation
  const validation = useMemo(() => {
    return validatePayslip(items, transaction.amount);
  }, [items, transaction.amount]);

  if (!isOpen) return null;

  const handleUpdateAmount = (index: number, newAmount: number) => {
    setItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, amount: Math.max(0, newAmount) } : it))
    );
  };

  const handleUpdateName = (index: number, newName: string) => {
    setItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, name: newName } : it))
    );
  };

  const handleDeleteItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddItem = (type: 'payment' | 'deduction') => {
    const newItem: PayslipItem = {
      type,
      name: type === 'payment' ? '기타 수당' : '기타 공제',
      standardCode: type === 'payment' ? 'OTHER_PAY' : 'OTHER_DEDUCT',
      amount: 0,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleSave = async () => {
    if (!validation.isMatched) return;
    setIsSaving(true);
    try {
      // 금액이 0인 항목은 저장 시 제외
      const nonZeroItems = items.filter((item) => item.amount > 0);
      await onSave(nonZeroItems);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const paymentItemsWithIdx = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === 'payment');

  const deductionItemsWithIdx = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === 'deduction');

  // 유효한 공제 항목 건수 (0원 초과)
  const validDeductionCount = deductionItemsWithIdx.filter(({ item }) => item.amount > 0).length;

  const displayFileName =
    attachedFileName || transaction.attachments?.[0]?.name || '2026-09_급여명세서.pdf';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payslip-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[680px] max-h-[92vh] flex flex-col overflow-hidden text-slate-800">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between bg-white">
          <div>
            <div className="text-xs text-slate-500 font-medium mb-1">
              {transaction.occurredAt.slice(0, 10)} · {transaction.counterparty || '회사'}
            </div>
            <h2 id="payslip-modal-title" className="text-xl font-bold text-slate-900 tracking-tight">
              급여명세서 항목
            </h2>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600 font-medium truncate max-w-[200px]" title={displayFileName}>
                {displayFileName}
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition ml-2"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {attachmentUrl ? (
              <a
                href={attachmentUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-slate-500 hover:text-indigo-600 hover:underline flex items-center gap-1"
              >
                <span>원본 보기</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (transaction.attachments?.[0]?.dataUrl) {
                    const win = window.open();
                    win?.document.write(`<iframe src="${transaction.attachments[0].dataUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                  }
                }}
                className="text-[11px] text-slate-500 hover:text-indigo-600 hover:underline"
              >
                원본 보기
              </button>
            )}
          </div>
        </div>

        {/* Body: 2 Columns (지급 / 공제) */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-2 gap-6 border-b border-slate-200 pb-5">
            {/* Column 1: 지급 */}
            <div className="flex flex-col justify-between pr-3 border-r border-slate-100">
              <div>
                <div className="text-xs font-bold text-slate-800 mb-3">지급</div>
                <div className="space-y-2">
                  {paymentItemsWithIdx.map(({ item, index }, pIdx) => (
                    <div key={index} className="flex items-center justify-between gap-2 group text-xs">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleUpdateName(index, e.target.value)}
                          className="font-medium text-slate-700 bg-transparent hover:bg-slate-50 focus:bg-slate-50 rounded px-1.5 py-1 w-full outline-none border border-transparent focus:border-indigo-400"
                        />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          ref={pIdx === 0 ? firstInputRef : undefined}
                          type="text"
                          inputMode="numeric"
                          value={item.amount === 0 ? '' : item.amount.toLocaleString()}
                          placeholder="0"
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            handleUpdateAmount(index, raw ? parseInt(raw, 10) : 0);
                          }}
                          className="w-24 text-right font-bold text-slate-900 bg-slate-50 hover:bg-white focus:bg-white rounded px-1.5 py-1 border border-slate-200 focus:border-indigo-600 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(index)}
                          aria-label={`${item.name} 삭제`}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 p-0.5 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleAddItem('payment')}
                  className="mt-3 text-[11px] font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1 py-1"
                >
                  <Plus className="h-3.5 w-3.5" /> 항목 추가
                </button>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-200 flex items-center justify-between text-sm font-bold text-slate-900">
                <span>지급 합계</span>
                <span>{formatKRW(validation.totalPayment).replace('₩', '')}</span>
              </div>
            </div>

            {/* Column 2: 공제 */}
            <div className="flex flex-col justify-between pl-1">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-800">공제</span>
                  <span className="text-[11px] text-slate-400">숫자를 눌러 수정</span>
                </div>
                <div className="space-y-2">
                  {deductionItemsWithIdx.map(({ item, index }) => (
                    <div key={index} className="flex items-center justify-between gap-2 group text-xs">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleUpdateName(index, e.target.value)}
                          className="font-medium text-slate-700 bg-transparent hover:bg-slate-50 focus:bg-slate-50 rounded px-1.5 py-1 w-full outline-none border border-transparent focus:border-indigo-400"
                        />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.amount === 0 ? '' : item.amount.toLocaleString()}
                          placeholder="0"
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            handleUpdateAmount(index, raw ? parseInt(raw, 10) : 0);
                          }}
                          className="w-24 text-right font-bold text-slate-900 bg-slate-50 hover:bg-white focus:bg-white rounded px-1.5 py-1 border border-slate-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-400 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(index)}
                          aria-label={`${item.name} 삭제`}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 p-0.5 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleAddItem('deduction')}
                  className="mt-3 text-[11px] font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1 py-1"
                >
                  <Plus className="h-3.5 w-3.5" /> 항목 추가
                </button>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-200 flex items-center justify-between text-sm font-bold text-slate-900">
                <span>공제 합계</span>
                <span>{formatKRW(validation.totalDeduction).replace('₩', '')}</span>
              </div>
            </div>
          </div>

          {/* Validation Bar (시안 하단 검증 바) */}
          <div className="bg-slate-100/90 rounded-xl px-4 py-3 border border-slate-200 flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-slate-900 font-mono tracking-tight">
              검증 {validation.totalPayment.toLocaleString()} − {validation.totalDeduction.toLocaleString()} ={' '}
              {validation.calculatedNet.toLocaleString()}
            </div>

            {validation.isMatched ? (
              <span className="bg-slate-900 text-white font-bold text-xs px-3 py-1 rounded-md tracking-tight flex items-center gap-1">
                통장 입금액과 일치
              </span>
            ) : (
              <span className="bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs px-3 py-1 rounded-md tracking-tight flex items-center gap-1">
                불일치 {Math.abs(validation.difference).toLocaleString()}원 (통장 입금액: {transaction.amount.toLocaleString()}원)
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            공제액은 지출이 아니라 급여 공제로 따로 집계 · 연간 누적에 반영
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition"
            >
              취소
            </button>
            <button
              type="button"
              disabled={!validation.isMatched || isSaving}
              onClick={handleSave}
              className={`px-4 py-2 text-xs font-bold text-white rounded-lg transition shadow-xs flex items-center gap-1.5 ${
                validation.isMatched
                  ? 'bg-rose-600 hover:bg-rose-700 cursor-pointer'
                  : 'bg-slate-300 cursor-not-allowed opacity-60'
              }`}
            >
              공제 {validDeductionCount}건 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
