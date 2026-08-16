import { micEngine } from '../audio/micEngine';
import { speechInput } from '../audio/speechRecognition';
import { voiceEngine } from '../audio/voiceEngine';
import { fetchHealth, streamChat, type ChatTurn } from '../net/chatStream';
import { captureEngine, detectVisionIntent, type VisionSource } from '../vision/captureEngine';
import { store } from '../state/store';
import type { Emotion, UiState } from '../state/stateConfig';
import type { Mission } from '../state/store';

/** Oturum acilisinda soylenebilecek replikler. Bazen hic konusmaz. */
const OPENERS = ['Hmm?', 'Buradayım.', 'Ne var?', 'Gel bakalım.', 'Söyle.'];

/** Uzun dusunmede araya giren kisa geri bildirim. */
const FILLERS = ['Bir saniye…', 'Dur bakayım.', 'Hmm…'];

const PROACTIVE_WINDOW: Record<string, [number, number] | null> = {
  quiet: null,
  normal: [95_000, 150_000],
  chatty: [45_000, 80_000],
};

/**
 * Karakterin calisma dongusu. React disinda tutuldu: mikrofon, ses ve akis
 * durumlari render'a bagli olmamali, aksi halde barge-in gecikiyor.
 */
class AbiRuntime {
  private abortChat: (() => void) | null = null;
  private started = false;
  private turnHistory: ChatTurn[] = [];
  private pendingReply = '';
  private streaming = false;
  private spokeThisTurn = false;
  private fillerTimer = 0;
  private subtitleTimer = 0;
  private idleTimer = 0;
  private lastProactiveAt = 0;
  private lastInteractionAt = Date.now();
  private awake = false;
  private speechEndedAt = 0;
  private requestSentAt = 0;
  private greeted = false;

  async boot(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.wireVoice();
    this.wireMic();
    this.wireStt();

    // Kullanici paylasimi sistem arayuzunden durdurabilir.
    captureEngine.onStopped = (source) => {
      store.set(source === 'camera' ? { cameraOn: false } : { screenOn: false });
    };

    const health = await fetchHealth();
    store.set({ connected: health.ok });
    if (health.llm) store.patchDebug({ provider: health.llm.id });

    // Acilis animasyonu 1.1 sn; karakter once beliriyor, sonra sahne aciliyor.
    window.setTimeout(() => {
      store.set({ booted: true, ui: health.ok ? 'IDLE' : 'OFFLINE' });
      if (health.ok) void this.startListening();
      else store.toast('Sunucuya ulaşamadım.', 'warn');
    }, 1100);

    this.idleTimer = window.setInterval(() => this.checkIdle(), 5000);
    window.addEventListener('beforeunload', () => this.shutdown());
  }

  shutdown(): void {
    this.abortChat?.();
    voiceEngine.stop();
    speechInput.stop();
    micEngine.stop();
    captureEngine.stopAll();
    window.clearInterval(this.idleTimer);
  }

  // ---------------------------------------------------------------- giris

  async startListening(): Promise<void> {
    const { settings } = store.getState();
    if (!settings.micEnabled) return;

    const granted = await micEngine.start();
    store.set({ micGranted: granted });
    if (!granted) {
      store.toast('Mikrofona erişemedim.', 'warn');
      return;
    }
    micEngine.setMuted(store.getState().micMuted);
    voiceEngine.unlock();

    if (speechInput.supported && settings.conversationMode) speechInput.start();
    else if (!speechInput.supported) {
      store.toast('Bu tarayıcı ses tanımayı desteklemiyor. Yazarak konuşabilirsin.', 'warn', 5000);
    }

    this.maybeGreet();
  }

  setMuted(muted: boolean): void {
    store.set({ micMuted: muted });
    micEngine.setMuted(muted);
    if (muted) speechInput.stop();
    else if (speechInput.supported && store.getState().settings.conversationMode) {
      speechInput.start();
    }
  }

