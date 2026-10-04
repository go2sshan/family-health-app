import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Choice, ErrorText, Field, Muted, Row, Screen } from '@/components/ui';
import { createMember } from '@/lib/api';
import { isIsoDate } from '@/lib/format';
import { RELATIONSHIPS } from '@/lib/types';

export default function AddMember() {
  const [first, setFirst] = useState('');
  const [middle, setMiddle] = useState('');
  const [last, setLast] = useState('');
  const [rel, setRel] = useState('Self');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!first.trim()) { setErr('Add a first name.'); return; }
    if (dob && !isIsoDate(dob)) { setErr('Write the date of birth as YYYY-MM-DD, for example 1985-07-21.'); return; }
    setBusy(true); setErr('');
    try {
      const m = await createMember({
        first_name: first.trim(), middle_name: middle.trim() || null, last_name: last.trim() || null,
        relationship: rel, date_of_birth: dob || null,
      });
      router.replace({ pathname: '/member/[id]', params: { id: m.id, tab: 'about' } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add this person.');
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Row>
        <Field label="First name" value={first} onChangeText={setFirst} autoFocus textContentType="givenName" />
        <Field label="Middle name" value={middle} onChangeText={setMiddle} textContentType="middleName" />
        <Field label="Last name" value={last} onChangeText={setLast} textContentType="familyName" />
      </Row>
      <Choice label="Relationship to you" options={RELATIONSHIPS} value={rel} onChange={setRel} />
      <Field label="Date of birth (YYYY-MM-DD)" value={dob} onChangeText={setDob} placeholder="1985-07-21" keyboardType="numbers-and-punctuation" />
      <Muted>You can add blood group, allergies, height, weight and more on their page.</Muted>
      <ErrorText>{err}</ErrorText>
      <Button kind="primary" title="Add and open" busy={busy} onPress={save} />
    </Screen>
  );
}
