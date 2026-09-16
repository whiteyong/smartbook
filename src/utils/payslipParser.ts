import * as XLSX from 'xlsx';
import { PayslipItem } from '../types';
import { cleanMoney } from './excelParser';

export interface PayslipStandardItem {
  type: 'payment' | 'deduction';
  name: string;
  standardCode: string;
  amount: number;
}

export interface PayslipValidationResult {
  totalPayment: number;
  totalDeduction: number;
  calculatedNet: number;
  targetNet: number;
  difference: number;
  isMatched: boolean;
  paymentItems: PayslipItem[];
  deductionItems: PayslipItem[];
  basePay: number;
  incentive: number;
  bonus: number;
  mealPay: number;
  otherPayments: PayslipItem[];
}

// Korean Payroll keywords mapping to standard codes & standard Korean display names
const KEYWORD_MAPPINGS: {
  code: string;
  name: string;
  type: 'payment' | 'deduction';
  keywords: string[];
}[] = [
  // Payments (지급 항목)
  {
    code: 'BASE_PAY',
    name: '기본급',
    type: 'payment',
    keywords: ['기본급', '기본급여', '본봉', '월기본급', '기본임금', '통상임금'],
  },
  {
    code: 'INCENTIVE',
    name: '성과급',
    type: 'payment',
    keywords: ['성과급', '성과금', '인센티브', '경영성과급', '업적급', 'PI', 'PS', 'Incentive', '성과수당'],
  },
  {
    code: 'BONUS',
    name: '상여금',
    type: 'payment',
    keywords: ['상여금', '상여', '정기상여', '명절상여', '특별상여', '보너스', 'Bonus', '격려금'],
  },
  {
    code: 'MEAL_PAY',
    name: '비과세 식대',
    type: 'payment',
    keywords: ['비과세 식대', '비과세식대', '식대', '중식대', '식사대', '식비'],
  },
  {
    code: 'CAR_PAY',
    name: '비과세 차량유지비',
    type: 'payment',
    keywords: ['비과세 차량유지비', '차량유지비', '자가운전보조금', '비과세차량'],
  },
  {
    code: 'OVERTIME_PAY',
    name: '연장근로수당',
    type: 'payment',
    keywords: ['연장근로수당', '연장수당', '야간수당', '휴일수당', '시간외근무수당', '시간외수당'],
  },
  {
    code: 'POSITION_PAY',
    name: '직책수당',
    type: 'payment',
    keywords: ['직책수당', '직무수당', '직급수당'],
  },

  // Deductions (공제 항목)
  {
    code: 'PENSION',
    name: '국민연금',
    type: 'deduction',
    keywords: ['국민연금', '국민 연금'],
  },
  {
    code: 'HEALTH',
    name: '건강보험',
    type: 'deduction',
    keywords: ['건강보험', '건강 보험', '국민건강보험'],
  },
  {
    code: 'CARE',
    name: '장기요양보험',
    type: 'deduction',
    keywords: ['장기요양', '장기요양보험', '노인장기요양', '장기요양료'],
  },
  {
    code: 'EMPLOYMENT',
    name: '고용보험',
    type: 'deduction',
    keywords: ['고용보험', '고용 보험'],
  },
  {
    code: 'INCOME_TAX',
    name: '소득세',
    type: 'deduction',
    keywords: ['소득세', '갑근세', '근로소득세', '간이세액'],
  },
  {
    code: 'LOCAL_TAX',
    name: '지방소득세',
    type: 'deduction',
    keywords: ['지방소득세', '지방 소득세', '주민세', '지방세'],
  },
  {
    code: 'OTHER_DEDUCT',
    name: '기타공제',
    type: 'deduction',
    keywords: ['사내대출', '노조비', '상조회비', '공제기타', '기타공제', '연우회비', '식대공제'],
  },
];

/**
 * Match a label to a standard Korean payroll item code
 */
