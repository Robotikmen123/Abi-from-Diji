import { useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { serverVoice } from './audio/serverVoice';
import { voiceEngine } from './audio/voiceEngine';
import { CameraPreview } from './components/CameraPreview';
import { DebugOverlay } from './components/DebugOverlay';
import { HistoryDrawer } from './components/HistoryDrawer';
import { MainStage } from './components/MainStage';
import { MissionLabel } from './components/MissionLabel';
import { PrivacyIndicators } from './components/PrivacyIndicators';
import { SettingsDrawer } from './components/SettingsDrawer';
import { TextFallbackInput } from './components/TextFallbackInput';
import { ToastLayer } from './components/ToastLayer';
import { VisionCue } from './components/VisionCue';
import { TopControls } from './components/TopControls';
import { desktopBridge } from './lib/desktop';
import { runtime } from './lib/runtime';
import { store, useAbiState } from './state/store';

export default function App() {
  const state = useAbiState();

  useEffect(() => {
    void runtime.boot();
    // Gelistirme sirasinda durum makinesini disaridan surebilmek icin
    // (otomatik testler ve hata ayiklama). Uretim paketinde yer almaz.
    if (import.meta.env.DEV) {
      (window as unknown as { __abi?: unknown }).__abi = { runtime, store, voiceEngine };
    }
    // Kayitli ses ayarlarini motora aktar.
    const { settings } = store.getState();
    voiceEngine.setVoice(settings.voiceId);
    voiceEngine.settings.rateScale = settings.speechRate;
    voiceEngine.settings.pitchScale = settings.speechPitch;
    voiceEngine.settings.volume = settings.volume;
    serverVoice.setBassGain(settings.voiceBass);
  }, []);

  // Masaustu kabugu: kayitli pencere modunu geri yukle.
  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) return;
    store.set({ desktop: true });
    const { windowMode, clickThrough } = store.getState().settings;
    bridge.setMode(windowMode).catch(() => undefined);
    bridge.setClickThrough(clickThrough).catch(() => undefined);
  }, []);

  // Tarayici ses ve mikrofon icin kullanici hareketi bekliyor.
  useEffect(() => {
    const unlock = () => {
      voiceEngine.unlock();
      if (!store.getState().micGranted) void runtime.startListening();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onChange = () => store.set({ fullscreen: Boolean(document.fullscreenElement) });
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Kisayollar: sesli etkilesim ana yol, klavye sadece hizlandirici.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;

      switch (event.key.toLocaleLowerCase('tr')) {
        case 'm':
          runtime.setMuted(!store.getState().micMuted);
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'c':
          store.patchSettings({ cinematicMode: !store.getState().settings.cinematicMode });
          break;
        case 'd':
          store.patchSettings({ devMode: !store.getState().settings.devMode });
          break;
        case 'o': {
          // Masaustunde pencere <-> overlay arasinda hizli gecis.
          const bridge = desktopBridge();
          if (!bridge) break;
          const next = store.getState().settings.windowMode === 'overlay' ? 'window' : 'overlay';
          store.patchSettings({ windowMode: next });
          bridge.setMode(next).catch(() => undefined);
          break;
        }
        case 'escape':
          store.set({ settingsOpen: false, historyOpen: false });
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleFullscreen]);

  // Tam ekranda fare durunca kontroller kaybolur.
  useEffect(() => {
    if (!state.fullscreen) {
      document.body.classList.remove('hide-controls');
      return;
    }
    let timer = 0;
    const wake = () => {
      document.body.classList.remove('hide-controls');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => document.body.classList.add('hide-controls'), 3000);
    };
    wake();
    window.addEventListener('pointermove', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      document.body.classList.remove('hide-controls');
    };
  }, [state.fullscreen]);

  return (
    <div
      className={[
        'app-shell',
        state.settings.cinematicMode ? 'app-shell--cinematic' : '',
        state.desktop ? `app-shell--${state.settings.windowMode}` : '',
        state.fullscreen ? 'app-shell--fullscreen' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <TopControls onToggleFullscreen={toggleFullscreen} />
      <MissionLabel />
      <MainStage />
      <VisionCue />
      <CameraPreview />
      <PrivacyIndicators />
      <TextFallbackInput />
      <SettingsDrawer />
      <HistoryDrawer />
      <ToastLayer />
      <DebugOverlay />

      <AnimatePresence>
        {!state.booted && (
          <motion.div
            className="boot"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.45 }}
              transition={{ delay: 0.35, duration: 0.5 }}
            >
              ABİ UYANIYOR
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
