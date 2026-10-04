import { Pressable, View } from 'react-native';

import { Badge, Button, Muted, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePalette } from '@/hooks/use-palette';
import { doseText, panelColors, pillHex, time12, type Dose, type MedSchedule } from '@/lib/meds';
import type { Member } from '@/lib/types';

/** A person's colored panel: their name on a colored edge, so each family member is easy to spot. */
export function PersonPanel({ member, children, label }: { member: Member; children: React.ReactNode; label?: string }) {
  const c = usePalette();
  const dark = useColorScheme() === 'dark';
  const [bg, accent] = panelColors(member.color, dark);
  return (
    <View style={{ backgroundColor: bg, borderLeftWidth: 6, borderLeftColor: accent, borderRadius: 14, padding: Space.md, gap: Space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: accent }} />
        <T style={{ fontWeight: '800', color: c.text }}>{label ?? member.first_name}</T>
      </View>
      {children}
    </View>
  );
}

export function PillSwatch({ color, size = 22 }: { color: string | null; size?: number }) {
  const c = usePalette();
  const hex = pillHex(color);
  return (
    <View
      accessibilityLabel={color ? `${color} pill` : undefined}
      style={{ width: size, height: size * 0.62, borderRadius: size, backgroundColor: hex ?? c.surface, borderWidth: 1, borderColor: c.muted }}
    />
  );
}

export function MedLine({ s }: { s: MedSchedule }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <PillSwatch color={s.pill_color} />
        <T style={{ fontSize: 18, fontWeight: '700', flexShrink: 1 }}>{s.name}{s.strength ? ` ${s.strength}` : ''}</T>
      </View>
      <Muted>{[doseText(s), s.pill_color ? `${s.pill_color} ${s.form}` : s.form, s.instructions].filter(Boolean).join(' · ')}</Muted>
    </View>
  );
}

/** Status line for an answered reminder, or the Taken / Missed buttons. */
export function DoseActions({
  dose, due, now, canMark, busy, onMark, onUndo, whoLogged,
}: {
  dose: Dose | null; due: Date; now: number; canMark: boolean; busy: boolean;
  onMark: (s: 'taken' | 'missed') => void; onUndo: () => void; whoLogged: (id: string | null) => string;
}) {
  const c = usePalette();
  if (dose) {
    const at = new Date(dose.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Badge tone={dose.status === 'taken' ? 'good' : 'bad'} text={dose.status === 'taken' ? `Taken · ${at}` : `Missed · marked ${at}`} />
        <Muted style={{ fontSize: 12, flexShrink: 1 }}>by {whoLogged(dose.owner)}</Muted>
        {canMark ? (
          <Pressable accessibilityRole="button" onPress={onUndo} hitSlop={8}>
            <T style={{ color: c.accent, fontWeight: '600', fontSize: 14 }}>Change</T>
          </Pressable>
        ) : null}
      </View>
    );
  }
  const overdue = due.getTime() < now - 15 * 60_000;
  return (
    <View style={{ gap: 6 }}>
      {overdue ? <T style={{ color: c.warn, fontWeight: '600', fontSize: 14 }}>Due {time12(`${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`)} · not marked yet</T> : null}
      {canMark ? (
        <View style={{ flexDirection: 'row', gap: Space.sm }}>
          <Button kind="primary" title="Taken" busy={busy} onPress={() => onMark('taken')} style={{ flex: 1 }} />
          <Button kind="danger" title="Missed" disabled={busy} onPress={() => onMark('missed')} style={{ flex: 1 }} />
        </View>
      ) : <Muted style={{ fontSize: 13 }}>Only people who can edit this profile can mark doses.</Muted>}
    </View>
  );
}