export function identifyPayslipCode(label: string): {
  code: string;
  name: string;
  type: 'payment' | 'deduction';
} | null {
  const cleanLabel = label.trim().toLowerCase();
  for (const mapping of KEYWORD_MAPPINGS) {
    for (const kw of mapping.keywords) {
      if (cleanLabel.includes(kw.toLowerCase())) {
        return { code: mapping.code, name: mapping.name, type: mapping.type };
      }
    }
  }
  return null;
}

/**
 * Parse Excel (.xlsx, .xls) or CSV file for Korean payslip data
 */
export function parsePayslipFromWorkbook(buffer: ArrayBuffer | Uint8Array): PayslipItem[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Read sheet as 2D array
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    const resultMap = new Map<string, PayslipItem>();

    for (let r = 0; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!Array.isArray(row)) continue;

      for (let c = 0; c < row.length; c++) {
        const cellValue = String(row[c] || '').trim();
        if (!cellValue) continue;

        const identified = identifyPayslipCode(cellValue);
        if (identified) {
          // Look for amount in adjacent cells: column + 1, column + 2, or row below
          let amount = 0;
          if (c + 1 < row.length) {
            amount = cleanMoney(row[c + 1]);
          }
          if (amount === 0 && c + 2 < row.length) {
            amount = cleanMoney(row[c + 2]);
          }
          if (amount === 0 && r + 1 < rawRows.length && Array.isArray(rawRows[r + 1])) {
            amount = cleanMoney(rawRows[r + 1][c]);
          }

          if (amount > 0) {
            resultMap.set(identified.code, {
              type: identified.type,
              name: identified.name,
              standardCode: identified.code,
              amount,
            });
          }
        }
      }
    }

    return Array.from(resultMap.values());
  } catch (error) {
    console.error('Error parsing workbook for payslip:', error);
    return [];
  }
}

/**
 * Intelligent Korean standard payroll estimation based on net deposit and category.
 * When user uploads an image/PDF or standard payslip where OCR is simulated,
 * this calculates exact legal standard rates:
 * - 4대보험: 국민연금 4.5%, 건강보험 3.545%, 장기요양 12.95%, 고용보험 0.9%
 * - 비과세 식대: 200,000원
 * - 소득세 & 지방소득세: 간이세액표 근사
 * - 성과급/상여금: category에 '성과' or '상여'가 포함된 경우 적절히 배분!
 */
