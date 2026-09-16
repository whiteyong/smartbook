import * as XLSX from 'xlsx';
import { Transaction, Direction } from '../types';

export interface ParsedRow {
  rowIndex: number;
  raw: Record<string, string | number>;
  occurredAt?: string;
  counterparty?: string;
  description?: string;
  amount?: number;
  direction?: Direction;
  balanceAfter?: number;
  memo?: string;
  isDuplicate?: boolean;
  isTransferCandidate?: boolean;
  error?: string;
}

export interface ExcelParseResult {
  headers: string[];
  rawRows: Record<string, any>[];
  detectedBank: string;
  fieldMapping: {
    occurredAt: string;
    counterparty: string;
    description: string;
    amountOut: string;
    amountIn: string;
    balanceAfter?: string;
    memo?: string;
  };
}

// Common Korean Bank Header Aliases
const ALIASES: Record<string, string[]> = {
  occurredAt: ['거래일시', '거래일자', '거래일', '날짜', '거래시간', '일시', 'Date'],
  counterparty: ['보낸분/받는분', '보낸분·받는분', '보낸분', '받는분', '거래처', '입금자명', '가맹점명', '수취인', 'Counterparty'],
  description: ['적요', '내용', '거래기록사항', '거래구분', '기재내용', 'Description'],
  amountOut: ['출금액(원)', '출금액', '찾으신금액', '출금', '지급액', '지급', 'Amount Out'],
  amountIn: ['입금액(원)', '입금액', '맡기신금액', '입금', '예금', '수입액', 'Amount In'],
  balanceAfter: ['잔액(원)', '잔액', '거래후잔액', '남은금액', '현재잔액', 'Balance'],
  memo: ['송금메모', '메모', '비고', 'Memo'],
};

export function cleanMoney(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return Math.round(val);
  const cleanStr = String(val).replace(/[,원\s]/g, '');
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : Math.round(num);
}

export function parseExcelFile(fileData: ArrayBuffer | Uint8Array): ExcelParseResult {
  const workbook = XLSX.read(fileData, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to array of arrays to find header row (skipping banner/summary lines)
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  let headerRowIndex = 0;
  let headers: string[] = [];

  // Search for the header row that matches common bank keywords
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const stringRow = row.map((cell) => String(cell || '').trim());
    const matchCount = stringRow.filter((cell) =>
      ['거래일시', '거래일자', '날짜', '적요', '내용', '출금액', '입금액', '잔액', '찾으신금액', '맡기신금액'].some(
        (keyword) => cell.includes(keyword)
      )
    ).length;

    if (matchCount >= 2) {
      headerRowIndex = i;
      headers = stringRow.filter((h) => h.length > 0);
      break;
    }
  }

  // Fallback to first row if not detected
  if (headers.length === 0 && rows.length > 0) {
    headerRowIndex = 0;
    headers = (rows[0] || []).map((c: any) => String(c || '').trim()).filter((h) => h.length > 0);
  }

  // Convert with discovered header row
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
    range: headerRowIndex,
    raw: false,
    defval: '',
  });

  // Automatically detect field mapping
  const fieldMapping = {
    occurredAt: '',
    counterparty: '',
    description: '',
    amountOut: '',
    amountIn: '',
    balanceAfter: '',
    memo: '',
  };

  for (const key of Object.keys(ALIASES) as (keyof typeof ALIASES)[]) {
    const aliases = ALIASES[key];
    const match = headers.find((h) => aliases.some((a) => h.includes(a)));
    if (match) {
      fieldMapping[key] = match;
    }
  }

  // Detect bank name
  let detectedBank = '일반 엑셀 양식';
  const headerStr = headers.join(' ');
  if (headerStr.includes('보낸분/받는분') || headerStr.includes('송금메모')) {
    detectedBank = 'KB국민은행';
  } else if (headerStr.includes('찾으신금액') || headerStr.includes('맡기신금액')) {
    detectedBank = '우리은행/농협';
  } else if (headerStr.includes('거래구분') && headerStr.includes('거래내용')) {
    detectedBank = '신한은행';
  }

  return {
    headers,
    rawRows,
    detectedBank,
    fieldMapping,
  };
}

