import { profileFor } from '../character/emotions';
import type { AvatarMode, Emotion } from '../state/stateConfig';
import type { EmblemState } from './emblem';

export interface RigInputs {
  mode: AvatarMode;
  emotion: Emotion;
  /** Konusma genligi 0..1 (viseme motorundan) */
  amplitude: number;
  motionScale: number;
  reduceMotion: boolean;
  dim: number;
  color: string;
  accent: string;
  wordmark: string;
}

const WAVE_SAMPLES = 72;

/** Duruma gore yorunge hizi (radyan/sn) ve halka enerjisi. */
const MODE_BEHAVIOUR: Record<AvatarMode, { spin: number; energy: number; drift: number }> = {
  boot: { spin: 0.15, energy: 0.2, drift: 0 },
  idle: { spin: 0.22, energy: 0.4, drift: 1 },
  attentive: { spin: 0.55, energy: 0.78, drift: 0.35 },
  thinking: { spin: 1.35, energy: 0.6, drift: 0.6 },
  lipSync: { spin: 0.4, energy: 0.95, drift: 0.5 },
  dim: { spin: 0.08, energy: 0.15, drift: 0.4 },
};

/**
 * Karakterin canli hissi buradan geliyor: hicbir hareket dongusel degil,
 * hepsi rastgele araliklarla planlanip yumusak sekilde hedefe kosuyor.
 */
export class EmblemRig {
  private state: EmblemState = {
    time: 0,
    breath: 0,
    driftX: 0,
    driftY: 0,
    coreBrightness: 1,
    ringEnergy: 0.2,
    spin: 0,
    amplitude: 0,
    wave: new Array(WAVE_SAMPLES).fill(0),
    scale: 1,
    presence: 0,
    dim: 0,
    color: '#3FD27A',
    accent: '#9CF7C2',
    wordmark: '@bi',
  };

  private targetDriftX = 0;
  private targetDriftY = 0;
  private nextDriftAt = 3000;
  private nextFlickerAt = 3500;
  private flickerPhase = -1;
  private elapsed = 0;

  update(dt: number, inputs: RigInputs): EmblemState {
    this.elapsed += dt;
    const s = this.state;
    s.time = this.elapsed;
    s.color = inputs.color;
    s.accent = inputs.accent;
    s.wordmark = inputs.wordmark;

    const profile = profileFor(inputs.emotion);
    const motion = inputs.reduceMotion ? 0.2 : inputs.motionScale * profile.motion;
    const behaviour = MODE_BEHAVIOUR[inputs.mode];

    const follow = (current: number, target: number, rate: number) =>
      current + (target - current) * Math.min(1, rate * dt * 0.001);

    // Yorunge: mod hizina yumusak gecis; ani hiz degisimi mekanik duruyor.
    s.spin += behaviour.spin * (0.6 + motion * 0.5) * dt * 0.001;

    s.ringEnergy = follow(s.ringEnergy, behaviour.energy * profile.glow, 3.5);
    s.amplitude = follow(s.amplitude, inputs.amplitude, 22);

    // Nefes: yaklasik 0.2 Hz, konusurken hafif hizlanir.
    const breathRate = 0.00128 * (inputs.mode === 'lipSync' ? 1.3 : 1);
    s.breath = Math.sin(this.elapsed * breathRate) * (inputs.reduceMotion ? 0.25 : 1);

    this.updateDrift(dt, behaviour.drift * motion, follow);
    this.updateFlicker(dt, motion);
    this.updateWave(inputs, motion);

    // Olcek: nefes + konusma genligi. Toplam oynama %4'u gecmiyor.
    const targetScale = 1 + s.breath * 0.014 * motion + s.amplitude * 0.02;
    s.scale = follow(s.scale, targetScale, 8);

    s.presence = follow(s.presence, inputs.mode === 'boot' ? 0 : 1, 2.4);
    s.dim = follow(s.dim, inputs.dim, 3);

    return s;
  }

  /** Uyandirma efekti: emblem merkeze toplanir ve enerjisi zipllar. */
  focusUser(): void {
    this.targetDriftX = 0;
    this.targetDriftY = 0;
    this.nextDriftAt = this.elapsed + 2000;
    this.state.ringEnergy = Math.min(1, this.state.ringEnergy + 0.35);
  }

  private updateDrift(
    dt: number,
    amount: number,
    follow: (current: number, target: number, rate: number) => number,
  ): void {
    if (this.elapsed >= this.nextDriftAt) {
      // Rastgele araliklar: donguselik hemen fark ediliyor.
      this.targetDriftX = (Math.random() * 2 - 1) * 6 * amount;
      this.targetDriftY = (Math.random() * 2 - 1) * 4 * amount;
      this.nextDriftAt = this.elapsed + 6000 + Math.random() * 9000;
    }
    this.state.driftX = follow(this.state.driftX, this.targetDriftX, 1.6);
    this.state.driftY = follow(this.state.driftY, this.targetDriftY, 1.6);
    void dt;
  }

  /** Goz kirpmanin karsiligi: cekirdek kisa sure sonup tarama cizgisi gecer. */
  private updateFlicker(dt: number, motion: number): void {
    const s = this.state;
    if (this.flickerPhase >= 0) {
      this.flickerPhase += dt;
      const total = 260;
      const t = this.flickerPhase / total;
      if (t >= 1) {
        this.flickerPhase = -1;
        s.coreBrightness = 1;
      } else {
        s.coreBrightness = t < 0.3 ? 1 - (t / 0.3) * 0.5 : 0.5 + ((t - 0.3) / 0.7) * 0.5;
      }
      return;
    }
    if (this.elapsed >= this.nextFlickerAt) {
      this.flickerPhase = 0;
      this.nextFlickerAt = this.elapsed + (3200 + Math.random() * 5200) / Math.max(0.4, motion);
    }
  }

  /**
   * Halka dalgasi. Tum ornekler ayni anda oynarsa metronom gibi duruyor;
   * her ornege faz kaydirmasi verilerek dalga cevrede dolasiyor.
   */
  private updateWave(inputs: RigInputs, motion: number): void {
    const s = this.state;
    const speaking = inputs.mode === 'lipSync';
    const base = speaking ? s.amplitude : inputs.mode === 'attentive' ? 0.12 : 0.05;

    for (let i = 0; i < s.wave.length; i += 1) {
      // Iki harmonik: tek sinus dalgasi halkayi birkac buyuk lobla yumru
      // haline getiriyor, ikinci bilesen dalgayi ince ve organik tutuyor.
      const time = this.elapsed * (speaking ? 0.0065 : 0.0016);
      const ripple =
        0.42 + 0.36 * Math.sin(time + i * 0.9) + 0.22 * Math.sin(time * 1.7 + i * 2.3);
      const target = base * ripple * (inputs.reduceMotion ? 0.3 : 1) * (0.6 + motion * 0.4);
      const current = s.wave[i] ?? 0;
      // Yukselis hizli, dusus yumusak: konusma atagi boyle okunuyor.
      s.wave[i] = target > current ? current + (target - current) * 0.5 : current * 0.86;
    }
  }
}
