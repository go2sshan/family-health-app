import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { DailyBars, type Point } from '@/components/daily-bars';
import { Button, Card, ErrorText, H, Muted, Row, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import {
  appleHealthAvailable, connectAppleHealth, deviceName, disconnectAppleHealth, linkedMemberId, syncAppleHealth,
} from '@/lib/apple-health';
import { fmtDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Member, MemberDetail } from '@/lib/types';

type DayRow = { day: string; metric: string; value: number };
type Workout = { id: string; started_at: string; activity: string; minutes: number; kcal: number | null; km: number | null };

const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const n1 = (v: number) => v.toFixed(1);

export function HealthTab({ d, reload }: { d: MemberDetail; reload: () => void }) {
  const m = d.member;
  const [rows, setRows] = useState<DayRow[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [linked, setLinked] = useState(linkedMemberId());
  const [weekAgo, setWeekAgo] = useState('');
  const available = appleHealthAvailable();
  const isLinkedHere = linked === m.id;

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const [h, w, l] = await Promise.all([
      supabase.from('health_daily').select('day, metric, value').eq('member_id', m.id).gte('day', since).order('day'),
      supabase.from('workouts').select('id, started_at, activity, minutes, kcal, km').eq('member_id', m.id).order('started_at', { ascending: false }).limit(10),
      supabase.from('health_links').select('device_name, last_sync_at').eq('member_id', m.id).order('last_sync_at', { ascending: false }).limit(1),
    ]);
    if (h.error) { setErr(h.error.message); return; }
    setRows((h.data ?? []) as DayRow[]);
    setWeekAgo(new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
    setWorkouts((w.data ?? []) as Workout[]);
    const link = l.data?.[0];
    setLastSync(link?.last_sync_at ? `${fmtDate(link.last_sync_at.slice(0, 10))} from ${link.device_name}` : null);
  }, [m.id]);

  const lastAuto = useRef(0);

  /** Pass the member to connect for the first time, or just their id to update. */
  const sync = useCallback(async (target: Member | string) => {
    const first = typeof target !== 'string';
    setBusy(true); setErr(''); setNote('');
    try {
      const r = first ? await connectAppleHealth(target) : await syncAppleHealth(target);
      setLinked(linkedMemberId());
      setNote(`Updated ${r.days} day${r.days === 1 ? '' : 's'} and ${r.workouts} workout${r.workouts === 1 ? '' : 's'}.`);
      await load();
      if (first) reload(); // blood group, sex or birthday may have been filled in
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read Apple Health. Try again.');
    }
    setBusy(false);
  }, [load, reload]);

  useFocusEffect(useCallback(() => {
    load();
    // Quietly catch up when the page opens, at most every 10 minutes.
    if (available && linkedMemberId() === m.id && Date.now() - lastAuto.current > 10 * 60_000) {
      lastAuto.current = Date.now();
      sync(m.id);
    }
  }, [load, sync, available, m.id]));

  const series = (metric: string): Point[] => rows.filter((r) => r.metric === metric).map((r) => ({ day: r.day, value: Number(r.value) }));
  const latest = (metric: string) => series(metric).at(-1);
  const avg7 = (metric: string) => {
    const s = series(metric).filter((p) => p.day >= weekAgo);
    return s.length ? s.reduce((a, p) => a + p.value, 0) / s.length : null;
  };

  const sys = latest('bp_sys'), dia = latest('bp_dia');
  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: 'Steps, 7-day average', value: avg7('steps') != null ? n0(avg7('steps')!) : '—' },
    { label: 'Resting heart rate', value: latest('resting_hr') ? `${n0(latest('resting_hr')!.value)} bpm` : '—', sub: latest('resting_hr') ? fmtDate(latest('resting_hr')!.day) : undefined },
    { label: 'Sleep, 7-day average', value: avg7('sleep_hr') != null ? `${n1(avg7('sleep_hr')!)} h` : '—' },
    { label: 'Blood oxygen', value: latest('spo2_pct') ? `${n0(latest('spo2_pct')!.value)}%` : '—', sub: latest('spo2_pct') ? fmtDate(latest('spo2_pct')!.day) : undefined },
    { label: 'Weight', value: latest('weight_kg') ? `${n0(latest('weight_kg')!.value * 2.20462)} lb` : '—', sub: latest('weight_kg') ? `${n1(latest('weight_kg')!.value)} kg · ${fmtDate(latest('weight_kg')!.day)}` : undefined },
    { label: 'Blood pressure', value: sys && dia ? `${n0(sys.value)}/${n0(dia.value)}` : '—', sub: sys ? fmtDate(sys.day) : undefined },
    { label: 'Heart rate variability', value: latest('hrv_ms') ? `${n0(latest('hrv_ms')!.value)} ms` : '—' },
    { label: 'Blood glucose', value: latest('glucose_mgdl') ? `${n0(latest('glucose_mgdl')!.value)} mg/dL` : '—', sub: latest('glucose_mgdl') ? fmtDate(latest('glucose_mgdl')!.day) : undefined },
  ].filter((t) => t.value !== '—');

  return (
    <View style={{ gap: Space.md }}>
      <Card>
        <H>Apple Health and Apple Watch</H>
        {d.role !== 'manage' ? (
          <Muted>Only {m.first_name} can connect Apple Health, from their own iPhone. You see what they&apos;ve shared.</Muted>
        ) : !available ? (
          <Muted>Apple Health connects in the installed iPhone app (TestFlight). It isn&apos;t available in Expo Go or on Android.</Muted>
        ) : isLinkedHere ? (
          <>
            <Muted>This iPhone ({deviceName()}) shares its Apple Health data with {m.first_name}&apos;s page. It updates each time you open this page.</Muted>
            <Row>
              <Button kind="primary" title="Update now" busy={busy} onPress={() => sync(m.id)} />
              <Button title="Stop sharing from this iPhone" onPress={() => Alert.alert('Stop sharing?', `New Apple Health data from this iPhone won't be added to ${m.first_name}'s page. Data already saved stays.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Stop sharing', style: 'destructive', onPress: () => { disconnectAppleHealth(); setLinked(null); } },
              ])} />
            </Row>
          </>
        ) : (
          <>
            <Muted>
              {linked
                ? 'This iPhone already shares Apple Health with another family member. Connecting here moves it to this person.'
                : `Use this on ${m.first_name}'s own iPhone. Steps, heart rate, sleep, blood oxygen, weight, blood pressure and workouts from the phone and Apple Watch are saved to this page.`}
            </Muted>
            <Button kind="primary" title="Connect Apple Health" busy={busy} onPress={() => sync(m)} />
            <Muted style={{ fontSize: 13 }}>iPhone will ask which data to share. You can change that anytime in Settings › Health › Data Access.</Muted>
          </>
        )}
        {lastSync ? <Muted style={{ fontSize: 13 }}>Last updated {lastSync}</Muted> : null}
        {note ? <T style={{ fontSize: 14 }}>{note}</T> : null}
        <ErrorText>{err}</ErrorText>
      </Card>

      {tiles.length ? (
        <Row>
          {tiles.map((t) => (
            <Card key={t.label} style={{ flexGrow: 1, flexBasis: 150, gap: 2 }}>
              <Muted style={{ fontSize: 13 }}>{t.label}</Muted>
              <T style={{ fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{t.value}</T>
              {t.sub ? <Muted style={{ fontSize: 12 }}>{t.sub}</Muted> : null}
            </Card>
          ))}
        </Row>
      ) : null}

      {rows.length ? (
        <>
          <Card><H style={{ fontSize: 16 }}>Steps</H><DailyBars label="Steps" points={series('steps')} format={(v) => `${n0(v)} steps`} /></Card>
          <Card><H style={{ fontSize: 16 }}>Resting heart rate</H><DailyBars label="Resting heart rate" points={series('resting_hr')} format={(v) => `${n0(v)} bpm`} /></Card>
          <Card><H style={{ fontSize: 16 }}>Sleep</H><DailyBars label="Sleep" points={series('sleep_hr')} format={(v) => `${n1(v)} hours`} /></Card>
          <Card><H style={{ fontSize: 16 }}>Exercise</H><DailyBars label="Exercise minutes" points={series('exercise_min')} format={(v) => `${n0(v)} min`} /></Card>
        </>
      ) : null}

      {workouts.length ? (
        <Card>
          <H style={{ fontSize: 16 }}>Recent workouts</H>
          {workouts.map((w) => (
            <Row key={w.id} style={{ justifyContent: 'space-between' }}>
              <T style={{ flexShrink: 1 }}>{w.activity}</T>
              <Muted>{[fmtDate(w.started_at.slice(0, 10)), `${n0(w.minutes)} min`, w.km ? `${n1(w.km * 0.621371)} mi` : null, w.kcal ? `${n0(w.kcal)} kcal` : null].filter(Boolean).join(' · ')}</Muted>
            </Row>
          ))}
        </Card>
      ) : null}

      <Muted style={{ fontSize: 13 }}>Readings are for your records and to show your doctor. They aren&apos;t a diagnosis.</Muted>
    </View>
  );
}
