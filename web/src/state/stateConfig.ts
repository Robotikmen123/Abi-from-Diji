/**
 * Merkezi UI durum tablosu. Bilesenler bu tablodan okur; dagitik if/else yok.
 */

export type UiState =
  | 'BOOT'
  | 'CONNECTING'
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'ERROR'
  | 'OFFLINE';

export type Emotion =
  | 'IDLE'
  | 'AMUSED'
  | 'ANNOYED'
  | 'SERIOUS'
  | 'SUSPICIOUS'
  | 'EXCITED'
  | 'SURPRISED'
  | 'MISSION'
  | 'ALERT';

export type AvatarMode = 'boot' | 'idle' | 'attentive' | 'thinking' | 'lipSync' | 'dim';

export interface StateVisual {
  avatar: AvatarMode;
  glow: number;
  /** Glow'un nefes alma genligi (0 = sabit). */
  glowPulse: number;
  status: string | null;
  waveform: boolean;
  subtitle: boolean;
  controlsOpacity: number;
  /** Bu duruma GIRIS gecis suresi (ms). */
  transitionMs: number;
}

export const STATE_VISUALS: Record<UiState, StateVisual> = {
  BOOT: {
    avatar: 'boot',
    glow: 0.0,
    glowPulse: 0,
    status: null,
    waveform: false,
    subtitle: false,
    controlsOpacity: 0,
    transitionMs: 400,
  },
  CONNECTING: {
    avatar: 'idle',
    glow: 0.18,
    glowPulse: 0.05,
    status: 'BAĞLANIYOR',
    waveform: false,
    subtitle: false,
    controlsOpacity: 0.35,
    transitionMs: 300,
  },
  IDLE: {
    avatar: 'idle',
    glow: 0.25,
    glowPulse: 0.02,
    status: null,
    waveform: false,
    subtitle: false,
    controlsOpacity: 0.45,
    transitionMs: 250,
  },
  LISTENING: {
    avatar: 'attentive',
    glow: 0.45,
    glowPulse: 0.03,
    status: 'DİNLİYOR',
    waveform: true,
    subtitle: false,
    controlsOpacity: 0.45,
    transitionMs: 250,
  },
  PROCESSING: {
    avatar: 'thinking',
    glow: 0.35,
    glowPulse: 0.09,
    status: 'DÜŞÜNÜYOR',
    waveform: false,
    subtitle: false,
    controlsOpacity: 0.45,
    transitionMs: 180,
  },
  SPEAKING: {
    avatar: 'lipSync',
    glow: 0.5,
    glowPulse: 0.02,
    status: 'KONUŞUYOR',
    waveform: false,
    subtitle: true,
    controlsOpacity: 0.4,
    transitionMs: 150,
  },
  INTERRUPTED: {
    avatar: 'attentive',
    glow: 0.45,
    glowPulse: 0,
    status: 'DİNLİYOR',
    waveform: true,
    subtitle: false,
    controlsOpacity: 0.45,
    transitionMs: 100,
  },
  ERROR: {
    avatar: 'idle',
    glow: 0.2,
    glowPulse: 0.04,
    status: null,
    waveform: false,
    subtitle: false,
    controlsOpacity: 0.6,
    transitionMs: 200,
  },
  OFFLINE: {
    avatar: 'dim',
    glow: 0.1,
    glowPulse: 0.02,
    status: 'BAĞLANTI YOK',
    waveform: false,
    subtitle: false,
    controlsOpacity: 0.6,
    transitionMs: 300,
  },
};

/** Ses girisinin dinlenmesine izin veren durumlar. */
export const MIC_ACTIVE_STATES: UiState[] = ['IDLE', 'LISTENING', 'SPEAKING', 'INTERRUPTED'];

export function visualFor(state: UiState): StateVisual {
  return STATE_VISUALS[state];
}
