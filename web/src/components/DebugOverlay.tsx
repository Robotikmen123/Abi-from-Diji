import { useAbiState } from '../state/store';

/** Sadece gelistirici modunda. Normal kullanici bunlari gormez. */
export function DebugOverlay() {
  const state = useAbiState();
  if (!state.settings.devMode) return null;
  const d = state.debug;

  return (
    <div className="debug">
      <Row label="FPS" value={String(d.fps)} />
      <Row label="STT" value={`${d.sttLatency} ms`} />
      <Row label="LLM ilk token" value={`${d.firstToken} ms`} />
      <Row label="TTS başlangıç" value={`${d.ttsStart} ms`} />
      <Row label="Toplam ses" value={`${d.totalVoice} ms`} />
      <Row label="Durum" value={state.ui} />
      <Row label="Duygu" value={state.emotion} />
      <Row label="VAD" value={d.vad ? 'konuşma' : 'sessiz'} />
      <Row label="Sağlayıcı" value={d.provider} />
      <Row label="Görme" value={d.vision} />
      <Row label="Hafıza" value={String(state.history.length)} />
      {state.interim && <Row label="Tanıma" value={state.interim} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="debug__row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
