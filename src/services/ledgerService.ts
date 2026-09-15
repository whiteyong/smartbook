import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  Account,
  Transaction,
  ClassificationRule,
  Budget,
  ImportBatch,
  HouseholdInfo,
} from '../types';
import {
  INITIAL_ACCOUNTS,
  INITIAL_RULES,
  INITIAL_BUDGETS,
  INITIAL_TRANSACTIONS,
} from '../data/initialLedgerData';

const ACCOUNTS_COL = 'accounts';
const TRANSACTIONS_COL = 'transactions';
const RULES_COL = 'rules';
const BUDGETS_COL = 'budgets';
const BATCHES_COL = 'batches';
const SETTINGS_COL = 'settings';

// Local storage fallback keys
const LS_ACCOUNTS = 'hl_accounts';
const LS_TRANSACTIONS = 'hl_transactions';
const LS_RULES = 'hl_rules';
const LS_BUDGETS = 'hl_budgets';
const LS_BATCHES = 'hl_batches';
const LS_SETTINGS = 'hl_settings';

// 1. Initial Seeding Check
export async function seedInitialLedgerDataIfEmpty(): Promise<boolean> {
  try {
    const accSnap = await getDocs(collection(db, ACCOUNTS_COL));
    if (!accSnap.empty) {
      return false; // 이미 데이터가 있음
    }

    const batch = writeBatch(db);

    // Seed Accounts
    for (const acc of INITIAL_ACCOUNTS) {
      batch.set(doc(db, ACCOUNTS_COL, acc.id), acc);
    }

    // Seed Rules
    for (const rule of INITIAL_RULES) {
      batch.set(doc(db, RULES_COL, rule.id), rule);
    }

    // Seed Budgets
    for (const bg of INITIAL_BUDGETS) {
      batch.set(doc(db, BUDGETS_COL, bg.id), bg);
    }

    // Seed Transactions
    for (const tx of INITIAL_TRANSACTIONS) {
      batch.set(doc(db, TRANSACTIONS_COL, tx.id), tx);
    }

    // Seed Settings
    const defaultSettings: HouseholdInfo = {
      name: '우리 가족 가계부',
      currency: 'KRW',
      fiscalStartDay: 1,
      ownerName: '가계 관리자',
      hideAmounts: false,
    };
    batch.set(doc(db, SETTINGS_COL, 'general'), defaultSettings);

    await batch.commit();
    return true;
  } catch (error) {
    console.warn('Firebase seed failed, checking local storage:', error);
    if (!localStorage.getItem(LS_ACCOUNTS)) {
      localStorage.setItem(LS_ACCOUNTS, JSON.stringify(INITIAL_ACCOUNTS));
      localStorage.setItem(LS_RULES, JSON.stringify(INITIAL_RULES));
      localStorage.setItem(LS_BUDGETS, JSON.stringify(INITIAL_BUDGETS));
      localStorage.setItem(LS_TRANSACTIONS, JSON.stringify(INITIAL_TRANSACTIONS));
    }
    return false;
  }
}

// 2. Real-time Subscriptions with Local Fallback
export function subscribeToAccounts(callback: (accounts: Account[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, ACCOUNTS_COL),
      (snap) => {
        if (!snap.empty) {
          const list: Account[] = [];
          snap.forEach((d) => list.push(d.data() as Account));
          localStorage.setItem(LS_ACCOUNTS, JSON.stringify(list));
          callback(list);
        } else {
          const local = localStorage.getItem(LS_ACCOUNTS);
          callback(local ? JSON.parse(local) : INITIAL_ACCOUNTS);
        }
      },
      () => {
        const local = localStorage.getItem(LS_ACCOUNTS);
        callback(local ? JSON.parse(local) : INITIAL_ACCOUNTS);
      }
    );
  } catch {
    const local = localStorage.getItem(LS_ACCOUNTS);
    callback(local ? JSON.parse(local) : INITIAL_ACCOUNTS);
    return () => {};
  }
}

export function subscribeToTransactions(callback: (txs: Transaction[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, TRANSACTIONS_COL),
      (snap) => {
        if (!snap.empty) {
          const list: Transaction[] = [];
          snap.forEach((d) => list.push(d.data() as Transaction));
          list.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
          localStorage.setItem(LS_TRANSACTIONS, JSON.stringify(list));
          callback(list);
        } else {
          const local = localStorage.getItem(LS_TRANSACTIONS);
          callback(local ? JSON.parse(local) : INITIAL_TRANSACTIONS);
        }
      },
      () => {
        const local = localStorage.getItem(LS_TRANSACTIONS);
        callback(local ? JSON.parse(local) : INITIAL_TRANSACTIONS);
      }
    );
  } catch {
    const local = localStorage.getItem(LS_TRANSACTIONS);
    callback(local ? JSON.parse(local) : INITIAL_TRANSACTIONS);
    return () => {};
  }
}

