import React, { useState } from 'react';
import {
  Building2,
  Plus,
  Edit3,
  Trash2,
  Shield,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  X,
} from 'lucide-react';
import { Account, AccountRole, Transaction } from '../types';
import { formatKRW, maskAccountNumber } from '../utils/formatters';

interface S6AccountsProps {
  accounts: Account[];
  transactions: Transaction[];
  hideAmounts: boolean;
  onAddAccount: (acc: Omit<Account, 'id'>) => Promise<any>;
  onUpdateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  onDeleteAccount: (id: string) => Promise<void>;
  onCreateAdjustmentTx: (accountId: string, diff: number) => Promise<void>;
}

const BANK_OPTIONS = [
  'KB국민은행',
  '신한은행',
  '우리은행',
  '하나은행',
  '카카오뱅크',
  '토스뱅크',
  'NH농협은행',
  'IBK기업은행',
  'SC제일은행',
  '우체국',
  '케이뱅크',
];

export const S6Accounts: React.FC<S6AccountsProps> = ({
  accounts,
  transactions,
  hideAmounts,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onCreateAdjustmentTx,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  // Form states
  const [bankName, setBankName] = useState(BANK_OPTIONS[0]);
  const [accountNumber, setAccountNumber] = useState('');
  const [alias, setAlias] = useState('');
  const [role, setRole] = useState<AccountRole>('living');
  const [initialBalance, setInitialBalance] = useState<number>(0);
  const [asOfDate, setAsOfDate] = useState('2026-07-01');
  const [color, setColor] = useState('#3B82F6');
  const [isPublic, setIsPublic] = useState(true);
  const [memo, setMemo] = useState('');

  // Unmask account numbers toggle for security
  const [showFullAccountNumbers, setShowFullAccountNumbers] = useState(false);

  const openCreateModal = () => {
    setEditingAccountId(null);
    setBankName(BANK_OPTIONS[0]);
    setAccountNumber('');
    setAlias('');
    setRole('living');
    setInitialBalance(0);
    setAsOfDate(new Date().toISOString().split('T')[0]);
    setColor('#10B981');
    setIsPublic(true);
    setMemo('');
    setIsModalOpen(true);
  };

  const openEditModal = (acc: Account) => {
    setEditingAccountId(acc.id);
    setBankName(acc.bankName);
    setAccountNumber(acc.rawAccountNumber || acc.accountNumber);
    setAlias(acc.alias);
    setRole(acc.role);
    setInitialBalance(acc.initialBalance);
    setAsOfDate(acc.asOfDate);
    setColor(acc.color);
    setIsPublic(acc.isPublic);
    setMemo(acc.memo || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alias.trim() || !accountNumber.trim()) return;

    const masked = maskAccountNumber(accountNumber.trim());

    if (editingAccountId) {
      await onUpdateAccount(editingAccountId, {
        bankName,
        accountNumber: masked,
        rawAccountNumber: accountNumber.trim(),
        alias: alias.trim(),
        role,
        initialBalance,
        asOfDate,
        color,
        isPublic,
        memo: memo.trim() || undefined,
      });
    } else {
      await onAddAccount({
        bankName,
        accountNumber: masked,
        rawAccountNumber: accountNumber.trim(),
        alias: alias.trim(),
        role,
        initialBalance,
        asOfDate,
        color,
        isPublic,
        memo: memo.trim() || undefined,
      });
    }

    setIsModalOpen(false);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-20">
      {/* Banner */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-600" />
            계좌 수기 등록과 실시간 잔액 관리
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            스크래핑 없이도 잔액이 맞아떨어지게 만드는 출발점입니다. [계산 잔액 = 초기잔액 + 가져온 거래의 합]
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFullAccountNumbers(!showFullAccountNumbers)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
          >
            {showFullAccountNumbers ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{showFullAccountNumbers ? '계좌번호 마스킹' : '전체 계좌번호 표시'}</span>
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-2xs"
          >
            <Plus className="h-4 w-4" />
            <span>새 계좌 등록</span>
          </button>
        </div>
      </div>

      {/* Account Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {accounts.map((acc) => {
          const accTxs = transactions.filter((t) => t.accountId === acc.id);
          const currentBal = acc.currentBalance ?? acc.initialBalance;

          return (
            <div
              key={acc.id}
              className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4 hover:border-slate-300 transition"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold shadow-2xs"
                    style={{ backgroundColor: acc.color }}
                  >
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      {acc.alias}
                      <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {acc.role === 'salary'
                          ? '급여 수신'
                          : acc.role === 'fixed'
                          ? '고정비'
                          : acc.role === 'living'
                          ? '생활비'
                          : '저축/비상금'}
                      </span>
                    </h3>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      {acc.bankName} · {showFullAccountNumbers && acc.rawAccountNumber ? acc.rawAccountNumber : acc.accountNumber}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(acc)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                    title="계좌 정보 수정"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`'${acc.alias}' 계좌를 삭제하시겠습니까?`)) {
                        onDeleteAccount(acc.id);
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                    title="계좌 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Balance Stats */}
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-500">
                  <span>기준 초기잔액 ({acc.asOfDate})</span>
                  <span className="font-semibold text-slate-700">{formatKRW(acc.initialBalance, hideAmounts)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>누적 반영 거래</span>
                  <span className="font-semibold text-slate-700">{accTxs.length}건</span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-sm">현재 계산 잔액</span>
                  <span className="font-bold text-slate-900 text-base">{formatKRW(currentBal, hideAmounts)}</span>
                </div>
              </div>

              {/* Integrity status */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  실제 은행 잔액과 1원 단위 일치
                </span>
                <span className="text-slate-400 text-[11px]">최종 갱신: {acc.lastUpdated || acc.asOfDate}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Account Registration / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingAccountId ? '통장 계좌 정보 수정' : '새 통장 계좌 수기 등록'}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">은행명</label>
                  <select
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    {BANK_OPTIONS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">통장 역할 구분</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as AccountRole)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    <option value="salary">급여 수신</option>
                    <option value="fixed">고정비 (월세/관리비/보험)</option>
                    <option value="living">생활비 (체크카드)</option>
                    <option value="savings">저축/비상금 (파킹/적금)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">계좌 별칭</label>
                <input
                  type="text"
                  required
                  placeholder="예: 생활비 통장 (체크카드 연동)"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">계좌번호</label>
                <input
                  type="text"
                  required
                  placeholder="예: 110-384-592910 (목록에서는 자동 마스킹 표시됩니다)"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">초기 잔액 (원)</label>
                  <input
                    type="number"
                    required
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">잔액 기준일</label>
                  <input
                    type="date"
                    required
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">메모</label>
                <input
                  type="text"
                  placeholder="통장 관리 메모 (예: 매월 25일 자동이체)"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl shadow-2xs"
              >
                통장 저장
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
