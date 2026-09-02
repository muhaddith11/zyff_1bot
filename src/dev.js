// Lokal ishga tushirish (polling). Vercel'da EMAS — u yerda api/bot.js (webhook).
// DIQQAT: bir vaqtda webhook + polling ishlamaydi. Lokal polling'dan oldin
// webhook o'chirilgan bo'lsin (yoki hali o'rnatilmagan).
import 'dotenv/config'
import { bot } from './bot.js'

bot.start({
  onStart: (me) => console.log(`✅ Bot (polling) ishga tushdi: @${me.username}`),
})