export function subscribeToRules(callback: (rules: ClassificationRule[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, RULES_COL),
      (snap) => {
        if (!snap.empty) {
          const list: ClassificationRule[] = [];
          snap.forEach((d) => list.push(d.data() as ClassificationRule));
          list.sort((a, b) => a.priority - b.priority);
          localStorage.setItem(LS_RULES, JSON.stringify(list));
          callback(list);
        } else {
          const local = localStorage.getItem(LS_RULES);
          callback(local ? JSON.parse(local) : INITIAL_RULES);
        }
      },
      () => {
        const local = localStorage.getItem(LS_RULES);
        callback(local ? JSON.parse(local) : INITIAL_RULES);
      }
    );
  } catch {
    const local = localStorage.getItem(LS_RULES);
    callback(local ? JSON.parse(local) : INITIAL_RULES);
    return () => {};
  }
}

export function subscribeToBudgets(callback: (budgets: Budget[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, BUDGETS_COL),
      (snap) => {
        if (!snap.empty) {
          const list: Budget[] = [];
          snap.forEach((d) => list.push(d.data() as Budget));
          localStorage.setItem(LS_BUDGETS, JSON.stringify(list));
          callback(list);
        } else {
          const local = localStorage.getItem(LS_BUDGETS);
          callback(local ? JSON.parse(local) : INITIAL_BUDGETS);
        }
      },
      () => {
        const local = localStorage.getItem(LS_BUDGETS);
        callback(local ? JSON.parse(local) : INITIAL_BUDGETS);
      }
    );
  } catch {
    const local = localStorage.getItem(LS_BUDGETS);
    callback(local ? JSON.parse(local) : INITIAL_BUDGETS);
    return () => {};
  }
}

// 3. Transactions CRUD & Batch Operations
export async function addTransaction(tx: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transaction> {
  const id = 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const now = new Date().toISOString();
  const fullTx: Transaction = {
    ...tx,
    id,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, TRANSACTIONS_COL, id), fullTx);
  } catch {
    const local = JSON.parse(localStorage.getItem(LS_TRANSACTIONS) || '[]');
    local.unshift(fullTx);
    localStorage.setItem(LS_TRANSACTIONS, JSON.stringify(local));
  }
  return fullTx;
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  const payload = { ...updates, updatedAt: new Date().toISOString() };
  // 1. Always sync to local storage immediately
  try {
    const local = JSON.parse(localStorage.getItem(LS_TRANSACTIONS) || '[]');
    const idx = local.findIndex((t: Transaction) => t.id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...payload };
      localStorage.setItem(LS_TRANSACTIONS, JSON.stringify(local));
    }
  } catch (e) {
    console.error('LocalStorage sync error:', e);
  }

  // 2. Sync to Firestore
  try {
    await updateDoc(doc(db, TRANSACTIONS_COL, id), payload);
  } catch (err) {
    console.warn('Firestore updateDoc failed, using local storage fallback:', err);
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, TRANSACTIONS_COL, id));
  } catch {
    const local = JSON.parse(localStorage.getItem(LS_TRANSACTIONS) || '[]');
    const filtered = local.filter((t: Transaction) => t.id !== id);
    localStorage.setItem(LS_TRANSACTIONS, JSON.stringify(filtered));
  }
}

export async function addBatchTransactions(txs: Transaction[], batchInfo?: ImportBatch): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const tx of txs) {
      batch.set(doc(db, TRANSACTIONS_COL, tx.id), tx);
    }
    if (batchInfo) {
      batch.set(doc(db, BATCHES_COL, batchInfo.id), batchInfo);
    }
    await batch.commit();
  } catch {
    const local = JSON.parse(localStorage.getItem(LS_TRANSACTIONS) || '[]');
    local.unshift(...txs);
    localStorage.setItem(LS_TRANSACTIONS, JSON.stringify(local));
  }
}

export async function batchUpdateTransactions(txs: Transaction[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const tx of txs) {
      batch.set(doc(db, TRANSACTIONS_COL, tx.id), tx, { merge: true });
    }
    await batch.commit();
  } catch {
    localStorage.setItem(LS_TRANSACTIONS, JSON.stringify(txs));
  }
}

export async function undoBatchImport(batchId: string): Promise<number> {
  try {
    const snap = await getDocs(collection(db, TRANSACTIONS_COL));
    const toDelete: string[] = [];
    snap.forEach((d) => {
      const data = d.data() as Transaction;
      if (data.importBatchId === batchId) {
        toDelete.push(d.id);
      }
    });

    const batch = writeBatch(db);
    for (const id of toDelete) {
      batch.delete(doc(db, TRANSACTIONS_COL, id));
    }
    batch.delete(doc(db, BATCHES_COL, batchId));
    await batch.commit();
    return toDelete.length;
  } catch {
    return 0;
  }
}

