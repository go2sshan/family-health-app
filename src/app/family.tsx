import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { Badge, Button, Card, ErrorText, H, Muted, MonoText, Row, Screen, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import {
  createInvite, inviteMessage, openDirectChat, removeFromFamily, setFamilyRole, useFamily, type Person,
} from '@/lib/family';
import { supabase } from '@/lib/supabase';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const;

export default function FamilyScreen() {
  const c = usePalette();
  const { family, people, me, myRole, isAdmin, reload } = useFamily();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  if (!family || !me) return null;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); setErr('');
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.'); }
    setBusy('');
  }

  const invite = () => run('invite', async () => {
    const c6 = await createInvite(family.id);
    setCode(c6);
    await Share.share({ message: inviteMessage(c6, family.name) });
  });

  const remove = (p: Person) => Alert.alert(
    `Remove ${p.display_name}?`,
    `${p.display_name} leaves "${family.name}", loses access to any records shared with them, and leaves the family chat. Their own records go with them.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => run(p.user_id, async () => { await removeFromFamily(family.id, p.user_id); await reload(); }) }],
  );

  const leave = () => Alert.alert(
    `Leave ${family.name}?`,
    'You keep your own records. You lose access to anything others shared with you, and the family chat.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: () => run('leave', async () => { await removeFromFamily(family.id, me.id); await reload(); }) }],
  );

  return (
    <Screen>
      <H style={{ fontSize: 22 }}>{family.name}</H>
      <Muted>People in your family can chat and call each other. Records stay private: each person chooses who sees theirs, on their own page under &quot;Who can see these records&quot;.</Muted>
      <ErrorText>{err}</ErrorText>

      <Card>
        <H>People ({people.length})</H>
        {people.map((p) => (
          <View key={p.user_id} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: Space.sm, gap: Space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T style={{ fontWeight: '600', flexShrink: 1 }}>{p.display_name}{p.user_id === me.id ? ' (you)' : ''}</T>
              <Badge tone={p.role === 'member' ? undefined : 'accent'} text={ROLE_LABEL[p.role]} />
            </Row>
            {p.user_id !== me.id ? (
              <Row>
                <Button small title="Message" onPress={() => run('chat', async () => {
                  const id = await openDirectChat(p.user_id);
                  router.push({ pathname: '/chat/[id]', params: { id } });
                })} />
                {myRole === 'owner' && p.role !== 'owner' ? (
                  <Button small title={p.role === 'admin' ? 'Make member' : 'Make admin'} busy={busy === `role-${p.user_id}`}
                    onPress={() => run(`role-${p.user_id}`, async () => { await setFamilyRole(family.id, p.user_id, p.role === 'admin' ? 'member' : 'admin'); await reload(); })} />
                ) : null}
                {isAdmin && p.role !== 'owner' ? (
                  <Button small kind="danger" title="Remove" busy={busy === p.user_id} onPress={() => remove(p)} />
                ) : null}
              </Row>
            ) : null}
          </View>
        ))}
      </Card>

      {isAdmin ? (
        <Card>
          <H>Invite someone</H>
          <Muted>Send a one-time code by text, WhatsApp or email. It expires in 7 days. Joining doesn&apos;t give them access to anyone&apos;s records.</Muted>
          <Button kind="primary" title="Create invite code" busy={busy === 'invite'} onPress={invite} />
          {code ? (
            <Row>
              <MonoText style={{ fontSize: 28, fontWeight: '700', letterSpacing: 4 }} selectable>{code}</MonoText>
              <Button small title="Copy" onPress={() => Clipboard.setStringAsync(code)} />
              <Button small title="Share again" onPress={() => Share.share({ message: inviteMessage(code, family.name) })} />
            </Row>
          ) : null}
          <Muted style={{ fontSize: 13 }}>Already made a profile for them (for example your son)? Open their page and use &quot;Invite to use the app&quot; so they take over that profile.</Muted>
        </Card>
      ) : null}

      <Card>
        <H>Your account</H>
        <Row>
          {myRole !== 'owner' ? <Button kind="danger" title="Leave this family" busy={busy === 'leave'} onPress={leave} /> : null}
          <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
        </Row>
      </Card>
    </Screen>
  );
}
