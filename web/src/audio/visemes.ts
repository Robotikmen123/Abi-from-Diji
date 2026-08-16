/**
 * Turkce icin grafem -> viseme cozumleyici.
 * Turkce yazim buyuk olcude fonetik oldugu icin harf tabanli esleme,
 * ayri bir fonem motoru olmadan yuksek dogrulukta agiz hareketi verir.
 */

export type Viseme = 'SIL' | 'AA' | 'EE' | 'IH' | 'OH' | 'WQ' | 'MBP' | 'FV' | 'L' | 'SS' | 'KK';

export interface MouthShape {
  /** Cene acikligi */
  open: number;
  /** Agiz genisligi (gulumseme degil, yatay gerilme) */
  wide: number;
  /** Dudak yuvarlakligi */
  round: number;
  /** Dis gorunurlugu */
  teeth: number;
  /** Dudak baskisi (kapali sessizler) */
  press: number;
}

export const MOUTH_SHAPES: Record<Viseme, MouthShape> = {
  SIL: { open: 0.02, wide: 0.12, round: 0.06, teeth: 0.0, press: 0.1 },
  AA: { open: 0.92, wide: 0.42, round: 0.06, teeth: 0.28, press: 0.0 },
  EE: { open: 0.5, wide: 0.78, round: 0.0, teeth: 0.5, press: 0.0 },
  IH: { open: 0.26, wide: 0.7, round: 0.0, teeth: 0.42, press: 0.0 },
  OH: { open: 0.62, wide: 0.1, round: 0.72, teeth: 0.1, press: 0.0 },
  WQ: { open: 0.3, wide: 0.02, round: 0.95, teeth: 0.0, press: 0.05 },
  MBP: { open: 0.0, wide: 0.24, round: 0.1, teeth: 0.0, press: 0.95 },
  FV: { open: 0.14, wide: 0.46, round: 0.05, teeth: 0.78, press: 0.55 },
  L: { open: 0.34, wide: 0.44, round: 0.05, teeth: 0.55, press: 0.0 },
  SS: { open: 0.16, wide: 0.6, round: 0.12, teeth: 0.72, press: 0.1 },
  KK: { open: 0.3, wide: 0.36, round: 0.1, teeth: 0.2, press: 0.0 },
};

const LETTER_VISEME: Record<string, Viseme> = {
  a: 'AA', â: 'AA',
  e: 'EE',
  i: 'IH', ı: 'IH', î: 'IH',
  o: 'OH', ö: 'OH',
  u: 'WQ', ü: 'WQ', û: 'WQ', w: 'WQ',
  m: 'MBP', b: 'MBP', p: 'MBP',
  f: 'FV', v: 'FV',
  l: 'L', n: 'L', t: 'L', d: 'L', r: 'L',
  s: 'SS', z: 'SS', ş: 'SS', ç: 'SS', c: 'SS', j: 'SS', x: 'SS',
  k: 'KK', g: 'KK', ğ: 'KK', h: 'KK', y: 'KK', q: 'KK',
};

/** Sesli harfler daha uzun tutulur; konusma ritmi bundan doguyor. */
const VISEME_WEIGHT: Record<Viseme, number> = {
  SIL: 0.7,
  AA: 1.45, EE: 1.3, IH: 1.15, OH: 1.35, WQ: 1.2,
  MBP: 0.75, FV: 0.8, L: 0.8, SS: 0.9, KK: 0.8,
};

export interface VisemeEntry {
  charIndex: number;
  viseme: Viseme;
  weight: number;
  /** Kumulatif agirlik (bu ogenin sonu) */
  end: number;
}

export class VisemeTrack {
  readonly entries: VisemeEntry[] = [];
  readonly totalWeight: number;
  /** charIndex -> kumulatif agirlik araması icin sirali dizin. */
  private readonly charStops: number[] = [];

  constructor(readonly text: string) {
    const lower = text.toLocaleLowerCase('tr');
    let cursor = 0;
    let previous: Viseme | null = null;

    for (let i = 0; i < lower.length; i += 1) {
      const char = lower[i] as string;
      let viseme: Viseme | undefined = LETTER_VISEME[char];

      if (!viseme) {
        // Bosluk ve noktalama: kisa kapanis. Ard arda gelenler tek sayilir.
        if (previous === 'SIL') {
          this.charStops[i] = cursor;
          continue;
        }
        viseme = 'SIL';
      } else if (viseme === previous) {
        // Cift harf (anne, kitap) tek agiz hareketi, ama biraz uzar.
        const last = this.entries[this.entries.length - 1];
        if (last) {
          last.weight += 0.35;
          cursor += 0.35;
          last.end = cursor;
          this.charStops[i] = cursor;
          continue;
        }
      }

      const weight = VISEME_WEIGHT[viseme];
      cursor += weight;
      this.entries.push({ charIndex: i, viseme, weight, end: cursor });
      this.charStops[i] = cursor;
      previous = viseme;
    }

    this.totalWeight = Math.max(cursor, 1);
  }

  /** Verilen karakter indeksine kadar gecen normalize sure (0..1). */
  progressAtChar(charIndex: number): number {
    if (charIndex <= 0) return 0;
    const index = Math.min(charIndex, this.charStops.length - 1);
    for (let i = index; i >= 0; i -= 1) {
      const stop = this.charStops[i];
      if (stop !== undefined) return stop / this.totalWeight;
    }
    return 0;
  }

  /**
   * Normalize ilerlemede agiz sekli. Komsu visemeler harmanlanir (koartikulasyon),
   * boylece agiz "ac-kapa" degil, akan bir hareket yapar.
   */
  sample(progress: number): MouthShape {
    if (this.entries.length === 0) return MOUTH_SHAPES.SIL;
    const target = Math.max(0, Math.min(1, progress)) * this.totalWeight;

    let index = this.entries.findIndex((entry) => entry.end >= target);
    if (index < 0) index = this.entries.length - 1;

    const current = this.entries[index] as VisemeEntry;
    const shape = MOUTH_SHAPES[current.viseme];
    const start = current.end - current.weight;
    const local = current.weight > 0 ? (target - start) / current.weight : 1;

    // Ogenin son %35'inde bir sonraki sekle dogru gecise basla.
    const next = this.entries[index + 1];
    if (!next || local < 0.65) return shape;
    const blend = (local - 0.65) / 0.35;
    return mixShape(shape, MOUTH_SHAPES[next.viseme], blend * 0.8);
  }
}

export function mixShape(a: MouthShape, b: MouthShape, t: number): MouthShape {
  const k = Math.max(0, Math.min(1, t));
  return {
    open: a.open + (b.open - a.open) * k,
    wide: a.wide + (b.wide - a.wide) * k,
    round: a.round + (b.round - a.round) * k,
    teeth: a.teeth + (b.teeth - a.teeth) * k,
    press: a.press + (b.press - a.press) * k,
  };
}

export const SILENT_MOUTH: MouthShape = MOUTH_SHAPES.SIL;
