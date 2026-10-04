import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button, Card, Choice, ErrorText, Field, H, Muted, Screen } from '@/components/ui';
import { createFamily, joinFamily, useFamily } from '@/lib/family';
import { supabase } from '@/lib/supabase';

/** First screen after sign-up: start a family, or join one with an invite code. */
export function Onboarding() {
  const { reload, me } = useFamily();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [first, setFirst] = useState(me?.display_name ?? '');
  const [familyName, setFamilyName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function go() {
    setErr('');
    if (!first.trim()) { setErr('Add your first name.'); return; }
    if (mode === 'create' && !familyName.trim()) { setErr('Name your family, for example "Sharma family".'); return; }
    if (mode === 'join' && code.trim().length !== 6) { setErr('Enter the 6-character invite code.'); return; }
    setBusy(true);
    try {
      if (me) await supabase.from('profiles').update({ display_name: first.trim() }).eq('id', me.id);
      if (mode === 'create') await createFamily(familyName.trim(), first.trim());
      else await joinFamily(code.trim(), first.trim());
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ height: 48 }} />
        <H style={{ fontSize: 28 }}>Welcome</H>
        <Muted>Start your family&apos;s private space, or join one someone invited you to.</Muted>
        <Choice options={[{ value: 'create', label: 'Start a family' }, { value: 'join', label: 'Join with a code' }] as const} value={mode} onChange={setMode} />
        <Card>
          <Field label="Your first name" value={first} onChangeText={setFirst} textContentType="givenName" />
          {mode === 'create' ? (
            <Field label="Family name" value={familyName} onChangeText={setFamilyName} placeholder="e.g. Sharma family" />
          ) : (
            <Field label="Invite code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={6} placeholder="ABC123" />
          )}
          <ErrorText>{err}</ErrorText>
          <Button kind="primary" title={mode === 'create' ? 'Start my family' : 'Join family'} busy={busy} onPress={go} />
        </Card>
        <Muted>
          {mode === 'create'
            ? 'You\'ll be the family owner. You can invite your spouse, parents and children, and decide who sees each person\'s records.'
            : 'Joining doesn\'t share your records with anyone. You choose who sees them, person by person.'}
        </Muted>
        <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
