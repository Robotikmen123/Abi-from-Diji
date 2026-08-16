import { MOUTH_SHAPES, mixShape, type MouthShape, type Viseme } from './visemes';

export interface PhonemeStep {
  /** IPA fonemi */
  p: string;
  /** Baslangic (saniye) */
  t: number;
  /** Sure (saniye) */
  d: number;
}

/**
 * IPA -> viseme. Piper'in espeak fonemleyicisi bu sembolleri uretiyor.
 * Harf tahmininden farki: zamanlama modelin kendi cikisindan geliyor,
 * yani agiz gercekten sesle senkron.
 */
const IPA_VISEME: Record<string, Viseme> = {
  // acik sesliler
  a: 'AA', ɑ: 'AA', ä: 'AA', ʌ: 'AA', æ: 'AA',
  // on sesliler
  e: 'EE', ɛ: 'EE', ø: 'EE', œ: 'EE',
  i: 'IH', ɪ: 'IH', ɨ: 'IH', ɯ: 'IH', y: 'IH', ʏ: 'IH',
  // arka/yuvarlak
  o: 'OH', ɔ: 'OH',
  u: 'WQ', ʊ: 'WQ', w: 'WQ',
  // dudak kapanislari
  m: 'MBP', b: 'MBP', p: 'MBP',
  // dis-dudak
  f: 'FV', v: 'FV',
  // dil ucu
  l: 'L', n: 'L', t: 'L', d: 'L', r: 'L', ɾ: 'L', ɫ: 'L', ɲ: 'L', ŋ: 'L',
  // siziciler
  s: 'SS', z: 'SS', ʃ: 'SS', ʒ: 'SS', θ: 'SS', ð: 'SS',
  // damak/girtlak
  k: 'KK', g: 'KK', ɡ: 'KK', c: 'KK', ɟ: 'KK', x: 'KK', ɣ: 'KK', h: 'KK', j: 'KK',
};

function visemeFor(phoneme: string): Viseme {
  // Uzunluk/vurgu isaretleri agzi degistirmez.
  const base = phoneme.replace(/[ˈˌːʲʷ̃]/gu, '');
  if (!base.trim()) return 'SIL';
  // Cift sessizler (tʃ, dʒ) ilk harfe gore degil, siziciya gore acilir.
  if (base.length > 1) {
    if (base.includes('ʃ') || base.includes('ʒ')) return 'SS';
    return IPA_VISEME[base[0] as string] ?? 'KK';
  }
  return IPA_VISEME[base] ?? 'SIL';
}

/** Sunucudan gelen fonem zaman cizelgesini agiz sekline cevirir. */
export class PhonemeTrack {
  private readonly steps: { start: number; end: number; shape: MouthShape }[] = [];
  readonly duration: number;

  constructor(phonemes: PhonemeStep[]) {
    let end = 0;
    for (const step of phonemes) {
      const shape = MOUTH_SHAPES[visemeFor(step.p)];
      const start = step.t;
      end = step.t + step.d;
      this.steps.push({ start, end, shape });
    }
    this.duration = end;
  }

  get empty(): boolean {
    return this.steps.length === 0;
  }

  /** Verilen ses saatinde agiz sekli; komsu fonemler harmanlanir. */
  sample(seconds: number): MouthShape {
    if (this.steps.length === 0) return MOUTH_SHAPES.SIL;

    // Cogu cagri sirali geldigi icin dogrusal arama yeterli; liste kisa.
    let index = this.steps.findIndex((step) => step.end >= seconds);
    if (index < 0) index = this.steps.length - 1;

    const current = this.steps[index] as { start: number; end: number; shape: MouthShape };
    const span = Math.max(0.001, current.end - current.start);
    const local = (seconds - current.start) / span;

    const next = this.steps[index + 1];
    if (!next || local < 0.6) return current.shape;
    // Son %40'ta sonraki sekle gecis basliyor: koartikulasyon.
    return mixShape(current.shape, next.shape, ((local - 0.6) / 0.4) * 0.85);
  }
}
