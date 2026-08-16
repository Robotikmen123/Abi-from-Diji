/**
 * Web Speech Recognition sarmalayicisi (ucretsiz, tarayici icinde).
 * Chrome / Edge destekler; desteklenmeyen tarayicida yazili giris devreye girer.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export interface SttEvents {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onStart?: () => void;
}

export class SpeechInput {
  private recognition: SpeechRecognitionLike | null = null;
  private events: SttEvents = {};
  private wantRunning = false;
  private restartTimer = 0;
  private lastInterim = '';

  readonly supported: boolean = getCtor() !== null;
  running = false;

  on(events: SttEvents): void {
    this.events = { ...this.events, ...events };
  }

  start(): void {
    if (!this.supported) return;
    this.wantRunning = true;
    this.spawn();
  }

  stop(): void {
    this.wantRunning = false;
    window.clearTimeout(this.restartTimer);
    try {
      this.recognition?.stop();
    } catch {
      /* onemsiz */
    }
  }

  /** Barge-in sonrasi temiz baslangic icin mevcut tanimayi at. */
  reset(): void {
    this.lastInterim = '';
    if (!this.recognition) return;
    try {
      this.recognition.abort();
    } catch {
      /* onemsiz */
    }
  }

  private spawn(): void {
    const Ctor = getCtor();
    if (!Ctor || this.running) return;

    const recognition = new Ctor();
    recognition.lang = 'tr-TR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      this.running = true;
      this.events.onStart?.();
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          const clean = text.trim();
          if (clean) this.events.onFinal?.(clean);
          this.lastInterim = '';
        } else {
          interim += text;
        }
      }
      const trimmed = interim.trim();
      if (trimmed && trimmed !== this.lastInterim) {
        this.lastInterim = trimmed;
        this.events.onInterim?.(trimmed);
      }
    };

    recognition.onerror = (event) => {
      const code = event.error ?? 'unknown';
      // no-speech ve aborted normal akisin parcasi, kullaniciya gosterilmez.
      if (code === 'no-speech' || code === 'aborted') return;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        this.wantRunning = false;
        this.events.onError?.('Mikrofon izni verilmedi.');
        return;
      }
      if (code === 'network') this.events.onError?.('Ses tanıma bağlantısı koptu.');
    };

    recognition.onend = () => {
      this.running = false;
      // Continuous mod tarayici tarafindan sik sik kapatilir; sessizce geri ac.
      if (!this.wantRunning) return;
      window.clearTimeout(this.restartTimer);
      this.restartTimer = window.setTimeout(() => this.spawn(), 220);
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      this.running = false;
    }
  }
}

export const speechInput = new SpeechInput();
