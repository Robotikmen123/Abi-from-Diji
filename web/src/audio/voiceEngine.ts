import { profileFor, wpmToRate, clamp } from '../character/emotions';
import type { Emotion } from '../state/stateConfig';
import { serverVoice, type ServerClip } from './serverVoice';
import { SILENT_MOUTH, VisemeTrack, mixShape, type MouthShape } from './visemes';

export interface VoiceOption {
  id: string;
  label: string;
  lang: string;
  male: boolean;
}

interface QueueItem {
  text: string;
  emotion: Emotion;
  index: number;
}

export interface VoiceEngineEvents {
  onPhraseStart?: (text: string, index: number) => void;
  onPhraseEnd?: (index: number) => void;
  onIdle?: () => void;
  onError?: (message: string) => void;
}

/** Erkek ses tercihi: platform seslerinde bilinen erkek isimleri. */
const MALE_HINTS = [
  'tolga', 'ahmet', 'mehmet', 'burak', 'emre', 'male', 'erkek', 'man', 'baris',
];
const FEMALE_HINTS = ['yelda', 'seda', 'filiz', 'female', 'kadin', 'kadın', 'woman', 'zeynep'];

export type VoiceBackend = 'server' | 'browser';

/**
 * Iki motorlu ses cikisi.
 *
 * - 'server': Piper. Ses her makinede ayni, genlik gercek dalgadan okunuyor,
 *   agiz hareketi modelin fonem zamanlamasina bagli.
 * - 'browser': Web Speech. Yerel ses yoksa devreye giren yedek.
 * - Ucretsiz, kurulumsuz, ilk sese kadar gecen sure sunucu TTS'ten dusuk.
 * - Akan cumleler siraya alinir, ilk parca gelir gelmez konusma baslar.
 * - stop() barge-in icin aninda susturur.
 */
export class VoiceEngine {
  private queue: QueueItem[] = [];
  private track: VisemeTrack | null = null;
  private trackStart = 0;
  private trackDuration = 1;
  private counter = 0;
  private raf = 0;
  private resumeTimer = 0;
  private events: VoiceEngineEvents = {};
  private voices: SpeechSynthesisVoice[] = [];
  private preferredVoiceId: string | null = null;
  private stopped = false;
  private backend: VoiceBackend = 'browser';
  /** Sonraki parca calarken bir sonraki sunucudan cekilir: aralarda bosluk kalmasin. */
  private prefetch: Promise<ServerClip | null> | null = null;
  private prefetchFor = -1;

  /** 0..1, agiz acikligindan turetilen kaba genlik (glow ve dalga icin). */
  amplitude = 0;
  mouth: MouthShape = SILENT_MOUTH;
  speaking = false;

  settings = {
    rateScale: 1,
    pitchScale: 1,
    volume: 1,
  };

  /** Sunucu yerel sesi bildirince motor otomatik degisir. */
  setBackend(backend: VoiceBackend): void {
    this.backend = backend;
    serverVoice.available = backend === 'server';
  }

