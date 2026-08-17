# ABİ — gerçek zamanlı konuşan dijital karakter

Bu bir sohbet uygulaması değil. Ekranda yaşayan, dinleyen, konuşan, araya girilince
susan ve hatırlayan bir karakter.

Ana ekranda mesaj balonu, sidebar, büyük input kutusu yok. Ekranın merkezinde
karakterin kendisi var; altında film altyazısı gibi tek satır, onun altında çok
küçük bir durum yazısı.

---

## Hızlı başlangıç

```bash
npm run setup              # Python sanal ortamı + bağımlılıklar + npm paketleri
cp .env.example .env       # GEMINI_API_KEY satırını doldur
npm run dev
```

Tek anahtar yeter: zekâ da ses de aynı Gemini anahtarıyla çalışır.

Tarayıcıdan `http://localhost:5273` adresini aç, mikrofon izni ver ve konuş.

> **Anahtarsız da açılır.** ABİ o durumda yerel karakter motoruyla kısa replikler
> verir ve tarayıcı sesini kullanır. Hiçbir durumda susmaz — sadece daha az iyi olur.

**Gemini anahtarı:** <https://aistudio.google.com/apikey> (ücretsiz kotası var)

Gereksinimler: Node 20+, Python 3.10+.

---

## Neyi neyle yapıyor

| Katman | Seçim | Neden |
| --- | --- | --- |
| Zekâ | **Google Gemini** (`streamGenerateContent`, SSE) | Akışkan cevap, düşük ilk-token gecikmesi |
| Sunucu | Python · FastAPI | Yerel ses ve tanıma motorları Python ekosisteminde |
| Seslendirme | **Gemini TTS** (kalın erkek ses) → Piper → tarayıcı | Aynı anahtar, kurulum yok, duygu tona geçiyor |
| Ses tanıma | **faster-whisper** (yerel Türkçe) → tarayıcı tanıması | Çevrimdışı, Chrome'a bağlı değil, gürültüye dayanıklı |
| Karakter | Prosedürel canvas emblemi | Asset yok, her çözünürlükte net, sesle doğrudan sürülüyor |
| Görme | Gemini çoklu ortam (tek kare JPEG) | Sürekli video yerine "bakınca" kare: hem gecikme hem gizlilik |
| Hafıza | Dosya tabanlı JSON | Bağımlılıksız, taşınabilir |
| Masaüstü | Electron kabuğu | Overlay, mini mod, her zaman üstte |

Her katman aşağı düşebilir ve karakter yine çalışır: Gemini düşerse sunucu aynı
istek içinde yerel motora, Piper yoksa tarayıcı sesine, Whisper yoksa tarayıcı
tanımasına düşer. Karakter hiçbir durumda susmaz.

### Yedek sağlayıcılar

Gemini yoksa sırasıyla denenir: **Ollama** (local, otomatik bulunur) →
**OpenAI uyumlu endpoint** → yerel karakter motoru. `LLM_PROVIDER` ile sabitlenebilir.

---

## Ses

Ses de Gemini'den geliyor — zekâyla aynı anahtar, ek kurulum yok. Varsayılan
**Charon**: kalın ve tok bir yetişkin erkek sesi.

### Kalınlık iki yerden geliyor

**1. Stil yönergesi.** Her seslendirme isteğine metnin önüne bir söyleyiş talimatı
ekleniyor, kullanıcıya okunmuyor:

```
Kalın, derin ve tok bir yetişkin erkek sesiyle, doğal konuşma temposunda
sıkılmış ve sert söyle: Gel bakalım. Ne oldu?
```

İkinci yarısı karakterin o anki duygusundan geliyor. `[ANNOYED]` → "sıkılmış ve
sert", `[SUSPICIOUS]` → "şüpheli, alçak sesle", `[SERIOUS]` → "ciddi ve ağır".
Yani duygu etiketi yalnızca yüzü değil, sesin tonunu da sürüyor.

**2. Alçak raf filtresi.** Çıkışta 220 Hz altını yükselten bir `BiquadFilter`
var. Ayarlardaki **Kalınlık** kaydırıcısı (0–12 dB, varsayılan 5) bunu sürüyor.