  private wireMic(): void {
    micEngine.on({
      onSpeechStart: () => {
        store.patchDebug({ vad: true });
        const state = store.getState();

        // Barge-in: ABI konusurken kullanici konusmaya baslarsa aninda sus.
        if (state.ui === 'SPEAKING' && state.settings.autoInterrupt) {
          this.interrupt();
          return;
        }
        if (state.ui === 'IDLE' || state.ui === 'INTERRUPTED') {
          this.setUi('LISTENING');
        }
      },
      onSpeechEnd: () => {
        store.patchDebug({ vad: false });
        this.speechEndedAt = performance.now();
        const state = store.getState();
        if (state.ui !== 'LISTENING') return;
        // Tanima gelmezse ekranda asili kalmasin.
        window.setTimeout(() => {
          const now = store.getState();
          if (now.ui === 'LISTENING' && !this.streaming) this.setUi('IDLE');
        }, 1400);
      },
      onError: (message) => store.toast(message, 'warn'),
    });
  }

  private wireStt(): void {
    speechInput.on({
      onInterim: (text) => {
        store.set({ interim: text });
        if (store.getState().ui === 'IDLE') this.setUi('LISTENING');
      },
      onFinal: (text) => {
        store.set({ interim: '' });
        const latency = this.speechEndedAt ? performance.now() - this.speechEndedAt : 0;
        if (latency > 0) store.patchDebug({ sttLatency: Math.round(latency) });
        this.handleUserSpeech(text);
      },
      onError: (message) => store.toast(message, 'warn'),
    });
  }

  private wireVoice(): void {
    voiceEngine.on({
      onPhraseStart: (text) => {
        window.clearTimeout(this.fillerTimer);
        window.clearTimeout(this.subtitleTimer);
        if (!this.spokeThisTurn) {
          this.spokeThisTurn = true;
          if (this.requestSentAt) {
            store.patchDebug({ ttsStart: Math.round(performance.now() - this.requestSentAt) });
          }
          if (this.speechEndedAt) {
            store.patchDebug({ totalVoice: Math.round(performance.now() - this.speechEndedAt) });
          }
        }
        store.set({ subtitle: text });
        this.setUi('SPEAKING');
      },
      onIdle: () => {
        if (this.streaming) return;
        this.finishTurn();
      },
      onError: () => {
        store.toast('Ses çıkışında sorun var.', 'warn');
      },
    });
  }

  // ---------------------------------------------------------------- konusma

  handleUserSpeech(text: string): void {
    const clean = text.trim();
    if (clean.length < 2) return;

    const state = store.getState();
    this.lastInteractionAt = Date.now();

    // Wake word: konusma modu kapaliyken "abi" ile uyaniyor.
    if (state.settings.wakeWordEnabled && !state.settings.conversationMode && !this.awake) {
      const normalized = clean.toLocaleLowerCase('tr');
      if (!normalized.startsWith('abi')) return;
      this.awake = true;
      this.wakeEffect();
      const rest = clean.slice(3).replace(/^[\s,.:!?]+/, '');
      if (!rest) return;
      this.send(rest);
      return;
    }

    void this.sendWithVision(clean);
  }

  /**
   * "Abi şuna bak" gibi bir ifade gecerse konusmadan once tek kare alinir.
   * Kamera/ekran kapaliysa once acilir; kullanici reddederse karakter
   * yine de cevap verir, sadece goremedigini soyler.
   */
  private async sendWithVision(message: string): Promise<void> {
    const intent = detectVisionIntent(message);
    if (!intent) {
      this.send(message);
      return;
    }

    const settings = store.getState().settings;
    if (intent === 'camera' && !settings.cameraEnabled) {
      store.patchSettings({ cameraEnabled: true });
    }

    const ready = captureEngine.isActive(intent) || (await captureEngine.start(intent));
    if (!ready) {
      store.toast(intent === 'camera' ? 'Kameraya erişemedim.' : 'Ekranı göremiyorum.', 'warn');
      this.send(message);
      return;
    }

    store.set(intent === 'camera' ? { cameraOn: true } : { screenOn: true });
    // Ilk kare bazen bos gelir; bir sonraki cizim karesini bekle.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const frame = captureEngine.grab(intent);

    this.send(message, null, frame ? [frame] : []);
    store.patchDebug({ vision: intent });
  }

