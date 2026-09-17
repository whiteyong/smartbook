import React, { useState } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Sparkles,
  Layers,
  ArrowLeftRight,
  Lock,
  Eye,
  EyeOff,
  X,
  RefreshCw,
  Trash2,
  Ban,
  Filter,
} from 'lucide-react';
import { Account, Transaction, ClassificationRule, ImportBatch } from '../types';
import {
  parseExcelFile,
  convertRowsToTransactions,
  ExcelParseResult,
  generateSampleBankExcel,
  PasswordRequiredError,
  cleanMoney,
} from '../utils/excelParser';
import {
  applyRulesToTransaction,
  detectTransfers,
  addBatchTransactions,
  undoBatchImport,
  addRule,
} from '../services/ledgerService';
import { CATEGORY_TREE } from '../data/initialLedgerData';
import { formatKRW } from '../utils/formatters';
import { CategorySelector } from './CategorySelector';

interface S2UploadProps {
  accounts: Account[];
  transactions: Transaction[];
  rules: ClassificationRule[];
  onUploadSuccess: () => void;
}

export const S2Upload: React.FC<S2UploadProps> = ({
  accounts,
  transactions,
  rules,
  onUploadSuccess,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || '');
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ExcelParseResult | null>(null);
  const [fieldMapping, setFieldMapping] = useState<ExcelParseResult['fieldMapping']>({
    occurredAt: '',
    counterparty: '',
    description: '',
    amountOut: '',
    amountIn: '',
    balanceAfter: '',
    memo: '',
  });

  // Step 3 Result
  const [batchId, setBatchId] = useState<string>('');
  const [candidateTxs, setCandidateTxs] = useState<Transaction[]>([]);
  const [duplicateTxs, setDuplicateTxs] = useState<Transaction[]>([]);
  const [duplicateCount, setDuplicateCount] = useState<number>(0);
  const [excludedTxIds, setExcludedTxIds] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<'all' | 'new' | 'duplicate' | 'transfer' | 'unclassified'>('all');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [recentBatches, setRecentBatches] = useState<ImportBatch[]>([]);

  // Step 3: Classification controls
  const [applyToSameCounterparty, setApplyToSameCounterparty] = useState<boolean>(false);
  const [rulesToRegister, setRulesToRegister] = useState<Record<string, { keyword: string; category: string; direction: 'in' | 'out'; type: 'income' | 'expense' }>>({});

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  // Password-protected excel file handling
  const [pendingBuffer, setPendingBuffer] = useState<ArrayBuffer | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState<boolean>(false);
  const [filePassword, setFilePassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);

  // File Handler
  const handleFile = async (f: File) => {
    setUploadError(null);
    setPasswordError(null);
    setFile(f);
    try {
      const buffer = await f.arrayBuffer();
      setPendingBuffer(buffer);
      const result = await parseExcelFile(buffer);
      setParseResult(result);
      setFieldMapping(result.fieldMapping);
      setStep(2);
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (
        msg.includes('password-protected') ||
        msg.toLowerCase().includes('password') ||
        msg.toLowerCase().includes('encrypted') ||
        err instanceof PasswordRequiredError
      ) {
        setIsPasswordModalOpen(true);
        setFilePassword('');
        return;
      }
      setUploadError(err?.message || '엑셀 파일을 읽는 중 오류가 발생했습니다.');
    }
  };

  // Unlock password-protected excel handler
  const handleUnlockWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingBuffer || isDecrypting) return;
    const trimmedPassword = filePassword.trim();
    if (!trimmedPassword) {
      setPasswordError('비밀번호를 입력해 주세요.');
      return;
    }
    setPasswordError(null);
    setIsDecrypting(true);
    try {
      const result = await parseExcelFile(pendingBuffer, trimmedPassword);
      setParseResult(result);
      setFieldMapping(result.fieldMapping);
      setIsPasswordModalOpen(false);
      setFilePassword('');
      setStep(2);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (
        msg.includes('password') ||
        msg.includes('encrypted') ||
        msg.includes('암호') ||
        msg.includes('incorrect') ||
        err instanceof PasswordRequiredError
      ) {
        setPasswordError('암호가 일치하지 않습니다. 생년월일 6자리(YYMMDD) 또는 사업자번호를 확인 후 다시 입력해 주세요.');
      } else {
        setPasswordError(err?.message || '파일을 여는 중 오류가 발생했습니다.');
      }
    } finally {
      setIsDecrypting(false);
    }
  };

  // Sample Bank File Handler
  const handleLoadSample = async (bank: '토스뱅크' | '국민은행' | '기업은행' | '신한은행', isEncrypted = false) => {
    setUploadError(null);
    setPasswordError(null);
    const uint8 = await generateSampleBankExcel(bank, isEncrypted ? '920512' : undefined);
    setPendingBuffer(uint8.buffer);
    setFile(new File([uint8.buffer], `${bank}_거래내역${isEncrypted ? '_보안' : ''}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));

    if (isEncrypted) {
      setIsPasswordModalOpen(true);
      setFilePassword('');
      return;
    }

    try {
      const result = await parseExcelFile(uint8.buffer);
      setParseResult(result);
      setFieldMapping(result.fieldMapping);
      setStep(2);
    } catch (err: any) {
      if (err instanceof PasswordRequiredError) {
        setIsPasswordModalOpen(true);
      } else {
        setUploadError(err?.message || '샘플 파일을 여는 중 오류가 발생했습니다.');
      }
    }
  };

  // Step 2 -> Step 3 Process
  const handleProceedToSummary = () => {
    if (!parseResult || !selectedAccount) return;

    const newBatchId = 'batch_' + Date.now();
    setBatchId(newBatchId);

    const result = convertRowsToTransactions(
      parseResult.rawRows,
      fieldMapping,
      selectedAccount.id,
      selectedAccount.alias,
      newBatchId,
      transactions
    );

    // Apply auto classification rules to new items
    const classifiedItems = result.items.map((tx) => {
      const { updatedTx } = applyRulesToTransaction(tx, rules);
      return updatedTx;
    });

    setCandidateTxs(classifiedItems);
    setDuplicateTxs(result.duplicateItems || []);
    setDuplicateCount(result.duplicatesCount ?? result.duplicateItems?.length ?? 0);
    setExcludedTxIds(new Set());
    setActiveFilter('all');
    setStep(3);
  };

  // Step 3 Exclusion Handlers
  const handleToggleExclude = (txId: string) => {
    setExcludedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) {
        next.delete(txId);
      } else {
        next.add(txId);
      }
      return next;
    });
  };

  const handleExcludeAllDuplicates = () => {
    const duplicateIds = candidateTxs
      .filter((t) => t.tags.includes('중복의심'))
      .map((t) => t.id);
    setExcludedTxIds((prev) => {
      const next = new Set(prev);
      duplicateIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleRestoreAllDuplicates = () => {
    const duplicateIds = new Set(
      candidateTxs.filter((t) => t.tags.includes('중복의심')).map((t) => t.id)
    );
    setExcludedTxIds((prev) => {
      const next = new Set(prev);
      duplicateIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  // Step 3 Category Change Handler
  const handleCandidateCategoryChange = (
    txId: string,
    newCategory: string,
    counterparty: string
  ) => {
    const targetTx = candidateTxs.find((t) => t.id === txId);
    const targetDirection = targetTx ? targetTx.direction : undefined;

    // Determine type from newCategory & direction
    let resolvedType: 'income' | 'expense' | 'savings' | 'transfer' = 'expense';
    if (newCategory.startsWith('수입')) {
      resolvedType = 'income';
    } else if (newCategory.startsWith('저축')) {
      resolvedType = 'savings';
    } else if (newCategory.startsWith('이체')) {
      resolvedType = 'transfer';
    } else if (targetDirection === 'in') {
      resolvedType = 'income';
    }

    setCandidateTxs((prev) =>
      prev.map((t) => {
        const isTarget = t.id === txId;
        // Same party only if counterparty is valid and has same direction (수입/지출 교차 오염 방지)
        const isSameParty =
          applyToSameCounterparty &&
          counterparty?.trim() !== '' &&
          t.counterparty === counterparty &&
          (!targetDirection || t.direction === targetDirection);

        if (isTarget || isSameParty) {
          return {
            ...t,
            category: newCategory,
            type: resolvedType,
            isConfirmed: newCategory !== '미분류',
            isManualLocked: true,
          };
        }
        return t;
      })
    );
  };

  // Toggle saving this counterparty classification as a persistent rule
  const handleToggleRegisterRule = (
    counterparty: string,
    category: string,
    direction: 'in' | 'out',
    type: 'income' | 'expense'
  ) => {
    setRulesToRegister((prev) => {
      const copy = { ...prev };
      if (copy[counterparty]) {
        delete copy[counterparty];
      } else {
        copy[counterparty] = { keyword: counterparty, category, direction, type };
      }
      return copy;
    });
  };

  // Final Commit Import
  const handleConfirmImport = async () => {
    if (!selectedAccount) return;
    setIsProcessing(true);

    try {
      // 1. Register newly requested rules if any
      const rulesList: Array<{
        keyword: string;
        category: string;
        direction: 'in' | 'out';
        type: 'income' | 'expense';
      }> = Object.values(rulesToRegister);
      if (rulesList.length > 0) {
        let priority = rules.reduce((max, r) => Math.max(max, r.priority), 0) + 1;
        for (const r of rulesList) {
          await addRule({
            name: `${r.keyword} 자동분류`,
            priority: priority++,
            condition: {
              keyword: r.keyword,
              direction: r.direction,
              matchType: 'contains',
            },
            result: {
              type: r.type,
              category: r.category,
              isFixed: false,
              autoConfirm: true,
            },
            isActive: true,
            appliedCount: 1,
          });
        }
      }

      // Filter out excluded transactions
      const finalToImport = candidateTxs.filter((t) => !excludedTxIds.has(t.id));

      if (finalToImport.length === 0) {
        alert('반영할 거래 내역이 없습니다. (모든 항목이 제외되었습니다)');
        setIsProcessing(false);
        return;
      }

      // Check for Inter-account transfer matchings with all existing + new
      const allTxs = [...transactions, ...finalToImport];
      const { updatedTransactions, transferCount } = detectTransfers(allTxs, accounts);

      // Extract only the imported ones with updated transfer status
      const importedIds = new Set(finalToImport.map((t) => t.id));
      const finalizedBatchTxs = updatedTransactions.filter((t) => importedIds.has(t.id));

      const batchInfo: ImportBatch = {
        id: batchId,
        accountId: selectedAccount.id,
        accountAlias: selectedAccount.alias,
        fileName: file ? file.name : '엑셀_가져오기.xlsx',
        importedAt: new Date().toISOString(),
        totalRows: (parseResult?.rawRows.length || 0),
        newCount: finalToImport.filter((t) => !t.tags.includes('중복의심')).length,
        duplicateCount: finalToImport.filter((t) => t.tags.includes('중복의심')).length,
        transferCount,
        canUndo: true,
      };

      await addBatchTransactions(finalizedBatchTxs, batchInfo);
      setRecentBatches((prev) => [batchInfo, ...prev]);

      setIsProcessing(false);
      onUploadSuccess();
      setStep(1);
      setFile(null);
      setPendingBuffer(null);
      setParseResult(null);
      setCandidateTxs([]);
      setExcludedTxIds(new Set());
    } catch (error) {
      console.error('Import error:', error);
      setIsProcessing(false);
    }
  };

  const handleUndo = async (bId: string) => {
    if (confirm('이 배치의 모든 거래를 정말 되돌리시겠습니까? 잔액이 업로드 이전으로 복원됩니다.')) {
      await undoBatchImport(bId);
      setRecentBatches((prev) => prev.filter((b) => b.id !== bId));
      onUploadSuccess();
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-20">
      {/* 3-Step Wizard Indicator */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {/* Step 1 */}
          <div className="flex items-center gap-2">
            <span
              className={`h-7 w-7 rounded-full text-xs font-bold flex items-center justify-center ${
                step === 1
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              1
            </span>
            <div className="text-left">
              <span className={`text-xs font-bold block ${step === 1 ? 'text-slate-900' : 'text-slate-600'}`}>
                계좌 선택 & 파일
              </span>
              <span className="text-[10px] text-slate-400">통장 지정 및 엑셀 드롭</span>
            </div>
          </div>

          <div className="w-12 h-0.5 bg-slate-200"></div>

          {/* Step 2 */}
          <div className="flex items-center gap-2">
            <span
              className={`h-7 w-7 rounded-full text-xs font-bold flex items-center justify-center ${
                step === 2
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : step > 2
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              2
            </span>
            <div className="text-left">
              <span className={`text-xs font-bold block ${step === 2 ? 'text-slate-900' : 'text-slate-600'}`}>
                열 매핑 & 미리보기
              </span>
              <span className="text-[10px] text-slate-400">항목 대조 및 유효성</span>
            </div>
          </div>

          <div className="w-12 h-0.5 bg-slate-200"></div>

          {/* Step 3 */}
          <div className="flex items-center gap-2">
            <span
              className={`h-7 w-7 rounded-full text-xs font-bold flex items-center justify-center ${
                step === 3
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              3
            </span>
            <div className="text-left">
              <span className={`text-xs font-bold block ${step === 3 ? 'text-slate-900' : 'text-slate-600'}`}>
                가져오기 확정
              </span>
              <span className="text-[10px] text-slate-400">신규/중복/이체 요약</span>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 1: Account Selection & File Drop */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-5">
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1.5">
                가져올 대상 통장 선택
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {accounts.map((acc) => {
                  const isSelected = selectedAccountId === acc.id;
                  return (
                    <div
                      key={acc.id}
                      onClick={() => setSelectedAccountId(acc.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/50 shadow-2xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{acc.alias}</span>
                        <span className="text-[10px] text-slate-400">{acc.bankName}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 font-mono">{acc.rawAccountNumber || acc.accountNumber}</div>
                      <div className="mt-2 text-xs font-bold text-slate-900">
                        잔액 {formatKRW(acc.currentBalance ?? acc.initialBalance)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Error banner if file reading failed */}
            {uploadError && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs text-rose-900">
                  <p className="font-bold">파일 읽기 오류</p>
                  <p className="mt-0.5 text-rose-700">{uploadError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  className="text-rose-400 hover:text-rose-700 p-1 rounded-lg"
                  title="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Drop Zone */}
            <div className="border-2 border-dashed border-slate-200 hover:border-indigo-500 rounded-2xl p-8 text-center transition bg-slate-50/50">
              <input
                type="file"
                id="excelFileInput"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
              <label htmlFor="excelFileInput" className="cursor-pointer flex flex-col items-center">
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <div className="text-sm font-bold text-slate-800">
                  은행 거래내역 엑셀 파일을 여기에 끌어다 놓으세요
                </div>
                <p className="text-xs text-slate-500 mt-1">.xlsx, .xls, .csv 형식 지원 (UTF-8 / EUC-KR 자동 판별)</p>
                <div className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition shadow-2xs">
                  내 PC에서 파일 선택
                </div>
              </label>
            </div>

            {/* Instant Sample Loader */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-500" />
                <span>엑셀 파일이 준비되지 않았나요? 실제 은행 양식으로 바로 체험해보세요:</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadSample('토스뱅크')}
                  className="px-3 py-1.5 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-lg transition"
                >
                  토스뱅크 샘플
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample('토스뱅크', true)}
                  className="px-3 py-1.5 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg transition flex items-center gap-1"
                >
                  <Lock className="h-3 w-3 text-amber-600" />
                  토스뱅크 (암호 920512)
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample('국민은행')}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                >
                  KB국민은행
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample('기업은행')}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                >
                  IBK기업은행
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Field Mapping & Preview */}
      {step === 2 && parseResult && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <span>열 매핑 확인</span>
                  <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                    {parseResult.detectedBank} 감지됨
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  엑셀 헤더 열과 가계부 필드를 1:1로 매핑합니다. 한 번 매핑하면 같은 계좌는 다음부터 자동 통과합니다.
                </p>
              </div>
              <div className="text-xs text-slate-500 font-mono">
                총 {parseResult.rawRows.length}행 읽음
              </div>
            </div>

            {/* Mapping Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  거래일시 <span className="text-rose-500">*필수</span>
                </label>
                <select
                  value={fieldMapping.occurredAt}
                  onChange={(e) => setFieldMapping({ ...fieldMapping, occurredAt: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 font-medium"
                >
                  <option value="">(선택)</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  보낸분/받는분 (거래처) <span className="text-rose-500">*필수</span>
                </label>
                <select
                  value={fieldMapping.counterparty}
                  onChange={(e) => setFieldMapping({ ...fieldMapping, counterparty: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 font-medium"
                >
                  <option value="">(선택)</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  적요 (거래내용) <span className="text-rose-500">*필수</span>
                </label>
                <select
                  value={fieldMapping.description}
                  onChange={(e) => setFieldMapping({ ...fieldMapping, description: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 font-medium"
                >
                  <option value="">(선택)</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  출금액(원)
                </label>
                <select
                  value={fieldMapping.amountOut}
                  onChange={(e) => setFieldMapping({ ...fieldMapping, amountOut: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 font-medium"
                >
                  <option value="">(없음)</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  입금액(원)
                </label>
                <select
                  value={fieldMapping.amountIn}
                  onChange={(e) => setFieldMapping({ ...fieldMapping, amountIn: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 font-medium"
                >
                  <option value="">(없음)</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  잔액(원) <span className="text-slate-400">(검증용)</span>
                </label>
                <select
                  value={fieldMapping.balanceAfter}
                  onChange={(e) => setFieldMapping({ ...fieldMapping, balanceAfter: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 font-medium"
                >
                  <option value="">(선택 안함)</option>
                  {parseResult.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Top 5 Preview Table */}
            <div>
              <span className="text-xs font-bold text-slate-800 block mb-2">상위 5건 데이터 미리보기</span>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">거래일시</th>
                      <th className="py-2.5 px-3">거래처</th>
                      <th className="py-2.5 px-3">적요</th>
                      <th className="py-2.5 px-3 text-right">출금액</th>
                      <th className="py-2.5 px-3 text-right">입금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {parseResult.rawRows.slice(0, 5).map((row, idx) => {
                      const isSingleCol =
                        Boolean(fieldMapping.amountOut) &&
                        Boolean(fieldMapping.amountIn) &&
                        fieldMapping.amountOut === fieldMapping.amountIn;

                      let outDisplay = '-';
                      let inDisplay = '-';

                      if (isSingleCol) {
                        const rawVal = row[fieldMapping.amountOut];
                        const strVal = String(rawVal ?? '').trim();
                        const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(strVal.replace(/[,원\s]/g, ''));
                        if (!isNaN(numVal) && numVal !== 0) {
                          if (numVal < 0 || strVal.startsWith('-') || strVal.includes('-')) {
                            outDisplay = formatKRW(Math.abs(Math.round(numVal)));
                          } else {
                            inDisplay = formatKRW(Math.abs(Math.round(numVal)));
                          }
                        }
                      } else {
                        if (row[fieldMapping.amountOut]) {
                          const outNum = cleanMoney(row[fieldMapping.amountOut]);
                          if (outNum > 0) outDisplay = formatKRW(outNum);
                        }
                        if (row[fieldMapping.amountIn]) {
                          const inNum = cleanMoney(row[fieldMapping.amountIn]);
                          if (inNum > 0) inDisplay = formatKRW(inNum);
                        }
                      }

                      return (
                        <tr key={idx} className="hover:bg-slate-50/60">
                          <td className="py-2 px-3 font-mono">{String(row[fieldMapping.occurredAt] || '-')}</td>
                          <td className="py-2 px-3 font-medium">{String(row[fieldMapping.counterparty] || '-')}</td>
                          <td className="py-2 px-3 text-slate-500">{String(row[fieldMapping.description] || '-')}</td>
                          <td className="py-2 px-3 text-right font-semibold text-rose-600">{outDisplay}</td>
                          <td className="py-2 px-3 text-right font-semibold text-emerald-600">{inDisplay}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                <ArrowLeft className="h-4 w-4" /> 이전 단계
              </button>
              <button
                onClick={handleProceedToSummary}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-2xs"
              >
                다음: 결과 요약 검토 <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Summary & Duplicates / Transfer Detection */}
      {step === 3 && (() => {
        const newTxs = candidateTxs.filter((t) => !t.tags.includes('중복의심'));
        const duplicateCandidateTxs = candidateTxs.filter((t) => t.tags.includes('중복의심'));
        const transferCandidateTxs = candidateTxs.filter(
          (t) => t.category.includes('이체') || t.isTransfer || t.tags.includes('이체매칭후보')
        );
        const unclassifiedTxs = candidateTxs.filter((t) => t.category === '미분류');

        const excludedDuplicatesCount = duplicateCandidateTxs.filter((t) => excludedTxIds.has(t.id)).length;
        const isAllDuplicatesExcluded =
          duplicateCandidateTxs.length > 0 && excludedDuplicatesCount === duplicateCandidateTxs.length;

        const activeCandidateTxs = candidateTxs.filter((t) => !excludedTxIds.has(t.id));

        const filteredTxs = candidateTxs.filter((tx) => {
          if (activeFilter === 'new') return !tx.tags.includes('중복의심');
          if (activeFilter === 'duplicate') return tx.tags.includes('중복의심');
          if (activeFilter === 'transfer') {
            return tx.category.includes('이체') || tx.isTransfer || tx.tags.includes('이체매칭후보');
          }
          if (activeFilter === 'unclassified') return tx.category === '미분류';
          return true; // 'all'
        });

        return (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">가져오기 검토 및 결과 요약</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    요약 카드를 클릭하여 거래 내역을 필터링하고, 중복 의심 건을 제외할 수 있습니다.
                  </p>
                </div>
                {activeFilter !== 'all' && (
                  <button
                    onClick={() => setActiveFilter('all')}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 self-start sm:self-auto bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 transition"
                  >
                    <RotateCcw className="h-3 w-3" /> 전체 내역 보기로 리셋
                  </button>
                )}
              </div>

              {/* Metric Boxes - Interactive Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 1. 신규 반영 대상 */}
                <button
                  type="button"
                  onClick={() => setActiveFilter(activeFilter === 'new' ? 'all' : 'new')}
                  className={`text-left rounded-xl p-4 transition-all cursor-pointer relative ${
                    activeFilter === 'new'
                      ? 'bg-emerald-100/90 border-2 border-emerald-500 shadow-sm ring-2 ring-emerald-400/30'
                      : 'bg-emerald-50/70 border border-emerald-200/80 hover:bg-emerald-100/50 hover:border-emerald-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>신규 반영 대상</span>
                    </div>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-emerald-950">{newTxs.length}건</div>
                  <div className="text-[11px] text-emerald-700 mt-0.5">
                    <span>자동 분류 규칙 적용 대상</span>
                  </div>
                </button>

                {/* 2. 중복 의심 후보 */}
                <button
                  type="button"
                  onClick={() => setActiveFilter(activeFilter === 'duplicate' ? 'all' : 'duplicate')}
                  className={`text-left rounded-xl p-4 transition-all cursor-pointer relative ${
                    activeFilter === 'duplicate'
                      ? 'bg-amber-100/90 border-2 border-amber-500 shadow-sm ring-2 ring-amber-400/30'
                      : 'bg-amber-50/70 border border-amber-200/80 hover:bg-amber-100/50 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <span>중복 의심 후보</span>
                    </div>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-amber-950">{duplicateCandidateTxs.length}건</div>
                  <div className="text-[11px] text-amber-700 mt-0.5">
                    <span>
                      {duplicateCandidateTxs.length === 0
                        ? '기존 동일 거래 없음'
                        : `${excludedDuplicatesCount}건 제외됨`}
                    </span>
                  </div>
                </button>

                {/* 3. 계좌 간 이체 후보 */}
                <button
                  type="button"
                  onClick={() => setActiveFilter(activeFilter === 'transfer' ? 'all' : 'transfer')}
                  className={`text-left rounded-xl p-4 transition-all cursor-pointer relative ${
                    activeFilter === 'transfer'
                      ? 'bg-indigo-100/90 border-2 border-indigo-500 shadow-sm ring-2 ring-indigo-400/30'
                      : 'bg-indigo-50/70 border border-indigo-200/80 hover:bg-indigo-100/50 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-indigo-800 flex items-center gap-1.5">
                      <ArrowLeftRight className="h-4 w-4 text-indigo-600" />
                      <span>계좌 간 이체 후보</span>
                    </div>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-indigo-950">{transferCandidateTxs.length}건</div>
                  <div className="text-[11px] text-indigo-700 mt-0.5">
                    <span>지출/수입 통계 자동 제외</span>
                  </div>
                </button>
              </div>

              {/* Candidate List with In-place Category Classification */}
              <div className="space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      가져올 거래 내역 ({filteredTxs.length}
                      {filteredTxs.length !== candidateTxs.length ? ` / 전체 ${candidateTxs.length}` : ''}건)
                    </span>
                    {unclassifiedTxs.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setActiveFilter(activeFilter === 'unclassified' ? 'all' : 'unclassified')}
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 transition ${
                          activeFilter === 'unclassified'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200'
                        }`}
                      >
                        <AlertCircle className="h-3 w-3 text-amber-600" />
                        미분류 {unclassifiedTxs.length}건 확인 필요
                      </button>
                    ) : (
                      <span className="bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        전체 분류 완료
                      </span>
                    )}
                    {excludedTxIds.size > 0 && (
                      <span className="bg-slate-100 border border-slate-300 text-slate-600 text-[11px] font-bold px-2 py-0.5 rounded-full">
                        총 {excludedTxIds.size}건 제외 설정됨
                      </span>
                    )}
                  </div>

                  {/* Filter Toolbar & Batch Exclusion */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Batch Exclusion Button for Duplicates */}
                    {duplicateCandidateTxs.length > 0 && (
                      <div>
                        {!isAllDuplicatesExcluded ? (
                          <button
                            type="button"
                            onClick={handleExcludeAllDuplicates}
                            className="px-2.5 py-1 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg transition flex items-center gap-1 shadow-2xs"
                          >
                            <Ban className="h-3.5 w-3.5 text-amber-700" />
                            <span>중복 의심 {duplicateCandidateTxs.length}건 일괄 제외</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleRestoreAllDuplicates}
                            className="px-2.5 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg transition flex items-center gap-1 shadow-2xs"
                          >
                            <RotateCcw className="h-3.5 w-3.5 text-slate-600" />
                            <span>중복 의심 {duplicateCandidateTxs.length}건 다시 포함</span>
                          </button>
                        )}
                      </div>
                    )}

                    <label className="text-[11px] text-slate-600 flex items-center gap-1.5 cursor-pointer select-none bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                      <input
                        type="checkbox"
                        checked={applyToSameCounterparty}
                        onChange={(e) => setApplyToSameCounterparty(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <span className="font-medium">동일 거래처 일괄 적용</span>
                    </label>
                  </div>
                </div>

                {/* Notice Banner */}
                {unclassifiedTxs.length > 0 && (
                  <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">분류(태그)를 지금 바로 선택할 수 있습니다!</span>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          각 거래의 분류 드롭다운을 클릭하여 카테고리를 지정하세요. '동일 거래처 일괄 적용'이 켜져 있으면 같은 거래처는 한 번에 분류됩니다.
                          원하시면 별 모양(⭐) 버튼으로 향후 업로드 시 자동 분류할 규칙으로 바로 저장할 수 있습니다.
                        </p>
                      </div>
                    </div>
                    {Object.keys(rulesToRegister).length > 0 && (
                      <span className="shrink-0 bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded-md">
                        자동 규칙 {Object.keys(rulesToRegister).length}건 함께 등록
                      </span>
                    )}
                  </div>
                )}

                {/* Transactions Table / List */}
                <div className="min-h-[280px] max-h-[480px] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white shadow-2xs">
                  {filteredTxs.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      해당 조건에 맞는 거래 내역이 없습니다.
                    </div>
                  ) : (
                    filteredTxs.map((tx) => {
                      const isUnclassified = tx.category === '미분류';
                      const isRuleQueued = !!rulesToRegister[tx.counterparty];
                      const isDuplicateSuspect = tx.tags.includes('중복의심');
                      const isExcluded = excludedTxIds.has(tx.id);

                      return (
                        <div
                          key={tx.id}
                          className={`p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                            isExcluded
                              ? 'bg-slate-100/70 opacity-60'
                              : isDuplicateSuspect
                              ? 'bg-amber-50/50 hover:bg-amber-50/80 border-l-4 border-amber-400'
                              : isUnclassified
                              ? 'bg-amber-50/30 hover:bg-amber-50/60'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          {/* Left: Info */}
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-slate-400 font-mono text-[11px] shrink-0">
                              {tx.occurredAt.split(' ')[0]}
                            </span>
                            <div className="truncate flex flex-wrap items-center gap-1.5">
                              <span
                                className={`font-bold mr-1 ${
                                  isExcluded ? 'line-through text-slate-500' : 'text-slate-900'
                                }`}
                              >
                                {tx.counterparty}
                              </span>
                              {tx.rawDescription && tx.rawDescription !== tx.counterparty && (
                                <span className="text-slate-500 text-[11px] font-normal">
                                  ({tx.rawDescription})
                                </span>
                              )}
                              {isDuplicateSuspect && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 border border-amber-300 text-amber-800 rounded">
                                  <AlertCircle className="h-3 w-3 text-amber-600" />
                                  중복 의심
                                </span>
                              )}
                              {isExcluded && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-slate-200 text-slate-600 rounded">
                                  반영 제외됨
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: Category Selector & Amount & Exclude Action */}
                          <div className="flex items-center gap-2.5 shrink-0">
                            {!isExcluded ? (
                              <>
                                {/* In-place Modern Searchable Category Selector */}
                                <CategorySelector
                                  value={tx.category}
                                  direction={tx.direction}
                                  onChange={(newCategory) =>
                                    handleCandidateCategoryChange(
                                      tx.id,
                                      newCategory,
                                      tx.counterparty
                                    )
                                  }
                                  align="right"
                                  size="sm"
                                />

                                {/* Bookmark Rule Button */}
                                {!isUnclassified && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleRegisterRule(
                                        tx.counterparty,
                                        tx.category,
                                        tx.direction,
                                        tx.type
                                      )
                                    }
                                    title={
                                      isRuleQueued
                                        ? '자동 분류 규칙 등록 대기 중 (클릭 시 취소)'
                                        : `'${tx.counterparty}' 자동분류 규칙으로 등록`
                                    }
                                    className={`p-1.5 rounded-lg border text-xs transition flex items-center gap-1 ${
                                      isRuleQueued
                                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold shadow-2xs'
                                        : 'bg-white border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200'
                                    }`}
                                  >
                                    <Sparkles className={`h-3.5 w-3.5 ${isRuleQueued ? 'text-indigo-600 fill-indigo-600' : ''}`} />
                                    <span className="text-[10px] hidden md:inline">
                                      {isRuleQueued ? '규칙등록' : '규칙저장'}
                                    </span>
                                  </button>
                                )}

                                {/* Transaction Amount */}
                                <span
                                  className={`font-bold text-right min-w-[75px] ${
                                    tx.direction === 'in' ? 'text-emerald-600' : 'text-slate-900'
                                  }`}
                                >
                                  {tx.direction === 'in' ? '+' : '-'}
                                  {formatKRW(tx.amount)}
                                </span>

                                {/* Row Exclusion Button (중복 의심 후보에만 적용) */}
                                {isDuplicateSuspect && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleExclude(tx.id)}
                                    title="중복 의심 건 가계부 반영에서 제외"
                                    className="px-2 py-1 text-xs font-semibold rounded-lg border transition flex items-center gap-1 bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                    <span className="text-[11px]">제외</span>
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="text-slate-400 font-mono text-xs line-through">
                                  {tx.direction === 'in' ? '+' : '-'}
                                  {formatKRW(tx.amount)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleExclude(tx.id)}
                                  className="px-2.5 py-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition flex items-center gap-1"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span>다시 포함</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  <ArrowLeft className="h-4 w-4" /> 이전 단계
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={isProcessing || activeCandidateTxs.length === 0}
                  className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-md disabled:opacity-50"
                >
                  {isProcessing ? (
                    <span>가계부 반영 중...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>
                        최종 가계부에 반영하기 ({activeCandidateTxs.length}건)
                        {excludedTxIds.size > 0 ? ` · 제외 ${excludedTxIds.size}건` : ''}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Recent Import Batches & Undo Section (PRD F-02 되돌리기 지원) */}
      {recentBatches.length > 0 && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
            <Layers className="h-4 w-4 text-indigo-600" />
            <span>최근 업로드 배치 내역 (되돌리기 가능)</span>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {recentBatches.map((b) => (
              <div key={b.id} className="p-3.5 flex items-center justify-between text-xs bg-slate-50/50">
                <div>
                  <span className="font-bold text-slate-900">{b.accountAlias}</span>
                  <span className="text-slate-400 mx-2">·</span>
                  <span className="text-slate-600">{b.fileName}</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    {b.importedAt.replace('T', ' ').substring(0, 19)} · 신규 {b.newCount}건, 이체 매칭 {b.transferCount}건
                  </span>
                </div>
                <button
                  onClick={() => handleUndo(b.id)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-100 transition shadow-2xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>배치 전체 되돌리기</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Password-protected Excel Modal */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleUnlockWithPassword}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Lock className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-900">비밀번호로 보호된 파일</h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{file?.name || '엑셀 파일'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPasswordModalOpen(false);
                  setFilePassword('');
                  setPasswordError(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 space-y-1">
              <p className="font-semibold">이 엑셀 파일은 암호로 보호되어 있습니다.</p>
              <p className="text-[11px] text-amber-800/90 leading-relaxed">
                은행/금융사에서 다운로드한 엑셀 파일은 대개 <strong>생년월일 6자리 (예: 920512)</strong> 또는 <strong>사업자등록번호 (10자리)</strong>로 암호화되어 있습니다.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">비밀번호 입력</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  required
                  placeholder="파일 비밀번호를 입력하세요"
                  value={filePassword}
                  onChange={(e) => {
                    setFilePassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  className="w-full text-xs px-3 py-2.5 pr-10 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                  title={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {passwordError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-tight">{passwordError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsPasswordModalOpen(false);
                  setFilePassword('');
                  setPasswordError(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isDecrypting}
                className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-2xs cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
              >
                {isDecrypting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>암호 해독 중...</span>
                  </>
                ) : (
                  <span>암호 해제 후 열기</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