export function estimatePayslipFromAmount(
  netAmount: number,
  category: string,
  fileName?: string
): PayslipItem[] {
  const isPerformanceBonus =
    category.includes('성과') || (fileName && (fileName.includes('성과') || fileName.includes('인센티브')));
  const isBonusCategory =
    category.includes('상여') || (fileName && (fileName.includes('상여') || fileName.includes('보너스')));

  // Case A: 성과금 / 상여금 (수입 > 상여 > 성과금 or 수입 > 성과급 or 수입 > 상여금)
  if (isPerformanceBonus || isBonusCategory) {
    // 성과급/상여금의 경우 비과세 식대 등 고정수당보다는 소득세, 지방소득세, 고용보험 원천징수가 중심
    // 세전 총액 역산: 실지급액 = 세전 - (소득세 + 지방소득세 + 고용보험 0.9%)
    // 세전 추정 (소득세율 약 10~15% 구간)
    const effectiveTaxRate = netAmount > 5000000 ? 0.165 : netAmount > 3000000 ? 0.135 : 0.088;
    const grossTotal = Math.round(netAmount / (1 - effectiveTaxRate) / 1000) * 1000;

    let incentiveAmount = 0;
    let bonusAmount = 0;

    if (isPerformanceBonus && isBonusCategory) {
      // 둘 다 포함된 경우 (수입 > 상여 > 성과금)
      // 성과급 70%, 상여금 30% 배분
      incentiveAmount = Math.round((grossTotal * 0.7) / 10000) * 10000;
      bonusAmount = grossTotal - incentiveAmount;
    } else if (isPerformanceBonus) {
      incentiveAmount = grossTotal;
    } else {
      bonusAmount = grossTotal;
    }

    const employmentTax = Math.round(grossTotal * 0.009);
    // 남은 공제액은 소득세 + 지방소득세(10%)
    const taxRemainder = grossTotal - netAmount - employmentTax;
    const incomeTax = Math.max(0, Math.round(taxRemainder / 1.1));
    const localTax = Math.max(0, taxRemainder - incomeTax);

    const items: PayslipItem[] = [];

    if (incentiveAmount > 0) {
      items.push({
        type: 'payment',
        name: '성과급',
        standardCode: 'INCENTIVE',
        amount: incentiveAmount,
      });
    }

    if (bonusAmount > 0) {
      items.push({
        type: 'payment',
        name: '상여금',
        standardCode: 'BONUS',
        amount: bonusAmount,
      });
    }

    items.push(
      { type: 'deduction', name: '고용보험', standardCode: 'EMPLOYMENT', amount: employmentTax },
      { type: 'deduction', name: '소득세', standardCode: 'INCOME_TAX', amount: incomeTax },
      { type: 'deduction', name: '지방소득세', standardCode: 'LOCAL_TAX', amount: localTax }
    );

    return items;
  }

  // Case B: 일반 월급여 (수입 > 급여)
  // 비과세 식대 200,000원
  const mealPay = 200000;
  // 세전 추정: 대략 실수령액의 1.14 ~ 1.18배
  const estimatedGross = Math.round((netAmount * 1.15) / 1000) * 1000;
  const taxableSalary = Math.max(0, estimatedGross - mealPay);

  // 4대보험 계산 (2026 대한민국 법정 요율)
  // 국민연금: 4.5% (기준소득월액 상한 6,170,000원)
  const pensionCapped = Math.min(taxableSalary, 6170000);
  const pension = Math.floor((pensionCapped * 0.045) / 10) * 10;

  // 건강보험: 3.545%
  const health = Math.floor((taxableSalary * 0.03545) / 10) * 10;

  // 장기요양보험: 건강보험의 12.95%
  const care = Math.floor((health * 0.1295) / 10) * 10;

  // 고용보험: 0.9%
  const employment = Math.floor((taxableSalary * 0.009) / 10) * 10;

  // 소득세 및 지방소득세
  const fourInsurances = pension + health + care + employment;
  // 소득세는 과세표준에 따라 간이세액 추정
  let incomeTax = 0;
  if (taxableSalary > 4000000) {
    incomeTax = Math.floor((taxableSalary * 0.04) / 10) * 10;
  } else if (taxableSalary > 2500000) {
    incomeTax = Math.floor((taxableSalary * 0.02) / 10) * 10;
  } else {
    incomeTax = Math.floor((taxableSalary * 0.01) / 10) * 10;
  }
  const localTax = Math.floor((incomeTax * 0.1) / 10) * 10;

  const totalDeductions = fourInsurances + incomeTax + localTax;
  // 기본급 역산: 기본급 + 식대(200,000) - 공제합계 = netAmount
  const basePay = netAmount + totalDeductions - mealPay;

  return [
    { type: 'payment', name: '기본급', standardCode: 'BASE_PAY', amount: basePay },
    { type: 'payment', name: '비과세 식대', standardCode: 'MEAL_PAY', amount: mealPay },
    { type: 'deduction', name: '국민연금', standardCode: 'PENSION', amount: pension },
    { type: 'deduction', name: '건강보험', standardCode: 'HEALTH', amount: health },
    { type: 'deduction', name: '장기요양보험', standardCode: 'CARE', amount: care },
    { type: 'deduction', name: '고용보험', standardCode: 'EMPLOYMENT', amount: employment },
    { type: 'deduction', name: '소득세', standardCode: 'INCOME_TAX', amount: incomeTax },
    { type: 'deduction', name: '지방소득세', standardCode: 'LOCAL_TAX', amount: localTax },
  ];
}

