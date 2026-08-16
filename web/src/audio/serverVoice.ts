import { PhonemeTrack, type PhonemeStep } from './phonemeTrack';

export interface ServerClip {
  buffer: AudioBuffer;
  track: PhonemeTrack;
}

/**
 * Sunucudan gelen sesin calinmasi (Piper).
 *
 * Tarayici sentezine gore uc kazanc:
 *  - ses her makinede ayni (isletim sistemine bagli degil)
 *  - genlik gercek ses dalgasindan okunuyor, tahmin edilmiyor
 *  - agiz hareketi modelin kendi fonem zamanlamasina bagli
 */
export class ServerVoice {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private data: Uint8Array<ArrayBuffer> | null = null;

  private clipStartedAt = 0;
  private track: PhonemeTrack | null = null;

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

    gain.connect(analyser);
    analyser.connect(context.destination);

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

  /** Metni sunucuda sentezleyip caliniabilir hale getirir. */
  async fetchClip(text: string, rate: number, voice: string | null): Promise<ServerClip | null> {
    const context = this.ensureContext();
    let response: Response;
    try {
      response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, rate, voice }),
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
    return { buffer, track: new PhonemeTrack(payload.phonemes ?? []) };
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
    this.clipStartedAt = context.currentTime;
    source.start();
  }

  /** Barge-in: aninda sus. */
  stop(): void {
    this.stopSource();
    this.track = null;
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

  /** Ses saatine gore agiz sekli (fonem zamanlamasindan). */
  mouthAt(): ReturnType<PhonemeTrack['sample']> | null {
    if (!this.track || !this.context || this.track.empty) return null;
    return this.track.sample(this.context.currentTime - this.clipStartedAt);
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