  /** Yazili giris (ses tanima yoksa veya kullanici tercih ederse). */
  sendTyped(text: string): void {
    const clean = text.trim();
    if (!clean) return;
    this.lastInteractionAt = Date.now();
    voiceEngine.unlock();
    void this.sendWithVision(clean);
  }

  /** Kamera / ekran paylasimini kullanici acikca actiginda. */
  async toggleVision(source: VisionSource): Promise<void> {
    if (captureEngine.isActive(source)) {
      captureEngine.stop(source);
      store.set(source === 'camera' ? { cameraOn: false } : { screenOn: false });
      return;
    }
    const ok = await captureEngine.start(source);
    store.set(source === 'camera' ? { cameraOn: ok } : { screenOn: ok });
    if (!ok) {
      store.toast(
        source === 'camera' ? 'Kameraya erişemedim.' : 'Ekran paylaşımı açılmadı.',
        'warn',
      );
    }
  }

  /** Gorev isaretleri: baslat / adim ilerlet / bitir. */
  private applyMission(signal: { kind: string; title?: string; total?: number }): void {
    const current = store.getState().mission;

    if (signal.kind === 'start') {
      const mission: Mission = {
        title: String(signal.title ?? 'Görev'),
        step: 0,
        total: Math.max(1, Number(signal.total ?? 1)),
        done: false,
      };
      store.set({ mission, emotion: 'MISSION' });
      return;
    }
    if (!current) return;

    if (signal.kind === 'step') {
      store.set({ mission: { ...current, step: Math.min(current.total, current.step + 1) } });
      return;
    }
    if (signal.kind === 'done') {
      store.set({ mission: { ...current, step: current.total, done: true } });
      // Kisa mikro animasyon sonrasi etiket soner. Konfeti yok.
      window.setTimeout(() => {
        if (store.getState().mission?.done) store.set({ mission: null });
      }, 2600);
    }
  }

  private send(
    message: string,
    trigger: string | null = null,
    frames: { source: VisionSource; mime: string; data: string }[] = [],
  ): void {
    const state = store.getState();
    if (!state.connected) {
      store.toast('Bağlantı yok.', 'warn');
      return;
    }

    // Onceki tur devam ediyorsa temizle: son soylenen kazanir.
    this.abortChat?.();
    voiceEngine.stop();
    window.clearTimeout(this.fillerTimer);

    if (!trigger) store.pushHistory('user', message);
    this.turnHistory.push({ role: 'user', text: message });
    this.turnHistory = this.turnHistory.slice(-12);

    this.pendingReply = '';
    this.spokeThisTurn = false;
    this.streaming = true;
    this.requestSentAt = performance.now();
    this.setUi('PROCESSING');
    store.set({ subtitle: '' });

    // Uzayan dusunmede karakter sessiz kalmasin.
    this.fillerTimer = window.setTimeout(() => {
      if (this.streaming && !this.spokeThisTurn) {
        voiceEngine.enqueue(pick(FILLERS), store.getState().emotion);
      }
    }, 3000);

    this.abortChat = streamChat(
      {
        message,
        history: this.turnHistory.slice(0, -1),
        intensity: state.settings.personaIntensity,
        userName: state.settings.memoryEnabled ? state.settings.userName : null,
        trigger,
        frames,
      },
      {
        onStart: (info) => store.patchDebug({ provider: info.provider }),
        onLatency: (ms) => store.patchDebug({ firstToken: ms }),
        onEmotion: (emotion) => store.set({ emotion }),
        onMission: (signal) => this.applyMission(signal),
        onPhrase: (text) => {
          this.pendingReply = this.pendingReply ? `${this.pendingReply} ${text}` : text;
          voiceEngine.enqueue(text, store.getState().emotion);
        },
        onDone: () => {
          this.streaming = false;
          if (this.pendingReply) {
            store.pushHistory('abi', this.pendingReply);
            this.turnHistory.push({ role: 'abi', text: this.pendingReply });
          }
          if (!voiceEngine.speaking) this.finishTurn();
        },
        onError: (message) => {
          this.streaming = false;
          window.clearTimeout(this.fillerTimer);
          store.toast(message, 'warn');
          this.setUi('IDLE');
        },
      },
    );
  }

