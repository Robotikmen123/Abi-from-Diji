import { config } from '../../config.js';
import { log } from '../../util/log.js';
import type { LlmProvider } from '../types.js';
import { GeminiProvider } from './gemini.js';
import { LocalPersonaProvider } from './localPersona.js';
import { OllamaProvider } from './ollama.js';
import { OpenAiCompatibleProvider } from './openaiCompatible.js';

const registry: Record<string, LlmProvider> = {
  gemini: new GeminiProvider(),
  ollama: new OllamaProvider(),
  openai: new OpenAiCompatibleProvider(),
  local: new LocalPersonaProvider(),
};

let active: LlmProvider | null = null;

/** Oncelik: Gemini (zeka) -> local Ollama -> OpenAI uyumlu -> anahtarsiz karakter motoru. */
const AUTO_ORDER = ['gemini', 'ollama', 'openai', 'local'] as const;

export async function resolveLlm(force = false): Promise<LlmProvider> {
  if (active && !force) return active;

  if (config.llm.provider !== 'auto') {
    const chosen = registry[config.llm.provider];
    if (chosen && (await chosen.available())) {
      active = chosen;
      log.info(`LLM: ${chosen.label}`);
      return active;
    }
    log.warn(`LLM: ${config.llm.provider} kullanilamiyor, otomatik secime dusuldu`);
  }

  for (const id of AUTO_ORDER) {
    const provider = registry[id];
    if (provider && (await provider.available())) {
      active = provider;
      log.info(`LLM: ${provider.label}`);
      return active;
    }
  }

  active = registry.local as LlmProvider;
  return active;
}

export function activeLlmId(): string {
  return active?.id ?? 'unknown';
}

export function activeLlmLabel(): string {
  return active?.label ?? 'bilinmiyor';
}
