import { CATEGORY_TREE } from '../data/initialLedgerData';

export const STORAGE_KEY_CUSTOM_CATEGORIES = 'ledger_custom_categories_v1';

export interface CategoryGroup {
  group: string;
  items: string[];
}

export const DEFAULT_PARENT_GROUPS = [
  '식비',
  '생활/쇼핑',
  '문화/여가/교통',
  '주거/통신',
  '금융/보험/세금',
  '수입',
  '기타',
];

/**
 * 로컬 스토리지에서 사용자가 직접 추가한 커스텀 카테고리 목록을 로드합니다.
 */
export function getStoredCustomCategories(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_CATEGORIES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === 'string' && item.trim().length > 0);
    }
  } catch (err) {
    console.error('Failed to load custom categories:', err);
  }
  return [];
}

/**
 * 커스텀 카테고리 목록을 로컬 스토리지에 저장합니다.
 */
export function saveCustomCategories(categories: string[]): void {
  try {
    const unique = Array.from(new Set(categories.map((c) => c.trim()).filter(Boolean)));
    localStorage.setItem(STORAGE_KEY_CUSTOM_CATEGORIES, JSON.stringify(unique));
    // 동일 창 내 컴포넌트 간 실시간 동기화를 위한 이벤트 디스패치
    window.dispatchEvent(new CustomEvent('custom-categories-changed', { detail: unique }));
  } catch (err) {
    console.error('Failed to save custom categories:', err);
  }
}

/**
 * 새 카테고리를 커스텀 카테고리에 추가합니다.
 * @param category 예: "식비 > 야식" 또는 "반려동물 > 간식" 또는 "취미"
 */
export function addCustomCategory(category: string): string {
  const trimmed = category.trim();
  if (!trimmed) return '';
  const current = getStoredCustomCategories();
  if (!current.includes(trimmed)) {
    saveCustomCategories([...current, trimmed]);
  }
  return trimmed;
}

/**
 * 커스텀 카테고리를 삭제합니다.
 */
export function removeCustomCategory(category: string): void {
  const trimmed = category.trim();
  const current = getStoredCustomCategories();
  saveCustomCategories(current.filter((c) => c !== trimmed));
}

/**
 * 기본 CATEGORY_TREE와 사용자가 추가한 커스텀 카테고리를 병합한 최신 카테고리 트리를 반환합니다.
 */
export function getMergedCategoryTree(customCategories?: string[]): CategoryGroup[] {
  const customs = customCategories || getStoredCustomCategories();
  
  // 기본 트리 깊은 복사
  const tree: CategoryGroup[] = CATEGORY_TREE.map((g) => ({
    group: g.group,
    items: [...g.items],
  }));

  customs.forEach((cat) => {
    const parts = cat.split(' > ');
    const groupName = parts.length > 1 ? parts[0].trim() : '기타';
    
    let targetGroup = tree.find((g) => g.group === groupName || g.group.includes(groupName));
    if (!targetGroup) {
      // 새 대분류 그룹 생성
      targetGroup = { group: groupName, items: [] };
      tree.push(targetGroup);
    }

    if (!targetGroup.items.includes(cat)) {
      targetGroup.items.push(cat);
    }
  });

  return tree;
}
