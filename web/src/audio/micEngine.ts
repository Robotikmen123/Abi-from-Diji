export interface MicEvents {
  /** VAD konusma baslangici yakaladi (barge-in ve LISTENING gecisi icin). */
  onSpeechStart?: () => void;
  /** Konusma bitti (sessizlik esigi asildi). */
  onSpeechEnd?: (durationMs: number) => void;
  onError?: (message: string) => void;
}

const BAR_COUNT = 24;

/**
 * Mikrofon analizi: dalga formu, seviye ve basit VAD.
 * VAD, STT'den bagimsiz calisir; goruntunun 100-200 ms icinde tepki vermesi
 * ve barge-in'in aninda tetiklenmesi buna bagli.
 */
export class MicEngine {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private raf = 0;
  private events: MicEvents = {};

  /** Uyarlanir gurultu tabani; sabit esik odalara gore basarisiz oluyor. */
  private noiseFloor = 0.008;
  private speechStartedAt = 0;
  private lastVoiceAt = 0;

  active = false;
  muted = false;
  /** Kayit icin ayni akis paylasilir; ikinci kez izin istenmez. */
  get mediaStream(): MediaStream | null {
    return this.stream;
  }

  /** 0..1 anlik seviye */
  level = 0;
  /** Dalga formu barlari (0..1) */
  bars: number[] = new Array(BAR_COUNT).fill(0);
  speech = false;

  /** Konusmanin baslamis sayilmasi icin gereken ustuste sure. */
  attackMs = 90;
  /** Konusmanin bittigi kabul edilen sessizlik suresi. */
  releaseMs = 750;
  /** Gurultu tabaninin kac kati "konusma" sayilir. */
  threshold = 2.6;

  constructor() {
    this.tick = this.tick.bind(this);
  }

  on(events: MicEvents): void {
    this.events = { ...this.events, ...events };
  }

  async start(): Promise<boolean> {
    if (this.active) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Hoparlorden sizan ABI sesinin yanlis barge-in tetiklemesini engeller.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      this.events.onError?.(errorMessage(err));
      return false;
    }

    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.context = new Ctor();
    if (this.context.state === 'suspended') await this.context.resume();

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.55;
    this.buffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));

    this.source = this.context.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);

    this.active = true;
    this.raf = requestAnimationFrame(this.tick);
    return true;
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close();
    this.context = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.active = false;
    this.speech = false;
    this.level = 0;
    this.bars = new Array(BAR_COUNT).fill(0);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    if (muted) {
      this.speech = false;
      this.level = 0;
      this.bars = this.bars.map(() => 0);
    }
  }

  private tick(): void {
    this.raf = requestAnimationFrame(this.tick);
    const analyser = this.analyser;
    const buffer = this.buffer;
    if (!analyser || !buffer) return;

    analyser.getFloatTimeDomainData(buffer);

    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const sample = buffer[i] as number;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / buffer.length);

    if (this.muted) {
      this.level *= 0.8;
      this.bars = this.bars.map((bar) => bar * 0.8);
      return;
    }

    // Gurultu tabani sadece sessizlikte ve yavas guncellenir.
    if (rms < this.noiseFloor * 1.6) {
      this.noiseFloor = this.noiseFloor * 0.97 + rms * 0.03;
    }
    this.noiseFloor = Math.max(this.noiseFloor, 0.0015);

    const normalized = Math.min(1, Math.max(0, (rms - this.noiseFloor) * 14));
    this.level = this.level * 0.6 + normalized * 0.4;

    this.updateBars(buffer);

    const now = performance.now();
    const loud = rms > this.noiseFloor * this.threshold;

    if (loud) {
      this.lastVoiceAt = now;
      if (!this.speech) {
        if (this.speechStartedAt === 0) this.speechStartedAt = now;
        if (now - this.speechStartedAt >= this.attackMs) {
          this.speech = true;
          this.events.onSpeechStart?.();
        }
      }
    } else {
      if (!this.speech) this.speechStartedAt = 0;
      if (this.speech && now - this.lastVoiceAt > this.releaseMs) {
        this.speech = false;
        const duration = this.lastVoiceAt - this.speechStartedAt;
        this.speechStartedAt = 0;
        this.events.onSpeechEnd?.(Math.max(0, duration));
      }
    }
  }

  private updateBars(buffer: Float32Array): void {
    const chunk = Math.floor(buffer.length / BAR_COUNT);
    for (let b = 0; b < BAR_COUNT; b += 1) {
      let peak = 0;
      const start = b * chunk;
      for (let i = start; i < start + chunk; i += 1) {
        const value = Math.abs(buffer[i] as number);
        if (value > peak) peak = value;
      }
      const target = Math.min(1, Math.max(0, (peak - this.noiseFloor) * 11));
      const previous = this.bars[b] ?? 0;
      // Yumusak dusus: spektrum analizoru gibi agresif gorunmesin.
      this.bars[b] = target > previous ? previous + (target - previous) * 0.55 : previous * 0.82;
    }
  }
}

function errorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError') return 'Mikrofon izni verilmedi.';
  if (name === 'NotFoundError') return 'Mikrofon bulunamadı.';
  return 'Mikrofona erişilemedi.';
}

export const micEngine = new MicEngine();
