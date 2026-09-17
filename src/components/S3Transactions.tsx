import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Filter,
  ArrowUpDown,
  Tag,
  Receipt,
  Scissors,
  Sparkles,
  Check,
  X,
  Plus,
  Trash2,
  Unlock,
  CheckSquare,
  Square,
  ArrowLeftRight,
  Upload,
  Eye,
  Download,
  Edit3,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  Wallet,
  Layers,
  GripVertical,
  RotateCcw,
} from 'lucide-react';
import { Account, Transaction, TransactionAttachment, SplitItem, ClassificationRule, PayslipItem } from '../types';
import { CATEGORY_TREE } from '../data/initialLedgerData';
import { formatKRW, formatSignedKRW } from '../utils/formatters';
import { CategorySelector, EXPENSE_SHORTCUTS, INCOME_SHORTCUTS } from './CategorySelector';
import { PayslipModal } from './PayslipModal';
import { parsePayslipFromWorkbook, estimatePayslipFromAmount, validatePayslip } from '../utils/payslipParser';
import {
  getMergedCategoryTree,
  getStoredCustomCategories,
  addCustomCategory,
  removeCustomCategory,
  DEFAULT_PARENT_GROUPS,
} from '../utils/categoryManager';
import { FileSpreadsheet, ShieldCheck, Coins } from 'lucide-react';

interface S3TransactionsProps {
  transactions: Transaction[];
  accounts: Account[];
  hideAmounts: boolean;
  initialFilter?: {
    category?: string;
    accountId?: string;
    unclassifiedOnly?: boolean;
    type?: string;
  };
  onUpdateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
  onCreateRuleFromTransaction: (tx: Transaction, category: string) => Promise<void> | void;
  rules: ClassificationRule[];
  onDeleteRule: (id: string) => Promise<void>;
}

// Helper to search candidate counterpart transactions for transfer linking (±3 days, same amount, opposite direction, different account, unlinked)
const findTransferCandidates = (
  active: Transaction,
  allTransactions: Transaction[]
): Transaction[] => {
  if (!active) return [];
  const activeAmount = Math.abs(active.amount);
  const activeTime = new Date(active.occurredAt.replace(' ', 'T')).getTime();

  return allTransactions
    .filter((cand) => {
      if (cand.id === active.id) return false;
      // 다른 통장
      if (cand.accountId === active.accountId) return false;
      // 같은 금액
      if (Math.abs(cand.amount) !== activeAmount) return false;
      // 반대 부호 (in vs out)
      if (cand.direction === active.direction) return false;
      // 아직 다른 거래에 연결되지 않은 거래
      if (cand.transfer_link_id || cand.transferPairId) return false;
      // ±3일 이내
      const candTime = new Date(cand.occurredAt.replace(' ', 'T')).getTime();
      if (isNaN(candTime) || isNaN(activeTime)) return false;
      const diffDays = Math.abs(activeTime - candTime) / (1000 * 60 * 60 * 24);
      return diffDays <= 3.01;
    })
    .sort((a, b) => {
      const candTimeA = new Date(a.occurredAt.replace(' ', 'T')).getTime();
      const candTimeB = new Date(b.occurredAt.replace(' ', 'T')).getTime();
      const diffA = Math.abs(activeTime - candTimeA);
      const diffB = Math.abs(activeTime - candTimeB);
      return diffA - diffB;
    });
};

// Helper to check if a transaction belongs to a selected 1depth category group
const isTxInDepth1Category = (txCategory: string, selectedDepth1: string): boolean => {
  if (!selectedDepth1 || selectedDepth1 === 'all') return true;

  if (selectedDepth1 === '수입') {
    return txCategory.startsWith('수입');
  }
  if (selectedDepth1 === '이체/기타') {
    return txCategory.startsWith('이체') || txCategory === '미분류';
  }

  const group = CATEGORY_TREE.find((g) => g.group === selectedDepth1);
  if (!group) {
    return txCategory.startsWith(selectedDepth1) || txCategory === selectedDepth1;
  }

  // 1. Exact match in group items
  if (group.items.includes(txCategory)) return true;

  // 2. Check by main prefix of any item in group (e.g. '주거/관리비' for '주거/통신')
  const prefixes = group.items.map((item) => item.split('>')[0].trim());
  const txPrefix = txCategory.split('>')[0].trim();
  if (prefixes.some((p) => txPrefix.startsWith(p) || p.startsWith(txPrefix))) {
    return true;
  }

  // 3. Fallback: group keywords (e.g. "주거", "통신" in "주거/통신")
  const keywords = group.group.split('/');
  return keywords.some((k) => txCategory.includes(k));
};

export interface ColumnMeta {
  id: 'date' | 'account' | 'description' | 'amount' | 'category' | 'tags' | 'receipt' | 'status';
  label: string;
  headerAlignClass: string;
}

export const DEFAULT_COLUMNS: ColumnMeta[] = [
  { id: 'date', label: '날짜', headerAlignClass: 'justify-center text-center' },
  { id: 'account', label: '통장', headerAlignClass: 'justify-center text-center' },
  { id: 'description', label: '거래처 / 적요 원문', headerAlignClass: 'justify-center text-center' },
  { id: 'amount', label: '금액(원)', headerAlignClass: 'justify-center text-center' },
  { id: 'category', label: '카테고리', headerAlignClass: 'justify-center text-center' },
  { id: 'tags', label: '태그', headerAlignClass: 'justify-center text-center' },
  { id: 'receipt', label: '증빙', headerAlignClass: 'justify-center text-center' },
  { id: 'status', label: '상태', headerAlignClass: 'justify-center text-center' },
];

export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  date: 107,
  account: 90,
  description: 250,
  amount: 130,
  category: 150,
  tags: 120,
  receipt: 90,
  status: 110,
};

const STORAGE_KEY_COL_ORDER = 's3_tx_column_order_v6';
const STORAGE_KEY_COL_WIDTHS = 's3_tx_column_widths_v6';
const STORAGE_KEY_DETAIL_WIDTH = 's3_tx_detail_panel_width';
const DEFAULT_DETAIL_PANEL_WIDTH = 380;
const MIN_DETAIL_PANEL_WIDTH = 260;
const MAX_DETAIL_PANEL_WIDTH = 800;

