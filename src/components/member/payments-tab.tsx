import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Button, Card, Choice, Muted, Row, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { deleteRow } from '@/lib/api';
import { fmtDate, money } from '@/lib/format';
import { NOT_LINKED } from '@/lib/illness';
import type { MemberDetail, Payment } from '@/lib/types';

type Group = 'illness' | 'doctor' | 'kind' | 'year';
const KIND_NAME: Record<string, string> = { visit: 'Visits', medicine: 'Medicines', lab: 'Lab tests', procedure: 'Procedures', vaccination: 'Vaccinations', other: 'Other' };

function totals(list: Payment[], field: 'amount_paid' | 'insurance_paid') {
  const by: Record<string, number> = {};
  for (const p of list) by[p.currency] = (by[p.currency] ?? 0) + (Number(p[field]) || 0);
  return Object.entries(by).filter(([, v]) => v > 0).map(([cur, v]) => money(v, cur)).join(' + ');
}

export function PaymentsTab({ d, reload }: { d: MemberDetail; reload: () => void }) {
  const c = usePalette();
  const [group, setGroup] = useState<Group>('illness');
  const [open, setOpen] = useState<string | null>(null);
  const year = String(new Date().getFullYear());
  const pays = d.payments;

  const keyOf = (p: Payment) =>
    group === 'illness' ? p.illness || NOT_LINKED
      : group === 'doctor' ? p.doctor || 'Provider not recorded'
        : group === 'kind' ? KIND_NAME[p.kind] ?? 'Other'
          : p.paid_on.slice(0, 4);

  const groups = new Map<string, Payment[]>();
  for (const p of pays) groups.set(keyOf(p), [...(groups.get(keyOf(p)) ?? []), p]);
  const rows = [...groups.entries()].sort((a, b) => (group === 'year' ? b[0].localeCompare(a[0]) : b[1].length - a[1].length));

  function confirmDelete(p: Payment) {
    Alert.alert('Delete this payment?', `${money(p.amount_paid, p.currency)} for ${p.description}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteRow('payments', p.id); reload(); } },
    ]);
  }

  return (
    <View style={{ gap: Space.md }}>
      <Row>
        <Card style={{ flexGrow: 1, flexBasis: 150 }}><Muted>You paid, all time</Muted><T style={{ fontSize: 20, fontWeight: '700' }}>{totals(pays, 'amount_paid') || '$0'}</T></Card>
        <Card style={{ flexGrow: 1, flexBasis: 150 }}><Muted>You paid in {year}</Muted><T style={{ fontSize: 20, fontWeight: '700' }}>{totals(pays.filter((p) => p.paid_on.startsWith(year)), 'amount_paid') || '$0'}</T></Card>
        <Card style={{ flexGrow: 1, flexBasis: 150 }}><Muted>Insurance paid</Muted><T style={{ fontSize: 20, fontWeight: '700' }}>{totals(pays, 'insurance_paid') || '$0'}</T></Card>
      </Row>
      <Choice label="Group by" options={[{ value: 'illness', label: 'Illness' }, { value: 'doctor', label: 'Doctor' }, { value: 'kind', label: 'Type' }, { value: 'year', label: 'Year' }] as { value: Group; label: string }[]} value={group} onChange={setGroup} />
      <Button title="Add other payment" onPress={() => router.push({ pathname: '/member/[id]/add-payment', params: { id: d.member.id } })} />
      {pays.length === 0 ? <Muted>No payments yet. Add one from any visit or medicine in Records, or scan a bill.</Muted> : null}
      {rows.map(([name, list]) => {
        const isOpen = open === name;
        return (
          <Card key={name}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpen(isOpen ? null : name)} style={{ gap: 2 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T style={{ fontWeight: '700', flexShrink: 1 }}>{name}</T>
                <T style={{ fontWeight: '700' }}>{totals(list, 'amount_paid') || '$0'}</T>
              </Row>
              <Muted>{list.length} payment{list.length > 1 ? 's' : ''}{totals(list, 'insurance_paid') ? ` · insurance paid ${totals(list, 'insurance_paid')}` : ''} · {isOpen ? 'tap to hide' : 'tap for details'}</Muted>
            </Pressable>
            {isOpen ? list.map((p) => (
              <View key={p.id} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: Space.sm, gap: 2 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T style={{ flexShrink: 1 }}>{p.description}</T>
                  <T style={{ fontWeight: '600' }}>{money(p.amount_paid, p.currency)}</T>
                </Row>
                <Muted>{[fmtDate(p.paid_on), group === 'doctor' ? p.illness : p.doctor, p.note, p.estimated ? 'estimate' : null].filter(Boolean).join(' · ')}</Muted>
                <Button small kind="danger" title="Delete" onPress={() => confirmDelete(p)} style={{ alignSelf: 'flex-start' }} />
              </View>
            )) : null}
          </Card>
        );
      })}
    </View>
  );
}