  get activeBackend(): VoiceBackend {
    return this.backend;
  }

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices();
      window.speechSynthesis.addEventListener?.('voiceschanged', () => this.loadVoices());
    }
    this.tick = this.tick.bind(this);
  }

  get supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  on(events: VoiceEngineEvents): void {
    this.events = { ...this.events, ...events };
  }

  private loadVoices(): void {
    if (!this.supported) return;
    this.voices = window.speechSynthesis.getVoices();
  }

  listVoices(): VoiceOption[] {
    this.loadVoices();
    const turkish = this.voices.filter((v) => v.lang?.toLowerCase().startsWith('tr'));
    const pool = turkish.length > 0 ? turkish : this.voices;
    return pool.map((voice) => ({
      id: voice.voiceURI,
      label: voice.name,
      lang: voice.lang,
      male: isMale(voice.name),
    }));
  }

  setVoice(id: string | null): void {
    this.preferredVoiceId = id;
  }

  /** Kayitli tercih yoksa: Turkce + erkek > Turkce > varsayilan. */
  private pickVoice(): SpeechSynthesisVoice | null {
    if (this.voices.length === 0) this.loadVoices();
    if (this.preferredVoiceId) {
      const exact = this.voices.find((v) => v.voiceURI === this.preferredVoiceId);
      if (exact) return exact;
    }
    const turkish = this.voices.filter((v) => v.lang?.toLowerCase().startsWith('tr'));
    const male = turkish.find((v) => isMale(v.name));
    if (male) return male;
    const notFemale = turkish.find((v) => !isFemale(v.name));
    return notFemale ?? turkish[0] ?? null;
  }

  /** Tarayicilar ilk sesi kullanici hareketine bagliyor; bir kez sessiz tetikle. */
  unlock(): void {
    void serverVoice.unlock();
    if (!this.supported) return;
    try {
      const probe = new SpeechSynthesisUtterance(' ');
      probe.volume = 0;
      window.speechSynthesis.speak(probe);
    } catch {
      /* onemsiz */
    }
  }

  enqueue(text: string, emotion: Emotion): void {
    const clean = text.trim();
    if (!clean) return;
    this.stopped = false;
    this.counter += 1;
    this.queue.push({ text: clean, emotion, index: this.counter });
    if (!this.speaking) this.playNext();
  }

  /** Barge-in: aninda sus, kuyrugu bosalt. */
  stop(): void {
    this.stopped = true;
    this.queue = [];
    this.track = null;
    this.speaking = false;
    this.prefetch = null;
    this.prefetchFor = -1;
    serverVoice.stop();
    if (this.supported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* onemsiz */
      }
    }
    window.clearInterval(this.resumeTimer);
    this.decayToSilence();
  }

  private playNext(): void {
    const item = this.queue.shift();
    if (!item) {
      this.speaking = false;
      this.decayToSilence();
      this.events.onIdle?.();
      return;
    }

    if (this.backend === 'server') {
      void this.playServer(item);
      return;
    }
    // Ses motoru yoksa ya da sistemde hic ses yuklu degilse (bazi Linux
    // kurulumlari, headless tarayicilar) sessiz oynat: karakter yine konussun.
    if (!this.supported || this.voices.length === 0) {
      this.loadVoices();
      if (!this.supported || this.voices.length === 0) {
        this.playSilentFallback(item);
        return;
      }
    }

    const profile = profileFor(item.emotion);
    const utterance = new SpeechSynthesisUtterance(item.text);
    const voice = this.pickVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'tr-TR';
    utterance.rate = clamp(wpmToRate(profile.wpm) * this.settings.rateScale, 0.5, 2);
    utterance.pitch = clamp(profile.pitch * this.settings.pitchScale, 0.4, 1.6);
    utterance.volume = clamp(this.settings.volume, 0, 1);

    this.track = new VisemeTrack(item.text);
    this.trackStart = performance.now();
    // Konusma suresi tahmini: ~14 karakter/saniye, hiza bolunur.
    this.trackDuration = Math.max(400, (item.text.length / 14) * 1000) / utterance.rate;

    utterance.onstart = () => {
      this.trackStart = performance.now();
      this.events.onPhraseStart?.(item.text, item.index);
    };

    // Kelime sinirlari geldikce sure tahminini duzelt: agiz sesle senkron kalir.
    utterance.onboundary = (event) => {
      if (!this.track || this.stopped) return;
      const expected = this.track.progressAtChar(event.charIndex ?? 0);
      if (expected <= 0.02) return;
      const elapsed = performance.now() - this.trackStart;
      const measured = elapsed / expected;
      // Yumusatilmis duzeltme; ani sicramalar agzi bozar.
      this.trackDuration = this.trackDuration * 0.7 + measured * 0.3;
    };

    utterance.onend = () => {
      this.events.onPhraseEnd?.(item.index);
      if (this.stopped) return;
      this.playNext();
    };

    utterance.onerror = (event) => {
      if (this.stopped || event.error === 'interrupted' || event.error === 'canceled') return;
      // 'synthesis-failed' / 'not-allowed' kullaniciya gosterilecek bir sey degil;
      // sessizce metin temposuna dus.
      if (event.error !== 'synthesis-unavailable') this.events.onError?.(String(event.error));
      this.playNext();
    };

    this.speaking = true;
    this.startLoop();

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      this.playSilentFallback(item);
      return;
    }

    // Chrome uzun konusmalarda sentezi askiya aliyor; periyodik resume koruyor.
    window.clearInterval(this.resumeTimer);
    this.resumeTimer = window.setInterval(() => {
      if (!this.speaking) {
        window.clearInterval(this.resumeTimer);
        return;
      }
      const synth = window.speechSynthesis;
      if (synth.speaking && synth.paused) synth.resume();
    }, 4000);
  }

  /**
   * Sunucu sesi. Klip onceden cekilmisse aninda calar; degilse cekip calar
   * ve bir sonrakini arka planda hazirlar.
   */
  private async playServer(item: QueueItem): Promise<void> {
    const profile = profileFor(item.emotion);
    const rate = clamp(wpmToRate(profile.wpm) * this.settings.rateScale, 0.5, 2);

    const pending =
      this.prefetchFor === item.index && this.prefetch
        ? this.prefetch
        : serverVoice.fetchClip(item.text, rate, this.preferredVoiceId);
    this.prefetch = null;
    this.prefetchFor = -1;

    let clip: ServerClip | null = null;
    try {
      clip = await pending;
    } catch {
      clip = null;
    }
    if (this.stopped) return;

    if (!clip) {
      // Yerel ses cevap vermedi: tarayici sesine dus ve orada devam et.
      this.backend = 'browser';
      this.queue.unshift(item);
      this.playNext();
      return;
    }

    this.speaking = true;
    this.track = null;
    this.startLoop();
    this.events.onPhraseStart?.(item.text, item.index);

    // Bir sonraki parcayi simdiden hazirla.
    const next = this.queue[0];
    if (next) {
      const nextProfile = profileFor(next.emotion);
      const nextRate = clamp(wpmToRate(nextProfile.wpm) * this.settings.rateScale, 0.5, 2);
      this.prefetchFor = next.index;
      this.prefetch = serverVoice.fetchClip(next.text, nextRate, this.preferredVoiceId);
    }

    serverVoice.play(clip, this.settings.volume, () => {
      this.events.onPhraseEnd?.(item.index);
      if (this.stopped) return;
      this.playNext();
    });
  }

  /** Ses sentezi yoksa karakter yine de "konussun" (agiz + altyazi zamanlamasi). */
  private playSilentFallback(item: QueueItem): void {
    this.track = new VisemeTrack(item.text);
    this.trackStart = performance.now();
    this.trackDuration = Math.max(600, (item.text.length / 13) * 1000);
    this.speaking = true;
    this.startLoop();
    this.events.onPhraseStart?.(item.text, item.index);
    window.setTimeout(() => {
      if (this.stopped) return;
      this.events.onPhraseEnd?.(item.index);
      this.playNext();
    }, this.trackDuration);
  }

  private startLoop(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick(): void {
    this.raf = 0;

    // Sunucu sesi: agiz fonem zamanlamasindan, genlik gercek dalgadan.
    if (this.backend === 'server' && serverVoice.playing) {
      const target = serverVoice.mouthAt();
      if (target) this.mouth = mixShape(this.mouth, target, 0.5);
      const level = serverVoice.amplitude();
      if (!target) {
        // Fonem zamanlamasi yoksa genlikten kaba bir agiz uret.
        this.mouth = mixShape(this.mouth, { ...SILENT_MOUTH, open: level, wide: 0.3 }, 0.4);
      }
      this.amplitude = this.amplitude * 0.5 + level * 0.5;
      this.raf = requestAnimationFrame(this.tick);
      return;
    }

    if (this.track && this.speaking) {
      const progress = (performance.now() - this.trackStart) / this.trackDuration;
      const target = this.track.sample(progress);
      // Kas ataleti: hedefe yaklas, ziplama olmasin.
      this.mouth = mixShape(this.mouth, target, 0.45);
      const energy = this.mouth.open * 0.75 + this.mouth.wide * 0.15 + this.mouth.round * 0.1;
      this.amplitude = this.amplitude * 0.6 + energy * 0.4;
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    this.decayToSilence();
  }

  private decayToSilence(): void {
    this.mouth = mixShape(this.mouth, SILENT_MOUTH, 0.25);
    this.amplitude *= 0.7;
    if (this.amplitude > 0.01 || this.mouth.open > 0.03) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.amplitude = 0;
      this.mouth = SILENT_MOUTH;
      this.raf = 0;
    }
  }
}

function isMale(name: string): boolean {
  const lower = name.toLocaleLowerCase('tr');
  if (FEMALE_HINTS.some((hint) => lower.includes(hint))) return false;
  return MALE_HINTS.some((hint) => lower.includes(hint));
}

function isFemale(name: string): boolean {
  const lower = name.toLocaleLowerCase('tr');
  return FEMALE_HINTS.some((hint) => lower.includes(hint));
}

export const voiceEngine = new VoiceEngine();
