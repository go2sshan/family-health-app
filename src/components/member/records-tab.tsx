import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { Badge, Button, Card, Choice, Muted, PrivateImage, Row, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { deleteRow } from '@/lib/api';
import { fmtDate, money } from '@/lib/format';
import { PENICILLIN_FAMILY } from '@/lib/illness';
import { KIND_LABEL, type MemberDetail, type RecordKind } from '@/lib/types';

type Filter = 'all' | RecordKind;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'visit', label: 'Visits' }, { value: 'diagnosis', label: 'Diagnoses' },
  { value: 'medicine', label: 'Medicines' }, { value: 'lab', label: 'Labs' }, { value: 'vaccination', label: 'Vaccines' },
  { value: 'procedure', label: 'Procedures' }, { value: 'document', label: 'Documents' },
];
const PAYABLE: RecordKind[] = ['visit', 'medicine', 'lab', 'procedure', 'vaccination'];

export function RecordsTab({ d, reload }: { d: MemberDetail; reload: () => void }) {
  const c = usePalette();
  const [filter, setFilter] = useState<Filter>('all');
  const id = d.member.id;

  const allergyWarnings = useMemo(() => {
    const meds = d.records.filter((r) => r.kind === 'medicine' && r.ongoing);
    const out: { med: string; allergy: string }[] = [];
    for (const a of d.allergies.filter((x) => x.kind === 'medicine')) {
      const an = a.name.toLowerCase();
      for (const m of meds) {
        const mn = m.title.toLowerCase();
        if (mn.includes(an) || an.split(/\W+/).some((w) => w.length > 4 && mn.includes(w)) || (an.includes('penicillin') && PENICILLIN_FAMILY.test(mn))) {
          out.push({ med: m.title, allergy: a.name });
        }
      }
    }
    return out;
  }, [d]);

  const list = d.records.filter((r) => filter === 'all' || r.kind === filter);
  const yearOf = (i: number) => list[i]?.occurred_on?.slice(0, 4) ?? 'Undated';

  function confirmDelete(recId: string, title: string) {
    Alert.alert('Delete this record?', `"${title}" and its scanned pages will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteRow('records', recId); reload(); } },
    ]);
  }

  return (
    <View style={{ gap: Space.md }}>
      {d.role !== 'view' ? <Row>
        <Button kind="primary" title="Photo of prescription" onPress={() => router.push({ pathname: '/member/[id]/scan', params: { id, hint: 'prescription', camera: '1' } })} />
        <Button kind="primary" title="Photo of bill" onPress={() => router.push({ pathname: '/member/[id]/scan', params: { id, hint: 'bill', camera: '1' } })} />
        <Button title="Scan other document" onPress={() => router.push({ pathname: '/member/[id]/scan', params: { id } })} />
        <Button title="Add a record" onPress={() => router.push({ pathname: '/member/[id]/add-record', params: { id } })} />
      </Row> : null}

      {allergyWarnings.map((w) => (
        <Card key={w.med + w.allergy} tone="bad">
          <T style={{ fontWeight: '700' }}>Allergy warning: {w.med}</T>
          <T>This person is listed as allergic to {w.allergy}. Tell the doctor or pharmacist before taking this medicine.</T>
        </Card>
      ))}

      <Choice options={FILTERS} value={filter} onChange={setFilter} />

      {list.length === 0 ? (
        <Muted>No records yet. Take a photo of a prescription, report or bill, from any country, and it becomes part of this history.</Muted>
      ) : null}

      {list.map((r, i) => {
        const header = i === 0 || yearOf(i) !== yearOf(i - 1) ? yearOf(i) : null;
        const pays = d.payments.filter((p) => p.record_id === r.id);
        return (
          <View key={r.id} style={{ gap: Space.sm }}>
            {header ? <Muted style={{ marginTop: Space.sm, fontWeight: '700', letterSpacing: 1 }}>{header}</Muted> : null}
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Badge tone="accent" text={KIND_LABEL[r.kind]} />
                <Muted>{fmtDate(r.occurred_on)}</Muted>
              </Row>
              <T style={{ fontWeight: '700' }}>{r.title}{r.value != null ? `: ${r.value} ${r.unit ?? ''}` : ''}</T>
              {r.provider || r.country ? <Muted>{[r.provider, r.country].filter(Boolean).join(' · ')}</Muted> : null}
              {r.notes ? <T style={{ fontSize: 15 }}>{r.notes}</T> : null}
              <Row>
                {r.ongoing && (r.kind === 'medicine' || r.kind === 'diagnosis') ? <Badge tone="good" text="Ongoing" /> : null}
                {r.source === 'scan' ? <Badge text="From a scan" /> : null}
                {r.confidence === 'low' ? <Badge tone="bad" text="Check: read with low confidence" /> : null}
              </Row>
              {r.record_files?.length ? (
                <Row>{r.record_files.map((f) => <PrivateImage key={f.id} path={f.storage_path} />)}</Row>
              ) : null}
              {pays.map((p) => (
                <T key={p.id} style={{ color: c.good, fontSize: 14 }}>
                  Paid {money(p.amount_paid, p.currency)}{p.insurance_paid ? ` · insurance ${money(p.insurance_paid, p.currency)}` : ''}
                </T>
              ))}
              {d.role !== 'view' ? <Row>
                {PAYABLE.includes(r.kind) ? (
                  <Button small title="Add payment" onPress={() => router.push({ pathname: '/member/[id]/add-payment', params: { id, recordId: r.id } })} />
                ) : null}
                <Button small kind="danger" title="Delete" onPress={() => confirmDelete(r.id, r.title)} />
              </Row> : null}
            </Card>
          </View>
        );
      })}
    </View>
  );
}
