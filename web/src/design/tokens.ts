/**
 * Tek gorsel kaynak. Bilesenlerde hard-coded renk/olcu kullanilmaz.
 */

export const colors = {
  background: '#060708',
  backgroundLift: '#0E1512',
  surface: '#111318',
  surfaceSecondary: '#171A20',
  textPrimary: '#F4F5F7',
  textSecondary: '#A5A9B2',
  textMuted: '#6F747D',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.12)',
  /** Karakterin kimlik rengi. Tek aksan rengi; palet buradan turer. */
  glow: '#3FD27A',
  glowAccent: '#A6F9C9',
  danger: '#C9645C',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

export const radius = {
  control: 10,
  panel: 18,
  pill: 999,
} as const;

export const typography = {
  family: "'Inter', 'SF Pro Text', 'Manrope', system-ui, -apple-system, sans-serif",
  subtitleDesktop: 28,
  subtitleMobile: 20,
  status: 12,
  label: 13,
  body: 14,
} as const;

export const duration = {
  instant: 120,
  fast: 180,
  base: 250,
  slow: 350,
  glow: 900,
} as const;

export const easing = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  soft: 'cubic-bezier(0.33, 1, 0.68, 1)',
} as const;

export const layer = {
  background: 0,
  ambient: 10,
  avatar: 20,
  subtitle: 30,
  status: 35,
  controls: 40,
  drawer: 60,
  modal: 80,
  toast: 100,
  debug: 200,
} as const;

export const breakpoint = {
  mobile: 640,
  tablet: 1024,
  desktop: 1440,
} as const;

/** tokens -> CSS custom properties */
export function tokensToCss(): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(colors)) lines.push(`--color-${kebab(key)}: ${value};`);
  for (const [key, value] of Object.entries(spacing)) lines.push(`--space-${key}: ${value}px;`);
  for (const [key, value] of Object.entries(radius)) lines.push(`--radius-${key}: ${value}px;`);
  for (const [key, value] of Object.entries(duration)) lines.push(`--dur-${key}: ${value}ms;`);
  for (const [key, value] of Object.entries(easing)) lines.push(`--ease-${key}: ${value};`);
  for (const [key, value] of Object.entries(layer)) lines.push(`--z-${key}: ${value};`);
  lines.push(`--font-family: ${typography.family};`);
  return `:root{${lines.join('')}}`;
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
