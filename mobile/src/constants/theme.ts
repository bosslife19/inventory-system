/**
 * Design tokens — the same blue / white / black system as the web dashboard
 * (web/src/index.css), so the app and the dashboards read as one product.
 * Status colours (critical, warning, ok) are reserved for stock state and
 * always ship with a label or icon, never colour alone.
 */

import '@/global.css';

import { Platform } from 'react-native';

const light = {
  bg: '#f3f6fb',
  surface: '#ffffff',
  surface2: '#f5f7fb',
  border: '#e3e8f0',
  borderStrong: '#cfd7e3',
  text: '#0a0f1c',
  text2: '#3a4353',
  muted: '#667085',
  primary: '#1d4ed8',
  primaryPressed: '#1e40af',
  primarySoft: '#e8eefd',
  onPrimary: '#ffffff',
  ink: '#0a0f1c', // the "black" brand surface (sidebar on web)
  ink2: '#131a2b',
  inkMuted: '#7a869c',
  critical: '#c4302b',
  criticalSoft: '#fdeceb',
  warning: '#a15c00',
  warningSoft: '#fff3dc',
  notice: '#1d4ed8',
  noticeSoft: '#e8eefd',
  ok: '#157a3c',
  okSoft: '#e4f5ea',
  // Chart / status marks (same as web --chart-* / --status-*)
  chart1: '#2a78d6',
  chart2: '#0a0f1c',
  chart3: '#a3abb9',
  statusCritical: '#d03b3b',
  statusWarning: '#f0a616',
  statusNotice: '#2a78d6',
  statusOk: '#1f9d4c',
  shadow: '#0a0f1c',
};

export type Palette = typeof light;

const dark: Palette = {
  bg: '#070a12',
  surface: '#0f1522',
  surface2: '#151c2c',
  border: '#232c3f',
  borderStrong: '#2f3a52',
  text: '#eef2f8',
  text2: '#c3cad7',
  muted: '#8d97aa',
  primary: '#4b86f5',
  primaryPressed: '#6b9cf7',
  primarySoft: '#16233f',
  onPrimary: '#ffffff',
  ink: '#05070d',
  ink2: '#111827',
  inkMuted: '#7a869c',
  critical: '#f2716a',
  criticalSoft: '#3a1b1a',
  warning: '#f0b35a',
  warningSoft: '#36290f',
  notice: '#7ea8f7',
  noticeSoft: '#16233f',
  ok: '#5fcf8a',
  okSoft: '#13301f',
  chart1: '#3987e5',
  chart2: '#e6ebf3',
  chart3: '#5d6679',
  statusCritical: '#d03b3b',
  statusWarning: '#f0a616',
  statusNotice: '#3987e5',
  statusOk: '#1f9d4c',
  shadow: '#000000',
};

export const Colors = { light, dark } as const;

/** Inter, loaded in the root layout (the web dashboard uses Inter too). */
export const Fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace' }),
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
  six: 24,
  eight: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/** Space the floating tab bar takes at the bottom of tab screens. */
export const TabBarInset = 104;
export const MaxContentWidth = 720;
