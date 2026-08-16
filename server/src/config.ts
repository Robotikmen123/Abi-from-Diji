import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8787),

  /** ABI'nin adi. Kod icinde tek yerden degistirilebilir. */
  characterName: env.ABI_NAME ?? 'ABİ',

  llm: {
    /** gemini | ollama | openai | local */
    provider: (env.LLM_PROVIDER ?? 'auto') as 'auto' | 'gemini' | 'ollama' | 'openai' | 'local',
    temperature: Number(env.LLM_TEMPERATURE ?? 0.9),
    maxTokens: Number(env.LLM_MAX_TOKENS ?? 220),
  },

  gemini: {
    apiKey: env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY ?? '',
    /** Ilk tercih; 404 gelirse asagidaki zincire duser. */
    model: env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    fallbackModels: [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-flash-latest',
      'gemini-1.5-flash',
    ],
    baseUrl: env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta',
  },

  ollama: {
    baseUrl: env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
    model: env.OLLAMA_MODEL ?? 'llama3.2:3b',
  },

  openai: {
    apiKey: env.OPENAI_API_KEY ?? '',
    baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model: env.OPENAI_MODEL ?? 'gpt-4o-mini',
  },

  memory: {
    file: env.MEMORY_FILE ?? path.join(ROOT, 'data', 'memory.json'),
    maxFacts: Number(env.MEMORY_MAX_FACTS ?? 120),
  },

  promptFile: env.ABI_PROMPT_FILE ?? path.join(ROOT, 'prompts', 'abi-system.md'),
} as const;

export type Config = typeof config;
