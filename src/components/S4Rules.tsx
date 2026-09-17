import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  Check,
  Zap,
  Play,
  Edit2,
  Layers,
  X,
  AlertTriangle,
  GripVertical,
} from 'lucide-react';
import { ClassificationRule, Transaction, Account } from '../types';
import { CATEGORY_TREE } from '../data/initialLedgerData';
import { applyRulesToTransaction } from '../services/ledgerService';
import { formatKRW } from '../utils/formatters';

interface S4RulesProps {
  rules: ClassificationRule[];
  transactions: Transaction[];
  accounts: Account[];
  onAddRule: (rule: Omit<ClassificationRule, 'id' | 'createdAt' | 'updatedAt'>) => Promise<any>;
  onUpdateRule: (id: string, updates: Partial<ClassificationRule>) => Promise<void>;
  onReorderRules?: (reorderedRules: ClassificationRule[]) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
  onBatchUpdateTransactions: (updatedTxs: Transaction[]) => Promise<void>;
}

export const S4Rules: React.FC<S4RulesProps> = ({
  rules,
  transactions,
  accounts,
  onAddRule,
  onUpdateRule,
  onReorderRules,
  onDeleteRule,
  onBatchUpdateTransactions,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<ClassificationRule | null>(null);
  const [isReapplying, setIsReapplying] = useState(false);
  const [reapplyMessage, setReapplyMessage] = useState<string | null>(null);

  // Sorted rules by priority ascending
  const sortedRules = useMemo(() => {
    return [...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  }, [rules]);

  // Form state
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<'in' | 'out' | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [matchType, setMatchType] = useState<'contains' | 'exact' | 'regex'>('contains');
  const [category, setCategory] = useState('식비 > 외식');
  const [type, setType] = useState<'income' | 'expense' | 'transfer' | 'savings'>('expense');
  const [isFixed, setIsFixed] = useState(false);
  const [autoConfirm, setAutoConfirm] = useState(true);

  const openCreateModal = () => {
    setEditingRuleId(null);
    setName('');
    setDirection('out');
    setKeyword('');
    setMatchType('contains');
    setCategory('식비 > 외식');
    setType('expense');
    setIsFixed(false);
    setAutoConfirm(true);
    setIsModalOpen(true);
  };

  const openEditModal = (rule: ClassificationRule) => {
    setEditingRuleId(rule.id);
    setName(rule.name);
    setDirection(rule.condition.direction);
    setKeyword(rule.condition.keyword || '');
    setMatchType(rule.condition.matchType || 'contains');
    setCategory(rule.result.category);
    setType(rule.result.type);
    setIsFixed(rule.result.isFixed || false);
    setAutoConfirm(rule.result.autoConfirm);
    setIsModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !category) return;

    if (editingRuleId) {
      await onUpdateRule(editingRuleId, {
        name,
        condition: {
          direction,
          keyword: keyword.trim() || '',
          matchType,
        },
        result: {
          type,
          category,
          isFixed,
          autoConfirm,
        },
      });
    } else {
      const maxPriority = sortedRules.reduce((max, r) => Math.max(max, r.priority ?? 0), 0);
      await onAddRule({
        name,
        priority: maxPriority + 1,
        condition: {
          direction,
          keyword: keyword.trim() || '',
          matchType,
        },
        result: {
          type,
          category,
          isFixed,
          autoConfirm,
        },
        isActive: true,
        appliedCount: 0,
      });
    }
    setIsModalOpen(false);
  };

  // Drag & drop state for reordering rules
  const [draggedRuleId, setDraggedRuleId] = useState<string | null>(null);
  // dropIndicator: { index: number, position: 'top' | 'bottom' }
  const [dropIndicator, setDropIndicator] = useState<{ index: number; position: 'top' | 'bottom' } | null>(null);
  // Just dropped rule ID for settle animation
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedRuleId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);

    // Create custom ghost drag image with slight opacity and shadow if supported
    const rowEl = (e.currentTarget as HTMLElement);
    if (e.dataTransfer.setDragImage && rowEl) {
      // Allow browser to use the card with native ghosting
    }
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Calculate whether mouse is on upper half or lower half of row
    const targetRect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - targetRect.top;
    const position = offsetY < targetRect.height / 2 ? 'top' : 'bottom';

    if (
      !dropIndicator ||
      dropIndicator.index !== targetIndex ||
      dropIndicator.position !== position
    ) {
      setDropIndicator({ index: targetIndex, position });
    }
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const indicator = dropIndicator;
    setDropIndicator(null);
    const sourceId = draggedRuleId || e.dataTransfer.getData('text/plain');
    setDraggedRuleId(null);
    if (!sourceId) return;

    const sourceIndex = sortedRules.findIndex((r) => r.id === sourceId);
    if (sourceIndex === -1) return;

    // Calculate final target insertion index based on 'top' or 'bottom'
    let insertIndex = targetIndex;
    if (indicator && indicator.position === 'bottom') {
      insertIndex = targetIndex + 1;
    }

    // Adjust insertIndex if moving down past itself
    if (sourceIndex < insertIndex) {
      insertIndex -= 1;
    }

    if (sourceIndex === insertIndex) return;

    const currentList = [...sortedRules];
    const [movedItem] = currentList.splice(sourceIndex, 1);
    currentList.splice(insertIndex, 0, movedItem);

    // Trigger settle animation on dropped item
    setJustDroppedId(sourceId);
    setTimeout(() => {
      setJustDroppedId(null);
    }, 1200);

    // Normalize priorities sequentially 1..N
    const reordered = currentList.map((r, i) => ({
      ...r,
      priority: i + 1,
    }));

    if (onReorderRules) {
      await onReorderRules(reordered);
    } else {
      for (let i = 0; i < currentList.length; i++) {
        await onUpdateRule(currentList[i].id, { priority: i + 1 });
      }
    }
  };

  const handleDragEnd = () => {
    setDraggedRuleId(null);
    setDropIndicator(null);
  };

  // Past Transactions Re-Apply (과거 거래 재적용)
  const handleReapplyRules = async () => {
    setIsReapplying(true);
    let modifiedCount = 0;
    const updatedList: Transaction[] = [];

    for (const tx of transactions) {
      if (tx.isManualLocked) {
        updatedList.push(tx);
        continue;
      }
      const { modified, updatedTx } = applyRulesToTransaction(tx, sortedRules);
      if (modified) {
        modifiedCount++;
        updatedList.push(updatedTx);
      } else {
        updatedList.push(tx);
      }
    }

    if (modifiedCount > 0) {
      await onBatchUpdateTransactions(updatedList);
      setReapplyMessage(`과거 거래 ${transactions.length}건 중 ${modifiedCount}건에 규칙이 성공적으로 재적용되었습니다!`);
    } else {
      setReapplyMessage('현재 등록된 규칙으로 추가 분류할 수 있는 과거 거래가 없습니다.');
    }

    setIsReapplying(false);
    setTimeout(() => setReapplyMessage(null), 5000);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-20">
      {/* Header Info */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            자동 분류 규칙 엔진 (우선순위 순 평가)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            "두 번째 달부터는 자동"을 만드는 핵심입니다. 위에서 아래 순으로 평가하며, 수동으로 바꾼 분류는 건드리지 않습니다.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReapplyRules}
            disabled={isReapplying}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-xl transition shadow-2xs disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            <span>{isReapplying ? '재적용 중...' : '과거 거래 재적용'}</span>
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-2xs"
          >
            <Plus className="h-4 w-4" />
            <span>새 규칙 만들기</span>
          </button>
        </div>
      </div>

      {/* Toast Message */}
      {reapplyMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <span>{reapplyMessage}</span>
          <button onClick={() => setReapplyMessage(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Rules List */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs divide-y divide-slate-100">
        {sortedRules.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">등록된 자동 분류 규칙이 없습니다.</div>
        ) : (
          sortedRules.map((rule, idx) => {
            const isDragging = draggedRuleId === rule.id;
            const isJustDropped = justDroppedId === rule.id;
            const showTopIndicator =
              dropIndicator?.index === idx &&
              dropIndicator?.position === 'top' &&
              draggedRuleId !== rule.id;
            const showBottomIndicator =
              dropIndicator?.index === idx &&
              dropIndicator?.position === 'bottom' &&
              draggedRuleId !== rule.id;

            return (
              <div
                key={rule.id}
                draggable
                onDragStart={(e) => handleDragStart(e, rule.id)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                className={`relative p-4 flex items-center justify-between text-xs transition-all duration-300 ease-out cursor-grab active:cursor-grabbing ${
                  !rule.isActive ? 'opacity-50' : ''
                } ${
                  isDragging
                    ? 'bg-slate-50/80 border-2 border-dashed border-slate-300 shadow-inner rounded-xl my-1 opacity-60'
                    : isJustDropped
                    ? 'bg-indigo-50/80 shadow-md ring-2 ring-indigo-500/40 rounded-xl scale-[1.005]'
                    : 'hover:bg-slate-50/80'
                }`}
              >
                {/* Drop Indicator - Top Line */}
                {showTopIndicator && (
                  <div className="absolute -top-1 left-2 right-2 h-1 bg-indigo-600 rounded-full z-20 shadow-sm pointer-events-none animate-pulse flex items-center">
                    <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-indigo-600 ring-2 ring-white" />
                    <div className="absolute -right-1.5 w-3 h-3 rounded-full bg-indigo-600 ring-2 ring-white" />
                  </div>
                )}

                {/* Drop Indicator - Bottom Line */}
                {showBottomIndicator && (
                  <div className="absolute -bottom-1 left-2 right-2 h-1 bg-indigo-600 rounded-full z-20 shadow-sm pointer-events-none animate-pulse flex items-center">
                    <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-indigo-600 ring-2 ring-white" />
                    <div className="absolute -right-1.5 w-3 h-3 rounded-full bg-indigo-600 ring-2 ring-white" />
                  </div>
                )}

                {/* Drag Handle, Priority Number & Rule Info */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 select-none">
                    <GripVertical className={`h-4 w-4 shrink-0 transition-colors ${isDragging ? 'text-indigo-400' : 'text-slate-300 hover:text-slate-600'}`} />
                    <span className={`text-[11px] font-mono font-bold ${isDragging ? 'text-slate-300' : 'text-slate-500'}`}>#{idx + 1}</span>
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <span className={isDragging ? 'text-slate-400 italic' : ''}>
                        {rule.name}
                        {isDragging && ' (이동 중...)'}
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                        적용 {rule.appliedCount}건
                      </span>
                    </div>

                    {/* Condition Pill & Result Pill */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        조건: {rule.condition.direction === 'in' ? '입금' : rule.condition.direction === 'out' ? '출금' : '전체'}
                        {rule.condition.keyword && ` + "${rule.condition.keyword}" 포함`}
                        {rule.condition.minAmount && ` + ${formatKRW(rule.condition.minAmount)} 이상`}
                      </span>

                      <span className="text-slate-300">→</span>

                      <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded">
                        결과: {rule.result.category}
                        {rule.result.isFixed ? ' (고정비)' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdateRule(rule.id, { isActive: !rule.isActive })}
                    className={`px-2.5 py-1 rounded text-xs font-semibold ${
                      rule.isActive ? 'bg-slate-100 text-slate-700' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {rule.isActive ? '활성' : '비활성'}
                  </button>
                  <button
                    onClick={() => openEditModal(rule)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded"
                    title="규칙 수정"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setRuleToDelete(rule)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                    title="규칙 삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create / Edit Rule Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleSaveRule} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingRuleId ? '규칙 수정' : '새 자동 분류 규칙 만들기'}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">규칙 이름</label>
                <input
                  type="text"
                  required
                  placeholder="예: 마트 장보기 자동분류"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium outline-none focus:border-indigo-600"
                />
              </div>

              {/* Condition Group */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                <span className="font-bold text-slate-800 block">[조건 설정]</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">입출금 방향</label>
                    <select
                      value={direction || ''}
                      onChange={(e) => setDirection(e.target.value as any || undefined)}
                      className="w-full bg-white border border-slate-300 rounded p-1.5"
                    >
                      <option value="">(상관없음)</option>
                      <option value="out">출금 (지출)</option>
                      <option value="in">입금 (수입)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">매칭 방식</label>
                    <select
                      value={matchType}
                      onChange={(e) => setMatchType(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 rounded p-1.5"
                    >
                      <option value="contains">키워드 포함</option>
                      <option value="exact">정확히 일치</option>
                      <option value="regex">정규식(Regex)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">적요 / 거래처 키워드</label>
                  <input
                    type="text"
                    placeholder="예: 이마트, 스타벅스, 넷플릭스"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded p-2"
                  />
                </div>
              </div>

              {/* Result Group */}
              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-200/60 space-y-3">
                <span className="font-bold text-indigo-900 block">[분류 결과 지정]</span>
                <div>
                  <label className="text-[11px] text-slate-600 block mb-1">배정할 카테고리</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded p-2 font-semibold text-slate-800"
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

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isFixed}
                      onChange={(e) => setIsFixed(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span className="text-slate-700 font-medium">고정비로 태깅</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoConfirm}
                      onChange={(e) => setAutoConfirm(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span className="text-slate-700 font-medium">자동 확정(미분류 안 거침)</span>
                  </label>
                </div>
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
                규칙 저장
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Alert Modal */}
      {ruleToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">규칙 삭제 확인</h3>
                <p className="text-xs text-slate-500 mt-0.5">삭제된 규칙은 복구할 수 없습니다.</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
              <div className="text-xs font-bold text-slate-800 break-all">{ruleToDelete.name}</div>
              <div className="text-[11px] text-slate-500">
                카테고리: <span className="font-semibold text-indigo-700">{ruleToDelete.result.category}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              정말로 이 자동 분류 규칙을 삭제하시겠습니까?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRuleToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = ruleToDelete.id;
                  setRuleToDelete(null);
                  await onDeleteRule(id);
                }}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition shadow-2xs cursor-pointer"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
