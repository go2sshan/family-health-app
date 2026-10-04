import { Platform } from 'react-native';

export const Colors = {
  light: {
    bg: '#f6f8f8',
    surface: '#ffffff',
    text: '#15262b',
    muted: '#5a6d72',
    line: '#dbe3e4',
    accent: '#0f6e7a',
    accentSoft: '#e1f0f1',
    onAccent: '#ffffff',
    good: '#2e7d4f',
    warn: '#a15c00',
    warnSoft: '#fbefdc',
    bad: '#b3261e',
    badSoft: '#fbe4e2',
  },
  dark: {
    bg: '#0f1719',
    surface: '#162226',
    text: '#e3ecee',
    muted: '#93a7ac',
    line: '#26363a',
    accent: '#5cc2cc',
    accentSoft: '#16363b',
    onAccent: '#0f1719',
    good: '#6fcf97',
    warn: '#f0b35c',
    warnSoft: '#3a2c14',
    bad: '#f2847b',
    badSoft: '#3d1d1b',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

export const Mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
