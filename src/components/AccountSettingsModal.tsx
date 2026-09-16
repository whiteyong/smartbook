import React, { useState } from 'react';
import {
  X,
  Settings,
  Building2,
  Layers,
  Plus,
  Edit3,
  Trash2,
  Check,
  RotateCcw,
  AlertCircle,
  Tag,
} from 'lucide-react';
import { Account, AccountConfig, AccountRoleConfig } from '../types';
import { DEFAULT_BANKS, DEFAULT_ACCOUNT_ROLES } from '../services/ledgerService';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AccountConfig;
  accounts: Account[];
  onSaveConfig: (newConfig: AccountConfig) => Promise<void>;
  onUpdateAccount?: (id: string, updates: Partial<Account>) => Promise<void>;
  initialTab?: 'banks' | 'roles';
}

const PRESET_COLORS = [
  '#6366F1', // Indigo
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#EC4899', // Pink/Rose
  '#8B5CF6', // Purple
  '#14B8A6', // Teal
  '#64748B', // Slate
];

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  accounts,
  onSaveConfig,
  onUpdateAccount,
  initialTab = 'banks',
}) => {
  const [activeTab, setActiveTab] = useState<'banks' | 'roles'>(initialTab);

  // Bank management states
  const [newBankName, setNewBankName] = useState('');
  const [editingBankIndex, setEditingBankIndex] = useState<number | null>(null);
  const [editingBankValue, setEditingBankValue] = useState('');
  const [bankError, setBankError] = useState<string | null>(null);

  // Role management states
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRoleColor, setNewRoleColor] = useState(PRESET_COLORS[0]);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleLabel, setEditRoleLabel] = useState('');
  const [editRoleDesc, setEditRoleDesc] = useState('');
  const [editRoleColor, setEditRoleColor] = useState('');
  const [roleError, setRoleError] = useState<string | null>(null);

  if (!isOpen) return null;

  // --- Bank Handlers ---
  const handleAddBank = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newBankName.trim();
    if (!trimmed) return;

    if (config.banks.some((b) => b.toLowerCase() === trimmed.toLowerCase())) {
      setBankError('이미 등록된 은행명입니다.');
      return;
    }

    setBankError(null);
    const updatedBanks = [...config.banks, trimmed];
    await onSaveConfig({
      ...config,
      banks: updatedBanks,
    });
    setNewBankName('');
  };

  const handleStartEditBank = (index: number, bank: string) => {
    setEditingBankIndex(index);
    setEditingBankValue(bank);
    setBankError(null);
  };

  const handleSaveEditBank = async (index: number) => {
    const trimmed = editingBankValue.trim();
    if (!trimmed) {
      setEditingBankIndex(null);
      return;
    }

    const oldBank = config.banks[index];
    if (trimmed !== oldBank && config.banks.some((b, i) => i !== index && b.toLowerCase() === trimmed.toLowerCase())) {
      setBankError('이미 등록된 은행명입니다.');
      return;
    }

    const updatedBanks = [...config.banks];
    updatedBanks[index] = trimmed;

    // Also update existing accounts that use this bank if desired
    if (onUpdateAccount && oldBank !== trimmed) {
      const affectedAccounts = accounts.filter((a) => a.bankName === oldBank);
      for (const acc of affectedAccounts) {
        await onUpdateAccount(acc.id, { bankName: trimmed });
      }
    }

    await onSaveConfig({
      ...config,
      banks: updatedBanks,
    });

    setEditingBankIndex(null);
    setEditingBankValue('');
    setBankError(null);
  };

  const handleDeleteBank = async (bankToDelete: string) => {
    const count = accounts.filter((a) => a.bankName === bankToDelete).length;
    if (count > 0) {
      if (
        !confirm(
          `'${bankToDelete}'을(를) 사용하는 계좌가 현재 ${count}개 있습니다.\n목록에서 삭제하시겠습니까? (기존 계좌의 은행명 텍스트는 보존됩니다)`
        )
      ) {
        return;
      }
    } else {
      if (!confirm(`'${bankToDelete}' 은행을 목록에서 삭제하시겠습니까?`)) {
        return;
      }
    }

    const updatedBanks = config.banks.filter((b) => b !== bankToDelete);
    await onSaveConfig({
      ...config,
      banks: updatedBanks,
    });
  };

  const handleResetBanks = async () => {
    if (confirm('은행 목록을 기본 제공 목록으로 초기화하시겠습니까?')) {
      await onSaveConfig({
        ...config,
        banks: [...DEFAULT_BANKS],
      });
      setBankError(null);
    }
  };

  // --- Role Handlers ---
  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newRoleLabel.trim();
    if (!trimmed) return;

    if (config.roles.some((r) => r.label.toLowerCase() === trimmed.toLowerCase())) {
      setRoleError('이미 등록된 역할 구분입니다.');
      return;
    }

    setRoleError(null);
    const newId = 'role_' + Date.now();
    const newRole: AccountRoleConfig = {
      id: newId,
      label: trimmed,
      description: newRoleDesc.trim() || undefined,
      color: newRoleColor,
    };

    const updatedRoles = [...config.roles, newRole];
    await onSaveConfig({
      ...config,
      roles: updatedRoles,
    });

    setNewRoleLabel('');
    setNewRoleDesc('');
    setNewRoleColor(PRESET_COLORS[0]);
  };

  const handleStartEditRole = (role: AccountRoleConfig) => {
    setEditingRoleId(role.id);
    setEditRoleLabel(role.label);
    setEditRoleDesc(role.description || '');
    setEditRoleColor(role.color || PRESET_COLORS[0]);
    setRoleError(null);
  };

  const handleSaveEditRole = async (roleId: string) => {
    const trimmed = editRoleLabel.trim();
    if (!trimmed) {
      setEditingRoleId(null);
      return;
    }

    if (
      config.roles.some(
        (r) => r.id !== roleId && r.label.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      setRoleError('이미 등록된 역할 구분입니다.');
      return;
    }

    const updatedRoles = config.roles.map((r) => {
      if (r.id === roleId) {
        return {
          ...r,
          label: trimmed,
          description: editRoleDesc.trim() || undefined,
          color: editRoleColor,
        };
      }
      return r;
    });

    await onSaveConfig({
      ...config,
      roles: updatedRoles,
    });

    setEditingRoleId(null);
    setRoleError(null);
  };

  const handleDeleteRole = async (roleToDelete: AccountRoleConfig) => {
    const count = accounts.filter(
      (a) => a.role === roleToDelete.id || a.role === roleToDelete.label
    ).length;

    if (count > 0) {
      if (
        !confirm(
          `'${roleToDelete.label}' 역할을 사용하는 계좌가 현재 ${count}개 있습니다.\n삭제하시겠습니까? (기존 계좌의 설정값은 유지됩니다)`
        )
      ) {
        return;
      }
    } else {
      if (!confirm(`'${roleToDelete.label}' 역할을 목록에서 삭제하시겠습니까?`)) {
        return;
      }
    }

    const updatedRoles = config.roles.filter((r) => r.id !== roleToDelete.id);
    await onSaveConfig({
      ...config,
      roles: updatedRoles,
    });
  };

  const handleResetRoles = async () => {
    if (confirm('통장 역할 목록을 기본 제공 목록(급여, 고정비, 생활비, 저축)으로 초기화하시겠습니까?')) {
      await onSaveConfig({
        ...config,
        roles: [...DEFAULT_ACCOUNT_ROLES],
      });
      setRoleError(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">계좌 환경설정</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                계좌 등록 시 선택하는 은행명과 통장 역할을 직접 추가, 변경, 삭제합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-5 pt-3 gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('banks');
              setBankError(null);
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition ${
              activeTab === 'banks'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>은행명 관리</span>
            <span className="text-[10px] bg-slate-200 text-slate-700 font-semibold px-1.5 py-0.2 rounded-full">
              {config.banks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('roles');
              setRoleError(null);
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition ${
              activeTab === 'roles'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>통장 역할 구분 관리</span>
            <span className="text-[10px] bg-slate-200 text-slate-700 font-semibold px-1.5 py-0.2 rounded-full">
              {config.roles.length}
            </span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {activeTab === 'banks' && (
            <div className="space-y-4">
              {/* Add Bank Form */}
              <form onSubmit={handleAddBank} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <label className="text-xs font-bold text-slate-700 block">새 은행명 등록</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="예: 토스증권, 미래에셋증권, 광주은행"
                    value={newBankName}
                    onChange={(e) => {
                      setNewBankName(e.target.value);
                      if (bankError) setBankError(null);
                    }}
                    className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={!newBankName.trim()}
                    className="px-3.5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition shadow-2xs flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>추가</span>
                  </button>
                </div>
                {bankError && (
                  <p className="text-[11px] text-rose-600 flex items-center gap-1 font-medium">
                    <AlertCircle className="h-3 w-3" />
                    {bankError}
                  </p>
                )}
              </form>

              {/* Bank List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                  <span>등록된 은행 목록 ({config.banks.length}개)</span>
                  <button
                    type="button"
                    onClick={handleResetBanks}
                    className="text-[11px] text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition"
                    title="기본 목록으로 초기화"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>기본값 초기화</span>
                  </button>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  {config.banks.map((bank, index) => {
                    const linkedCount = accounts.filter((a) => a.bankName === bank).length;
                    const isEditing = editingBankIndex === index;

                    return (
                      <div
                        key={`${bank}_${index}`}
                        className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50/70 transition"
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={editingBankValue}
                              onChange={(e) => setEditingBankValue(e.target.value)}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEditBank(index);
                                if (e.key === 'Escape') setEditingBankIndex(null);
                              }}
                              className="flex-1 bg-slate-50 border border-indigo-300 rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEditBank(index)}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md"
                              title="저장"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingBankIndex(null)}
                              className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-md"
                              title="취소"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                              <span className="text-xs font-bold text-slate-800 truncate">{bank}</span>
                              {linkedCount > 0 && (
                                <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full shrink-0">
                                  {linkedCount}개 계좌 사용 중
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleStartEditBank(index, bank)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                                title="은행명 수정"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteBank(bank)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                title="은행명 삭제"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'roles' && (
            <div className="space-y-4">
              {/* Add Role Form */}
              <form onSubmit={handleAddRole} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">새 통장 역할 등록</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">라벨 색상:</span>
                    <div className="flex items-center gap-1">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewRoleColor(c)}
                          className={`h-4 w-4 rounded-full transition ${
                            newRoleColor === c ? 'ring-2 ring-indigo-500 scale-110' : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="역할명 (예: 사업자 통장, 여행 비상금)"
                    value={newRoleLabel}
                    onChange={(e) => {
                      setNewRoleLabel(e.target.value);
                      if (roleError) setRoleError(null);
                    }}
                    className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="설명 (예: 세금 및 매입매출 전용 통장)"
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  {roleError ? (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1 font-medium">
                      <AlertCircle className="h-3 w-3" />
                      {roleError}
                    </p>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      등록 후 계좌 등록 및 편집 시 드롭다운에서 바로 선택할 수 있습니다.
                    </span>
                  )}
                  <button
                    type="submit"
                    disabled={!newRoleLabel.trim()}
                    className="px-3.5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition shadow-2xs flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>역할 추가</span>
                  </button>
                </div>
              </form>

              {/* Roles List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                  <span>등록된 통장 역할 목록 ({config.roles.length}개)</span>
                  <button
                    type="button"
                    onClick={handleResetRoles}
                    className="text-[11px] text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition"
                    title="기본 목록으로 초기화"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>기본값 초기화</span>
                  </button>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  {config.roles.map((role) => {
                    const linkedCount = accounts.filter(
                      (a) => a.role === role.id || a.role === role.label
                    ).length;
                    const isEditing = editingRoleId === role.id;

                    return (
                      <div
                        key={role.id}
                        className="p-3 hover:bg-slate-50/70 transition space-y-2"
                      >
                        {isEditing ? (
                          <div className="space-y-2 bg-slate-50 p-2.5 rounded-lg border border-indigo-200">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editRoleLabel}
                                onChange={(e) => setEditRoleLabel(e.target.value)}
                                placeholder="역할명"
                                className="flex-1 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold"
                              />
                              <div className="flex items-center gap-1">
                                {PRESET_COLORS.map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => setEditRoleColor(c)}
                                    className={`h-3.5 w-3.5 rounded-full ${
                                      editRoleColor === c ? 'ring-2 ring-indigo-500 scale-110' : 'opacity-60'
                                    }`}
                                    style={{ backgroundColor: c }}
                                  />
                                ))}
                              </div>
                            </div>
                            <input
                              type="text"
                              value={editRoleDesc}
                              onChange={(e) => setEditRoleDesc(e.target.value)}
                              placeholder="설명 (선택)"
                              className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-medium"
                            />
                            <div className="flex items-center justify-end gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() => setEditingRoleId(null)}
                                className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded"
                              >
                                취소
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEditRole(role.id)}
                                className="px-3 py-1 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded shadow-2xs"
                              >
                                저장
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className="h-3 w-3 rounded-full shrink-0"
                                style={{ backgroundColor: role.color || '#6366F1' }}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-800 truncate">
                                    {role.label}
                                  </span>
                                  {linkedCount > 0 && (
                                    <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.2 rounded-full shrink-0">
                                      {linkedCount}개 계좌
                                    </span>
                                  )}
                                </div>
                                {role.description && (
                                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                    {role.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleStartEditRole(role)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                                title="역할 수정"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRole(role)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                title="역할 삭제"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition shadow-2xs"
          >
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
};
