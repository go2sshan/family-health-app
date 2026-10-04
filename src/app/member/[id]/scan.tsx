import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Switch, View } from 'react-native';

import { Badge, Button, Card, Choice, ErrorText, Field, H, Muted, Row, Screen, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { useMember } from '@/hooks/use-member';
import { usePalette } from '@/hooks/use-palette';
import { addRecords, addRow, attachFile, uploadJpeg, type NewRecord } from '@/lib/api';
import { isIsoDate, num } from '@/lib/format';
import { pickPhotos, takePhoto, type Picked } from '@/lib/images';
import { guessIllness, NOT_LINKED } from '@/lib/illness';
import { scanDocument, type ScanResult } from '@/lib/scan';
import { KIND_LABEL, type PaymentKind, type RecordKind } from '@/lib/types';

type Draft = {
  include: boolean; kind: Exclude<RecordKind, 'document'>; date: string; title: string; value: string; unit: string;
  ongoing: boolean; notes: string; paid: string; currency: string; confidence: 'high' | 'medium' | 'low';
};
const KINDS: Draft['kind'][] = ['visit', 'diagnosis', 'lab', 'medicine', 'vaccination', 'procedure', 'allergy'];
const MAX_PAGES = 5;

export default function Scan() {
  const { id, hint, camera } = useLocalSearchParams<{ id: string; hint?: 'prescription' | 'bill'; camera?: string }>();
  const c = usePalette();
  const { detail } = useMember(id);
  const [pages, setPages] = useState<Picked[]>([]);
  const [country, setCountry] = useState('');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [doc, setDoc] = useState<ScanResult | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const opened = useRef(false);

  async function add(fromCamera: boolean) {
    setErr('');
    try {
      if (fromCamera) { const p = await takePhoto(); if (p) setPages((s) => [...s, p].slice(0, MAX_PAGES)); }
      else { const ps = await pickPhotos(MAX_PAGES - pages.length); setPages((s) => [...s, ...ps].slice(0, MAX_PAGES)); }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open the camera.'); }
  }

  useEffect(() => {
    if (camera === '1' && !opened.current) { opened.current = true; add(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  async function read() {
    if (!pages.length) return;
    setReading(true); setErr(''); setDoc(null); setDrafts([]);
    try {
      const knownLabs = [...new Set((detail?.records ?? []).filter((r) => r.kind === 'lab').map((r) => r.title))];
      const res = await scanDocument(pages.map((p) => p.base64), { hint: hint ?? null, country: country.trim() || null, knownLabs });
      if (!res.items.length) { setErr('No medical entries could be read. Try a sharper, well-lit photo.'); return; }
      if (!country && res.country) setCountry(res.country);
      const docDate = isIsoDate(res.documentDate) ? res.documentDate : '';
      setDoc(res);
      setDrafts(res.items.map((it) => ({
        include: true, kind: it.kind, date: isIsoDate(it.date) ? it.date : docDate, title: it.title,
        value: it.value == null ? '' : String(it.value), unit: it.unit ?? '', ongoing: it.ongoing, notes: it.notes,
        paid: it.amountPaid == null ? '' : String(it.amountPaid),
        currency: it.currency && /^[A-Z]{3}$/.test(it.currency) ? it.currency : /india/i.test(res.country ?? country) ? 'INR' : 'USD',
        confidence: it.confidence,
      })));
    } catch (e) { setErr(e instanceof Error ? e.message : 'The document could not be read.'); }
    finally { setReading(false); }
  }

  const patch = (i: number, p: Partial<Draft>) => setDrafts((s) => s.map((d, j) => (j === i ? { ...d, ...p } : d)));

  async function save() {
    const chosen = drafts.filter((d) => d.include);
    if (!chosen.length) { setErr('Select at least one entry.'); return; }
    const bad = chosen.find((d) => !isIsoDate(d.date) || !d.title.trim() || (d.kind === 'lab' && num(d.value) == null));
    if (bad) { setErr(`"${bad.title || 'An entry'}" needs a date (YYYY-MM-DD)${bad.kind === 'lab' ? ' and a result' : ''}.`); return; }
    setSaving(true); setErr('');
    try {
      const provider = [doc?.doctor, doc?.facility].filter(Boolean).join(', ') || null;
      const where = country.trim() || doc?.country || null;
      const docDate = isIsoDate(doc?.documentDate) ? doc!.documentDate! : chosen[0].date;
      const illnesses = [...new Set([
        ...(detail?.records ?? []).filter((r) => r.kind === 'diagnosis').map((r) => r.title),
        ...chosen.filter((d) => d.kind === 'diagnosis').map((d) => d.title.trim()),
      ])];

      // 1) the scanned document itself, with its pages
      const [docRec] = await addRecords([{
        member_id: id, kind: 'document', occurred_on: docDate, title: doc?.documentType || 'Scanned document', provider,
        country: where, value: null, unit: null, ongoing: null,
        notes: `${chosen.length} entr${chosen.length === 1 ? 'y' : 'ies'} added from this document${doc?.language && !/english/i.test(doc.language) ? ` (translated from ${doc.language})` : ''}.`,
        source: 'scan', confidence: null,
      }]);
      for (const p of pages) await attachFile(id, docRec.id, await uploadJpeg(id, p.base64), 'image/jpeg', 'Scanned page');

      // 2) allergies go to the allergy list; everything else becomes a history record
      for (const a of chosen.filter((d) => d.kind === 'allergy')) {
        await addRow('allergies', { member_id: id, kind: 'medicine', name: a.title.trim(), reaction: a.notes || null, severity: 'moderate' });
      }
      const recs: NewRecord[] = chosen.filter((d) => d.kind !== 'allergy').map((d) => ({
        member_id: id, kind: d.kind, occurred_on: d.date, title: d.title.trim(), provider, country: where,
        value: d.kind === 'lab' ? num(d.value) : null, unit: d.kind === 'lab' ? d.unit.trim() || null : null,
        ongoing: d.kind === 'medicine' || d.kind === 'diagnosis' ? d.ongoing : null,
        notes: d.notes.trim() || null, source: 'scan', confidence: d.confidence,
      }));
      const saved = await addRecords(recs);

      // 3) payments read from bills
      const withPay = chosen.filter((d) => d.kind !== 'allergy');
      for (let i = 0; i < withPay.length; i++) {
        const d = withPay[i]; const amount = num(d.paid);
        if (amount == null) continue;
        await addRow('payments', {
          member_id: id, record_id: saved[i]?.id ?? null, paid_on: d.date, description: d.title.trim(),
          kind: (['visit', 'medicine', 'lab', 'procedure', 'vaccination'].includes(d.kind) ? d.kind : 'other') as PaymentKind,
          doctor: provider, illness: d.kind === 'diagnosis' ? d.title.trim() : guessIllness(`${d.title} ${d.notes}`, illnesses) || NOT_LINKED,
          amount_paid: amount, currency: d.currency, note: 'From scanned bill',
        });
      }
      router.back();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save. Your photos are still here; try again.'); setSaving(false); }
  }

  return (
    <Screen>
      <Muted>
        {hint === 'bill' ? 'Photograph the bill or receipt. Each charged line becomes a payment you can check.'
          : hint === 'prescription' ? 'Photograph the prescription. Each medicine, diagnosis and the visit become entries you can check.'
            : 'Photograph a prescription, lab report, discharge summary, vaccination card or bill, from any country and in any language.'}
      </Muted>
      <Row>
        <Button title="Take photo" onPress={() => add(true)} disabled={pages.length >= MAX_PAGES || reading} />
        <Button title="Choose photos" onPress={() => add(false)} disabled={pages.length >= MAX_PAGES || reading} />
      </Row>
      {pages.length ? (
        <Row>
          {pages.map((p, i) => <Image key={i} source={{ uri: p.uri }} style={{ width: 84, height: 84, borderRadius: 8 }} accessibilityLabel={`Page ${i + 1}`} />)}
          <Button small title="Clear" onPress={() => { setPages([]); setDoc(null); setDrafts([]); }} />
        </Row>
      ) : null}
      <Field label="Country where the care happened (optional)" value={country} onChangeText={setCountry} placeholder="e.g. India" />
      <Button kind="primary" title={reading ? 'Reading the document…' : 'Read document'} busy={reading} disabled={!pages.length} onPress={read} />
      <Muted>Reading sends only these photos, securely, to be read by Claude. Nothing is saved until you tap Save below.</Muted>
      <ErrorText>{err}</ErrorText>

      {doc ? (
        <View style={{ gap: Space.md }}>
          <H>Check each entry</H>
          <Muted>{[doc.documentType, doc.facility, doc.doctor, doc.language && !/english/i.test(doc.language) ? `translated from ${doc.language}` : null].filter(Boolean).join(' · ')}</Muted>
          {drafts.map((d, i) => (
            <Card key={i} tone={d.confidence === 'low' ? 'warn' : undefined}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Badge tone={d.confidence === 'low' ? 'bad' : d.confidence === 'high' ? 'good' : undefined} text={`${d.confidence} confidence`} />
                <Row><T>Include</T><Switch value={d.include} onValueChange={(v) => patch(i, { include: v })} accessibilityLabel={`Include ${d.title}`} trackColor={{ true: c.accent }} /></Row>
              </Row>
              <Choice options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} value={d.kind} onChange={(k) => patch(i, { kind: k })} />
              <Field label="Entry" value={d.title} onChangeText={(v) => patch(i, { title: v })} />
              <Field label="Date (YYYY-MM-DD)" value={d.date} onChangeText={(v) => patch(i, { date: v })} keyboardType="numbers-and-punctuation" />
              {d.kind === 'lab' ? (
                <Row>
                  <Field label="Result" value={d.value} onChangeText={(v) => patch(i, { value: v })} keyboardType="decimal-pad" />
                  <Field label="Unit" value={d.unit} onChangeText={(v) => patch(i, { unit: v })} />
                </Row>
              ) : null}
              {d.kind === 'medicine' || d.kind === 'diagnosis' ? (
                <Row><T>Still ongoing</T><Switch value={d.ongoing} onValueChange={(v) => patch(i, { ongoing: v })} trackColor={{ true: c.accent }} /></Row>
              ) : null}
              <Field label="Notes" value={d.notes} onChangeText={(v) => patch(i, { notes: v })} multiline />
              {d.kind !== 'allergy' ? (
                <Row>
                  <Field label="Amount paid" value={d.paid} onChangeText={(v) => patch(i, { paid: v })} keyboardType="decimal-pad" />
                  <Field label="Currency" value={d.currency} onChangeText={(v) => patch(i, { currency: v.toUpperCase().slice(0, 3) })} autoCapitalize="characters" />
                </Row>
              ) : null}
            </Card>
          ))}
          <Button kind="primary" title={`Save ${drafts.filter((d) => d.include).length} entries`} busy={saving} onPress={save} />
        </View>
      ) : null}
    </Screen>
  );
}
