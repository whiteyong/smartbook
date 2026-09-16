import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { S1Dashboard } from './components/S1Dashboard';
import { S2Upload } from './components/S2Upload';
import { S3Transactions } from './components/S3Transactions';
import { S4Rules } from './components/S4Rules';
import { S5Budget } from './components/S5Budget';
import { S6Accounts } from './components/S6Accounts';
import { QuickAddModal } from './components/QuickAddModal';
import {
  Account,
  Transaction,
  ClassificationRule,
  Budget,
} from './types';
import {
  subscribeToAccounts,
  subscribeToTransactions,
  subscribeToRules,
  subscribeToBudgets,
  seedInitialLedgerDataIfEmpty,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  addAccount,
  updateAccount,
  deleteAccount,
  addRule,
  updateRule,
  deleteRule,
  addBudget,
  updateBudget,
  deleteBudget,
  batchUpdateTransactions,
} from './services/ledgerService';

export default function App() {
  const [currentTab, setCurrentTab] = useState<
    'dashboard' | 'upload' | 'transactions' | 'rules' | 'budget' | 'accounts'
  >('dashboard');

  // Month state (defaults to September 2026 as per user mock data & PRD)
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-09');

  // Account filter from Header
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');

  // Privacy: Hide amounts toggle
  const [hideAmounts, setHideAmounts] = useState<boolean>(false);

  // Quick Add Modal
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);

  // Filters forwarded to S3 when navigating from S1 or alerts
  const [txInitialFilter, setTxInitialFilter] = useState<{
    category?: string;
    accountId?: string;
    unclassifiedOnly?: boolean;
    type?: string;
  } | undefined>(undefined);

  // Data states
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Subscriptions to Firestore / LocalStorage
  useEffect(() => {
    seedInitialLedgerDataIfEmpty();

    const unsubAccounts = subscribeToAccounts((loaded) => setAccounts(loaded));
    const unsubTxs = subscribeToTransactions((loaded) => {
      setTransactions(loaded);
      setIsLoading(false);
    });
    const unsubRules = subscribeToRules((loaded) => setRules(loaded));
    const unsubBudgets = subscribeToBudgets((loaded) => setBudgets(loaded));

    return () => {
      unsubAccounts();
      unsubTxs();
      unsubRules();
      unsubBudgets();
    };
  }, []);

  // Filtered transactions for selected account (if filtered from top header)
  const effectiveTransactions = useMemo(() => {
    if (selectedAccountId === 'all') return transactions;
    return transactions.filter((t) => t.accountId === selectedAccountId);
  }, [transactions, selectedAccountId]);

  // Needs Attention Count (미분류 거래 및 연결 필요 이체)
  const needsAttentionCount = useMemo(() => {
    return transactions.filter(
      (t) =>
        t.occurredAt.startsWith(selectedMonth) &&
        (t.category === '미분류' ||
          !t.isConfirmed ||
          ((t.type === 'transfer' || t.category.startsWith('이체')) &&
            !t.transfer_link_id &&
            !t.transferPairId))
    ).length;
  }, [transactions, selectedMonth]);

  // Navigation helpers
  const handleNavigateToTransactions = (filter?: {
    category?: string;
    accountId?: string;
    unclassifiedOnly?: boolean;
    type?: string;
  }) => {
    setTxInitialFilter(filter);
    setCurrentTab('transactions');
  };

  const handleOpenNeedsAttention = () => {
    handleNavigateToTransactions({ unclassifiedOnly: true });
  };

  // Optimistic Transaction Updates (Instant UI reactivity)
  const handleUpdateTransaction = async (id: string, updates: Partial<Transaction>) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t))
    );
    await updateTransaction(id, updates);
  };

  const handleDeleteTransaction = async (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    await deleteTransaction(id);
  };

  // Optimistic Account Updates (Instant UI reactivity on registration / editing)
  const handleAddAccount = async (newAcc: Omit<Account, 'id'>) => {
    const created = await addAccount(newAcc);
    setAccounts((prev) => {
      const idx = prev.findIndex((a) => a.id === created.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = created;
        return next;
      }
      return [...prev, created];
    });
    return created;
  };

  const handleUpdateAccount = async (id: string, updates: Partial<Account>) => {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
    await updateAccount(id, updates);
  };

  const handleDeleteAccount = async (id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    await deleteAccount(id);
  };

  // Optimistic Budget Updates (Instant UI reactivity on budget edit/addition)
  const handleUpdateBudget = async (id: string, updates: Partial<Budget>) => {
    setBudgets((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
    );
    await updateBudget(id, updates);
  };

  const handleAddBudget = async (newBudget: Omit<Budget, 'id'>) => {
    const created = await addBudget(newBudget);
    setBudgets((prev) => {
      const idx = prev.findIndex(
        (b) =>
          b.id === created.id ||
          (b.targetType === created.targetType &&
            b.targetId === created.targetId &&
            b.month === created.month)
      );
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = created;
        return next;
      }
      return [...prev, created];
    });
    return created;
  };

  const handleDeleteBudget = async (id: string) => {
    setBudgets((prev) => prev.filter((b) => b.id !== id));
    await deleteBudget(id);
  };

  // Rule creation promotion from transaction
  const handleCreateRuleFromTransaction = async (tx: Transaction, category: string) => {
    if (!tx.counterparty || tx.counterparty.trim() === '') {
      return;
    }

    // 1. Determine resolved transaction type based on category
    let resolvedType = tx.type;
    if (category.startsWith('수입')) resolvedType = 'income';
    else if (category.startsWith('저축')) resolvedType = 'savings';
    else if (category.startsWith('이체')) resolvedType = 'transfer';
    else if (category !== '미분류') resolvedType = 'expense';

    // 2. Add rule to rules state & storage
    const maxPriority = rules.reduce((max, r) => Math.max(max, r.priority), 0);
    const ruleName = `${tx.counterparty} 자동분류`;
    const newRule = await addRule({
      name: ruleName,
      priority: maxPriority + 1,
      condition: {
        keyword: tx.counterparty,
        direction: tx.direction,
        matchType: 'contains',
      },
      result: {
        type: resolvedType,
        category,
        isFixed: tx.isFixed,
        autoConfirm: true,
      },
      isActive: true,
      appliedCount: 1,
    });

    setRules((prev) => [...prev, newRule]);

    // 3. Update current transaction and all other unconfirmed transactions with same counterparty
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.id === tx.id) {
          return {
            ...t,
            category,
            type: resolvedType,
            isConfirmed: true,
            isManualLocked: false,
            updatedAt: new Date().toISOString(),
          };
        }
        // Also auto-classify unclassified matching transactions with the same counterparty
        if (
          t.counterparty.toLowerCase().includes(tx.counterparty.toLowerCase()) &&
          t.direction === tx.direction &&
          (!t.isConfirmed || t.category === '미분류') &&
          !t.isManualLocked
        ) {
          return {
            ...t,
            category,
            type: resolvedType,
            isConfirmed: true,
            updatedAt: new Date().toISOString(),
          };
        }
        return t;
      })
    );

    // 4. Persist current transaction update
    await handleUpdateTransaction(tx.id, {
      category,
      type: resolvedType,
      isConfirmed: true,
      isManualLocked: false,
    });
  };

  // Titles for Header
  const tabMeta: Record<string, { title: string; description: string }> = {
    dashboard: {
      title: '가계 대시보드 (S1)',
      description: '이달의 수입, 지출, 수지 현황 및 통장별 봉투 예산 소진율',
    },
    upload: {
      title: '은행 엑셀 업로드 (S2)',
      description: '계좌 선택, 자동 열 매핑, 중복 거래 배제 및 계좌 간 이체 자동 감지',
    },
    transactions: {
      title: '거래 내역 조회 및 편집 (S3)',
      description: '조건별 검색, 일괄 카테고리 지정, 1:N 거래 분할(Split) 및 이체 쌍 관리',
    },
    rules: {
      title: '자동 분류 규칙 엔진 (S4)',
      description: '우선순위 순 키워드 조건 매칭 및 과거 거래 일괄 재적용',
    },
    budget: {
      title: '통장 분리형 봉투 예산 (S5)',
      description: '통장 = 봉투 물리적 지출 상한 관리 및 월 경과일 대비 지출 페이스',
    },
    accounts: {
      title: '통장 계좌 및 잔액 관리 (S6)',
      description: '초기 잔액 기준 실시간 잔액 검증 및 1원 단위 무결성 보장',
    },
  };

  if (isLoading && accounts.length === 0) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 text-slate-600">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        <span className="mt-3 text-xs font-semibold">가계부 데이터를 불러오는 중입니다...</span>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex bg-slate-50 overflow-hidden font-sans antialiased text-slate-900">
      {/* Left Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={(tab) => {
          if (tab === 'transactions') setTxInitialFilter(undefined);
          setCurrentTab(tab);
        }}
        accounts={accounts}
        hideAmounts={hideAmounts}
        onToggleHideAmounts={() => setHideAmounts(!hideAmounts)}
        needsAttentionCount={needsAttentionCount}
      />

      {/* Right Main Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <Header
          currentTab={currentTab}
          title={tabMeta[currentTab]?.title || '가정용 가계부'}
          description={tabMeta[currentTab]?.description || ''}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelectAccountId={setSelectedAccountId}
          needsAttentionCount={needsAttentionCount}
          onOpenNeedsAttention={handleOpenNeedsAttention}
          onOpenQuickAdd={() => setIsQuickAddOpen(true)}
          onOpenUpload={() => setCurrentTab('upload')}
        />

        {/* View Content Router */}
        <main className="flex-1 overflow-y-auto bg-slate-50/70">
          {currentTab === 'dashboard' && (
            <S1Dashboard
              selectedMonth={selectedMonth}
              accounts={accounts}
              transactions={effectiveTransactions}
              budgets={budgets}
              hideAmounts={hideAmounts}
              onNavigateToTransactions={handleNavigateToTransactions}
              onNavigateToUpload={() => setCurrentTab('upload')}
              onNavigateToBudget={() => setCurrentTab('budget')}
              onUpdateBudget={handleUpdateBudget}
              onAddBudget={handleAddBudget}
            />
          )}

          {currentTab === 'upload' && (
            <S2Upload
              accounts={accounts}
              transactions={transactions}
              rules={rules}
              onUploadSuccess={() => {
                setCurrentTab('dashboard');
              }}
            />
          )}

          {currentTab === 'transactions' && (
            <S3Transactions
              transactions={effectiveTransactions}
              accounts={accounts}
              hideAmounts={hideAmounts}
              initialFilter={txInitialFilter}
              onUpdateTransaction={handleUpdateTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              onCreateRuleFromTransaction={handleCreateRuleFromTransaction}
              rules={rules}
              onDeleteRule={async (id) => {
                await deleteRule(id);
                setRules((prev) => prev.filter((rule) => rule.id !== id));
              }}
            />
          )}

          {currentTab === 'rules' && (
            <S4Rules
              rules={rules}
              transactions={transactions}
              accounts={accounts}
              onAddRule={addRule}
              onUpdateRule={updateRule}
              onDeleteRule={deleteRule}
              onBatchUpdateTransactions={batchUpdateTransactions}
            />
          )}

          {currentTab === 'budget' && (
            <S5Budget
              selectedMonth={selectedMonth}
              accounts={accounts}
              budgets={budgets}
              transactions={effectiveTransactions}
              hideAmounts={hideAmounts}
              onUpdateBudget={handleUpdateBudget}
              onAddBudget={handleAddBudget}
              onDeleteBudget={handleDeleteBudget}
            />
          )}

          {currentTab === 'accounts' && (
            <S6Accounts
              accounts={accounts}
              transactions={transactions}
              hideAmounts={hideAmounts}
              onAddAccount={handleAddAccount}
              onUpdateAccount={handleUpdateAccount}
              onDeleteAccount={handleDeleteAccount}
              onCreateAdjustmentTx={async (accId, diff) => {
                const targetAcc = accounts.find((a) => a.id === accId);
                await addTransaction({
                  accountId: accId,
                  accountAlias: targetAcc?.alias || '',
                  occurredAt: `${selectedMonth}-01 00:00:00`,
                  counterparty: '잔액 보정 거래',
                  rawCounterparty: '잔액 보정 거래',
                  rawDescription: '계좌 잔액 맞춤 보정',
                  amount: Math.abs(diff),
                  direction: diff > 0 ? 'in' : 'out',
                  type: diff > 0 ? 'income' : 'expense',
                  category: '기타 > 잔액보정',
                  isFixed: false,
                  isConfirmed: true,
                  isManualLocked: true,
                  tags: ['잔액보정'],
                });
              }}
            />
          )}
        </main>
      </div>

      {/* Quick Transaction Registration Modal */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        accounts={accounts}
        selectedMonth={selectedMonth}
        onAddTransaction={addTransaction}
      />
    </div>
  );
}
