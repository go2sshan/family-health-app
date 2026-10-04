import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { EmergencyCard } from '@/components/emergency-card';
import { Button, Card, Choice, ErrorText, Field, H, Muted, MonoText, Row, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { addRow, deleteMember, deleteRow, updateMember, uploadJpeg } from '@/lib/api';
import { bmi, cmToFtIn, fmtDate, isIsoDate, kgToLb, num, power, todayIso } from '@/lib/format';
import { pickPhotos, takePhoto } from '@/lib/images';
import type { MemberDetail } from '@/lib/types';

function Del({ onPress }: { onPress: () => void }) {
  return <Button small kind="danger" title="Delete" onPress={onPress} />;
}

export function AboutTab({ d, reload }: { d: MemberDetail; reload: () => void }) {
  const c = usePalette();
  const m = d.member;
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  async function run(key: string, fn: () => Promise<void>) {
    setErr(''); setBusy(key);
    try { await fn(); reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy('');
  }

  // ---- photo ----
  async function setPhoto(fromCamera: boolean) {
    await run('photo', async () => {
      const shot = fromCamera ? await takePhoto(600) : (await pickPhotos(1, 600))[0];
      if (!shot) return;
      const path = await uploadJpeg(m.id, shot.base64);
      await updateMember(m.id, { photo_path: path });
    });
  }

  // ---- allergies ----
  const [aKind, setAKind] = useState<'medicine' | 'food' | 'other'>('medicine');
  const [aName, setAName] = useState('');
  const [aReact, setAReact] = useState('');
  const [aSev, setASev] = useState<'mild' | 'moderate' | 'severe'>('moderate');

  // ---- measurements ----
  const [units, setUnits] = useState<'us' | 'metric'>('us');
  const [msDate, setMsDate] = useState(todayIso());
  const [ft, setFt] = useState(''); const [inch, setInch] = useState(''); const [cm, setCm] = useState('');
  const [wt, setWt] = useState('');

  // ---- eyes ----
  const [eDate, setEDate] = useState(todayIso());
  const [eye, setEye] = useState({ rs: '', rc: '', ra: '', ls: '', lc: '', la: '', add: '', note: '' });

  // ---- contacts ----
  const [ctName, setCtName] = useState(''); const [ctRel, setCtRel] = useState(''); const [ctPhone, setCtPhone] = useState('');

  const asc = [...d.measurements].reverse();
  let lastCm: number | null = null;
  const bmiByRow: Record<string, string> = {};
  for (const x of asc) { if (x.height_cm) lastCm = x.height_cm; bmiByRow[x.id] = x.weight_kg && lastCm ? bmi(x.weight_kg, lastCm).toFixed(1) : '—'; }

  return (
    <View style={{ gap: Space.md }}>
      <EmergencyCard d={d} />
      <Button kind="primary" title="Show to doctor (large print)" onPress={() => router.push({ pathname: '/member/[id]/emergency', params: { id: m.id } })} />
      <Row>
        <Button title="Take profile photo" busy={busy === 'photo'} onPress={() => setPhoto(true)} />
        <Button title="Choose photo" onPress={() => setPhoto(false)} />
        <Button title="Edit personal details" onPress={() => router.push({ pathname: '/member/[id]/edit', params: { id: m.id } })} />
      </Row>
      <ErrorText>{err}</ErrorText>

      <Card>
        <H>Allergies</H>
        <Muted>Medicines, foods and anything else. Shown in red on the emergency card and checked against medicines.</Muted>
        {d.allergies.map((a) => (
          <Row key={a.id} style={{ justifyContent: 'space-between' }}>
            <T style={{ flexShrink: 1 }}><T style={{ color: c.bad, fontWeight: '700' }}>{a.name}</T> · {a.kind}{a.reaction ? ` · ${a.reaction}` : ''}{a.severity ? ` · ${a.severity}` : ''}</T>
            <Del onPress={() => run('del', () => deleteRow('allergies', a.id))} />
          </Row>
        ))}
        <Choice options={[{ value: 'medicine', label: 'Medicine' }, { value: 'food', label: 'Food' }, { value: 'other', label: 'Other' }] as const} value={aKind} onChange={setAKind} />
        <Row>
          <Field label="Allergic to" value={aName} onChangeText={setAName} placeholder="e.g. Penicillin, peanuts" />
          <Field label="Reaction" value={aReact} onChangeText={setAReact} placeholder="e.g. hives, swelling" />
        </Row>
        <Choice label="Severity" options={[{ value: 'mild', label: 'Mild' }, { value: 'moderate', label: 'Moderate' }, { value: 'severe', label: 'Severe' }] as const} value={aSev} onChange={setASev} />
        <Button title="Add allergy" busy={busy === 'allergy'} onPress={() => {
          if (!aName.trim()) { setErr('Add what the allergy is to.'); return; }
          run('allergy', async () => {
            await addRow('allergies', { member_id: m.id, kind: aKind, name: aName.trim(), reaction: aReact.trim() || null, severity: aSev });
            setAName(''); setAReact('');
          });
        }} />
      </Card>

      <Card>
        <H>Height and weight, year by year</H>
        <Choice options={[{ value: 'us', label: 'US (ft, in, lb)' }, { value: 'metric', label: 'Metric (cm, kg)' }] as const} value={units} onChange={setUnits} />
        {d.measurements.map((x) => (
          <Row key={x.id} style={{ justifyContent: 'space-between' }}>
            <T style={{ flexShrink: 1 }}>
              {fmtDate(x.measured_on)} · {x.height_cm ? (units === 'us' ? cmToFtIn(x.height_cm) : `${Math.round(x.height_cm)} cm`) : '—'} · {x.weight_kg ? (units === 'us' ? `${kgToLb(x.weight_kg)} lb` : `${x.weight_kg} kg`) : '—'} · BMI {bmiByRow[x.id]}
            </T>
            <Del onPress={() => run('del', () => deleteRow('measurements', x.id))} />
          </Row>
        ))}
        <Row>
          <Field label="Date (YYYY-MM-DD)" value={msDate} onChangeText={setMsDate} keyboardType="numbers-and-punctuation" />
          {units === 'us' ? (
            <>
              <Field label="Height ft" value={ft} onChangeText={setFt} keyboardType="number-pad" />
              <Field label="Height in" value={inch} onChangeText={setInch} keyboardType="decimal-pad" />
              <Field label="Weight lb" value={wt} onChangeText={setWt} keyboardType="decimal-pad" />
            </>
          ) : (
            <>
              <Field label="Height cm" value={cm} onChangeText={setCm} keyboardType="decimal-pad" />
              <Field label="Weight kg" value={wt} onChangeText={setWt} keyboardType="decimal-pad" />
            </>
          )}
        </Row>
        <Button title="Add measurement" busy={busy === 'ms'} onPress={() => {
          if (!isIsoDate(msDate)) { setErr('Write the date as YYYY-MM-DD.'); return; }
          const heightCm = units === 'us' ? ((num(ft) ?? 0) * 12 + (num(inch) ?? 0)) * 2.54 || null : num(cm);
          const w = num(wt); const weightKg = w == null ? null : units === 'us' ? w / 2.20462 : w;
          if (!heightCm && !weightKg) { setErr('Add a height, a weight, or both.'); return; }
          run('ms', async () => {
            await addRow('measurements', { member_id: m.id, measured_on: msDate, height_cm: heightCm ? Math.round(heightCm * 10) / 10 : null, weight_kg: weightKg ? Math.round(weightKg * 10) / 10 : null });
            setFt(''); setInch(''); setCm(''); setWt('');
          });
        }} />
      </Card>

      <Card>
        <H>Eye prescription, year by year</H>
        <Muted>SPH is sphere (− nearsighted, + farsighted), CYL is cylinder, AXIS is 0 to 180, ADD is reading power.</Muted>
        {d.eyes.map((x) => (
          <Row key={x.id} style={{ justifyContent: 'space-between' }}>
            <View style={{ flexShrink: 1 }}>
              <T>{fmtDate(x.rx_date)}{x.note ? ` · ${x.note}` : ''}</T>
              <MonoText>R {power(x.r_sph)} / {power(x.r_cyl)} × {x.r_axis ?? '—'}   L {power(x.l_sph)} / {power(x.l_cyl)} × {x.l_axis ?? '—'}{x.add_power ? `   ADD ${power(x.add_power)}` : ''}</MonoText>
            </View>
            <Del onPress={() => run('del', () => deleteRow('eye_prescriptions', x.id))} />
          </Row>
        ))}
        <Field label="Date (YYYY-MM-DD)" value={eDate} onChangeText={setEDate} keyboardType="numbers-and-punctuation" />
        <Row>
          <Field label="Right SPH" value={eye.rs} onChangeText={(v) => setEye({ ...eye, rs: v })} keyboardType="numbers-and-punctuation" />
          <Field label="Right CYL" value={eye.rc} onChangeText={(v) => setEye({ ...eye, rc: v })} keyboardType="numbers-and-punctuation" />
          <Field label="Right AXIS" value={eye.ra} onChangeText={(v) => setEye({ ...eye, ra: v })} keyboardType="number-pad" />
        </Row>
        <Row>
          <Field label="Left SPH" value={eye.ls} onChangeText={(v) => setEye({ ...eye, ls: v })} keyboardType="numbers-and-punctuation" />
          <Field label="Left CYL" value={eye.lc} onChangeText={(v) => setEye({ ...eye, lc: v })} keyboardType="numbers-and-punctuation" />
          <Field label="Left AXIS" value={eye.la} onChangeText={(v) => setEye({ ...eye, la: v })} keyboardType="number-pad" />
        </Row>
        <Row>
          <Field label="ADD" value={eye.add} onChangeText={(v) => setEye({ ...eye, add: v })} keyboardType="decimal-pad" />
          <Field label="Notes" value={eye.note} onChangeText={(v) => setEye({ ...eye, note: v })} placeholder="glasses, contacts, doctor" />
        </Row>
        <Button title="Add eye prescription" busy={busy === 'eye'} onPress={() => {
          if (!isIsoDate(eDate)) { setErr('Write the date as YYYY-MM-DD.'); return; }
          const ax = (s: string) => { const n = num(s); return n == null ? null : Math.max(0, Math.min(180, Math.round(n))); };
          run('eye', async () => {
            await addRow('eye_prescriptions', {
              member_id: m.id, rx_date: eDate, r_sph: num(eye.rs), r_cyl: num(eye.rc), r_axis: ax(eye.ra),
              l_sph: num(eye.ls), l_cyl: num(eye.lc), l_axis: ax(eye.la), add_power: num(eye.add), note: eye.note.trim() || null,
            });
            setEye({ rs: '', rc: '', ra: '', ls: '', lc: '', la: '', add: '', note: '' });
          });
        }} />
      </Card>

      <Card>
        <H>Emergency contacts</H>
        {d.contacts.map((x) => (
          <Row key={x.id} style={{ justifyContent: 'space-between' }}>
            <T style={{ flexShrink: 1 }} selectable>{x.name}{x.relationship ? ` (${x.relationship})` : ''} · {x.phone}</T>
            <Del onPress={() => run('del', () => deleteRow('emergency_contacts', x.id))} />
          </Row>
        ))}
        <Row>
          <Field label="Name" value={ctName} onChangeText={setCtName} />
          <Field label="Relationship" value={ctRel} onChangeText={setCtRel} placeholder="e.g. spouse" />
          <Field label="Phone" value={ctPhone} onChangeText={setCtPhone} keyboardType="phone-pad" textContentType="telephoneNumber" />
        </Row>
        <Button title="Add contact" busy={busy === 'ct'} onPress={() => {
          if (!ctName.trim() || !ctPhone.trim()) { setErr('Add a name and phone number.'); return; }
          run('ct', async () => {
            await addRow('emergency_contacts', { member_id: m.id, name: ctName.trim(), relationship: ctRel.trim() || null, phone: ctPhone.trim() });
            setCtName(''); setCtRel(''); setCtPhone('');
          });
        }} />
      </Card>

      <Button kind="danger" title={`Remove ${m.first_name} and all their records`} onPress={() =>
        Alert.alert(`Remove ${m.first_name}?`, 'All of their records, scans and payments will be permanently deleted.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete everything', style: 'destructive', onPress: async () => { await deleteMember(m.id); router.back(); } },
        ])} />
    </View>
  );
}
