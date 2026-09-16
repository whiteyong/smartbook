import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Scale,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Zap,
  FileSpreadsheet,
  Coins,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Account, Transaction, Budget } from '../types';
import { formatKRW } from '../utils/formatters';

interface S1DashboardProps {
  selectedMonth: string; // YYYY-MM
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  hideAmounts: boolean;
  onNavigateToTransactions: (filter?: {
    category?: string;
    accountId?: string;
    unclassifiedOnly?: boolean;
    type?: string;
  }) => void;
  onNavigateToUpload: () => void;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

export const S1Dashboard: React.FC<S1DashboardProps> = ({
  selectedMonth,
  accounts,
  transactions,
  budgets,
  hideAmounts,
  onNavigateToTransactions,
  onNavigateToUpload,
}) => {
  // Filter transactions by selected month (이체는 수입/지출 통계에서 제외!)
  const monthTransactions = transactions.filter((t) => t.occurredAt.startsWith(selectedMonth));

  // 1. 수입, 지출, 수지 계산 (type !== 'transfer')
  const incomeTxs = monthTransactions.filter((t) => t.type === 'income');
  const expenseTxs = monthTransactions.filter((t) => t.type === 'expense');

  const totalIncome = incomeTxs.reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = expenseTxs.reduce((sum, t) => sum + t.amount, 0);
  const netBalance = totalIncome - totalExpense;

  // 전월 대비 계산
  const [currYear, currMonthNum] = selectedMonth.split('-').map(Number);
  const prevDate = new Date(currYear, currMonthNum - 2, 1);
  const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevMonthTxs = transactions.filter((t) => t.occurredAt.startsWith(prevMonthStr));
  const prevIncome = prevMonthTxs.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const prevExpense = prevMonthTxs.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

  const expenseChangeRate = prevExpense > 0 ? ((totalExpense - prevExpense) / prevExpense) * 100 : 0;
  const incomeChangeRate = prevIncome > 0 ? ((totalIncome - prevIncome) / prevIncome) * 100 : 0;

  // 2. 고정비 vs 변동비 분석
  const fixedExpense = expenseTxs.filter((t) => t.isFixed).reduce((sum, t) => sum + t.amount, 0);
  const variableExpense = totalExpense - fixedExpense;
  const fixedRatio = totalExpense > 0 ? Math.round((fixedExpense / totalExpense) * 100) : 0;

  // 3. 지출 카테고리별 집계
  const categoryMap: Record<string, number> = {};
  for (const t of expenseTxs) {
    const mainCat = t.category.split('>')[0].trim();
    categoryMap[mainCat] = (categoryMap[mainCat] || 0) + t.amount;
  }
  const categoryData = Object.entries(categoryMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // 4. 6개월 현금흐름 추이 데이터 구성
  const trendData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currYear, currMonthNum - 1 - i, 1);
    const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const txsInMonth = transactions.filter((t) => t.occurredAt.startsWith(mStr));
    const inc = txsInMonth.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = txsInMonth.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    trendData.push({
      month: `${d.getMonth() + 1}월`,
      수입: inc,
      지출: exp,
      순수지: inc - exp,
    });
  }

