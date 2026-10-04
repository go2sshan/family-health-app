import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button, Card, ErrorText, Field, H, Muted, Screen, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export function SignIn() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  async function go() {
    setErr(''); setNote('');
    if (!email.includes('@') || password.length < 8) { setErr('Enter your email and a password of at least 8 characters.'); return; }
    if (mode === 'up' && !name.trim()) { setErr('Add your name so your family knows who you are.'); return; }
    setBusy(true);
    const res = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() } } });
    setBusy(false);
    if (res.error) { setErr(res.error.message); return; }
    if (mode === 'up' && !res.data.session) setNote('Check your email and tap the confirmation link, then sign in here.');
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ height: 60 }} />
        <H style={{ fontSize: 30 }}>Family Health</H>
        <Muted>One private place for your family&apos;s records, scans, payments and emergency cards.</Muted>
        <Card>
          <H>{mode === 'in' ? 'Sign in' : 'Create your account'}</H>
          {mode === 'up' ? <Field label="Your name (shown to your family)" value={name} onChangeText={setName} textContentType="name" autoComplete="name" /> : null}
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'in' ? 'current-password' : 'new-password'} textContentType={mode === 'in' ? 'password' : 'newPassword'} />
          <ErrorText>{err}</ErrorText>
          {note ? <T>{note}</T> : null}
          <Button kind="primary" title={mode === 'in' ? 'Sign in' : 'Create account'} busy={busy} onPress={go} />
          <Button title={mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'} onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(''); setNote(''); }} />
        </Card>
        <Muted>Your records are stored in your own secure account. Nobody else can see them.</Muted>
      </Screen>
    </KeyboardAvoidingView>
  );
}

export function NotConfigured() {
  return (
    <Screen>
      <View style={{ height: 60 }} />
      <H>Almost ready</H>
      <T>The app isn&apos;t connected to its backend yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the .env file (see README), then restart.</T>
    </Screen>
  );
}
