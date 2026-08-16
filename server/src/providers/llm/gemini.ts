import { config } from '../../config.js';
import type { LlmProvider, LlmRequest } from '../types.js';
import { log } from '../../util/log.js';

interface GeminiPart {
  text?: string;
}
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}
interface GeminiStreamChunk {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
}

/** Denenecek model sirasi: env tercihi once, sonra bilinen fallback zinciri. */
function modelChain(): string[] {
  const chain = [config.gemini.model, ...config.gemini.fallbackModels];
  return [...new Set(chain.filter(Boolean))];
}

function toContents(req: LlmRequest) {
  const contents = req.history.map((turn) => ({
    role: turn.role === 'user' ? 'user' : 'model',
    parts: [{ text: turn.text }],
  }));
  contents.push({ role: 'user', parts: [{ text: req.message }] });
  return contents;
}

/**
 * Gemini streamGenerateContent (SSE). Karakter gecikmesi kritik oldugu icin
 * token'lar geldigi anda yukari akitilir.
 */
export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini';
  readonly label = 'Google Gemini';

  /** Calistigi dogrulanan model; sonraki isteklerde dogrudan kullanilir. */
  private resolvedModel: string | null = null;

  async available(): Promise<boolean> {
    return Boolean(config.gemini.apiKey);
  }

  async *stream(req: LlmRequest): AsyncIterable<string> {
    if (!config.gemini.apiKey) throw new Error('GEMINI_API_KEY tanimli degil');

    const models = this.resolvedModel ? [this.resolvedModel] : modelChain();
    let lastError: Error | null = null;

    for (const model of models) {
      try {
        let produced = false;
        for await (const piece of this.streamModel(model, req)) {
          produced = true;
          yield piece;
        }
        this.resolvedModel = model;
        if (!produced) log.warn(`gemini: ${model} bos cevap dondurdu`);
        return;
      } catch (err) {
        const error = err as Error & { status?: number };
        // Akis basladiktan sonraki hatada model degistirmek cevabi bozar.
        if ((error as { streamed?: boolean }).streamed) throw error;
        if (error.name === 'AbortError') throw error;
        lastError = error;
        // Gecersiz anahtar gibi kalici hatalarda model degistirmek anlamsiz;
        // sadece "model yok / kota" durumlarinda zincire devam et.
        const modelIssue = /model|not found|unsupported/i.test(error.message);
        const retryable =
          error.status === 404 || error.status === 429 || (error.status === 400 && modelIssue);
        log.warn(`gemini: ${model} basarisiz (${error.status ?? '-'}) ${error.message}`);
        if (!retryable) break;
      }
    }
    throw lastError ?? new Error('gemini: model bulunamadi');
  }

  private async *streamModel(model: string, req: LlmRequest): AsyncIterable<string> {
    const url =
      `${config.gemini.baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': config.gemini.apiKey,
      },
      signal: req.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: toContents(req),
        generationConfig: {
          temperature: req.temperature,
          maxOutputTokens: req.maxTokens,
          topP: 0.95,
          // Karakter kisa konusuyor; dusunme butcesi gecikmeyi katlar.
          thinkingConfig: { thinkingBudget: 0 },
        },
        safetySettings: [
          'HARM_CATEGORY_HARASSMENT',
          'HARM_CATEGORY_HATE_SPEECH',
          'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          'HARM_CATEGORY_DANGEROUS_CONTENT',
        ].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      const err = Object.assign(new Error(detail.slice(0, 300) || res.statusText), {
        status: res.status,
      });
      // thinkingConfig eski modellerde reddedilir; bir kez daha sade govde ile dene.
      if (res.status === 400 && detail.toLowerCase().includes('thinking')) {
        yield* this.streamModelPlain(model, req);
        return;
      }
      throw err;
    }

    yield* readSse(res.body, model);
  }

  /** thinkingConfig desteklemeyen modeller icin sade govde. */
  private async *streamModelPlain(model: string, req: LlmRequest): AsyncIterable<string> {
    const url =
      `${config.gemini.baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
      signal: req.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: toContents(req),
        generationConfig: {
          temperature: req.temperature,
          maxOutputTokens: req.maxTokens,
          topP: 0.95,
        },
      }),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw Object.assign(new Error(detail.slice(0, 300) || res.statusText), { status: res.status });
    }
    yield* readSse(res.body, model);
  }
}

async function* readSse(body: ReadableStream<Uint8Array>, model: string): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let started = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        let parsed: GeminiStreamChunk;
        try {
          parsed = JSON.parse(payload) as GeminiStreamChunk;
        } catch {
          continue;
        }
        if (parsed.promptFeedback?.blockReason) {
          log.warn(`gemini: istek engellendi (${parsed.promptFeedback.blockReason})`);
        }
        const parts = parsed.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (!part.text) continue;
          started = true;
          yield part.text;
        }
      }
    }
  } catch (err) {
    const error = err as Error;
    if (started) Object.assign(error, { streamed: true });
    throw error;
  } finally {
    reader.releaseLock();
    void model;
  }
}
