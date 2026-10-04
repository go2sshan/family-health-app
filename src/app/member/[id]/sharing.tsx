import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share, View } from 'react-native';

import { Button, Card, Choice, ErrorText, H, Muted, MonoText, Row, Screen, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { useMember } from '@/hooks/use-member';
import { usePalette } from '@/hooks/use-palette';
import { createInvite, inviteMessage, useFamily } from '@/lib/family';
import { supabase } from '@/lib/supabase';

type Level = 'none' | 'view' | 'edit';

export default function Sharing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const { detail } = useMember(id);
  const { people, me, family, isAdmin } = useFamily();
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');
  const [code, setCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('member_access').select('user_id, level').eq('member_id', id);
    if (error) { setErr(error.message); return; }
    setLevels(Object.fromEntries((data ?? []).map((r) => [r.user_id, r.level as Level])));
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!detail || !me || !family) return null;
  const m = detail.member;
  if (detail.role !== 'manage') {
    return <Screen><Muted>Only {m.user_id ? m.first_name : 'the person who manages this profile'} can change who sees these records.</Muted></Screen>;
  }
  const others = people.filter((p) => p.user_id !== me.id && p.user_id !== m.user_id);

  async function change(userId: string, name: string, level: Level) {
    setErr(''); setSaved('');
    const prev = levels[userId] ?? 'none';
    setLevels((s) => ({ ...s, [userId]: level }));
    const res = level === 'none'
      ? await supabase.from('member_access').delete().eq('member_id', id).eq('user_id', userId)
      : await supabase.from('member_access').upsert({ member_id: id, user_id: userId, level }, { onConflict: 'member_id,user_id' });
    if (res.error) { setLevels((s) => ({ ...s, [userId]: prev })); setErr(res.error.message); return; }
    setSaved(level === 'none' ? `${name} can no longer see these records.` : `${name} can now ${level === 'edit' ? 'see and update' : 'see'} these records.`);
  }

  return (
    <Screen>
      <T>
        {m.user_id === me.id ? 'Your records are private until you share them.' : `${m.first_name}'s records are private until shared.`} Choose who in {family.name} can see them.
      </T>
      <Muted>&quot;Can view&quot; lets them read records, scans, payments and the emergency card. &quot;Can edit&quot; also lets them add records and scans, for example a spouse who goes to appointments with you.</Muted>
      <ErrorText>{err}</ErrorText>
      {saved ? <T style={{ color: c.good }}>{saved}</T> : null}

      {others.length === 0 ? <Muted>Nobody else has joined your family yet. Invite them from Family and sharing.</Muted> : null}
      {others.map((p) => (
        <Card key={p.user_id}>
          <T style={{ fontWeight: '600' }}>{p.display_name}</T>
          <Choice
            options={[{ value: 'none', label: 'No access' }, { value: 'view', label: 'Can view' }, { value: 'edit', label: 'Can edit' }] as const}
            value={levels[p.user_id] ?? 'none'}
            onChange={(v) => change(p.user_id, p.display_name, v)}
          />
        </Card>
      ))}

      {!m.user_id && isAdmin ? (
        <Card>
          <H>Invite {m.first_name} to use the app</H>
          <Muted>When {m.first_name} has a phone, send this code. Joining with it gives {m.first_name} this profile and its history. You keep edit access until {m.first_name} changes it.</Muted>
          <Button kind="primary" title="Create invite code" onPress={async () => {
            try {
              const c6 = await createInvite(family.id, m.id);
              setCode(c6);
              await Share.share({ message: inviteMessage(c6, family.name) });
            } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create the invite.'); }
          }} />
          {code ? <View style={{ paddingTop: Space.sm }}><MonoText style={{ fontSize: 26, fontWeight: '700', letterSpacing: 4 }} selectable>{code}</MonoText></View> : null}
        </Card>
      ) : null}
      <Row><Muted style={{ fontSize: 13 }}>Changes apply right away. Anything already sent in a chat stays in that chat.</Muted></Row>
    </Screen>
  );
}
