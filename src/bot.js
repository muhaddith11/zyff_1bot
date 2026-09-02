// Botni sozlaydi va `bot` obyektini eksport qiladi (start QILMAYDI).
// - Lokal (polling): src/dev.js
// - Vercel (webhook): api/bot.js
import { Bot, InputFile, InlineKeyboard } from 'grammy'
import { editImage } from './provider.js'
import { PROMPTS } from './prompts.js'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) throw new Error("TELEGRAM_BOT_TOKEN yo'q. @BotFather dan token oling va env'ga qo'ying.")

export const bot = new Bot(token)

// Foydalanuvchi yuborgan rasmni tur tanlaguncha vaqtincha saqlaymiz (chat bo'yicha).
// Eslatma: serverless'da bu xotira sovuq startda tozalanadi — lekin oqim tez
// (rasm -> tugma) bo'lgani uchun amalda yetarli. Kerak bo'lsa keyin KV'ga o'tkazamiz.
const pending = new Map() // chatId -> fileId

bot.command('start', (ctx) =>
  ctx.reply(
    'Salom! 👋\n\n' +
      "Menga mahsulot rasmini yuboring — men uni oppoq fonli, professional do'kon rasmiga aylantirib beraman:\n\n" +
      '👕 Kiyim → koʻrinmas maniken ustida kiyilgandek\n' +
      '👟 Poyabzal → oppoq fonda, stelajdagidek\n\n' +
      'ℹ️ Eng yaxshi sifat uchun rasmni "Fayl" (siqilmagan) qilib yuboring.'
  )
)

async function onImage(ctx, fileId) {
  pending.set(ctx.chat.id, fileId)
  const kb = new InlineKeyboard()
    .text('👕 Kiyim', 'type:clothing')
    .text('👟 Poyabzal', 'type:footwear')
  await ctx.reply('Bu nima? Turini tanlang:', { reply_markup: kb })
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

// Tur tanlangach — rasmni yuklab, AI orqali qayta ishlaymiz.
bot.callbackQuery(/^type:(clothing|footwear)$/, async (ctx) => {
  const kind = ctx.match[1]
  const chatId = ctx.chat?.id
  await ctx.answerCallbackQuery()
  const fileId = chatId != null ? pending.get(chatId) : undefined
  if (!fileId) {
    await ctx.reply('Avval rasm yuboring.')
    return
  }
  pending.delete(chatId)

  const status = await ctx.reply('⏳ Ishlanmoqda... (10–30 soniya)')
  try {
    const src = await downloadTelegramFile(fileId)
    const out = await editImage({ ...src, prompt: PROMPTS[kind] })
    const name = kind === 'clothing' ? 'kiyim.png' : 'poyabzal.png'
    await ctx.replyWithDocument(new InputFile(out.buffer, name), { caption: '✅ Tayyor' })
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