Diğer sesler: `Algenib` (çakıllı), `Gacrux` (olgun), `Alnilam`, `Orus`.
`ABI_VOICE` ile veya ayarlar panelinden değişir.

### Lip sync

Gemini fonem zamanlaması vermiyor, ama sesin **gerçek süresi** biliniyor:
metinden üretilen viseme dizisi o süreye yayılıyor ve anlık genlikle
kapatılıyor — duraklamalarda ağız konuşmaya devam etmiyor. Genlik tahmin değil,
çalan sesin dalga formundan `AnalyserNode` ile okunuyor.

Ölçülen: konuşma sırasında ağız 10 farklı değer alıyor, araya girildiğinde
genlik tek karede sıfırlanıyor.

Aynı cümle iki kez seslendirilmiyor: açılış replikleri ve "bir saniye" gibi
dolgular sunucuda önbelleğe alınıyor.

### Çevrimdışı yedek (isteğe bağlı)

Anahtarsız veya internetsiz çalışması gerekiyorsa Piper indirilebilir. Bu
durumda fonem zamanlaması da geliyor, lip sync daha da kesin oluyor:

```bash
npm run setup:offline                   # piper-tts + faster-whisper
npm run voices                          # Piper Türkçe ses + whisper small
python scripts/fetch_models.py --voice  # sadece ses (~60 MB)
```

Sıra: **Gemini → Piper → tarayıcı sesi.** Ayarlardan elle de seçilebilir.

---

## Ses akışı

```
Mikrofon → VAD (anında görsel tepki) → STT (Whisper veya tarayıcı)
                                        ↓
                          Gemini akışı (SSE, token token)
                                        ↓
                    ilk anlamlı ifade çıkar çıkmaz → TTS (Gemini)
                                        ↓
                 gerçek ses süresi + genlik → halka + ağız + altyazı
```

Parçalar boru hattı gibi işler: bir cümle çalarken sonraki sunucudan çekilir,
aralarda sessizlik kalmaz.

Cevabın tamamı beklenmez. Sunucu gelen token'ları konuşulabilir parçalara böler
(`PhraseSplitter`) ve ilk parçayı bilerek kısa tutar — konuşmanın başlaması
belirgin biçimde öne çekiliyor.

**Araya girme (barge-in):** ABİ konuşurken kullanıcı konuşmaya başlarsa TTS susar,
akış sunucu tarafında da iptal edilir ve karakter dinlemeye döner. Ölçülen geçiş
süresi ~5 ms. Bu davranış STT'ye değil doğrudan mikrofon VAD'ine bağlı; tanıma
motorunun gecikmesini beklemez.

---

## Görme

ABİ'ye "şuna bak" ya da "ekrana bak" dediğinde konuşmadan önce **tek kare** alınır
ve soruyla birlikte gönderilir. Sürekli video akmaz: gecikme de gizlilik yüzeyi de
gereksiz büyümesin.

- Kamera veya ekran kapalıysa o an açılır, izin reddedilirse karakter yine cevap verir.
- Kare uzun kenarı 768 px'e indirilip JPEG'e çevrilir.
- Bakarken avatarın yanında minik bir göz/ekran işareti belirir — büyük
  "ANALYZING CAMERA" yazısı yok.
- Mikrofon, kamera ve ekran açıkken sol altta küçük göstergeler durur ve gizlenmez.
- Kamera önizlemesi varsayılan **kapalı**; ana ekranda video karesi karakter hissini bozuyor.

Üst bardaki kamera ve ekran düğmeleriyle elle de açılabilir.

## Görevler

Çok adımlı bir işe girişildiğinde ABİ görev açabilir. Cevabına kullanıcıya
gösterilmeyen işaretler koyar; sunucu bunları metinden temizleyip ayrı olay olarak
yollar:

| İşaret | Etki |
| --- | --- |
| `<<gorev: TV bağlantısını düzelt \| 3>>` | Görevi başlatır (başlık, toplam adım) |
| `<<gorev-adim>>` | Bir adım ilerletir |
| `<<gorev-bitti>>` | Tamamlar |

