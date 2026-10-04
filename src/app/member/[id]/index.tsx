import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';

import { AboutTab } from '@/components/member/about-tab';
import { PaymentsTab } from '@/components/member/payments-tab';
import { RecordsTab } from '@/components/member/records-tab';
import { Avatar, Badge, Choice, ErrorText, Muted, Row, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { useMember } from '@/hooks/use-member';
import { usePalette } from '@/hooks/use-palette';
import { ageOf, fullName, initials } from '@/lib/format';

type Tab = 'records' | 'about' | 'payments';

export default function MemberScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const c = usePalette();
  const { detail, error, reload } = useMember(id);
  const [current, setCurrent] = useState<Tab>(tab === 'about' || tab === 'payments' ? tab : 'records');
  const [refreshing, setRefreshing] = useState(false);

  if (!detail) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={c.accent} />}
      </View>
    );
  }
  const m = detail.member;
  const age = ageOf(m.date_of_birth);

  return (
    <>
      <Stack.Screen options={{ title: m.first_name }} />
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: Space.lg, gap: Space.md, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />}>
        <View style={{ flexDirection: 'row', gap: Space.md, alignItems: 'center' }}>
          <Avatar path={m.photo_path} initials={initials(m)} size={64} />
          <View style={{ flex: 1, gap: 4 }}>
            <T style={{ fontSize: 22, fontWeight: '800' }}>{fullName(m)}</T>
            <Muted>{[m.relationship, age != null ? `age ${age}` : null].filter(Boolean).join(' · ')}</Muted>
            <Row>
              {m.blood_group ? <Badge text={`Blood ${m.blood_group}`} /> : null}
              {detail.allergies.length ? <Badge tone="bad" text={`${detail.allergies.length} allerg${detail.allergies.length > 1 ? 'ies' : 'y'}`} /> : null}
            </Row>
          </View>
        </View>
        <ErrorText>{error}</ErrorText>
        <Choice
          options={[{ value: 'records', label: 'Records' }, { value: 'about', label: 'About me' }, { value: 'payments', label: 'Payments' }] as { value: Tab; label: string }[]}
          value={current}
          onChange={setCurrent}
        />
        {current === 'records' ? <RecordsTab d={detail} reload={reload} /> : null}
        {current === 'about' ? <AboutTab d={detail} reload={reload} /> : null}
        {current === 'payments' ? <PaymentsTab d={detail} reload={reload} /> : null}
      </ScrollView>
    </>
  );
}
