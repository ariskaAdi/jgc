# aibot-js

AI assistant untuk menjawab soal ujian (pilihan ganda & esai), ditulis ulang dari [aibot](https://github.com/ariskaAdi/ai-chatbot) (Go) ke **Express + TypeScript** agar cukup di-deploy ke **Vercel**, tanpa VPS, Docker, maupun nginx.

- `POST /ask`: soal teks, otomatis mendeteksi pilihan ganda atau esai
- `POST /ask-image`: soal dari screenshot (Gemini multimodal)
- `GET /health`: health check
- Gemini sebagai provider utama, Groq sebagai fallback opsional untuk soal teks
- Browser extension (Chrome & Firefox): sorot teks untuk bertanya, atau Ctrl+Shift+Y untuk screenshot

## Struktur

```
api/index.ts                 Entry point Vercel (export default app)
src/
  server.ts                  Server lokal untuk development
  container.ts               Composition root: membuat & menghubungkan semua objek
  config/Config.ts           Membaca & memvalidasi environment variable
  logger/Logger.ts           Log JSON satu baris
  ai/
    AIProvider.ts            Interface TextProvider & ImageProvider
    GeminiProvider.ts        Gemini via @google/genai (teks + gambar)
    GroqProvider.ts          Groq via endpoint OpenAI-compatible (teks)
    ProviderRouter.ts        Primary → fallback
    AIProviderError.ts       Error AI yang sudah dikategorikan (rate_limit, timeout, ...)
    ImageData.ts             Validasi data URL gambar
  solver/
    ModeDetector.ts          Deteksi pilihan ganda vs esai
    McqSolver.ts             Pilihan ganda (bisa beberapa soal sekaligus)
    EssaySolver.ts           Esai (panjang jawaban & mata pelajaran opsional)
    ImageSolver.ts           Soal dari gambar
    QuestionService.ts       Memilih solver yang tepat
  http/
    App.ts                   Merakit Express: middleware, route, error handler
    controllers/AskController.ts
    middleware/              ApiKeyAuth, Cors, ErrorHandler
tests/                       Vitest + Supertest, memakai provider palsu (tanpa API sungguhan)
extension/                   Browser extension
```

Semua dependency dimasukkan lewat constructor, jadi tiap class bisa dites dengan provider palsu.

## Menjalankan lokal

```bash
npm install
cp .env.example .env     # isi GEMINI_API_KEY dan API_KEY
npm run dev              # http://localhost:8080
npm test
npm run typecheck
```

Contoh request:

```bash
curl -X POST http://localhost:8080/ask \
  -H "Content-Type: application/json" -H "X-API-Key: <API_KEY>" \
  -d '{"question": "Ibukota Indonesia?\nA. Bandung\nB. Jakarta"}'
# → {"answer":"B. Jakarta","mode":"mcq"}
```

Body `/ask` juga menerima `length` (`short` | `medium` | `long`) dan `subject` (opsional) untuk soal esai.

Error selalu berbentuk `{ "error": "..." }`:

| Status | Arti |
|---|---|
| 400 | Input tidak valid |
| 401 | `X-API-Key` salah atau tidak ada |
| 413 | Body lebih dari 4 MB |
| 429 | Masih ada request lain yang diproses (lihat header `Retry-After`), atau kuota AI habis |
| 502 / 503 / 504 | Provider AI gagal / tidak tersedia / timeout |

## Satu request dalam satu waktu

Supaya kuota API tidak terbakar oleh klik ganda atau shortcut yang ditekan berulang:

- **1 request = 1 panggilan AI**, ditambah paling banyak 1 panggilan fallback ke Groq. Beberapa soal pilihan ganda dijawab dalam satu prompt, dan retry otomatis SDK Gemini dimatikan.
- **Lock di server** ([RequestGate](src/http/RequestGate.ts)): `/ask` dan `/ask-image` memakai lock yang sama. Selama satu request diproses, request lain langsung ditolak dengan 429 (tidak diantrekan). Lock dilepas saat request selesai, atau paling lama `REQUEST_HOLD_SECONDS` (default 30 detik). Saat waktu habis, panggilan AI yang masih berjalan ikut dibatalkan dan client menerima 504.
- **Lock di extension** ([background.js](extension/background.js)): satu request untuk semua tab. Klik "What is this?" atau Ctrl+Shift+Y selama menunggu jawaban akan diabaikan atau ditolak.

Proyek ini hanya dipakai dari satu perangkat, jadi lock di extension sudah menjamin satu request dalam satu waktu. Lock server (di memori) menjadi lapisan pengaman tambahan.

## Deploy ke Vercel

1. Push repo ini ke GitHub, lalu import di [vercel.com/new](https://vercel.com/new). Tidak perlu setting build apa pun.
2. Di **Settings → Environment Variables**, isi minimal `GEMINI_API_KEY` (atau `GEMINI_API_KEY1`, `GEMINI_API_KEY2`, ...) dan `API_KEY`. Variabel lain ada di [.env.example](.env.example).
3. Deploy, lalu cek `https://<project>.vercel.app/health`.

Atau lewat CLI: `npx vercel` lalu `npx vercel --prod`.

Durasi maksimal fungsi diatur 40 detik di [vercel.json](vercel.json).

### Beberapa API key Gemini

Isi `GEMINI_API_KEY1`, `GEMINI_API_KEY2`, dan seterusnya. [GeminiKeyPool](src/ai/GeminiKeyPool.ts) memakai satu key sampai kuotanya habis (HTTP 429), lalu pindah ke key berikutnya. Key yang habis tidak dicoba lagi sampai kuotanya reset: 60 detik untuk kuota per menit, atau tengah malam waktu Pacific untuk kuota harian. Error selain 429 tidak memicu rotasi. Kalau semua key habis, soal teks lanjut ke Groq (jika diisi).

Kuota Gemini dihitung **per project, bukan per key**. Rotasi hanya menambah kuota jika tiap key berasal dari project Google Cloud yang berbeda.

## Browser extension

1. Salin `extension/config.example.js` menjadi `extension/config.js`, lalu isi `apiBaseUrl` (URL Vercel) dan `apiKey`.
2. Chrome: `chrome://extensions` → aktifkan Developer mode → **Load unpacked** → pilih folder `extension/`.
3. Firefox: `about:debugging` → This Firefox → **Load Temporary Add-on** → pilih `extension/manifest.json`.

Jika memakai custom domain (bukan `*.vercel.app`), tambahkan domain itu ke `host_permissions` di `manifest.json`.

## Perbedaan dengan versi Go

| Fitur versi Go | Di aibot-js |
|---|---|
| HTTP API `/ask`, `/ask-image`, `/health` | ✅ Sama, error kini berupa JSON |
| Gemini + fallback Groq | ✅ Sama |
| Terminal web (CLI + ttyd), riwayat sesi | ❌ Dihapus: tidak bisa berjalan di Vercel |
| Laporan pemakaian ke Telegram tiap 30 menit | ❌ Dihapus: Vercel tidak menyimpan file dan tidak menjalankan proses terus-menerus. Bisa ditambah lagi dengan Vercel Cron + Upstash Redis bila perlu. |
| Docker, nginx, deploy SSH | ❌ Diganti Vercel |
| API key di kode extension | Dipindah ke `extension/config.js` (tidak di-commit) |
| Beberapa soal pilihan ganda dipecah, satu panggilan AI per soal | Satu panggilan AI untuk semua soal |
| Tidak ada lock request di server | Satu request dalam satu waktu, maksimal 30 detik |
