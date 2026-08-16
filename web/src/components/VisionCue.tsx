import { AnimatePresence, motion } from 'framer-motion';
import { useAbiState } from '../state/store';
import { EyeIcon, ScreenIcon } from './Icons';

/**
 * Karakter bakarken avatarin yaninda beliren minik isaret.
 * Buyuk "ANALYZING CAMERA" yazisi yok; ipucu kadar.
 */
export function VisionCue() {
  const state = useAbiState();
  const looking = (state.cameraOn || state.screenOn) && state.ui === 'PROCESSING';

  return (
    <AnimatePresence>
      {looking && (
        <motion.span
          className="vision-cue"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 0.75, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden="true"
        >
          {state.screenOn ? <ScreenIcon size={15} /> : <EyeIcon size={15} />}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