Ekranda üst ortada küçük bir etiket ve ince bir ilerleme çizgisi görünür. Bitince
kısa bir ışık geçişiyle söner. Konfeti yok, task manager görünümü yok.

---

## Masaüstü (Electron)

```bash
npm run desktop        # derle ve başlat
npm run desktop:dev    # vite dev sunucusuna bağlanarak başlat
```

Üç pencere modu var; ayarlardan veya kısayolla değişir:

| Mod | Ne |
| --- | --- |
| **Pencere** | Normal uygulama penceresi |
| **Overlay** | Saydam, her zaman üstte, köşede; tıklamalar altındaki pencereye geçirilebilir |
| **Mini** | 260×300 px yüzen emblem — sadece karakter ve küçük altyazı |

- **Ctrl+Shift+A** göster/gizle (uygulama odakta olmasa da çalışır)
- **O** pencere ↔ overlay
- Overlay ve mini modda arka plan saydam: karakter masaüstünün üzerinde durur
- Mikrofon, kamera ve ekran paylaşımı izinleri kabuk tarafından verilir
- Uygulama kapanınca sunucu da kapanır

Üretimde arayüz `file://` yerine kendi sunucumuzdan yüklenir; `file://` altında
varlık yolları ve `localStorage` çalışmıyor.

---

## Karakter

Sistem promptu ayrı dosyada: [`prompts/abi-system.md`](prompts/abi-system.md).
Çalışırken okunur, sunucuyu yeniden başlatmadan düzenlenebilir.

ABİ cevabının başına duygu etiketi koyar (`[AMUSED]`, `[SERIOUS]`, `[ALERT]`…).
Etiket kullanıcıya gösterilmez; sesin hızını/tonunu, ışığın yoğunluğunu ve
hareketin genliğini sürer.

Kalıcı olarak hatırlanması gereken bir şey öğrenirse cevabının sonuna
`<<hatirla: ...>>` işareti bırakır. İşaret metinden temizlenir, bilgi
`data/memory.json` dosyasına yazılır ve sonraki oturumlarda prompta girer.

---

## Arayüz

- Ana ekran bir **sahne**: üst %10 minimum kontrol, orta %65 karakter, alt %25 altyazı/durum.
- Tüm durum görünümleri tek tabloda: [`web/src/state/stateConfig.ts`](web/src/state/stateConfig.ts).
  Bileşenler bu tablodan okur — dağıtık `if/else` yok.
- Renk, boşluk, süre, easing, z-index tek kaynakta:
  [`web/src/design/tokens.ts`](web/src/design/tokens.ts) → CSS değişkenleri.

### Durumlar

`BOOT · CONNECTING · IDLE · LISTENING · PROCESSING · SPEAKING · INTERRUPTED · ERROR · OFFLINE`

Her durum; halka enerjisini, yörünge hızını, durum yazısını, dalga formunun ve
altyazının görünürlüğünü, kontrollerin opaklığını ve geçiş süresini belirler.

### Kısayollar

| Tuş | İş |
| --- | --- |
| `M` | Mikrofon aç/kapat |
| `F` | Tam ekran |
| `C` | Sinematik mod (tüm kontroller gizlenir) |
| `D` | Geliştirici katmanı (FPS, gecikmeler, VAD, durum) |
| `O` | Pencere ↔ overlay (masaüstü) |
| `Ctrl+Shift+A` | Göster/gizle (masaüstü, global) |
| `/` | Kompakt yazı girişi |
| `Esc` | Panelleri kapat |

---

## Yapı

