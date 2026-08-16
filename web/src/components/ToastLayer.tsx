import { AnimatePresence, motion } from 'framer-motion';
import { store, useAbiState } from '../state/store';

/** Kompakt, blur'lu, kisa omurlu. Teknik hata kodu gosterilmez. */
export function ToastLayer() {
  const toasts = useAbiState().toasts;

  return (
    <div className="toast-layer">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.button
            key={toast.id}
            type="button"
            className={`toast toast--${toast.tone}`}
            onClick={() => store.dismissToast(toast.id)}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {toast.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
