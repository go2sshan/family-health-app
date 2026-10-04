import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Choice, ErrorText, Field, Row, Screen } from '@/components/ui';
import { useMember } from '@/hooks/use-member';
import { updateMember } from '@/lib/api';
import { isIsoDate } from '@/lib/format';
import { BLOOD_GROUPS, RELATIONSHIPS, type BloodGroup, type Member } from '@/lib/types';

export default function EditMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { detail } = useMember(id);
  if (!detail) return <View style={{ padding: 40 }}><ActivityIndicator /></View>;
  return <EditForm id={id} m={detail.member} />;
}

function EditForm({ id, m }: { id: string; m: Member }) {
  const [f, setF] = useState({ first: m.first_name, middle: m.middle_name ?? '', last: m.last_name ?? '', rel: m.relationship ?? 'Other', dob: m.date_of_birth ?? '', sex: m.sex ?? '', blood: (m.blood_group ?? '') as BloodGroup | '', lang: m.language ?? '', pcp: m.primary_doctor ?? '', comm: m.communicate ?? '', needs: m.care_needs ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    if (!f.first.trim()) { setErr('Add a first name.'); return; }
    if (f.dob && !isIsoDate(f.dob)) { setErr('Write the date of birth as YYYY-MM-DD.'); return; }
    setBusy(true); setErr('');
    try {
      await updateMember(id, {
        first_name: f.first.trim(), middle_name: f.middle.trim() || null, last_name: f.last.trim() || null,
        relationship: f.rel, date_of_birth: f.dob || null, sex: f.sex || null, blood_group: f.blood || null,
        language: f.lang.trim() || null, primary_doctor: f.pcp.trim() || null,
        communicate: f.comm.trim() || null, care_needs: f.needs.trim() || null,
      });
      router.back();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); setBusy(false); }
  }

  return (
    <Screen>
      <Row>
        <Field label="First name" value={f.first} onChangeText={set('first')} />
        <Field label="Middle name" value={f.middle} onChangeText={set('middle')} />
        <Field label="Last name" value={f.last} onChangeText={set('last')} />
      </Row>
      <Choice label="Relationship" options={RELATIONSHIPS} value={f.rel} onChange={set('rel')} />
      <Field label="Date of birth (YYYY-MM-DD)" value={f.dob} onChangeText={set('dob')} keyboardType="numbers-and-punctuation" />
      <Choice label="Sex" options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other' }]} value={f.sex || null} onChange={set('sex')} />
      <Choice label="Blood group" options={BLOOD_GROUPS} value={f.blood || null} onChange={set('blood')} />
      <Field label="Preferred language" value={f.lang} onChangeText={set('lang')} placeholder="e.g. English, Tamil" />
      <Field label="Primary doctor" value={f.pcp} onChangeText={set('pcp')} />
      <Field label="How to communicate with me" value={f.comm} onChangeText={set('comm')} multiline placeholder="e.g. I can't speak but understand slow speech. Uses sign language." />
      <Field label="Disability, devices or care needs" value={f.needs} onChangeText={set('needs')} multiline placeholder="e.g. wheelchair, hearing aid, pacemaker, needs a caregiver present" />
      <ErrorText>{err}</ErrorText>
      <Button kind="primary" title="Save" busy={busy} onPress={save} />
    </Screen>
  );
}
