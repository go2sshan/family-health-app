import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { Avatar, Badge, Button, ErrorText, H, Muted, Row, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { listMembers, type MemberSummary } from '@/lib/api';
import { ageOf, fmtDate, fullName, initials } from '@/lib/format';
import { useFamily } from '@/lib/family';

export default function Family() {
  const c = usePalette();
  const [members, setMembers] = useState<MemberSummary[] | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { family, people, me } = useFamily();

  const load = useCallback(async () => {
    try { setMembers(await listMembers()); setErr(''); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not load your family.'); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <>
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: Space.lg, gap: Space.md, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <ErrorText>{err}</ErrorText>
        <Muted>{family?.name} · {people.length} {people.length === 1 ? 'person' : 'people'} using the app</Muted>
        {members && members.length <= 1 ? (
          <View style={{ gap: Space.sm, paddingVertical: Space.sm }}>
            <H>Add your family</H>
            <Muted>Invite your spouse or parents with &quot;Family and sharing&quot;. Add profiles for children or elders who don&apos;t have a phone with the button below. Each person&apos;s records stay private until they share them.</Muted>
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
                  <Muted>{[m.user_id === me?.id ? 'You' : m.relationship || 'Family member', age != null ? `age ${age}` : null].filter(Boolean).join(' · ')}</Muted>
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
        <Button kind="primary" title="Add a profile (child or elder without a phone)" onPress={() => router.push('/add-member')} />
      </ScrollView>
    </>
  );
}
