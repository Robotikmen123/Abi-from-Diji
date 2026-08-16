import { EMOTIONS, type Emotion } from '../providers/types.js';

const EMOTION_TAG = /^\s*\[([A-ZÇĞİÖŞÜ_]+)\]\s*/;
const MEMORY_MARK = /<<\s*hatirla\s*:\s*([^>]{3,240})>>/gi;
const MISSION_START = /<<\s*gorev\s*:\s*([^|>]{2,80})(?:\|\s*(\d{1,2}))?\s*>>/gi;
const MISSION_STEP = /<<\s*gorev-adim\s*>>/gi;
const MISSION_DONE = /<<\s*gorev-bitti\s*>>/gi;

export interface TagResult {
  emotion: Emotion | null;
  rest: string;
}

/** Cevabin basindaki [EMOTION] etiketini ayirir. */
export function extractEmotion(text: string): TagResult {
  const match = EMOTION_TAG.exec(text);
  if (!match) return { emotion: null, rest: text };
  const candidate = (match[1] ?? '').toUpperCase();
  if (!EMOTIONS.includes(candidate as Emotion)) return { emotion: null, rest: text };
  return { emotion: candidate as Emotion, rest: text.slice(match[0].length) };
}

/** <<hatirla: ...>> isaretlerini metinden cikarip toplar. */
export function extractMemories(text: string): { clean: string; facts: string[] } {
  const facts: string[] = [];
  const clean = text.replace(MEMORY_MARK, (_all, body: string) => {
    facts.push(body.trim());
    return '';
  });
  return { clean, facts };
}

export type MissionSignal =
  | { kind: 'start'; title: string; total: number }
  | { kind: 'step' }
  | { kind: 'done' };

/** <<gorev...>> isaretlerini metinden cikarip toplar. */
export function extractMissions(text: string): { clean: string; signals: MissionSignal[] } {
  const signals: MissionSignal[] = [];
  let clean = text.replace(MISSION_START, (_all, title: string, total?: string) => {
    signals.push({
      kind: 'start',
      title: title.trim(),
      total: Math.min(20, Math.max(1, Number(total ?? 1) || 1)),
    });
    return '';
  });
  clean = clean.replace(MISSION_STEP, () => {
    signals.push({ kind: 'step' });
    return '';
  });
  clean = clean.replace(MISSION_DONE, () => {
    signals.push({ kind: 'done' });
    return '';
  });
  return { clean, signals };
}

/** Seslendirilecek metni temizler: markdown, emoji ve gorsel suslemeler konusulmaz. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?…:;])/g, '$1')
    .trim();
}

const SENTENCE_END = /[.!?…]/;
const CLAUSE_END = /[,;:]/;

/**
 * Akan token'lari konusulabilir parcalara boler. Ilk parca bilerek kisa tutulur:
 * TTS'in cumle tamamlanmadan baslamasi toplam gecikmeyi belirgin dusuruyor.
 */
export class PhraseSplitter {
  private buffer = '';
  private emitted = 0;

  push(token: string): string[] {
    this.buffer += token;
    const out: string[] = [];

    while (true) {
      const cut = this.findCut();
      if (cut < 0) break;
      const phrase = this.buffer.slice(0, cut).trim();
      this.buffer = this.buffer.slice(cut);
      if (phrase) {
        out.push(phrase);
        this.emitted += 1;
      }
    }
    return out;
  }

  flush(): string | null {
    const rest = this.buffer.trim();
    this.buffer = '';
    if (!rest) return null;
    this.emitted += 1;
    return rest;
  }

  private findCut(): number {
    const minLength = this.emitted === 0 ? 14 : 40;
    const maxLength = this.emitted === 0 ? 90 : 170;

    for (let i = 0; i < this.buffer.length; i += 1) {
      const char = this.buffer[i] as string;
      const isEnd = SENTENCE_END.test(char);
      const isClause = CLAUSE_END.test(char);
      if (!isEnd && !isClause) continue;

      // "3.5" veya "vb." gibi noktalar cumle sonu degil.
      const next = this.buffer[i + 1];
      if (isEnd && next && /[0-9]/.test(next)) continue;

      const length = i + 1;
      if (isEnd && length >= minLength) return length;
      if (isClause && length >= maxLength) return length;
    }

    // Noktalama gelmiyorsa cok uzamadan bosluktan bol.
    if (this.buffer.length > maxLength + 60) {
      const space = this.buffer.lastIndexOf(' ', maxLength + 40);
      if (space > minLength) return space + 1;
    }
    return -1;
  }
}
