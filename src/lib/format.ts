import type { Member } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-03-10" -> "Mar 10, 2026". Parses the string itself so the day never shifts by time zone. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function todayIso(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function isIsoDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function ageOf(dob: string | null | undefined): number | null {
  if (!isIsoDate(dob)) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return a;
}

export function fullName(m: Pick<Member, 'first_name' | 'middle_name' | 'last_name'>): string {
  return [m.first_name, m.middle_name, m.last_name].filter(Boolean).join(' ');
}

export function initials(m: Pick<Member, 'first_name' | 'last_name'>): string {
  return ((m.first_name?.[0] ?? '') + (m.last_name?.[0] ?? '')).toUpperCase() || '?';
}

export function money(n: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: n % 1 ? 2 : 0,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export const cmToFtIn = (cm: number) => {
  const total = cm / 2.54;
  let ft = Math.floor(total / 12);
  let inch = Math.round(total - ft * 12);
  if (inch === 12) { ft += 1; inch = 0; }
  return `${ft} ft ${inch} in`;
};
export const kgToLb = (kg: number) => Math.round(kg * 2.20462);
export const bmi = (kg: number, cm: number) => kg / (cm / 100) ** 2;

/** Eye power with an explicit sign, e.g. -1.25 -> "−1.25", 0.5 -> "+0.50". */
export function power(v: number | null | undefined): string {
  if (v == null) return '—';
  const s = v > 0 ? '+' : v < 0 ? '−' : '';
  return s + Math.abs(v).toFixed(2);
}

/** Parse a user-typed number; empty or invalid becomes null. */
export function num(s: string): number | null {
  if (s.trim() === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
