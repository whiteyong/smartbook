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
} from 'lucide-react';
import { Account, Transaction, ClassificationRule, ImportBatch } from '../types';
import {
  parseExcelFile,
  convertRowsToTransactions,
  ExcelParseResult,
  generateSampleBankExcel,
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
  const [includeDuplicates, setIncludeDuplicates] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [recentBatches, setRecentBatches] = useState<ImportBatch[]>([]);

  // Step 3: Classification controls
  const [filterUnclassifiedOnly, setFilterUnclassifiedOnly] = useState<boolean>(false);
  const [applyToSameCounterparty, setApplyToSameCounterparty] = useState<boolean>(true);
  const [rulesToRegister, setRulesToRegister] = useState<Record<string, { keyword: string; category: string; direction: 'in' | 'out'; type: 'income' | 'expense' }>>({});

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  // File Handler
  const handleFile = async (f: File) => {
    setFile(f);
    const buffer = await f.arrayBuffer();
    const result = parseExcelFile(buffer);
    setParseResult(result);
    setFieldMapping(result.fieldMapping);
    setStep(2);
  };

  // Sample Bank File Handler
  const handleLoadSample = (bank: '국민은행' | '신한은행') => {
    const uint8 = generateSampleBankExcel(bank);
    const result = parseExcelFile(uint8.buffer);
    setParseResult(result);
    setFieldMapping(result.fieldMapping);
    setFile(new File([uint8.buffer], `${bank}_거래내역.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    setStep(2);
  };

  // Step 2 -> Step 3 Process
  const handleProceedToSummary = () => {
    if (!parseResult || !selectedAccount) return;

    const newBatchId = 'batch_' + Date.now();
    setBatchId(newBatchId);

    const { items, duplicates } = convertRowsToTransactions(
      parseResult.rawRows,
      fieldMapping,
      selectedAccount.id,
      selectedAccount.alias,
      newBatchId,
      transactions
    );

    // Apply auto classification rules to new items
    const classifiedItems = items.map((tx) => {
      const { updatedTx } = applyRulesToTransaction(tx, rules);
      return updatedTx;
    });

    setCandidateTxs(classifiedItems);
    setDuplicateTxs(duplicates);
    setStep(3);
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

      let finalToImport = [...candidateTxs];
      if (includeDuplicates && duplicateTxs.length > 0) {
        finalToImport = [...finalToImport, ...duplicateTxs];
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
        newCount: candidateTxs.length,
        duplicateCount: duplicateTxs.length,
        transferCount,
        canUndo: true,
      };

      await addBatchTransactions(finalizedBatchTxs, batchInfo);
      setRecentBatches((prev) => [batchInfo, ...prev]);

      setIsProcessing(false);
      onUploadSuccess();
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
                      <div className="mt-1 text-[11px] text-slate-500 font-mono">{acc.accountNumber}</div>
                      <div className="mt-2 text-xs font-bold text-slate-900">
                        잔액 {formatKRW(acc.currentBalance ?? acc.initialBalance)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadSample('국민은행')}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                >
                  KB국민은행 샘플 테스트
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample('신한은행')}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                >
                  신한은행 샘플 테스트
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
                    {parseResult.rawRows.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="py-2 px-3 font-mono">{String(row[fieldMapping.occurredAt] || '-')}</td>
                        <td className="py-2 px-3 font-medium">{String(row[fieldMapping.counterparty] || '-')}</td>
                        <td className="py-2 px-3 text-slate-500">{String(row[fieldMapping.description] || '-')}</td>
                        <td className="py-2 px-3 text-right font-semibold text-rose-600">
                          {row[fieldMapping.amountOut] ? formatKRW(Number(String(row[fieldMapping.amountOut]).replace(/,/g, ''))) : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-emerald-600">
                          {row[fieldMapping.amountIn] ? formatKRW(Number(String(row[fieldMapping.amountIn]).replace(/,/g, ''))) : '-'}
                        </td>
                      </tr>
                    ))}
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
      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">가져오기 검토 및 결과 요약</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                신규 거래와 중복 후보를 확인하고 최종 가계부에 반영합니다.
              </p>
            </div>

            {/* Metric Boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4">
                <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  신규 반영 대상
                </div>
                <div className="mt-2 text-2xl font-bold text-emerald-900">{candidateTxs.length}건</div>
                <div className="text-[11px] text-emerald-700 mt-0.5">자동 분류 규칙 적용 준비됨</div>
              </div>

              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4">
                <div className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  중복 의심 후보
                </div>
                <div className="mt-2 text-2xl font-bold text-amber-900">{duplicateTxs.length}건</div>
                <div className="text-[11px] text-amber-700 mt-0.5">기존에 이미 등록된 동일 거래</div>
              </div>

              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-4">
                <div className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                  <ArrowLeftRight className="h-4 w-4 text-indigo-600" />
                  계좌 간 이체 후보
                </div>
                <div className="mt-2 text-2xl font-bold text-indigo-900">
                  {candidateTxs.filter((t) => t.category.includes('이체')).length}건
                </div>
                <div className="text-[11px] text-indigo-700 mt-0.5">지출/수입 통계에서 자동 제외</div>
              </div>
            </div>

            {/* Duplicates Toggle */}
            {duplicateTxs.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    중복 의심 거래 {duplicateTxs.length}건 처리 방법
                  </span>
                  <span className="text-[11px] text-slate-500">
                    기본값: 중복 제외 (같은 날짜·금액·거래처 거래는 버리지 않고 제외하여 중복 방지)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIncludeDuplicates(false)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                      !includeDuplicates
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border text-slate-700'
                    }`}
                  >
                    중복 제외 (권장)
                  </button>
                  <button
                    onClick={() => setIncludeDuplicates(true)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                      includeDuplicates
                        ? 'bg-amber-600 text-white'
                        : 'bg-white border text-slate-700'
                    }`}
                  >
                    별건으로 강제 반영
                  </button>
                </div>
              </div>
            )}

            {/* Candidate List with In-place Category Classification */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    가져올 거래 내역 ({candidateTxs.length}건)
                  </span>
                  {candidateTxs.filter((t) => t.category === '미분류').length > 0 ? (
                    <span className="bg-amber-100 border border-amber-300 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 text-amber-600" />
                      미분류 {candidateTxs.filter((t) => t.category === '미분류').length}건 확인 필요
                    </span>
                  ) : (
                    <span className="bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      전체 분류 완료
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-[11px] text-slate-600 flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyToSameCounterparty}
                      onChange={(e) => setApplyToSameCounterparty(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                    />
                    <span className="font-medium">동일 거래처 일괄 적용</span>
                  </label>

                  <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs bg-slate-50 p-0.5">
                    <button
                      onClick={() => setFilterUnclassifiedOnly(false)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                        !filterUnclassifiedOnly
                          ? 'bg-white text-slate-800 shadow-2xs font-bold'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      전체 ({candidateTxs.length})
                    </button>
                    <button
                      onClick={() => setFilterUnclassifiedOnly(true)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition flex items-center gap-1 ${
                        filterUnclassifiedOnly
                          ? 'bg-amber-500 text-white shadow-2xs font-bold'
                          : 'text-amber-700 hover:text-amber-900'
                      }`}
                    >
                      미분류만 보기 ({candidateTxs.filter((t) => t.category === '미분류').length})
                    </button>
                  </div>
                </div>
              </div>

              {/* Notice Banner */}
              {candidateTxs.filter((t) => t.category === '미분류').length > 0 && (
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
                {candidateTxs
                  .filter((tx) => (filterUnclassifiedOnly ? tx.category === '미분류' : true))
                  .map((tx) => {
                    const isUnclassified = tx.category === '미분류';
                    const isRuleQueued = !!rulesToRegister[tx.counterparty];

                    return (
                      <div
                        key={tx.id}
                        className={`p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                          isUnclassified ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* Left: Info */}
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-slate-400 font-mono text-[11px] shrink-0">
                            {tx.occurredAt.split(' ')[0]}
                          </span>
                          <div className="truncate">
                            <span className="font-bold text-slate-900 mr-2">{tx.counterparty}</span>
                            {tx.rawDescription && tx.rawDescription !== tx.counterparty && (
                              <span className="text-slate-500 text-[11px] font-normal">
                                ({tx.rawDescription})
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right: Category Selector & Amount & Rule Register */}
                        <div className="flex items-center gap-2.5 shrink-0">
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
                            className={`font-bold text-right min-w-[80px] ${
                              tx.direction === 'in' ? 'text-emerald-600' : 'text-slate-900'
                            }`}
                          >
                            {tx.direction === 'in' ? '+' : '-'}
                            {formatKRW(tx.amount)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
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
                disabled={isProcessing}
                className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-md disabled:opacity-50"
              >
                {isProcessing ? (
                  <span>가계부 반영 중...</span>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>최종 가계부에 반영하기 ({candidateTxs.length}건)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
};
