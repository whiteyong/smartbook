import React, { useState } from 'react';
import {
  Sparkles,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Check,
  Zap,
  Play,
  Edit2,
  Layers,
  X,
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
  onDeleteRule: (id: string) => Promise<void>;
  onBatchUpdateTransactions: (updatedTxs: Transaction[]) => Promise<void>;
}

export const S4Rules: React.FC<S4RulesProps> = ({
  rules,
  transactions,
  accounts,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onBatchUpdateTransactions,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [isReapplying, setIsReapplying] = useState(false);
  const [reapplyMessage, setReapplyMessage] = useState<string | null>(null);

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
      const maxPriority = rules.reduce((max, r) => Math.max(max, r.priority), 0);
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

  // Move priority up or down
  const handleMovePriority = async (ruleId: string, dir: 'up' | 'down') => {
    const idx = rules.findIndex((r) => r.id === ruleId);
    if (idx === -1) return;
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === rules.length - 1) return;

    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    const currentRule = rules[idx];
    const targetRule = rules[targetIdx];

    await onUpdateRule(currentRule.id, { priority: targetRule.priority });
    await onUpdateRule(targetRule.id, { priority: currentRule.priority });
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
      const { modified, updatedTx } = applyRulesToTransaction(tx, rules);
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
        {rules.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">등록된 자동 분류 규칙이 없습니다.</div>
        ) : (
          rules.map((rule, idx) => {
            return (
              <div
                key={rule.id}
                className={`p-4 flex items-center justify-between text-xs hover:bg-slate-50/80 transition ${
                  !rule.isActive ? 'opacity-50' : ''
                }`}
              >
                {/* Priority & Move */}
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <button
                      onClick={() => handleMovePriority(rule.id, 'up')}
                      disabled={idx === 0}
                      className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[11px] font-mono font-bold text-slate-400">#{idx + 1}</span>
                    <button
                      onClick={() => handleMovePriority(rule.id, 'down')}
                      disabled={idx === rules.length - 1}
                      className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <span>{rule.name}</span>
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
                    onClick={() => {
                      if (confirm(`'${rule.name}' 규칙을 삭제하시겠습니까?`)) {
                        onDeleteRule(rule.id);
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
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
    </div>
  );
};
