import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  Tag,
  Receipt,
  Scissors,
  Sparkles,
  Check,
  X,
  Plus,
  Trash2,
  Lock,
  Unlock,
  CheckSquare,
  Square,
  ArrowLeftRight,
} from 'lucide-react';
import { Account, Transaction, SplitItem } from '../types';
import { CATEGORY_TREE } from '../data/initialLedgerData';
import { formatKRW, formatSignedKRW } from '../utils/formatters';
import { CategorySelector } from './CategorySelector';

interface S3TransactionsProps {
  transactions: Transaction[];
  accounts: Account[];
  hideAmounts: boolean;
  initialFilter?: {
    category?: string;
    accountId?: string;
    unclassifiedOnly?: boolean;
    type?: string;
  };
  onUpdateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
  onCreateRuleFromTransaction: (tx: Transaction, category: string) => Promise<void> | void;
}

export const S3Transactions: React.FC<S3TransactionsProps> = ({
  transactions,
  accounts,
  hideAmounts,
  initialFilter,
  onUpdateTransaction,
  onDeleteTransaction,
  onCreateRuleFromTransaction,
}) => {
  // Filter States
  const [selectedAccId, setSelectedAccId] = useState<string>(initialFilter?.accountId || 'all');
  const [selectedType, setSelectedType] = useState<string>(initialFilter?.type || 'all');
  const [selectedCategory, setSelectedCategory] = useState<string>(initialFilter?.category || 'all');
  const [onlyUnclassified, setOnlyUnclassified] = useState<boolean>(initialFilter?.unclassifiedOnly || false);
  const [onlyNoReceipt, setOnlyNoReceipt] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Selected for batch editing
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Active Transaction for Detail Panel
  const [activeTxId, setActiveTxId] = useState<string | null>(transactions[0]?.id || null);

  // Split Modal State
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitDraft, setSplitDraft] = useState<SplitItem[]>([]);

  // Rule Register State for Visual Feedback
  const [isRuleRegistering, setIsRuleRegistering] = useState(false);
  const [isRuleRegistered, setIsRuleRegistered] = useState(false);

  // Filter logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (selectedAccId !== 'all' && t.accountId !== selectedAccId) return false;
      if (selectedType !== 'all' && t.type !== selectedType) return false;
      if (selectedCategory !== 'all' && !t.category.startsWith(selectedCategory)) return false;
      if (onlyUnclassified && t.category !== '미분류' && t.isConfirmed) return false;
      if (onlyNoReceipt && (t.type !== 'expense' || t.receiptUrl)) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const str = `${t.counterparty} ${t.rawCounterparty} ${t.rawDescription} ${t.memo || ''} ${t.category} ${t.tags.join(' ')}`.toLowerCase();
        if (!str.includes(q)) return false;
      }

      return true;
    });
  }, [transactions, selectedAccId, selectedType, selectedCategory, onlyUnclassified, onlyNoReceipt, searchTerm]);

  const activeTx = transactions.find((t) => t.id === activeTxId);

  // Batch Select Handlers
  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTransactions.map((t) => t.id)));
    }
  };

  // Batch category apply
  const handleBatchSetCategory = async (category: string) => {
    let resolvedType: 'income' | 'expense' | 'savings' | 'transfer' | undefined;
    if (category.startsWith('수입')) resolvedType = 'income';
    else if (category.startsWith('저축')) resolvedType = 'savings';
    else if (category.startsWith('이체')) resolvedType = 'transfer';
    else if (category !== '미분류') resolvedType = 'expense';

    for (const id of Array.from(selectedIds)) {
      await onUpdateTransaction(id, {
        category,
        ...(resolvedType ? { type: resolvedType } : {}),
        isConfirmed: category !== '미분류',
        isManualLocked: true,
      });
    }
    setSelectedIds(new Set());
  };

  // Open Split Modal
  const handleOpenSplit = () => {
    if (!activeTx) return;
    if (activeTx.splits && activeTx.splits.length > 0) {
      setSplitDraft([...activeTx.splits]);
    } else {
      setSplitDraft([
        { id: 's1', amount: Math.round(activeTx.amount * 0.7), category: activeTx.category || '식비 > 장보기', memo: '항목 1' },
        { id: 's2', amount: activeTx.amount - Math.round(activeTx.amount * 0.7), category: '생활용품 > 세제/화장지', memo: '항목 2' },
      ]);
    }
    setIsSplitModalOpen(true);
  };

  const handleSaveSplit = async () => {
    if (!activeTx) return;
    const sum = splitDraft.reduce((acc, cur) => acc + cur.amount, 0);
    if (sum !== activeTx.amount) {
      alert(`분할 금액의 합계(${formatKRW(sum)})가 거래 총액(${formatKRW(activeTx.amount)})과 정확히 일치해야 합니다.`);
      return;
    }

    await onUpdateTransaction(activeTx.id, {
      splits: splitDraft,
      isConfirmed: true,
      isManualLocked: true,
      tags: Array.from(new Set([...activeTx.tags, '분할거래'])),
    });
    setIsSplitModalOpen(false);
  };

  // Inter-account transfer disconnect
  const handleDisconnectTransfer = async () => {
    if (!activeTx || !activeTx.transferPairId) return;
    const pairId = activeTx.transferPairId;

    await onUpdateTransaction(activeTx.id, {
      type: activeTx.direction === 'in' ? 'income' : 'expense',
      category: '미분류',
      transferPairId: undefined,
      transferAccountAlias: undefined,
      isManualLocked: true,
    });

    const counterpart = transactions.find((t) => t.id === pairId);
    if (counterpart) {
      await onUpdateTransaction(counterpart.id, {
        type: counterpart.direction === 'in' ? 'income' : 'expense',
        category: '미분류',
        transferPairId: undefined,
        transferAccountAlias: undefined,
        isManualLocked: true,
      });
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-100/60">
      {/* Top Filter Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Search Box */}
          <div className="relative w-48">
            <input
              type="text"
              placeholder="거래처, 적요, 메모 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none"
            />
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>

          {/* Account Filter */}
          <select
            value={selectedAccId}
            onChange={(e) => setSelectedAccId(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="all">전체 계좌</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.alias}
              </option>
            ))}
          </select>

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="all">전체 유형</option>
            <option value="expense">지출만</option>
            <option value="income">수입만</option>
            <option value="transfer">이체만 (통장간)</option>
            <option value="savings">저축/적금만</option>
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="all">전체 카테고리</option>
            {CATEGORY_TREE.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((it) => (
                  <option key={it} value={it}>
                    {it}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {/* Quick Toggles */}
          <button
            onClick={() => setOnlyUnclassified(!onlyUnclassified)}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition ${
              onlyUnclassified
                ? 'bg-amber-100 border-amber-300 text-amber-900'
                : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            미분류만 보기
          </button>

          <button
            onClick={() => setOnlyNoReceipt(!onlyNoReceipt)}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition ${
              onlyNoReceipt
                ? 'bg-rose-100 border-rose-300 text-rose-900'
                : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            증빙 없음만
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          검색 결과 <span className="font-bold text-slate-900">{filteredTransactions.length}건</span>
        </div>
      </div>

      {/* Main 3-Column / 2-Column Split: Table + Detail Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center: Transactions Table */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white border-r border-slate-200">
          {/* Table Header */}
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center text-xs font-bold text-slate-600 select-none">
            <div className="w-8 flex items-center justify-center">
              <button onClick={handleSelectAll} className="p-0.5 text-slate-400 hover:text-slate-700">
                {selectedIds.size > 0 && selectedIds.size === filteredTransactions.length ? (
                  <CheckSquare className="h-4 w-4 text-indigo-600" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
            </div>
            <div className="w-24">날짜</div>
            <div className="w-28">통장</div>
            <div className="flex-1">거래처 / 적요 원문</div>
            <div className="w-28 text-right">금액(원)</div>
            <div className="w-36 text-center">카테고리</div>
            <div className="w-16 text-center">증빙</div>
            <div className="w-16 text-center">상태</div>
          </div>

          {/* Table Body */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredTransactions.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-xs text-slate-400">
                <Filter className="h-6 w-6 text-slate-300 mb-1" />
                <span>해당 조건의 거래가 없습니다</span>
              </div>
            ) : (
              filteredTransactions.map((tx) => {
                const isSelected = selectedIds.has(tx.id);
                const isActive = activeTxId === tx.id;
                const isTransfer = tx.type === 'transfer';
                const isUnclassified = tx.category === '미분류';

                return (
                  <div
                    key={tx.id}
                    onClick={() => setActiveTxId(tx.id)}
                    className={`px-4 py-3 flex items-center text-xs cursor-pointer transition ${
                      isActive
                        ? 'bg-indigo-50/70 border-l-4 border-indigo-600'
                        : isSelected
                        ? 'bg-slate-50/80'
                        : 'hover:bg-slate-50/60'
                    }`}
                  >
                    {/* Checkbox */}
                    <div
                      className="w-8 flex items-center justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSelect(tx.id);
                      }}
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-indigo-600" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-300 hover:text-slate-500" />
                      )}
                    </div>

                    {/* Date */}
                    <div className="w-24 text-slate-500 font-mono text-[11px]">
                      {tx.occurredAt.split(' ')[0]}
                    </div>

                    {/* Account */}
                    <div className="w-28 text-slate-700 font-semibold truncate pr-2">
                      {tx.accountAlias?.split(' ')[0]}
                    </div>

                    {/* Counterparty & Description */}
                    <div className="flex-1 pr-3 truncate">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5 truncate">
                        {isTransfer && (
                          <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded shrink-0">
                            이체
                          </span>
                        )}
                        <span>{tx.counterparty}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {tx.rawDescription !== tx.counterparty ? tx.rawDescription : ''}
                        {tx.memo ? ` · [메모] ${tx.memo}` : ''}
                      </div>
                    </div>

                    {/* Amount */}
                    <div
                      className={`w-28 text-right font-bold tabular-nums ${
                        isTransfer
                          ? 'text-slate-600'
                          : tx.direction === 'in'
                          ? 'text-emerald-600'
                          : 'text-slate-900'
                      }`}
                    >
                      {formatSignedKRW(tx.amount, tx.direction, hideAmounts)}
                    </div>

                    {/* Category */}
                    <div className="w-36 px-2 text-center">
                      <span
                        className={`inline-block max-w-full truncate text-[11px] px-2 py-0.5 rounded-md font-semibold ${
                          isUnclassified
                            ? 'bg-amber-100 text-amber-800'
                            : isTransfer
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {tx.splits && tx.splits.length > 0 ? `분할(${tx.splits.length})` : tx.category}
                      </span>
                    </div>

                    {/* Receipt */}
                    <div className="w-16 text-center">
                      {tx.receiptUrl ? (
                        <span className="text-emerald-600 text-[11px] font-semibold flex items-center justify-center gap-0.5">
                          <Receipt className="h-3.5 w-3.5" /> 첨부
                        </span>
                      ) : (
                        <span className="text-slate-300 text-[11px]">-</span>
                      )}
                    </div>

                    {/* Status */}
                    <div className="w-16 text-center">
                      {tx.isManualLocked ? (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium flex items-center justify-center gap-0.5">
                          <Lock className="h-2.5 w-2.5" /> 수동
                        </span>
                      ) : tx.isConfirmed ? (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
                          확정
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold">
                          확인필요
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Batch Actions Toolbar (Appears when items are selected) */}
          {selectedIds.size > 0 && (
            <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between shrink-0 shadow-lg border-t border-slate-800 animate-in slide-in-from-bottom-2">
              <div className="text-xs flex items-center gap-3">
                <span className="font-bold text-indigo-300">{selectedIds.size}건 선택됨</span>
                <span className="text-slate-400">|</span>
                <span>일괄 카테고리 지정:</span>
                <CategorySelector
                  value=""
                  onChange={(newCategory) => {
                    if (newCategory && newCategory !== '미분류') {
                      handleBatchSetCategory(newCategory);
                    }
                  }}
                  align="left"
                  size="sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1 text-xs text-slate-400 hover:text-white rounded-lg transition"
                >
                  선택 해제
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Detail Panel */}
        <div className="w-80 border-l border-slate-200 bg-white p-5 overflow-y-auto flex flex-col justify-between shrink-0">
          {activeTx ? (
            <div className="space-y-5">
              {/* Detail Header */}
              <div className="border-b border-slate-100 pb-3">
                <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                  <span>거래 상세 정보</span>
                  <span className="font-mono">{activeTx.occurredAt}</span>
                </div>
                <div className="mt-1 text-base font-bold text-slate-900">{activeTx.counterparty}</div>
                <div
                  className={`mt-1 text-xl font-bold tracking-tight ${
                    activeTx.type === 'transfer'
                      ? 'text-slate-700'
                      : activeTx.direction === 'in'
                      ? 'text-emerald-600'
                      : 'text-slate-900'
                  }`}
                >
                  {formatSignedKRW(activeTx.amount, activeTx.direction, hideAmounts)}
                </div>
              </div>

              {/* Account info */}
              <div className="text-xs space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                <div className="flex items-center justify-between text-slate-600">
                  <span>출납 계좌</span>
                  <span className="font-bold text-slate-900">{activeTx.accountAlias}</span>
                </div>
                {activeTx.balanceAfter !== undefined && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span>거래 후 잔액</span>
                    <span className="font-semibold text-slate-800">{formatKRW(activeTx.balanceAfter, hideAmounts)}</span>
                  </div>
                )}
                {activeTx.transferPairId && (
                  <div className="pt-2 mt-2 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-indigo-700 font-bold flex items-center gap-1">
                      <ArrowLeftRight className="h-3 w-3" /> 이체 매칭됨
                    </span>
                    <button
                      onClick={handleDisconnectTransfer}
                      className="text-[11px] text-rose-600 hover:underline font-semibold"
                    >
                      이체 연결 해제
                    </button>
                  </div>
                )}
              </div>

              {/* Category Selector */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">카테고리</label>
                <div className="w-full">
                  <CategorySelector
                    value={activeTx.category}
                    direction={activeTx.direction}
                    onChange={(newCat) => {
                      let newType = activeTx.type;
                      if (newCat.startsWith('수입')) newType = 'income';
                      else if (newCat.startsWith('저축')) newType = 'savings';
                      else if (newCat.startsWith('이체')) newType = 'transfer';
                      else if (activeTx.direction === 'in') newType = 'income';
                      else if (newCat !== '미분류') newType = 'expense';

                      onUpdateTransaction(activeTx.id, {
                        category: newCat,
                        type: newType,
                        isConfirmed: newCat !== '미분류',
                        isManualLocked: true,
                      });
                    }}
                    align="left"
                    size="md"
                    className="w-full"
                  />
                </div>
              </div>

              {/* Fixed vs Variable Toggle */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">고정비/고정수입 여부</span>
                <input
                  type="checkbox"
                  checked={activeTx.isFixed}
                  onChange={(e) =>
                    onUpdateTransaction(activeTx.id, {
                      isFixed: e.target.checked,
                      isManualLocked: true,
                    })
                  }
                  className="h-4 w-4 text-indigo-600 rounded"
                />
              </div>

              {/* Split Transaction Button (PRD F-04) */}
              <div>
                <button
                  type="button"
                  onClick={handleOpenSplit}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition border border-slate-200"
                >
                  <Scissors className="h-3.5 w-3.5 text-indigo-600" />
                  <span>
                    {activeTx.splits && activeTx.splits.length > 0
                      ? `분할 거래 편집 (${activeTx.splits.length}개 항목)`
                      : '이 거래를 여러 카테고리로 쪼개기 (분할)'}
                  </span>
                </button>
              </div>

              {/* Memo */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">메모</label>
                <textarea
                  rows={2}
                  value={activeTx.memo || ''}
                  placeholder="추가 메모 입력..."
                  onChange={(e) => onUpdateTransaction(activeTx.id, { memo: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 outline-none focus:border-indigo-600"
                />
              </div>

              {/* Promote to Rule Button */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isRuleRegistering || isRuleRegistered}
                  onClick={async () => {
                    if (isRuleRegistering || isRuleRegistered) return;
                    setIsRuleRegistering(true);
                    try {
                      await onCreateRuleFromTransaction(activeTx, activeTx.category);
                      setIsRuleRegistered(true);
                      setTimeout(() => setIsRuleRegistered(false), 3000);
                    } finally {
                      setIsRuleRegistering(false);
                    }
                  }}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-bold rounded-xl transition shadow-2xs ${
                    isRuleRegistered
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                      : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
                  }`}
                >
                  {isRuleRegistered ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-600" />
                      <span>"{activeTx.counterparty}" 자동 분류 규칙 등록 완료!</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                      <span>"앞으로 {activeTx.counterparty}는 항상 이 분류로" 규칙 등록</span>
                    </>
                  )}
                </button>
              </div>

              {/* Delete Button */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('이 거래를 삭제하시겠습니까?')) {
                      onDeleteTransaction(activeTx.id);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>거래 내역 삭제</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              목록에서 거래를 선택하세요
            </div>
          )}
        </div>
      </div>

      {/* Split Transaction Modal */}
      {isSplitModalOpen && activeTx && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-indigo-600" />
                  거래 분할 (Split Transaction)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  총액 {formatKRW(activeTx.amount)}원을 여러 카테고리로 세분화하여 배분합니다.
                </p>
              </div>
              <button onClick={() => setIsSplitModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Split items list */}
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {splitDraft.map((item, idx) => (
                <div key={item.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">항목 #{idx + 1}</span>
                    {splitDraft.length > 1 && (
                      <button
                        onClick={() => setSplitDraft(splitDraft.filter((_, i) => i !== idx))}
                        className="text-rose-500 hover:text-rose-700 text-[11px]"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">카테고리</label>
                      <CategorySelector
                        value={item.category}
                        onChange={(newCategory) => {
                          const next = [...splitDraft];
                          next[idx].category = newCategory;
                          setSplitDraft(next);
                        }}
                        align="left"
                        size="sm"
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block">금액(원)</label>
                      <input
                        type="number"
                        value={item.amount}
                        onChange={(e) => {
                          const next = [...splitDraft];
                          next[idx].amount = Number(e.target.value);
                          setSplitDraft(next);
                        }}
                        className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="품목/설명 메모 (예: 소고기, 주방세제)"
                      value={item.memo || ''}
                      onChange={(e) => {
                        const next = [...splitDraft];
                        next[idx].memo = e.target.value;
                        setSplitDraft(next);
                      }}
                      className="w-full bg-white border border-slate-300 rounded p-1.5 text-[11px]"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                const currentSum = splitDraft.reduce((acc, c) => acc + c.amount, 0);
                const remaining = Math.max(0, activeTx.amount - currentSum);
                setSplitDraft([
                  ...splitDraft,
                  { id: 's_' + Date.now(), amount: remaining, category: '생활용품 > 기타', memo: '' },
                ]);
              }}
              className="w-full py-1.5 border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> 분할 항목 추가
            </button>

            {/* Sum check */}
            <div className="bg-slate-100 p-3 rounded-xl flex items-center justify-between text-xs font-bold">
              <span>분할 합계: {formatKRW(splitDraft.reduce((acc, c) => acc + c.amount, 0))}</span>
              <span
                className={
                  splitDraft.reduce((acc, c) => acc + c.amount, 0) === activeTx.amount
                    ? 'text-emerald-600'
                    : 'text-rose-600'
                }
              >
                거래 총액: {formatKRW(activeTx.amount)}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsSplitModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                취소
              </button>
              <button
                onClick={handleSaveSplit}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl shadow-2xs"
              >
                분할 저장 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
