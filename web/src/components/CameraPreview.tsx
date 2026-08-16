import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { captureEngine } from '../vision/captureEngine';
import { useAbiState } from '../state/store';

/**
 * Kamera onizlemesi varsayilan olarak kapali: ana ekranda video karesi
 * karakter hissini bozuyor. Sadece ayarlardan acildiginda, kucuk ve kosede.
 */
export function CameraPreview() {
  const state = useAbiState();
  const ref = useRef<HTMLVideoElement>(null);
  const visible = state.cameraOn && state.settings.cameraPreview;

  useEffect(() => {
    const video = ref.current;
    if (!video || !visible) return;
    const stream = captureEngine.streamFor('camera');
    if (!stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [visible, state.cameraOn]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.video
          ref={ref}
          className="camera-preview"
          muted
          playsInline
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 0.9, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </AnimatePresence>
  );
}
