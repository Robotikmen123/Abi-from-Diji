import { useEffect, useRef } from 'react';
import { voiceEngine } from '../audio/voiceEngine';
import { EmblemRig } from '../avatar/rig';
import { drawEmblem } from '../avatar/emblem';
import { colors } from '../design/tokens';
import { store, useAbiState } from '../state/store';
import { visualFor } from '../state/stateConfig';

/**
 * Karakter sahnesi. Kendi rAF dongusunde calisir ve React render'ina bagli degil:
 * LLM cevabinin gelmesi veya panel acilmasi animasyonu bloklamamali.
 */
export function AvatarStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useAbiState();
  // Yuksek frekansli degerler ref uzerinden okunur; her karede render tetiklemez.
  const live = useRef({
    mode: 'boot',
    emotion: 'IDLE',
    motion: 1,
    reduce: false,
    dim: 0,
    scale: 1,
    wordmark: '@bi',
  });

  const visual = visualFor(state.ui);
  live.current = {
    mode: state.booted ? visual.avatar : 'boot',
    emotion: state.emotion,
    motion: state.settings.animationIntensity,
    reduce: state.settings.reduceMotion,
    dim: state.ui === 'OFFLINE' ? 1 : 0,
    scale: state.settings.avatarScale,
    wordmark: state.settings.wordmark,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const rig = new EmblemRig();
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let fpsClock = last;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      const dt = Math.min(64, now - last);
      last = now;

      const inputs = live.current;
      const emblem = rig.update(dt, {
        mode: inputs.mode as never,
        emotion: inputs.emotion as never,
        amplitude: voiceEngine.amplitude,
        motionScale: inputs.motion,
        reduceMotion: inputs.reduce,
        dim: inputs.dim,
        color: colors.glow,
        accent: colors.glowAccent,
        wordmark: inputs.wordmark,
      });

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Emblem ~ekranin kisa kenarinin yarisi kadar yer kaplar.
      const base = Math.min(height / 300, width / 300);
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(base * inputs.scale, base * inputs.scale);
      drawEmblem(ctx, emblem);
      ctx.restore();

      frames += 1;
      if (now - fpsClock >= 1000) {
        if (store.getState().settings.devMode) {
          store.patchDebug({ fps: Math.round((frames * 1000) / (now - fpsClock)) });
        }
        frames = 0;
        fpsClock = now;
      }
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="avatar-canvas" aria-hidden="true" />;
}
