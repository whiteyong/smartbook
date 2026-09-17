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
  occurredAt: ['거래일시', '거래 일시', '거래일자', '거래일', '날짜', '거래시간', '일시', 'Date'],
  counterparty: ['상대계좌예금주명', '보낸분/받는분', '보낸분·받는분', '보낸분', '받는분', '거래처', '입금자명', '가맹점명', '수취인', '적요', 'Counterparty'],
  description: ['거래내용', '적요', '내용', '거래기록사항', '기재내용', '거래구분', 'Description'],
  amountOut: ['출금액(원)', '출금액', '찾으신금액', '출금', '지급액', '지급', '거래금액', '거래 금액', 'Amount Out'],
  amountIn: ['입금액(원)', '입금액', '맡기신금액', '입금', '예금', '수입액', '거래금액', '거래 금액', 'Amount In'],
  balanceAfter: ['거래후 잔액', '거래후잔액', '거래 후 잔액', '잔액(원)', '잔액', '남은금액', '현재잔액', 'Balance'],
  memo: ['송금메모', '메모', '비고', 'Memo'],
};

export function cleanMoney(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return Math.abs(Math.round(val));
  const cleanStr = String(val).replace(/[,원\s]/g, '');
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : Math.abs(Math.round(num));
}

export class PasswordRequiredError extends Error {
  constructor(message = 'File is password-protected') {
    super(message);
    this.name = 'PasswordRequiredError';
  }
}

