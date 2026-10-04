import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { MedLine, PersonPanel } from '@/components/meds';
import { Badge, Button, ErrorText, Muted, Row, Screen, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { listMembers, type MemberSummary } from '@/lib/api';
import { useFamily } from '@/lib/family';
import { fmtDate } from '@/lib/format';
import { remindsHere, setRemindsHere, syncMedReminders } from '@/lib/med-reminders';
import { adherence, deleteSchedule, dosesBetween, listSchedules, saveSchedule, time12, type Dose, type MedSchedule } from '@/lib/meds';
import { supabase } from '@/lib/supabase';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ManageMedicines() {
  const c = usePalette();
  const { me } = useFamily();
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [canEdit, setCanEdit] = useState<Record<string, boolean>>({});
  const [schedules, setSchedules] = useState<MedSchedule[]>([]);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [, setTick] = useState(0);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [ms, ss] = await Promise.all([listMembers(), listSchedules()]);
      const rs = await Promise.all(ms.map((m) => supabase.rpc('member_role', { mid: m.id })));
      const since = new Date(); since.setDate(since.getDate() - 30);
      setMembers(ms); setSchedules(ss);
      setCanEdit(Object.fromEntries(ms.map((m, i) => [m.id, rs[i].data === 'manage' || rs[i].data === 'edit'])));
      setDoses(await dosesBetween(since, new Date()));
      if (me) syncMedReminders(ss, ms, me.id).catch(() => {});
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load medicines.'); }
  }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resync = () => { if (me) syncMedReminders(schedules, members, me.id).catch(() => {}); setTick((t) => t + 1); };

  return (
    <Screen>
      <ErrorText>{err}</ErrorText>
      {members.filter((m) => schedules.some((s) => s.member_id === m.id)).map((m) => (
        <PersonPanel key={m.id} member={m} label={m.user_id === me?.id ? 'You' : m.first_name}>
          {schedules.filter((s) => s.member_id === m.id).map((s) => {
            const a7 = adherence(s, doses, 7), a30 = adherence(s, doses, 30);
            const missed = doses.filter((d) => d.schedule_id === s.id && d.status === 'missed').length;
            const ringsHere = remindsHere(s.id, m.user_id === me?.id || m.user_id === null);
            const when = s.frequency === 'as_needed' ? 'When needed'
              : `${s.frequency === 'days' ? (s.days_of_week ?? []).map((d) => DAYS[d - 1]).join(', ') : 'Every day'} at ${s.times.map(time12).join(', ')}`;
            return (
              <View key={s.id} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: Space.sm, gap: 6, opacity: s.active ? 1 : 0.6 }}>
                <MedLine s={s} />
                <T style={{ fontSize: 15 }}>{when}</T>
                <Muted style={{ fontSize: 13 }}>From {fmtDate(s.start_date)}{s.end_date ? ` to ${fmtDate(s.end_date)}` : ''}</Muted>
                <Row>
                  {!s.active ? <Badge text="Paused" /> : null}
                  {a7 ? <Badge tone={a7.taken === a7.due ? 'good' : undefined} text={`Last 7 days: ${a7.taken} of ${a7.due} taken`} /> : null}
                  {a30 && a30.due !== a7?.due ? <Badge text={`30 days: ${Math.round((a30.taken / a30.due) * 100)}%`} /> : null}
                  {missed ? <Badge tone="bad" text={`${missed} marked missed`} /> : null}
                </Row>
                {s.frequency !== 'as_needed' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
                    <Switch value={ringsHere} onValueChange={(v) => { setRemindsHere(s.id, v); resync(); }} trackColor={{ true: c.accent }} accessibilityLabel={`Remind on this iPhone for ${s.name}`} />
                    <Muted style={{ fontSize: 13 }}>Remind on this iPhone</Muted>
                  </View>
                ) : null}
                {canEdit[m.id] ? (
                  <Row>
                    <Button small title="Edit" onPress={() => router.push({ pathname: '/meds/edit', params: { id: s.id } })} />
                    <Button small title={s.active ? 'Pause' : 'Resume'} onPress={async () => { await saveSchedule({ ...s, active: !s.active }); await load(); }} />
                    <Button small kind="danger" title="Delete" onPress={() => Alert.alert(`Delete ${s.name}?`, 'Its reminders and Taken/Missed history are removed.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteSchedule(s.id); await load(); } },
                    ])} />
                  </Row>
                ) : null}
              </View>
            );
          })}
        </PersonPanel>
      ))}
      {!schedules.length ? <Muted>No medicines yet.</Muted> : null}
      <Button kind="primary" title="Add medicine" onPress={() => router.push('/meds/edit')} />
      <Muted style={{ fontSize: 13 }}>Reminders work on each phone separately. Your daughter gets her own on her phone; switch &quot;Remind on this iPhone&quot; on to get hers too.</Muted>
    </Screen>
  );
}
