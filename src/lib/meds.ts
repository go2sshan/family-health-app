import { supabase } from './supabase';
import type { Member } from './types';

export type MedForm = 'tablet' | 'capsule' | 'syrup' | 'drops' | 'inhaler' | 'injection' | 'cream' | 'other';
export type Frequency = 'daily' | 'days' | 'as_needed';

export type MedSchedule = {
  id: string; member_id: string; record_id: string | null;
  name: string; strength: string | null; form: MedForm; dose_qty: number; dose_unit: string;
  pill_color: string | null; instructions: string | null;
  frequency: Frequency; days_of_week: number[] | null; times: string[];
  start_date: string; end_date: string | null; active: boolean;
};

export type DoseStatus = 'taken' | 'missed' | 'skipped';
export type Dose = { id: string; member_id: string; schedule_id: string; scheduled_for: string | null; status: DoseStatus; logged_at: string; owner: string | null };

export type Slot = { key: string; schedule: MedSchedule; member: Member; at: Date; time: string; dose: Dose | null };

// ---------- colors ----------
export const PERSON_COLORS = ['teal', 'indigo', 'rose', 'amber', 'green', 'violet', 'orange', 'sky'] as const;
export type PersonColor = (typeof PERSON_COLORS)[number];
const PANEL: Record<PersonColor, { light: [string, string]; dark: [string, string] }> = {
  teal: { light: ['#e1f0f1', '#0f6e7a'], dark: ['#16363b', '#5cc2cc'] },
  indigo: { light: ['#e6e8fb', '#4650c8'], dark: ['#232a52', '#9aa2f5'] },
  rose: { light: ['#fbe6ec', '#c2185b'], dark: ['#45202c', '#f48fb1'] },
  amber: { light: ['#fdf1d8', '#a35f00'], dark: ['#3e2f12', '#ffc766'] },
  green: { light: ['#e3f4e6', '#2e7d32'], dark: ['#1d3a22', '#81c995'] },
  violet: { light: ['#efe5fb', '#7b3fbf'], dark: ['#33224a', '#c39bf2'] },
  orange: { light: ['#fde9dc', '#c4511a'], dark: ['#43271a', '#ffab7a'] },
  sky: { light: ['#e2f1fb', '#1769aa'], dark: ['#18324a', '#8cc8f5'] },
};
/** [panel background, accent/border] for a person's color in the current theme. */
export function panelColors(color: string | null | undefined, dark: boolean): [string, string] {
  const p = PANEL[(color as PersonColor) in PANEL ? (color as PersonColor) : 'teal'];
  return dark ? p.dark : p.light;
}

export const PILL_COLORS: { name: string; hex: string }[] = [
  { name: 'white', hex: '#f4f4f2' }, { name: 'yellow', hex: '#f5d64e' }, { name: 'orange', hex: '#f39a3d' },
  { name: 'pink', hex: '#f3a5c0' }, { name: 'red', hex: '#d64545' }, { name: 'blue', hex: '#4a83d9' },
  { name: 'green', hex: '#5bb26a' }, { name: 'brown', hex: '#9a6b47' }, { name: 'purple', hex: '#8e63c9' },
];
export const pillHex = (name: string | null) => PILL_COLORS.find((p) => p.name === name)?.hex ?? null;

export const FORMS: { value: MedForm; label: string; unit: string }[] = [
  { value: 'tablet', label: 'Tablet', unit: 'tablet' }, { value: 'capsule', label: 'Capsule', unit: 'capsule' },
  { value: 'syrup', label: 'Syrup', unit: 'ml' }, { value: 'drops', label: 'Drops', unit: 'drops' },
  { value: 'inhaler', label: 'Inhaler', unit: 'puffs' }, { value: 'injection', label: 'Injection', unit: 'units' },
  { value: 'cream', label: 'Cream', unit: 'application' }, { value: 'other', label: 'Other', unit: 'dose' },
];

