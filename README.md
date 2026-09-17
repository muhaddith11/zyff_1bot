# Product Photo Bot 🧺➡️🤍

Telegram bot: doʻkon mahsulot rasmini **oppoq fonli, professional** rasmga aylantiradi.

- 👕 **Kiyim** → koʻrinmas maniken ustida kiyilgandek (ghost mannequin)
- 👟 **Poyabzal** → oppoq fonda, stelajda turgandek
- 🖼 **Faqat fon oq** → rasmning oʻzi (poza, burchak, hatto ilgich) oʻzgarmaydi, faqat orqa fon oq boʻladi

Botga rasm yuborasiz → tur (kiyim/poyabzal/fon oq) tanlaysiz → kiyim/poyabzalda burchak
(old/orqa; umumiy/yon/old) ham so'raladi → 10–30 soniyada tayyor rasm qaytadi. Xuddi shu
rasmdan boshqa burchak ham so'rash mumkin — qayta yuborish shart emas.
Rasm AI: **Cloudflare Workers AI** (FLUX.2 klein — bepul) yoki **Google Gemini** (`nano banana` — pullik).

---

## Talablar

- Telegram bot **tokeni** — @BotFather (`/newbot`)
- Rasm AI — bittasi yetarli, `IMAGE_PROVIDER` bilan tanlanadi:
  - **Cloudflare** (`cloudflare`, bepul, kartasiz) — dash.cloudflare.com → AI → Workers AI →
    **Use REST API**: *Create a Workers AI API Token* + **Account ID**.
    Kuniga 10 000 neuron: `flux-2-klein-4b` ≈ 90 rasm (asosiy), `flux-2-klein-9b` ≈ 7 rasm.
  - **Gemini** (`gemini`) — https://aistudio.google.com/apikey — **billing ulangan bo'lishi shart**:
    rasm modellari bepul tarifda yo'q (AI Studio → Set up billing, oldindan to'lov talab qilinadi;
    `gemini-3.1-flash-image` ≈ $0.067 / rasm, `gemini-3.1-flash-lite-image` ≈ $0.034 / rasm)

---

## A) Vercel'ga deploy (asosiy usul)

1. **GitHub'ga joylang** (pastda), so'ng https://vercel.com → **Add New → Project → Import** shu repo.
2. Vercel **Environment Variables** ga qo'shing:
   | Nomi | Qiymati |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | @BotFather tokeni |
   | `IMAGE_PROVIDER` | `cloudflare` (yoki `gemini`) |
   | `CLOUDFLARE_ACCOUNT_ID` | Workers AI → Use REST API sahifasidan |
   | `CLOUDFLARE_API_TOKEN` | Workers AI API tokeni |
   | `GEMINI_API_KEY` | AI Studio kaliti (faqat `gemini` uchun) |
   | `WEBHOOK_SECRET` | istalgan tasodifiy matn (ixtiyoriy) |
3. **Deploy** bosing. Manzil oling, masalan `https://product-photo-bot.vercel.app`.
4. **Webhookni bir marta o'rnating** (lokal terminalda, `.env` to'ldirilgan holda):
   ```bash
   npm install
   node src/set-webhook.js https://product-photo-bot.vercel.app
   ```
   `"ok": true` chiqsa — Telegram'da botga rasm tashlab sinang. ✅

> ⏱️ Rasm generatsiyasi 10–30s. `vercel.json` da `maxDuration: 60`. Agar Vercel
> rejangiz 60s'ga ruxsat bermasa — qiymatni kamaytiring yoki rejani oshiring.

---

## B) Lokal sinov (ixtiyoriy, polling)

Webhook shart emas — kompyuterda tez sinash uchun:

```bash
npm install
copy .env.example .env   # keyin .env ni to'ldiring
npm run dev
```

> Diqqat: bir vaqtda webhook + polling ishlamaydi. Vercel webhook o'rnatilgan
> bo'lsa, lokal polling'dan oldin uni o'chiring: `node src/set-webhook.js --delete`.

---

## Fayllar

| Fayl | Vazifasi |
|---|---|
| `api/bot.js` | Vercel webhook (kirish nuqtasi) |
| `src/bot.js` | bot mantiqi (handlerlar) |
| `src/provider.js` | rasm AI (Cloudflare / Gemini / Replicate) |
| `src/prompts.js` | **promptlar — natija sifati shu yerdan sozlanadi** |
| `src/set-webhook.js` | webhook o'rnatish/o'chirish |
| `src/dev.js` | lokal polling |

## Sifatni sozlash

Natija ideal bo'lmasa — `src/prompts.js` dagi matnni o'zgartiring (yoki menga ayting).
Cloudflare (FLUX) natijasi har safar biroz farq qiladi — yoqmasa, rasmni qayta yuboring.
Modelni almashtirish: `CLOUDFLARE_MODEL` (masalan `@cf/black-forest-labs/flux-2-klein-9b`) yoki `GEMINI_MODEL`.
