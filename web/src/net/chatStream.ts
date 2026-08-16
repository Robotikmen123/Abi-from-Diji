import type { Emotion } from '../state/stateConfig';

export interface ChatTurn {
  role: 'user' | 'abi';
  text: string;
}

export interface ChatStreamHandlers {
  onStart?: (info: { provider: string; character: string }) => void;
  onLatency?: (firstTokenMs: number) => void;
  onEmotion?: (emotion: Emotion) => void;
  onPhrase?: (text: string, index: number) => void;
  onDone?: (info: { totalMs: number; phrases: number }) => void;
  onError?: (message: string) => void;
}

export interface ChatRequest {
  message: string;
  history: ChatTurn[];
  intensity: 'calm' | 'normal' | 'abi';
  userName?: string | null;
  trigger?: string | null;
}

/**
 * POST + SSE. EventSource POST desteklemedigi icin akis elle ayristirilir.
 * Donen abort fonksiyonu barge-in aninda uretimi sunucuda da durdurur.
 */
export function streamChat(request: ChatRequest, handlers: ChatStreamHandlers): () => void {
  const controller = new AbortController();

  void (async () => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        handlers.onError?.('Bağlantı kurulamadı.');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let split: number;
        while ((split = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          dispatch(block, handlers);
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      handlers.onError?.('Bağlantı koptu.');
    }
  })();

  return () => controller.abort();
}

function dispatch(block: string, handlers: ChatStreamHandlers): void {
  let event = 'message';
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return;
  }

  switch (event) {
    case 'start':
      handlers.onStart?.({
        provider: String(parsed.provider ?? ''),
        character: String(parsed.character ?? ''),
      });
      break;
    case 'latency':
      handlers.onLatency?.(Number(parsed.firstToken ?? 0));
      break;
    case 'emotion':
      handlers.onEmotion?.(String(parsed.emotion ?? 'IDLE') as Emotion);
      break;
    case 'phrase':
      handlers.onPhrase?.(String(parsed.text ?? ''), Number(parsed.index ?? 0));
      break;
    case 'done':
      handlers.onDone?.({
        totalMs: Number(parsed.totalMs ?? 0),
        phrases: Number(parsed.phrases ?? 0),
      });
      break;
    case 'error':
      handlers.onError?.(String(parsed.message ?? 'Bir sorun çıktı.'));
      break;
    default:
      break;
  }
}

export async function fetchHealth(): Promise<{ ok: boolean; llm?: { id: string; label: string } }> {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { ok: false };
    return (await res.json()) as { ok: boolean; llm?: { id: string; label: string } };
  } catch {
    return { ok: false };
  }
}
