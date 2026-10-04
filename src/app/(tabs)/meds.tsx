import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { DoseActions, MedLine, PersonPanel } from '@/components/meds';
import { Button, ErrorText, H, Muted, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePalette } from '@/hooks/use-palette';
import { listMembers } from '@/lib/api';
import { useFamily } from '@/lib/family';
import { fmtDate } from '@/lib/format';
import { syncMedReminders } from '@/lib/med-reminders';
import { buildDay, dosesBetween, listSchedules, markDose, panelColors, time12, undoDose, type Dose, type MedSchedule } from '@/lib/meds';
import { supabase } from '@/lib/supabase';
import type { Member, MemberRole } from '@/lib/types';

const dayIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function Medicines() {
  const c = usePalette();
  const dark = useColorScheme() === 'dark';
  const { me, nameOf } = useFamily();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Record<string, MemberRole>>({});
  const [schedules, setSchedules] = useState<MedSchedule[]>([]);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [offset, setOffset] = useState(0); // 0 = today, -1 = yesterday
  const [who, setWho] = useState<string>('all');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(0);

  const day = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(0, 0, 0, 0); return d; }, [offset]);

  const load = useCallback(async () => {
    try {
      const [ms, ss] = await Promise.all([listMembers(), listSchedules()]);
      const rs = await Promise.all(ms.map((m) => supabase.rpc('member_role', { mid: m.id })));
      const since = new Date(); since.setDate(since.getDate() - 8);
      setMembers(ms);
      setRoles(Object.fromEntries(ms.map((m, i) => [m.id, rs[i].data as MemberRole])));
      setSchedules(ss);
      setDoses(await dosesBetween(since, new Date()));
      setNow(Date.now());
      setErr('');
      if (me) syncMedReminders(ss, ms, me.id).catch(() => {});
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load medicines.'); }
    setLoaded(true);
  }, [me]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  // someone else in the family marked a dose
  useEffect(() => {
    const ch = supabase.channel('doses').on('postgres_changes', { event: '*', schema: 'public', table: 'medication_doses' }, () => { load(); }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const slots = useMemo(() => buildDay(day, schedules, members, doses).filter((s) => who === 'all' || s.member.id === who), [day, schedules, members, doses, who]);
  const asNeeded = schedules.filter((s) => s.active && s.frequency === 'as_needed' && (who === 'all' || s.member_id === who));
  const taken = slots.filter((s) => s.dose?.status === 'taken').length;
  const missed = slots.filter((s) => s.dose?.status === 'missed').length;
  const open = slots.length - taken - missed;
  const peopleWithMeds = members.filter((m) => schedules.some((s) => s.member_id === m.id && s.active));
  const label = (m: Member) => (m.user_id === me?.id ? 'You' : m.first_name);

  async function mark(key: string, s: MedSchedule, at: Date | null, status: 'taken' | 'missed') {
    setBusy(key); setErr('');
    try { await markDose(s, at, status); await load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Not saved. Try again.'); }
    setBusy('');
  }
  async function undo(id: string) {
    try { await undoDose(id); await load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Not saved.'); }
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: Space.lg, gap: Space.md, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button small title="‹ Earlier" onPress={() => setOffset((o) => Math.max(-7, o - 1))} disabled={offset <= -7} />
        <View style={{ alignItems: 'center' }}>
          <H>{offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : day.toLocaleDateString('en-US', { weekday: 'long' })}</H>
          <Muted style={{ fontSize: 13 }}>{fmtDate(dayIso(day))}</Muted>
        </View>
        <Button small title="Later ›" onPress={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} />
      </View>

      {slots.length ? (
        <T style={{ textAlign: 'center' }}>
          <T style={{ fontWeight: '700', color: c.good }}>{taken} taken</T>{missed ? <T style={{ fontWeight: '700', color: c.bad }}> · {missed} missed</T> : null}{open ? ` · ${open} to go` : ''}
        </T>
      ) : null}

      {peopleWithMeds.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm }}>
          {[{ id: 'all', name: 'Everyone', color: null as string | null }, ...peopleWithMeds.map((m) => ({ id: m.id, name: label(m), color: m.color }))].map((p) => {
            const on = who === p.id;
            const accent = p.color ? panelColors(p.color, dark)[1] : c.muted;
            return (
              <Pressable key={p.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setWho(p.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                {p.color ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent }} /> : null}
                <T style={{ fontSize: 14, fontWeight: '600' }}>{p.name}</T>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <ErrorText>{err}</ErrorText>

      {loaded && !schedules.length ? (
        <View style={{ gap: Space.sm, paddingVertical: Space.lg }}>
          <H>No medicine reminders yet</H>
          <Muted>Add each medicine with its strength, how much to take, pill color and times. Everyone gets their own color, and each dose can be marked Taken or Missed with one tap, here or right from the reminder.</Muted>
        </View>
      ) : null}
      {loaded && schedules.length > 0 && !slots.length && !asNeeded.length ? <Muted>Nothing scheduled {offset === 0 ? 'today' : 'this day'}.</Muted> : null}

      {slots.map((s, i) => {
        const header = i === 0 || slots[i - 1].time !== s.time ? s.time : null;
        const canMark = roles[s.member.id] === 'manage' || roles[s.member.id] === 'edit';
        return (
          <View key={s.key} style={{ gap: Space.sm }}>
            {header ? <Muted style={{ fontWeight: '700', letterSpacing: 0.5, marginTop: Space.sm }}>{time12(header)}</Muted> : null}
            <PersonPanel member={s.member} label={label(s.member)}>
              <MedLine s={s.schedule} />
              <DoseActions
                dose={s.dose} due={s.at} now={now} canMark={canMark} busy={busy === s.key} whoLogged={nameOf}
                onMark={(st) => mark(s.key, s.schedule, s.at, st)}
                onUndo={() => s.dose && undo(s.dose.id)}
              />
            </PersonPanel>
          </View>
        );
      })}

      {asNeeded.length ? (
        <>
          <Muted style={{ fontWeight: '700', letterSpacing: 0.5, marginTop: Space.sm }}>WHEN NEEDED</Muted>
          {asNeeded.map((s) => {
            const m = members.find((x) => x.id === s.member_id);
            if (!m) return null;
            const last = doses.find((d) => d.schedule_id === s.id && d.status === 'taken');
            const canMark = roles[m.id] === 'manage' || roles[m.id] === 'edit';
            return (
              <PersonPanel key={s.id} member={m} label={label(m)}>
                <MedLine s={s} />
                <Muted style={{ fontSize: 13 }}>{last ? `Last taken ${new Date(last.logged_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not taken recently'}</Muted>
                {canMark ? <Button kind="primary" title="Took a dose now" busy={busy === s.id} onPress={() => mark(s.id, s, null, 'taken')} /> : null}
              </PersonPanel>
            );
          })}
        </>
      ) : null}

      <View style={{ flexDirection: 'row', gap: Space.sm, marginTop: Space.md }}>
        <Button kind="primary" title="Add medicine" onPress={() => router.push('/meds/edit')} style={{ flex: 1 }} />
        <Button title="All medicines" onPress={() => router.push('/meds/manage')} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}
