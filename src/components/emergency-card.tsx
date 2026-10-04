import { View } from 'react-native';

import { Avatar, Label, MonoText, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { ageOf, cmToFtIn, fmtDate, fullName, initials, kgToLb, power } from '@/lib/format';
import type { MemberDetail } from '@/lib/types';

/** Large-print card a doctor can read when the person can't explain for themselves. */
export function EmergencyCard({ d, large = false }: { d: MemberDetail; large?: boolean }) {
  const c = usePalette();
  const m = d.member;
  const age = ageOf(m.date_of_birth);
  const meds = d.records.filter((r) => r.kind === 'medicine' && r.ongoing);
  const conds = d.records.filter((r) => r.kind === 'diagnosis' && r.ongoing);
  const h = d.measurements.find((x) => x.height_cm);
  const w = d.measurements.find((x) => x.weight_kg);
  const eye = d.eyes[0];
  const f = large ? 1.3 : 1;
  const body = { fontSize: 16 * f, lineHeight: 23 * f };

  return (
    <View style={{ borderWidth: 2, borderColor: c.bad, borderRadius: 14, padding: Space.lg, gap: Space.md, backgroundColor: c.surface }}>
      <View style={{ flexDirection: 'row', gap: Space.md, alignItems: 'center' }}>
        <Avatar path={m.photo_path} initials={initials(m)} size={large ? 110 : 64} />
        <View style={{ flex: 1, gap: 2 }}>
          <T style={{ color: c.bad, fontSize: 12 * f, fontWeight: '800', letterSpacing: 1 }}>EMERGENCY HEALTH CARD</T>
          <T style={{ fontSize: 22 * f, fontWeight: '800' }}>{fullName(m)}</T>
          <T style={{ color: c.muted, fontSize: 14 * f }}>
            {[m.date_of_birth ? `Born ${fmtDate(m.date_of_birth)}` : null, age != null ? `age ${age}` : null, m.sex, m.language ? `speaks ${m.language}` : null].filter(Boolean).join(' · ')}
          </T>
        </View>
        <View accessible accessibilityLabel={`Blood group ${m.blood_group ?? 'not known'}`} style={{ borderWidth: 2, borderColor: c.bad, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center' }}>
          <MonoText style={{ color: c.bad, fontSize: 28 * f, fontWeight: '700' }}>{m.blood_group ?? '?'}</MonoText>
          <T style={{ color: c.bad, fontSize: 10 * f, fontWeight: '700' }}>BLOOD</T>
        </View>
      </View>

      {m.communicate ? (
        <View style={{ gap: 2 }}><Label>How to communicate with me</Label><T style={{ ...body, fontWeight: '700' }}>{m.communicate}</T></View>
      ) : null}

      <View style={{ gap: 2 }}>
        <Label>Allergies</Label>
        {d.allergies.length ? d.allergies.map((a) => (
          <T key={a.id} style={{ ...body, color: c.bad, fontWeight: '700' }}>
            {a.name} <T style={{ ...body, color: c.text, fontWeight: '400' }}>({a.kind}{a.reaction ? `: ${a.reaction}` : ''}{a.severity ? `, ${a.severity}` : ''})</T>
          </T>
        )) : <T style={body}>No known allergies recorded</T>}
      </View>

      <View style={{ gap: 2 }}>
        <Label>Conditions</Label>
        <T style={body}>{conds.length ? conds.map((x) => x.title).join(' · ') : 'None recorded'}</T>
      </View>

      <View style={{ gap: 2 }}>
        <Label>Current medicines</Label>
        {meds.length ? meds.map((x) => <T key={x.id} style={body}>{x.title}{x.notes ? `, ${x.notes}` : ''}</T>) : <T style={body}>None recorded</T>}
      </View>

      {m.care_needs ? <View style={{ gap: 2 }}><Label>Disability, devices or care needs</Label><T style={body}>{m.care_needs}</T></View> : null}

      <View style={{ gap: 2 }}>
        <Label>Body</Label>
        <T style={body}>
          Height {h?.height_cm ? `${cmToFtIn(h.height_cm)} (${Math.round(h.height_cm)} cm)` : '—'} · Weight {w?.weight_kg ? `${kgToLb(w.weight_kg)} lb (${w.weight_kg} kg)` : '—'}
        </T>
      </View>

      {eye ? (
        <View style={{ gap: 2 }}>
          <Label>Eye prescription ({fmtDate(eye.rx_date)})</Label>
          <MonoText style={body}>R {power(eye.r_sph)} / {power(eye.r_cyl)} × {eye.r_axis ?? '—'}   L {power(eye.l_sph)} / {power(eye.l_cyl)} × {eye.l_axis ?? '—'}{eye.add_power ? `   ADD ${power(eye.add_power)}` : ''}</MonoText>
        </View>
      ) : null}

      <View style={{ gap: 2 }}>
        <Label>Emergency contacts</Label>
        {d.contacts.length ? d.contacts.map((x) => (
          <T key={x.id} style={body} selectable>{x.name}{x.relationship ? ` (${x.relationship})` : ''}  <MonoText style={body}>{x.phone}</MonoText></T>
        )) : <T style={body}>None recorded</T>}
      </View>

      {m.primary_doctor ? <View style={{ gap: 2 }}><Label>Doctor</Label><T style={body}>{m.primary_doctor}</T></View> : null}
    </View>
  );
}