/**
 * Validate and group payslip items
 */
export function validatePayslip(
  items: PayslipItem[],
  targetNetAmount: number
): PayslipValidationResult {
  const paymentItems = items.filter((i) => i.type === 'payment');
  const deductionItems = items.filter((i) => i.type === 'deduction');

  const totalPayment = paymentItems.reduce((sum, i) => sum + i.amount, 0);
  const totalDeduction = deductionItems.reduce((sum, i) => sum + i.amount, 0);
  const calculatedNet = totalPayment - totalDeduction;
  const difference = calculatedNet - targetNetAmount;
  const isMatched = difference === 0;

  let basePay = 0;
  let incentive = 0;
  let bonus = 0;
  let mealPay = 0;
  const otherPayments: PayslipItem[] = [];

  for (const item of paymentItems) {
    if (item.standardCode === 'BASE_PAY' || item.name.includes('기본급')) {
      basePay += item.amount;
    } else if (
      item.standardCode === 'INCENTIVE' ||
      item.name.includes('성과') ||
      item.name.includes('인센티브')
    ) {
      incentive += item.amount;
    } else if (
      item.standardCode === 'BONUS' ||
      item.name.includes('상여') ||
      item.name.includes('보너스')
    ) {
      bonus += item.amount;
    } else if (
      item.standardCode === 'MEAL_PAY' ||
      item.name.includes('식대')
    ) {
      mealPay += item.amount;
    } else {
      otherPayments.push(item);
    }
  }

  return {
    totalPayment,
    totalDeduction,
    calculatedNet,
    targetNet: targetNetAmount,
    difference,
    isMatched,
    paymentItems,
    deductionItems,
    basePay,
    incentive,
    bonus,
    mealPay,
    otherPayments,
  };
}

/**
 * Create a downloadable sample Excel payslip file for testing
 */
export function createSamplePayslipWorkbook(
  netAmount: number,
  category: string,
  withBonusAndIncentive = false
): Uint8Array {
  const wb = XLSX.utils.book_new();

  let data: any[][] = [];

  if (withBonusAndIncentive || category.includes('상여') || category.includes('성과')) {
    // Performance Bonus / Incentive Payslip
    const incentive = 2000000;
    const bonus = 1000000;
    const empTax = Math.round((incentive + bonus) * 0.009);
    const incTax = 270000;
    const locTax = 27000;
    const net = incentive + bonus - (empTax + incTax + locTax);

    data = [
      ['급여명세서 (상여/성과급)', '', '', ''],
      ['지급항목', '금액(원)', '공제항목', '금액(원)'],
      ['기본급', 0, '국민연금', 0],
      ['성과급', incentive, '건강보험', 0],
      ['상여금', bonus, '장기요양보험', 0],
      ['비과세 식대', 0, '고용보험', empTax],
      ['', '', '소득세', incTax],
      ['', '', '지방소득세', locTax],
      ['지급총액', incentive + bonus, '공제총액', empTax + incTax + locTax],
      ['실수령액', net, '', ''],
    ];
  } else {
    // Standard Salary Payslip
    const base = 4100000;
    const meal = 200000;
    const pension = 193500;
    const health = 152650;
    const care = 19570;
    const emp = 38700;
    const tax = 46280;
    const localTax = 4300;
    const deductTotal = pension + health + care + emp + tax + localTax;
    const net = base + meal - deductTotal;

    data = [
      ['2026년 9월분 급여명세서', '', '', ''],
      ['지급항목', '금액(원)', '공제항목', '금액(원)'],
      ['기본급', base, '국민연금', pension],
      ['비과세 식대', meal, '건강보험', health],
      ['', '', '장기요양보험', care],
      ['', '', '고용보험', emp],
      ['', '', '소득세', tax],
      ['', '', '지방소득세', localTax],
      ['지급총액', base + meal, '공제총액', deductTotal],
      ['실수령액', net, '', ''],
    ];
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, '급여명세서');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(out);
}
