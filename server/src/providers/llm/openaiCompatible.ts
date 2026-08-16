import { config } from '../../config.js';
import type { LlmProvider, LlmRequest } from '../types.js';

/** OpenAI uyumlu herhangi bir endpoint (OpenAI, Groq, LM Studio, vLLM...). */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id = 'openai';
  readonly label = 'OpenAI uyumlu';

  async available(): Promise<boolean> {
    return Boolean(config.openai.apiKey);
  }

  async *stream(req: LlmRequest): AsyncIterable<string> {
    const res = await fetch(`${config.openai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.openai.apiKey}`,
      },
      signal: req.signal,
      body: JSON.stringify({
        model: config.openai.model,
        stream: true,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        messages: [
          { role: 'system', content: req.system },
          ...req.history.map((t) => ({
            role: t.role === 'user' ? 'user' : 'assistant',
            content: t.text,
          })),
          { role: 'user', content: req.message },
        ],
      }),
    });
    if (!res.ok || !res.body) throw new Error(`openai: ${res.status} ${res.statusText}`);

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
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const text = parsed.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch {
          /* yarim satir */
        }
      }
    }
  }
}