// Convert ArrayBuffer / Uint8Array to base64 string
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Convert base64 string to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function parseExcelFile(
  fileData: ArrayBuffer | Uint8Array,
  password?: string
): Promise<ExcelParseResult> {
  const u8Array = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
  let decryptedBytes: Uint8Array = u8Array;

  // 1. If a password is provided, decrypt using officecrypto-tool via server endpoint
  if (password) {
    const base64 = arrayBufferToBase64(u8Array);
    const resp = await fetch('/api/decrypt-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: base64, password: password.trim() }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      if (resp.status === 401 || data.error === 'invalid_password') {
        throw new Error('비밀번호가 일치하지 않습니다. 생년월일 6자리(YYMMDD) 또는 사업자번호를 확인 후 다시 입력해 주세요.');
      }
      throw new Error(data.message || '파일 복호화 중 오류가 발생했습니다.');
    }

    if (data.decryptedBase64) {
      decryptedBytes = base64ToUint8Array(data.decryptedBase64);
    }
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(decryptedBytes, {
      type: 'array',
    });
  } catch (err: any) {
    const errorMsg = String(err?.message || err || '');
    if (
      errorMsg.includes('password-protected') ||
      errorMsg.toLowerCase().includes('password') ||
      errorMsg.toLowerCase().includes('encrypted') ||
      errorMsg.includes('Unsupported') ||
      errorMsg.includes('CFB') ||
      errorMsg.includes('Encryption')
    ) {
      if (password) {
        throw new Error('비밀번호가 일치하지 않습니다. 비밀번호를 다시 확인해 주세요.');
      }
      throw new PasswordRequiredError('File is password-protected');
    }

    // Secondary check with server if file is encrypted
    try {
      const base64 = arrayBufferToBase64(u8Array);
      const chk = await fetch('/api/check-excel-encryption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64 }),
      });
      const chkData = await chk.json();
      if (chkData.isEncrypted) {
        throw new PasswordRequiredError('File is password-protected');
      }
    } catch (chkErr) {
      if (chkErr instanceof PasswordRequiredError) throw chkErr;
    }

    throw new Error(`엑셀 파일을 읽을 수 없습니다: ${errorMsg}`);
  }

  if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('유효한 시트가 포함되지 않은 엑셀 파일입니다.');
  }

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
      ['거래일시', '거래 일시', '거래일자', '거래일', '날짜', '적요', '내용', '출금액', '입금액', '잔액', '찾으신금액', '맡기신금액', '출금', '입금', '거래후 잔액', '거래 후 잔액', '상대계좌예금주명', '거래 금액', '거래금액'].some(
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

  // Detect bank name & exact 1:1 mapping
  let detectedBank = '일반 엑셀 양식';
  const headerStr = headers.join(' ');
  const normalizedHeaders = headers.map((h) => h.replace(/\s+/g, ''));

  // 1. Toss Bank Check (User specification 1:1 matching)
  const isToss =
    (headers.includes('거래 일시') || normalizedHeaders.includes('거래일시')) &&
    headers.includes('적요') &&
    (headers.includes('거래 금액') || normalizedHeaders.includes('거래금액')) &&
    (headers.includes('거래 후 잔액') || normalizedHeaders.includes('거래후잔액') || headers.includes('거래 유형'));

  // 2. IBK Bank Check
  const isIBK =
    headers.includes('상대계좌예금주명') ||
    (headers.includes('출금') && headers.includes('입금') && headers.includes('거래후 잔액')) ||
    (headers.includes('거래내용') && headers.includes('CMS코드'));

  if (isToss) {
    detectedBank = '토스뱅크';
    // User requested 1:1 exact mapping for Toss:
    // 거래 일시 -> 거래일시
    // 적요 -> 보낸분/받는분(거래처)
    // 거래 유형 -> -
    // 거래 기관 -> -
    // 계좌번호 -> -
    // 거래 금액 -> -이면 출금액(원), 숫자만 있으면 입금액(원)
    // 거래 후 잔액 -> 잔액(원)
    // 메모 -> 적요(거래내용)
    fieldMapping.occurredAt = headers.find((h) => h.replace(/\s+/g, '') === '거래일시') || '거래 일시';
    fieldMapping.counterparty = headers.find((h) => h === '적요') || '적요';
    fieldMapping.description = headers.find((h) => h === '메모') || '메모';
    const amountCol = headers.find((h) => h.replace(/\s+/g, '') === '거래금액' || h.replace(/\s+/g, '') === '거래금액(원)') || '거래 금액';
    fieldMapping.amountOut = amountCol;
    fieldMapping.amountIn = amountCol;
    fieldMapping.balanceAfter = headers.find((h) => h.replace(/\s+/g, '') === '거래후잔액' || h.replace(/\s+/g, '') === '잔액(원)' || h.replace(/\s+/g, '') === '잔액') || '거래 후 잔액';
    fieldMapping.memo = '';
  } else if (isIBK) {
    detectedBank = 'IBK기업은행';
    fieldMapping.occurredAt = headers.find((h) => h === '거래일시') || fieldMapping.occurredAt;
    fieldMapping.amountOut = headers.find((h) => h === '출금') || fieldMapping.amountOut;
    fieldMapping.amountIn = headers.find((h) => h === '입금') || fieldMapping.amountIn;
    fieldMapping.balanceAfter = headers.find((h) => h === '거래후 잔액' || h === '거래후잔액') || fieldMapping.balanceAfter;
    fieldMapping.description = headers.find((h) => h === '거래내용') || fieldMapping.description;
    fieldMapping.counterparty = headers.find((h) => h === '상대계좌예금주명') || fieldMapping.counterparty;
    fieldMapping.memo = '';
  } else if (headerStr.includes('보낸분/받는분') || headerStr.includes('송금메모')) {
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
  existingTransactions: Transaction[] = []
): {
  items: Transaction[];
  candidateTxs: Transaction[];
  duplicates: number;
  duplicatesCount: number;
  duplicateItems: Transaction[];
  newItems: Transaction[];
  transferMatchCount: number;
} {
  const candidateTxs: Transaction[] = [];
  const duplicateItems: Transaction[] = [];
  const newItems: Transaction[] = [];
  let duplicatesCount = 0;
  let transferMatchCount = 0;

  rawRows.forEach((row, index) => {
    // Extract raw string values
    const rawDate = String(row[fieldMapping.occurredAt] || '').trim();
    const rawDesc = String(row[fieldMapping.description] || '').trim();
    const rawCp = String(row[fieldMapping.counterparty] || '').trim();
    const rawOut = row[fieldMapping.amountOut];
    const rawIn = row[fieldMapping.amountIn];
    const rawBalance = row[fieldMapping.balanceAfter || ''];
    const rawMemo = fieldMapping.memo ? String(row[fieldMapping.memo] || '').trim() : '';

    if (!rawDate && !rawDesc && !rawCp && !rawOut && !rawIn) {
      return; // Skip empty row
    }

    // Determine direction and amount
    let direction: Direction = 'out';
    let amount = 0;

    // Special logic when amountOut and amountIn share the same single column (e.g. Toss Bank 거래 금액: -35,000 vs 100,000)
    if (fieldMapping.amountOut && fieldMapping.amountOut === fieldMapping.amountIn) {
      const rawSingle = String(rawOut || '').trim();
      if (rawSingle.includes('-')) {
        direction = 'out';
        amount = cleanMoney(rawSingle);
      } else {
        const val = cleanMoney(rawSingle);
        if (val > 0) {
          direction = 'in';
          amount = val;
        }
      }
    } else {
      const outVal = cleanMoney(rawOut);
      const inVal = cleanMoney(rawIn);

      if (outVal > 0) {
        direction = 'out';
        amount = outVal;
      } else if (inVal > 0) {
        direction = 'in';
        amount = inVal;
      } else {
        amount = 0;
      }
    }

    if (amount === 0) {
      return; // Skip 0 KRW rows
    }

    // Format ISO Date Time
    let formattedDate = rawDate.replace(/\./g, '-').replace(/\//g, '-');
    if (/^\d{4}-\d{2}-\d{2}$/.test(formattedDate)) {
      formattedDate = `${formattedDate}T12:00:00`;
    } else if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(formattedDate)) {
      formattedDate = formattedDate.replace(' ', 'T');
      if (formattedDate.length === 16) {
        formattedDate = `${formattedDate}:00`;
      }
    } else {
      // Fallback today date if malformed
      try {
        const d = new Date(formattedDate);
        if (!isNaN(d.getTime())) {
          formattedDate = d.toISOString().substring(0, 19);
        } else {
          formattedDate = new Date().toISOString().substring(0, 19);
        }
      } catch {
        formattedDate = new Date().toISOString().substring(0, 19);
      }
    }

    const counterparty = rawCp || '미지정';
    const description = rawDesc || '';
    const balanceAfter = rawBalance !== undefined && rawBalance !== '' ? cleanMoney(rawBalance) : undefined;

    // Auto-detect Transfer (계좌간 이체 감지)
    const isTransferKeyword =
      counterparty.includes('이체') ||
      counterparty.includes('출금') ||
      counterparty.includes('입금') ||
      description.includes('이체') ||
      description.includes('타행') ||
      description.includes('당행');

    // Duplicate Check: Same account, same day, same amount, same direction, same counterparty
    const isDuplicate = existingTransactions.some((existing) => {
      const sameAcc = existing.accountId === accountId;
      const sameDay = existing.occurredAt.substring(0, 10) === formattedDate.substring(0, 10);
      const sameAmt = existing.amount === amount;
      const sameDir = existing.direction === direction;
      const sameCp = existing.counterparty === counterparty;
      return sameAcc && sameDay && sameAmt && sameDir && sameCp;
    });

    if (isDuplicate) {
      duplicatesCount++;
    }

    // Transfer Candidate check with opposite existing transaction on other accounts within 3 days
    const txDate = new Date(formattedDate).getTime();
    const isTransferCandidate = existingTransactions.some((existing) => {
      if (existing.accountId === accountId) return false;
      if (existing.amount !== amount) return false;
      if (existing.direction === direction) return false; // Must be opposite direction
      const diffDays = Math.abs(new Date(existing.occurredAt).getTime() - txDate) / (1000 * 60 * 60 * 24);
      return diffDays <= 3;
    });

    if (isTransferCandidate) {
      transferMatchCount++;
    }

    // Construct transaction object
    const tx: Transaction = {
      id: `imp-${batchId}-${index}-${Date.now().toString(36)}`,
      accountId,
      accountAlias,
      occurredAt: formattedDate,
      direction,
      type: direction === 'in' ? 'income' : 'expense',
      amount,
      balanceAfter,
      rawCounterparty: rawCp || '',
      counterparty,
      rawDescription: rawDesc || '',
      memo: rawMemo,
      category: isTransferKeyword || isTransferCandidate ? '계좌이체' : '미분류',
      isFixed: false,
      tags: isDuplicate ? ['중복의심'] : isTransferCandidate ? ['이체매칭후보'] : [],
      isConfirmed: false,
      isManualLocked: false,
      importBatchId: batchId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    candidateTxs.push(tx);
    if (isDuplicate) {
      duplicateItems.push(tx);
    } else {
      newItems.push(tx);
    }
  });

  return {
    items: candidateTxs,
    candidateTxs,
    duplicates: duplicatesCount,
    duplicatesCount,
    duplicateItems,
    newItems,
    transferMatchCount,
  };
}

// Generate Sample Bank Files for Quick Testing
export async function generateSampleBankExcel(
  bankName: '토스뱅크' | '국민은행' | '기업은행' | '신한은행',
  encryptedPassword?: string
): Promise<Uint8Array> {
  let data: any[] = [];

  if (bankName === '토스뱅크') {
    data = [
      {
        '거래 일시': '2026-09-28 14:22:10',
        적요: '스타벅스 강남점',
        '거래 유형': '체크카드',
        '거래 기관': '토스뱅크',
        계좌번호: '1000-01-123456',
        '거래 금액': '-6,500',
        '거래 후 잔액': '2,450,000',
        메모: '아이스 카페라떼',
      },
      {
        '거래 일시': '2026-09-28 12:45:00',
        적요: '샐러디 역삼점',
        '거래 유형': '체크카드',
        '거래 기관': '토스뱅크',
        계좌번호: '1000-01-123456',
        '거래 금액': '-11,200',
        '거래 후 잔액': '2,456,500',
        메모: '점심 샐러드',
      },
      {
        '거래 일시': '2026-09-27 18:30:15',
        적요: '카카오페이 충전',
        '거래 유형': '간편결제',
        '거래 기관': '토스뱅크',
        계좌번호: '1000-01-123456',
        '거래 금액': '-50,000',
        '거래 후 잔액': '2,467,700',
        메모: '쇼핑 결제용 충전',
      },
      {
        '거래 일시': '2026-09-25 09:30:00',
        적요: '홍길동',
        '거래 유형': '토스이체',
        '거래 기관': '토스뱅크',
        계좌번호: '1000-01-123456',
        '거래 금액': '250,000',
        '거래 후 잔액': '2,517,700',
        메모: '모임 정산 회비',
      },
      {
        '거래 일시': '2026-09-24 19:15:20',
        적요: '쿠팡 로켓프레시',
        '거래 유형': '체크카드',
        '거래 기관': '토스뱅크',
        계좌번호: '1000-01-123456',
        '거래 금액': '-34,800',
        '거래 후 잔액': '2,267,700',
        메모: '주말 식료품',
      },
    ];
  } else if (bankName === '기업은행') {
    data = [
      {
        거래일시: '2026-09-28 15:30:00',
        상대계좌예금주명: '주식회사 알파솔루션',
        거래내용: '용역대금 입금',
        출금: 0,
        입금: 1850000,
        '거래후 잔액': 8950000,
        CMS코드: 'CMS-202609',
      },
      {
        거래일시: '2026-09-27 11:20:00',
        상대계좌예금주명: 'SK텔레콤(주)',
        거래내용: '통신비 자동이체',
        출금: 78500,
        입금: 0,
        '거래후 잔액': 7100000,
        CMS코드: 'AUTOPAY',
      },
      {
        거래일시: '2026-09-25 14:00:00',
        상대계좌예금주명: '김철수',
        거래내용: '프로젝트 컨설팅비',
        출금: 0,
        입금: 500000,
        '거래후 잔액': 7178500,
        CMS코드: 'MANUAL',
      },
    ];
  } else if (bankName === '국민은행') {
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
  const rawBytes = new Uint8Array(excelBuffer);

  if (encryptedPassword) {
    try {
      const base64 = arrayBufferToBase64(rawBytes);
      const resp = await fetch('/api/encrypt-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64, password: encryptedPassword }),
      });
      const resData = await resp.json();
      if (resData.encryptedBase64) {
        return base64ToUint8Array(resData.encryptedBase64);
      }
    } catch (e) {
      console.error('Failed to encrypt sample excel via API:', e);
    }
  }

  return rawBytes;
}
