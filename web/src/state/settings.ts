export type ProactiveLevel = 'quiet' | 'normal' | 'chatty';
export type PersonaIntensity = 'calm' | 'normal' | 'abi';

export type EnginePreference = 'auto' | 'server' | 'browser';

export interface Settings {
  // VOICE
  /** Yerel (Piper) ses mi tarayici sesi mi. 'auto': sunucuda varsa yerel. */
  voiceEngine: EnginePreference;
  voiceId: string | null;
  speechRate: number;
  speechPitch: number;
  volume: number;
  autoInterrupt: boolean;
  streamingTts: boolean;

  // MICROPHONE
  /** Yerel (Whisper) tanima mi tarayici tanimasi mi. */
  sttEngine: EnginePreference;
  micEnabled: boolean;
  conversationMode: boolean;
  wakeWordEnabled: boolean;

  // CAMERA
  cameraEnabled: boolean;
  cameraPreview: boolean;

  // PERSONALITY
  personaIntensity: PersonaIntensity;
  proactiveLevel: ProactiveLevel;

  // MEMORY
  memoryEnabled: boolean;
  userName: string | null;

  // APPEARANCE
  /** Emblemin uzerindeki isim. Karakter adi kod disindan degistirilebilir. */
  wordmark: string;
  avatarScale: number;
  subtitleScale: number;
  subtitleVisible: boolean;
  statusVisible: boolean;
  glowIntensity: number;
  animationIntensity: number;
  reduceMotion: boolean;
  highContrastSubtitle: boolean;

  // DESKTOP (yalnizca masaustu kabugunda gorunur)
  windowMode: 'window' | 'overlay' | 'mini';
  clickThrough: boolean;

  // ADVANCED
  devMode: boolean;
  cinematicMode: boolean;
  gameMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  voiceEngine: 'auto',
  voiceId: null,
  speechRate: 1,
  speechPitch: 1,
  volume: 1,
  autoInterrupt: true,
  streamingTts: true,

  sttEngine: 'auto',
  micEnabled: true,
  conversationMode: true,
  wakeWordEnabled: false,

  cameraEnabled: false,
  cameraPreview: false,

  personaIntensity: 'normal',
  proactiveLevel: 'normal',

  memoryEnabled: true,
  userName: null,

  wordmark: '@bi',
  avatarScale: 1,
  subtitleScale: 1,
  subtitleVisible: true,
  statusVisible: true,
  glowIntensity: 1,
  animationIntensity: 1,
  reduceMotion: false,
  highContrastSubtitle: false,

  windowMode: 'window',
  clickThrough: false,

  devMode: false,
  cinematicMode: false,
  gameMode: false,
};

const KEY = 'abi.settings.v1';

export function loadSettings(): Settings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return withSystemPreferences(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return withSystemPreferences({ ...DEFAULT_SETTINGS, ...parsed });
  } catch {
    return withSystemPreferences(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* kota dolu olabilir; ayarlar oturumluk kalir */
  }
}

/** Isletim sistemi hareket tercihi ilk acilista uygulanir. */
function withSystemPreferences(settings: Settings): Settings {
  if (typeof window === 'undefined' || !window.matchMedia) return settings;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduce ? { ...settings, reduceMotion: true } : settings;
}
