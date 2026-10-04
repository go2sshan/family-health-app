/**
 * Apple Health (iPhone + Apple Watch) sync.
 *
 * Reads daily summaries and workouts from HealthKit on this device and saves them to the
 * selected family member. HealthKit only exists in a real iOS build (TestFlight or a
 * development build), never in Expo Go, Android or web, so the native module is loaded
 * lazily and every entry point checks `appleHealthAvailable()` first.
 */
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { supabase } from './supabase';
import type { BloodGroup, Member } from './types';

type HK = typeof import('@kingstinct/react-native-healthkit');

let hk: HK | null | undefined;
function load(): HK | null {
  if (hk !== undefined) return hk;
  if (Platform.OS !== 'ios') return (hk = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    hk = require('@kingstinct/react-native-healthkit') as HK;
    if (!hk.isHealthDataAvailable()) hk = null;
  } catch {
    hk = null; // Expo Go or a build without the HealthKit module
  }
  return hk;
}

export function appleHealthAvailable(): boolean {
  return load() !== null;
}

// ---------- what we read ----------
type Stat = 'cumulativeSum' | 'discreteAverage' | 'discreteMax';
type Metric = {
  key: string; id: string; unit: string; stat: Stat;
  /** Convert HealthKit's value into what we store. */
  scale?: (v: number) => number;
};