```
prompts/abi-system.md      karakter tanımı
scripts/serve.py           sunucuyu başlatır (sanal ortamı kendi bulur)
scripts/fetch_models.py    Türkçe ses ve tanıma modellerini indirir
server_py/abi/             FastAPI + SSE
  providers/llm/           gemini · ollama · openai · yerel yedek
  providers/tts/           gemini (kalın erkek ses) · piper (çevrimdışı yedek)
  providers/stt/           faster-whisper (yerel Türkçe tanıma)
  providers/memory/        dosya tabanlı hafıza
  util/stream.py           duygu etiketi, hafıza/görev işaretleri, ifade bölücü
web/
  src/avatar/              emblem çizimi + hareket rig'i
  src/audio/               mikrofon/VAD · tanıma · seslendirme · viseme · fonem
  src/vision/              kamera / ekran yakalama + "bak" niyeti
  src/state/               durum tablosu · ayarlar · store
  src/components/          sahne ve paneller
  src/lib/runtime.ts       mikrofon → STT → akış → TTS orkestrasyonu
  src/lib/desktop.ts       Electron köprüsü (yoksa arayüz değişmez)
desktop/                   Electron kabuğu: overlay · mini · kısayollar
```

Sağlayıcılar arayüz arkasında (LLM · TTS · STT · hafıza); yenisi eklemek için
mevcut kodun değişmesi gerekmiyor.

---

## Ayarlar

`.env` (tamamı isteğe bağlı, `.env.example` içinde açıklamalı):

| Değişken | Varsayılan | Not |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Zekâ için |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Bulunamazsa bilinen sürümlere düşer |
| `LLM_PROVIDER` | `auto` | `gemini` · `ollama` · `openai` · `local` |
| `LLM_MAX_TOKENS` | `220` | Karakter kısa konuşur |
| `TTS_PROVIDER` | `auto` | `gemini` · `piper` · `client` |
| `ABI_VOICE` | `Charon` | Kalın erkek sesler: `Algenib` · `Gacrux` · `Alnilam` · `Orus` |
| `PIPER_VOICE` | `tr_TR-fahrettin-medium` | Çevrimdışı yedek |
| `STT_PROVIDER` | `auto` | `whisper` · `client` |
| `WHISPER_MODEL` | `small` | `tiny` · `base` · `small` · `medium` |
| `ABI_NAME` | `ABİ` | Karakter adı |
| `PORT` | `8787` | Sunucu portu |

Arayüz tarafındaki ayarlar (ses, mikrofon, kamera, karakter yoğunluğu, hafıza,
görünüm, gelişmiş) sağdan açılan panelde ve tarayıcıda saklanır.

---

## Komutlar

```bash
npm run setup         # Python sanal ortamı + bağımlılıklar (hafif: 5 paket)
npm run setup:offline # isteğe bağlı: çevrimdışı ses/tanıma paketleri
npm run voices        # isteğe bağlı: çevrimdışı modelleri indir
npm run dev         # sunucu + arayüz
npm run build       # arayüzü derle
npm run typecheck   # tip kontrolü
npm start           # sunucu (derlenmiş arayüzü de servis eder)
npm run desktop     # Electron kabuğu
```

`scripts/serve.py` sanal ortamı kendi bulup içine geçer; `.venv` etkinleştirmeye
gerek yok.

---

## Bilinen sınırlar

- Gemini TTS her cümle için bir API çağrısı yapar; tekrar eden cümleler
  önbellekten gelir. Kotasız/çevrimdışı kullanım için Piper indirilebilir.
- Yerel motorlar tamamen isteğe bağlıdır ve varsayılan kurulumda **yok**:
  `npm run setup:offline` + `npm run voices`. Kurulmazsa ses Gemini'den,
  tanıma tarayıcıdan gelir.
- Tarayıcı tanıması yalnızca Chrome/Edge'de var. Whisper kuruluysa bu sınır kalkar.
  Hiçbiri yoksa `/` ile yazı girişi açılır, karakter yine sesli cevap verir.
- Whisper CPU'da çalışır; `small` modeli tipik bir dizüstünde ~1 sn gecikme ekler.
  Daha hızlı istenirse `base` veya `tiny`.
- Görme yalnızca Gemini ile çalışır; yerel yedek motor kareleri yok sayar.
- Overlay modda saydamlık ve tıklama geçirgenliği pencere yöneticisine bağlıdır;
  Windows ve macOS'ta sorunsuz, bazı Linux masaüstlerinde bileşik yöneticisi gerekir.
