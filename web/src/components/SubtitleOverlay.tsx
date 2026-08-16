import { AnimatePresence, motion } from 'framer-motion';
import { useAbiState } from '../state/store';
import { visualFor } from '../state/stateConfig';

/**
 * Film altyazisi mantigi: sohbet balonu degil, sahnenin altinda duran metin.
 */
export function SubtitleOverlay() {
  const state = useAbiState();
  const visible =
    state.settings.subtitleVisible && Boolean(state.subtitle) && visualFor(state.ui).subtitle;

  return (
    <div className="subtitle-layer" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">
        {visible && (
          <motion.p
            key={state.subtitle}
            className={`subtitle${state.settings.highContrastSubtitle ? ' subtitle--contrast' : ''}`}
            style={{ fontSize: `calc(var(--subtitle-size) * ${state.settings.subtitleScale})` }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {state.subtitle}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
