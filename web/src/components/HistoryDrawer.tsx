import { AnimatePresence, motion } from 'framer-motion';
import { store, useAbiState } from '../state/store';
import { CloseIcon } from './Icons';

/** Gecmis ana ekranda yok; istenirse sagdan aciliyor. */
export function HistoryDrawer() {
  const state = useAbiState();

  return (
    <AnimatePresence>
      {state.historyOpen && (
        <motion.aside
          className="drawer drawer--history"
          role="dialog"
          aria-label="Konuşma geçmişi"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="drawer__head">
            <h2>Geçmiş</h2>
            <button
              type="button"
              className="icon-button"
              onClick={() => store.set({ historyOpen: false })}
              aria-label="Kapat"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="drawer__body">
            {state.history.length === 0 && <p className="empty">Henüz konuşmadınız.</p>}
            <ol className="history">
              {state.history.map((item) => (
                <li key={item.id} className={`history__item history__item--${item.role}`}>
                  <span className="history__who">{item.role === 'user' ? 'SEN' : 'ABİ'}</span>
                  <span className="history__text">{item.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