// ---------- formatting ----------
export function time12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export function doseText(s: Pick<MedSchedule, 'dose_qty' | 'dose_unit'>): string {
  const q = Number(s.dose_qty);
  const unit = s.dose_unit === 'tablet' || s.dose_unit === 'capsule' ? (q <= 1 ? s.dose_unit : `${s.dose_unit}s`) : s.dose_unit;
  const qty = q === 0.5 ? '½' : q === 0.25 ? '¼' : q === 1.5 ? '1½' : String(q);
  return `${qty} ${unit}`;
}
export const isTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Does this schedule have reminders on this calendar day? */
export function runsOn(s: MedSchedule, day: Date): boolean {
  if (!s.active || s.frequency === 'as_needed') return false;
  const d = iso(day);
  if (d < s.start_date || (s.end_date && d > s.end_date)) return false;
  if (s.frequency === 'days') return (s.days_of_week ?? []).includes(day.getDay() + 1);
  return true;
}

export function slotTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(day); d.setHours(h, m, 0, 0);
  return d;
}

// ---------- data ----------
export async function listSchedules(): Promise<MedSchedule[]> {
  const { data, error } = await supabase.from('medication_schedules').select('*').order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as MedSchedule[];
}

export async function dosesBetween(from: Date, to: Date): Promise<Dose[]> {
  const { data, error } = await supabase.from('medication_doses').select('*')
    .gte('logged_at', new Date(from.getTime() - 864e5).toISOString())
    .lte('logged_at', new Date(to.getTime() + 864e5).toISOString())
    .order('logged_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Dose[];
}

export function buildDay(day: Date, schedules: MedSchedule[], members: Member[], doses: Dose[]): Slot[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const slots: Slot[] = [];
  for (const s of schedules) {
    const member = byId.get(s.member_id);
    if (!member || !runsOn(s, day)) continue;
    for (const t of [...s.times].sort()) {
      const at = slotTime(day, t);
      const dose = doses.find((d) => d.schedule_id === s.id && d.scheduled_for && new Date(d.scheduled_for).getTime() === at.getTime()) ?? null;
      slots.push({ key: `${s.id}|${at.toISOString()}`, schedule: s, member, at, time: t, dose });
    }
  }
  return slots.sort((a, b) => a.at.getTime() - b.at.getTime() || a.member.first_name.localeCompare(b.member.first_name));
}

/** Record Taken / Missed for one reminder time (tapping again changes the answer). */
export async function markDose(s: Pick<MedSchedule, 'id' | 'member_id'>, at: Date | null, status: DoseStatus): Promise<void> {
  if (at) {
    const { data: existing } = await supabase.from('medication_doses').select('id')
      .eq('schedule_id', s.id).eq('scheduled_for', at.toISOString()).maybeSingle();
    if (existing) {
      const { error } = await supabase.from('medication_doses').update({ status, logged_at: new Date().toISOString() }).eq('id', existing.id);
      if (error) throw new Error(error.message);
      return;
    }
  }
  const { error } = await supabase.from('medication_doses').insert({
    member_id: s.member_id, schedule_id: s.id, scheduled_for: at ? at.toISOString() : null, status,
  });
  if (error) throw new Error(error.message);
}

export async function undoDose(doseId: string) {
  const { error } = await supabase.from('medication_doses').delete().eq('id', doseId);
  if (error) throw new Error(error.message);
}

export async function saveSchedule(s: Omit<MedSchedule, 'id'> & { id?: string }): Promise<MedSchedule> {
  const { id, ...fields } = s;
  const res = id
    ? await supabase.from('medication_schedules').update(fields).eq('id', id).select().single()
    : await supabase.from('medication_schedules').insert(fields).select().single();
  if (res.error) throw new Error(res.error.message);
  return res.data as MedSchedule;
}

export async function deleteSchedule(id: string) {
  const { error } = await supabase.from('medication_schedules').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Share of scheduled reminders answered "taken" over the last `days` days (null when nothing was due). */
export function adherence(s: MedSchedule, doses: Dose[], days = 7): { taken: number; due: number } | null {
  if (s.frequency === 'as_needed') return null;
  let due = 0, taken = 0;
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const day = new Date(now.getTime() - i * 864e5);
    if (!runsOn(s, day)) continue;
    for (const t of s.times) {
      const at = slotTime(day, t);
      if (at > now) continue;
      due++;
      if (doses.some((d) => d.schedule_id === s.id && d.status === 'taken' && d.scheduled_for && new Date(d.scheduled_for).getTime() === at.getTime())) taken++;
    }
  }
  return due ? { taken, due } : null;
}
