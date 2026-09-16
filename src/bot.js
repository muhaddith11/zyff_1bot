// Botni sozlaydi va `bot` obyektini eksport qiladi (start QILMAYDI).
// - Lokal (polling): src/dev.js
// - Vercel (webhook): api/bot.js
import { Bot, InputFile, InlineKeyboard } from 'grammy'
import { editImage } from './provider.js'
import { PROMPTS, ANGLE_LABELS } from './prompts.js'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) throw new Error("TELEGRAM_BOT_TOKEN yo'q. @BotFather dan token oling va env'ga qo'ying.")

export const bot = new Bot(token)

// Bitta chatda bir nechta rasm ketma-ket yuborilishi mumkin (masalan 10 tagacha) —
// har birini ALOHIDA qisqa id bilan eslab qolamiz va shu id'ni tugmaning callback_data
// ichiga yashiramiz. Shu tufayli qaysi xabarning tugmasini istalgan tartibda bossangiz
// ham, u har doim O'ZINING rasmini ishlaydi — oxirgi yuborilganini emas.
// Bitta chatda haddan tashqari ko'p rasm to'planib qolmasligi uchun eng eskisi
// avtomatik unutiladi (MAX_PENDING_PER_CHAT).
// Eslatma: serverless'da bu xotira sovuq startda tozalanadi — lekin oqim tez
// (rasm -> tugma) bo'lgani uchun amalda yetarli. Kerak bo'lsa keyin KV'ga o'tkazamiz.
const MAX_PENDING_PER_CHAT = 20
const images = new Map() // chatId -> Map<id, fileId>

export function rememberImage(chatId, fileId) {
  let chatImages = images.get(chatId)
  if (!chatImages) images.set(chatId, (chatImages = new Map()))
  if (chatImages.size >= MAX_PENDING_PER_CHAT) chatImages.delete(chatImages.keys().next().value) // eng eskisi
  const id = Math.random().toString(36).slice(2, 8)
  chatImages.set(id, fileId)
  return id
}

export function getImage(chatId, id) {
  return images.get(chatId)?.get(id)
}

bot.command('start', (ctx) =>
  ctx.reply(
    'Salom! 👋\n\n' +
      "Menga mahsulot rasmini yuboring — men uni oppoq fonli, professional do'kon rasmiga aylantirib beraman:\n\n" +
      '👕 Kiyim → koʻrinmas maniken ustida kiyilgandek (old yoki orqa tomon)\n' +
      '👟 Poyabzal → oppoq fonda, stelajdagidek (umumiy, yon yoki old tomon)\n\n' +
      'Bir nechta rasmni ketma-ket ham tashlashingiz mumkin — har biri alohida ishlanadi.\n\n' +
      'ℹ️ Eng yaxshi sifat uchun rasmni "Fayl" (siqilmagan) qilib yuboring.'
  )
)

function kindKeyboard(id) {
  return new InlineKeyboard().text('👕 Kiyim', `type:clothing:${id}`).text('👟 Poyabzal', `type:footwear:${id}`)
}

function angleKeyboard(kind, id) {
  const kb = new InlineKeyboard()
  for (const [angle, label] of Object.entries(ANGLE_LABELS[kind])) kb.text(label, `angle:${kind}:${angle}:${id}`)
  return kb
}

async function onImage(ctx, fileId) {
  const id = rememberImage(ctx.chat.id, fileId)
  await ctx.reply('Bu nima? Turini tanlang:', { reply_markup: kindKeyboard(id) })
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
bot.callbackQuery(/^type:(clothing|footwear):(\w+)$/, async (ctx) => {
  const [, kind, id] = ctx.match
  await ctx.answerCallbackQuery()
  const chatId = ctx.chat?.id
  if (chatId == null || !getImage(chatId, id)) {
    await ctx.reply('Bu rasm eskirgan — qayta yuboring.')
    return
  }
  await ctx
    .editMessageText('Qaysi tomondan? 📸', { reply_markup: angleKeyboard(kind, id) })
    .catch(() => ctx.reply('Qaysi tomondan? 📸', { reply_markup: angleKeyboard(kind, id) }))
})

// Burchak tanlangach — rasmni yuklab, AI orqali qayta ishlaymiz.
bot.callbackQuery(/^angle:(clothing|footwear):(\w+):(\w+)$/, async (ctx) => {
  const [, kind, angle, id] = ctx.match
  const prompt = PROMPTS[kind]?.[angle]
  const chatId = ctx.chat?.id
  await ctx.answerCallbackQuery()
  const fileId = chatId != null ? getImage(chatId, id) : undefined
  if (!fileId || !prompt) {
    await ctx.reply('Bu rasm eskirgan — qayta yuboring.')
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
    await ctx.reply('Boshqa burchak kerakmi?', { reply_markup: angleKeyboard(kind, id) })
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