  // 5. 통장별 봉투 예산 소진율
  const accountBudgets = accounts.map((acc) => {
    const bg = budgets.find((b) => b.targetType === 'account' && b.targetId === acc.id && b.month === selectedMonth);
    const budgetAmount = bg ? bg.amount : 0;

    // 실적 = 해당 통장의 순수 지출 (이체 출금 제외!)
    const spent = monthTransactions
      .filter((t) => t.accountId === acc.id && t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const percent = budgetAmount > 0 ? Math.min(Math.round((spent / budgetAmount) * 100), 200) : 0;
    const remaining = budgetAmount - spent;

    // 페이스 계산 (오늘 일자 기준)
    const today = new Date().getDate();
    const daysInMonth = new Date(currYear, currMonthNum, 0).getDate();
    const expectedPercent = Math.round((today / daysInMonth) * 100);
    const isPaceOver = percent > expectedPercent + 10;

    return {
      account: acc,
      budgetAmount,
      spent,
      percent,
      remaining,
      isPaceOver,
    };
  });

  // 6. 확인 필요 (Needs Attention) 목록
  const unclassifiedTxs = monthTransactions.filter(
    (t) =>
      t.category === '미분류' ||
      !t.isConfirmed ||
      ((t.type === 'transfer' || t.category.startsWith('이체')) &&
        !t.transfer_link_id &&
        !t.transferPairId)
  );
  const largeNoReceiptTxs = monthTransactions.filter(
    (t) => t.type === 'expense' && t.amount >= 200000 && !t.receiptUrl
  );

  // 7. 급여 입금 건의 공제 분해 내역 집계 (PRD F-06 급여 입금 상세 분해)
  const salaryTxs = monthTransactions.filter(
    (t) =>
      (t.category.includes('급여') || t.category.includes('상여') || t.category.includes('성과')) &&
      t.payslip &&
      t.payslip.length > 0
  );

  const aggregatedPayments = {
    basePay: 0,
    incentive: 0,
    bonus: 0,
    mealPay: 0,
    other: [] as { name: string; amount: number }[],
  };

  const aggregatedDeductions = {
    pension: 0,
    health: 0,
    care: 0,
    employment: 0,
    incomeTax: 0,
    localTax: 0,
    other: [] as { name: string; amount: number }[],
  };

  let totalPayslipGross = 0;
  let totalPayslipDeduct = 0;
  let totalPayslipNet = 0;

  for (const tx of salaryTxs) {
    totalPayslipNet += tx.amount;
    for (const item of tx.payslip || []) {
      if (item.type === 'payment') {
        totalPayslipGross += item.amount;
        if (item.standardCode === 'BASE_PAY' || item.name.includes('기본급')) {
          aggregatedPayments.basePay += item.amount;
        } else if (
          item.standardCode === 'INCENTIVE' ||
          item.name.includes('성과') ||
          item.name.includes('인센티브')
        ) {
          aggregatedPayments.incentive += item.amount;
        } else if (
          item.standardCode === 'BONUS' ||
          item.name.includes('상여') ||
          item.name.includes('보너스')
        ) {
          aggregatedPayments.bonus += item.amount;
        } else if (
          item.standardCode === 'MEAL_PAY' ||
          item.name.includes('식대')
        ) {
          aggregatedPayments.mealPay += item.amount;
        } else {
          aggregatedPayments.other.push({ name: item.name, amount: item.amount });
        }
      } else if (item.type === 'deduction') {
        totalPayslipDeduct += item.amount;
        if (item.standardCode === 'PENSION' || item.name.includes('국민연금')) {
          aggregatedDeductions.pension += item.amount;
        } else if (item.standardCode === 'HEALTH' || item.name.includes('건강보험')) {
          aggregatedDeductions.health += item.amount;
        } else if (item.standardCode === 'CARE' || item.name.includes('장기요양')) {
          aggregatedDeductions.care += item.amount;
        } else if (item.standardCode === 'EMPLOYMENT' || item.name.includes('고용보험')) {
          aggregatedDeductions.employment += item.amount;
        } else if (item.standardCode === 'INCOME_TAX' || item.name.includes('소득세')) {
          aggregatedDeductions.incomeTax += item.amount;
        } else if (item.standardCode === 'LOCAL_TAX' || item.name.includes('지방소득세')) {
          aggregatedDeductions.localTax += item.amount;
        } else {
          aggregatedDeductions.other.push({ name: item.name, amount: item.amount });
        }
      }
    }
  }

  const fourInsurancesTotal =
    aggregatedDeductions.pension +
    aggregatedDeductions.health +
    aggregatedDeductions.care +
    aggregatedDeductions.employment;

  const taxesTotal = aggregatedDeductions.incomeTax + aggregatedDeductions.localTax;

  // 연간 누적 (해당 연도 기준)
  const [selectedYear] = selectedMonth.split('-');
  const yearSalaryTxs = transactions.filter(
    (t) =>
      t.occurredAt.startsWith(selectedYear) &&
      (t.category.includes('급여') || t.category.includes('상여') || t.category.includes('성과')) &&
      t.payslip &&
      t.payslip.length > 0
  );

  let yearCumulativeNet = 0;
  let yearCumulativeInsurance = 0;
  let yearCumulativeTax = 0;

  for (const tx of yearSalaryTxs) {
    yearCumulativeNet += tx.amount;
    for (const item of tx.payslip || []) {
      if (item.type === 'deduction') {
        if (
          ['PENSION', 'HEALTH', 'CARE', 'EMPLOYMENT'].includes(item.standardCode) ||
          ['국민연금', '건강보험', '장기요양', '고용보험'].some((k) => item.name.includes(k))
        ) {
          yearCumulativeInsurance += item.amount;
        } else if (
          ['INCOME_TAX', 'LOCAL_TAX'].includes(item.standardCode) ||
          ['소득세', '지방소득세'].some((k) => item.name.includes(k))
        ) {
          yearCumulativeTax += item.amount;
        }
      }
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto pb-16">
      {/* Needs Attention Warning Bar */}
      {(unclassifiedTxs.length > 0 || largeNoReceiptTxs.length > 0) && (
        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-amber-900 flex items-center gap-2">
                확인이 필요한 내역이 있습니다
                <span className="text-xs bg-amber-200 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                  총 {unclassifiedTxs.length + largeNoReceiptTxs.length}건
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                {unclassifiedTxs.length > 0 && `미분류 거래 ${unclassifiedTxs.length}건 `}
                {largeNoReceiptTxs.length > 0 && `· 증빙(영수증) 없는 20만원 이상 고액 거래 ${largeNoReceiptTxs.length}건`}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToTransactions({ unclassifiedOnly: true })}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition shrink-0 shadow-2xs"
          >
            미분류 즉시 처리
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Row 1: 3-Way Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Income */}
        <div
          onClick={() => onNavigateToTransactions({ type: 'income' })}
          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              이달 총 수입
            </span>
            <span
              className={`text-[11px] font-semibold flex items-center gap-0.5 ${
                incomeChangeRate >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {incomeChangeRate >= 0 ? '+' : ''}
              {incomeChangeRate.toFixed(1)}% vs 전월
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tracking-tight">
            {formatKRW(totalIncome, hideAmounts)}
          </div>
          <div className="mt-1 text-xs text-slate-400 flex items-center justify-between">
            <span>실수령 및 부수입 {incomeTxs.length}건</span>
            <span className="text-indigo-600 font-medium group-hover:translate-x-0.5 transition-transform flex items-center text-[11px]">
              상세보기 <ArrowRight className="h-3 w-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* Expense */}
        <div
          onClick={() => onNavigateToTransactions({ type: 'expense' })}
          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs hover:border-slate-300 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-rose-500" />
              이달 총 지출 (이체 제외)
            </span>
            <span
              className={`text-[11px] font-semibold flex items-center gap-0.5 ${
                expenseChangeRate <= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {expenseChangeRate >= 0 ? '+' : ''}
              {expenseChangeRate.toFixed(1)}% vs 전월
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900 tracking-tight">
            {formatKRW(totalExpense, hideAmounts)}
          </div>
          <div className="mt-1 text-xs text-slate-400 flex items-center justify-between">
            <span>
              고정비 {fixedRatio}% · 변동비 {100 - fixedRatio}%
            </span>
            <span className="text-indigo-600 font-medium group-hover:translate-x-0.5 transition-transform flex items-center text-[11px]">
              상세보기 <ArrowRight className="h-3 w-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* Net Surplus/Deficit */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Scale className="h-4 w-4 text-indigo-500" />
              이달 가계 수지 (잔여 여유자금)
            </span>
            <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
              {netBalance >= 0 ? '흑자 기조' : '적자 주의'}
            </span>
          </div>
          <div
            className={`mt-3 text-2xl font-bold tracking-tight ${
              netBalance >= 0 ? 'text-indigo-600' : 'text-rose-600'
            }`}
          >
            {formatKRW(netBalance, hideAmounts)}
          </div>
          <div className="mt-1 text-xs text-slate-400 flex items-center justify-between">
            <span>저축률 {totalIncome > 0 ? Math.round((netBalance / totalIncome) * 100) : 0}%</span>
            <span className="text-emerald-600 font-medium">통장 잔액 반영 완료</span>
          </div>
        </div>
      </div>

      {/* Row 2: 6-Month Cash Flow & Category Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cash Flow Bar Chart */}
        <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">최근 6개월 현금흐름 추이</h3>
              <p className="text-xs text-slate-400 mt-0.5">수입과 지출의 월별 변동폭 및 저축 여력 확인</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500"></span> 수입
              </span>
              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span className="h-2.5 w-2.5 rounded-xs bg-rose-400"></span> 지출
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748B' }}
                  tickFormatter={(val) => `${Math.round(val / 10000)}만`}
                />
                <Tooltip
                  formatter={(val: any) => formatKRW(Number(val), hideAmounts)}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                />
                <Bar dataKey="수입" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="지출" fill="#F43F5E" radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expense Category Donut */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">이달 지출 카테고리 구성</h3>
            <p className="text-xs text-slate-400 mt-0.5">총 {categoryData.length}개 분야 지출 배분</p>

            <div className="h-44 w-full mt-2">
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={68}
                      paddingAngle={3}
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => formatKRW(Number(val), hideAmounts)}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  지출 내역이 없습니다
                </div>
              )}
            </div>
          </div>

          {/* Top 3 Categories */}
          <div className="space-y-2 mt-2 pt-3 border-t border-slate-100">
            {categoryData.slice(0, 3).map((item, idx) => (
              <div
                key={item.name}
                onClick={() => onNavigateToTransactions({ category: item.name })}
                className="flex items-center justify-between text-xs py-1 hover:bg-slate-50 px-2 rounded-lg cursor-pointer"
              >
                <span className="flex items-center gap-2 font-medium text-slate-700">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  ></span>
                  {item.name}
                </span>
                <span className="font-bold text-slate-900">{formatKRW(item.value, hideAmounts)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Envelope Budgets per Account (PRD F-07) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              통장 분리형 봉투 예산 (물리적 예산 통제)
              <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-medium">
                통장 = 봉투
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              각 통장별 배정 예산과 실제 지출 실적 대조 (계좌 간 이체 금액은 자동 제외되어 왜곡 방지)
            </p>
          </div>
          <button
            onClick={onNavigateToUpload}
            className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1"
          >
            엑셀 올리고 잔액 맞추기 <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {accountBudgets.map(({ account, budgetAmount, spent, percent, remaining, isPaceOver }) => (
            <div
              key={account.id}
              className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:shadow-2xs transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: account.color }}></span>
                  {account.alias}
                </span>
                <span className="text-[10px] text-slate-400">{account.bankName}</span>
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">지출 실적</span>
                  <span className="text-base font-bold text-slate-900">{formatKRW(spent, hideAmounts)}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">월 배정 예산</span>
                  <span className="text-xs font-semibold text-slate-600">{formatKRW(budgetAmount, hideAmounts)}</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-3">
                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      percent > 100
                        ? 'bg-rose-500'
                        : percent > 85
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  ></div>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700">{percent}% 소진</span>
                  {percent > 100 ? (
                    <span className="text-rose-600 font-bold">초과 {formatKRW(Math.abs(remaining), hideAmounts)}</span>
                  ) : (
                    <span className="text-slate-500">잔여 {formatKRW(remaining, hideAmounts)}</span>
                  )}
                </div>
              </div>

              {isPaceOver && percent <= 100 && (
                <div className="mt-2 text-[10px] text-amber-700 bg-amber-100/70 border border-amber-200/80 px-2 py-0.5 rounded flex items-center gap-1">
                  <Zap className="h-3 w-3 shrink-0" />
                  <span>지출 페이스가 빠릅니다 (월말 초과 주의)</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Row 4: Payroll Breakdown (F-06 급여 입금 상세 분해 및 공제 항목) */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 border border-slate-800 shadow-md space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  급여명세서 공제 항목 분해
                </h3>
                {salaryTxs.length > 0 && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                    {salaryTxs.length}건 분해 집계
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                4대보험 · 소득세는 가계 지출과 이중 계상되지 않으며 급여 공제로 별도 집계됩니다
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            {salaryTxs.length > 0 ? (
              <div className="flex items-center gap-3 bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-700/70">
                <div>
                  <span className="text-[11px] text-slate-400 block">세전 총지급액</span>
                  <span className="font-bold text-slate-200 text-sm">{formatKRW(totalPayslipGross, hideAmounts)}</span>
                </div>
                <div className="w-px h-6 bg-slate-700"></div>
                <div>
                  <span className="text-[11px] text-slate-400 block">총 공제액</span>
                  <span className="font-bold text-rose-400 text-sm">-{formatKRW(totalPayslipDeduct, hideAmounts)}</span>
                </div>
                <div className="w-px h-6 bg-slate-700"></div>
                <div>
                  <span className="text-[11px] text-emerald-400 block font-semibold">통장 입금액(실수령)</span>
                  <span className="font-bold text-emerald-400 text-base">{formatKRW(totalPayslipNet, hideAmounts)}</span>
                </div>
              </div>
            ) : (
              <button
                onClick={() => onNavigateToTransactions({ category: '수입 > 급여' })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
              >
                급여 내역 등록/분해하기 <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {salaryTxs.length > 0 ? (
          <>
            {/* Section 1: 지급 항목 분해 */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                  <span className="text-xs font-bold text-slate-300">
                    지급 항목 (기본급 → 성과급 · 상여금 → 비과세 식대)
                  </span>
                </div>
                <span className="text-xs font-semibold text-emerald-400">
                  지급 합계 {formatKRW(totalPayslipGross, hideAmounts)}
                </span>
              </div>

              {/* Grid: 기본급 -> 성과급(있을시) -> 상여금(있을시) -> 비과세 식대 -> 기타 수당 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {/* 1. 기본급 (개별 박스) */}
                {aggregatedPayments.basePay > 0 && (
                  <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs hover:border-slate-600 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs font-semibold">기본급</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">
                        기본급여
                      </span>
                    </div>
                    <div className="mt-2 text-base font-bold text-emerald-400 font-mono">
                      {formatKRW(aggregatedPayments.basePay, hideAmounts)}
                    </div>
                  </div>
                )}

                {/* 2. 성과급 (개별 박스 - 만약 해당 월에 성과급이 없으면 보여주지 않는다) */}
                {aggregatedPayments.incentive > 0 && (
                  <div className="bg-slate-800/90 border border-amber-500/40 p-3 rounded-xl flex flex-col justify-between shadow-2xs hover:border-amber-500/70 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-amber-200 text-xs font-semibold flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-amber-400" /> 성과급
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                        성과금
                      </span>
                    </div>
                    <div className="mt-2 text-base font-bold text-amber-300 font-mono">
                      {formatKRW(aggregatedPayments.incentive, hideAmounts)}
                    </div>
                  </div>
                )}

                {/* 3. 상여금 (개별 박스 - 만약 해당 월에 상여금이 없으면 보여주지 않는다) */}
                {aggregatedPayments.bonus > 0 && (
                  <div className="bg-slate-800/90 border border-purple-500/40 p-3 rounded-xl flex flex-col justify-between shadow-2xs hover:border-purple-500/70 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-purple-200 text-xs font-semibold flex items-center gap-1">
                        <Coins className="h-3 w-3 text-purple-400" /> 상여금
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">
                        상여
                      </span>
                    </div>
                    <div className="mt-2 text-base font-bold text-purple-300 font-mono">
                      {formatKRW(aggregatedPayments.bonus, hideAmounts)}
                    </div>
                  </div>
                )}

                {/* 4. 비과세 식대 (개별 박스) */}
                {aggregatedPayments.mealPay > 0 && (
                  <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs hover:border-slate-600 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs font-semibold">비과세 식대</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium">
                        비과세
                      </span>
                    </div>
                    <div className="mt-2 text-base font-bold text-slate-200 font-mono">
                      {formatKRW(aggregatedPayments.mealPay, hideAmounts)}
                    </div>
                  </div>
                )}

                {/* 5. 기타 수당들 */}
                {aggregatedPayments.other.map((item, idx) => (
                  <div key={idx} className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs font-semibold truncate">{item.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-medium">
                        수당
                      </span>
                    </div>
                    <div className="mt-2 text-base font-bold text-slate-200 font-mono">
                      {formatKRW(item.amount, hideAmounts)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 2: 공제 항목 분해 (각 공제 항목 별로 금액 표시) */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-400"></span>
                  <span className="text-xs font-bold text-slate-300">
                    급여명세서 공제 항목 분해 (각 공제 항목별 금액)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    · 4대보험 {formatKRW(fourInsurancesTotal, hideAmounts)} + 세액 {formatKRW(taxesTotal, hideAmounts)}
                  </span>
                </div>
                <span className="text-xs font-semibold text-rose-400">
                  공제 합계 -{formatKRW(totalPayslipDeduct, hideAmounts)}
                </span>
              </div>

              {/* Grid: 국민연금, 건강보험, 장기요양보험, 고용보험, 소득세, 지방소득세, 기타공제 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* 국민연금 */}
                <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs hover:border-slate-600 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs font-semibold">국민연금</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-medium">
                      4.5%
                    </span>
                  </div>
                  <div className="mt-2 text-base font-bold text-slate-200 font-mono">
                    -{formatKRW(aggregatedDeductions.pension, hideAmounts)}
                  </div>
                </div>

                {/* 건강보험 */}
                <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs hover:border-slate-600 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs font-semibold">건강보험</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-medium">
                      3.545%
                    </span>
                  </div>
                  <div className="mt-2 text-base font-bold text-slate-200 font-mono">
                    -{formatKRW(aggregatedDeductions.health, hideAmounts)}
                  </div>
                </div>

                {/* 장기요양보험 */}
                <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs hover:border-slate-600 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs font-semibold">장기요양보험</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-medium">
                      12.95%
                    </span>
                  </div>
                  <div className="mt-2 text-base font-bold text-slate-200 font-mono">
                    -{formatKRW(aggregatedDeductions.care, hideAmounts)}
                  </div>
                </div>

                {/* 고용보험 */}
                <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs hover:border-slate-600 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs font-semibold">고용보험</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-medium">
                      0.9%
                    </span>
                  </div>
                  <div className="mt-2 text-base font-bold text-slate-200 font-mono">
                    -{formatKRW(aggregatedDeductions.employment, hideAmounts)}
                  </div>
                </div>

                {/* 소득세 */}
                <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs hover:border-slate-600 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs font-semibold">소득세</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-medium">
                      간이세액
                    </span>
                  </div>
                  <div className="mt-2 text-base font-bold text-slate-200 font-mono">
                    -{formatKRW(aggregatedDeductions.incomeTax, hideAmounts)}
                  </div>
                </div>

                {/* 지방소득세 */}
                <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs hover:border-slate-600 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-xs font-semibold">지방소득세</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-medium">
                      10%
                    </span>
                  </div>
                  <div className="mt-2 text-base font-bold text-slate-200 font-mono">
                    -{formatKRW(aggregatedDeductions.localTax, hideAmounts)}
                  </div>
                </div>

                {/* 기타 공제 */}
                {aggregatedDeductions.other.map((item, idx) => (
                  <div key={idx} className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-xl flex flex-col justify-between shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-xs font-semibold truncate">{item.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                        기타
                      </span>
                    </div>
                    <div className="mt-2 text-base font-bold text-slate-200 font-mono">
                      -{formatKRW(item.amount, hideAmounts)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 3: 연간 누적 및 검증 요약 (PRD F-06) */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>
                  검증 완료: 지급 합계({formatKRW(totalPayslipGross, hideAmounts)}) - 공제 합계({formatKRW(totalPayslipDeduct, hideAmounts)}) = 통장 입금액({formatKRW(totalPayslipNet, hideAmounts)})
                </span>
              </div>

              <div className="flex items-center gap-4 text-slate-400 text-[11px]">
                <span className="text-slate-300 font-medium">연간 누적 현황:</span>
                <span>실수령 <strong className="text-white">{formatKRW(yearCumulativeNet, hideAmounts)}</strong></span>
                <span>· 4대보험 <strong className="text-white">{formatKRW(yearCumulativeInsurance, hideAmounts)}</strong></span>
                <span>· 원천세액 <strong className="text-white">{formatKRW(yearCumulativeTax, hideAmounts)}</strong></span>
                <span className="text-indigo-400 font-medium">(연말정산 참고용)</span>
              </div>
            </div>
          </>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400 space-y-2">
            <p>해당 월({selectedMonth})에는 급여명세서 공제 항목이 등록된 급여/상여금 거래가 없습니다.</p>
            <p className="text-[11px] text-slate-500">
              거래 내역 관리에서 '수입 &gt; 급여', '수입 &gt; 상여금' 또는 '수입 &gt; 성과급' 거래를 선택하고 증빙 파일을 첨부하면 자동으로 항목이 분해되어 이곳에 표시됩니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
