import type { TtsProvider } from '../types.js';

/**
 * Ses tarafi bilinçli olarak tarayicida: Web Speech Synthesis ucretsiz,
 * kurulum istemiyor ve ilk sese kadar gecen sure sunucu TTS'ten dusuk.
 * Sunucu tarafi saglayici eklenecekse bu arayuz uzerinden takilir.
 */
export class ClientVoiceProvider implements TtsProvider {
  readonly id = 'client';
  readonly label = 'Tarayici sesi (Web Speech)';
  readonly clientSide = true;

  async available(): Promise<boolean> {
    return true;
  }
}

const active: TtsProvider = new ClientVoiceProvider();

export function resolveTts(): TtsProvider {
  return active;
}
