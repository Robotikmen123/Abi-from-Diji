import type { LlmProvider, LlmRequest } from '../types.js';

/**
 * Anahtarsiz calisan son care. Gercek zeka degil; karakterin ekranda yasadigini
 * dogrulamak icin kisa, karakterde replikler uretir. Gemini anahtari girilince
 * otomatik devre disi kalir.
 */
export class LocalPersonaProvider implements LlmProvider {
  readonly id = 'local';
  readonly label = 'Yerel karakter motoru (anahtarsiz)';

  private lastIndex = new Map<string, number>();

  async available(): Promise<boolean> {
    return true;
  }

  async *stream(req: LlmRequest): AsyncIterable<string> {
    const reply = this.compose(req.message);
    // Gercek streaming hissi: kelime kelime, insan temposunda.
    for (const word of reply.split(/(\s+)/)) {
      if (req.signal?.aborted) return;
      yield word;
      if (word.trim()) await sleep(18 + Math.random() * 26);
    }
  }

  private compose(message: string): string {
    const text = message.toLocaleLowerCase('tr');

    for (const rule of RULES) {
      if (rule.match.some((k) => text.includes(k))) {
        return this.pick(rule.key, rule.replies);
      }
    }
    if (text.trim().endsWith('?')) return this.pick('soru', QUESTION_REPLIES);
    return this.pick('genel', GENERIC_REPLIES);
  }

  private pick(key: string, list: string[]): string {
    if (list.length === 0) return '[IDLE] Hmm.';
    const prev = this.lastIndex.get(key) ?? -1;
    let index = Math.floor(Math.random() * list.length);
    if (list.length > 1 && index === prev) index = (index + 1) % list.length;
    this.lastIndex.set(key, index);
    return list[index] as string;
  }
}

const RULES: { key: string; match: string[]; replies: string[] }[] = [
  {
    key: 'selam',
    match: ['merhaba', 'selam', 'günaydın', 'gunaydin', 'iyi akşamlar', 'naber', 'nasılsın'],
    replies: [
      '[IDLE] Buradayım. Ne var?',
      '[AMUSED] Hoş geldin. Anlat bakalım.',
      '[IDLE] Hmm? Söyle.',
    ],
  },
  {
    key: 'abi',
    match: ['abi', 'abicim', 'abiciğim'],
    replies: [
      '[IDLE] Efendim. Dinliyorum.',
      '[AMUSED] Gel bakalım. Ne oldu?',
      '[SERIOUS] Buradayım. Söyle.',
    ],
  },
  {
    key: 'yardim',
    match: ['yardım', 'yardim', 'yapabilir misin', 'hallet', 'çöz', 'coz'],
    replies: [
      '[SERIOUS] Tamam, çekil. Ben hallederim.',
      '[SUSPICIOUS] Bir dakika. Önce ne yapmaya çalışıyorsun?',
      '[SERIOUS] Göster. Bakayım şuna.',
    ],
  },
  {
    key: 'oyun',
    match: ['oyun', 'maç', 'mac', 'kaybettim', 'yendim', 'rakip'],
    replies: [
      '[ANNOYED] Aynı şeyi kaçıncı kez yapıyorsun? Taktik değiştiriyoruz.',
      '[EXCITED] Tamam, şimdi oldu. Devam et.',
      '[AMUSED] Ben sana söylemiştim.',
    ],
  },
  {
    key: 'itiraz',
    match: ['satın al', 'satin al', 'para gönder', 'kredi', 'yatırım', 'yatirim'],
    replies: [
      '[ALERT] Yok. Bence hiç bulaşma.',
      '[SUSPICIOUS] Dur bakalım. Sen ciddi misin?',
    ],
  },
  {
    key: 'tesekkur',
    match: ['teşekkür', 'tesekkur', 'sağ ol', 'sag ol', 'eyvallah'],
    replies: ['[AMUSED] Ne demek. Devam.', '[IDLE] Tamam tamam.'],
  },
  {
    key: 'kimsin',
    match: ['kimsin', 'nesin', 'yapay zeka mısın', 'bot musun'],
    replies: [
      '[SERIOUS] Abinim. Bu kadarı yeter.',
      '[AMUSED] Buradayım işte. Başka?',
    ],
  },
];

const QUESTION_REPLIES = [
  '[SUSPICIOUS] Bir saniye. Tam olarak neyi soruyorsun?',
  '[SERIOUS] Bak şimdi. Önce şunu netleştirelim.',
  '[IDLE] Hmm. Biraz daha aç bakalım.',
];

const GENERIC_REPLIES = [
  '[IDLE] Tamam, dinliyorum. Devam et.',
  '[SUSPICIOUS] Dur. Nereye varmaya çalışıyorsun?',
  '[AMUSED] Haydaa. Bunu bir daha söyle.',
  '[SERIOUS] Anladım. Göster bakalım.',
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
