import { Router } from 'express';
import { config } from '../config.js';
import { buildSystemPrompt, type PersonaIntensity } from '../persona/personaPrompt.js';
import { activeLlmId, resolveLlm } from '../providers/llm/index.js';
import { LocalPersonaProvider } from '../providers/llm/localPersona.js';
import { memory } from '../providers/memory/fileMemory.js';
import type { ChatTurn, LlmProvider, VisionFrame } from '../providers/types.js';
import { log } from '../util/log.js';
import {
  PhraseSplitter,
  extractEmotion,
  extractMemories,
  extractMissions,
  speakable,
} from '../util/stream.js';

interface ChatBody {
  message?: string;
  history?: ChatTurn[];
  intensity?: PersonaIntensity;
  userName?: string | null;
  /** Proaktif tetikleyici (sessizlik, gurultu, oyun olayi...) */
  trigger?: string | null;
  /** Kamera veya ekran kareleri (base64). */
  frames?: VisionFrame[];
}

/** Zeka saglayicisi coktugunde karakterin susmamasi icin son care. */
const fallbackProvider = new LocalPersonaProvider();

export const chatRouter: Router = Router();

chatRouter.post('/chat', async (req, res) => {
  const body = req.body as ChatBody;
  const message = (body.message ?? '').trim();
  if (!message) {
    res.status(400).json({ error: 'message bos olamaz' });
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Istemci baglantiyi keserse (barge-in) uretimi hemen durdur.
  // Dinleme res uzerinde: req 'close' olayi govde okunur okunmaz tetikleniyor.
  const abort = new AbortController();
  res.on('close', () => abort.abort());

  // Karelerin boyutu sinirli: gecikme dogrudan istek govdesine bagli.
  const frames = (body.frames ?? []).slice(0, 2).filter((f) => f?.data && f.data.length < 3_000_000);

  const started = Date.now();
  let firstTokenAt = 0;
  let emitted = 0;
  let emotionSent = false;

  const emitPhrase = (phrase: string) => {
    const { clean: noMemory, facts } = extractMemories(phrase);
    for (const fact of facts) void memory.remember(fact);

    const { clean, signals } = extractMissions(noMemory);
    for (const signal of signals) send('mission', signal);

    const text = speakable(clean);
    if (!text) return;
    emitted += 1;
    send('phrase', { index: emitted, text });
  };

  /** Tek bir saglayiciyi calistirir; uretilen parca sayisini dondurur. */
  const run = async (provider: LlmProvider, system: string, history: ChatTurn[]) => {
    const splitter = new PhraseSplitter();
    let raw = '';

    for await (const token of provider.stream({
      system,
      history,
      message,
      frames: provider.vision ? frames : undefined,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
      signal: abort.signal,
    })) {
      if (abort.signal.aborted) return;
      if (!firstTokenAt) {
        firstTokenAt = Date.now();
        send('latency', { firstToken: firstTokenAt - started });
      }

      raw += token;

      // Duygu etiketi cevabin basinda; ilk parcadan once yakalanmali.
      if (!emotionSent) {
        const { emotion, rest } = extractEmotion(raw);
        if (emotion) {
          send('emotion', { emotion });
          emotionSent = true;
          raw = rest;
          for (const phrase of splitter.push(rest)) emitPhrase(phrase);
          continue;
        }
        // Etiket gelmeyecekse akisi daha fazla bekletme.
        if (raw.length > 16 && !raw.trimStart().startsWith('[')) {
          emotionSent = true;
          send('emotion', { emotion: 'IDLE' });
          for (const phrase of splitter.push(raw)) emitPhrase(phrase);
        }
        continue;
      }

      for (const phrase of splitter.push(token)) emitPhrase(phrase);
    }

    if (abort.signal.aborted) return;

    if (!emotionSent) {
      const { emotion, rest } = extractEmotion(raw);
      emotionSent = true;
      send('emotion', { emotion: emotion ?? 'IDLE' });
      for (const phrase of splitter.push(rest)) emitPhrase(phrase);
    }
    const tail = splitter.flush();
    if (tail) emitPhrase(tail);
  };

  try {
    const provider = await resolveLlm();
    const system = await buildSystemPrompt({
      intensity: body.intensity ?? 'normal',
      userName: body.userName ?? null,
    });
    const history = (body.history ?? []).slice(-12).filter((t) => t.text?.trim());

    send('start', {
      provider: activeLlmId(),
      character: config.characterName,
      vision: Boolean(provider.vision),
    });

    try {
      await run(provider, system, history);
    } catch (err) {
      const error = err as Error;
      if (error.name === 'AbortError' || abort.signal.aborted) throw error;
      // Tek kelime bile cikmadiysa karakter sessiz kalmasin: yerel motora dus.
      if (emitted > 0 || provider.id === fallbackProvider.id) throw error;
      log.warn(`${provider.id} coktu, yerel karakter motoruna dusuluyor: ${error.message}`);
      await run(fallbackProvider, system, history);
    }

    if (!abort.signal.aborted) {
      send('done', { totalMs: Date.now() - started, phrases: emitted });
    }
  } catch (err) {
    const error = err as Error;
    if (error.name !== 'AbortError' && !abort.signal.aborted) {
      log.error('chat akisi basarisiz', error);
      send('error', { message: 'Ses hattinda bir sorun var.' });
    }
  } finally {
    res.end();
  }
});
