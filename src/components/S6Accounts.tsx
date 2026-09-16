import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Plus,
  Edit3,
  Trash2,
  Shield,
  Eye,
  EyeOff,
  AlertCircle,
  HelpCircle,
  X,
  Settings,
  ChevronDown,
  Check,
} from 'lucide-react';
import { Account, AccountRole, Transaction, AccountConfig, AccountRoleConfig } from '../types';
import { formatKRW, maskAccountNumber } from '../utils/formatters';
import {
  subscribeToAccountConfig,
  saveAccountConfig,
  DEFAULT_ACCOUNT_CONFIG,
} from '../services/ledgerService';
import { AccountSettingsModal } from './AccountSettingsModal';

interface S6AccountsProps {
  accounts: Account[];
  transactions: Transaction[];
  hideAmounts: boolean;
  onAddAccount: (acc: Omit<Account, 'id'>) => Promise<any>;
  onUpdateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  onDeleteAccount: (id: string) => Promise<void>;
  onCreateAdjustmentTx: (accountId: string, diff: number) => Promise<void>;
}

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
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);

  // Configuration state (banks & roles)
  const [accountConfig, setAccountConfig] = useState<AccountConfig>(DEFAULT_ACCOUNT_CONFIG);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'banks' | 'roles'>('banks');

  // Form states
  const [bankName, setBankName] = useState(accountConfig.banks[0] || 'KB국민은행');
  const [accountNumber, setAccountNumber] = useState('');
  const [alias, setAlias] = useState('');
  const [role, setRole] = useState<AccountRole>('living');
  const [initialBalance, setInitialBalance] = useState<number>(0);
  const [asOfDate, setAsOfDate] = useState('2026-07-01');
  const [color, setColor] = useState('#3B82F6');
  const [isPublic, setIsPublic] = useState(true);
  const [memo, setMemo] = useState('');

  // Dropdown states for "통장 역할 구분" & "은행명"
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isInlineRoleAdd, setIsInlineRoleAdd] = useState(false);
  const [quickRoleLabel, setQuickRoleLabel] = useState('');
  const [quickRoleDesc, setQuickRoleDesc] = useState('');
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  const [isBankDropdownOpen, setIsBankDropdownOpen] = useState(false);
  const [isInlineBankAdd, setIsInlineBankAdd] = useState(false);
  const [quickBankName, setQuickBankName] = useState('');
  const bankDropdownRef = useRef<HTMLDivElement>(null);

  // Unmask account numbers toggle for security
  const [showFullAccountNumbers, setShowFullAccountNumbers] = useState(false);

  // Subscribe to persistent account configuration (banks and roles)
  useEffect(() => {
    const unsub = subscribeToAccountConfig((cfg) => {
      setAccountConfig(cfg);
    });
    return () => unsub();
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        roleDropdownRef.current &&
        !roleDropdownRef.current.contains(event.target as Node)
      ) {
        setIsRoleDropdownOpen(false);
        setIsInlineRoleAdd(false);
      }
      if (
        bankDropdownRef.current &&
        !bankDropdownRef.current.contains(event.target as Node)
      ) {
        setIsBankDropdownOpen(false);
        setIsInlineBankAdd(false);
      }
    };

    if (isRoleDropdownOpen || isBankDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isRoleDropdownOpen, isBankDropdownOpen]);

  const openCreateModal = () => {
    setEditingAccountId(null);
    setBankName(accountConfig.banks[0] || 'KB국민은행');
    setAccountNumber('');
    setAlias('');
    setRole(accountConfig.roles[0]?.id || 'living');
    setInitialBalance(0);
    setAsOfDate(new Date().toISOString().split('T')[0]);
    setColor('#10B981');
    setIsPublic(true);
    setMemo('');
    setIsRoleDropdownOpen(false);
    setIsInlineRoleAdd(false);
    setIsBankDropdownOpen(false);
    setIsInlineBankAdd(false);
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
    setIsRoleDropdownOpen(false);
    setIsInlineRoleAdd(false);
    setIsBankDropdownOpen(false);
    setIsInlineBankAdd(false);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alias.trim() || !accountNumber.trim()) return;

    const rawNumber = accountNumber.trim();
    const memoText = memo.trim() || '';

    if (editingAccountId) {
      await onUpdateAccount(editingAccountId, {
        bankName,
        accountNumber: rawNumber,
        rawAccountNumber: rawNumber,
        alias: alias.trim(),
        role,
        initialBalance,
        asOfDate,
        color,
        isPublic,
        memo: memoText,
      });
    } else {
      await onAddAccount({
        bankName,
        accountNumber: rawNumber,
        rawAccountNumber: rawNumber,
        alias: alias.trim(),
        role,
        initialBalance,
        asOfDate,
        color,
        isPublic,
        memo: memoText,
      });
    }

    setIsModalOpen(false);
  };

  // Quick inline add role from the dropdown layer
  const handleQuickAddRole = async () => {
    const trimmed = quickRoleLabel.trim();
    if (!trimmed) return;

    const newId = 'role_' + Date.now();
    const newRole: AccountRoleConfig = {
      id: newId,
      label: trimmed,
      description: quickRoleDesc.trim() || '',
      color: '#6366F1',
    };

    const updatedConfig: AccountConfig = {
      ...accountConfig,
      roles: [...accountConfig.roles, newRole],
    };

    await saveAccountConfig(updatedConfig);
    setRole(newId);
    setQuickRoleLabel('');
    setQuickRoleDesc('');
    setIsInlineRoleAdd(false);
    setIsRoleDropdownOpen(false);
  };

  // Quick inline add bank from the dropdown layer
  const handleQuickAddBank = async () => {
    const trimmed = quickBankName.trim();
    if (!trimmed) return;

    if (!accountConfig.banks.includes(trimmed)) {
      const updatedConfig: AccountConfig = {
        ...accountConfig,
        banks: [...accountConfig.banks, trimmed],
      };
      await saveAccountConfig(updatedConfig);
    }

    setBankName(trimmed);
    setQuickBankName('');
    setIsInlineBankAdd(false);
    setIsBankDropdownOpen(false);
  };

  // Resolve currently active role label & color
  const selectedRoleConfig = accountConfig.roles.find(
    (r) => r.id === role || r.label === role
  );

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
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-2xs"
          >
            <Plus className="h-4 w-4" />
            <span>새 계좌 등록</span>
          </button>
          <button
            onClick={() => {
              setSettingsInitialTab('banks');
              setIsSettingsModalOpen(true);
            }}
            className="flex items-center justify-center p-2 text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition shadow-2xs"
            title="계좌 환경설정 (은행명 및 통장 역할 관리)"
            aria-label="계좌 환경설정"
          >
            <Settings className="h-4 w-4" />
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
                    <h3 className="text-sm font-bold text-slate-900">
                      {acc.alias}
                    </h3>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      {acc.bankName} · {acc.rawAccountNumber || acc.accountNumber}
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
                    onClick={() => setAccountToDelete(acc)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
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

              {/* Last updated */}
              <div className="flex items-center justify-end text-xs pt-1">
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
                {/* Bank Name Selector (Expanded Layer UI) */}
                <div className="relative" ref={bankDropdownRef}>
                  <label className="font-bold text-slate-700 block mb-1">은행명</label>

                  {/* Trigger button for Bank dropdown */}
                  <button
                    type="button"
                    onClick={() => setIsBankDropdownOpen((prev) => !prev)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium flex items-center justify-between text-left hover:bg-slate-100/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="truncate font-semibold text-slate-900">
                        {bankName || '은행 선택'}
                      </span>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                        isBankDropdownOpen ? 'rotate-180 text-indigo-600' : ''
                      }`}
                    />
                  </button>

                  {/* Expanded Bank Dropdown Layer */}
                  {isBankDropdownOpen && (
                    <div className="absolute left-0 right-0 z-50 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1 duration-150">
                      {/* Top Action Item */}
                      <div className="p-1 border-b border-slate-100 bg-slate-50/50">
                        {!isInlineBankAdd ? (
                          <div className="flex items-center justify-between px-2 py-1">
                            <button
                              type="button"
                              onClick={() => setIsInlineBankAdd(true)}
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50/80 px-2 py-1.5 rounded-lg flex items-center gap-1.5 transition text-left"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>새로 등록</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsBankDropdownOpen(false);
                                setSettingsInitialTab('banks');
                                setIsSettingsModalOpen(true);
                              }}
                              className="text-[10px] text-slate-400 hover:text-indigo-600 px-1.5 py-1 rounded hover:bg-slate-100 transition shrink-0"
                            >
                              설정에서 관리
                            </button>
                          </div>
                        ) : (
                          /* Inline quick bank addition */
                          <div className="p-2 bg-indigo-50/70 rounded-lg space-y-2 border border-indigo-100">
                            <div className="text-[11px] font-bold text-indigo-900 flex items-center justify-between">
                              <span>새 은행명 추가</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsInlineBankAdd(false);
                                  setQuickBankName('');
                                }}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <input
                              type="text"
                              autoFocus
                              placeholder="은행/증권사명 (예: 토스증권)"
                              value={quickBankName}
                              onChange={(e) => setQuickBankName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleQuickAddBank();
                                }
                              }}
                              className="w-full bg-white border border-indigo-200 rounded px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <div className="flex items-center justify-end gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() => setIsInlineBankAdd(false)}
                                className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-200 rounded"
                              >
                                취소
                              </button>
                              <button
                                type="button"
                                onClick={handleQuickAddBank}
                                disabled={!quickBankName.trim()}
                                className="px-3 py-1 text-[11px] font-bold bg-indigo-600 disabled:opacity-50 text-white hover:bg-indigo-700 rounded shadow-2xs"
                              >
                                등록 및 선택
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Bank Options List */}
                      <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
                        {accountConfig.banks.map((b) => {
                          const isSelected = bankName === b;
                          return (
                            <button
                              key={b}
                              type="button"
                              onClick={() => {
                                setBankName(b);
                                setIsBankDropdownOpen(false);
                                setIsInlineBankAdd(false);
                              }}
                              className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 transition ${
                                isSelected ? 'bg-indigo-50/70 text-indigo-900 font-bold' : 'text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="text-xs font-semibold leading-tight truncate">
                                  {b}
                                </span>
                              </div>
                              {isSelected && (
                                <Check className="h-4 w-4 text-indigo-600 shrink-0 ml-2" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Account Role Dropdown (Expanded Layer UI) */}
                <div className="relative" ref={roleDropdownRef}>
                  <label className="font-bold text-slate-700 block mb-1">통장 역할 구분</label>

                  {/* Trigger button replacing the old select box */}
                  <button
                    type="button"
                    onClick={() => setIsRoleDropdownOpen((prev) => !prev)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium flex items-center justify-between text-left hover:bg-slate-100/70 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: selectedRoleConfig?.color || '#6366F1' }}
                      />
                      <span className="truncate font-semibold text-slate-900">
                        {selectedRoleConfig?.label || role}
                      </span>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                        isRoleDropdownOpen ? 'rotate-180 text-indigo-600' : ''
                      }`}
                    />
                  </button>

                  {/* Expanded Dropdown Layer */}
                  {isRoleDropdownOpen && (
                    <div className="absolute left-0 right-0 z-50 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1 duration-150">
                      {/* Top Action Item */}
                      <div className="p-1 border-b border-slate-100 bg-slate-50/50">
                        {!isInlineRoleAdd ? (
                          <div className="flex items-center justify-between px-2 py-1">
                            <button
                              type="button"
                              onClick={() => setIsInlineRoleAdd(true)}
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50/80 px-2 py-1.5 rounded-lg flex items-center gap-1.5 transition text-left"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>새로 등록</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsRoleDropdownOpen(false);
                                setSettingsInitialTab('roles');
                                setIsSettingsModalOpen(true);
                              }}
                              className="text-[10px] text-slate-400 hover:text-indigo-600 px-1.5 py-1 rounded hover:bg-slate-100 transition shrink-0"
                            >
                              설정에서 관리
                            </button>
                          </div>
                        ) : (
                          /* Inline quick role addition */
                          <div className="p-2 bg-indigo-50/70 rounded-lg space-y-2 border border-indigo-100">
                            <div className="text-[11px] font-bold text-indigo-900 flex items-center justify-between">
                              <span>새 통장 역할 추가</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsInlineRoleAdd(false);
                                  setQuickRoleLabel('');
                                  setQuickRoleDesc('');
                                }}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <input
                              type="text"
                              autoFocus
                              placeholder="역할명 (예: 여행 비상금, 사업용)"
                              value={quickRoleLabel}
                              onChange={(e) => setQuickRoleLabel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleQuickAddRole();
                                }
                              }}
                              className="w-full bg-white border border-indigo-200 rounded px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <input
                              type="text"
                              placeholder="역할 설명 (선택)"
                              value={quickRoleDesc}
                              onChange={(e) => setQuickRoleDesc(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleQuickAddRole();
                                }
                              }}
                              className="w-full bg-white border border-indigo-200 rounded px-2.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <div className="flex items-center justify-end gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() => setIsInlineRoleAdd(false)}
                                className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-200 rounded"
                              >
                                취소
                              </button>
                              <button
                                type="button"
                                onClick={handleQuickAddRole}
                                disabled={!quickRoleLabel.trim()}
                                className="px-3 py-1 text-[11px] font-bold bg-indigo-600 disabled:opacity-50 text-white hover:bg-indigo-700 rounded shadow-2xs"
                              >
                                등록 및 선택
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Role Options List */}
                      <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
                        {accountConfig.roles.map((r) => {
                          const isSelected = role === r.id || role === r.label;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                setRole(r.id);
                                setIsRoleDropdownOpen(false);
                                setIsInlineRoleAdd(false);
                              }}
                              className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 transition ${
                                isSelected ? 'bg-indigo-50/70 text-indigo-900 font-bold' : 'text-slate-700'
                              }`}
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div
                                  className="h-2.5 w-2.5 rounded-full mt-1 shrink-0"
                                  style={{ backgroundColor: r.color || '#6366F1' }}
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold leading-tight truncate">
                                    {r.label}
                                  </div>
                                  {r.description && (
                                    <div className="text-[10px] text-slate-400 font-normal leading-tight truncate mt-0.5">
                                      {r.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {isSelected && (
                                <Check className="h-4 w-4 text-indigo-600 shrink-0 ml-2" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                  placeholder="예: 110-384-592910"
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

      {/* Account Settings Modal (Bank Names & Account Roles Management) */}
      <AccountSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        config={accountConfig}
        accounts={accounts}
        onSaveConfig={saveAccountConfig}
        onUpdateAccount={onUpdateAccount}
        initialTab={settingsInitialTab}
      />

      {/* Account Deletion Confirmation Modal */}
      {accountToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">계좌 삭제 확인</h3>
                <p className="text-xs text-slate-500 mt-0.5">정말 이 계좌를 삭제하시겠습니까?</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/70 text-xs space-y-1">
              <div className="font-semibold text-slate-800">{accountToDelete.alias}</div>
              <div className="text-slate-500 font-mono">
                {accountToDelete.bankName} · {accountToDelete.rawAccountNumber || accountToDelete.accountNumber}
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              계좌를 삭제하면 계좌 목록에서 즉시 제외됩니다. (기존 거래 내역은 안전하게 보존됩니다)
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAccountToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetId = accountToDelete.id;
                  setAccountToDelete(null);
                  await onDeleteAccount(targetId);
                }}
                className="px-4 py-2 text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 rounded-xl shadow-2xs transition cursor-pointer"
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

