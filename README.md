# ABİ — gerçek zamanlı konuşan dijital karakter

Bu bir sohbet uygulaması değil. Ekranda yaşayan, dinleyen, konuşan, araya girilince
susan ve hatırlayan bir karakter.

Ana ekranda mesaj balonu, sidebar, büyük input kutusu yok. Ekranın merkezinde
karakterin kendisi var; altında film altyazısı gibi tek satır, onun altında çok
küçük bir durum yazısı.

---

## Hızlı başlangıç

```bash
npm install
cp .env.example .env       # GEMINI_API_KEY satırını doldur
npm run dev
```

Tarayıcıdan `http://localhost:5273` adresini aç, mikrofon izni ver ve konuş.

> Anahtar girmeden de açılır: ABİ o durumda yerel karakter motoruyla, kısa ve
> karakterde repliklerle cevap verir. Zekânın açılması için Gemini anahtarı gerekir.

**Gemini anahtarı:** <https://aistudio.google.com/apikey> (ücretsiz kotası var)

---

## Neyi neyle yapıyor

| Katman | Seçim | Neden |
| --- | --- | --- |
| Zekâ | **Google Gemini** (`streamGenerateContent`, SSE) | Akışkan cevap, düşük ilk-token gecikmesi |
| Ses tanıma | Web Speech Recognition (tarayıcı) | Ücretsiz, kurulumsuz, düşük gecikme |
| Seslendirme | Web Speech Synthesis (tarayıcı, Türkçe erkek ses) | Ücretsiz, ilk sese kadar geçen süre sunucu TTS'ten kısa |
| Karakter | Prosedürel canvas emblemi | Asset yok, her çözünürlükte net, sesle doğrudan sürülüyor |
| Görme | Gemini çoklu ortam (tek kare JPEG) | Sürekli video yerine "bakınca" kare: hem gecikme hem gizlilik |
| Hafıza | Dosya tabanlı JSON | Bağımlılıksız, taşınabilir |
| Masaüstü | Electron kabuğu | Overlay, mini mod, her zaman üstte |

Zekâ sağlayıcısı düşerse (anahtar hatası, kota, ağ) karakter susmaz: sunucu aynı
istek içinde yerel motora düşer ve cevabı oradan verir.

### Yedek sağlayıcılar

Gemini yoksa sırasıyla denenir: **Ollama** (local, otomatik bulunur) →
**OpenAI uyumlu endpoint** → yerel karakter motoru. `LLM_PROVIDER` ile sabitlenebilir.

---

## Ses akışı

```
Mikrofon → VAD (anında görsel tepki) → STT
                                        ↓
                          Gemini akışı (SSE, token token)
                                        ↓
                    ilk anlamlı ifade çıkar çıkmaz → TTS
                                        ↓
                       halka animasyonu + altyazı
```

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
server/                    Express + SSE
  providers/llm/           gemini · ollama · openai · yerel yedek
  providers/memory/        dosya tabanlı hafıza
  util/stream.ts           duygu etiketi, hafıza/görev işaretleri, ifade bölücü
web/
  src/avatar/              emblem çizimi + hareket rig'i
  src/audio/               mikrofon/VAD · ses tanıma · seslendirme · viseme
  src/vision/              kamera / ekran yakalama + "bak" niyeti
  src/state/               durum tablosu · ayarlar · store
  src/components/          sahne ve paneller
  src/lib/runtime.ts       mikrofon → STT → akış → TTS orkestrasyonu
  src/lib/desktop.ts       Electron köprüsü (yoksa arayüz değişmez)
desktop/                   Electron kabuğu: overlay · mini · kısayollar
```

Sağlayıcılar arayüz arkasında (`LlmProvider`, `MemoryProvider`, `TtsProvider`);
yenisi eklemek için mevcut kodun değişmesi gerekmiyor.

---

## Ayarlar

`.env` (tamamı isteğe bağlı, `.env.example` içinde açıklamalı):

| Değişken | Varsayılan | Not |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Zekâ için |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Bulunamazsa bilinen sürümlere düşer |
| `LLM_PROVIDER` | `auto` | `gemini` · `ollama` · `openai` · `local` |
| `LLM_MAX_TOKENS` | `220` | Karakter kısa konuşur |
| `ABI_NAME` | `ABİ` | Karakter adı |
| `PORT` | `8787` | Sunucu portu |

Arayüz tarafındaki ayarlar (ses, mikrofon, kamera, karakter yoğunluğu, hafıza,
görünüm, gelişmiş) sağdan açılan panelde ve tarayıcıda saklanır.

---

## Komutlar

```bash
npm run dev         # sunucu + arayüz
npm run build       # ikisini de derle
npm run typecheck   # tip kontrolü
npm start           # derlenmiş sunucu
```

---

## Bilinen sınırlar

- Ses tanıma Chrome/Edge'de çalışır. Desteklenmeyen tarayıcıda `/` ile yazı girişi
  devreye girer, karakter yine sesli cevap verir.
- Türkçe erkek ses işletim sistemine bağlı. Sistemde Türkçe ses yoksa ayarlardan
  seçilebilir; hiç ses yoksa karakter sessiz oynatır (altyazı ve animasyon çalışır).
- Görme yalnızca Gemini ile çalışır; yerel yedek motor kareleri yok sayar.
- Overlay modda saydamlık ve tıklama geçirgenliği pencere yöneticisine bağlıdır;
  Windows ve macOS'ta sorunsuz, bazı Linux masaüstlerinde bileşik yöneticisi gerekir.
