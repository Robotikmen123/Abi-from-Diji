import { AnimatePresence, motion } from 'framer-motion';
import { useAbiState } from '../state/store';
import { visualFor } from '../state/stateConfig';

/** Kucuk, sessiz durum metni. Bagirmamali. */
export function StatusIndicator() {
  const state = useAbiState();
  let label = visualFor(state.ui).status;

  if (state.micMuted && (state.ui === 'IDLE' || state.ui === 'LISTENING')) {
    label = 'MİKROFON KAPALI';
  }
  if (state.screenOn && state.ui === 'PROCESSING') label = 'EKRANA BAKIYOR';

  const visible = state.settings.statusVisible && Boolean(label) && state.booted;

  return (
    <div className="status-layer">
      <AnimatePresence mode="wait">
        {visible && (
          <motion.span
            key={label}
            className="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
