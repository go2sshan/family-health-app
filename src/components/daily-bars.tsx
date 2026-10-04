import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Muted, T } from '@/components/ui';
import { Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { fmtDate } from '@/lib/format';

export type Point = { day: string; value: number };

/**
 * One series of daily bars, oldest on the left. Tap a bar to read its exact value;
 * the latest value is labeled by default. Bars grow from a zero baseline.
 */
export function DailyBars({ points, days = 30, format, label }: {
  points: Point[]; days?: number; format: (v: number) => string; label: string;
}) {
  const c = usePalette();
  const end = new Date();
  const slots: (Point | null)[] = [];
  const byDay = new Map(points.map((p) => [p.day, p]));
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 864e5);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    slots.push(byDay.get(key) ?? { day: key, value: 0 });
  }
  const latest = [...slots].reverse().find((s) => s && s.value > 0) ?? null;
  const [picked, setPicked] = useState<Point | null>(null);
  const shown = picked ?? latest;
  const max = Math.max(...slots.map((s) => s?.value ?? 0), 1);
  const H = 72;

  if (!points.length) return <Muted>No {label.toLowerCase()} recorded in the last {days} days.</Muted>;

  return (
    <View style={{ gap: Space.xs }}>
      <T style={{ fontSize: 14, color: c.muted }}>
        {shown ? <T style={{ fontSize: 14, fontWeight: '700' }}>{format(shown.value)}</T> : null}
        {shown ? ` on ${fmtDate(shown.day)}` : ''}
      </T>
      <View
        accessible
        accessibilityLabel={`${label}, last ${days} days. Latest ${latest ? format(latest.value) : 'none'}.`}
        style={{ flexDirection: 'row', alignItems: 'flex-end', height: H, gap: 2, borderBottomWidth: 1, borderBottomColor: c.line }}>
        {slots.map((s, i) => {
          const v = s?.value ?? 0;
          const on = shown && s && shown.day === s.day;
          return (
            <Pressable
              key={i}
              onPress={() => setPicked(s && v > 0 ? s : null)}
              hitSlop={{ top: 12, bottom: 4 }}
              style={{ flex: 1, height: H, justifyContent: 'flex-end' }}>
              <View style={{
                height: v > 0 ? Math.max(3, (v / max) * H) : 0,
                backgroundColor: c.accent,
                opacity: on ? 1 : 0.55,
                borderTopLeftRadius: 3, borderTopRightRadius: 3,
              }} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Muted style={{ fontSize: 12 }}>{fmtDate(slots[0]?.day)}</Muted>
        <Muted style={{ fontSize: 12 }}>Today</Muted>
      </View>
    </View>
  );
}
