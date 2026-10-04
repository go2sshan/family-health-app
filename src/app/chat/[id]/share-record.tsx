import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Badge, Choice, ErrorText, Muted, Screen, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { getMemberDetail, listMembers, type MemberSummary } from '@/lib/api';
import { sendRecord } from '@/lib/chat';
import { fmtDate, fullName } from '@/lib/format';
import { KIND_LABEL, type HealthRecord } from '@/lib/types';

/** Pick one record from a profile you can see and send a summary of it into the chat. */
export default function ShareRecord() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [who, setWho] = useState<string | null>(null);
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => { listMembers().then((m) => { setMembers(m); if (m[0]) setWho(m[0].id); }).catch((e) => setErr(String(e.message ?? e))); }, []);
  useEffect(() => {
    if (!who) return;
    let live = true;
    getMemberDetail(who).then((d) => live && setRecords(d.records.filter((r) => r.kind !== 'document'))).catch((e) => live && setErr(String(e.message ?? e)));
    return () => { live = false; };
  }, [who]);

  const person = members.find((m) => m.id === who);

  return (
    <Screen>
      <Muted>Everyone in this chat will see the record you pick, even if that person&apos;s records aren&apos;t shared with them.</Muted>
      <ErrorText>{err}</ErrorText>
      <Choice label="Whose record" options={members.map((m) => ({ value: m.id, label: m.first_name }))} value={who} onChange={setWho} />
      {records.length === 0 ? <Muted>No records to share yet.</Muted> : null}
      {records.map((r) => (
        <Pressable
          key={r.id}
          accessibilityRole="button"
          onPress={async () => {
            try { await sendRecord(id, r, person ? fullName(person) : 'Family member'); router.back(); }
            catch (e) { setErr(e instanceof Error ? e.message : 'Could not share.'); }
          }}
          style={({ pressed }) => ({ borderWidth: 1, borderColor: c.line, backgroundColor: pressed ? c.accentSoft : c.surface, borderRadius: 12, padding: Space.md, gap: 4 })}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Badge tone="accent" text={KIND_LABEL[r.kind]} />
            <Muted>{fmtDate(r.occurred_on)}</Muted>
          </View>
          <T style={{ fontWeight: '600' }}>{r.title}{r.value != null ? `: ${r.value} ${r.unit ?? ''}` : ''}</T>
        </Pressable>
      ))}
    </Screen>
  );
}
