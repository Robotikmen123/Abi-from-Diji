import { useEffect, useRef } from 'react';
import { voiceEngine } from '../audio/voiceEngine';
import { micEngine } from '../audio/micEngine';
import { profileFor } from '../character/emotions';
import { useAbiState } from '../state/store';
import { visualFor } from '../state/stateConfig';

/**
 * Karakterin arkasindaki isik. Renk degistirmek yerine yogunluk, olcek ve
 * bulanikligi degistiriyor: neon logo degil, ortam isigi hissi olmali.
 */
export function AmbientGlow() {
  const ref = useRef<HTMLDivElement>(null);
  const state = useAbiState();
  const visual = visualFor(state.ui);
  const emotionGlow = profileFor(state.emotion).glow;

  const target = useRef({ base: 0, pulse: 0, gain: 1 });
  target.current = {
    base: visual.glow * state.settings.glowIntensity * emotionGlow,
    pulse: state.settings.reduceMotion ? 0 : visual.glowPulse,
    gain: state.ui === 'SPEAKING' ? 1 : state.ui === 'LISTENING' ? 0.6 : 0,
  };

  useEffect(() => {
    let raf = 0;
    let current = 0;
    let scale = 1;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const node = ref.current;
      if (!node) return;

      const { base, pulse, gain } = target.current;
      // Nefes gibi cok yavas pulse; THINKING disinda neredeyse fark edilmez.
      const breath = Math.sin(now * 0.0013) * pulse;
      // Ses genligi isigi %5-10 oyniyor, daha fazlasi demo efektine donuyor.
      const reactive =
        gain > 0
          ? (state.ui === 'SPEAKING' ? voiceEngine.amplitude : micEngine.level) * 0.09 * gain
          : 0;

      const value = Math.max(0, base + breath + reactive);
      current += (value - current) * 0.12;
      scale += (1 + current * 0.16 - scale) * 0.1;

      node.style.opacity = current.toFixed(3);
      node.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state.ui]);

  return <div ref={ref} className="ambient-glow" aria-hidden="true" />;
}