// 4. Accounts CRUD
export async function addAccount(account: Omit<Account, 'id'>): Promise<Account> {
  const id = 'acc_' + Date.now();
  const fullAccount: Account = { ...account, id };
  try {
    await setDoc(doc(db, ACCOUNTS_COL, id), fullAccount);
  } catch {
    const local = JSON.parse(localStorage.getItem(LS_ACCOUNTS) || '[]');
    local.push(fullAccount);
    localStorage.setItem(LS_ACCOUNTS, JSON.stringify(local));
  }
  return fullAccount;
}

export async function updateAccount(id: string, updates: Partial<Account>): Promise<void> {
  try {
    await updateDoc(doc(db, ACCOUNTS_COL, id), updates);
  } catch {
    const local = JSON.parse(localStorage.getItem(LS_ACCOUNTS) || '[]');
    const idx = local.findIndex((a: Account) => a.id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...updates };
      localStorage.setItem(LS_ACCOUNTS, JSON.stringify(local));
    }
  }
}

export async function deleteAccount(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, ACCOUNTS_COL, id));
  } catch {
    const local = JSON.parse(localStorage.getItem(LS_ACCOUNTS) || '[]');
    const filtered = local.filter((a: Account) => a.id !== id);
    localStorage.setItem(LS_ACCOUNTS, JSON.stringify(filtered));
  }
}

// 5. Rules CRUD & Evaluation Engine
export async function addRule(rule: Omit<ClassificationRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<ClassificationRule> {
  const id = 'rule_' + Date.now();
  const now = new Date().toISOString();
  const fullRule: ClassificationRule = {
    ...rule,
    id,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, RULES_COL, id), fullRule);
  } catch {
    const local = JSON.parse(localStorage.getItem(LS_RULES) || '[]');
    local.push(fullRule);
    localStorage.setItem(LS_RULES, JSON.stringify(local));
  }
  return fullRule;
}

export async function updateRule(id: string, updates: Partial<ClassificationRule>): Promise<void> {
  const payload = { ...updates, updatedAt: new Date().toISOString() };
  try {
    await updateDoc(doc(db, RULES_COL, id), payload);
  } catch {
    const local = JSON.parse(localStorage.getItem(LS_RULES) || '[]');
    const idx = local.findIndex((r: ClassificationRule) => r.id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...payload };
      localStorage.setItem(LS_RULES, JSON.stringify(local));
    }
  }
}

export async function deleteRule(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, RULES_COL, id));
  } catch {
    const local = JSON.parse(localStorage.getItem(LS_RULES) || '[]');
    const filtered = local.filter((r: ClassificationRule) => r.id !== id);
    localStorage.setItem(LS_RULES, JSON.stringify(filtered));
  }
}

// Match transaction against rule condition
export function matchRuleCondition(tx: Transaction, cond: ClassificationRule['condition']): boolean {
  if (cond.direction && tx.direction !== cond.direction) return false;
  if (cond.accountId && tx.accountId !== cond.accountId) return false;
  if (cond.minAmount && tx.amount < cond.minAmount) return false;
  if (cond.maxAmount && tx.amount > cond.maxAmount) return false;

  if (cond.startDay !== undefined && cond.endDay !== undefined) {
    const day = new Date(tx.occurredAt).getDate();
    if (day < cond.startDay || day > cond.endDay) return false;
  }

  if (cond.keyword && cond.keyword.trim()) {
    const kw = cond.keyword.trim();
    const targetText = `${tx.rawCounterparty || ''} ${tx.counterparty || ''} ${tx.rawDescription || ''} ${tx.memo || ''}`;

    if (cond.matchType === 'exact') {
      if (tx.counterparty !== kw && tx.rawCounterparty !== kw && tx.rawDescription !== kw) {
        return false;
      }
    } else if (cond.matchType === 'regex') {
      try {
        const re = new RegExp(kw, 'i');
        if (!re.test(targetText)) return false;
      } catch {
        return false;
      }
    } else {
      // contains
      if (!targetText.toLowerCase().includes(kw.toLowerCase())) {
        return false;
      }
    }
  }

  return true;
}

