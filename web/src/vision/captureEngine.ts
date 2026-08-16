export type VisionSource = 'camera' | 'screen';

export interface VisionFrame {
  source: VisionSource;
  mime: string;
  /** base64, veri onegi olmadan */
  data: string;
}

interface Channel {
  stream: MediaStream | null;
  video: HTMLVideoElement | null;
}

/** Uzun kenar sinirlanir: gecikme dogrudan kare boyutuna bagli. */
const MAX_EDGE = 768;
const QUALITY = 0.72;

/**
 * Kamera ve ekran yakalama. Goruntu surekli akmaz — karakter "baktiginda"
 * tek kare alinir. Surekli video gondermek hem gecikmeyi hem de gizlilik
 * yuzeyini gereksiz buyutuyor.
 */
export class CaptureEngine {
  private channels: Record<VisionSource, Channel> = {
    camera: { stream: null, video: null },
    screen: { stream: null, video: null },
  };

  /** Ayarlar panelindeki onizleme bu akisi kullanir. */
  streamFor(source: VisionSource): MediaStream | null {
    return this.channels[source].stream;
  }

  isActive(source: VisionSource): boolean {
    return Boolean(this.channels[source].stream);
  }

  async start(source: VisionSource): Promise<boolean> {
    if (this.isActive(source)) return true;
    try {
      const stream =
        source === 'camera'
          ? await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
              audio: false,
            })
          : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      // Kullanici paylasimi sistem arayuzunden durdurabilir.
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => this.stop(source));
      });

      this.channels[source] = { stream, video };
      return true;
    } catch {
      return false;
    }
  }

  stop(source: VisionSource): void {
    const channel = this.channels[source];
    channel.stream?.getTracks().forEach((track) => track.stop());
    if (channel.video) {
      channel.video.srcObject = null;
      channel.video = null;
    }
    channel.stream = null;
    this.onStopped?.(source);
  }

  stopAll(): void {
    this.stop('camera');
    this.stop('screen');
  }

  /** Akis sistem tarafindan kesildiginde arayuzun haberi olsun. */
  onStopped: ((source: VisionSource) => void) | null = null;

  /** Anlik kareyi olceklenmis JPEG olarak alir. */
  grab(source: VisionSource): VisionFrame | null {
    const { video } = this.channels[source];
    if (!video || video.readyState < 2) return null;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const url = canvas.toDataURL('image/jpeg', QUALITY);
    const comma = url.indexOf(',');
    if (comma < 0) return null;
    return { source, mime: 'image/jpeg', data: url.slice(comma + 1) };
  }
}

export const captureEngine = new CaptureEngine();

/** "Abi şuna bak" / "ekrana bak" gibi ifadeleri yakalar. */
const CAMERA_HINTS = [
  'şuna bak', 'suna bak', 'buna bak', 'bunu gör', 'bunu gor', 'görüyor musun',
  'goruyor musun', 'kameraya bak', 'ne görüyorsun', 'ne goruyorsun', 'bak bakalım',
  'bak bakalim', 'şunu göster', 'sunu goster',
];
const SCREEN_HINTS = [
  'ekrana bak', 'ekranıma bak', 'ekranima bak', 'ekranda ne', 'şu ekran', 'su ekran',
  'ekran görüntü', 'ekran goruntu', 'burada ne yazıyor', 'burada ne yaziyor',
];

export function detectVisionIntent(text: string): VisionSource | null {
  const normalized = text.toLocaleLowerCase('tr');
  if (SCREEN_HINTS.some((hint) => normalized.includes(hint))) return 'screen';
  if (CAMERA_HINTS.some((hint) => normalized.includes(hint))) return 'camera';
  return null;
}
