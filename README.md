# Product Photo Bot 🧺➡️🤍

Telegram bot: doʻkon mahsulot rasmini **oppoq fonli, professional** rasmga aylantiradi.

- 👕 **Kiyim** → koʻrinmas maniken ustida kiyilgandek (ghost mannequin)
- 👟 **Poyabzal** → oppoq fonda, stelajda turgandek

Botga rasm yuborasiz → tur (kiyim/poyabzal) tanlaysiz → 10–30 soniyada tayyor rasm qaytadi.
Rasm AI: **Google Gemini** (`nano banana`).

---

## Talablar

- Telegram bot **tokeni** — @BotFather (`/newbot`)
- **Gemini kaliti** — https://aistudio.google.com/apikey (bepul)

---

## A) Vercel'ga deploy (asosiy usul)

1. **GitHub'ga joylang** (pastda), so'ng https://vercel.com → **Add New → Project → Import** shu repo.
2. Vercel **Environment Variables** ga qo'shing:
   | Nomi | Qiymati |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | @BotFather tokeni |
   | `IMAGE_PROVIDER` | `gemini` |
   | `GEMINI_API_KEY` | AI Studio kaliti |
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
| `src/provider.js` | rasm AI (Gemini; ixtiyoriy Replicate) |
| `src/prompts.js` | **promptlar — natija sifati shu yerdan sozlanadi** |
| `src/set-webhook.js` | webhook o'rnatish/o'chirish |
| `src/dev.js` | lokal polling |

## Sifatni sozlash

Natija ideal bo'lmasa — `src/prompts.js` dagi matnni o'zgartiring (yoki menga ayting).
Kerak bo'lsa `GEMINI_MODEL` ni almashtirish mumkin.
