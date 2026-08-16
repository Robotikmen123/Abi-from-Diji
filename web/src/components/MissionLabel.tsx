import { AnimatePresence, motion } from 'framer-motion';
import { useAbiState } from '../state/store';

/** Gorev etiketi: kucuk ve sol ustte. Task manager gorunumune donmemeli. */
export function MissionLabel() {
  const state = useAbiState();
  const mission = state.mission;

  return (
    <AnimatePresence>
      {mission && !state.settings.cinematicMode && (
        <motion.div
          className="mission"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="mission__title">GÖREV: {mission.title.toLocaleUpperCase('tr')}</span>
          <span className="mission__progress">
            {mission.step} / {mission.total}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
