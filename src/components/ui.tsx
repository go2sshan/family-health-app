import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';

import { Mono, Space } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { signedUrl } from '@/lib/api';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const c = usePalette();
  if (!scroll) return <View style={[styles.screen, { backgroundColor: c.bg }]}>{children}</View>;
  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={styles.screenContent}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

type TProps = { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number; selectable?: boolean };
export function T({ children, style, ...rest }: TProps) {
  const c = usePalette();
  return <Text style={[{ color: c.text, fontSize: 16, lineHeight: 22 }, style]} {...rest}>{children}</Text>;
}
export function Muted({ children, style, ...rest }: TProps) {
  const c = usePalette();
  return <Text style={[{ color: c.muted, fontSize: 14, lineHeight: 20 }, style]} {...rest}>{children}</Text>;
}
export function H({ children, style }: TProps) {
  const c = usePalette();
  return <Text accessibilityRole="header" style={[{ color: c.text, fontSize: 18, fontWeight: '700' }, style]}>{children}</Text>;
}
export function Label({ children }: { children: ReactNode }) {
  const c = usePalette();
  return <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>{children}</Text>;
}
export function MonoText({ children, style }: TProps) {
  const c = usePalette();
  return <Text style={[{ color: c.text, fontFamily: Mono, fontVariant: ['tabular-nums'] }, style]}>{children}</Text>;
}

export function Card({ children, style, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'bad' | 'warn' }) {
  const c = usePalette();
  const border = tone === 'bad' ? c.bad : tone === 'warn' ? c.warn : c.line;
  const bg = tone === 'bad' ? c.badSoft : tone === 'warn' ? c.warnSoft : c.surface;
  return <View style={[styles.card, { backgroundColor: bg, borderColor: border }, style]}>{children}</View>;
}

type BtnProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string; kind?: 'primary' | 'plain' | 'danger'; busy?: boolean; style?: StyleProp<ViewStyle>; small?: boolean;
};
export function Button({ title, kind = 'plain', busy, disabled, style, small, ...rest }: BtnProps) {
  const c = usePalette();
  const bg = kind === 'primary' ? c.accent : c.surface;
  const fg = kind === 'primary' ? c.onAccent : kind === 'danger' ? c.bad : c.text;
  const border = kind === 'primary' ? c.accent : kind === 'danger' ? c.bad : c.line;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.btn, small && styles.btnSmall,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }, style,
      ]}
      {...rest}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 14 : 16 }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, style, ...rest }: TextInputProps & { label: string }) {
  const c = usePalette();
  return (
    <View style={[{ gap: 4, flexGrow: 1, flexBasis: 140 }, style as StyleProp<ViewStyle>]}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={c.muted}
        style={[styles.input, { color: c.text, borderColor: c.line, backgroundColor: c.surface }, rest.multiline && { minHeight: 72, textAlignVertical: 'top' }]}
        accessibilityLabel={label}
        {...rest}
      />
    </View>
  );
}

/** A row of choices; one is selected. */
export function Choice<V extends string>({ label, options, value, onChange }: {
  label?: string; options: readonly (V | { readonly value: V; readonly label: string })[]; value: V | null; onChange: (v: V) => void;
}) {
  const c = usePalette();
  const opts = options.map((o) => (typeof o === 'string' ? { value: o as V, label: o as string } : (o as { value: V; label: string })));
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <View style={styles.wrap}>
        {opts.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={[styles.chip, { borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface }]}>
              <Text style={{ color: on ? c.text : c.muted, fontWeight: '600', fontSize: 14 }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Badge({ text, tone }: { text: string; tone?: 'bad' | 'good' | 'accent' }) {
  const c = usePalette();
  const color = tone === 'bad' ? c.bad : tone === 'good' ? c.good : tone === 'accent' ? c.accent : c.muted;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.wrap, style]}>{children}</View>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const c = usePalette();
  if (!children) return null;
  return <Text accessibilityLiveRegion="polite" style={{ color: c.bad, fontSize: 14 }}>{children}</Text>;
}

/** Shows a private photo from storage, or initials while there is none. */
export function Avatar({ path, initials, size = 56 }: { path: string | null; initials: string; size?: number }) {
  const c = usePalette();
  const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    if (path) signedUrl(path).then((u) => { if (live) setLoaded({ path, url: u }); });
    return () => { live = false; };
  }, [path]);
  const url = path && loaded?.path === path ? loaded.url : null;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.line }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="cover" accessibilityLabel="Profile photo" />
      ) : (
        <Text style={{ color: c.accent, fontSize: size * 0.36, fontWeight: '700' }}>{initials}</Text>
      )}
    </View>
  );
}

export function PrivateImage({ path, size = 84 }: { path: string; size?: number }) {
  const c = usePalette();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let live = true; signedUrl(path).then((u) => live && setUrl(u)); return () => { live = false; }; }, [path]);
  return (
    <View style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', backgroundColor: c.line }}>
      {url ? <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="cover" accessibilityLabel="Scanned page" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { padding: Space.lg, gap: Space.md, paddingBottom: 48 },
  card: { borderWidth: 1, borderRadius: 12, padding: Space.lg, gap: Space.sm },
  btn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: 34, paddingHorizontal: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
