import React, { useState } from 'react';
import { X, Plus, Calendar, DollarSign, Tag, FileText } from 'lucide-react';
import { Account, Transaction } from '../types';
import { CATEGORY_TREE } from '../data/initialLedgerData';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  selectedMonth: string;
  onAddTransaction: (tx: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<any>;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  accounts,
  selectedMonth,
  onAddTransaction,
}) => {
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id || '');
  const [date, setDate] = useState<string>(
    `${selectedMonth}-${String(new Date().getDate()).padStart(2, '0')}`
  );
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [counterparty, setCounterparty] = useState<string>('');
  const [amount, setAmount] = useState<number | ''>('');
  const [category, setCategory] = useState<string>('식비 > 외식');
  const [memo, setMemo] = useState<string>('');
  const [isFixed, setIsFixed] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterparty.trim() || !amount || Number(amount) <= 0) return;

    const acc = accounts.find((a) => a.id === accountId);

    await onAddTransaction({
      accountId,
      accountAlias: acc?.alias || '',
      occurredAt: `${date} 12:00:00`,
      counterparty: counterparty.trim(),
      rawCounterparty: counterparty.trim(),
      rawDescription: counterparty.trim(),
      amount: Number(amount),
      direction: type === 'income' ? 'in' : 'out',
      type,
      category,
      memo: memo.trim() || undefined,
      isFixed,
      tags: [],
      isConfirmed: true,
      isManualLocked: true,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Plus className="h-4 w-4 text-indigo-600" />
            수기 거래 등록
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          {/* Income vs Expense Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setType('expense');
                setCategory('식비 > 외식');
              }}
              className={`py-2 text-xs font-bold rounded-lg transition ${
                type === 'expense'
                  ? 'bg-white text-rose-600 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              지출 (-)
            </button>
            <button
              type="button"
              onClick={() => {
                setType('income');
                setCategory('급여 > 기본급');
              }}
              className={`py-2 text-xs font-bold rounded-lg transition ${
                type === 'income'
                  ? 'bg-white text-emerald-600 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              수입 (+)
            </button>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">통장 선택</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.alias} ({a.bankName})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-slate-700 block mb-1">거래일</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">금액(원)</label>
              <input
                type="number"
                required
                min={1}
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">거래처 / 사용처</label>
            <input
              type="text"
              required
              placeholder="예: 스타벅스 강남점, 파리바게뜨"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">카테고리</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800"
            >
              {CATEGORY_TREE.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((it) => (
                    <option key={`${g.group}-${it}`} value={it}>
                      {it}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">메모</label>
            <input
              type="text"
              placeholder="상세 내용이나 메모 (선택사항)"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="quickFixed"
              checked={isFixed}
              onChange={(e) => setIsFixed(e.target.checked)}
              className="h-4 w-4 text-indigo-600 rounded"
            />
            <label htmlFor="quickFixed" className="font-medium text-slate-700 cursor-pointer">
              고정비로 태깅
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
          >
            취소
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl shadow-2xs"
          >
            등록 완료
          </button>
        </div>
      </form>
    </div>
  );
};
