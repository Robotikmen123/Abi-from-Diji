/**
 * Sunucu tarafi ses tanima (Whisper).
 *
 * Tarayici tanimasindan farki: Chrome'a ve internete bagli degil, Turkceyi
 * daha iyi tutuyor. Konusma VAD ile parcalanip bittiginde tek istekte gonderilir.
 */

export interface ServerSttEvents {
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
}

export class ServerStt {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private events: ServerSttEvents = {};
  private mime = 'audio/webm';
  private discard = false;

  /** Sunucu yerel tanimayi bildirdi mi? */
  available = false;
  recording = false;

  on(events: ServerSttEvents): void {
    this.events = { ...this.events, ...events };
  }

  get supported(): boolean {
    return typeof MediaRecorder !== 'undefined';
  }

  attach(stream: MediaStream): boolean {
    if (!this.supported) return false;
    this.detach();

    // Tarayicilar farkli kapsayicilar destekliyor; ilk desteklenen secilir.
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    const type = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!type) return false;
    this.mime = type;

    try {
      this.recorder = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 32000 });
    } catch {
      return false;
    }

    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.onstop = () => {
      this.recording = false;
      const blob = new Blob(this.chunks, { type: this.mime });
      this.chunks = [];
      if (!this.discard && blob.size > 1200) void this.send(blob);
      this.discard = false;
    };
    return true;
  }

  detach(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.discard = true;
      try {
        this.recorder.stop();
      } catch {
        /* onemsiz */
      }
    }
    this.recorder = null;
    this.chunks = [];
    this.recording = false;
  }

  /** VAD konusma baslangicini yakalayinca. */
  start(): void {
    if (!this.recorder || this.recording) return;
    this.chunks = [];
    this.discard = false;
    try {
      this.recorder.start();
      this.recording = true;
    } catch {
      this.recording = false;
    }
  }

  /** VAD konusma sonunu yakalayinca; kayit sunucuya gider. */
  stop(): void {
    if (!this.recorder || !this.recording) return;
    try {
      this.recorder.stop();
    } catch {
      this.recording = false;
    }
  }

  /** Barge-in sonrasi: kaydi at, gonderme. */
  cancel(): void {
    if (!this.recorder || !this.recording) return;
    this.discard = true;
    try {
      this.recorder.stop();
    } catch {
      this.recording = false;
    }
  }

  private async send(blob: Blob): Promise<void> {
    const form = new FormData();
    form.append('audio', blob, 'konusma.webm');
    form.append('mime', this.mime);

    try {
      const response = await fetch('/api/stt', { method: 'POST', body: form });
      if (!response.ok) {
        // 503: yerel tanima yok — cagiran taraf tarayici tanimasina doner.
        if (response.status === 503) this.available = false;
        return;
      }
      const payload = (await response.json()) as { text?: string };
      const text = (payload.text ?? '').trim();
      if (text) this.events.onFinal?.(text);
    } catch {
      this.events.onError?.('Ses tanıma bağlantısı koptu.');
    }
  }
}

export const serverStt = new ServerStt();
