// Household Ledger Data Types according to PRD

export type LedgerTab = 'dashboard' | 'upload' | 'transactions' | 'rules' | 'budget' | 'accounts';

export type AccountRole = 'salary' | 'fixed' | 'living' | 'savings' | string;
export type TransactionType = 'income' | 'expense' | 'transfer' | 'savings';
export type Direction = 'in' | 'out';

export interface AccountRoleConfig {
  id: string;
  label: string;
  description?: string;
  color?: string;
  isDefault?: boolean;
}

export interface AccountConfig {
  banks: string[];
  roles: AccountRoleConfig[];
}

export interface Account {
  id: string;
  bankName: string;
  accountNumber: string; // 마스킹 포맷 (예: 110-***-**5678)
  rawAccountNumber?: string;
  alias: string; // 별칭 (예: 급여통장, 생활비통장)
  role: AccountRole; // 역할: 급여/고정비/생활비/저축
  initialBalance: number; // 초기 잔액 (정수 원 단위)
  asOfDate: string; // 잔액 기준일 (YYYY-MM-DD)
  color: string; // 표시 색상 HEX
  isPublic: boolean; // 가계 공용 여부
  memo?: string;
  currentBalance?: number; // 계산 잔액 (초기잔액 + 거래 합계)
  lastUpdated?: string;
}

export interface SplitItem {
  id: string;
  amount: number;
  category: string;
  memo?: string;
}

export interface PayslipItem {
  type: 'payment' | 'deduction'; // 지급 vs 공제
  name: string; // 항목명 (예: 기본급, 국민연금, 소득세)
  standardCode: string;
  amount: number;
}

export interface TransactionAttachment {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  accountAlias?: string;
  occurredAt: string; // YYYY-MM-DD HH:mm:ss 또는 YYYY-MM-DD
  direction: Direction; // in | out
  amount: number; // 정수 원 단위
  rawCounterparty: string; // 보낸분/받는분 원문
  counterparty: string; // 정제된 거래처명
  rawDescription: string; // 적요 원문
  balanceAfter?: number; // 거래후 잔액
  type: TransactionType; // income | expense | transfer | savings
  category: string; // 대분류 > 소분류 (예: '식비 > 장보기')
  isFixed: boolean; // 고정비 여부
  tags: string[]; // 태그 목록
  isConfirmed: boolean; // 분류 확정 여부
  isManualLocked: boolean; // 수동 수정 잠금
  memo?: string;
  transferPairId?: string; // 이체 매칭 상대 거래 ID
  transfer_link_id?: string; // 이체 연결 고유 ID (from/to 거래가 동일 ID 공유)
  transfer_role?: 'from' | 'to'; // 보낸 통장 = from, 받은 통장 = to
  is_auto_linked?: boolean; // 자동 감지된 이체 여부
  transfer_unlinked_allowed?: boolean; // 상대편 없이 이체로 둔 경우 (연결 필요 상태로 저장 허용)
  previousCategoryBeforeTransfer?: string; // 이체로 변경 전 카테고리 (되돌리기용)
  transferAccountAlias?: string; // 이체 상대 계좌명
  receiptUrl?: string; // 영수증 증빙 이미지 경로 또는 dataUri
  attachments?: TransactionAttachment[]; // 거래별 증빙 첨부파일
  splits?: SplitItem[]; // 분할 거래
  payslip?: PayslipItem[]; // 급여 분해 항목
  importBatchId?: string;
  duplicateHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RuleCondition {
  direction?: Direction;
  accountId?: string;
  keyword?: string; // 적요/거래처 포함 검색어
  matchType: 'contains' | 'exact' | 'regex';
  minAmount?: number;
  maxAmount?: number;
  startDay?: number; // 매월 N일
  endDay?: number; // 매월 M일
}

export interface RuleResult {
  type: TransactionType;
  category: string;
  tags?: string[];
  isFixed?: boolean;
  autoConfirm: boolean;
}

export interface ClassificationRule {
  id: string;
  name: string;
  priority: number; // 1부터 시작 (우선순위 순)
  condition: RuleCondition;
  result: RuleResult;
  isActive: boolean;
  appliedCount: number;
  lastAppliedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  targetType: 'account' | 'category';
  targetId: string; // accountId 또는 category 이름
  targetName: string;
  month: string; // YYYY-MM
  amount: number;
  rollover: boolean; // 이월 규칙
}

export interface ImportBatch {
  id: string;
  accountId: string;
  accountAlias: string;
  fileName: string;
  importedAt: string;
  totalRows: number;
  newCount: number;
  duplicateCount: number;
  transferCount: number;
  canUndo: boolean;
}

export interface MappingProfile {
  id: string;
  bankName: string;
  headerFingerprint: string;
  fieldMap: {
    occurredAt: string;
    counterparty: string;
    description: string;
    amountOut: string;
    amountIn: string;
    balanceAfter?: string;
    memo?: string;
  };
}

export interface HouseholdInfo {
  name: string;
  currency: string;
  fiscalStartDay: number; // 1 (월 1일) 또는 25 (급여일)
  ownerName: string;
  hideAmounts: boolean; // 금액 마스킹 모드
}

export type AuthProviderType = 'kakao' | 'google' | 'naver';

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  provider: AuthProviderType;
  providerId?: string;
}
