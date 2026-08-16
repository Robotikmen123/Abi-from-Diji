import { runtime } from '../lib/runtime';
import { store, useAbiState } from '../state/store';
import { visualFor } from '../state/stateConfig';
import {
  CameraIcon,
  CameraOffIcon,
  ExitFullscreenIcon,
  FullscreenIcon,
  HistoryIcon,
  MicIcon,
  MicOffIcon,
  SettingsIcon,
} from './Icons';

interface Props {
  onToggleFullscreen: () => void;
}

/**
 * Minimal ust bar. Kalici navbar yok; butonlar dusuk opaklikta bekler.
 */
export function TopControls({ onToggleFullscreen }: Props) {
  const state = useAbiState();
  if (state.settings.cinematicMode) return null;

  const opacity = visualFor(state.ui).controlsOpacity;

  return (
    <header className="top-bar" style={{ opacity: state.booted ? opacity : 0 }}>
      <span className="brand">ABİ</span>

      <nav className="top-bar__actions">
        <IconButton
          label={state.micMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
          active={!state.micMuted}
          onClick={() => runtime.setMuted(!state.micMuted)}
        >
          {state.micMuted ? <MicOffIcon /> : <MicIcon />}
        </IconButton>

        <IconButton
          label={state.cameraOn ? 'Kamerayı kapat' : 'Kamerayı aç'}
          active={state.cameraOn}
          onClick={() => store.set({ cameraOn: !state.cameraOn })}
        >
          {state.cameraOn ? <CameraIcon /> : <CameraOffIcon />}
        </IconButton>

        <IconButton
          label="Geçmiş"
          active={state.historyOpen}
          onClick={() => store.set({ historyOpen: !state.historyOpen, settingsOpen: false })}
        >
          <HistoryIcon />
        </IconButton>

        <IconButton
          label={state.fullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
          active={state.fullscreen}
          onClick={onToggleFullscreen}
        >
          {state.fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </IconButton>

        <IconButton
          label="Ayarlar"
          active={state.settingsOpen}
          onClick={() => store.set({ settingsOpen: !state.settingsOpen, historyOpen: false })}
        >
          <SettingsIcon />
        </IconButton>
      </nav>
    </header>
  );
}

function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`icon-button${active ? ' icon-button--active' : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
