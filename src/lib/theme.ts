/**
 * Accent theme resolution — shared by the case page, cards and header.
 *
 * A project's `theme` is either a preset name (teal / blue / sand / dark)
 * or a custom hex like "#7EB2AC". Presets keep using the CSS in global.css
 * via `data-theme="name"`; custom hexes get `data-theme="custom"` plus an
 * inline `style` that defines the four --theme-* variables directly.
 */

export type ResolvedTheme = {
  /** value for the data-theme attribute */
  attr: string;
  /** inline style string (custom colours only) or undefined */
  style: string | undefined;
  /** a concrete colour, handy for dots/swatches */
  color: string;
};

const PRESETS: Record<string, string> = {
  teal: '#7EB2AC',
  blue: '#395F8E',
  sand: '#FBE4A3',
  dark: '#26292B',
};

const hexToRgb = (h: string): [number, number, number] => {
  let s = h.replace('#', '').trim();
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (rgb: number[]): string =>
  '#' + rgb.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
const mix = (a: number[], b: number[], t: number): number[] => a.map((x, i) => x + (b[i] - x) * t);
const luminance = ([r, g, b]: number[]): number => {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

export const isHex = (v?: string): boolean => !!v && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());

export function resolveTheme(theme?: string): ResolvedTheme {
  const t = (theme || 'teal').trim();
  if (PRESETS[t] !== undefined) return { attr: t, style: undefined, color: PRESETS[t] };
  if (isHex(t)) {
    const base = hexToRgb(t);
    const strong = rgbToHex(mix(base, [0, 0, 0], 0.42));
    const tint = rgbToHex(mix(base, [255, 255, 255], 0.72));
    const contrast = luminance(base) > 0.55 ? '#161616' : '#ffffff';
    const style = `--theme:${t}; --theme-strong:${strong}; --theme-tint:${tint}; --theme-contrast:${contrast};`;
    return { attr: 'custom', style, color: t };
  }
  return { attr: 'teal', style: undefined, color: PRESETS.teal };
}
