import { useSyncExternalStore } from 'react';
import type { Emotion, UiState } from './stateConfig';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'warn';
}

export interface HistoryItem {
  id: number;
  role: 'user' | 'abi';
  text: string;
  at: number;
}

export interface Mission {
  title: string;
  step: number;
  total: number;
  /** Tamamlandi: etiket kisa bir mikro animasyonla soner. */
  done: boolean;
}

export interface DebugMetrics {
  fps: number;
  sttLatency: number;
  firstToken: number;
  ttsStart: number;
  totalVoice: number;
  provider: string;
  vad: boolean;
  memoryEvents: number;
  /** Son gonderilen goruntu kaynagi. */
  vision: string;
}

export interface AbiState {
  ui: UiState;
  emotion: Emotion;
  /** Ekranda gorunen altyazi. */
  subtitle: string;
  /** Kullanicinin anlik tanimasi (debug ve wake-word icin). */
  interim: string;
  connected: boolean;
  micGranted: boolean;
  micMuted: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  settingsOpen: boolean;
  historyOpen: boolean;
  fullscreen: boolean;
  /** Masaustu kabugunda mi calisiyor? */
  desktop: boolean;
  booted: boolean;
  toasts: Toast[];
  history: HistoryItem[];
  mission: Mission | null;
  debug: DebugMetrics;
  settings: Settings;
}

const initial: AbiState = {
  ui: 'BOOT',
  emotion: 'IDLE',
  subtitle: '',
  interim: '',
  connected: false,
  micGranted: false,
  micMuted: false,
  cameraOn: false,
  screenOn: false,
  settingsOpen: false,
  historyOpen: false,
  fullscreen: false,
  desktop: false,
  booted: false,
  toasts: [],
  history: [],
  mission: null,
  debug: {
    fps: 0,
    sttLatency: 0,
    firstToken: 0,
    ttsStart: 0,
    totalVoice: 0,
    provider: '-',
    vad: false,
    memoryEvents: 0,
    vision: '-',
  },
  settings: DEFAULT_SETTINGS,
};

type Listener = () => void;

class Store {
  private state: AbiState = { ...initial, settings: loadSettings() };
  private listeners = new Set<Listener>();
  private toastId = 0;
  private historyId = 0;

  getState = (): AbiState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set(patch: Partial<AbiState>): void {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof AbiState)[]) {
      if (this.state[key] !== patch[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  patchSettings(patch: Partial<Settings>): void {
    const settings = { ...this.state.settings, ...patch };
    this.state = { ...this.state, settings };
    saveSettings(settings);
    this.emit();
  }

  patchDebug(patch: Partial<DebugMetrics>): void {
    this.state = { ...this.state, debug: { ...this.state.debug, ...patch } };
    this.emit();
  }

  toast(text: string, tone: Toast['tone'] = 'info', ttl = 3200): void {
    // Ayni mesaji tekrar tekrar yigma; hata spam'i karakteri bozuyor.
    if (this.state.toasts.some((t) => t.text === text)) return;
    const id = (this.toastId += 1);
    this.set({ toasts: [...this.state.toasts, { id, text, tone }] });
    window.setTimeout(() => this.dismissToast(id), ttl);
  }

  dismissToast(id: number): void {
    this.set({ toasts: this.state.toasts.filter((t) => t.id !== id) });
  }

  pushHistory(role: HistoryItem['role'], text: string): void {
    const clean = text.trim();
    if (!clean) return;
    const item: HistoryItem = { id: (this.historyId += 1), role, text: clean, at: Date.now() };
    this.set({ history: [...this.state.history, item].slice(-200) });
  }

  clearHistory(): void {
    this.set({ history: [] });
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const store = new Store();

export function useAbi<T>(selector: (state: AbiState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}

export function useAbiState(): AbiState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
