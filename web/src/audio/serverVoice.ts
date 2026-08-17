import { PhonemeTrack, type PhonemeStep } from './phonemeTrack';
import { VisemeTrack } from './visemes';

export interface ServerClip {
  buffer: AudioBuffer;
  /** Saglayici fonem zamanlamasi veriyorsa (Piper). */
  track: PhonemeTrack;
  /** Vermiyorsa (Gemini): metinden uretilen viseme dizisi, ses suresine yayilir. */
  fallback: VisemeTrack | null;
}

/**
 * Sunucudan gelen sesin calinmasi.
 *
 * Tarayici sentezine gore kazanclar:
 *  - ses her makinede ayni (isletim sistemine bagli degil)
 *  - genlik gercek ses dalgasindan okunuyor, tahmin edilmiyor
 *  - sesin gercek suresi bilindigi icin agiz dizisi ona yayilabiliyor
 *
 * Cikisa alcak raf filtresi takili: karakterin sesi "kalin" istendigi icin
 * bas bolgesi yukseltiliyor. Deger ayarlardan degistirilebilir.
 */
export class ServerVoice {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private data: Uint8Array<ArrayBuffer> | null = null;

  private bass: BiquadFilterNode | null = null;
  private clipStartedAt = 0;
  private clipDuration = 0;
  private track: PhonemeTrack | null = null;
  private fallback: VisemeTrack | null = null;

  /** Bas yukseltme (dB). Sesin kalinligi buradan ayarlanir. */
  bassGain = 5;

  /** Sunucu yerel sesi bildirdi mi? */
  available = false;

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new Ctor();

    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    const gain = context.createGain();

    // Alcak raf: 220 Hz altini yukseltir, tok/kalin bir ton verir.
    const bass = context.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 220;
    bass.gain.value = this.bassGain;

    gain.connect(bass);
    bass.connect(analyser);
    analyser.connect(context.destination);
    this.bass = bass;

    this.context = context;
    this.analyser = analyser;
    this.gain = gain;
    this.data = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    return context;
  }

  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (context.state === 'suspended') await context.resume().catch(() => undefined);
  }

  setBassGain(db: number): void {
    this.bassGain = db;
    if (this.bass) this.bass.gain.value = db;
  }

  /** Metni sunucuda sentezleyip caliniabilir hale getirir. */
  async fetchClip(
    text: string,
    rate: number,
    voice: string | null,
    emotion: string,
  ): Promise<ServerClip | null> {
    const context = this.ensureContext();
    let response: Response;
    try {
      response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, rate, voice, emotion }),
      });
    } catch {
      return null;
    }
    if (!response.ok) {
      // 503: yerel ses yok — cagiran taraf tarayici sesine doner.
      this.available = false;
      return null;
    }

    const payload = (await response.json()) as {
      audio: string;
      phonemes?: PhonemeStep[];
    };
    const bytes = base64ToBytes(payload.audio);
    let buffer: AudioBuffer;
    try {
      buffer = await context.decodeAudioData(bytes.buffer);
    } catch {
      return null;
    }
    const track = new PhonemeTrack(payload.phonemes ?? []);
    // Fonem zamanlamasi gelmediyse metinden uret; sesin gercek suresine yayilacak.
    return { buffer, track, fallback: track.empty ? new VisemeTrack(text) : null };
  }

  /** Klibi calar; bittiginde onEnded tetiklenir. */
  play(clip: ServerClip, volume: number, onEnded: () => void): void {
    const context = this.ensureContext();
    if (!this.gain) return;

    this.stopSource();
    this.gain.gain.value = Math.max(0, Math.min(1, volume));

    const source = context.createBufferSource();
    source.buffer = clip.buffer;
    source.connect(this.gain);
    source.onended = () => {
      if (this.source === source) {
        this.source = null;
        onEnded();
      }
    };

    this.source = source;
    this.track = clip.track;
    this.fallback = clip.fallback;
    this.clipDuration = clip.buffer.duration;
    this.clipStartedAt = context.currentTime;
    source.start();
  }

  /** Barge-in: aninda sus. */
  stop(): void {
    this.stopSource();
    this.track = null;
    this.fallback = null;
  }

  private stopSource(): void {
    const source = this.source;
    if (!source) return;
    this.source = null;
    source.onended = null;
    try {
      source.stop();
    } catch {
      /* zaten durmus olabilir */
    }
    source.disconnect();
  }

  get playing(): boolean {
    return this.source !== null;
  }

  /**
   * Ses saatine gore agiz sekli.
   *
   * Fonem zamanlamasi varsa dogrudan ondan; yoksa metin dizisi sesin gercek
   * suresine yayilir ve anlik genlikle kapatilir — boylece duraklamalarda
   * agiz konusmaya devam etmez.
   */
  mouthAt(): ReturnType<PhonemeTrack['sample']> | null {
    if (!this.context) return null;
    const elapsed = this.context.currentTime - this.clipStartedAt;

    if (this.track && !this.track.empty) return this.track.sample(elapsed);
    if (!this.fallback || this.clipDuration <= 0) return null;

    const shape = this.fallback.sample(elapsed / this.clipDuration);
    const gate = Math.min(1, this.amplitude() * 1.6);
    return {
      open: shape.open * gate,
      wide: shape.wide * gate,
      round: shape.round * gate,
      teeth: shape.teeth * gate,
      press: shape.press,
    };
  }

  /** Gercek dalga formundan RMS genligi (0..1). */
  amplitude(): number {
    const analyser = this.analyser;
    const data = this.data;
    if (!analyser || !data || !this.source) return 0;

    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const value = ((data[i] as number) - 128) / 128;
      sum += value * value;
    }
    // Konusma RMS'i ~0.15-0.25 arasi; bu carpan tepe degerleri doyurmadan
    // halkanin belirgin tepki vermesini sagliyor.
    return Math.min(1, Math.sqrt(sum / data.length) * 3.2);
  }
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const serverVoice = new ServerVoice();
