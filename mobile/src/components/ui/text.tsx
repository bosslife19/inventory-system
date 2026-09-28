import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'small' | 'caption' | 'eyebrow' | 'mono';
type Tone = 'default' | 'secondary' | 'muted' | 'primary' | 'critical' | 'warning' | 'ok' | 'inverse';

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: Fonts.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: Fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  heading: { fontFamily: Fonts.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: Fonts.regular, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: Fonts.semibold, fontSize: 14, lineHeight: 19 },
  small: { fontFamily: Fonts.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: Fonts.medium, fontSize: 12, lineHeight: 16 },
  eyebrow: { fontFamily: Fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' },
  mono: { fontFamily: Fonts.mono, fontSize: 13, lineHeight: 18 },
};

interface Props extends TextProps {
  variant?: Variant;
  tone?: Tone;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  align?: TextStyle['textAlign'];
}

/** App text: Inter at a fixed type scale, coloured by semantic tone. */
export function Text({ variant = 'body', tone = 'default', weight, align, style, ...rest }: Props) {
  const c = useTheme();
  const color = {
    default: c.text,
    secondary: c.text2,
    muted: c.muted,
    primary: c.primary,
    critical: c.critical,
    warning: c.warning,
    ok: c.ok,
    inverse: '#ffffff',
  }[tone];

  return (
    <RNText
      {...rest}
      style={[VARIANTS[variant], { color }, weight && { fontFamily: Fonts[weight] }, align && { textAlign: align }, style]}
    />
  );
}
