import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { voiceEngine, type VoiceOption } from '../audio/voiceEngine';
import { desktopBridge } from '../lib/desktop';
import { store, useAbiState } from '../state/store';
import type { PersonaIntensity, ProactiveLevel, Settings } from '../state/settings';
import { CloseIcon } from './Icons';

const PERSONA_LABELS: Record<PersonaIntensity, string> = {
  calm: 'Sakin',
  normal: 'Normal',
  abi: 'Abi Modu',
};

const PROACTIVE_LABELS: Record<ProactiveLevel, string> = {
  quiet: 'Sessiz',
  normal: 'Normal',
  chatty: 'Geveze',
};

export function SettingsDrawer() {
  const state = useAbiState();
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const settings = state.settings;

  useEffect(() => {
    if (!state.settingsOpen) return;
    const load = () => setVoices(voiceEngine.listVoices());
    load();
    // Sesler bazi tarayicilarda gecikmeli yukleniyor.
    const timer = window.setTimeout(load, 400);
    return () => window.clearTimeout(timer);
  }, [state.settingsOpen]);

  const update = (patch: Partial<Settings>) => store.patchSettings(patch);

  return (
    <AnimatePresence>
      {state.settingsOpen && (
        <motion.aside
          className="drawer"
          role="dialog"
          aria-label="Ayarlar"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="drawer__head">
            <h2>Ayarlar</h2>
            <button
              type="button"
              className="icon-button"
              onClick={() => store.set({ settingsOpen: false })}
              aria-label="Kapat"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="drawer__body">
            <Section title="Ses">
              <Field label="Ses seçimi">
                <select
                  value={settings.voiceId ?? ''}
                  onChange={(event) => {
                    const value = event.target.value || null;
                    update({ voiceId: value });
                    voiceEngine.setVoice(value);
                  }}
                >
                  <option value="">Otomatik (Türkçe erkek)</option>
                  {voices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.label}
                      {voice.male ? ' — erkek' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Slider
                label="Konuşma hızı"
                value={settings.speechRate}
                min={0.7}
                max={1.4}
                step={0.05}
                onChange={(value) => {
                  update({ speechRate: value });
                  voiceEngine.settings.rateScale = value;
                }}
              />
              <Slider
                label="Ton"
                value={settings.speechPitch}
                min={0.7}
                max={1.3}
                step={0.05}
                onChange={(value) => {
                  update({ speechPitch: value });
                  voiceEngine.settings.pitchScale = value;
                }}
              />
              <Slider
                label="Ses seviyesi"
                value={settings.volume}
                min={0}
                max={1}
                step={0.05}
                onChange={(value) => {
                  update({ volume: value });
                  voiceEngine.settings.volume = value;
                }}
              />
              <Toggle
                label="Araya girince sus"
                hint="Sen konuşmaya başlayınca ABİ anında susar."
                value={settings.autoInterrupt}
                onChange={(value) => update({ autoInterrupt: value })}
              />
              <Toggle
                label="Akışkan seslendirme"
                hint="Cevabın tamamı beklenmeden ilk cümle söylenir."
                value={settings.streamingTts}
                onChange={(value) => update({ streamingTts: value })}
              />
            </Section>

            <Section title="Mikrofon">
              <Toggle
                label="Mikrofon"
                value={settings.micEnabled}
                onChange={(value) => update({ micEnabled: value })}
              />
              <Toggle
                label="Konuşma modu"
                hint="Açıkken uyandırma sözcüğü gerekmez."
                value={settings.conversationMode}
                onChange={(value) => update({ conversationMode: value })}
              />
              <Toggle
                label='Uyandırma sözcüğü ("Abi")'
                value={settings.wakeWordEnabled}
                onChange={(value) => update({ wakeWordEnabled: value })}
              />
            </Section>

            <Section title="Kamera">
              <Toggle
                label="Kamera"
                value={settings.cameraEnabled}
                onChange={(value) => update({ cameraEnabled: value })}
              />
              <Toggle
                label="Önizlemeyi göster"
                hint="Ana ekranda kamera görüntüsü karakter hissini bozar; varsayılan kapalı."
                value={settings.cameraPreview}
                onChange={(value) => update({ cameraPreview: value })}
              />
            </Section>

            <Section title="Karakter">
              <Choice
                label="Karakter yoğunluğu"
                value={settings.personaIntensity}
                options={Object.entries(PERSONA_LABELS) as [PersonaIntensity, string][]}
                onChange={(value) => update({ personaIntensity: value })}
              />
              <Choice
                label="Kendiliğinden konuşma"
                value={settings.proactiveLevel}
                options={Object.entries(PROACTIVE_LABELS) as [ProactiveLevel, string][]}
                onChange={(value) => update({ proactiveLevel: value })}
              />
            </Section>

            <Section title="Hafıza">
              <Toggle
                label="Hafıza"
                value={settings.memoryEnabled}
                onChange={(value) => update({ memoryEnabled: value })}
              />
              <Field label="Sana nasıl hitap etsin">
                <input
                  type="text"
                  value={settings.userName ?? ''}
                  placeholder="Adın"
                  onChange={(event) => update({ userName: event.target.value || null })}
                />
              </Field>
              <button
                type="button"
                className="pill-button pill-button--danger"
                onClick={() => {
                  void fetch('/api/memory', { method: 'DELETE' });
                  store.clearHistory();
                  store.toast('Hafıza temizlendi.');
                }}
              >
                Hafızayı temizle
              </button>
            </Section>

            <Section title="Görünüm">
              <Field label="Emblem yazısı">
                <input
                  type="text"
                  maxLength={6}
                  value={settings.wordmark}
                  onChange={(event) => update({ wordmark: event.target.value })}
                />
              </Field>
              <Slider
                label="Avatar boyutu"
                value={settings.avatarScale}
                min={0.7}
                max={1.3}
                step={0.05}
                onChange={(value) => update({ avatarScale: value })}
              />
              <Slider
                label="Altyazı boyutu"
                value={settings.subtitleScale}
                min={0.8}
                max={1.5}
                step={0.05}
                onChange={(value) => update({ subtitleScale: value })}
              />
              <Toggle
                label="Altyazı"
                value={settings.subtitleVisible}
                onChange={(value) => update({ subtitleVisible: value })}
              />
              <Toggle
                label="Durum metni"
                value={settings.statusVisible}
                onChange={(value) => update({ statusVisible: value })}
              />
              <Toggle
                label="Yüksek kontrast altyazı"
                value={settings.highContrastSubtitle}
                onChange={(value) => update({ highContrastSubtitle: value })}
              />
              <Slider
                label="Işık yoğunluğu"
                value={settings.glowIntensity}
                min={0}
                max={1.6}
                step={0.05}
                onChange={(value) => update({ glowIntensity: value })}
              />
              <Slider
                label="Hareket yoğunluğu"
                value={settings.animationIntensity}
                min={0}
                max={1.6}
                step={0.05}
                onChange={(value) => update({ animationIntensity: value })}
              />
              <Toggle
                label="Hareketi azalt"
                value={settings.reduceMotion}
                onChange={(value) => update({ reduceMotion: value })}
              />
            </Section>

            {state.desktop && (
              <Section title="Masaüstü">
                <Choice
                  label="Pencere modu"
                  value={settings.windowMode}
                  options={[
                    ['window', 'Pencere'],
                    ['overlay', 'Overlay'],
                    ['mini', 'Mini'],
                  ]}
                  onChange={(value) => {
                    update({ windowMode: value });
                    // Pencere yeniden kuruldugu icin yanit gelmeden sayfa kapanir.
                    desktopBridge()?.setMode(value).catch(() => undefined);
                  }}
                />
                <Toggle
                  label="Tıklamaları geçir"
                  hint="Overlay modda fare tıklamaları altındaki pencereye gider."
                  value={settings.clickThrough}
                  onChange={(value) => {
                    update({ clickThrough: value });
                    desktopBridge()?.setClickThrough(value).catch(() => undefined);
                  }}
                />
                <p className="field__hint">Göster/gizle: Ctrl+Shift+A · Overlay: O</p>
              </Section>
            )}

            <Section title="Gelişmiş">
              <Toggle
                label="Sinematik mod"
                hint="Tüm kontroller gizlenir; sadece karakter kalır."
                value={settings.cinematicMode}
                onChange={(value) => update({ cinematicMode: value })}
              />
              <Toggle
                label="Oyun modu"
                hint="Avatar köşeye küçülür, ekranı kapatmaz."
                value={settings.gameMode}
                onChange={(value) => update({ gameMode: value })}
              />
              <Toggle
                label="Geliştirici modu"
                value={settings.devMode}
                onChange={(value) => update({ devMode: value })}
              />
            </Section>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="field field--row">
      <span>
        <span className="field__label">{label}</span>
        {hint && <span className="field__hint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        className={`switch${value ? ' switch--on' : ''}`}
        onClick={() => onChange(!value)}
      >
        <span className="switch__dot" />
      </button>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span className="field__label">
        {label}
        <span className="field__value">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="segmented">
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            className={`segmented__item${value === key ? ' segmented__item--on' : ''}`}
            onClick={() => onChange(key)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
