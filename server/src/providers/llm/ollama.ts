import { config } from '../../config.js';
import type { LlmProvider, LlmRequest } from '../types.js';

/** Ucretsiz/local alternatif. Gemini yoksa otomatik devreye girer. */
export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama';
  readonly label = 'Ollama (local)';

  async available(): Promise<boolean> {
    try {
      const res = await fetch(`${config.ollama.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(700),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async *stream(req: LlmRequest): AsyncIterable<string> {
    const messages = [
      { role: 'system', content: req.system },
      ...req.history.map((t) => ({
        role: t.role === 'user' ? 'user' : 'assistant',
        content: t.text,
      })),
      { role: 'user', content: req.message },
    ];

    const res = await fetch(`${config.ollama.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: req.signal,
      body: JSON.stringify({
        model: config.ollama.model,
        messages,
        stream: true,
        options: { temperature: req.temperature, num_predict: req.maxTokens },
      }),
    });
    if (!res.ok || !res.body) throw new Error(`ollama: ${res.status} ${res.statusText}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as { message?: { content?: string } };
          const text = parsed.message?.content;
          if (text) yield text;
        } catch {
          /* yarim satir */
        }
      }
    }
  }
}
