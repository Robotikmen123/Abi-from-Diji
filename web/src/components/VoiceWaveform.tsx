import { useEffect, useRef } from 'react';
import { micEngine } from '../audio/micEngine';
import { useAbiState } from '../state/store';
import { visualFor } from '../state/stateConfig';

const BARS = 24;

/**
 * Mikrofon geri bildirimi. Sadece dinlerken gorunur; surekli dalga formu
 * ekranda gurultu yaratiyor ve karakterden dikkat caliyor.
 */
export function VoiceWaveform() {
  const state = useAbiState();
  const visible = visualFor(state.ui).waveform && !state.micMuted;
  const containerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLSpanElement[]>([]);

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const nodes = barsRef.current;
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (!node) continue;
        const value = micEngine.bars[i % micEngine.bars.length] ?? 0;
        // Minimum yukseklik: sessizlikte de ince bir cizgi kalsin.
        node.style.transform = `scaleY(${(0.08 + value * 0.92).toFixed(3)})`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className={`waveform${visible ? ' waveform--on' : ''}`}
      aria-hidden="true"
    >
      {Array.from({ length: BARS }, (_, index) => (
        <span
          key={index}
          className="waveform__bar"
          ref={(node) => {
            if (node) barsRef.current[index] = node;
          }}
        />
      ))}
    </div>
  );
}