const DAILY: Metric[] = [
  { key: 'steps', id: 'HKQuantityTypeIdentifierStepCount', unit: 'count', stat: 'cumulativeSum' },
  { key: 'distance_km', id: 'HKQuantityTypeIdentifierDistanceWalkingRunning', unit: 'km', stat: 'cumulativeSum' },
  { key: 'active_kcal', id: 'HKQuantityTypeIdentifierActiveEnergyBurned', unit: 'kcal', stat: 'cumulativeSum' },
  { key: 'exercise_min', id: 'HKQuantityTypeIdentifierAppleExerciseTime', unit: 'min', stat: 'cumulativeSum' },
  { key: 'flights', id: 'HKQuantityTypeIdentifierFlightsClimbed', unit: 'count', stat: 'cumulativeSum' },
  { key: 'resting_hr', id: 'HKQuantityTypeIdentifierRestingHeartRate', unit: 'count/min', stat: 'discreteAverage' },
  { key: 'avg_hr', id: 'HKQuantityTypeIdentifierHeartRate', unit: 'count/min', stat: 'discreteAverage' },
  { key: 'max_hr', id: 'HKQuantityTypeIdentifierHeartRate', unit: 'count/min', stat: 'discreteMax' },
  { key: 'hrv_ms', id: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', unit: 'ms', stat: 'discreteAverage' },
  // HealthKit reports oxygen saturation as a fraction (0.97); store a percentage.
  { key: 'spo2_pct', id: 'HKQuantityTypeIdentifierOxygenSaturation', unit: '%', stat: 'discreteAverage', scale: (v) => (v <= 1 ? v * 100 : v) },
  { key: 'resp_rate', id: 'HKQuantityTypeIdentifierRespiratoryRate', unit: 'count/min', stat: 'discreteAverage' },
  { key: 'vo2max', id: 'HKQuantityTypeIdentifierVO2Max', unit: 'ml/(kg*min)', stat: 'discreteAverage' },
  { key: 'weight_kg', id: 'HKQuantityTypeIdentifierBodyMass', unit: 'kg', stat: 'discreteAverage' },
  { key: 'bmi', id: 'HKQuantityTypeIdentifierBodyMassIndex', unit: 'count', stat: 'discreteAverage' },
  { key: 'bp_sys', id: 'HKQuantityTypeIdentifierBloodPressureSystolic', unit: 'mmHg', stat: 'discreteAverage' },
  { key: 'bp_dia', id: 'HKQuantityTypeIdentifierBloodPressureDiastolic', unit: 'mmHg', stat: 'discreteAverage' },
  { key: 'glucose_mgdl', id: 'HKQuantityTypeIdentifierBloodGlucose', unit: 'mg/dL', stat: 'discreteAverage' },
  { key: 'temp_c', id: 'HKQuantityTypeIdentifierBodyTemperature', unit: 'degC', stat: 'discreteAverage' },
];

const SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis';
const READ = [
  ...new Set(DAILY.map((m) => m.id)),
  SLEEP,
  'HKWorkoutTypeIdentifier',
  'HKCharacteristicTypeIdentifierBloodType',
  'HKCharacteristicTypeIdentifierBiologicalSex',
  'HKCharacteristicTypeIdentifierDateOfBirth',
];

// ---------- link this iPhone to a family member ----------
const LINK_KEY = 'appleHealthMemberId';
export const deviceName = () => Device.deviceName ?? 'iPhone';
export const linkedMemberId = (): string | null => {
  try { return localStorage.getItem(LINK_KEY); } catch { return null; }
};

/** Ask for permission, link this iPhone's Health data to `member`, then run the first sync. */
export async function connectAppleHealth(member: Member): Promise<SyncResult> {
  const h = load();
  if (!h) throw new Error('Apple Health works in the installed app on iPhone, not in Expo Go.');
  await h.requestAuthorization({ toRead: READ as never });
  localStorage.setItem(LINK_KEY, member.id);
  await fillProfileFromHealth(h, member);
  return syncAppleHealth(member.id, { firstTime: true });
}

export function disconnectAppleHealth() {
  try { localStorage.removeItem(LINK_KEY); } catch { /* nothing stored */ }
}

/** Fill blood group, sex and date of birth from Apple Health when the profile doesn't have them yet. */
async function fillProfileFromHealth(h: HK, m: Member) {
  const patch: Partial<Member> = {};
  try {
    const BLOOD: (BloodGroup | null)[] = [null, 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    const blood = BLOOD[h.getBloodType() as number] ?? null;
    if (!m.blood_group && blood) patch.blood_group = blood;
    const sex = ([null, 'female', 'male', 'other'] as const)[h.getBiologicalSex() as number] ?? null;
    if (!m.sex && sex) patch.sex = sex;
    const dob = h.getDateOfBirth();
    if (!m.date_of_birth && dob) patch.date_of_birth = localDay(dob);
  } catch { /* the person may not have shared these */ }
  if (Object.keys(patch).length) await supabase.from('members').update(patch).eq('id', m.id);
}

// ---------- sync ----------
export type SyncResult = { days: number; workouts: number };

function localDay(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

async function lastSync(memberId: string): Promise<Date | null> {
  const { data } = await supabase.from('health_links').select('last_sync_at')
    .eq('member_id', memberId).eq('device_name', deviceName()).maybeSingle();
  return data?.last_sync_at ? new Date(data.last_sync_at) : null;
}

/**
 * Pull daily summaries and workouts since the last sync (or the past 180 days the first
 * time) and upsert them. Safe to run repeatedly: rows are keyed by day and metric.
 */
export async function syncAppleHealth(memberId: string, opts: { firstTime?: boolean } = {}): Promise<SyncResult> {
  const h = load();
  if (!h) throw new Error('Apple Health is not available on this device.');

  const now = new Date();
  const prev = opts.firstTime ? null : await lastSync(memberId);
  // Re-read the last 3 days every time: the watch often delivers data late.
  const from = startOfDay(prev ? new Date(prev.getTime() - 3 * 864e5) : new Date(now.getTime() - 180 * 864e5));
  const filter = { date: { startDate: from, endDate: now } };

  const rows = new Map<string, { member_id: string; day: string; metric: string; value: number }>();
  const put = (day: string, metric: string, value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    rows.set(`${day}|${metric}`, { member_id: memberId, day, metric, value: Math.round(value * 100) / 100 });
  };

  // 1) daily statistics, one HealthKit query per metric
  for (const m of DAILY) {
    try {
      const days = await h.queryStatisticsCollectionForQuantity(
        m.id as never, [m.stat], from, { day: 1 }, { filter, unit: m.unit } as never,
      );
      for (const d of days) {
        if (!d.startDate) continue;
        const q = m.stat === 'cumulativeSum' ? d.sumQuantity : m.stat === 'discreteMax' ? d.maximumQuantity : d.averageQuantity;
        if (q) put(localDay(d.startDate), m.key, m.scale ? m.scale(q.quantity) : q.quantity);
      }
    } catch { /* not shared or never recorded: skip this metric */ }
  }

  // 2) sleep: merge overlapping "asleep" periods from watch and phone, credit them to the wake-up day
  try {
    const ASLEEP = new Set([1, 3, 4, 5]); // unspecified, core, deep, REM
    const samples = await h.queryCategorySamples(SLEEP, { limit: 0, filter: { date: { startDate: new Date(from.getTime() - 864e5), endDate: now } } });
    const spans = samples
      .filter((s) => ASLEEP.has(Number(s.value)))
      .map((s) => [s.startDate.getTime(), s.endDate.getTime()] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const s of spans) {
      const last = merged.at(-1);
      if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
      else merged.push([...s]);
    }
    const byDay: Record<string, number> = {};
    for (const [a, b] of merged) {
      const day = localDay(new Date(b));
      byDay[day] = (byDay[day] ?? 0) + (b - a) / 3.6e6;
    }
    for (const [day, hours] of Object.entries(byDay)) if (day >= localDay(from)) put(day, 'sleep_hr', hours);
  } catch { /* sleep not shared */ }

  // 3) save daily rows in batches
  const all = [...rows.values()];
  for (let i = 0; i < all.length; i += 500) {
    const { error } = await supabase.from('health_daily').upsert(all.slice(i, i + 500), { onConflict: 'member_id,day,metric' });
    if (error) throw new Error(error.message);
  }

  // 4) workouts
  let workoutCount = 0;
  try {
    const ws = await h.queryWorkoutSamples({ limit: 0, ascending: false, filter: { date: { startDate: from, endDate: now } } } as never);
    const out = ws.map((w) => ({
      member_id: memberId,
      source_uuid: w.uuid,
      started_at: w.startDate.toISOString(),
      activity: activityName(h, Number(w.workoutActivityType)),
      minutes: Math.round(toMinutes(w.duration?.quantity ?? (w.endDate.getTime() - w.startDate.getTime()) / 1000, w.duration?.unit ?? 's') * 10) / 10,
      kcal: w.totalEnergyBurned ? Math.round(toKcal(w.totalEnergyBurned.quantity, w.totalEnergyBurned.unit)) : null,
      km: w.totalDistance ? Math.round(toKm(w.totalDistance.quantity, w.totalDistance.unit) * 100) / 100 : null,
    }));
    for (let i = 0; i < out.length; i += 200) {
      const { error } = await supabase.from('workouts').upsert(out.slice(i, i + 200), { onConflict: 'member_id,source_uuid' });
      if (error) throw new Error(error.message);
    }
    workoutCount = out.length;
  } catch (e) {
    if (e instanceof Error && /violates|permission|JWT/i.test(e.message)) throw e;
  }

  await supabase.from('health_links').upsert(
    { member_id: memberId, device_name: deviceName(), last_sync_at: now.toISOString() },
    { onConflict: 'member_id,device_name' },
  );
  return { days: new Set(all.map((r) => r.day)).size, workouts: workoutCount };
}

// ---------- unit helpers ----------
function toMinutes(v: number, unit: string) { return unit === 'min' ? v : unit === 'hr' ? v * 60 : v / 60; }
function toKcal(v: number, unit: string) { return /kJ/i.test(unit) ? v / 4.184 : v; } // kcal and Cal are the same
function toKm(v: number, unit: string) { return unit === 'km' ? v : unit === 'mi' ? v * 1.60934 : unit === 'm' ? v / 1000 : v; }
function activityName(h: HK, n: number): string {
  const raw = (h as unknown as { WorkoutActivityType?: Record<number, string> }).WorkoutActivityType?.[n];
  if (!raw) return 'Workout';
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}
