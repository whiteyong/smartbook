import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  ChevronDown,
  Check,
  Tag,
  AlertCircle,
  X,
  Coffee,
  ShoppingBag,
  Utensils,
  Truck,
  Bus,
  Home,
  CreditCard,
  Layers,
  Wallet,
  Coins,
  TrendingUp,
  PlusCircle,
} from 'lucide-react';
import { CATEGORY_TREE } from '../data/initialLedgerData';

interface CategorySelectorProps {
  value: string;
  onChange: (category: string) => void;
  direction?: 'in' | 'out';
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  align?: 'left' | 'right';
}

// Quick shortcuts for EXPENSES (지출 빠른 분류)
const EXPENSE_SHORTCUTS = [
  { label: '외식', category: '식비 > 외식', icon: Utensils },
  { label: '카페', category: '식비 > 카페/음료', icon: Coffee },
  { label: '장보기', category: '식비 > 장보기', icon: ShoppingBag },
  { label: '배달', category: '식비 > 배달음식', icon: Truck },
  { label: '대중교통', category: '교통/차량 > 대중교통', icon: Bus },
  { label: '생활용품', category: '생활용품 > 세제/화장지', icon: Tag },
  { label: '관리비', category: '주거/관리비 > 관리비', icon: Home },
  { label: '보험료', category: '금융/보험 > 보험료', icon: CreditCard },
];