// Evaluate rules in priority order on a transaction
export function applyRulesToTransaction(
  tx: Transaction,
  rules: ClassificationRule[]
): { modified: boolean; updatedTx: Transaction; matchedRuleId?: string } {
  // If transaction is manually locked, do not overwrite classification!
  if (tx.isManualLocked) {
    return { modified: false, updatedTx: tx };
  }

  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (!rule.isActive) continue;

    // Rule 1 is Transfer matching (handled by detectTransfers)
    if (rule.condition.matchType === 'contains' && !rule.condition.keyword && !rule.condition.direction) {
      continue;
    }

    if (matchRuleCondition(tx, rule.condition)) {
      return {
        modified: true,
        updatedTx: {
          ...tx,
          type: rule.result.type,
          category: rule.result.category,
          tags: rule.result.tags ? Array.from(new Set([...tx.tags, ...rule.result.tags])) : tx.tags,
          isFixed: rule.result.isFixed !== undefined ? rule.result.isFixed : tx.isFixed,
          isConfirmed: rule.result.autoConfirm ? true : tx.isConfirmed,
        },
        matchedRuleId: rule.id,
      };
    }
  }

  return { modified: false, updatedTx: tx };
}

// 6. F-03: 계좌 간 이체(Transfer) 자동 감지 엔진
export function detectTransfers(
  transactions: Transaction[],
  accounts: Account[]
): { updatedTransactions: Transaction[]; transferCount: number } {
  const myAccountIds = new Set(accounts.map((a) => a.id));
  const txList = transactions.map((t) => ({ ...t }));
  let transferCount = 0;

  // Group by absolute amount
  const amountGroups: Record<number, Transaction[]> = {};
  for (const tx of txList) {
    if (!myAccountIds.has(tx.accountId)) continue;
    if (!amountGroups[tx.amount]) amountGroups[tx.amount] = [];
    amountGroups[tx.amount].push(tx);
  }

  for (const amount in amountGroups) {
    const group = amountGroups[amount];
    if (group.length < 2) continue;

    const outs = group.filter((t) => t.direction === 'out' && !t.transferPairId && !t.isManualLocked);
    const ins = group.filter((t) => t.direction === 'in' && !t.transferPairId && !t.isManualLocked);

    for (const outTx of outs) {
      if (outTx.transferPairId) continue;
      const outDate = new Date(outTx.occurredAt).getTime();

      // Find counterpart within ±3 days (3 * 86400 * 1000 ms) in different account
      const matchIn = ins.find((inTx) => {
        if (inTx.transferPairId) return false;
        if (inTx.accountId === outTx.accountId) return false; // 다른 계좌여야 함
        const inDate = new Date(inTx.occurredAt).getTime();
        const diffDays = Math.abs(outDate - inDate) / (1000 * 60 * 60 * 24);
        return diffDays <= 3;
      });

      if (matchIn) {
        // Pair them as transfer!
        outTx.type = 'transfer';
        outTx.category = '이체 > 통장간이체';
        outTx.transferPairId = matchIn.id;
        outTx.transferAccountAlias = matchIn.accountAlias;
        outTx.tags = Array.from(new Set([...outTx.tags, '내통장이체']));

        matchIn.type = 'transfer';
        matchIn.category = '이체 > 통장간이체';
        matchIn.transferPairId = outTx.id;
        matchIn.transferAccountAlias = outTx.accountAlias;
        matchIn.tags = Array.from(new Set([...matchIn.tags, '내통장이체']));

        transferCount++;
      }
    }
  }

  return { updatedTransactions: txList, transferCount };
}

// 7. Calculate Account Balances
export function calculateAccountBalances(
  accounts: Account[],
  transactions: Transaction[]
): Account[] {
  return accounts.map((acc) => {
    const accTxs = transactions.filter((t) => t.accountId === acc.id);
    let currentBalance = acc.initialBalance;

    // Sum transactions:
    // In direction: + amount
    // Out direction: - amount
    for (const tx of accTxs) {
      if (tx.direction === 'in') {
        currentBalance += tx.amount;
      } else {
        currentBalance -= tx.amount;
      }
    }

    const latestTx = accTxs.length > 0 ? accTxs[0] : null;

    return {
      ...acc,
      currentBalance,
      lastUpdated: latestTx ? latestTx.occurredAt : acc.asOfDate,
    };
  });
}

// 8. Budgets CRUD
export async function updateBudget(id: string, updates: Partial<Budget>): Promise<void> {
  try {
    await updateDoc(doc(db, BUDGETS_COL, id), updates);
  } catch {
    const local = JSON.parse(localStorage.getItem(LS_BUDGETS) || '[]');
    const idx = local.findIndex((b: Budget) => b.id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...updates };
      localStorage.setItem(LS_BUDGETS, JSON.stringify(local));
    }
  }
}

export async function addBudget(budget: Omit<Budget, 'id'>): Promise<Budget> {
  const id = 'b_' + Date.now();
  const fullBudget = { ...budget, id };
  try {
    await setDoc(doc(db, BUDGETS_COL, id), fullBudget);
  } catch {
    const local = JSON.parse(localStorage.getItem(LS_BUDGETS) || '[]');
    local.push(fullBudget);
    localStorage.setItem(LS_BUDGETS, JSON.stringify(local));
  }
  return fullBudget;
}
