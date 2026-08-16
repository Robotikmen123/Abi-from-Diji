import { useAbiState } from '../state/store';
import { CameraIcon, MicIcon, ScreenIcon } from './Icons';

/**
 * Gizlilik gostergeleri. Kucuk ama asla gizlenmez — sinematik modda bile
 * aktif donanim gorunur kalir.
 */
export function PrivacyIndicators() {
  const state = useAbiState();
  const micOn = state.micGranted && !state.micMuted;

  if (!micOn && !state.cameraOn && !state.screenOn) return null;

  return (
    <div className="privacy" role="status" aria-label="Aktif donanım">
      {micOn && (
        <span className="privacy__dot" title="Mikrofon açık">
          <MicIcon size={13} />
        </span>
      )}
      {state.cameraOn && (
        <span className="privacy__dot" title="Kamera açık">
          <CameraIcon size={13} />
        </span>
      )}
      {state.screenOn && (
        <span className="privacy__dot" title="Ekran paylaşımı açık">
          <ScreenIcon size={13} />
        </span>
      )}
    </div>
  );
}
