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
  AccountRoleConfig,
  AccountConfig,
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
const LS_ACCOUNT_CONFIG = 'hl_account_config';

export const DEFAULT_BANKS: string[] = [
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

export const DEFAULT_ACCOUNT_ROLES: AccountRoleConfig[] = [
  { id: 'salary', label: '급여 수신', description: '급여 및 부수입 입금 전용 통장', color: '#6366F1', isDefault: true },
  { id: 'fixed', label: '고정비', description: '월세/관리비/보험/대출 등 고정 지출 통장', color: '#F59E0B', isDefault: true },
  { id: 'living', label: '생활비', description: '식비/생필품/교통 등 변동 생활비 (체크카드 연동)', color: '#10B981', isDefault: true },
  { id: 'savings', label: '저축/비상금', description: '청약/적금/파킹통장/투자 및 비상금 예치', color: '#3B82F6', isDefault: true },
];

export const DEFAULT_ACCOUNT_CONFIG: AccountConfig = {
  banks: DEFAULT_BANKS,
  roles: DEFAULT_ACCOUNT_ROLES,
};

/**
 * Recursively strips keys with `undefined` values to prevent Firestore unsupported field value errors.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (value !== undefined) {
      cleaned[key] = typeof value === 'object' && value !== null ? sanitizeForFirestore(value) : value;
    }
  }
  return cleaned as T;
}

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
      batch.set(doc(db, ACCOUNTS_COL, acc.id), sanitizeForFirestore(acc));
    }

    // Seed Rules
    for (const rule of INITIAL_RULES) {
      batch.set(doc(db, RULES_COL, rule.id), sanitizeForFirestore(rule));
    }

    // Seed Budgets
    for (const bg of INITIAL_BUDGETS) {
      batch.set(doc(db, BUDGETS_COL, bg.id), sanitizeForFirestore(bg));
    }

    // Seed Transactions
    for (const tx of INITIAL_TRANSACTIONS) {
      batch.set(doc(db, TRANSACTIONS_COL, tx.id), sanitizeForFirestore(tx));
    }

    // Seed Settings
    const defaultSettings: HouseholdInfo = {
      name: '우리 가족 가계부',
      currency: 'KRW',
      fiscalStartDay: 1,
      ownerName: '가계 관리자',
      hideAmounts: false,
    };
    batch.set(doc(db, SETTINGS_COL, 'general'), sanitizeForFirestore(defaultSettings));
    batch.set(doc(db, SETTINGS_COL, 'account_config'), sanitizeForFirestore(DEFAULT_ACCOUNT_CONFIG));

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
    if (!localStorage.getItem(LS_ACCOUNT_CONFIG)) {
      localStorage.setItem(LS_ACCOUNT_CONFIG, JSON.stringify(DEFAULT_ACCOUNT_CONFIG));
    }
    return false;
  }
}

// Account Config (Bank names & Account roles) subscription & persistence
export function subscribeToAccountConfig(callback: (config: AccountConfig) => void): () => void {
  try {
    return onSnapshot(
      doc(db, SETTINGS_COL, 'account_config'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<AccountConfig>;
          const config: AccountConfig = {
            banks: data.banks && Array.isArray(data.banks) && data.banks.length > 0 ? data.banks : DEFAULT_BANKS,
            roles: data.roles && Array.isArray(data.roles) && data.roles.length > 0 ? data.roles : DEFAULT_ACCOUNT_ROLES,
          };
          localStorage.setItem(LS_ACCOUNT_CONFIG, JSON.stringify(config));
          callback(config);
        } else {
          const local = localStorage.getItem(LS_ACCOUNT_CONFIG);
          const config = local ? JSON.parse(local) : DEFAULT_ACCOUNT_CONFIG;
          callback(config);
        }
      },
      () => {
        const local = localStorage.getItem(LS_ACCOUNT_CONFIG);
        const config = local ? JSON.parse(local) : DEFAULT_ACCOUNT_CONFIG;
        callback(config);
      }
    );
  } catch {
    const local = localStorage.getItem(LS_ACCOUNT_CONFIG);
    const config = local ? JSON.parse(local) : DEFAULT_ACCOUNT_CONFIG;
    callback(config);
    return () => {};
  }
}

export async function saveAccountConfig(config: AccountConfig): Promise<void> {
  localStorage.setItem(LS_ACCOUNT_CONFIG, JSON.stringify(config));
  const sanitized = sanitizeForFirestore({
    ...config,
    updatedAt: new Date().toISOString(),
  });
  try {
    await setDoc(doc(db, SETTINGS_COL, 'account_config'), sanitized);
  } catch (err) {
    console.warn('Firestore setDoc account_config failed, saved to local storage:', err);
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
    const sanitized = sanitizeForFirestore(fullTx);
    await setDoc(doc(db, TRANSACTIONS_COL, id), sanitized);
  } catch {
    const local = JSON.parse(localStorage.getItem(LS_TRANSACTIONS) || '[]');
    local.unshift(fullTx);
    localStorage.setItem(LS_TRANSACTIONS, JSON.stringify(local));
  }
  return fullTx;
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  const payload = sanitizeForFirestore({ ...updates, updatedAt: new Date().toISOString() });
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
      batch.set(doc(db, TRANSACTIONS_COL, tx.id), sanitizeForFirestore(tx));
    }
    if (batchInfo) {
      batch.set(doc(db, BATCHES_COL, batchInfo.id), sanitizeForFirestore(batchInfo));
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
      batch.set(doc(db, TRANSACTIONS_COL, tx.id), sanitizeForFirestore(tx), { merge: true });
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
  const fullAccount: Account = {
    ...account,
    id,
    memo: account.memo || '',
    rawAccountNumber: account.rawAccountNumber || account.accountNumber,
  };
  const sanitized = sanitizeForFirestore(fullAccount);
  try {
    const local = JSON.parse(localStorage.getItem(LS_ACCOUNTS) || '[]');
    const exists = local.some((a: Account) => a.id === id);
    if (!exists) {
      local.push(sanitized);
      localStorage.setItem(LS_ACCOUNTS, JSON.stringify(local));
    }
  } catch (err) {
    console.error('Failed to save account to localStorage:', err);
  }

  // Sync to Firestore without blocking UI
  setDoc(doc(db, ACCOUNTS_COL, id), sanitized).catch((err) => {
    console.warn('Firestore addAccount sync failed, saved locally:', err);
  });

  return sanitized;
}

export async function updateAccount(id: string, updates: Partial<Account>): Promise<void> {
  const sanitized = sanitizeForFirestore(updates);
  try {
    const local = JSON.parse(localStorage.getItem(LS_ACCOUNTS) || '[]');
    const idx = local.findIndex((a: Account) => a.id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...sanitized };
      localStorage.setItem(LS_ACCOUNTS, JSON.stringify(local));
    }
  } catch (err) {
    console.error('Failed to update account in localStorage:', err);
  }

  updateDoc(doc(db, ACCOUNTS_COL, id), sanitized).catch((err) => {
    console.warn('Firestore updateAccount sync failed, saved locally:', err);
  });
}

export async function deleteAccount(id: string): Promise<void> {
  try {
    const local = JSON.parse(localStorage.getItem(LS_ACCOUNTS) || '[]');
    const filtered = local.filter((a: Account) => a.id !== id);
    localStorage.setItem(LS_ACCOUNTS, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to delete account in localStorage:', err);
  }

  deleteDoc(doc(db, ACCOUNTS_COL, id)).catch((err) => {
    console.warn('Firestore deleteAccount sync failed, saved locally:', err);
  });
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
    const sanitizedRule = sanitizeForFirestore(fullRule);
    await setDoc(doc(db, RULES_COL, id), sanitizedRule);
  } catch {
    const local = JSON.parse(localStorage.getItem(LS_RULES) || '[]');
    local.push(fullRule);
    localStorage.setItem(LS_RULES, JSON.stringify(local));
  }
  return fullRule;
}

export async function updateRule(id: string, updates: Partial<ClassificationRule>): Promise<void> {
  const payload = sanitizeForFirestore({ ...updates, updatedAt: new Date().toISOString() });
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
        // Link them as transfer!
        const linkId = `link_${outTx.id}_${matchIn.id}`;

        outTx.type = 'transfer';
        outTx.category = '이체 > 통장간이체';
        outTx.transfer_link_id = linkId;
        outTx.transfer_role = 'from';
        outTx.is_auto_linked = true;
        outTx.isConfirmed = true;
        outTx.transferPairId = matchIn.id;
        outTx.transferAccountAlias = matchIn.accountAlias;
        outTx.tags = Array.from(new Set([...outTx.tags, '내통장이체']));

        matchIn.type = 'transfer';
        matchIn.category = '이체 > 통장간이체';
        matchIn.transfer_link_id = linkId;
        matchIn.transfer_role = 'to';
        matchIn.is_auto_linked = true;
        matchIn.isConfirmed = true;
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
  const sanitized = sanitizeForFirestore(updates);
  // 1. Always update local storage first so changes are preserved immediately
  try {
    const local = JSON.parse(localStorage.getItem(LS_BUDGETS) || '[]');
    const idx = local.findIndex((b: Budget) => b.id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...sanitized };
      localStorage.setItem(LS_BUDGETS, JSON.stringify(local));
    }
  } catch (err) {
    console.error('LocalStorage updateBudget error:', err);
  }

  // 2. Persist to Firestore with merge: true (creates doc if it did not exist yet in Firestore)
  try {
    await setDoc(doc(db, BUDGETS_COL, id), sanitized, { merge: true });
  } catch (err) {
    console.warn('Firestore updateBudget sync failed, saved locally:', err);
  }
}

export async function addBudget(budget: Omit<Budget, 'id'>): Promise<Budget> {
  const id = 'b_' + Date.now();
  const fullBudget = { ...budget, id };
  const sanitized = sanitizeForFirestore(fullBudget);

  // 1. Immediately update local storage
  try {
    const local = JSON.parse(localStorage.getItem(LS_BUDGETS) || '[]');
    local.push(sanitized);
    localStorage.setItem(LS_BUDGETS, JSON.stringify(local));
  } catch (err) {
    console.error('LocalStorage addBudget error:', err);
  }

  // 2. Sync to Firestore
  try {
    await setDoc(doc(db, BUDGETS_COL, id), sanitized);
  } catch (err) {
    console.warn('Firestore addBudget sync failed, saved locally:', err);
  }
  return sanitized;
}

export async function deleteBudget(id: string): Promise<void> {
  // 1. Immediately update local storage
  try {
    const local = JSON.parse(localStorage.getItem(LS_BUDGETS) || '[]');
    const filtered = local.filter((b: Budget) => b.id !== id);
    localStorage.setItem(LS_BUDGETS, JSON.stringify(filtered));
  } catch (err) {
    console.error('LocalStorage deleteBudget error:', err);
  }

  // 2. Delete from Firestore
  try {
    await deleteDoc(doc(db, BUDGETS_COL, id));
  } catch (err) {
    console.warn('Firestore deleteBudget sync failed, deleted locally:', err);
  }
}
