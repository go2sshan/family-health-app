import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Choice, ErrorText, Field, Muted, Row, Screen } from '@/components/ui';
import { useMember } from '@/hooks/use-member';
import { addRow } from '@/lib/api';
import { isIsoDate, num, todayIso } from '@/lib/format';
import { guessIllness, NOT_LINKED } from '@/lib/illness';
import { CURRENCIES, type MemberDetail, type PaymentKind } from '@/lib/types';

const KIND_FOR: Record<string, PaymentKind> = { visit: 'visit', medicine: 'medicine', lab: 'lab', procedure: 'procedure', vaccination: 'vaccination' };

export default function AddPayment() {
  const { id, recordId } = useLocalSearchParams<{ id: string; recordId?: string }>();
  const { detail } = useMember(id);
  if (!detail) return <View style={{ padding: 40 }}><ActivityIndicator /></View>;
  return <PaymentForm id={id} detail={detail} recordId={recordId} />;
}

function PaymentForm({ id, detail, recordId }: { id: string; detail: MemberDetail; recordId?: string }) {
  const record = detail.records.find((r) => r.id === recordId);
  const illnesses = [...new Set(detail.records.filter((r) => r.kind === 'diagnosis').map((r) => r.title))];

  const [what, setWhat] = useState(record?.title ?? '');
  const [date, setDate] = useState(record?.occurred_on ?? todayIso());
  const [cur, setCur] = useState(/india/i.test(record?.country ?? '') ? 'INR' : 'USD');
  const [paid, setPaid] = useState('');
  const [ins, setIns] = useState('');
  const [billed, setBilled] = useState('');
  const [illness, setIllness] = useState(record ? guessIllness(`${record.title} ${record.notes ?? ''}`, illnesses) : NOT_LINKED);
  const [doctor, setDoctor] = useState(record?.provider ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    const amount = num(paid);
    if (!what.trim() || amount == null) { setErr('Add what it was for and the amount you paid.'); return; }
    if (!isIsoDate(date)) { setErr('Write the date as YYYY-MM-DD.'); return; }
    setBusy(true); setErr('');
    try {
      await addRow('payments', {
        member_id: id, record_id: record?.id ?? null, paid_on: date, description: what.trim(),
        kind: record ? KIND_FOR[record.kind] ?? 'other' : 'other', doctor: doctor.trim() || null, illness,
        amount_paid: amount, insurance_paid: num(ins), billed: num(billed), currency: cur, note: note.trim() || null,
      });
      router.back();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save the payment.'); setBusy(false); }
  }

  return (
    <Screen>
      <Field label="For" value={what} onChangeText={setWhat} editable={!record} placeholder="e.g. Pharmacy, travel to hospital" />
      <Field label="Date paid (YYYY-MM-DD)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
      <Choice label="Currency" options={CURRENCIES} value={cur} onChange={setCur} />
      <Row>
        <Field label="You paid" value={paid} onChangeText={setPaid} keyboardType="decimal-pad" autoFocus />
        <Field label="Insurance paid" value={ins} onChangeText={setIns} keyboardType="decimal-pad" />
        <Field label="Total billed" value={billed} onChangeText={setBilled} keyboardType="decimal-pad" />
      </Row>
      <Choice label="Illness" options={[...illnesses, NOT_LINKED]} value={illness} onChange={setIllness} />
      <Field label="Doctor or provider" value={doctor} onChangeText={setDoctor} />
      <Field label="Notes" value={note} onChangeText={setNote} placeholder="e.g. paid by card, receipt number" />
      <Muted>Payments are totaled by illness, doctor, type and year on the Payments tab.</Muted>
      <ErrorText>{err}</ErrorText>
      <Button kind="primary" title="Save payment" busy={busy} onPress={save} />
    </Screen>
  );
}