// Quick shortcuts for INCOMES (수입 빠른 분류)
const INCOME_SHORTCUTS = [
  { label: '급여', category: '수입 > 급여', icon: Wallet },
  { label: '상여/성과급', category: '수입 > 상여/성과급', icon: Coins },
  { label: '금융/배당', category: '수입 > 금융소득/배당', icon: TrendingUp },
  { label: '부수입/당근', category: '수입 > 부수입/당근', icon: ShoppingBag },
  { label: '기타수입', category: '수입 > 기타수입', icon: PlusCircle },
];

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  value,
  onChange,
  direction = 'out',
  disabled = false,
  className = '',
  size = 'sm',
  align = 'right',
}) => {
  const isIncomeDirection = direction === 'in';

  // Dynamic quick shortcuts depending on direction
  const activeShortcuts = useMemo(() => {
    return isIncomeDirection ? INCOME_SHORTCUTS : EXPENSE_SHORTCUTS;
  }, [isIncomeDirection]);

  // Initial group tab calculation helper (Only used for expenses)
  const getInitialGroupTab = useCallback(
    (currentVal: string) => {
      if (currentVal && currentVal !== '미분류') {
        const found = CATEGORY_TREE.find((grp) =>
          grp.items.some((it) => it === currentVal)
        );
        if (found) return found.group;
      }
      return '전체';
    },
    []
  );

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>(() =>
    getInitialGroupTab(value)
  );

  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Floating Popover Calculated Coordinates
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: 'bottom' | 'top';
  }>({
    top: 0,
    left: 0,
    width: 380,
    maxHeight: 460,
    placement: 'bottom',
  });

  // Calculate viewport-aware coordinates
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(380, window.innerWidth - 24);
    const popoverDesiredHeight = isIncomeDirection ? 340 : 440;

    // Horizontal position
    let left = align === 'right' ? rect.right - popoverWidth : rect.left;
    if (left + popoverWidth > window.innerWidth - 12) {
      left = window.innerWidth - popoverWidth - 12;
    }
    if (left < 12) {
      left = 12;
    }

    // Vertical positioning with flip logic
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;

    let top: number;
    let maxHeight: number;
    let placement: 'bottom' | 'top' = 'bottom';

    if (spaceBelow < 260 && spaceAbove > spaceBelow) {
      // Place above
      placement = 'top';
      maxHeight = Math.min(popoverDesiredHeight, Math.max(220, spaceAbove));
      top = Math.max(12, rect.top - maxHeight - 6);
    } else {
      // Place below
      placement = 'bottom';
      maxHeight = Math.min(popoverDesiredHeight, Math.max(220, spaceBelow));
      top = rect.bottom + 6;
    }

    setPopoverPos({ top, left, width: popoverWidth, maxHeight, placement });
  }, [align, isIncomeDirection]);

  // Open & Sync initial active tab
  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      if (!isIncomeDirection) {
        setSelectedGroup(getInitialGroupTab(value));
      }
      setSearchQuery('');
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Close when clicking outside both button and popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Update position on scroll or window resize
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = (e: Event) => {
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        return;
      }
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Group tabs list (Only for expenses, excluding '수입')
  const groupTabs = useMemo(() => {
    if (isIncomeDirection) return [];
    const nonIncomeGroups = CATEGORY_TREE.filter((c) => c.group !== '수입').map(
      (c) => c.group
    );
    return ['전체', ...nonIncomeGroups];
  }, [isIncomeDirection]);

  // Filtered categories based on direction, selected group & search query
  const filteredTree = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (isIncomeDirection) {
      // 수입인 경우: 오직 '수입' 그룹 항목들만 표시 (탭 불필요)
      const incomeGrp = CATEGORY_TREE.find((g) => g.group === '수입');
      if (!incomeGrp) return [];

      const matchedItems = query
        ? incomeGrp.items.filter((it) => it.toLowerCase().includes(query))
        : incomeGrp.items;

      return matchedItems.length > 0 ? [{ ...incomeGrp, items: matchedItems }] : [];
    }

    // 지출인 경우: '수입' 그룹을 제외한 지출 카테고리만 제공
    const expenseGroups = CATEGORY_TREE.filter((g) => g.group !== '수입');

    return expenseGroups
      .map((grp) => {
        if (selectedGroup !== '전체' && grp.group !== selectedGroup) {
          return { ...grp, items: [] };
        }

        if (!query) return grp;

        const matchedItems = grp.items.filter(
          (item) =>
            item.toLowerCase().includes(query) ||
            grp.group.toLowerCase().includes(query)
        );

        return {
          ...grp,
          items: matchedItems,
        };
      })
      .filter((grp) => grp.items.length > 0);
  }, [searchQuery, selectedGroup, isIncomeDirection]);

  const isUnclassified = !value || value === '미분류';

  // Strict Single-selection handler (택1, 즉시 상위 반영)
  const handleSelect = (category: string) => {
    onChange(category);
    setIsOpen(false);
    setSearchQuery('');
  };

  // Split value for neutral gray box display
  const valueParts = (value || '').split(' > ');
  const displayMain = valueParts.length > 1 ? valueParts[0] : '';
  const displaySub = valueParts.length > 1 ? valueParts[1] : (value || '선택');

  return (
    <>
      {/* Trigger Button: Clean neutral gray box style */}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`inline-flex items-center justify-between gap-2 transition text-left rounded-lg border font-medium select-none ${
          size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-xs'
        } ${
          isUnclassified
            ? 'bg-amber-50/90 border-amber-300 text-amber-900 hover:bg-amber-100 hover:border-amber-400'
            : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200/80 hover:border-slate-400 focus:ring-2 focus:ring-slate-400'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      >
        {isUnclassified ? (
          <span className="flex items-center gap-1 text-amber-800 font-semibold">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span>미분류 (분류 선택)</span>
          </span>
        ) : (
          <span className="flex items-center gap-1 min-w-0">
            {displayMain && (
              <span className="text-[11px] text-slate-500 font-normal shrink-0">
                {displayMain} &gt;
              </span>
            )}
            <span className="font-semibold text-slate-800 truncate">{displaySub}</span>
          </span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-500 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-slate-700' : ''
          }`}
        />
      </button>

      {/* Floating Portal Modal / Popover */}
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed bg-white border border-slate-200 rounded-2xl shadow-xl z-[9999] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
            style={{
              top: `${popoverPos.top}px`,
              left: `${popoverPos.left}px`,
              width: `${popoverPos.width}px`,
              height: `${popoverPos.maxHeight}px`,
            }}
          >
            {/* Header & Search Bar */}
            <div className="p-3 border-b border-slate-100 bg-slate-50/90 space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-slate-600" />
                  <span>{isIncomeDirection ? '수입 카테고리 선택' : '지출 카테고리 선택'}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 font-medium">
                    {isIncomeDirection ? '입금 건' : '출금 건'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition hover:bg-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    isIncomeDirection
                      ? '수입 검색 (예: 급여, 상여, 배당, 당근...)'
                      : '카테고리 검색 (예: 카페, 마트, 외식, 배달...)'
                  }
                  className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Quick Shortcuts Chips (Strict single selection: 택1) */}
              {!searchQuery && (
                <div className="pt-0.5">
                  <div className="text-[10px] font-semibold text-slate-500 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3 text-amber-500" />
                      자주 쓰는 빠른 분류 ({isIncomeDirection ? '수입' : '지출'})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeShortcuts.map((sc) => {
                      const Icon = sc.icon;
                      // Strictly matches single selection against currently selected value
                      const isSelected = value === sc.category;

                      return (
                        <button
                          key={sc.category}
                          type="button"
                          onClick={() => handleSelect(sc.category)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition ${
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
            {!isIncomeDirection && (
              <div className="px-2 pt-1.5 pb-1 border-b border-slate-100 bg-white flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
                {groupTabs.map((grpName) => {
                  const isTabSelected = selectedGroup === grpName;
                  return (
                    <button
                      key={grpName}
                      type="button"
                      onClick={() => {
                        setSelectedGroup(grpName);
                        setSearchQuery('');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition ${
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

            {/* Categories List Body (Strictly single selection: 택1) */}
            <div className="p-2 overflow-y-auto flex-1 divide-y divide-slate-100 overscroll-contain">
              {filteredTree.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  <Search className="h-5 w-5 mx-auto mb-1.5 opacity-40" />
                  <p>‘{searchQuery}’ 검색 결과가 없습니다.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      if (!isIncomeDirection) setSelectedGroup('전체');
                    }}
                    className="mt-2 text-indigo-600 font-semibold underline"
                  >
                    목록 새로고침
                  </button>
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
                        // Strictly matches single selection against currently selected value
                        const isSelected = value === item;
                        const parts = item.split(' > ');
                        const mainTitle = parts.length > 1 ? parts[0] : '';
                        const subTitle = parts.length > 1 ? parts[1] : item;

                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => handleSelect(item)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition group ${
                              isSelected
                                ? 'bg-indigo-50/80 border border-indigo-300 text-indigo-700 font-bold shadow-2xs'
                                : 'hover:bg-slate-100 border border-slate-100 text-slate-700'
                            }`}
                          >
                            <div className="truncate min-w-0 pr-1">
                              {!isIncomeDirection && (
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
                            </div>
                            {isSelected && (
                              <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer with Unclassified Option */}
            <div className="p-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => handleSelect('미분류')}
                className={`px-2.5 py-1 text-xs rounded-lg transition font-medium ${
                  isUnclassified
                    ? 'bg-amber-100 text-amber-900 font-bold'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                }`}
              >
                미분류로 지정
              </button>
              <div className="text-[11px] text-slate-500 truncate max-w-[200px] text-right">
                {isUnclassified ? (
                  <span className="text-amber-600">분류를 선택해주세요</span>
                ) : (
                  <span>
                    현재 선택: <strong className="text-slate-800">{value}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