  /** Barge-in: 100 ms icinde sus, dinlemeye gec. */
  interrupt(): void {
    this.abortChat?.();
    this.abortChat = null;
    this.streaming = false;
    voiceEngine.stop();
    speechInput.reset();
    window.clearTimeout(this.fillerTimer);
    if (this.pendingReply) {
      store.pushHistory('abi', this.pendingReply);
      this.turnHistory.push({ role: 'abi', text: this.pendingReply });
      this.pendingReply = '';
    }
    store.set({ subtitle: '' });
    this.setUi('INTERRUPTED');
    window.setTimeout(() => {
      if (store.getState().ui === 'INTERRUPTED') this.setUi('LISTENING');
    }, 120);
  }

  private finishTurn(): void {
    if (this.streaming) return;
    this.setUi('IDLE');
    this.lastInteractionAt = Date.now();
    // Altyazi cumle bittikten 2.6 sn sonra soner.
    window.clearTimeout(this.subtitleTimer);
    this.subtitleTimer = window.setTimeout(() => {
      if (!voiceEngine.speaking) store.set({ subtitle: '' });
    }, 2600);
  }

  // ---------------------------------------------------------------- proaktif

  private checkIdle(): void {
    const state = store.getState();
    if (state.ui !== 'IDLE' || !state.connected || this.streaming) return;

    const window_ = PROACTIVE_WINDOW[state.settings.proactiveLevel];
    if (!window_) return;

    const silence = Date.now() - this.lastInteractionAt;
    const sinceLast = Date.now() - this.lastProactiveAt;
    const [min, max] = window_;
    // Cooldown: karakter surekli konusursa rahatsiz ediyor.
    if (silence < min || sinceLast < max) return;

    this.lastProactiveAt = Date.now();
    this.send(
      'Kullanıcı bir süredir sessiz. Kısa, karakterinde bir laf at. Soru sormak zorunda değilsin.',
      'silence',
    );
  }

  /** Uygulama ve oyun tarafindan tetiklenebilen olaylar. */
  event(description: string): void {
    const state = store.getState();
    if (state.settings.proactiveLevel === 'quiet') return;
    if (Date.now() - this.lastProactiveAt < 20_000) return;
    this.lastProactiveAt = Date.now();
    this.send(description, 'event');
  }

  private maybeGreet(): void {
    if (this.greeted) return;
    this.greeted = true;
    // Her acilista konusmaz; her seferinde ayni selam karakteri sahteleştiriyor.
    if (Math.random() < 0.35) return;
    window.setTimeout(() => {
      if (store.getState().ui !== 'IDLE') return;
      store.set({ emotion: 'IDLE' });
      voiceEngine.enqueue(pick(OPENERS), 'IDLE');
    }, 700);
  }

  private wakeEffect(): void {
    this.setUi('LISTENING');
    window.setTimeout(() => {
      this.awake = false;
    }, 12_000);
  }

  private setUi(ui: UiState): void {
    store.set({ ui });
  }

  setEmotion(emotion: Emotion): void {
    store.set({ emotion });
  }
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T;
}

export const runtime = new AbiRuntime();