export const S3Transactions: React.FC<S3TransactionsProps> = ({
  transactions,
  accounts,
  hideAmounts,
  initialFilter,
  onUpdateTransaction,
  onDeleteTransaction,
  onCreateRuleFromTransaction,
  rules,
  onDeleteRule,
}) => {
  // Filter States
  const [selectedAccId, setSelectedAccId] = useState<string>(initialFilter?.accountId || 'all');
  const [selectedType, setSelectedType] = useState<string>(initialFilter?.type || 'all');
  const [selectedCategory, setSelectedCategory] = useState<string>(initialFilter?.category || 'all');
  const [onlyUnclassified, setOnlyUnclassified] = useState<boolean>(initialFilter?.unclassifiedOnly || false);
  const [onlyNoReceipt, setOnlyNoReceipt] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Selected for batch editing
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Active Transaction for Detail Panel (기본: 패널 닫힘 상태 -> 테이블 전체 가로폭 100% 활용)
  const [activeTxId, setActiveTxId] = useState<string | null>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);

  // Split Modal State
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitDraft, setSplitDraft] = useState<SplitItem[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<TransactionAttachment | null>(null);
  const [editingAttachmentId, setEditingAttachmentId] = useState<string | null>(null);
  const [editingAttachmentName, setEditingAttachmentName] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Payslip Modal State (PRD F-06 급여 입금 상세 분해)
  const [isPayslipModalOpen, setIsPayslipModalOpen] = useState(false);
  const [payslipModalData, setPayslipModalData] = useState<{
    items: PayslipItem[];
    fileName?: string;
    pendingAttachment?: TransactionAttachment;
  } | null>(null);
  const [isDirectInputMode, setIsDirectInputMode] = useState(false);

  // Dedicated Payslip block states for '수입 > 급여'
  const [payslipState, setPayslipState] = useState<'idle' | 'reading' | 'failed'>('idle');
  const [parsingProgress, setParsingProgress] = useState(0);
  const [readingFileInfo, setReadingFileInfo] = useState<{ name: string; size: string } | null>(null);
  const [parsingFailure, setParsingFailure] = useState<{
    type: 'scan' | 'unrecognized' | 'encrypted';
    fileName: string;
  } | null>(null);
  const [isDraggingPayslip, setIsDraggingPayslip] = useState(false);
  const [isDraggingGeneralAttachment, setIsDraggingGeneralAttachment] = useState(false);
  const [memoDraft, setMemoDraft] = useState('');
  const parsingTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const payslipFileInputRef = React.useRef<HTMLInputElement>(null);

  // Rule registration is derived from persisted rules so it survives refreshes.
  const [isRuleRegistering, setIsRuleRegistering] = useState(false);

  // Pending attachment deletion state (with 8s undo window, commit after expire or row change)
  const [collapsingAttachmentId, setCollapsingAttachmentId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    txId: string;
    attachment: TransactionAttachment;
    originalIndex: number;
    committed: boolean;
  } | null>(null);
  const pendingDeleteRef = useRef<{
    txId: string;
    attachment: TransactionAttachment;
    originalIndex: number;
    committed: boolean;
  } | null>(null);
  pendingDeleteRef.current = pendingDelete;
  const deleteTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Transfer connection states
  const [isAutoChangedToTransfer, setIsAutoChangedToTransfer] = useState(false);
  const [isManualPickingCandidate, setIsManualPickingCandidate] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [selectedOppositeAccount, setSelectedOppositeAccount] = useState<string>('');
  const [pendingDisconnectToast, setPendingDisconnectToast] = useState<{
    txA: Transaction;
    txB: Transaction | null;
  } | null>(null);
  const disconnectToastTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 태그 컬럼 직접 생성 및 편집 팝오버 상태
  const [tagPopoverTxId, setTagPopoverTxId] = useState<string | null>(null);
  const [tagPopoverPos, setTagPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [tagInputVal, setTagInputVal] = useState<string>('');
  const tagPopoverRef = useRef<HTMLDivElement | null>(null);

  // 카테고리 컬럼 직접 추가/수정/변경 팝오버 상태
  const [categoryPopoverTxId, setCategoryPopoverTxId] = useState<string | null>(null);
  const [categoryPopoverPos, setCategoryPopoverPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  }>({ top: 0, left: 0, width: 380, maxHeight: 480 });
  const categoryPopoverRef = useRef<HTMLDivElement | null>(null);
  const [categoryPopoverSearch, setCategoryPopoverSearch] = useState<string>('');
  const [categoryPopoverGroup, setCategoryPopoverGroup] = useState<string>('전체');
  const [categoryPopoverIsAdding, setCategoryPopoverIsAdding] = useState<boolean>(false);
  const [categoryPopoverAddGroup, setCategoryPopoverAddGroup] = useState<string>('식비');
  const [categoryPopoverAddSub, setCategoryPopoverAddSub] = useState<string>('');
  const [categoryPopoverAutoRule, setCategoryPopoverAutoRule] = useState<boolean>(false);
  const [customCategories, setCustomCategories] = useState<string[]>(getStoredCustomCategories);

  useEffect(() => {
    const handleCustomCatsChanged = (e: Event) => {
      const detail = (e as CustomEvent<string[]>).detail;
      if (detail) {
        setCustomCategories(detail);
      } else {
        setCustomCategories(getStoredCustomCategories());
      }
    };
    window.addEventListener('custom-categories-changed', handleCustomCatsChanged);
    return () => {
      window.removeEventListener('custom-categories-changed', handleCustomCatsChanged);
    };
  }, []);

  const mergedCategoryTree = useMemo(() => {
    return getMergedCategoryTree(customCategories);
  }, [customCategories]);

  // 상단 필터 레이어 상태 (계좌, 유형, 카테고리)
  const [isAccountLayerOpen, setIsAccountLayerOpen] = useState(false);
  const accountLayerRef = useRef<HTMLDivElement | null>(null);
  const accountBtnRef = useRef<HTMLButtonElement | null>(null);

  const [isTypeLayerOpen, setIsTypeLayerOpen] = useState(false);
  const typeLayerRef = useRef<HTMLDivElement | null>(null);
  const typeBtnRef = useRef<HTMLButtonElement | null>(null);

  const [isCategoryLayerOpen, setIsCategoryLayerOpen] = useState(false);
  const categoryLayerRef = useRef<HTMLDivElement | null>(null);
  const categoryBtnRef = useRef<HTMLButtonElement | null>(null);

  const TYPE_OPTIONS = useMemo(
    () => [
      { value: 'all', label: '전체 유형', color: 'bg-slate-300' },
      { value: 'expense', label: '지출', color: 'bg-rose-500' },
      { value: 'income', label: '수입', color: 'bg-emerald-500' },
      { value: 'transfer', label: '이체 (통장간)', color: 'bg-sky-500' },
      { value: 'savings', label: '저축/적금', color: 'bg-amber-500' },
    ],
    []
  );

  const selectedAccountLabel = useMemo(() => {
    if (selectedAccId === 'all') return '전체 계좌';
    const acc = accounts.find((a) => a.id === selectedAccId);
    return acc ? acc.alias : '전체 계좌';
  }, [selectedAccId, accounts]);

  const selectedTypeLabel = useMemo(() => {
    const found = TYPE_OPTIONS.find((t) => t.value === selectedType);
    return found ? found.label : '전체 유형';
  }, [selectedType, TYPE_OPTIONS]);

  // 컬럼 정렬 상태 (컬럼 ID, 'none' | 'asc' | 'desc')
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'none' | 'asc' | 'desc'>('none');

  // 컬럼 순서 및 localStorage 영속화
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COL_ORDER);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === DEFAULT_COLUMNS.length) {
          const allMatch = DEFAULT_COLUMNS.every((c) => parsed.includes(c.id));
          if (allMatch) return parsed;
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_COLUMNS.map((c) => c.id);
  });

  // 컬럼 너비 상태 및 localStorage 영속화
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COL_WIDTHS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_COLUMN_WIDTHS, ...parsed };
        }
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_COLUMN_WIDTHS };
  });

  // 드래그 앤 드롭 상태
  const [draggedColId, setDraggedColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const justDraggedRef = useRef<boolean>(false);

  // 컬럼 리사이즈 상태
  const isResizingRef = useRef<boolean>(false);
  const [resizingColId, setResizingColId] = useState<string | null>(null);

  // 상세 패널 너비 조절 상태 (localStorage 영속화)
  const [detailPanelWidth, setDetailPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DETAIL_WIDTH);
      if (saved) {
        const parsed = Number(saved);
        if (!isNaN(parsed) && parsed >= MIN_DETAIL_PANEL_WIDTH && parsed <= MAX_DETAIL_PANEL_WIDTH) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_DETAIL_PANEL_WIDTH;
  });
  const [isResizingDetail, setIsResizingDetail] = useState<boolean>(false);

  // 컬럼 너비 또는 순서가 기본값과 다른지 여부
  const isCustomColumnConfig = useMemo(() => {
    const isCustomOrder = columnOrder.some((colId, idx) => colId !== DEFAULT_COLUMNS[idx].id);
    const isCustomWidth = Object.keys(DEFAULT_COLUMN_WIDTHS).some(
      (key) => columnWidths[key] !== undefined && columnWidths[key] !== DEFAULT_COLUMN_WIDTHS[key]
    );
    return isCustomOrder || isCustomWidth;
  }, [columnOrder, columnWidths]);

  // 스플릿 뷰 활성화 여부 (거래 선택 시)
  const isSplitOpen = Boolean(activeTxId && transactions.some((t) => t.id === activeTxId));

  // 테이블 전체 최소 너비 (체크박스 40px + 각 컬럼 최소/설정 폭 합계)
  const minTableWidth = useMemo(() => {
    const checkboxWidth = 40;
    const sum = columnOrder.reduce((acc, colId) => {
      if (
        colId === 'description' &&
        (!columnWidths[colId] || columnWidths[colId] === DEFAULT_COLUMN_WIDTHS.description)
      ) {
        return acc + 120;
      }
      return acc + (columnWidths[colId] ?? DEFAULT_COLUMN_WIDTHS[colId] ?? 100);
    }, 0);
    return checkboxWidth + sum;
  }, [columnOrder, columnWidths]);

  // 헤더와 바디 행이 100% 동일하게 공유하는 CSS Grid 템플릿 (각 컬럼의 설정된 px 너비 직접 반영)
  const gridTemplateColumns = useMemo(() => {
    const checkboxCol = '40px';
    const tracks = columnOrder.map((colId) => {
      if (
        colId === 'description' &&
        (!columnWidths[colId] || columnWidths[colId] === DEFAULT_COLUMN_WIDTHS.description)
      ) {
        return 'minmax(120px, 1fr)';
      }
      const w = columnWidths[colId] ?? DEFAULT_COLUMN_WIDTHS[colId] ?? 100;
      return `${w}px`;
    });
    return `${checkboxCol} ${tracks.join(' ')}`;
  }, [columnOrder, columnWidths]);

  // 거래 상세정보 패널 너비 드래그 조절 핸들러
  const handleDetailResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingDetail(true);
    const startX = e.clientX;
    const startWidth = detailPanelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      // 우측 패널이므로 마우스가 왼쪽으로 갈수록(delta < 0) 패널 너비는 증가
      const delta = startX - moveEvent.clientX;
      const maxAllowed = Math.min(MAX_DETAIL_PANEL_WIDTH, window.innerWidth - 300);
      const newWidth = Math.min(maxAllowed, Math.max(MIN_DETAIL_PANEL_WIDTH, Math.round(startWidth + delta)));
      setDetailPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setIsResizingDetail(false);
      setDetailPanelWidth((latest) => {
        try {
          localStorage.setItem(STORAGE_KEY_DETAIL_WIDTH, String(latest));
        } catch {
          // ignore
        }
        return latest;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // 컬럼 리사이즈 마우스 드래그 핸들러
  const handleResizeStart = (e: React.MouseEvent, colId: string) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    setResizingColId(colId);

    const startX = e.clientX;
    const colElement = document.getElementById(`th-col-${colId}`);
    const initialWidth = colElement
      ? colElement.getBoundingClientRect().width
      : (columnWidths[colId] ?? DEFAULT_COLUMN_WIDTHS[colId] ?? 100);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const delta = moveEvent.clientX - startX;
      // 거래처/적요(description) 컬럼을 포함하여 최소 너비를 대폭 유연하게 허용 (60px)
      const minWidth =
        colId === 'receipt' || colId === 'status'
          ? 36
          : colId === 'date'
          ? 55
          : colId === 'description'
          ? 60
          : colId === 'amount'
          ? 65
          : 50;
      const newWidth = Math.max(minWidth, Math.round(initialWidth + delta));
      setColumnWidths((prev) => ({
        ...prev,
        [colId]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setResizingColId(null);
      setTimeout(() => {
        isResizingRef.current = false;
      }, 80);

      setColumnWidths((latest) => {
        try {
          localStorage.setItem(STORAGE_KEY_COL_WIDTHS, JSON.stringify(latest));
        } catch {
          // ignore
        }
        return latest;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // 컬럼 정렬 토글 (none -> asc -> desc -> none)
  const handleToggleSort = (colId: string) => {
    if (sortField !== colId) {
      setSortField(colId);
      setSortDirection('asc');
    } else {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection('none');
      } else {
        setSortDirection('asc');
      }
    }
  };

  // 컬럼 드래그 앤 드롭 핸들러
  const handleDragStart = (e: React.DragEvent, colId: string) => {
    setDraggedColId(colId);
    e.dataTransfer.setData('text/plain', colId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColId !== colId) {
      setDragOverColId(colId);
    }
  };

  const handleDragLeave = (e: React.DragEvent, colId: string) => {
    if (dragOverColId === colId) {
      setDragOverColId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    const sourceColId = e.dataTransfer.getData('text/plain') || draggedColId;
    if (sourceColId && sourceColId !== targetColId) {
      setColumnOrder((prev) => {
        const next = [...prev];
        const sourceIdx = next.indexOf(sourceColId);
        const targetIdx = next.indexOf(targetColId);
        if (sourceIdx !== -1 && targetIdx !== -1) {
          next.splice(sourceIdx, 1);
          next.splice(targetIdx, 0, sourceColId);
          try {
            localStorage.setItem(STORAGE_KEY_COL_ORDER, JSON.stringify(next));
          } catch {
            // ignore
          }
        }
        return next;
      });
    }
    setDraggedColId(null);
    setDragOverColId(null);
    justDraggedRef.current = true;
    setTimeout(() => {
      justDraggedRef.current = false;
    }, 100);
  };

  const handleDragEnd = () => {
    setDraggedColId(null);
    setDragOverColId(null);
    justDraggedRef.current = true;
    setTimeout(() => {
      justDraggedRef.current = false;
    }, 100);
  };

  // 컬럼 순서 및 너비 기본값 복원
  const handleResetColumnConfig = () => {
    const defaultOrder = DEFAULT_COLUMNS.map((c) => c.id);
    setColumnOrder(defaultOrder);
    setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS });
    try {
      localStorage.removeItem(STORAGE_KEY_COL_ORDER);
      localStorage.removeItem(STORAGE_KEY_COL_WIDTHS);
      localStorage.removeItem('s3_tx_column_order');
      localStorage.removeItem('s3_tx_column_widths');
      localStorage.removeItem('s3_tx_column_order_v2');
      localStorage.removeItem('s3_tx_column_widths_v2');
      localStorage.removeItem('s3_tx_column_order_v3');
      localStorage.removeItem('s3_tx_column_widths_v3');
      localStorage.removeItem('s3_tx_column_order_v4');
      localStorage.removeItem('s3_tx_column_widths_v4');
      localStorage.removeItem('s3_tx_column_order_v5');
      localStorage.removeItem('s3_tx_column_widths_v5');
    } catch {
      // ignore
    }
  };

  // 일괄 태그 추가 상태
  const [isBatchTagOpen, setIsBatchTagOpen] = useState(false);
  const [batchTagVal, setBatchTagVal] = useState('');
  const [deletedGlobalTags, setDeletedGlobalTags] = useState<Set<string>>(new Set());

  // 전체 거래에서 사용 중인 고유 태그 목록 (추천용)
  const allExistingTags = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((tx) => {
      (tx.tags || []).forEach((tag) => {
        const trimmed = tag ? tag.trim() : '';
        if (trimmed && !deletedGlobalTags.has(trimmed)) {
          set.add(trimmed);
        }
      });
    });
    return Array.from(set);
  }, [transactions, deletedGlobalTags]);

  // 계좌별 거래 건수 집계
  const accountCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: transactions.length,
    };
    accounts.forEach((a) => {
      counts[a.id] = transactions.filter((t) => t.accountId === a.id).length;
    });
    return counts;
  }, [transactions, accounts]);

  // 유형별 거래 건수 집계
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: transactions.length,
      expense: 0,
      income: 0,
      transfer: 0,
      savings: 0,
    };
    transactions.forEach((t) => {
      if (counts[t.type] !== undefined) {
        counts[t.type]++;
      }
    });
    return counts;
  }, [transactions]);

  // 1depth 카테고리별 거래 내역 건수 집계
  const depth1Counts = useMemo(() => {
    const counts: Record<string, number> = {
      all: transactions.length,
    };
    CATEGORY_TREE.forEach((g) => {
      counts[g.group] = transactions.filter((t) => isTxInDepth1Category(t.category, g.group)).length;
    });
    return counts;
  }, [transactions]);

  // 상단 필터 레이어들(계좌, 유형, 카테고리) 외부 클릭 및 ESC 닫기
  useEffect(() => {
    if (!isAccountLayerOpen && !isTypeLayerOpen && !isCategoryLayerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        isAccountLayerOpen &&
        accountLayerRef.current &&
        !accountLayerRef.current.contains(target) &&
        accountBtnRef.current &&
        !accountBtnRef.current.contains(target)
      ) {
        setIsAccountLayerOpen(false);
      }
      if (
        isTypeLayerOpen &&
        typeLayerRef.current &&
        !typeLayerRef.current.contains(target) &&
        typeBtnRef.current &&
        !typeBtnRef.current.contains(target)
      ) {
        setIsTypeLayerOpen(false);
      }
      if (
        isCategoryLayerOpen &&
        categoryLayerRef.current &&
        !categoryLayerRef.current.contains(target) &&
        categoryBtnRef.current &&
        !categoryBtnRef.current.contains(target)
      ) {
        setIsCategoryLayerOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAccountLayerOpen(false);
        setIsTypeLayerOpen(false);
        setIsCategoryLayerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAccountLayerOpen, isTypeLayerOpen, isCategoryLayerOpen]);

  // 태그 팝오버 외부 클릭 및 ESC 닫기
  useEffect(() => {
    if (!tagPopoverTxId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (tagPopoverRef.current && !tagPopoverRef.current.contains(e.target as Node)) {
        setTagPopoverTxId(null);
        setTagInputVal('');
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTagPopoverTxId(null);
        setTagInputVal('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [tagPopoverTxId]);

  // 카테고리 팝오버 외부 클릭 및 ESC 닫기
  useEffect(() => {
    if (!categoryPopoverTxId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (categoryPopoverRef.current && categoryPopoverRef.current.contains(target)) {
        return;
      }
      const activeCell = document.getElementById(`tx-category-cell-${categoryPopoverTxId}`);
      if (activeCell && activeCell.contains(target)) {
        return;
      }
      setCategoryPopoverTxId(null);
      setCategoryPopoverSearch('');
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCategoryPopoverTxId(null);
        setCategoryPopoverSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [categoryPopoverTxId]);

  const handleOpenCategoryPopover = (e: React.MouseEvent, txId: string) => {
    e.stopPropagation();
    if (categoryPopoverTxId === txId) {
      setCategoryPopoverTxId(null);
      setCategoryPopoverSearch('');
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const popoverWidth = Math.min(380, window.innerWidth - 24);
    const targetTx = transactions.find((t) => t.id === txId);
    const isIncome = targetTx?.direction === 'in';
    const popoverDesiredHeight = isIncome ? 380 : 490;

    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 16) {
      left = window.innerWidth - popoverWidth - 16;
    }
    if (left < 16) left = 16;

    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;

    let top: number;
    let maxHeight: number;
    if (spaceBelow < 280 && spaceAbove > spaceBelow) {
      maxHeight = Math.min(popoverDesiredHeight, Math.max(220, spaceAbove));
      top = Math.max(12, rect.top - maxHeight - 6);
    } else {
      maxHeight = Math.min(popoverDesiredHeight, Math.max(220, spaceBelow));
      top = rect.bottom + 6;
    }

    setCategoryPopoverPos({ top, left, width: popoverWidth, maxHeight });
    setCategoryPopoverTxId(txId);
    setCategoryPopoverSearch('');
    setCategoryPopoverIsAdding(false);
    setCategoryPopoverAddSub('');
    setCategoryPopoverAutoRule(false);

    if (targetTx?.category && targetTx.category !== '미분류') {
      const foundGroup = mergedCategoryTree.find((grp) =>
        grp.items.some((it) => it === targetTx.category)
      );
      const parts = targetTx.category.split(' > ');
      const addGrp = isIncome
        ? '수입'
        : foundGroup
        ? foundGroup.group
        : DEFAULT_PARENT_GROUPS.includes(parts[0])
        ? parts[0]
        : '식비';
      setCategoryPopoverGroup('전체');
      setCategoryPopoverAddGroup(addGrp);
    } else {
      setCategoryPopoverGroup('전체');
      setCategoryPopoverAddGroup(isIncome ? '수입' : '식비');
    }
  };

  const handleSelectCategoryForTx = async (txId: string, newCat: string) => {
    const targetTx = transactions.find((t) => t.id === txId);
    if (!targetTx) return;

    let newType = targetTx.type;
    if (newCat.startsWith('수입')) newType = 'income';
    else if (newCat.startsWith('저축')) newType = 'savings';
    else if (newCat.startsWith('이체')) newType = 'transfer';
    else if (targetTx.direction === 'in') newType = 'income';
    else if (newCat !== '미분류') newType = 'expense';

    const updates: Partial<Transaction> = {
      category: newCat,
      type: newType,
      isConfirmed: newCat !== '미분류',
      isManualLocked: true,
    };

    if (newCat === '이체 > 통장간이체') {
      updates.previousCategoryBeforeTransfer =
        targetTx.category !== '이체 > 통장간이체' ? targetTx.category : '미분류';
    } else {
      updates.previousCategoryBeforeTransfer = undefined;
    }

    await onUpdateTransaction(txId, updates);

    if (categoryPopoverAutoRule && newCat !== '미분류' && onCreateRuleFromTransaction) {
      try {
        await onCreateRuleFromTransaction(targetTx, newCat);
      } catch (err) {
        console.error('Failed to create auto rule:', err);
      }
    }

    setCategoryPopoverTxId(null);
    setCategoryPopoverSearch('');
  };

  const handleAddAndSelectCustomCategory = async (txId: string, catString: string) => {
    const trimmed = catString.trim();
    if (!trimmed) return;
    const targetTx = transactions.find((t) => t.id === txId);
    const isIncome = targetTx?.direction === 'in';
    
    let fullCategory = trimmed;
    if (!fullCategory.includes(' > ')) {
      const parent = isIncome ? '수입' : categoryPopoverAddGroup || '식비';
      fullCategory = `${parent} > ${trimmed}`;
    }
    addCustomCategory(fullCategory);
    await handleSelectCategoryForTx(txId, fullCategory);
  };

  const handleOpenTagPopover = (e: React.MouseEvent, txId: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const popoverWidth = 270;
    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    if (left + popoverWidth > window.innerWidth - 16) {
      left = window.innerWidth - popoverWidth - 16;
    }
    if (left < 16) left = 16;

    let top = rect.bottom + 6;
    if (top + 280 > window.innerHeight && rect.top > 280) {
      top = rect.top - 280;
    }

    setTagPopoverPos({ top, left });
    setTagPopoverTxId(txId);
    setTagInputVal('');
  };

  const handleAddTagToTx = async (txId: string, tagToAdd: string) => {
    const cleaned = tagToAdd.trim().replace(/^#/, '');
    if (!cleaned) return;
    setDeletedGlobalTags((prev) => {
      if (prev.has(cleaned)) {
        const next = new Set(prev);
        next.delete(cleaned);
        return next;
      }
      return prev;
    });
    const targetTx = transactions.find((t) => t.id === txId);
    if (!targetTx) return;
    const currentTags = targetTx.tags || [];
    if (currentTags.includes(cleaned)) {
      setTagInputVal('');
      return;
    }
    const newTags = [...currentTags, cleaned];
    await onUpdateTransaction(txId, { tags: newTags });
    setTagInputVal('');
  };

  const handleRemoveTagFromTx = async (txId: string, tagToRemove: string) => {
    const targetTx = transactions.find((t) => t.id === txId);
    if (!targetTx) return;
    const newTags = (targetTx.tags || []).filter((t) => t !== tagToRemove);
    await onUpdateTransaction(txId, { tags: newTags });
  };

  // '기존 태그에서 선택'에서 X 클릭 시 해당 태그를 전체 거래 내역에서 삭제
  const handleDeleteTagGlobally = async (tagToDelete: string) => {
    setDeletedGlobalTags((prev) => new Set(prev).add(tagToDelete));
    const txsWithTag = transactions.filter((t) => (t.tags || []).includes(tagToDelete));
    for (const tx of txsWithTag) {
      const newTags = (tx.tags || []).filter((t) => t !== tagToDelete);
      await onUpdateTransaction(tx.id, { tags: newTags });
    }
  };

  const handleBatchAddTag = async (tagToAdd: string) => {
    const cleaned = tagToAdd.trim().replace(/^#/, '');
    if (!cleaned || selectedIds.size === 0) return;
    setDeletedGlobalTags((prev) => {
      if (prev.has(cleaned)) {
        const next = new Set(prev);
        next.delete(cleaned);
        return next;
      }
      return prev;
    });
    for (const id of Array.from(selectedIds)) {
      const tx = transactions.find((t) => t.id === id);
      if (tx) {
        const cur = tx.tags || [];
        if (!cur.includes(cleaned)) {
          await onUpdateTransaction(id, { tags: [...cur, cleaned] });
        }
      }
    }
    setBatchTagVal('');
    setIsBatchTagOpen(false);
  };

  // Helper to get effective attachments taking pending uncommitted deletion into account
  const getEffectiveAttachments = useCallback(
    (tx: Transaction): TransactionAttachment[] => {
      if (pendingDelete && pendingDelete.txId === tx.id && !pendingDelete.committed) {
        return (tx.attachments || []).filter((a) => a.id !== pendingDelete.attachment.id);
      }
      return tx.attachments || [];
    },
    [pendingDelete]
  );

  const activeTx = transactions.find((t) => t.id === activeTxId);

  const activeAttachments = useMemo(() => {
    return activeTx ? getEffectiveAttachments(activeTx) : [];
  }, [activeTx, getEffectiveAttachments]);

  const hasProofReceipt = useCallback(
    (tx: Transaction) => {
      const atts = getEffectiveAttachments(tx);
      if (atts.length > 0) return true;
      if (tx.attachments && tx.attachments.length > 0) return false;
      return Boolean(tx.receiptUrl);
    },
    [getEffectiveAttachments]
  );

  const registeredRule = useMemo(() => {
    if (!activeTx) return undefined;

    return rules.find(
      (rule) =>
        rule.isActive &&
        rule.condition.keyword === activeTx.counterparty &&
        rule.condition.direction === activeTx.direction &&
        rule.result.category === activeTx.category
    );
  }, [activeTx, rules]);

  // Action needed (미분류, 미확정, 연결 필요 이체)
  const isNeedsAttention = useCallback((t: Transaction) => {
    const isTransfer = t.type === 'transfer' || t.category.startsWith('이체');
    const isUnlinkedTransfer =
      isTransfer && !t.transfer_link_id && !t.transferPairId && !t.transfer_unlinked_allowed;
    return t.category === '미분류' || !t.isConfirmed || isUnlinkedTransfer;
  }, []);

  // Filter logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (selectedAccId !== 'all' && t.accountId !== selectedAccId) return false;
      if (selectedType !== 'all' && t.type !== selectedType) return false;
      if (selectedCategory !== 'all' && !isTxInDepth1Category(t.category, selectedCategory)) return false;
      if (onlyUnclassified && !isNeedsAttention(t)) return false;
      if (onlyNoReceipt && (t.type !== 'expense' || hasProofReceipt(t))) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const str = `${t.counterparty} ${t.rawCounterparty} ${t.rawDescription} ${t.memo || ''} ${t.category} ${t.tags.join(' ')}`.toLowerCase();
        if (!str.includes(q)) return false;
      }

      return true;
    });
  }, [transactions, selectedAccId, selectedType, selectedCategory, onlyUnclassified, onlyNoReceipt, searchTerm, hasProofReceipt, isNeedsAttention]);

  // Sorting logic (컬럼 정렬: 오름차순, 내림차순, 기본/정렬없음)
  const sortedTransactions = useMemo(() => {
    if (!sortField || sortDirection === 'none') {
      return filteredTransactions;
    }

    return [...filteredTransactions].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = (a.occurredAt || '').localeCompare(b.occurredAt || '');
          break;
        case 'account':
          cmp = (a.accountAlias || '').localeCompare(b.accountAlias || '', 'ko');
          break;
        case 'description': {
          const descA = a.counterparty || a.rawDescription || '';
          const descB = b.counterparty || b.rawDescription || '';
          cmp = descA.localeCompare(descB, 'ko');
          break;
        }
        case 'amount': {
          const valA = a.direction === 'in' ? a.amount : -a.amount;
          const valB = b.direction === 'in' ? b.amount : -b.amount;
          cmp = valA - valB;
          break;
        }
        case 'category':
          cmp = (a.category || '').localeCompare(b.category || '', 'ko');
          break;
        case 'tags': {
          const tagA = (a.tags && a.tags[0]) || '';
          const tagB = (b.tags && b.tags[0]) || '';
          cmp = tagA.localeCompare(tagB, 'ko');
          break;
        }
        case 'receipt': {
          const rA = hasProofReceipt(a) ? 1 : 0;
          const rB = hasProofReceipt(b) ? 1 : 0;
          cmp = rA - rB;
          break;
        }
        case 'status': {
          const statusRank = (tx: Transaction) => {
            const isTransfer = tx.type === 'transfer' || tx.category.startsWith('이체');
            const isLinked = isTransfer && Boolean(tx.transfer_link_id || tx.transferPairId);
            const isUnlinked = isTransfer && !isLinked && !tx.transfer_unlinked_allowed;
            if (isUnlinked) return 0;
            if (isLinked) return 1;
            if (!tx.isConfirmed) return 2;
            if (tx.isManualLocked) return 3;
            return 4;
          };
          cmp = statusRank(a) - statusRank(b);
          break;
        }
        default:
          cmp = 0;
      }

      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredTransactions, sortField, sortDirection, hasProofReceipt]);

  // Unclassified & Needs Attention transactions count
  const unclassifiedTxs = useMemo(() => {
    return transactions.filter(isNeedsAttention);
  }, [transactions, isNeedsAttention]);

  // Batch Select Handlers
  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === sortedTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedTransactions.map((t) => t.id)));
    }
  };

  // Batch category apply
  const handleBatchSetCategory = async (category: string) => {
    let resolvedType: 'income' | 'expense' | 'savings' | 'transfer' | undefined;
    if (category.startsWith('수입')) resolvedType = 'income';
    else if (category.startsWith('저축')) resolvedType = 'savings';
    else if (category.startsWith('이체')) resolvedType = 'transfer';
    else if (category !== '미분류') resolvedType = 'expense';

    for (const id of Array.from(selectedIds)) {
      await onUpdateTransaction(id, {
        category,
        ...(resolvedType ? { type: resolvedType } : {}),
        isConfirmed: category !== '미분류',
        isManualLocked: true,
      });
    }
    setSelectedIds(new Set());
  };

  // Open Split Modal
  const handleOpenSplit = () => {
    if (!activeTx) return;
    if (activeTx.splits && activeTx.splits.length > 0) {
      setSplitDraft([...activeTx.splits]);
    } else {
      setSplitDraft([
        { id: 's1', amount: Math.round(activeTx.amount * 0.7), category: activeTx.category || '식비 > 장보기', memo: '항목 1' },
        { id: 's2', amount: activeTx.amount - Math.round(activeTx.amount * 0.7), category: '생활용품 > 세제/화장지', memo: '항목 2' },
      ]);
    }
    setIsSplitModalOpen(true);
  };

  const handleSaveSplit = async () => {
    if (!activeTx) return;
    const sum = splitDraft.reduce((acc, cur) => acc + cur.amount, 0);
    if (sum !== activeTx.amount) {
      alert(`분할 금액의 합계(${formatKRW(sum)})가 거래 총액(${formatKRW(activeTx.amount)})과 정확히 일치해야 합니다.`);
      return;
    }

    await onUpdateTransaction(activeTx.id, {
      splits: splitDraft,
      isConfirmed: true,
      isManualLocked: true,
      tags: Array.from(new Set([...activeTx.tags, '분할거래'])),
    });
    setIsSplitModalOpen(false);
  };

  // Confirm current transaction and navigate to next unclassified or adjacent transaction
  const handleConfirmAndNext = async () => {
    if (!activeTx) return;
    const isTxTransfer = activeTx.type === 'transfer' || activeTx.category.startsWith('이체');
    const isTxLinked = isTxTransfer && Boolean(activeTx.transfer_link_id || activeTx.transferPairId);
    if (isTxTransfer && !isTxLinked && !activeTx.transfer_unlinked_allowed) {
      // 상대편이 정해지지 않은 동안 확정 불가
      return;
    }

    const currentIdx = sortedTransactions.findIndex((t) => t.id === activeTx.id);

    // Confirm active transaction
    await onUpdateTransaction(activeTx.id, {
      isConfirmed: true,
      isManualLocked: true,
    });

    // Find next unclassified or next transaction in sorted list
    const nextUnclassified = sortedTransactions
      .slice(currentIdx + 1)
      .find(isNeedsAttention);
    if (nextUnclassified) {
      setActiveTxId(nextUnclassified.id);
      const el = document.getElementById(`tx-row-${nextUnclassified.id}`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (currentIdx < sortedTransactions.length - 1) {
      const nextTx = sortedTransactions[currentIdx + 1];
      setActiveTxId(nextTx.id);
      const el = document.getElementById(`tx-row-${nextTx.id}`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  // 상세 패널 외부 클릭(Outside Click) 시 닫기 리스너 (비차단형)
  useEffect(() => {
    if (!activeTxId) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 1. 상세 패널 내부 클릭 시 닫지 않음
      if (detailPanelRef.current && detailPanelRef.current.contains(target)) {
        return;
      }

      // 2. 다른 거래 행 클릭 시: 스마트 전환 (해당 행의 onClick이 즉시 activeTxId를 변경)
      if (target.closest('[id^="tx-row-"]')) {
        return;
      }

      // 3. 모달/팝오버/카테고리 셀렉터/토스트/포털 내부 클릭 시 닫지 않음
      if (
        target.closest('[role="dialog"]') ||
        target.closest('.category-selector-popup') ||
        (tagPopoverRef.current && tagPopoverRef.current.contains(target)) ||
        (categoryPopoverRef.current && categoryPopoverRef.current.contains(target)) ||
        target.closest('.animate-toast-in')
      ) {
        return;
      }

      // 4. 테이블 빈 여백, 헤더 등 외부 영역 클릭 시 패널 슬라이드 아웃
      setActiveTxId(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [activeTxId]);

  // Keyboard navigation and shortcuts (PRD requirement: ↑↓ navigation, T for fixed toggle, Enter for confirm, ESC for close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      // If modal dialogs are open, do not trigger background shortcuts
      if (isSplitModalOpen || isPayslipModalOpen || previewAttachment) {
        return;
      }

      if (e.key === 'Escape') {
        if (categoryPopoverTxId) {
          setCategoryPopoverTxId(null);
          return;
        }
        if (tagPopoverTxId) {
          setTagPopoverTxId(null);
          return;
        }
        if (activeTxId) {
          e.preventDefault();
          setActiveTxId(null);
          return;
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!activeTxId) {
          if (sortedTransactions.length > 0) {
            setActiveTxId(sortedTransactions[0].id);
            const el = document.getElementById(`tx-row-${sortedTransactions[0].id}`);
            el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
          return;
        }
        const currentIdx = sortedTransactions.findIndex((t) => t.id === activeTxId);
        if (currentIdx < sortedTransactions.length - 1) {
          const nextTx = sortedTransactions[currentIdx + 1];
          setActiveTxId(nextTx.id);
          const el = document.getElementById(`tx-row-${nextTx.id}`);
          el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!activeTxId) return;
        const currentIdx = sortedTransactions.findIndex((t) => t.id === activeTxId);
        if (currentIdx > 0) {
          const prevTx = sortedTransactions[currentIdx - 1];
          setActiveTxId(prevTx.id);
          const el = document.getElementById(`tx-row-${prevTx.id}`);
          el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      } else if (e.key === 'Enter') {
        if (activeTx) {
          e.preventDefault();
          handleConfirmAndNext();
        }
      } else if (e.key === 't' || e.key === 'T') {
        if (activeTx) {
          e.preventDefault();
          onUpdateTransaction(activeTx.id, {
            isFixed: !activeTx.isFixed,
            isManualLocked: true,
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTxId, sortedTransactions, isSplitModalOpen, isPayslipModalOpen, previewAttachment, tagPopoverTxId, activeTx, onUpdateTransaction]);

  // Reset payslip & transfer candidate states and sync memoDraft when active transaction changes
  useEffect(() => {
    setPayslipState('idle');
    setParsingProgress(0);
    setReadingFileInfo(null);
    setParsingFailure(null);
    setIsDirectInputMode(false);
    setMemoDraft(activeTx?.memo || '');
    setIsManualPickingCandidate(false);
    setSelectedCandidateId('');
    setSelectedOppositeAccount('');
    if (activeTx && activeTx.category !== '이체 > 통장간이체') {
      setIsAutoChangedToTransfer(false);
    }
    if (parsingTimerRef.current) {
      clearInterval(parsingTimerRef.current);
      parsingTimerRef.current = null;
    }
  }, [activeTxId, activeTx?.memo, activeTx?.category]);

  // Payslip handlers (PRD F-06)
  const handleSavePayslip = async (items: PayslipItem[]) => {
    if (!activeTx) return;
    const newAttachments = payslipModalData?.pendingAttachment
      ? [...(activeTx.attachments || []), payslipModalData.pendingAttachment]
      : activeTx.attachments || [];

    await onUpdateTransaction(activeTx.id, {
      attachments: newAttachments,
      payslip: items,
      isConfirmed: true,
      isManualLocked: true,
    });
    setPayslipModalData(null);
    setIsDirectInputMode(false);
    setPayslipState('idle');
    setParsingFailure(null);
  };

  const handleOpenPayslipViewer = () => {
    if (!activeTx) return;
    setIsDirectInputMode(false);
    const currentItems =
      activeTx.payslip && activeTx.payslip.length > 0
        ? activeTx.payslip
        : estimatePayslipFromAmount(activeTx.amount, activeTx.category);

    setPayslipModalData({
      items: currentItems,
      fileName: activeTx.attachments?.[0]?.name,
    });
    setIsPayslipModalOpen(true);
  };

  const handleOpenDirectInput = () => {
    if (!activeTx) return;
    setIsDirectInputMode(true);
    setPayslipModalData({
      items: [],
      fileName: parsingFailure?.fileName || activeTx.attachments?.[0]?.name,
    });
    setIsPayslipModalOpen(true);
  };

  const handleCancelParsing = () => {
    if (parsingTimerRef.current) {
      clearInterval(parsingTimerRef.current);
      parsingTimerRef.current = null;
    }
    setPayslipState('idle');
    setReadingFileInfo(null);
    setParsingProgress(0);
  };

  const handleDeletePayslip = async () => {
    if (!activeTx) return;
    await onUpdateTransaction(activeTx.id, {
      payslip: [],
      attachments: [],
    });
    setPayslipState('idle');
    setParsingFailure(null);
    setReadingFileInfo(null);
  };

  const handleProcessPayslipFile = async (file: File) => {
    if (!activeTx) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = ['png', 'jpg', 'jpeg'].includes(ext) || file.type.startsWith('image/');
    const isExcel = ['xlsx', 'xls', 'csv'].includes(ext);
    const isPdf = ext === 'pdf' || file.type === 'application/pdf';

    if (!isImage && !isExcel && !isPdf) {
      alert('PDF, 이미지(PNG/JPG), 엑셀(.xlsx, .xls), CSV 파일만 업로드할 수 있습니다.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('파일 용량은 최대 10MB까지 가능합니다.');
      return;
    }

    // Format file size (e.g., 248KB)
    const sizeKB = Math.round(file.size / 1024);
    const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)}MB` : `${sizeKB}KB`;

    // 1. Convert to TransactionAttachment and save to activeTx immediately (실패해도 파일은 증빙으로 유지됨)
    const attachment: TransactionAttachment = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          id: `attachment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataUrl: typeof reader.result === 'string' ? reader.result : '',
          createdAt: new Date().toISOString(),
        });
      };
      reader.readAsDataURL(file);
    });

    const updatedAttachments = [attachment]; // 급여 거래에서는 이 파일 슬롯 하나가 증빙을 겸함
    await onUpdateTransaction(activeTx.id, {
      attachments: updatedAttachments,
    });

    // 2. State B: 읽는 중
    setReadingFileInfo({ name: file.name, size: sizeStr });
    setPayslipState('reading');
    setParsingProgress(15);
    setParsingFailure(null);

    // 3. Simulating parsing progress
    if (parsingTimerRef.current) clearInterval(parsingTimerRef.current);

    let progress = 15;
    parsingTimerRef.current = setInterval(async () => {
      progress += 28;
      if (progress < 90) {
        setParsingProgress(progress);
      } else {
        if (parsingTimerRef.current) {
          clearInterval(parsingTimerRef.current);
          parsingTimerRef.current = null;
        }
        setParsingProgress(100);

        const lowerName = file.name.toLowerCase();
        const isEncrypted =
          lowerName.includes('암호') ||
          lowerName.includes('pass') ||
          lowerName.includes('pw') ||
          lowerName.includes('protect') ||
          lowerName.includes('lock');
        const isScanImage =
          isImage ||
          lowerName.includes('스캔') ||
          lowerName.includes('scan') ||
          lowerName.includes('사진') ||
          lowerName.includes('img') ||
          lowerName.includes('캡처');

        if (isEncrypted) {
          // Failure: 암호 걸린 PDF
          setPayslipState('failed');
          setParsingFailure({ type: 'encrypted', fileName: file.name });
        } else if (isScanImage) {
          // Failure: 스캔/사진
          setPayslipState('failed');
          setParsingFailure({ type: 'scan', fileName: file.name });
        } else if (isExcel) {
          // Excel Parsing
          try {
            const buffer = await file.arrayBuffer();
            const parsed = parsePayslipFromWorkbook(buffer);
            if (parsed && parsed.length > 0) {
              await onUpdateTransaction(activeTx.id, {
                payslip: parsed,
                attachments: updatedAttachments,
              });
              setPayslipState('idle');
            } else {
              setPayslipState('failed');
              setParsingFailure({ type: 'unrecognized', fileName: file.name });
            }
          } catch {
            setPayslipState('failed');
            setParsingFailure({ type: 'unrecognized', fileName: file.name });
          }
        } else {
          // PDF / Text Document: 추정 및 표준 급여명세서 항목 생성
          const estimated = estimatePayslipFromAmount(activeTx.amount, activeTx.category, file.name);
          await onUpdateTransaction(activeTx.id, {
            payslip: estimated,
            attachments: updatedAttachments,
          });
          setPayslipState('idle');
        }
      }
    }, 250);
  };

  // Inter-account transfer disconnect / Attachment upload
  const handleAttachmentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeTx || !event.target.files) return;
    const files = Array.from(event.target.files) as File[];

    const isValidFileType = (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      return (
        ['png', 'jpg', 'jpeg', 'pdf', 'xlsx', 'xls', 'csv'].includes(ext) ||
        /^(image\/(png|jpeg)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel|text\/csv)$/.test(
          file.type
        )
      );
    };

    const validFiles = files.filter(isValidFileType);
    if (validFiles.length !== files.length) {
      alert('PNG, JPG, JPEG, PDF, 엑셀(.xlsx, .xls), CSV 파일만 업로드할 수 있습니다.');
    }
    const oversized = validFiles.find((file: File) => file.size > 10 * 1024 * 1024);
    if (oversized) {
      alert('파일 하나당 최대 10MB까지 업로드할 수 있습니다.');
      event.target.value = '';
      return;
    }

    const uploaded = await Promise.all(
      validFiles.map(
        (file: File) =>
          new Promise<TransactionAttachment>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: `attachment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                dataUrl: String(reader.result),
                createdAt: new Date().toISOString(),
              });
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          })
      )
    );

    // Is this a salary / bonus / incentive transaction?
    const isSalaryOrBonus =
      activeTx.category === '수입 > 급여' ||
      activeTx.category === '수입 > 상여금' ||
      activeTx.category === '수입 > 성과급';

    if (isSalaryOrBonus && validFiles.length > 0) {
      const firstFile = validFiles[0];
      const ext = firstFile.name.split('.').pop()?.toLowerCase() || '';
      let parsedItems: PayslipItem[] = [];

      if (['xlsx', 'xls', 'csv'].includes(ext)) {
        try {
          const buffer = await firstFile.arrayBuffer();
          parsedItems = parsePayslipFromWorkbook(buffer);
        } catch (err) {
          console.warn('Workbook parse failed, falling back to estimation:', err);
        }
      }

      if (parsedItems.length === 0) {
        parsedItems = estimatePayslipFromAmount(activeTx.amount, activeTx.category, firstFile.name);
      }

      setPayslipModalData({
        items: parsedItems,
        fileName: firstFile.name,
        pendingAttachment: uploaded[0],
      });
      setIsPayslipModalOpen(true);
      event.target.value = '';
      return;
    }

    if (uploaded.length) {
      await onUpdateTransaction(activeTx.id, {
        attachments: [...(activeTx.attachments || []), ...uploaded],
      });
    }
    event.target.value = '';
  };

  const handleProcessGeneralFiles = async (files: File[]) => {
    if (!activeTx || files.length === 0) return;

    const isValidFileType = (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      return (
        ['png', 'jpg', 'jpeg', 'pdf', 'xlsx', 'xls', 'csv'].includes(ext) ||
        /^(image\/(png|jpeg)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel|text\/csv)$/.test(
          file.type
        )
      );
    };

    const validFiles = files.filter(isValidFileType);
    if (validFiles.length !== files.length) {
      alert('PNG, JPG, JPEG, PDF, 엑셀(.xlsx, .xls), CSV 파일만 업로드할 수 있습니다.');
    }
    const oversized = validFiles.find((file: File) => file.size > 10 * 1024 * 1024);
    if (oversized) {
      alert('파일 하나당 최대 10MB까지 업로드할 수 있습니다.');
      return;
    }

    const uploaded = await Promise.all(
      validFiles.map(
        (file: File) =>
          new Promise<TransactionAttachment>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: `attachment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                dataUrl: String(reader.result),
                createdAt: new Date().toISOString(),
              });
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          })
      )
    );

    if (uploaded.length) {
      await onUpdateTransaction(activeTx.id, {
        attachments: [...(activeTx.attachments || []), ...uploaded],
      });
    }
  };

  const saveAttachmentName = async (attachment: TransactionAttachment) => {
    if (!activeTx || !editingAttachmentName.trim()) return;
    const originalExtension = attachment.name.includes('.') ? attachment.name.slice(attachment.name.lastIndexOf('.')) : '';
    const typedBase = editingAttachmentName.trim().replace(/\.[^.]+$/, '');
    const nextName = `${typedBase || '첨부파일'}${originalExtension}`;
    await onUpdateTransaction(activeTx.id, {
      attachments: (activeTx.attachments || []).map((item) => item.id === attachment.id ? { ...item, name: nextName } : item),
    });
    setEditingAttachmentId(null);
    setEditingAttachmentName('');
  };

  const downloadAttachment = (attachment: TransactionAttachment) => {
    const link = document.createElement('a');
    link.href = attachment.dataUrl;
    link.download = attachment.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const commitPendingDelete = useCallback(
    async (pending: {
      txId: string;
      attachment: TransactionAttachment;
      originalIndex: number;
      committed: boolean;
    }) => {
      if (pending.committed) return;
      pending.committed = true;
      setPendingDelete((prev) =>
        prev && prev.attachment.id === pending.attachment.id ? { ...prev, committed: true } : prev
      );

      const targetTx = transactions.find((t) => t.id === pending.txId);
      if (!targetTx) return;

      const nextAttachments = (targetTx.attachments || []).filter(
        (a) => a.id !== pending.attachment.id
      );
      await onUpdateTransaction(pending.txId, {
        attachments: nextAttachments,
      });
    },
    [transactions, onUpdateTransaction]
  );

  // Commit deletion when moving to another transaction row while toast remains visible
  const prevActiveTxIdRef = useRef<string | null>(activeTxId);
  useEffect(() => {
    if (prevActiveTxIdRef.current && prevActiveTxIdRef.current !== activeTxId) {
      if (
        pendingDeleteRef.current &&
        !pendingDeleteRef.current.committed &&
        pendingDeleteRef.current.txId === prevActiveTxIdRef.current
      ) {
        commitPendingDelete(pendingDeleteRef.current);
      }
    }
    prevActiveTxIdRef.current = activeTxId;
  }, [activeTxId, commitPendingDelete]);

  // Cleanup pending deletion on unmount
  useEffect(() => {
    return () => {
      if (pendingDeleteRef.current && !pendingDeleteRef.current.committed) {
        commitPendingDelete(pendingDeleteRef.current);
      }
      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current);
      }
    };
  }, [commitPendingDelete]);

  const handleDeleteAttachment = useCallback(
    (attachment: TransactionAttachment) => {
      if (!activeTx) return;

      // If there is an existing uncommitted pending deletion, commit it first
      if (pendingDeleteRef.current && !pendingDeleteRef.current.committed) {
        commitPendingDelete(pendingDeleteRef.current);
      }

      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current);
        deleteTimerRef.current = null;
      }

      const curAttachments = activeTx.attachments || [];
      const originalIndex = curAttachments.findIndex((a) => a.id === attachment.id);
      if (originalIndex === -1) return;

      const newPending = {
        txId: activeTx.id,
        attachment,
        originalIndex,
        committed: false,
      };

      setPendingDelete(newPending);
      pendingDeleteRef.current = newPending;

      // 8초 후 자동 커밋 및 토스트 종료
      deleteTimerRef.current = setTimeout(() => {
        if (pendingDeleteRef.current && pendingDeleteRef.current.attachment.id === attachment.id) {
          if (!pendingDeleteRef.current.committed) {
            commitPendingDelete(pendingDeleteRef.current);
          }
          setPendingDelete(null);
          pendingDeleteRef.current = null;
        }
      }, 8000);
    },
    [activeTx, commitPendingDelete]
  );

  const triggerDeleteAttachment = (attachment: TransactionAttachment) => {
    setCollapsingAttachmentId(attachment.id);
    setTimeout(() => {
      setCollapsingAttachmentId(null);
      handleDeleteAttachment(attachment);
    }, 200);
  };

  const handleUndoAttachmentDelete = useCallback(async () => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;

    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }

    setPendingDelete(null);
    pendingDeleteRef.current = null;

    if (pending.committed) {
      // If already committed because of row navigation, restore it back to originalIndex
      const targetTx = transactions.find((t) => t.id === pending.txId);
      if (targetTx) {
        const currentList = [...(targetTx.attachments || [])];
        const insertAt = Math.min(pending.originalIndex, currentList.length);
        currentList.splice(insertAt, 0, pending.attachment);
        await onUpdateTransaction(pending.txId, {
          attachments: currentList,
        });
      }
    }
  }, [transactions, onUpdateTransaction]);

  // Transfer connection helpers and handlers
  const isTransfer = activeTx
    ? activeTx.type === 'transfer' || activeTx.category.startsWith('이체')
    : false;
  const isLinked = activeTx
    ? Boolean(activeTx.transfer_link_id || activeTx.transferPairId)
    : false;
  const isUnlinkedAllowed = Boolean(activeTx?.transfer_unlinked_allowed);

  const transferCandidates = useMemo(() => {
    if (!activeTx || !isTransfer || isLinked || isUnlinkedAllowed) return [];
    return findTransferCandidates(activeTx, transactions);
  }, [activeTx, isTransfer, isLinked, isUnlinkedAllowed, transactions]);

  useEffect(() => {
    if (transferCandidates.length > 0 && !selectedCandidateId) {
      setSelectedCandidateId(transferCandidates[0].id);
    }
  }, [transferCandidates, selectedCandidateId]);

  const linkedCounterpart = useMemo(() => {
    if (!activeTx || !isLinked) return null;
    return (
      transactions.find(
        (t) =>
          t.id === activeTx.transferPairId ||
          (activeTx.transfer_link_id &&
            t.transfer_link_id === activeTx.transfer_link_id &&
            t.id !== activeTx.id)
      ) || null
    );
  }, [activeTx, isLinked, transactions]);

  const fromTx = useMemo(() => {
    if (!activeTx || !linkedCounterpart) return null;
    if (activeTx.direction === 'out' || activeTx.transfer_role === 'from') return activeTx;
    return linkedCounterpart;
  }, [activeTx, linkedCounterpart]);

  const toTx = useMemo(() => {
    if (!activeTx || !linkedCounterpart) return null;
    if (activeTx.direction === 'in' || activeTx.transfer_role === 'to') return activeTx;
    return linkedCounterpart;
  }, [activeTx, linkedCounterpart]);

  const handleSwitchToTransfer = async () => {
    if (!activeTx) return;
    const prevCat = activeTx.category !== '이체 > 통장간이체' ? activeTx.category : '미분류';
    await onUpdateTransaction(activeTx.id, {
      category: '이체 > 통장간이체',
      type: 'transfer',
      previousCategoryBeforeTransfer: prevCat,
      isConfirmed: false,
      isManualLocked: true,
      transfer_unlinked_allowed: false,
    });
    setIsAutoChangedToTransfer(true);
  };

  const handleRevertTransferCategory = async () => {
    if (!activeTx) return;
    const originalCat = activeTx.previousCategoryBeforeTransfer || '미분류';
    let origType: 'income' | 'expense' | 'savings' = activeTx.direction === 'in' ? 'income' : 'expense';
    if (originalCat.startsWith('수입')) origType = 'income';
    else if (originalCat.startsWith('저축')) origType = 'savings';
    else if (originalCat.startsWith('지출')) origType = 'expense';

    await onUpdateTransaction(activeTx.id, {
      category: originalCat,
      type: origType,
      previousCategoryBeforeTransfer: undefined,
      transfer_link_id: undefined,
      transferPairId: undefined,
      transfer_role: undefined,
      transfer_unlinked_allowed: false,
      isConfirmed: originalCat !== '미분류',
      isManualLocked: true,
    });
    setIsAutoChangedToTransfer(false);
  };

  const handleConnectTransfer = async (candidate: Transaction) => {
    if (!activeTx) return;
    const linkId = `link_${Date.now()}_${activeTx.id.slice(-4)}`;
    const activeRole: 'from' | 'to' = activeTx.direction === 'out' ? 'from' : 'to';
    const candRole: 'from' | 'to' = candidate.direction === 'out' ? 'from' : 'to';
    const sharedMemo = activeTx.memo || candidate.memo || '';

    // Update activeTx
    await onUpdateTransaction(activeTx.id, {
      category: '이체 > 통장간이체',
      type: 'transfer',
      transfer_link_id: linkId,
      transferPairId: candidate.id,
      transfer_role: activeRole,
      transferAccountAlias: candidate.accountAlias,
      transfer_unlinked_allowed: false,
      isConfirmed: true,
      isManualLocked: true,
      memo: sharedMemo,
    });

    // Update candidate
    await onUpdateTransaction(candidate.id, {
      category: '이체 > 통장간이체',
      type: 'transfer',
      transfer_link_id: linkId,
      transferPairId: activeTx.id,
      transfer_role: candRole,
      transferAccountAlias: activeTx.accountAlias,
      transfer_unlinked_allowed: false,
      isConfirmed: true,
      isManualLocked: true,
      memo: sharedMemo,
    });

    setIsAutoChangedToTransfer(false);
    setIsManualPickingCandidate(false);
  };

  const handleKeepUnlinkedTransfer = async () => {
    if (!activeTx) return;
    await onUpdateTransaction(activeTx.id, {
      transfer_unlinked_allowed: true,
      transferAccountAlias: selectedOppositeAccount || activeTx.transferAccountAlias,
      isConfirmed: true,
      isManualLocked: true,
    });
  };

  const handleDisconnectTransfer = async () => {
    if (!activeTx) return;
    const counterpart = transactions.find(
      (t) =>
        t.id === activeTx.transferPairId ||
        (activeTx.transfer_link_id &&
          t.transfer_link_id === activeTx.transfer_link_id &&
          t.id !== activeTx.id)
    );

    // Save for undo toast (8 seconds)
    const backupA = { ...activeTx };
    const backupB = counterpart ? { ...counterpart } : null;
    setPendingDisconnectToast({ txA: backupA, txB: backupB });

    if (disconnectToastTimerRef.current) {
      clearTimeout(disconnectToastTimerRef.current);
    }
    disconnectToastTimerRef.current = setTimeout(() => {
      setPendingDisconnectToast(null);
    }, 8000);

    // Revert activeTx to 미분류
    await onUpdateTransaction(activeTx.id, {
      type: activeTx.direction === 'in' ? 'income' : 'expense',
      category: '미분류',
      transfer_link_id: undefined,
      transferPairId: undefined,
      transfer_role: undefined,
      transferAccountAlias: undefined,
      is_auto_linked: false,
      transfer_unlinked_allowed: false,
      isConfirmed: false,
      isManualLocked: true,
    });

    // Revert counterpart to 미분류
    if (counterpart) {
      await onUpdateTransaction(counterpart.id, {
        type: counterpart.direction === 'in' ? 'income' : 'expense',
        category: '미분류',
        transfer_link_id: undefined,
        transferPairId: undefined,
        transfer_role: undefined,
        transferAccountAlias: undefined,
        is_auto_linked: false,
        transfer_unlinked_allowed: false,
        isConfirmed: false,
        isManualLocked: true,
      });
    }
  };

  const handleUndoDisconnectTransfer = async () => {
    if (!pendingDisconnectToast) return;
    if (disconnectToastTimerRef.current) {
      clearTimeout(disconnectToastTimerRef.current);
      disconnectToastTimerRef.current = null;
    }
    const { txA, txB } = pendingDisconnectToast;
    setPendingDisconnectToast(null);

    await onUpdateTransaction(txA.id, {
      category: txA.category,
      type: txA.type,
      transfer_link_id: txA.transfer_link_id,
      transferPairId: txA.transferPairId,
      transfer_role: txA.transfer_role,
      transferAccountAlias: txA.transferAccountAlias,
      is_auto_linked: txA.is_auto_linked,
      transfer_unlinked_allowed: txA.transfer_unlinked_allowed,
      isConfirmed: txA.isConfirmed,
      isManualLocked: txA.isManualLocked,
      memo: txA.memo,
    });

    if (txB) {
      await onUpdateTransaction(txB.id, {
        category: txB.category,
        type: txB.type,
        transfer_link_id: txB.transfer_link_id,
        transferPairId: txB.transferPairId,
        transfer_role: txB.transfer_role,
        transferAccountAlias: txB.transferAccountAlias,
        is_auto_linked: txB.is_auto_linked,
        transfer_unlinked_allowed: txB.transfer_unlinked_allowed,
        isConfirmed: txB.isConfirmed,
        isManualLocked: txB.isManualLocked,
        memo: txB.memo,
      });
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-100/60">
      {/* Top Filter Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Search Box */}
          <div className="relative w-48">
            <input
              type="text"
              placeholder="거래처, 적요, 메모, 태그 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 outline-none"
            />
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>

          {/* Account Filter Layer */}
          <div className="relative">
            <button
              id="account-filter-layer-btn"
              ref={accountBtnRef}
              type="button"
              onClick={() => {
                setIsAccountLayerOpen((prev) => !prev);
                setIsTypeLayerOpen(false);
                setIsCategoryLayerOpen(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition outline-none cursor-pointer ${
                selectedAccId !== 'all'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs'
                  : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
              title="계좌 선택 레이어 열기"
            >
              <Wallet className={`h-3.5 w-3.5 ${selectedAccId !== 'all' ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span className="max-w-[120px] truncate">{selectedAccountLabel}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-150 ${
                  isAccountLayerOpen ? 'rotate-180 text-indigo-600' : 'text-slate-400'
                }`}
              />
            </button>

            {/* Account Popover */}
            {isAccountLayerOpen && (
              <div
                id="account-filter-layer-popover"
                ref={accountLayerRef}
                className="absolute left-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-2 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="flex items-center justify-between px-2.5 py-1.5 mb-1 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Wallet className="h-3.5 w-3.5 text-indigo-500" />
                    <span>계좌 선택</span>
                  </div>
                  {selectedAccId !== 'all' && (
                    <button
                      id="account-filter-reset-btn"
                      type="button"
                      onClick={() => {
                        setSelectedAccId('all');
                        setIsAccountLayerOpen(false);
                      }}
                      className="text-[11px] text-slate-400 hover:text-indigo-600 transition-colors font-medium cursor-pointer"
                    >
                      초기화
                    </button>
                  )}
                </div>

                <div className="space-y-0.5 max-h-72 overflow-y-auto pr-0.5">
                  <button
                    id="account-option-all"
                    type="button"
                    onClick={() => {
                      setSelectedAccId('all');
                      setIsAccountLayerOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors text-left cursor-pointer ${
                      selectedAccId === 'all'
                        ? 'bg-indigo-50 text-indigo-700 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                      <span>전체 계좌</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">
                        {accountCounts['all'] || transactions.length}건
                      </span>
                      {selectedAccId === 'all' && (
                        <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                      )}
                    </div>
                  </button>

                  {accounts.map((a) => {
                    const isSelected = selectedAccId === a.id;
                    const count = accountCounts[a.id] || 0;
                    return (
                      <button
                        key={a.id}
                        id={`account-option-${a.id}`}
                        type="button"
                        onClick={() => {
                          setSelectedAccId(a.id);
                          setIsAccountLayerOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors text-left cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 text-indigo-700 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50 font-medium'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0 pr-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: a.color || '#6366f1' }}
                          />
                          <span className="truncate">
                            <span className="font-semibold">{a.alias}</span>
                            {a.bankName && (
                              <span className="ml-1 text-[11px] text-slate-400 font-normal">
                                ({a.bankName})
                              </span>
                            )}
                          </span>
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] text-slate-400">
                            {count}건
                          </span>
                          {isSelected && (
                            <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Type Filter Layer */}
          <div className="relative">
            <button
              id="type-filter-layer-btn"
              ref={typeBtnRef}
              type="button"
              onClick={() => {
                setIsTypeLayerOpen((prev) => !prev);
                setIsAccountLayerOpen(false);
                setIsCategoryLayerOpen(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition outline-none cursor-pointer ${
                selectedType !== 'all'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs'
                  : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
              title="거래 유형 선택 레이어 열기"
            >
              <Layers className={`h-3.5 w-3.5 ${selectedType !== 'all' ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span>{selectedTypeLabel}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-150 ${
                  isTypeLayerOpen ? 'rotate-180 text-indigo-600' : 'text-slate-400'
                }`}
              />
            </button>

            {/* Type Popover */}
            {isTypeLayerOpen && (
              <div
                id="type-filter-layer-popover"
                ref={typeLayerRef}
                className="absolute left-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-2 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="flex items-center justify-between px-2.5 py-1.5 mb-1 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Layers className="h-3.5 w-3.5 text-indigo-500" />
                    <span>유형 선택</span>
                  </div>
                  {selectedType !== 'all' && (
                    <button
                      id="type-filter-reset-btn"
                      type="button"
                      onClick={() => {
                        setSelectedType('all');
                        setIsTypeLayerOpen(false);
                      }}
                      className="text-[11px] text-slate-400 hover:text-indigo-600 transition-colors font-medium cursor-pointer"
                    >
                      초기화
                    </button>
                  )}
                </div>

                <div className="space-y-0.5">
                  {TYPE_OPTIONS.map((opt) => {
                    const isSelected = selectedType === opt.value;
                    const count = typeCounts[opt.value] ?? 0;
                    return (
                      <button
                        key={opt.value}
                        id={`type-option-${opt.value}`}
                        type="button"
                        onClick={() => {
                          setSelectedType(opt.value);
                          setIsTypeLayerOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors text-left cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 text-indigo-700 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50 font-medium'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                          <span>{opt.label}</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">{count}건</span>
                          {isSelected && (
                            <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Category Filter Layer (1depth only in separate layer) */}
          <div className="relative">
            <button
              id="category-filter-layer-btn"
              ref={categoryBtnRef}
              type="button"
              onClick={() => {
                setIsCategoryLayerOpen((prev) => !prev);
                setIsAccountLayerOpen(false);
                setIsTypeLayerOpen(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition outline-none cursor-pointer ${
                selectedCategory !== 'all'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs'
                  : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
              title="카테고리 1depth 선택 레이어 열기"
            >
              <Tag className={`h-3.5 w-3.5 ${selectedCategory !== 'all' ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span>{selectedCategory === 'all' ? '전체 카테고리' : selectedCategory}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-150 ${
                  isCategoryLayerOpen ? 'rotate-180 text-indigo-600' : 'text-slate-400'
                }`}
              />
            </button>

            {/* Separate Layer Popover */}
            {isCategoryLayerOpen && (
              <div
                id="category-filter-layer-popover"
                ref={categoryLayerRef}
                className="absolute left-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-2 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="flex items-center justify-between px-2.5 py-1.5 mb-1 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Filter className="h-3.5 w-3.5 text-indigo-500" />
                    <span>카테고리 선택 (1depth)</span>
                  </div>
                  {selectedCategory !== 'all' && (
                    <button
                      id="category-filter-reset-btn"
                      type="button"
                      onClick={() => {
                        setSelectedCategory('all');
                        setIsCategoryLayerOpen(false);
                      }}
                      className="text-[11px] text-slate-400 hover:text-indigo-600 transition-colors font-medium cursor-pointer"
                    >
                      초기화
                    </button>
                  )}
                </div>

                <div className="space-y-0.5 max-h-72 overflow-y-auto pr-0.5">
                  <button
                    id="category-option-all"
                    type="button"
                    onClick={() => {
                      setSelectedCategory('all');
                      setIsCategoryLayerOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors text-left cursor-pointer ${
                      selectedCategory === 'all'
                        ? 'bg-indigo-50 text-indigo-700 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                      <span>전체 카테고리</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">
                        {depth1Counts['all'] || transactions.length}건
                      </span>
                      {selectedCategory === 'all' && (
                        <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                      )}
                    </div>
                  </button>

                  {CATEGORY_TREE.map((g) => {
                    const isSelected = selectedCategory === g.group;
                    const count = depth1Counts[g.group] || 0;
                    return (
                      <button
                        key={g.group}
                        id={`category-option-${g.group}`}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(g.group);
                          setIsCategoryLayerOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors text-left cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 text-indigo-700 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50 font-medium'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              g.group === '수입'
                                ? 'bg-emerald-500'
                                : g.group === '식비'
                                ? 'bg-amber-500'
                                : g.group === '주거/통신'
                                ? 'bg-sky-500'
                                : g.group === '금융/보험/세금'
                                ? 'bg-violet-500'
                                : g.group === '생활/쇼핑'
                                ? 'bg-pink-500'
                                : g.group === '문화/여가/교통'
                                ? 'bg-teal-500'
                                : 'bg-slate-400'
                            }`}
                          />
                          <span>{g.group}</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400">
                            {count}건
                          </span>
                          {isSelected && (
                            <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Quick Toggles */}
          <button
            onClick={() => setOnlyUnclassified(!onlyUnclassified)}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition ${
              onlyUnclassified
                ? 'bg-amber-100 border-amber-300 text-amber-900'
                : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            확인 필요 ({unclassifiedTxs.length}건)
          </button>

          <button
            onClick={() => setOnlyNoReceipt(!onlyNoReceipt)}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition ${
              onlyNoReceipt
                ? 'bg-rose-100 border-rose-300 text-rose-900'
                : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            증빙 없음만
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500 font-medium">
            검색 결과 <span className="font-bold text-slate-900">{sortedTransactions.length}건</span>
          </div>
          {sortField && sortDirection !== 'none' && (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-semibold animate-in fade-in">
              <span>
                정렬: {DEFAULT_COLUMNS.find((c) => c.id === sortField)?.label}{' '}
                {sortDirection === 'asc' ? '오름차순 ⬆' : '내림차순 ⬇'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSortField(null);
                  setSortDirection('none');
                }}
                className="hover:text-rose-600 transition ml-0.5 cursor-pointer p-0.5"
                title="정렬 해제"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {isCustomColumnConfig && (
            <button
              type="button"
              onClick={handleResetColumnConfig}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-600 text-[11px] font-medium transition cursor-pointer"
              title="기본 컬럼 순서 및 너비로 복원"
            >
              <RotateCcw className="h-2.5 w-2.5 text-slate-500" />
              <span>컬럼 설정 초기화</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Container: Split View Layout (Table + User Resizable Detail Panel Side-by-Side) */}
      <div className="flex flex-1 overflow-hidden relative w-full">
        {/* Center: Transactions Table (스플릿 뷰 활성화 시 상세 패널 너비에 맞춰 유연하게 비례 반응) */}
        <div
          className={`flex flex-col overflow-hidden bg-white min-w-0 ${
            isSplitOpen ? 'flex-1' : 'w-full flex-1'
          }`}
        >
          {/* Scrollable Container with scrollbar-gutter: stable */}
          <div
            className="flex-1 overflow-y-auto overflow-x-auto relative"
            style={{ scrollbarGutter: 'stable' }}
          >
            <div style={{ minWidth: `${minTableWidth}px`, width: '100%' }}>
              {/* Sticky Table Header */}
              <div
                className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 select-none shadow-xs text-xs font-bold text-slate-600 border-l-4 border-l-transparent"
                style={{ display: 'grid', gridTemplateColumns }}
              >
                {/* Checkbox */}
                <div className="flex items-center justify-center py-2.5 shrink-0">
                  <button onClick={handleSelectAll} className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer">
                    {selectedIds.size > 0 && selectedIds.size === sortedTransactions.length ? (
                      <CheckSquare className="h-4 w-4 text-indigo-600" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Draggable, Sortable & Resizable Column Headers */}
                {columnOrder.map((colId) => {
                  const col = DEFAULT_COLUMNS.find((c) => c.id === colId);
                  if (!col) return null;
                  const isSorted = sortField === col.id && sortDirection !== 'none';
                  const isDragging = draggedColId === col.id;
                  const isDragOver = dragOverColId === col.id && draggedColId !== col.id;
                  const isResizing = resizingColId === col.id;

                  return (
                    <div
                      key={col.id}
                      id={`th-col-${col.id}`}
                      draggable
                      onDragStart={(e) => {
                        if (isResizingRef.current) {
                          e.preventDefault();
                          return;
                        }
                        handleDragStart(e, col.id);
                      }}
                      onDragOver={(e) => handleDragOver(e, col.id)}
                      onDragLeave={(e) => handleDragLeave(e, col.id)}
                      onDrop={(e) => handleDrop(e, col.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => {
                        if (justDraggedRef.current || isResizingRef.current) return;
                        handleToggleSort(col.id);
                      }}
                      className={`group/colheader relative flex items-center justify-center px-3 py-2.5 cursor-grab active:cursor-grabbing transition-colors select-none min-w-0 ${
                        isDragging ? 'opacity-30 bg-slate-200' : 'hover:bg-slate-200/60'
                      } ${isDragOver ? 'border-l-2 border-indigo-600 bg-indigo-50/80' : ''}`}
                      title={`${col.label} · 클릭: 정렬 변경 | 드래그: 순서 변경 | 우측 경계선 드래그: 너비 조절`}
                    >
                      {/* 헤더명 가운데 정렬 */}
                      <div className="flex items-center justify-center gap-1.5 w-full min-w-0">
                        <GripVertical className="h-3 w-3 text-slate-300 group-hover/colheader:text-slate-500 shrink-0 opacity-0 group-hover/colheader:opacity-60 transition-opacity" />
                        <span className={`truncate text-center ${isSorted ? 'text-indigo-600 font-extrabold' : 'text-slate-600 font-bold'}`}>
                          {col.label}
                        </span>
                        {isSorted ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-indigo-600 shrink-0 stroke-[2.5]" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-indigo-600 shrink-0 stroke-[2.5]" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-300 opacity-0 group-hover/colheader:opacity-70 transition-opacity shrink-0" />
                        )}
                      </div>

                      {/* Column Resize Handle */}
                      <div
                        className={`absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-20 flex items-center justify-center select-none group/resizer hover:bg-indigo-500/20 rounded-xs transition-colors ${
                          isResizing ? 'bg-indigo-500/30' : ''
                        }`}
                        onMouseDown={(e) => handleResizeStart(e, col.id)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          const defaultW = DEFAULT_COLUMN_WIDTHS[col.id] ?? 100;
                          setColumnWidths((prev) => {
                            const updated = { ...prev, [col.id]: defaultW };
                            try {
                              localStorage.setItem(STORAGE_KEY_COL_WIDTHS, JSON.stringify(updated));
                            } catch {
                              // ignore
                            }
                            return updated;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        title={`${col.label} 열 너비 조절 (더블클릭 시 기본 너비로 복원)`}
                      >
                        <div
                          className={`w-[1.5px] h-3/5 rounded-full transition-colors ${
                            isResizing ? 'bg-indigo-600 h-full' : 'bg-slate-300 group-hover/resizer:bg-indigo-500'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Table Body Rows */}
              {sortedTransactions.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-xs text-slate-400">
                  <Filter className="h-6 w-6 text-slate-300 mb-1" />
                  <span>해당 조건의 거래가 없습니다</span>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {sortedTransactions.map((tx) => {
                    const isSelected = selectedIds.has(tx.id);
                    const isActive = activeTxId === tx.id;
                    const isTransfer = tx.type === 'transfer' || tx.category.startsWith('이체');
                    const isLinked = isTransfer && Boolean(tx.transfer_link_id || tx.transferPairId);
                    const isUnlinkedTransfer = isTransfer && !isLinked && !tx.transfer_unlinked_allowed;
                    const isUnclassified = tx.category === '미분류';

                    // 상대 행 강조 (활성 거래와 연결된 상대 거래)
                    const isCounterpartOfActive = Boolean(
                      activeTx &&
                        (activeTx.transferPairId === tx.id ||
                          (activeTx.transfer_link_id &&
                            tx.transfer_link_id === activeTx.transfer_link_id &&
                            tx.id !== activeTx.id))
                    );

                    const counterpart = transactions.find(
                      (t) =>
                        t.id === tx.transferPairId ||
                        (tx.transfer_link_id &&
                          t.transfer_link_id === tx.transfer_link_id &&
                          t.id !== tx.id)
                    );
                    const counterpartAccount =
                      counterpart?.accountAlias?.split(' ')[0] ||
                      tx.transferAccountAlias?.split(' ')[0] ||
                      '상대통장';
                    const roleSuffix =
                      tx.transfer_role === 'from' || tx.direction === 'out'
                        ? '(보냄)'
                        : '(받음)';

                    return (
                      <div
                        key={tx.id}
                        id={`tx-row-${tx.id}`}
                        onClick={() => setActiveTxId(tx.id)}
                        className={`text-xs cursor-pointer transition select-none border-l-4 ${
                          isActive
                            ? 'bg-indigo-50/70 border-l-indigo-600'
                            : isCounterpartOfActive
                            ? 'bg-indigo-50/40 border-l-indigo-400'
                            : isSelected
                            ? 'bg-slate-50/80 border-l-transparent'
                            : 'hover:bg-slate-50/60 border-l-transparent'
                        }`}
                        style={{ display: 'grid', gridTemplateColumns }}
                      >
                        {/* Checkbox */}
                        <div
                          className="flex items-center justify-center py-3 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelect(tx.id);
                          }}
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-indigo-600 cursor-pointer" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-300 hover:text-slate-500 cursor-pointer" />
                          )}
                        </div>

                        {/* Columns rendered in user-configured columnOrder */}
                        {columnOrder.map((colId) => {
                          switch (colId) {
                            case 'date':
                              return (
                                <div key="date" className="min-w-0 px-3 py-3 flex items-center justify-start text-left text-slate-500 font-mono text-[11px]">
                                  <span className="truncate">{tx.occurredAt.split(' ')[0]}</span>
                                </div>
                              );
                            case 'account':
                              return (
                                <div key="account" className="min-w-0 px-3 py-3 flex items-center justify-start text-left text-slate-700 font-semibold text-xs">
                                  <span className="truncate" title={tx.accountAlias || ''}>
                                    {tx.accountAlias?.split(' ')[0]}
                                  </span>
                                </div>
                              );
                            case 'description':
                              return (
                                <div key="description" className="min-w-0 px-3 py-2.5 flex flex-col justify-center text-left">
                                  <div className="font-bold text-slate-900 flex items-center gap-1.5 min-w-0">
                                    {isTransfer && !isLinked && (
                                      <span className="text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-200 px-1.5 py-0.2 rounded shrink-0">
                                        이체
                                      </span>
                                    )}
                                    <span className="truncate" title={isLinked ? `${counterpartAccount} ${roleSuffix}` : tx.counterparty}>
                                      {(() => {
                                        if (isLinked) {
                                          return `${counterpartAccount} ${roleSuffix}`;
                                        }
                                        if (isTransfer && tx.transferAccountAlias) {
                                          return `${tx.transferAccountAlias.split(' ')[0]} ${roleSuffix}`;
                                        }
                                        return tx.counterparty;
                                      })()}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 truncate mt-0.5" title={tx.rawDescription || tx.memo || ''}>
                                    {isLinked
                                      ? tx.counterparty || tx.rawDescription
                                      : tx.rawDescription !== tx.counterparty
                                      ? tx.rawDescription
                                      : ''}
                                    {tx.memo ? ` · [메모] ${tx.memo}` : ''}
                                  </div>
                                </div>
                              );
                            case 'amount':
                              return (
                                <div
                                  key="amount"
                                  className={`min-w-0 px-3 py-3 flex items-center justify-end text-right font-bold tabular-nums text-xs ${
                                    isTransfer
                                      ? 'text-slate-600'
                                      : tx.direction === 'in'
                                      ? 'text-emerald-600'
                                      : 'text-slate-900'
                                  }`}
                                >
                                  <span className="truncate">{formatSignedKRW(tx.amount, tx.direction, hideAmounts)}</span>
                                </div>
                              );
                            case 'category':
                              return (
                                <div
                                  key="category"
                                  id={`tx-category-cell-${tx.id}`}
                                  onClick={(e) => handleOpenCategoryPopover(e, tx.id)}
                                  className="min-w-0 px-2.5 py-1 flex items-center justify-start text-left cursor-pointer hover:bg-indigo-50/50 rounded-lg transition min-h-[34px] group/catcell overflow-hidden select-none"
                                  title="클릭하여 카테고리 추가/수정/변경"
                                >
                                  <span
                                    className={`inline-flex items-center gap-1 max-w-full truncate text-[11px] px-2 py-0.5 rounded-md font-semibold border transition ${
                                      isUnclassified
                                        ? 'bg-amber-100 text-amber-900 border-amber-300 group-hover/catcell:bg-amber-200/90 group-hover/catcell:border-amber-400 shadow-2xs'
                                        : isTransfer
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200/70 group-hover/catcell:bg-indigo-100 group-hover/catcell:border-indigo-300'
                                        : 'bg-slate-100 text-slate-700 border-slate-200/80 group-hover/catcell:bg-white group-hover/catcell:text-indigo-700 group-hover/catcell:border-indigo-300 group-hover/catcell:shadow-2xs'
                                    }`}
                                    title={tx.splits && tx.splits.length > 0 ? `분할(${tx.splits.length})` : tx.category}
                                  >
                                    <span className="truncate">
                                      {tx.splits && tx.splits.length > 0 ? `분할(${tx.splits.length})` : tx.category}
                                    </span>
                                    <ChevronDown className="h-2.5 w-2.5 opacity-40 group-hover/catcell:opacity-100 text-slate-500 group-hover/catcell:text-indigo-600 shrink-0 transition" />
                                  </span>
                                </div>
                              );
                            case 'tags':
                              return (
                                <div
                                  key="tags"
                                  onClick={(e) => handleOpenTagPopover(e, tx.id)}
                                  className="min-w-0 px-2.5 py-1 flex items-center justify-start text-left cursor-pointer hover:bg-indigo-50/40 rounded transition min-h-[32px] group/tagcell overflow-hidden"
                                  title="클릭하여 태그 관리 및 추가"
                                >
                                  {tx.tags && tx.tags.length > 0 ? (
                                    <div className="flex items-center gap-1 max-w-full overflow-hidden">
                                      <span
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-50/90 text-indigo-700 border border-indigo-200/60 rounded text-[10px] font-medium max-w-[85px] truncate"
                                        title={`#${tx.tags[0]}`}
                                      >
                                        <span className="truncate">#{tx.tags[0]}</span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveTagFromTx(tx.id, tx.tags[0]);
                                          }}
                                          className="text-indigo-400 hover:text-rose-600 ml-0.5 transition shrink-0 cursor-pointer"
                                          title="태그 삭제"
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </span>
                                      {tx.tags.length > 1 && (
                                        <span
                                          className="text-[9px] px-1 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-semibold shrink-0"
                                          title={tx.tags.slice(1).map((rem) => `#${rem}`).join(', ')}
                                        >
                                          +{tx.tags.length - 1}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-slate-300 group-hover/tagcell:text-indigo-500 transition select-none">
                                      —
                                    </span>
                                  )}
                                </div>
                              );
                            case 'receipt':
                              return (
                                <div key="receipt" className="min-w-0 px-1 py-3 flex items-center justify-center text-center">
                                  {hasProofReceipt(tx) ? (
                                    <span className="text-emerald-600 text-[11px] font-semibold flex items-center justify-center gap-0.5" title="증빙 첨부됨">
                                      <Receipt className="h-3.5 w-3.5" />
                                      <span className="hidden xl:inline text-[10px]">첨부</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 text-[11px] select-none">—</span>
                                  )}
                                </div>
                              );
                            case 'status':
                              return (
                                <div key="status" className="min-w-0 px-2 py-3 flex items-center justify-center text-center">
                                  {isLinked ? (
                                    <span className="text-[10px] bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-0.5">
                                      <ArrowUpDown className="h-2.5 w-2.5 text-slate-600" />
                                      <span>연결</span>
                                    </span>
                                  ) : isUnlinkedTransfer ? (
                                    <span className="text-[10px] bg-rose-50 text-rose-600 border border-rose-200/60 px-1.5 py-0.5 rounded font-bold inline-block whitespace-nowrap">
                                      연결 필요
                                    </span>
                                  ) : tx.isConfirmed ? (
                                    <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
                                      확정
                                    </span>
                                  ) : tx.isManualLocked ? (
                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                                      수동
                                    </span>
                                  ) : (
                                    <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold">
                                      확인필요
                                    </span>
                                  )}
                                </div>
                              );
                            default:
                              return null;
                          }
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Batch Actions Toolbar (Appears when items are selected) */}
          {selectedIds.size > 0 && (
            <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between shrink-0 shadow-lg border-t border-slate-800 animate-in slide-in-from-bottom-2">
              <div className="text-xs flex items-center gap-3">
                <span className="font-bold text-indigo-300">{selectedIds.size}건 선택됨</span>
                <span className="text-slate-400">|</span>
                <span>일괄 카테고리 지정:</span>
                <CategorySelector
                  value=""
                  onChange={(newCategory) => {
                    if (newCategory && newCategory !== '미분류') {
                      handleBatchSetCategory(newCategory);
                    }
                  }}
                  align="left"
                  size="sm"
                />
                <span className="text-slate-400">|</span>
                {/* 일괄 태그 추가 */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsBatchTagOpen(!isBatchTagOpen)}
                    className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg flex items-center gap-1.5 transition"
                  >
                    <Tag className="h-3 w-3 text-indigo-400" />
                    <span>일괄 태그 지정</span>
                  </button>
                  {isBatchTagOpen && (
                    <div className="absolute left-0 bottom-full mb-2 bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-2xl w-64 z-50 animate-in fade-in zoom-in-95">
                      <div className="text-xs font-semibold text-slate-200 mb-2 flex items-center justify-between">
                        <span>선택 {selectedIds.size}건에 태그 추가</span>
                        <button
                          type="button"
                          onClick={() => setIsBatchTagOpen(false)}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleBatchAddTag(batchTagVal);
                        }}
                        className="flex items-center gap-1.5"
                      >
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">#</span>
                          <input
                            type="text"
                            autoFocus
                            value={batchTagVal}
                            onChange={(e) => setBatchTagVal(e.target.value)}
                            placeholder="태그 입력..."
                            className="w-full pl-5 pr-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded-md text-white outline-none focus:border-indigo-500"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={!batchTagVal.trim()}
                          className="px-2 py-1 text-xs bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-500 disabled:opacity-40"
                        >
                          적용
                        </button>
                      </form>
                      {allExistingTags.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-700/60">
                          <div className="text-[10px] text-slate-400 mb-1">기존 태그 선택:</div>
                          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                            {allExistingTags.slice(0, 8).map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => handleBatchAddTag(tag)}
                                className="text-[10px] px-1.5 py-0.5 bg-slate-700/80 hover:bg-indigo-600 text-slate-200 rounded transition"
                              >
                                #{tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1 text-xs text-slate-400 hover:text-white rounded-lg transition"
                >
                  선택 해제
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Vertical Resize Divider Handle between Table and Detail Panel (Subtle 1-2px neutral line with generous hit area) */}
        {isSplitOpen && activeTx && (
          <div
            className="relative w-2.5 shrink-0 cursor-col-resize z-20 flex items-center justify-center select-none group"
            onMouseDown={handleDetailResizeStart}
            onDoubleClick={() => {
              setDetailPanelWidth(DEFAULT_DETAIL_PANEL_WIDTH);
              try {
                localStorage.setItem(STORAGE_KEY_DETAIL_WIDTH, String(DEFAULT_DETAIL_PANEL_WIDTH));
              } catch {
                // ignore
              }
            }}
            title="좌우로 드래그하여 상세 정보 패널 너비 조절 (더블클릭 시 기본 크기로 복원)"
          >
            {/* Subtle 1px neutral border line (#E5E7EB / #D1D5DB) */}
            <div
              className={`w-[1px] h-full transition-colors ${
                isResizingDetail
                  ? 'bg-slate-400 w-[2px]'
                  : 'bg-slate-200 group-hover:bg-slate-300'
              }`}
            />
          </div>
        )}

        {/* Right Detail Panel - 사용자가 너비 조절 가능한 스플릿 뷰 패널 */}
        <div
          ref={detailPanelRef}
          style={{
            width: isSplitOpen && activeTx ? `${detailPanelWidth}px` : 0,
            minWidth: isSplitOpen && activeTx ? `${MIN_DETAIL_PANEL_WIDTH}px` : 0,
            maxWidth: '85vw',
          }}
          className={`bg-white border-l border-slate-200 shadow-xs flex flex-col shrink-0 ${
            isResizingDetail ? '' : 'transition-[width,opacity] duration-200 ease-out'
          } ${
            isSplitOpen && activeTx
              ? 'opacity-100 visible'
              : 'opacity-0 overflow-hidden border-none pointer-events-none invisible'
          }`}
        >
          {activeTx ? (
            <div className="flex flex-col h-full">
              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Detail Header with X close button */}
                <div className="border-b border-slate-100 pb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                      <span>거래 상세 정보</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono">{activeTx.occurredAt}</span>
                      </div>
                    </div>
                    <div className="mt-1 text-base font-bold text-slate-900 truncate">{activeTx.counterparty}</div>
                    <div
                      className={`mt-1 text-xl font-bold tracking-tight ${
                        activeTx.type === 'transfer'
                          ? 'text-slate-700'
                          : activeTx.direction === 'in'
                          ? 'text-emerald-600'
                          : 'text-slate-900'
                      }`}
                    >
                      {formatSignedKRW(activeTx.amount, activeTx.direction, hideAmounts)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTxId(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition shrink-0 cursor-pointer"
                    title="상세 패널 닫기 (ESC)"
                    aria-label="상세 패널 닫기"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Account info */}
                <div className="text-xs space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>출납 계좌</span>
                    <span className="font-bold text-slate-900">{activeTx.accountAlias}</span>
                  </div>
                  {activeTx.balanceAfter !== undefined && (
                    <div className="flex items-center justify-between text-slate-600">
                      <span>거래 후 잔액</span>
                      <span className="font-semibold text-slate-800">{formatKRW(activeTx.balanceAfter, hideAmounts)}</span>
                    </div>
                  )}
                </div>

                {/* Category Selector */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-bold text-slate-700">카테고리</label>
                      {(isAutoChangedToTransfer || Boolean(activeTx.previousCategoryBeforeTransfer)) && (
                        <span className="text-[11px] font-bold text-rose-600">
                          · 자동 변경됨
                        </span>
                      )}
                    </div>
                    {(isAutoChangedToTransfer || Boolean(activeTx.previousCategoryBeforeTransfer)) && (
                      <button
                        type="button"
                        onClick={handleRevertTransferCategory}
                        className="text-xs text-slate-500 hover:text-slate-900 underline font-medium"
                      >
                        되돌리기
                      </button>
                    )}
                  </div>
                  <div className="w-full">
                    <CategorySelector
                      value={activeTx.category}
                      direction={activeTx.direction}
                      onChange={(newCat) => {
                        let newType = activeTx.type;
                        if (newCat.startsWith('수입')) newType = 'income';
                        else if (newCat.startsWith('저축')) newType = 'savings';
                        else if (newCat.startsWith('이체')) newType = 'transfer';
                        else if (activeTx.direction === 'in') newType = 'income';
                        else if (newCat !== '미분류') newType = 'expense';

                        const updates: Partial<Transaction> = {
                          category: newCat,
                          type: newType,
                          isConfirmed: newCat !== '미분류',
                          isManualLocked: true,
                        };

                        if (newCat === '이체 > 통장간이체') {
                          updates.previousCategoryBeforeTransfer =
                            activeTx.category !== '이체 > 통장간이체' ? activeTx.category : '미분류';
                          setIsAutoChangedToTransfer(true);
                        } else {
                          updates.previousCategoryBeforeTransfer = undefined;
                          setIsAutoChangedToTransfer(false);
                        }

                        // If category is 급여 and no payslip exists yet, generate initial breakdown
                        if (
                          newCat === '수입 > 급여' &&
                          (!activeTx.payslip || activeTx.payslip.length === 0)
                        ) {
                          updates.payslip = estimatePayslipFromAmount(activeTx.amount, newCat);
                        }

                        onUpdateTransaction(activeTx.id, updates);
                      }}
                      align="left"
                      size="md"
                      className="w-full"
                    />
                  </div>
                </div>

                {/* [상대 통장 · 반대편 거래] 블록 */}
                {isTransfer && (
                  <div className="pt-0.5 space-y-2">
                    {/* Case 4 & 8: 이미 연결된 상태 (isLinked) */}
                    {isLinked && fromTx && toTx ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                              <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-600" />
                              이체 연결
                            </span>
                            {activeTx.is_auto_linked && (
                              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                                자동 연결
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] bg-slate-200/80 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                            집계 제외
                          </span>
                        </div>

                        {/* 보낸 통장 -> 받은 통장 카드 */}
                        <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                보낸 통장
                              </span>
                              <span className="font-bold text-slate-800 truncate">
                                {fromTx.accountAlias?.split(' ')[0] || fromTx.accountAlias}
                              </span>
                            </div>
                            <span className="font-bold text-slate-900 tabular-nums">
                              -{formatKRW(Math.abs(fromTx.amount), hideAmounts)}
                            </span>
                          </div>

                          <div className="flex items-center justify-center my-0.5 text-slate-300">
                            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                                받은 통장
                              </span>
                              <span className="font-bold text-slate-800 truncate">
                                {toTx.accountAlias?.split(' ')[0] || toTx.accountAlias}
                              </span>
                            </div>
                            <span className="font-bold text-slate-900 tabular-nums">
                              +{formatKRW(Math.abs(toTx.amount), hideAmounts)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-0.5">
                          {linkedCounterpart && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTxId(linkedCounterpart.id);
                                const el = document.getElementById(`tx-row-${linkedCounterpart.id}`);
                                el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                              }}
                              className="text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline font-semibold"
                            >
                              상대 거래로 이동 →
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleDisconnectTransfer}
                            className="text-[11px] text-rose-600 hover:text-rose-700 hover:underline font-semibold ml-auto"
                          >
                            연결 해제
                          </button>
                        </div>

                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          두 건 모두 카테고리가 이체로 맞춰지고, 메모는 한쪽에 쓰면 양쪽에 함께 붙습니다.
                        </p>
                      </div>
                    ) : isUnlinkedAllowed ? (
                      /* 상대편 없이 이체로 둔 상태 */
                      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-900">상대 통장 · 반대편 거래</span>
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                            연결 필요 (상대편 미정)
                          </span>
                        </div>
                        {activeTx.transferAccountAlias && (
                          <div className="text-xs text-slate-700">
                            지정 상대 통장: <span className="font-bold">{activeTx.transferAccountAlias}</span>
                          </div>
                        )}
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          이 건은 집계에서 제외되며, 목록에 연결 필요로 표시됩니다. 나중에 상대 통장을 올리면 자동으로 다시 제안합니다.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateTransaction(activeTx.id, {
                              transfer_unlinked_allowed: false,
                              isConfirmed: false,
                            });
                          }}
                          className="text-[11px] text-indigo-600 hover:underline font-semibold"
                        >
                          다시 반대편 후보 찾기
                        </button>
                      </div>
                    ) : transferCandidates.length === 1 && !isManualPickingCandidate ? (
                      /* 3-A. 후보 1건 → 카드 하나 */
                      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-800">
                            상대 통장 · 반대편 거래
                          </label>
                          <span className="text-[10px] font-semibold bg-slate-900 text-white px-2 py-0.5 rounded-full">
                            금액·날짜 일치
                          </span>
                        </div>

                        {/* 후보 카드 */}
                        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/70">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {transferCandidates[0].accountAlias?.split(' ')[0] ||
                                transferCandidates[0].accountAlias}
                            </span>
                            <span className="text-xs font-bold tabular-nums text-slate-900">
                              {transferCandidates[0].direction === 'in' ? '+' : '-'}
                              {formatKRW(transferCandidates[0].amount, hideAmounts)}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500 truncate">
                            {transferCandidates[0].occurredAt.split(' ')[0].slice(5)} ·{' '}
                            {transferCandidates[0].counterparty ||
                              transferCandidates[0].rawDescription}
                          </div>
                        </div>

                        {/* Primary 연결 버튼 */}
                        <button
                          type="button"
                          onClick={() => handleConnectTransfer(transferCandidates[0])}
                          className="w-full py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition shadow-2xs"
                        >
                          이 거래와 연결하기
                        </button>

                        <div className="text-center">
                          <button
                            type="button"
                            onClick={() => setIsManualPickingCandidate(true)}
                            className="text-[11px] text-slate-500 hover:text-slate-800 underline font-medium"
                          >
                            다른 거래 고르기
                          </button>
                        </div>
                      </div>
                    ) : transferCandidates.length >= 2 ||
                      (isManualPickingCandidate && transferCandidates.length > 0) ? (
                      /* 3-B. 후보 2건 이상 (또는 '다른 거래 고르기'를 누른 경우) */
                      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-800">
                            상대 통장 · 반대편 거래
                          </label>
                          <span className="text-[10px] font-semibold text-slate-500">
                            후보 {transferCandidates.length}건
                          </span>
                        </div>

                        {/* 라디오 목록 (날짜 가까운 순, 첫 항목 기본 선택) */}
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {transferCandidates.map((cand) => {
                            const isChecked = selectedCandidateId === cand.id;
                            return (
                              <label
                                key={cand.id}
                                onClick={() => setSelectedCandidateId(cand.id)}
                                className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                                  isChecked
                                    ? 'bg-red-50/50 border-red-300 ring-1 ring-red-200'
                                    : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/70'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="transferCandidateRadio"
                                  checked={isChecked}
                                  onChange={() => setSelectedCandidateId(cand.id)}
                                  className="mt-0.5 text-red-600 focus:ring-red-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-900 truncate">
                                      {cand.accountAlias?.split(' ')[0] || cand.accountAlias}
                                    </span>
                                    <span className="font-bold tabular-nums text-slate-900">
                                      {cand.direction === 'in' ? '+' : '-'}
                                      {formatKRW(cand.amount, hideAmounts)}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                    {cand.occurredAt.split(' ')[0].slice(5)} ·{' '}
                                    {cand.counterparty || cand.rawDescription}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>

                        {/* 연결 버튼 */}
                        <button
                          type="button"
                          disabled={!selectedCandidateId}
                          onClick={() => {
                            const chosen =
                              transferCandidates.find((c) => c.id === selectedCandidateId) ||
                              transferCandidates[0];
                            if (chosen) handleConnectTransfer(chosen);
                          }}
                          className="w-full py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition shadow-2xs"
                        >
                          이 거래와 연결하기
                        </button>

                        {isManualPickingCandidate && (
                          <div className="text-center">
                            <button
                              type="button"
                              onClick={() => setIsManualPickingCandidate(false)}
                              className="text-[11px] text-slate-500 hover:text-slate-800 underline font-medium"
                            >
                              ← 추천 거래로 돌아가기
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* 3-C. 후보 0건 → 경고색 블록 */
                      <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 space-y-3">
                        <div>
                          <div className="text-xs font-bold text-rose-900">
                            맞는 거래를 찾지 못했습니다
                          </div>
                          <div className="text-[11px] text-rose-700 mt-1 leading-relaxed">
                            ±3일 안에{' '}
                            <span className="font-bold">
                              {activeTx.direction === 'out'
                                ? `+${formatKRW(activeTx.amount, hideAmounts)} 입금`
                                : `-${formatKRW(activeTx.amount, hideAmounts)} 출금`}
                            </span>
                            이 없습니다. 아직 안 올린 통장일 수 있습니다.
                          </div>
                        </div>

                        {/* 상대 통장 드롭다운 (등록된 다른 통장 목록) */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-700 block">
                            상대 통장 지정 (선택)
                          </label>
                          <select
                            value={selectedOppositeAccount}
                            onChange={(e) => setSelectedOppositeAccount(e.target.value)}
                            className="w-full bg-white border border-rose-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-400"
                          >
                            <option value="">상대 통장 고르기</option>
                            {accounts
                              .filter((a) => a.id !== activeTx.accountId)
                              .map((a) => (
                                <option key={a.id} value={a.name}>
                                  {a.name}
                                </option>
                              ))}
                          </select>
                        </div>

                        {/* 상대편 없이 이체로 두기 버튼 */}
                        <button
                          type="button"
                          onClick={handleKeepUnlinkedTransfer}
                          className="w-full py-2 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition shadow-2xs"
                        >
                          상대편 없이 이체로 두기
                        </button>

                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          이 건만 집계에서 빠지고, 연결 필요로 표시됩니다. 나중에 상대 통장을 올리면 자동으로 다시 제안합니다.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* [1] 급여명세서 공제 항목 분해 블록 (카테고리가 '수입 > 급여'일 때만 바로 아래에 렌더링) */}
                {activeTx.category === '수입 > 급여' && (
                  <div className="space-y-2 pt-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">급여명세서</span>
                      <span className="text-[11px] text-slate-400">증빙 겸용</span>
                    </div>

                    {/* 숨겨진 파일 인풋 (급여 거래 전용 통합 업로드) */}
                    <input
                      ref={payslipFileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleProcessPayslipFile(file);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />

                    {/* A. 파일 없음 */}
                    {payslipState === 'idle' &&
                      (!activeTx.attachments || activeTx.attachments.length === 0) &&
                      (!activeTx.payslip || activeTx.payslip.length === 0) && (
                        <div>
                          <div
                            tabIndex={0}
                            role="button"
                            aria-label="급여명세서 파일 선택 또는 끌어다 놓기"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                payslipFileInputRef.current?.click();
                              }
                            }}
                            onClick={() => payslipFileInputRef.current?.click()}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIsDraggingPayslip(true);
                            }}
                            onDragLeave={() => setIsDraggingPayslip(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setIsDraggingPayslip(false);
                              const file = e.dataTransfer.files?.[0];
                              if (file) handleProcessPayslipFile(file);
                            }}
                            className={`border-2 border-dashed rounded-xl p-5 text-center transition cursor-pointer outline-none focus:ring-2 focus:ring-indigo-400 ${
                              isDraggingPayslip
                                ? 'border-indigo-500 bg-indigo-50/50'
                                : 'border-slate-300 hover:border-slate-400 bg-white'
                            }`}
                          >
                            <div className="text-xs font-bold text-slate-800 mb-1">
                              급여명세서 올리기
                            </div>
                            <div className="text-[11px] text-slate-500 leading-relaxed mb-3 whitespace-pre-line">
                              PDF · 이미지 · 끌어다 놓기{'\n'}공제 항목을 자동으로 채웁니다
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                payslipFileInputRef.current?.click();
                              }}
                              className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition"
                            >
                              파일 선택
                            </button>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-2 px-0.5 leading-normal">
                            명세서 없이 저장해도 됩니다 — 통장 입금액만 수입으로 잡힙니다.
                          </div>
                        </div>
                      )}

                    {/* B. 읽는 중 */}
                    {payslipState === 'reading' && readingFileInfo && (
                      <div className="border border-slate-200 bg-white rounded-xl p-4 space-y-3 shadow-2xs">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800 truncate max-w-[180px]">
                            {readingFileInfo.name}
                          </span>
                          <span className="text-slate-400 shrink-0 font-medium">
                            {readingFileInfo.size}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                            style={{ width: `${parsingProgress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between pt-0.5">
                          <span className="text-xs text-slate-500">
                            공제 항목 읽는 중... 8초 이내
                          </span>
                          <button
                            type="button"
                            onClick={handleCancelParsing}
                            className="px-3 py-1 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}

                    {/* C. 불러옴 */}
                    {payslipState === 'idle' &&
                      ((activeTx.payslip && activeTx.payslip.length > 0) ||
                        (activeTx.attachments && activeTx.attachments.length > 0)) &&
                      (() => {
                        const deductions = (activeTx.payslip || []).filter(
                          (i) => i.type === 'deduction' && i.amount > 0
                        );
                        const payments = (activeTx.payslip || []).filter(
                          (i) => i.type === 'payment' && i.amount > 0
                        );
                        const totalDeduct = deductions.reduce((s, i) => s + i.amount, 0);
                        const totalPay = payments.reduce((s, i) => s + i.amount, 0);
                        const calcNet = totalPay - totalDeduct;
                        const diff = activeTx.amount - calcNet;
                        const isMatched = Math.abs(diff) === 0;
                        const fileName =
                          activeTx.attachments?.[0]?.name || '2026-09_급여명세서.pdf';

                        return (
                          <div className="border border-slate-200 bg-white rounded-xl p-4 space-y-3 shadow-2xs">
                            {/* 1행(강조): 공제 4건 · 470,000원 반영됨 */}
                            <div className="text-sm font-bold text-slate-900">
                              공제 {deductions.length}건 · {totalDeduct.toLocaleString()}원 반영됨
                            </div>

                            {/* 2행: 지급 3,620,000 − 공제 470,000 = 통장 입금 3,150,000 일치/불일치 */}
                            <div className="text-xs text-slate-600 leading-normal">
                              지급 {totalPay.toLocaleString()} − 공제 {totalDeduct.toLocaleString()} = 통장 입금{' '}
                              {activeTx.amount.toLocaleString()}{' '}
                              {isMatched ? (
                                <span className="font-semibold text-slate-700">일치</span>
                              ) : (
                                <span className="font-bold text-rose-600">
                                  불일치 {Math.abs(diff).toLocaleString()}원
                                </span>
                              )}
                            </div>

                            {/* 버튼: 공제 항목 보기 (주 버튼이 sticky footer에 있으므로 중립 버튼으로 유지하여 1 primary 제약 준수) */}
                            <button
                              type="button"
                              onClick={handleOpenPayslipViewer}
                              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs transition border border-slate-200 flex items-center justify-center gap-1.5"
                            >
                              공제 항목 보기
                            </button>

                            {/* 파일 행: 파일명 + 교체 / 삭제 */}
                            <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                              <span
                                className="truncate max-w-[180px] font-medium text-slate-700"
                                title={fileName}
                              >
                                {fileName}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => payslipFileInputRef.current?.click()}
                                  className="hover:text-indigo-600 font-medium"
                                >
                                  교체
                                </button>
                                <button
                                  type="button"
                                  onClick={handleDeletePayslip}
                                  className="hover:text-rose-600 font-medium"
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                    {/* D. 읽지 못함 (3-D 파싱 실패 상태) */}
                    {payslipState === 'failed' && parsingFailure && (
                      <div className="border border-rose-300 bg-rose-50/40 rounded-xl p-4 space-y-3 shadow-2xs">
                        {/* 1) 제목 */}
                        <div className="text-sm font-bold text-rose-700">
                          공제 항목을 읽지 못했습니다
                        </div>

                        {/* 2) 실패 이유 한 줄 */}
                        <div className="text-xs text-slate-600 leading-relaxed">
                          {parsingFailure.type === 'scan' &&
                            '스캔 이미지라 글자를 인식할 수 없었습니다. 직접 입력하거나 텍스트 PDF로 다시 올려 주세요.'}
                          {parsingFailure.type === 'unrecognized' &&
                            '처음 보는 명세서 양식입니다. 직접 입력하면 다음부터 같은 양식을 읽습니다.'}
                          {parsingFailure.type === 'encrypted' &&
                            '암호가 걸린 PDF입니다. 암호를 풀어 다시 올려 주세요.'}
                        </div>

                        {/* 3) 주 버튼: 공제 항목 직접 입력 */}
                        <button
                          type="button"
                          onClick={handleOpenDirectInput}
                          className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs transition shadow-2xs"
                        >
                          공제 항목 직접 입력
                        </button>

                        {/* 4) 보조 버튼: 다른 파일로 교체 */}
                        <button
                          type="button"
                          onClick={() => payslipFileInputRef.current?.click()}
                          className="w-full py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-lg text-xs transition"
                        >
                          다른 파일로 교체
                        </button>

                        {/* 5) 파일명 행 + 삭제 링크 */}
                        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-rose-100">
                          <span className="truncate max-w-[200px] font-medium text-slate-700">
                            {parsingFailure.fileName}
                          </span>
                          <button
                            type="button"
                            onClick={handleDeletePayslip}
                            className="hover:text-rose-600 font-medium"
                          >
                            삭제
                          </button>
                        </div>

                        {/* 하단 안내 */}
                        <div className="text-[11px] text-slate-400">
                          읽기에 실패해도 파일은 증빙으로 그대로 남습니다.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Fixed vs Variable Toggle */}
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">고정비/고정수입 여부</span>
                  <input
                    type="checkbox"
                    checked={activeTx.isFixed}
                    onChange={(e) =>
                      onUpdateTransaction(activeTx.id, {
                        isFixed: e.target.checked,
                        isManualLocked: true,
                      })
                    }
                    className="h-4 w-4 text-indigo-600 rounded"
                  />
                </div>

                {/* 태그 · 메모 통합 블록 */}
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">태그 · 메모</label>
                  
                  {/* 태그 입력 / 칩 영역 */}
                  <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-lg min-h-[38px]">
                    <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    {(activeTx.tags || []).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-[11px] font-medium"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => {
                            const newTags = (activeTx.tags || []).filter((t) => t !== tag);
                            onUpdateTransaction(activeTx.id, { tags: newTags });
                          }}
                          className="text-indigo-400 hover:text-indigo-700"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      placeholder={(activeTx.tags || []).length === 0 ? "태그 입력 (Enter로 추가)..." : "태그 추가..."}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = e.currentTarget.value.trim().replace(/^#/, '');
                          if (val && !(activeTx.tags || []).includes(val)) {
                            const newTags = [...(activeTx.tags || []), val];
                            onUpdateTransaction(activeTx.id, { tags: newTags });
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                      className="text-xs bg-transparent border-none outline-none flex-1 min-w-[100px] text-slate-700 placeholder-slate-400"
                    />
                  </div>

                  {/* 기존 태그 추천 칩 */}
                  {allExistingTags.filter((t) => !(activeTx.tags || []).includes(t)).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-slate-400 font-medium">추천:</span>
                      {allExistingTags
                        .filter((t) => !(activeTx.tags || []).includes(t))
                        .slice(0, 6)
                        .map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              const newTags = [...(activeTx.tags || []), tag];
                              onUpdateTransaction(activeTx.id, { tags: newTags });
                            }}
                            className="text-[10px] px-1.5 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded transition border border-transparent hover:border-indigo-200 font-medium"
                          >
                            #{tag}
                          </button>
                        ))}
                    </div>
                  )}

                  {/* 메모 입력창 */}
                  <textarea
                    rows={2}
                    value={memoDraft}
                    placeholder="추가 메모 입력..."
                    onChange={(e) => {
                      const newMemo = e.target.value;
                      setMemoDraft(newMemo);
                      onUpdateTransaction(activeTx.id, { memo: newMemo });
                      if (linkedCounterpart) {
                        onUpdateTransaction(linkedCounterpart.id, { memo: newMemo });
                      }
                    }}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2 outline-none focus:border-indigo-600 resize-none"
                  />
                </div>

                {/* Attachments: 급여 거래에서는 위 급여명세서 슬롯이 증빙 겸용이므로 미표시 */}
                {activeTx.category !== '수입 > 급여' && (
                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">증빙 첨부파일</label>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        <Upload className="h-3 w-3" /> 파일 선택
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".png,.jpg,.jpeg,.pdf,.xlsx,.xls,.csv,image/png,image/jpeg,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                        multiple
                        onChange={handleAttachmentUpload}
                        className="hidden"
                      />
                    </div>

                    {/* 드래그 앤 드롭 존 */}
                    <div
                      tabIndex={0}
                      role="button"
                      aria-label="증빙 첨부파일 올리기"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingGeneralAttachment(true);
                      }}
                      onDragLeave={() => setIsDraggingGeneralAttachment(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingGeneralAttachment(false);
                        const files = Array.from(e.dataTransfer.files || []) as File[];
                        if (files.length > 0) handleProcessGeneralFiles(files);
                      }}
                      className={`border-2 border-dashed rounded-xl p-3 text-center transition cursor-pointer outline-none focus:ring-2 focus:ring-indigo-400 ${
                        isDraggingGeneralAttachment
                          ? 'border-indigo-500 bg-indigo-50/50'
                          : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                      }`}
                    >
                      <p className="text-[11px] text-slate-500 font-medium">
                        영수증 · 전표 등 파일을 끌어다 놓거나 클릭하세요
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        PDF, 이미지, Excel 지원 (최대 10MB)
                      </p>
                    </div>

                    {/* 첨부파일 리스트 */}
                    <div className="flex flex-col gap-1.5 pt-1">
                      {activeAttachments.length === 0 ? (
                        <p className="rounded-lg bg-slate-50 px-3 py-1.5 text-[11px] text-slate-400 text-center">
                          등록된 첨부파일이 없습니다.
                        </p>
                      ) : (
                        activeAttachments.map((attachment) => {
                          const isCollapsing = collapsingAttachmentId === attachment.id;
                          return (
                            <div
                              key={attachment.id}
                              className={`group rounded-lg border bg-white px-2.5 transition-all duration-200 ease-in-out ${
                                isCollapsing
                                  ? 'max-h-0 py-0 opacity-0 my-0 border-transparent overflow-hidden'
                                  : 'max-h-24 py-2 opacity-100 border-slate-200'
                              }`}
                            >
                              {editingAttachmentId === attachment.id ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    autoFocus
                                    value={editingAttachmentName}
                                    onChange={(event) =>
                                      setEditingAttachmentName(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') saveAttachmentName(attachment);
                                      if (event.key === 'Escape') setEditingAttachmentId(null);
                                    }}
                                    className="min-w-0 flex-1 rounded border border-indigo-300 px-1.5 py-1 text-[11px] outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => saveAttachmentName(attachment)}
                                    className="text-[11px] font-semibold text-indigo-600"
                                  >
                                    저장
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-700"
                                    title={attachment.name}
                                  >
                                    {attachment.name}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label={`${attachment.name} 미리보기`}
                                    title="미리보기"
                                    onClick={() => setPreviewAttachment(attachment)}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`${attachment.name} 다운로드`}
                                    title="다운로드"
                                    onClick={() => downloadAttachment(attachment)}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`${attachment.name} 이름 수정`}
                                    title="이름 수정"
                                    onClick={() => {
                                      setEditingAttachmentId(attachment.id);
                                      setEditingAttachmentName(
                                        attachment.name.replace(/\.[^.]+$/, '')
                                      );
                                    }}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    tabIndex={0}
                                    aria-label={`${attachment.name} 삭제`}
                                    title="삭제"
                                    onClick={() => triggerDeleteAttachment(attachment)}
                                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition focus:outline-none focus:ring-1 focus:ring-rose-500"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Promote to Rule Button */}
                {!registeredRule && (
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={isRuleRegistering}
                      onClick={async () => {
                        if (isRuleRegistering) return;
                        setIsRuleRegistering(true);
                        try {
                          await onCreateRuleFromTransaction(activeTx, activeTx.category);
                        } finally {
                          setIsRuleRegistering(false);
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-bold rounded-xl transition shadow-2xs bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                      <span>"앞으로 {activeTx.counterparty}는 항상 이 분류로" 규칙 등록</span>
                    </button>
                  </div>
                )}

                {/* Delete and rule removal actions */}
                <div className="space-y-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('이 거래를 삭제하시겠습니까?')) {
                        onDeleteTransaction(activeTx.id);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>거래 내역 삭제</span>
                  </button>
                  {registeredRule && (
                    <button
                      type="button"
                      disabled={isRuleRegistering}
                      onClick={async (event) => {
                        event.stopPropagation();
                        setIsRuleRegistering(true);
                        try {
                          await onDeleteRule(registeredRule.id);
                          await onUpdateTransaction(activeTx.id, {
                            isConfirmed: false,
                            isManualLocked: true,
                          });
                        } finally {
                          setIsRuleRegistering(false);
                        }
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition disabled:opacity-50"
                    >
                      <Unlock className="h-3 w-3" />
                      <span>규칙 등록 해제</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Sticky Bottom Action Bar */}
              <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-lg space-y-2 z-10">
                {/* 1행: 보조 버튼 (분할 / 이체) */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleOpenSplit}
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition"
                  >
                    <Scissors className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate">
                      {activeTx.splits && activeTx.splits.length > 0
                        ? `분할 (${activeTx.splits.length})`
                        : '분할'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isLinked) {
                        handleDisconnectTransfer();
                      } else if (!isTransfer) {
                        handleSwitchToTransfer();
                      } else {
                        if (transferCandidates.length > 0) {
                          handleConnectTransfer(transferCandidates[0]);
                        }
                      }
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2.5 text-xs font-semibold rounded-lg border transition ${
                      isLinked
                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                        : isTransfer
                        ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate">
                      {isLinked
                        ? '연결 해제'
                        : isTransfer
                        ? '연결하기'
                        : '이체로 변경'}
                    </span>
                  </button>
                </div>

                {/* 2행: 주 버튼 - 확정하고 다음 건 */}
                <div className="space-y-1">
                  <button
                    type="button"
                    disabled={isTransfer && !isLinked && !isUnlinkedAllowed}
                    onClick={handleConfirmAndNext}
                    className={`w-full py-2.5 font-bold rounded-lg text-xs transition shadow-2xs flex items-center justify-center gap-1.5 ${
                      isTransfer && !isLinked && !isUnlinkedAllowed
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    <Check className="h-4 w-4" />
                    <span>확정하고 다음 건</span>
                    <span className="text-[10px] text-slate-300 font-normal ml-1">
                      ({unclassifiedTxs.length}건 남음)
                    </span>
                  </button>
                  {isTransfer && !isLinked && !isUnlinkedAllowed && (
                    <p className="text-[10px] text-rose-600 text-center font-medium">
                      상대 거래를 연결하거나 '상대편 없이 이체로 두기'를 선택해야 확정할 수 있습니다.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-400 p-5">
              목록에서 거래를 선택하세요
            </div>
          )}

          {/* 이체 연결 해제 되돌리기 토스트 (8초 유지) */}
          {pendingDisconnectToast && (
            <div
              className={`absolute left-3 right-3 z-30 bg-slate-900 text-white rounded-xl shadow-2xl px-3.5 py-2.5 border border-slate-700/80 flex items-center justify-between text-xs overflow-hidden animate-toast-in ${
                activeTx
                  ? pendingDelete
                    ? 'bottom-[175px]'
                    : 'bottom-[120px]'
                  : 'bottom-4'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate text-slate-200 font-medium">
                  이체 연결을 해제했습니다
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-slate-500">·</span>
                <button
                  type="button"
                  onClick={handleUndoDisconnectTransfer}
                  className="text-amber-300 hover:text-amber-200 font-bold underline underline-offset-2 transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-300 rounded px-1"
                >
                  되돌리기
                </button>
              </div>

              {/* 8초 타이머 프로그레스 라인 */}
              <div className="absolute bottom-0 left-0 h-0.5 bg-amber-400 animate-shrink-8s" />
            </div>
          )}

          {/* 되돌리기 토스트 (패널 하단, 8초 유지) */}
          {pendingDelete && (
            <div
              key={pendingDelete.attachment.id}
              className={`absolute left-3 right-3 z-30 bg-slate-900 text-white rounded-xl shadow-2xl px-3.5 py-2.5 border border-slate-700/80 flex items-center justify-between text-xs overflow-hidden animate-toast-in ${
                activeTx ? 'bottom-[120px]' : 'bottom-4'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate text-slate-200 font-medium">증빙 1개를 삭제했습니다</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-slate-500">·</span>
                <button
                  type="button"
                  onClick={handleUndoAttachmentDelete}
                  className="text-amber-300 hover:text-amber-200 font-bold underline underline-offset-2 transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-300 rounded px-1"
                >
                  되돌리기
                </button>
              </div>

              {/* 8초 타이머 프로그레스 라인 */}
              <div
                key={pendingDelete.attachment.id}
                className="absolute bottom-0 left-0 h-0.5 bg-amber-400 animate-shrink-8s"
              />
            </div>
          )}
        </div>
      </div>

      {/* Attachment Preview Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" role="dialog" aria-modal="true" aria-label={`${previewAttachment.name} 미리보기`} onClick={() => setPreviewAttachment(null)}>
          <div className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3">
              <h3 className="min-w-0 truncate text-sm font-bold text-slate-900">{previewAttachment.name}</h3>
              <button type="button" aria-label="미리보기 닫기" onClick={() => setPreviewAttachment(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex min-h-[320px] max-w-[calc(100vw-2rem)] items-center justify-center overflow-auto bg-slate-100 p-4">
              {previewAttachment.mimeType === 'application/pdf' ? (
                <iframe src={previewAttachment.dataUrl} title={previewAttachment.name} className="h-[70vh] w-[min(80vw,900px)] rounded border-0 bg-white" />
              ) : (
                <img src={previewAttachment.dataUrl} alt={previewAttachment.name} className="max-h-[70vh] max-w-full object-contain" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Split Transaction Modal */}
      {isSplitModalOpen && activeTx && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-indigo-600" />
                  거래 분할 (Split Transaction)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  총액 {formatKRW(activeTx.amount)}원을 여러 카테고리로 세분화하여 배분합니다.
                </p>
              </div>
              <button onClick={() => setIsSplitModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Split items list */}
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {splitDraft.map((item, idx) => (
                <div key={item.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">항목 #{idx + 1}</span>
                    {splitDraft.length > 1 && (
                      <button
                        onClick={() => setSplitDraft(splitDraft.filter((_, i) => i !== idx))}
                        className="text-rose-500 hover:text-rose-700 text-[11px]"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">카테고리</label>
                      <CategorySelector
                        value={item.category}
                        onChange={(newCategory) => {
                          const next = [...splitDraft];
                          next[idx].category = newCategory;
                          setSplitDraft(next);
                        }}
                        align="left"
                        size="sm"
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block">금액(원)</label>
                      <input
                        type="number"
                        value={item.amount}
                        onChange={(e) => {
                          const next = [...splitDraft];
                          next[idx].amount = Number(e.target.value);
                          setSplitDraft(next);
                        }}
                        className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="품목/설명 메모 (예: 소고기, 주방세제)"
                      value={item.memo || ''}
                      onChange={(e) => {
                        const next = [...splitDraft];
                        next[idx].memo = e.target.value;
                        setSplitDraft(next);
                      }}
                      className="w-full bg-white border border-slate-300 rounded p-1.5 text-[11px]"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                const currentSum = splitDraft.reduce((acc, c) => acc + c.amount, 0);
                const remaining = Math.max(0, activeTx.amount - currentSum);
                setSplitDraft([
                  ...splitDraft,
                  { id: 's_' + Date.now(), amount: remaining, category: '생활용품 > 기타', memo: '' },
                ]);
              }}
              className="w-full py-1.5 border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> 분할 항목 추가
            </button>

            {/* Sum check */}
            <div className="bg-slate-100 p-3 rounded-xl flex items-center justify-between text-xs font-bold">
              <span>분할 합계: {formatKRW(splitDraft.reduce((acc, c) => acc + c.amount, 0))}</span>
              <span
                className={
                  splitDraft.reduce((acc, c) => acc + c.amount, 0) === activeTx.amount
                    ? 'text-emerald-600'
                    : 'text-rose-600'
                }
              >
                거래 총액: {formatKRW(activeTx.amount)}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsSplitModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                취소
              </button>
              <button
                onClick={handleSaveSplit}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl shadow-2xs"
              >
                분할 저장 완료
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Payslip Modal (PRD F-06 급여 입금 상세 분해) */}
      {isPayslipModalOpen && activeTx && (
        <PayslipModal
          isOpen={isPayslipModalOpen}
          onClose={() => {
            setIsPayslipModalOpen(false);
            setPayslipModalData(null);
            setIsDirectInputMode(false);
          }}
          transaction={activeTx}
          initialItems={payslipModalData?.items}
          attachedFileName={payslipModalData?.fileName}
          attachmentUrl={activeTx.attachments?.[0]?.dataUrl}
          isDirectInputMode={isDirectInputMode}
          onSave={handleSavePayslip}
        />
      )}
      {/* Floating Category Selection & Management Popover Portal */}
      {categoryPopoverTxId && (() => {
        const activePopTx = transactions.find((t) => t.id === categoryPopoverTxId);
        if (!activePopTx) return null;
        const isIncome = activePopTx.direction === 'in';
        const activeShortcuts = isIncome ? INCOME_SHORTCUTS : EXPENSE_SHORTCUTS;
        const query = categoryPopoverSearch.trim().toLowerCase();

        // Calculate group tabs
        const nonIncomeGroups = mergedCategoryTree
          .filter((c) => c.group !== '수입')
          .map((c) => c.group);
        const groupTabs = isIncome ? [] : ['전체', ...nonIncomeGroups];

        // Filtered categories
        const filteredTree = (() => {
          if (isIncome) {
            const incomeGrp = mergedCategoryTree.find((g) => g.group === '수입');
            if (!incomeGrp) return [];
            const matchedItems = query
              ? incomeGrp.items.filter((it) => it.toLowerCase().includes(query))
              : incomeGrp.items;
            return matchedItems.length > 0 ? [{ ...incomeGrp, items: matchedItems }] : [];
          }

          const expenseGroups = mergedCategoryTree.filter((g) => g.group !== '수입');
          return expenseGroups
            .map((grp) => {
              if (categoryPopoverGroup !== '전체' && grp.group !== categoryPopoverGroup) {
                return { ...grp, items: [] };
              }
              if (!query) return grp;
              const matchedItems = grp.items.filter(
                (item) =>
                  item.toLowerCase().includes(query) || grp.group.toLowerCase().includes(query)
              );
              return { ...grp, items: matchedItems };
            })
            .filter((grp) => grp.items.length > 0);
        })();

        const exactMatchExists = query
          ? mergedCategoryTree.some((g) =>
              g.items.some(
                (it) => it.toLowerCase() === query || it.split(' > ')[1]?.toLowerCase() === query
              )
            )
          : true;

        const isUnclassified = !activePopTx.category || activePopTx.category === '미분류';

        return createPortal(
          <div
            ref={categoryPopoverRef}
            className="fixed bg-white border border-slate-200 rounded-2xl shadow-2xl z-[9999] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
            style={{
              top: `${categoryPopoverPos.top}px`,
              left: `${categoryPopoverPos.left}px`,
              width: `${categoryPopoverPos.width}px`,
              height: `${categoryPopoverPos.maxHeight}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Transaction Context */}
            <div className="p-3 border-b border-slate-100 bg-slate-50/90 space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0 pr-2">
                  <Tag className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800 truncate">
                    {activePopTx.counterparty || activePopTx.rawDescription}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCategoryPopoverIsAdding(!categoryPopoverIsAdding)}
                    className={`text-[10px] px-2 py-0.5 rounded-md font-bold transition flex items-center gap-0.5 ${
                      categoryPopoverIsAdding
                        ? 'bg-indigo-600 text-white'
                        : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/60'
                    }`}
                    title="새 카테고리 직접 등록"
                  >
                    <Plus className="h-3 w-3" />
                    <span>직접 추가</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryPopoverTxId(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition hover:bg-slate-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Direct Custom Category Add Accordion */}
              {categoryPopoverIsAdding && (
                <div className="p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-2 animate-in fade-in slide-in-from-top-1">
                  <div className="text-[11px] font-bold text-indigo-900 flex items-center justify-between">
                    <span>새 카테고리 직접 등록 및 적용</span>
                    <button
                      type="button"
                      onClick={() => setCategoryPopoverIsAdding(false)}
                      className="text-indigo-400 hover:text-indigo-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <select
                      value={categoryPopoverAddGroup}
                      onChange={(e) => setCategoryPopoverAddGroup(e.target.value)}
                      className="col-span-1 bg-white border border-indigo-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 outline-none"
                    >
                      {DEFAULT_PARENT_GROUPS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      autoFocus
                      value={categoryPopoverAddSub}
                      onChange={(e) => setCategoryPopoverAddSub(e.target.value)}
                      placeholder="세부 항목명 (예: 야식)"
                      className="col-span-2 bg-white border border-indigo-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (categoryPopoverAddSub.trim()) {
                            handleAddAndSelectCustomCategory(
                              activePopTx.id,
                              `${categoryPopoverAddGroup} > ${categoryPopoverAddSub.trim()}`
                            );
                          }
                        }
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!categoryPopoverAddSub.trim()}
                    onClick={() => {
                      if (categoryPopoverAddSub.trim()) {
                        handleAddAndSelectCustomCategory(
                          activePopTx.id,
                          `${categoryPopoverAddGroup} > ${categoryPopoverAddSub.trim()}`
                        );
                      }
                    }}
                    className="w-full py-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-40"
                  >
                    추가하고 바로 선택하기
                  </button>
                </div>
              )}

              {/* Search Input */}
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  autoFocus={!categoryPopoverIsAdding}
                  value={categoryPopoverSearch}
                  onChange={(e) => setCategoryPopoverSearch(e.target.value)}
                  placeholder={
                    isIncome
                      ? '수입 검색 (예: 급여, 상여, 배당, 당근...)'
                      : '카테고리 검색 (예: 카페, 마트, 외식, 배달...)'
                  }
                  className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                {categoryPopoverSearch && (
                  <button
                    type="button"
                    onClick={() => setCategoryPopoverSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Quick Prompt to Add as New Category when typing something new */}
              {categoryPopoverSearch.trim() && !exactMatchExists && (
                <button
                  type="button"
                  onClick={() =>
                    handleAddAndSelectCustomCategory(activePopTx.id, categoryPopoverSearch)
                  }
                  className="w-full px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs text-indigo-800 font-bold flex items-center justify-between transition cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Plus className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate">
                      '{categoryPopoverSearch.trim()}' 새 카테고리로 추가 및 적용
                    </span>
                  </span>
                  <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                    생성
                  </span>
                </button>
              )}

              {/* Quick Shortcuts Chips */}
              {!categoryPopoverSearch && !categoryPopoverIsAdding && (
                <div className="pt-0.5">
                  <div className="text-[10px] font-semibold text-slate-500 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3 text-amber-500" />
                      자주 쓰는 빠른 분류 ({isIncome ? '수입' : '지출'})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeShortcuts.map((sc) => {
                      const Icon = sc.icon;
                      const isSelected = activePopTx.category === sc.category;

                      return (
                        <button
                          key={sc.category}
                          type="button"
                          onClick={() => handleSelectCategoryForTx(activePopTx.id, sc.category)}
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-50 border border-indigo-400 text-indigo-700 font-bold ring-1 ring-indigo-200 shadow-2xs'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                          }`}
                        >
                          <Icon
                            className={`h-3 w-3 ${
                              isSelected ? 'text-indigo-600' : 'text-slate-500'
                            }`}
                          />
                          <span>{sc.label}</span>
                          {isSelected && <Check className="h-3 w-3 text-indigo-600 ml-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Group Filter Tabs (Only shown for expenses, omitted for income) */}
            {!isIncome && (
              <div className="px-2 pt-1.5 pb-1 border-b border-slate-100 bg-white flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
                {groupTabs.map((grpName) => {
                  const isTabSelected = categoryPopoverGroup === grpName;
                  return (
                    <button
                      key={grpName}
                      type="button"
                      onClick={() => {
                        setCategoryPopoverGroup(grpName);
                        setCategoryPopoverSearch('');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${
                        isTabSelected
                          ? 'bg-slate-200 text-slate-900 font-bold border border-slate-300 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {grpName}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Categories List Body */}
            <div className="p-2 overflow-y-auto flex-1 divide-y divide-slate-100 overscroll-contain">
              {filteredTree.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 space-y-2">
                  <Search className="h-5 w-5 mx-auto opacity-40" />
                  <p>‘{categoryPopoverSearch}’ 검색 결과가 없습니다.</p>
                  {categoryPopoverSearch && (
                    <button
                      type="button"
                      onClick={() =>
                        handleAddAndSelectCustomCategory(activePopTx.id, categoryPopoverSearch)
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-bold text-xs shadow-xs hover:bg-indigo-700 transition cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>'{categoryPopoverSearch}' 카테고리로 생성하기</span>
                    </button>
                  )}
                </div>
              ) : (
                filteredTree.map((grp) => (
                  <div key={grp.group} className="py-2 first:pt-1 last:pb-1">
                    <div className="px-2 py-1 text-[11px] font-bold text-slate-500 flex items-center justify-between">
                      <span>{grp.group}</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {grp.items.length}개
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mt-1">
                      {grp.items.map((item) => {
                        const isSelected = activePopTx.category === item;
                        const isCustom = customCategories.includes(item);
                        const parts = item.split(' > ');
                        const mainTitle = parts.length > 1 ? parts[0] : '';
                        const subTitle = parts.length > 1 ? parts[1] : item;

                        return (
                          <div
                            key={item}
                            className={`w-full px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition group relative ${
                              isSelected
                                ? 'bg-indigo-50/90 border border-indigo-300 text-indigo-700 font-bold shadow-2xs'
                                : 'hover:bg-slate-100 border border-slate-100 text-slate-700'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectCategoryForTx(activePopTx.id, item)}
                              className="text-left truncate flex-1 min-w-0 pr-1 cursor-pointer"
                            >
                              {(!isIncome || mainTitle !== '수입') && mainTitle && (
                                <span
                                  className={`text-[10px] font-normal mr-1 block ${
                                    isSelected ? 'text-indigo-500' : 'text-slate-400'
                                  }`}
                                >
                                  {mainTitle}
                                </span>
                              )}
                              <span
                                className={
                                  isSelected ? 'text-indigo-900 font-bold' : 'text-slate-800'
                                }
                              >
                                {subTitle}
                              </span>
                            </button>
                            <div className="flex items-center gap-1 shrink-0">
                              {isCustom && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeCustomCategory(item);
                                  }}
                                  className="p-0.5 text-slate-300 hover:text-rose-600 rounded transition opacity-0 group-hover:opacity-100 cursor-pointer"
                                  title="커스텀 카테고리 삭제"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                              {isSelected && (
                                <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer with Unclassified Option and Auto-Rule Checkbox */}
            <div className="p-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => handleSelectCategoryForTx(activePopTx.id, '미분류')}
                className={`px-2.5 py-1 text-xs rounded-lg transition font-medium cursor-pointer ${
                  isUnclassified
                    ? 'bg-amber-100 text-amber-900 font-bold'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                }`}
              >
                미분류로 지정
              </button>

              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none hover:text-slate-900">
                <input
                  type="checkbox"
                  checked={categoryPopoverAutoRule}
                  onChange={(e) => setCategoryPopoverAutoRule(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                />
                <span>자동 분류 규칙 등록</span>
              </label>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Floating Tag Creation & Management Popover Portal */}
      {tagPopoverTxId && (() => {
        const activePopTx = transactions.find((t) => t.id === tagPopoverTxId);
        if (!activePopTx) return null;
        const currentTags = activePopTx.tags || [];
        const unusedExistingTags = allExistingTags.filter((t) => !currentTags.includes(t));

        return createPortal(
          <div
            ref={tagPopoverRef}
            className="fixed bg-white border border-slate-200 rounded-xl shadow-2xl z-[9999] w-68 p-3.5 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-100"
            style={{
              top: `${tagPopoverPos.top}px`,
              left: `${tagPopoverPos.left}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-indigo-600" />
                <span>태그 직접 생성 및 설정</span>
              </span>
              <button
                type="button"
                onClick={() => setTagPopoverTxId(null)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Current tags in this transaction */}
            {currentTags.length > 0 ? (
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto py-0.5">
                {currentTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/70 rounded-md text-[11px] font-medium"
                  >
                    #{t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTagFromTx(activePopTx.id, t)}
                      className="text-indigo-400 hover:text-rose-600 ml-0.5 transition"
                      title="태그 삭제"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 py-0.5">등록된 태그가 없습니다. 아래에서 새 태그를 생성하세요.</div>
            )}

            {/* Input to create a new tag directly */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (tagInputVal.trim()) {
                  handleAddTagToTx(activePopTx.id, tagInputVal);
                }
              }}
              className="flex items-center gap-1.5"
            >
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">#</span>
                <input
                  type="text"
                  autoFocus
                  value={tagInputVal}
                  onChange={(e) => setTagInputVal(e.target.value)}
                  placeholder="새 태그명 입력..."
                  className="w-full pl-6 pr-2 py-1 text-xs bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-lg outline-none font-medium text-slate-800"
                />
              </div>
              <button
                type="submit"
                disabled={!tagInputVal.trim()}
                className="px-2.5 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-1 transition"
              >
                <Plus className="h-3 w-3" />
                생성
              </button>
            </form>

            {/* Suggested existing tags from other transactions */}
            {unusedExistingTags.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="text-[10px] font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                  <span>기존 태그에서 선택</span>
                  <span>{unusedExistingTags.length}개</span>
                </div>
                <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-0.5">
                  {unusedExistingTags.map((tag) => (
                    <span
                      key={tag}
                      onClick={() => handleAddTagToTx(activePopTx.id, tag)}
                      className="inline-flex items-center gap-1 text-[10px] pl-1.5 pr-1 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded cursor-pointer transition border border-transparent hover:border-indigo-200 font-medium group/tagbadge"
                      title={`클릭하여 #${tag} 추가`}
                    >
                      <span className="truncate max-w-[90px]">#{tag}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTagGlobally(tag);
                        }}
                        className="p-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                        title="기존 태그 삭제"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>,
          document.body
        );
      })()}
    </div>
  );
};
