import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';

import { Button, Choice, ErrorText, Field, Row, Screen } from '@/components/ui';
import { addRecords, addRow, attachFile, uploadJpeg } from '@/lib/api';
import { isIsoDate, num, todayIso } from '@/lib/format';
import { pickPhotos, takePhoto, type Picked } from '@/lib/images';
import { CURRENCIES, KIND_LABEL, type PaymentKind, type RecordKind } from '@/lib/types';

const KINDS: RecordKind[] = ['visit', 'diagnosis', 'lab', 'medicine', 'vaccination', 'procedure', 'document'];
const TITLE: Record<RecordKind, [string, string]> = {
  visit: ['What was the visit for?', 'e.g. Consultation for fever'],
  diagnosis: ['Diagnosis', 'e.g. Typhoid, Type 2 diabetes'],
  lab: ['Test name', 'e.g. Hemoglobin A1c'],
  medicine: ['Medicine and strength', 'e.g. Glycomet 500 mg'],
  vaccination: ['Vaccine', 'e.g. Hepatitis B, dose 2'],
  procedure: ['Procedure', 'e.g. Appendectomy'],
  document: ['Document title', 'e.g. Discharge summary'],
  allergy: ['Allergy', ''],
};

export default function AddRecord() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [kind, setKind] = useState<RecordKind>('visit');
  const [date, setDate] = useState(todayIso());
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState('');
  const [country, setCountry] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [ongoing, setOngoing] = useState('no');
  const [notes, setNotes] = useState('');
  const [paid, setPaid] = useState('');
  const [cur, setCur] = useState('USD');
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function addPhoto(camera: boolean) {
    try {
      if (camera) { const p = await takePhoto(); if (p) setPhotos((s) => [...s, p]); }
      else setPhotos([...photos, ...(await pickPhotos(5 - photos.length))]);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open photos.'); }
  }

  async function save() {
    if (!title.trim()) { setErr(`Add the ${TITLE[kind][0].toLowerCase()}`); return; }
    if (!isIsoDate(date)) { setErr('Write the date as YYYY-MM-DD.'); return; }
    if (kind === 'lab' && num(value) == null) { setErr('Add the test result number.'); return; }
    setBusy(true); setErr('');
    try {
      const [rec] = await addRecords([{
        member_id: id, kind, occurred_on: date, title: title.trim(), provider: provider.trim() || null,
        country: country.trim() || null, value: kind === 'lab' ? num(value) : null, unit: kind === 'lab' ? unit.trim() || null : null,
        ongoing: kind === 'medicine' || kind === 'diagnosis' ? ongoing === 'yes' : null,
        notes: notes.trim() || null, source: 'manual', confidence: null,
      }]);
      for (const p of photos) await attachFile(id, rec.id, await uploadJpeg(id, p.base64), 'image/jpeg', 'Photo');
      const amount = num(paid);
      if (amount != null) {
        await addRow('payments', {
          member_id: id, record_id: rec.id, paid_on: date, description: title.trim(),
          kind: (['visit', 'medicine', 'lab', 'procedure', 'vaccination'].includes(kind) ? kind : 'other') as PaymentKind,
          doctor: provider.trim() || null, illness: kind === 'diagnosis' ? title.trim() : null, amount_paid: amount, currency: cur,
        });
      }
      router.back();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save the record.'); setBusy(false); }
  }

  return (
    <Screen>
      <Choice label="Type" options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} value={kind} onChange={setKind} />
      <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
      <Field label={TITLE[kind][0]} value={title} onChangeText={setTitle} placeholder={TITLE[kind][1]} />
      <Row>
        <Field label="Doctor or hospital" value={provider} onChangeText={setProvider} placeholder="e.g. Dr. R. Kumar, Apollo Hospitals" />
        <Field label="Country" value={country} onChangeText={setCountry} placeholder="e.g. India, USA" />
      </Row>
      {kind === 'lab' ? (
        <Row>
          <Field label="Result" value={value} onChangeText={setValue} keyboardType="decimal-pad" />
          <Field label="Unit" value={unit} onChangeText={setUnit} placeholder="e.g. %, mg/dL" />
        </Row>
      ) : null}
      {kind === 'medicine' || kind === 'diagnosis' ? (
        <Choice label="Still ongoing?" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} value={ongoing} onChange={setOngoing} />
      ) : null}
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Dose, results, what the doctor said" />
      <Row>
        <Field label="Amount you paid (optional)" value={paid} onChangeText={setPaid} keyboardType="decimal-pad" />
      </Row>
      {paid ? <Choice label="Currency" options={CURRENCIES} value={cur} onChange={setCur} /> : null}
      <Row>
        <Button title="Take photo" onPress={() => addPhoto(true)} />
        <Button title="Add from photos" onPress={() => addPhoto(false)} />
      </Row>
      {photos.length ? (
        <Row>{photos.map((p, i) => <Image key={i} source={{ uri: p.uri }} style={{ width: 72, height: 72, borderRadius: 8 }} />)}</Row>
      ) : null}
      <ErrorText>{err}</ErrorText>
      <Button kind="primary" title="Save record" busy={busy} onPress={save} />
    </Screen>
  );
}
