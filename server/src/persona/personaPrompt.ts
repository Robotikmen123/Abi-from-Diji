import fs from 'node:fs/promises';
import { config } from '../config.js';
import { log } from '../util/log.js';
import { memory } from '../providers/memory/fileMemory.js';

export type PersonaIntensity = 'calm' | 'normal' | 'abi';

const INTENSITY_NOTES: Record<PersonaIntensity, string> = {
  calm: 'Bu oturumda tonun daha sakin. Sertligini azalt, alayi minimumda tut. Karakterin kaybolmasin.',
  normal: 'Bu oturumda normal tonundasin.',
  abi: 'Bu oturumda tam abi modundasin. Daha otoriter, daha lafini sakinmayan, daha alayci. Yine de kisa konus.',
};

let cached: { text: string; mtime: number } | null = null;

async function basePrompt(): Promise<string> {
  try {
    const stat = await fs.stat(config.promptFile);
    if (cached && cached.mtime === stat.mtimeMs) return cached.text;
    const text = await fs.readFile(config.promptFile, 'utf8');
    cached = { text, mtime: stat.mtimeMs };
    return text;
  } catch (err) {
    log.warn(`persona dosyasi okunamadi (${config.promptFile}), gomulu prompt kullaniliyor`);
    void err;
    return FALLBACK_PROMPT;
  }
}

export async function buildSystemPrompt(opts: {
  intensity: PersonaIntensity;
  userName?: string | null;
}): Promise<string> {
  const parts = [await basePrompt()];

  parts.push(`\n---\n\n## Oturum notlari\n\nAdın: ${config.characterName}.`);
  parts.push(INTENSITY_NOTES[opts.intensity] ?? INTENSITY_NOTES.normal);

  if (opts.userName) parts.push(`Karsindaki kisinin adi: ${opts.userName}.`);

  const facts = await memory.list();
  if (facts.length > 0) {
    const recent = facts
      .slice()
      .sort((a, b) => b.hits - a.hits || b.createdAt - a.createdAt)
      .slice(0, 24)
      .map((f) => `- ${f.text}`)
      .join('\n');
    parts.push(`\n### Hatirladiklarin\n${recent}\n\nBunlari dogal sekilde kullan, liste gibi okuma.`);
  }

  parts.push(
    '\nUnutma: cevabin sesli okunacak. En fazla uc kisa cumle. Basta duygu etiketi olsun.',
  );

  return parts.join('\n');
}

const FALLBACK_PROMPT = `Sen ABİ'sin. Bir chatbot gibi degil, kullanicinin yaninda bulunan bagimsiz bir
dijital karakter gibi davranirsin. Konusmalarin kisa, dogal ve sesli iletisime uygundur.
Kendine ait fikirlerin vardir. Kullaniciya surekli katilmazsin. Gerektiginde karsi cikarsin,
saka yaparsin, sasirirsin, kizarsin veya ciddilesirsin. Cevabinin basina [IDLE] gibi bir
duygu etiketi koyarsin. En fazla uc kisa cumle kurarsin.`;
