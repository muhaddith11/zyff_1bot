// Botni sozlaydi va `bot` obyektini eksport qiladi (start QILMAYDI).
// - Lokal (polling): src/dev.js
// - Vercel (webhook): api/bot.js
import { Bot, InputFile, InlineKeyboard } from 'grammy'
import { editImage } from './provider.js'
import { PROMPTS, ANGLE_LABELS } from './prompts.js'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) throw new Error("TELEGRAM_BOT_TOKEN yo'q. @BotFather dan token oling va env'ga qo'ying.")

export const bot = new Bot(token)

// Foydalanuvchi yuborgan oxirgi rasmni chat bo'yicha saqlaymiz — shu rasmdan
// istalgancha turli burchak so'rash mumkin (qayta yuborish shart emas), toki
// yangi rasm yuborilmaguncha yoki alohida turdagi tugma bosilmaguncha.
// Eslatma: serverless'da bu xotira sovuq startda tozalanadi — lekin oqim tez
// (rasm -> tugma) bo'lgani uchun amalda yetarli. Kerak bo'lsa keyin KV'ga o'tkazamiz.
const lastImage = new Map() // chatId -> fileId

bot.command('start', (ctx) =>
  ctx.reply(
    'Salom! 👋\n\n' +
      "Menga mahsulot rasmini yuboring — men uni oppoq fonli, professional do'kon rasmiga aylantirib beraman:\n\n" +
      '👕 Kiyim → koʻrinmas maniken ustida kiyilgandek (old yoki orqa tomon)\n' +
      '👟 Poyabzal → oppoq fonda, stelajdagidek (umumiy, yon yoki old tomon)\n\n' +
      'ℹ️ Eng yaxshi sifat uchun rasmni "Fayl" (siqilmagan) qilib yuboring.'
  )
)

function kindKeyboard() {
  return new InlineKeyboard().text('👕 Kiyim', 'type:clothing').text('👟 Poyabzal', 'type:footwear')
}

function angleKeyboard(kind) {
  const kb = new InlineKeyboard()
  for (const [angle, label] of Object.entries(ANGLE_LABELS[kind])) kb.text(label, `angle:${kind}:${angle}`)
  return kb
}

async function onImage(ctx, fileId) {
  lastImage.set(ctx.chat.id, fileId)
  await ctx.reply('Bu nima? Turini tanlang:', { reply_markup: kindKeyboard() })
}

// Rasm (siqilgan "photo")
bot.on('message:photo', (ctx) => {
  const photos = ctx.message.photo
  const fileId = photos[photos.length - 1].file_id // eng katta o'lcham
  return onImage(ctx, fileId)
})

// Rasm ("Fayl"/document — siqilmagan, eng yaxshi sifat)
bot.on('message:document', (ctx) => {
  const d = ctx.message.document
  if (!d.mime_type || !d.mime_type.startsWith('image/')) {
    return ctx.reply('Iltimos, rasm yuboring (JPG yoki PNG).')
  }
  return onImage(ctx, d.file_id)
})

// Tur tanlangach — qaysi burchak kerakligini so'raymiz.
bot.callbackQuery(/^type:(clothing|footwear)$/, async (ctx) => {
  const kind = ctx.match[1]
  await ctx.answerCallbackQuery()
  if (!lastImage.get(ctx.chat?.id)) {
    await ctx.reply('Avval rasm yuboring.')
    return
  }
  await ctx
    .editMessageText('Qaysi tomondan? 📸', { reply_markup: angleKeyboard(kind) })
    .catch(() => ctx.reply('Qaysi tomondan? 📸', { reply_markup: angleKeyboard(kind) }))
})

// Burchak tanlangach — rasmni yuklab, AI orqali qayta ishlaymiz.
bot.callbackQuery(/^angle:(clothing|footwear):(\w+)$/, async (ctx) => {
  const [, kind, angle] = ctx.match
  const prompt = PROMPTS[kind]?.[angle]
  const chatId = ctx.chat?.id
  await ctx.answerCallbackQuery()
  const fileId = chatId != null ? lastImage.get(chatId) : undefined
  if (!fileId || !prompt) {
    await ctx.reply('Avval rasm yuboring.')
    return
  }

  const status = await ctx.reply('⏳ Ishlanmoqda... (10–30 soniya)')
  try {
    const src = await downloadTelegramFile(fileId)
    const out = await editImage({ ...src, prompt })
    const ext = out.mimeType === 'image/jpeg' ? 'jpg' : 'png'
    const base = kind === 'clothing' ? 'kiyim' : 'poyabzal'
    await ctx.replyWithDocument(new InputFile(out.buffer, `${base}-${angle}.${ext}`), { caption: '✅ Tayyor' })
    // Xuddi shu rasmdan boshqa burchak ham kerak bo'lishi mumkin — qayta yuborish shart emas.
    await ctx.reply('Boshqa burchak kerakmi?', { reply_markup: angleKeyboard(kind) })
  } catch (e) {
    console.error('Qayta ishlash xatosi:', e)
    await ctx.reply('❌ Xatolik: ' + (e?.message || String(e)))
  } finally {
    if (chatId != null) ctx.api.deleteMessage(chatId, status.message_id).catch(() => {})
  }
})

async function downloadTelegramFile(fileId) {
  const f = await bot.api.getFile(fileId)
  const url = `https://api.telegram.org/file/bot${token}/${f.file_path}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Telegram fayl yuklab bo'lmadi: ${res.status}`)
  const ab = await res.arrayBuffer()
  const mimeType = (f.file_path || '').toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
  return { buffer: Buffer.from(ab), mimeType }
}

bot.catch((err) => console.error('Bot xatosi:', err))