// Generate Parsed Transaction Candidates
export function convertRowsToTransactions(
  rawRows: Record<string, any>[],
  fieldMapping: ExcelParseResult['fieldMapping'],
  accountId: string,
  accountAlias: string,
  batchId: string,
  existingTransactions: Transaction[]
): {
  items: Transaction[];
  duplicates: Transaction[];
  summary: { total: number; newCount: number; duplicateCount: number };
} {
  const items: Transaction[] = [];
  const duplicates: Transaction[] = [];

  // Build duplicate lookup hash (accountId + date + amount + counterparty)
  const existingSet = new Set<string>();
  for (const t of existingTransactions) {
    const hashKey = `${t.accountId}_${t.occurredAt.split(' ')[0]}_${t.amount}_${t.counterparty.trim()}`;
    existingSet.add(hashKey);
  }

  rawRows.forEach((row, idx) => {
    const rawDate = String(row[fieldMapping.occurredAt] || '').trim();
    if (!rawDate) return;

    // Normalize Date (e.g., 2026.09.15, 2026-09-15, 20260915, 2026-09-15 14:20)
    let formattedDate = rawDate.replace(/\./g, '-').replace(/\//g, '-');
    if (/^\d{8}$/.test(formattedDate)) {
      formattedDate = `${formattedDate.substring(0, 4)}-${formattedDate.substring(4, 6)}-${formattedDate.substring(6, 8)}`;
    }

    const counterparty = String(row[fieldMapping.counterparty] || row[fieldMapping.description] || '기타 거래처').trim();
    const description = String(row[fieldMapping.description] || '').trim();
    const memo = fieldMapping.memo ? String(row[fieldMapping.memo] || '').trim() : '';

    const outAmount = fieldMapping.amountOut ? cleanMoney(row[fieldMapping.amountOut]) : 0;
    const inAmount = fieldMapping.amountIn ? cleanMoney(row[fieldMapping.amountIn]) : 0;

    let amount = 0;
    let direction: Direction = 'out';

    if (inAmount > 0 && outAmount === 0) {
      amount = inAmount;
      direction = 'in';
    } else if (outAmount > 0) {
      amount = outAmount;
      direction = 'out';
    } else if (inAmount > 0) {
      amount = inAmount;
      direction = 'in';
    }

    if (amount === 0) return;

    const balanceAfter = fieldMapping.balanceAfter ? cleanMoney(row[fieldMapping.balanceAfter]) : undefined;

    const dateOnly = formattedDate.split(' ')[0];
    const hashKey = `${accountId}_${dateOnly}_${amount}_${counterparty}`;
    const isDup = existingSet.has(hashKey);

    const now = new Date().toISOString();
    const tx: Transaction = {
      id: `tx_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      accountId,
      accountAlias,
      occurredAt: formattedDate,
      direction,
      amount,
      rawCounterparty: counterparty,
      counterparty,
      rawDescription: description || counterparty,
      balanceAfter,
      type: direction === 'in' ? 'income' : 'expense',
      category: '미분류',
      isFixed: false,
      tags: [],
      isConfirmed: false,
      isManualLocked: false,
      memo: memo || '',
      importBatchId: batchId,
      createdAt: now,
      updatedAt: now,
    };

    if (isDup) {
      duplicates.push(tx);
    } else {
      items.push(tx);
      existingSet.add(hashKey);
    }
  });

  return {
    items,
    duplicates,
    summary: {
      total: items.length + duplicates.length,
      newCount: items.length,
      duplicateCount: duplicates.length,
    },
  };
}

// Generate Realistic Sample Bank Excel for testing
export function generateSampleBankExcel(bankName: '국민은행' | '신한은행'): Uint8Array {
  let data: any[] = [];

  if (bankName === '국민은행') {
    data = [
      {
        거래일시: '2026-09-28 12:30:15',
        '보낸분/받는분': '스타벅스 역삼역점',
        적요: '스타벅스체크',
        '출금액(원)': 13500,
        '입금액(원)': 0,
        '잔액(원)': 1831500,
        송금메모: '아이스 아메리카노 2잔',
      },
      {
        거래일시: '2026-09-27 19:40:00',
        '보낸분/받는분': '이마트 역삼점',
        적요: '이마트체크승인',
        '출금액(원)': 64200,
        '입금액(원)': 0,
        '잔액(원)': 1845000,
        송금메모: '과일 및 간식 장보기',
      },
      {
        거래일시: '2026-09-26 13:10:00',
        '보낸분/받는분': '교보문고 강남점',
        적요: '교보문고체크',
        '출금액(원)': 22000,
        '입금액(원)': 0,
        '잔액(원)': 1909200,
        송금메모: '가계 재테크 서적',
      },
      {
        거래일시: '2026-09-25 10:15:00',
        '보낸분/받는분': '(주)테크솔루션',
        적요: '9월급여',
        '출금액(원)': 0,
        '입금액(원)': 3845000,
        '잔액(원)': 4895000,
        송금메모: '정기급여',
      },
      {
        거래일시: '2026-09-22 21:05:00',
        '보낸분/받는분': '(주)우아한형제들_배민',
        적요: '배민페이',
        '출금액(원)': 28500,
        '입금액(원)': 0,
        '잔액(원)': 1050000,
        송금메모: '치킨 배달',
      },
    ];
  } else {
    data = [
      {
        거래일자: '2026-09-28',
        거래시간: '11:20:00',
        거래구분: '체크카드',
        거래내용: '파리바게뜨 강남',
        찾으신금액: 11800,
        맡기신금액: 0,
        거래후잔액: 1207800,
      },
      {
        거래일자: '2026-09-27',
        거래시간: '18:10:00',
        거래구분: '체크카드',
        거래내용: '올리브영 양재',
        찾으신금액: 34500,
        맡기신금액: 0,
        거래후잔액: 1219600,
      },
      {
        거래일자: '2026-09-25',
        거래시간: '11:00:02',
        거래구분: '타행이체',
        거래내용: 'KB급여통장이체',
        찾으신금액: 0,
        맡기신금액: 1100000,
        거래후잔액: 1254100,
      },
    ];
  }

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '거래내역');
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(excelBuffer);
}
