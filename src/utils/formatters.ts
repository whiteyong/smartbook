export function formatKRW(amount: number | undefined | null, hide = false): string {
  if (hide) return '***,***원';
  const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `${val.toLocaleString('ko-KR')}원`;
}

export function formatSignedKRW(
  amount: number | undefined | null,
  direction?: 'in' | 'out',
  hide = false
): string {
  if (hide) return '***,***원';
  const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  const prefix = direction === 'in' ? '+' : '-';
  return `${prefix}${val.toLocaleString('ko-KR')}원`;
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  const parts = dateStr.split(' ');
  return parts[0];
}

export function formatDateTime(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  return dateStr.replace('T', ' ').substring(0, 19);
}

export function maskAccountNumber(accNo: string | undefined | null): string {
  if (!accNo) return '';
  if (accNo.includes('*')) return accNo;
  // E.g., 110-384-592910 -> 110-***-**2910
  const parts = accNo.split('-');
  if (parts.length >= 3) {
    return `${parts[0]}-***-**${parts[parts.length - 1].slice(-4)}`;
  }
  return accNo.substring(0, 3) + '***' + accNo.slice(-4);
}
