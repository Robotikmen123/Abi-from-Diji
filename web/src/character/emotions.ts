import type { Emotion } from '../state/stateConfig';

/**
 * Duygu -> yuz, ses ve isik. Abartili emoji yuzleri yok; degerler kucuk tutuldu.
 * Tum alanlar 0..1 normalize (browAngle/headTilt isaretli).
 */
export interface EmotionProfile {
  /** Kaslarin genel yuksekligi. 0.5 = notr */
  browRaise: number;
  /** + ic uclar yukari (uzgun/endiseli), - ic uclar asagi (kizgin) */
  browAngle: number;
  /** Goz acikligi. 0.5 = notr */
  eyeOpen: number;
  /** Agiz kosesi. 0.5 = notr */
  smile: number;
  /** Bas egimi (radyan) */
  headTilt: number;
  /** Mikro hareket carpani */
  motion: number;
  /** Ses hizi (wpm hedefi) */
  wpm: number;
  /** Ses tonu carpani */
  pitch: number;
  /** Ambient isik carpani */
  glow: number;
}

export const EMOTION_PROFILES: Record<Emotion, EmotionProfile> = {
  IDLE: {
    browRaise: 0.5, browAngle: 0, eyeOpen: 0.5, smile: 0.5,
    headTilt: 0, motion: 1, wpm: 162, pitch: 0.94, glow: 1,
  },
  AMUSED: {
    browRaise: 0.6, browAngle: 0.1, eyeOpen: 0.42, smile: 0.74,
    headTilt: 0.035, motion: 1.15, wpm: 168, pitch: 0.97, glow: 1.05,
  },
  ANNOYED: {
    browRaise: 0.32, browAngle: -0.55, eyeOpen: 0.44, smile: 0.36,
    headTilt: -0.02, motion: 0.8, wpm: 152, pitch: 0.9, glow: 0.95,
  },
  SERIOUS: {
    browRaise: 0.42, browAngle: -0.2, eyeOpen: 0.5, smile: 0.45,
    headTilt: 0, motion: 0.55, wpm: 145, pitch: 0.9, glow: 1,
  },
  SUSPICIOUS: {
    browRaise: 0.44, browAngle: -0.35, eyeOpen: 0.3, smile: 0.44,
    headTilt: 0.05, motion: 0.7, wpm: 150, pitch: 0.92, glow: 0.98,
  },
  EXCITED: {
    browRaise: 0.78, browAngle: 0.15, eyeOpen: 0.66, smile: 0.68,
    headTilt: 0.02, motion: 1.5, wpm: 186, pitch: 1.02, glow: 1.12,
  },
  SURPRISED: {
    browRaise: 0.9, browAngle: 0.3, eyeOpen: 0.82, smile: 0.52,
    headTilt: 0.01, motion: 1.3, wpm: 172, pitch: 1.04, glow: 1.1,
  },
  MISSION: {
    browRaise: 0.46, browAngle: -0.25, eyeOpen: 0.54, smile: 0.46,
    headTilt: 0, motion: 0.7, wpm: 158, pitch: 0.92, glow: 1.06,
  },
  ALERT: {
    browRaise: 0.6, browAngle: -0.4, eyeOpen: 0.7, smile: 0.4,
    headTilt: 0, motion: 1.2, wpm: 166, pitch: 0.95, glow: 1.2,
  },
};

export function profileFor(emotion: Emotion): EmotionProfile {
  return EMOTION_PROFILES[emotion] ?? EMOTION_PROFILES.IDLE;
}

/** wpm -> SpeechSynthesis rate (1.0 ~= 160 wpm) */
export function wpmToRate(wpm: number): number {
  return clamp(wpm / 160, 0.6, 1.8);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
