import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { speechInput } from '../audio/speechRecognition';
import { runtime } from '../lib/runtime';
import { useAbiState } from '../state/store';
import { SendIcon } from './Icons';

/**
 * Ana etkileşim ses. Bu alan sadece ses tanima desteklenmiyorsa ya da
 * kullanici "/" ile actiginda gorunur; buyuk input kutusu ana ekranda yer almaz.
 */
export function TextFallbackInput() {
  const state = useAbiState();
  const [open, setOpen] = useState(!speechInput.supported);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && /input|textarea|select/i.test(target.tagName);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        setOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 30);
      }
      if (event.key === 'Escape' && speechInput.supported) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (state.settings.cinematicMode) return null;

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    setValue('');
    runtime.sendTyped(text);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.form
          className="text-input"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={value}
            placeholder="Yaz…"
            aria-label="ABİ'ye yaz"
            onChange={(event) => setValue(event.target.value)}
          />
          <button type="submit" aria-label="Gönder">
            <SendIcon />
          </button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
