import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';

import { PillSwatch } from '@/components/meds';
import { Button, Choice, ErrorText, Field, H, Label, Muted, Row, Screen, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { getMemberDetail, listMembers, type MemberSummary } from '@/lib/api';
import { useFamily } from '@/lib/family';
import { isIsoDate, num, todayIso } from '@/lib/format';
import { remindsHere, setRemindsHere } from '@/lib/med-reminders';
import { FORMS, PILL_COLORS, isTime, listSchedules, saveSchedule, time12, type Frequency, type MedForm, type MedSchedule } from '@/lib/meds';
import { supabase } from '@/lib/supabase';
import type { HealthRecord } from '@/lib/types';

const PRESET_TIMES = ['06:00', '07:00', '08:00', '09:00', '12:00', '13:00', '14:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const QTY = ['0.5', '1', '1.5', '2', '3'];

export default function EditMedicine() {
  const { id, memberId } = useLocalSearchParams<{ id?: string; memberId?: string }>();
  const [members, setMembers] = useState<MemberSummary[] | null>(null);
  const [existing, setExisting] = useState<MedSchedule | null | undefined>(id ? undefined : null);

  useEffect(() => {
    let live = true;
    (async () => {
      const ms = await listMembers();
      const editable = [];
      for (const m of ms) {
        const { data } = await supabase.rpc('member_role', { mid: m.id });
        if (data === 'manage' || data === 'edit') editable.push(m);
      }
      const ex = id ? (await listSchedules()).find((s) => s.id === id) ?? null : null;
      if (live) { setMembers(editable); setExisting(ex); }
    })();
    return () => { live = false; };
  }, [id]);

  if (!members || existing === undefined) return <View style={{ padding: 40 }}><ActivityIndicator /></View>;
  if (!members.length) return <Screen><Muted>You can add medicines for yourself and for profiles you manage or can edit.</Muted></Screen>;
  return <Form members={members} existing={existing} initialMember={memberId ?? existing?.member_id ?? members[0].id} />;
}

function Form({ members, existing, initialMember }: { members: MemberSummary[]; existing: MedSchedule | null; initialMember: string }) {
  const c = usePalette();
  const { me } = useFamily();
  const [memberId, setMemberId] = useState(initialMember);
  const [name, setName] = useState(existing?.name ?? '');
  const [strength, setStrength] = useState(existing?.strength ?? '');
  const [form, setForm] = useState<MedForm>(existing?.form ?? 'tablet');
  const [qty, setQty] = useState(existing ? String(Number(existing.dose_qty)) : '1');
  const [unit, setUnit] = useState(existing?.dose_unit ?? 'tablet');
  const [pill, setPill] = useState<string | null>(existing?.pill_color ?? null);
  const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  const [freq, setFreq] = useState<Frequency>(existing?.frequency ?? 'daily');
  const [days, setDays] = useState<number[]>(existing?.days_of_week ?? [2, 3, 4, 5, 6]);
  const [times, setTimes] = useState<string[]>(existing?.times ?? ['08:00']);
  const [custom, setCustom] = useState('');
  const [start, setStart] = useState(existing?.start_date ?? todayIso());
  const [end, setEnd] = useState(existing?.end_date ?? '');
  const member = members.find((m) => m.id === memberId);
  const [here, setHere] = useState(existing ? remindsHere(existing.id, member?.user_id === me?.id || member?.user_id === null) : member?.user_id === me?.id || member?.user_id === null);
  const [fromRecords, setFromRecords] = useState<HealthRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // ongoing medicines already in this person's history, to fill in with one tap
  useEffect(() => {
    let live = true;
    getMemberDetail(memberId).then((d) => { if (live) setFromRecords(d.records.filter((r) => r.kind === 'medicine' && r.ongoing)); }).catch(() => {});
    return () => { live = false; };
  }, [memberId]);

  const toggleTime = (t: string) => setTimes((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t].sort()));

  function fillFromRecord(r: HealthRecord) {
    const m = r.title.match(/^(.*?)(\s+\d[\d.]*\s*(mg|mcg|g|ml|iu|units?)\b.*)?$/i);
    setName((m?.[1] ?? r.title).trim());
    if (m?.[2]) setStrength(m[2].trim().replace(/\s*\(.*\)$/, ''));
    if (r.notes) setInstructions(r.notes.slice(0, 120));
  }

  async function save() {
    setErr('');
    const q = num(qty);
    if (!name.trim()) { setErr('Add the medicine name.'); return; }
    if (q == null || q <= 0) { setErr('Add how much to take, for example 1.'); return; }
    if (freq !== 'as_needed' && !times.length) { setErr('Pick at least one time.'); return; }
    if (freq === 'days' && !days.length) { setErr('Pick at least one day.'); return; }
    if (!isIsoDate(start) || (end && !isIsoDate(end))) { setErr('Write dates as YYYY-MM-DD.'); return; }
    if (end && end < start) { setErr('The end date is before the start date.'); return; }
    setBusy(true);
    try {
      const saved = await saveSchedule({
        id: existing?.id, member_id: memberId, record_id: existing?.record_id ?? null,
        name: name.trim(), strength: strength.trim() || null, form, dose_qty: q, dose_unit: unit.trim() || 'dose',
        pill_color: pill, instructions: instructions.trim() || null, frequency: freq,
        days_of_week: freq === 'days' ? [...days].sort() : null, times: freq === 'as_needed' ? [] : times,
        start_date: start, end_date: end || null, active: existing?.active ?? true,
      });
      setRemindsHere(saved.id, here);
      router.back();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); setBusy(false); }
  }

  return (
    <Screen>
      {!existing ? (
        <Choice label="For" options={members.map((m) => ({ value: m.id, label: m.user_id === me?.id ? 'Me' : m.first_name }))} value={memberId} onChange={setMemberId} />
      ) : <H>{member?.user_id === me?.id ? 'Your medicine' : `${member?.first_name}'s medicine`}</H>}

      {!existing && fromRecords.length ? (
        <View style={{ gap: 6 }}>
          <Label>From their records</Label>
          <Row>{fromRecords.slice(0, 8).map((r) => <Button key={r.id} small title={r.title} onPress={() => fillFromRecord(r)} />)}</Row>
        </View>
      ) : null}

      <Row>
        <Field label="Medicine name" value={name} onChangeText={setName} placeholder="e.g. Metformin, Glycomet" />
        <Field label="Strength" value={strength} onChangeText={setStrength} placeholder="e.g. 500 mg" />
      </Row>
      <Choice label="Type" options={FORMS.map((f) => ({ value: f.value, label: f.label }))} value={form} onChange={(f) => { setForm(f); setUnit(FORMS.find((x) => x.value === f)?.unit ?? 'dose'); }} />
      <View style={{ gap: 6 }}>
        <Label>How much each time</Label>
        <Row>
          {QTY.map((q) => (
            <Pressable key={q} accessibilityRole="radio" accessibilityState={{ selected: qty === q }} onPress={() => setQty(q)}
              style={{ borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, borderColor: qty === q ? c.accent : c.line, backgroundColor: qty === q ? c.accentSoft : c.surface }}>
              <T style={{ fontWeight: '600' }}>{q === '0.5' ? '½' : q === '1.5' ? '1½' : q}</T>
            </Pressable>
          ))}
          <Field label="Other amount" value={QTY.includes(qty) ? '' : qty} onChangeText={setQty} keyboardType="decimal-pad" style={{ flexBasis: 100 }} />
          <Field label="Unit" value={unit} onChangeText={setUnit} style={{ flexBasis: 100 }} />
        </Row>
      </View>

      <View style={{ gap: 6 }}>
        <Label>Pill color (helps you pick the right one)</Label>
        <Row>
          {PILL_COLORS.map((p) => (
            <Pressable key={p.name} accessibilityRole="radio" accessibilityLabel={p.name} accessibilityState={{ selected: pill === p.name }}
              onPress={() => setPill(pill === p.name ? null : p.name)}
              style={{ alignItems: 'center', gap: 4, padding: 6, borderRadius: 10, borderWidth: 2, borderColor: pill === p.name ? c.accent : 'transparent' }}>
              <PillSwatch color={p.name} size={30} />
              <Muted style={{ fontSize: 11 }}>{p.name}</Muted>
            </Pressable>
          ))}
        </Row>
      </View>

      <Field label="Instructions" value={instructions} onChangeText={setInstructions} placeholder="e.g. after breakfast, before bed, with water" />

      <Choice label="How often" options={[{ value: 'daily', label: 'Every day' }, { value: 'days', label: 'Some days' }, { value: 'as_needed', label: 'Only when needed' }] as const} value={freq} onChange={setFreq} />
      {freq === 'days' ? (
        <Row>
          {DAYS.map((d, i) => {
            const n = i + 1, on = days.includes(n);
            return (
              <Pressable key={d} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setDays((s) => (on ? s.filter((x) => x !== n) : [...s, n]))}
                style={{ borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface }}>
                <T style={{ fontWeight: '600', fontSize: 14 }}>{d}</T>
              </Pressable>
            );
          })}
        </Row>
      ) : null}
      {freq !== 'as_needed' ? (
        <View style={{ gap: 6 }}>
          <Label>Times</Label>
          <Row>
            {[...new Set([...PRESET_TIMES, ...times])].sort().map((t) => {
              const on = times.includes(t);
              return (
                <Pressable key={t} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggleTime(t)}
                  style={{ borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface }}>
                  <T style={{ fontWeight: on ? '700' : '500', fontSize: 14 }}>{time12(t)}</T>
                </Pressable>
              );
            })}
          </Row>
          <Row>
            <Field label="Another time (24-hour, e.g. 07:30)" value={custom} onChangeText={setCustom} keyboardType="numbers-and-punctuation" maxLength={5} />
            <Button small title="Add time" onPress={() => {
              const t = custom.trim().padStart(5, '0');
              if (!isTime(t)) { setErr('Write the time as HH:MM, for example 07:30 or 21:15.'); return; }
              setErr(''); if (!times.includes(t)) toggleTime(t); setCustom('');
            }} />
          </Row>
        </View>
      ) : null}

      <Row>
        <Field label="Start (YYYY-MM-DD)" value={start} onChangeText={setStart} keyboardType="numbers-and-punctuation" />
        <Field label="End, if a short course" value={end} onChangeText={setEnd} placeholder="optional" keyboardType="numbers-and-punctuation" />
      </Row>

      {freq !== 'as_needed' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.md, paddingVertical: Space.sm }}>
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '600' }}>Remind on this iPhone</T>
            <Muted style={{ fontSize: 13 }}>Reminders have Taken and Missed buttons. Turn this on to remind you about your daughter&apos;s medicine too.</Muted>
          </View>
          <Switch value={here} onValueChange={setHere} trackColor={{ true: c.accent }} accessibilityLabel="Remind on this iPhone" />
        </View>
      ) : null}

      <ErrorText>{err}</ErrorText>
      <Button kind="primary" title={existing ? 'Save changes' : 'Add medicine'} busy={busy} onPress={save} />
    </Screen>
  );
}
