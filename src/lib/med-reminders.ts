/**
 * Medicine reminders on this iPhone.
 *
 * Each phone decides which schedules ring on it: by default your own medicines and the
 * profiles you manage (a child without a phone); you can switch any schedule on or off.
 * Reminder notifications carry "Taken" and "Missed" buttons that record the answer without
 * opening the app.
 */
import * as Notifications from 'expo-notifications';

import { fmtDate } from './format';
import { doseText, markDose, type MedSchedule } from './meds';
import type { Member } from './types';

export const MED_CATEGORY = 'med-reminder';
const KEY = 'medRemindHere';

type Prefs = Record<string, boolean>;
function prefs(): Prefs {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Prefs; } catch { return {}; }
}
export function remindsHere(scheduleId: string, fallback: boolean): boolean {
  const p = prefs();
  return scheduleId in p ? p[scheduleId] : fallback;
}
export function setRemindsHere(scheduleId: string, on: boolean) {
  const p = prefs(); p[scheduleId] = on;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full */ }
}

let categoryReady = false;
async function ensureCategory() {
  if (categoryReady) return;
  await Notifications.setNotificationCategoryAsync(MED_CATEGORY, [
    { identifier: 'TAKEN', buttonTitle: 'Taken', options: { opensAppToForeground: false } },
    { identifier: 'MISSED', buttonTitle: 'Missed', options: { opensAppToForeground: false, isDestructive: true } },
  ]);
  categoryReady = true;
}

/** Re-create this phone's medicine reminders from the current schedules. */
export async function syncMedReminders(schedules: MedSchedule[], members: Member[], myUserId: string) {
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  await ensureCategory();

  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(existing
    .filter((n) => (n.content.data as { kind?: string } | undefined)?.kind === 'med')
    .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));

  const byId = new Map(members.map((m) => [m.id, m]));
  const today = new Date();
  let count = 0;
  for (const s of schedules) {
    const m = byId.get(s.member_id);
    if (!m || !s.active || s.frequency === 'as_needed') continue;
    if (s.end_date && s.end_date < fmtIso(today)) continue;
    if (!remindsHere(s.id, m.user_id === myUserId || m.user_id === null)) continue;

    const who = m.user_id === myUserId ? 'Your medicine' : `${m.first_name}'s medicine`;
    const content = {
      title: `${who}: ${s.name}${s.strength ? ` ${s.strength}` : ''}`,
      body: [doseText(s), s.pill_color ? `${s.pill_color} ${s.form}` : null, s.instructions].filter(Boolean).join(' · '),
      sound: 'default',
      categoryIdentifier: MED_CATEGORY,
      interruptionLevel: 'timeSensitive' as const,
    };
    const days = s.frequency === 'days' ? s.days_of_week ?? [] : null;
    for (const t of s.times) {
      const [hour, minute] = t.split(':').map(Number);
      const data = { kind: 'med', scheduleId: s.id, memberId: s.member_id, time: t };
      if (days) {
        for (const weekday of days) {
          if (count++ >= 60) break; // iOS keeps 64 pending reminders per app
          await Notifications.scheduleNotificationAsync({ content: { ...content, data }, trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute } });
        }
      } else {
        if (count++ >= 60) break;
        await Notifications.scheduleNotificationAsync({ content: { ...content, data }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute } });
      }
    }
  }
  return count;
}

function fmtIso(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

/** Handle the Taken / Missed buttons on a reminder. Returns true when it was a medicine reminder. */
export async function handleMedResponse(r: Notifications.NotificationResponse): Promise<boolean> {
  const data = r.notification.request.content.data as { kind?: string; scheduleId?: string; memberId?: string; time?: string } | undefined;
  if (data?.kind !== 'med' || !data.scheduleId || !data.memberId || !data.time) return false;
  if (r.actionIdentifier !== 'TAKEN' && r.actionIdentifier !== 'MISSED') return true;
  // the same response is replayed when the app launches; record each tap only once
  const tapId = `${r.notification.request.identifier}|${r.notification.date}|${r.actionIdentifier}`;
  let done: string[] = [];
  try { done = JSON.parse(localStorage.getItem('medHandled') ?? '[]') as string[]; } catch { /* first run */ }
  if (done.includes(tapId)) return true;
  try { localStorage.setItem('medHandled', JSON.stringify([...done.slice(-49), tapId])); } catch { /* storage full */ }
  const fired = new Date(r.notification.date);
  const [h, m] = data.time.split(':').map(Number);
  const at = new Date(fired); at.setHours(h, m, 0, 0);
  try {
    await markDose({ id: data.scheduleId, member_id: data.memberId }, at, r.actionIdentifier === 'TAKEN' ? 'taken' : 'missed');
  } catch {
    // offline: the reminder stays unanswered in the Medicines screen
  }
  return true;
}

export const reminderDayLabel = (d: Date) => fmtDate(fmtIso(d));
