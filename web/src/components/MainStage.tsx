import { useAbiState } from '../state/store';
import { AmbientGlow } from './AmbientGlow';
import { AvatarStage } from './AvatarStage';
import { StatusIndicator } from './StatusIndicator';
import { SubtitleOverlay } from './SubtitleOverlay';
import { VoiceWaveform } from './VoiceWaveform';

/**
 * Sahne. Dashboard degil: ust %10 minimum UI, orta %65 karakter,
 * alt %25 altyazi + durum + mikrofon geri bildirimi.
 */
export function MainStage() {
  const state = useAbiState();

  return (
    <main
      className={[
        'main-stage',
        state.settings.gameMode ? 'main-stage--game' : '',
        state.desktop && state.settings.windowMode === 'mini' ? 'main-stage--mini' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-state={state.ui}
    >
      <div className="avatar-stage">
        <AmbientGlow />
        <div className="avatar-layer">
          <AvatarStage />
        </div>
      </div>

      <div className="interaction-layer">
        <SubtitleOverlay />
        <StatusIndicator />
        <VoiceWaveform />
      </div>
    </main>
  );
}
