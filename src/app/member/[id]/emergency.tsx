import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { EmergencyCard } from '@/components/emergency-card';
import { Button } from '@/components/ui';
import { Space } from '@/constants/theme';
import { useMember } from '@/hooks/use-member';
import { usePalette } from '@/hooks/use-palette';

export default function Emergency() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const { detail } = useMember(id);
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: Space.lg, gap: Space.lg, paddingBottom: 48 }}>
      {detail ? <EmergencyCard d={detail} large /> : <View style={{ padding: 40 }}><ActivityIndicator color={c.accent} /></View>}
      <Button kind="primary" title="Close" onPress={() => router.back()} />
    </ScrollView>
  );
}
