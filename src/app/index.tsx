import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { Avatar, Badge, Button, ErrorText, H, Muted, Row, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { listMembers, type MemberSummary } from '@/lib/api';
import { ageOf, fmtDate, fullName, initials } from '@/lib/format';
import { supabase } from '@/lib/supabase';

export default function Family() {
  const c = usePalette();
  const [members, setMembers] = useState<MemberSummary[] | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setMembers(await listMembers()); setErr(''); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load your family.'); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <>
      <Stack.Screen options={{ headerRight: () => <Button small title="Sign out" onPress={() => supabase.auth.signOut()} /> }} />
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: Space.lg, gap: Space.md, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <ErrorText>{err}</ErrorText>
        {members && members.length === 0 ? (
          <View style={{ gap: Space.sm, paddingVertical: Space.lg }}>
            <H>Start with yourself</H>
            <Muted>Add each family member, then scan their prescriptions, bills and reports. Everything stays private to your account.</Muted>
          </View>
        ) : null}
        {members?.map((m) => {
          const age = ageOf(m.date_of_birth);
          const conditions = m.records.filter((r) => r.kind === 'diagnosis' && r.ongoing).length;
          const meds = m.records.filter((r) => r.kind === 'medicine' && r.ongoing).length;
          const lastVisit = m.records.filter((r) => r.kind === 'visit' && r.occurred_on).map((r) => r.occurred_on!).sort().at(-1);
          return (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${fullName(m)}`}
              onPress={() => router.push({ pathname: '/member/[id]', params: { id: m.id } })}
              style={({ pressed }) => ({ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 14, padding: Space.lg, gap: Space.sm, opacity: pressed ? 0.8 : 1 })}>
              <View style={{ flexDirection: 'row', gap: Space.md, alignItems: 'center' }}>
                <Avatar path={m.photo_path} initials={initials(m)} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontSize: 18, fontWeight: '700' }}>{fullName(m)}</T>
                  <Muted>{[m.relationship || 'Family member', age != null ? `age ${age}` : null].filter(Boolean).join(' · ')}</Muted>
                </View>
              </View>
              <Row>
                {m.blood_group ? <Badge text={`Blood ${m.blood_group}`} /> : null}
                {m.allergies.length ? <Badge tone="bad" text={`${m.allergies.length} allerg${m.allergies.length > 1 ? 'ies' : 'y'}`} /> : null}
                <Badge text={`${conditions} condition${conditions === 1 ? '' : 's'}`} />
                <Badge text={`${meds} medicine${meds === 1 ? '' : 's'}`} />
              </Row>
              <Muted>{lastVisit ? `Last visit ${fmtDate(lastVisit)}` : 'No visits recorded yet'} · {m.records.length} records</Muted>
            </Pressable>
          );
        })}
        <Button kind="primary" title="Add family member" onPress={() => router.push('/add-member')} />
      </ScrollView>
    </>
  );
}
