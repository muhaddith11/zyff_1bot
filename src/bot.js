// Botni sozlaydi va `bot` obyektini eksport qiladi (start QILMAYDI).
// - Lokal (polling): src/dev.js
// - Vercel (webhook): api/bot.js
import { Bot, InputFile, InlineKeyboard } from 'grammy'
import { editImage } from './provider.js'
import { PROMPTS, ANGLE_LABELS, choiceLabel } from './prompts.js'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) throw new Error("TELEGRAM_BOT_TOKEN yo'q. @BotFather dan token oling va env'ga qo'ying.")

export const bot = new Bot(token)

const SINGLE_STEP_KINDS = new Set(['background', 'other']) // burchak so'ramasdan darhol ishlaydi
const MULTI_ANGLE_KINDS = new Set(['clothing', 'footwear']) // bir nechta burchagi bor
const FILE_BASE = { clothing: 'kiyim', footwear: 'poyabzal', background: 'fon-oq', other: 'mahsulot' }

// Bitta chatda bir nechta rasm ketma-ket yuborilishi mumkin (masalan 10 tagacha) —
// har birini ALOHIDA qisqa id bilan eslab qolamiz va shu id'ni tugmaning callback_data
// ichiga yashiramiz. Shu tufayli qaysi xabarning tugmasini istalgan tartibda bossangiz
// ham, u har doim O'ZINING rasmini ishlaydi — oxirgi yuborilganini emas.
// Bitta chatda haddan tashqari ko'p rasm to'planib qolmasligi uchun eng eskisi
// avtomatik unutiladi (MAX_PENDING_PER_CHAT).
// Eslatma: serverless'da bu xotira sovuq startda tozalanadi — lekin oqim tez
// (rasm -> tugma) bo'lgani uchun amalda yetarli. Kerak bo'lsa keyin KV'ga o'tkazamiz.
const MAX_PENDING_PER_CHAT = 20
const images = new Map() // chatId -> Map<id, fileId>  (hamma yuborilgan rasmlar — retry uchun)
const pendingByChat = new Map() // chatId -> Set<id>    (hali TUR tanlanmagan rasmlar — "batch" uchun)

export function rememberImage(chatId, fileId) {
  let chatImages = images.get(chatId)
  if (!chatImages) images.set(chatId, (chatImages = new Map()))
  if (chatImages.size >= MAX_PENDING_PER_CHAT) chatImages.delete(chatImages.keys().next().value) // eng eskisi
  const id = Math.random().toString(36).slice(2, 8)
  chatImages.set(id, fileId)

  let pending = pendingByChat.get(chatId)
  if (!pending) pendingByChat.set(chatId, (pending = new Set()))
  if (pending.size >= MAX_PENDING_PER_CHAT) pending.delete(pending.values().next().value)
  pending.add(id)
  return id
}

export function getImage(chatId, id) {
  return images.get(chatId)?.get(id)
}

// Tur (Kiyim/Poyabzal/...) tanlangach, shu rasm endi "navbatda kutayotgan" emas —
// "hammasiga qo'llash" (batch) uni endi o'z holicha qoldiradi.
function claimPending(chatId, id) {
  pendingByChat.get(chatId)?.delete(id)
}

function pendingCount(chatId) {
  return pendingByChat.get(chatId)?.size || 0
}

// Vercel funksiyasi 60s'dan keyin JAVOBSIZ o'ldiriladi (xato ham yuborilmaydi —
// foydalanuvchi "Ishlanmoqda..." holatida abadiy qolib ketadi). Shuning uchun
// rasm AI'ni 45s bilan cheklaymiz: shu vaqtda tugamasa, so'rovni o'zimiz bekor
// qilib ("abort"), aniq xato bilan javob beramiz — bu doim Vercel o'ldirishidan oldin ishlaydi.
const IMAGE_TIMEOUT_MS = 45_000
async function editImageWithTimeout(args) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS)
  try {
    return await editImage({ ...args, signal: controller.signal })
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error("Vaqt tugadi — AI juda uzoq javob berdi. \"Qayta urinish\"ni bosing.")
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

bot.command('start', (ctx) =>
  ctx.reply(
    'Salom! 👋\n\n' +
      "Menga mahsulot rasmini yuboring — quyidagilardan birini tanlaysiz:\n\n" +
      '👕 Kiyim → koʻrinmas maniken ustida kiyilgandek, oppoq fonda (old yoki orqa tomon)\n' +
      '👟 Poyabzal → oppoq fonda, stelajdagidek (umumiy, yon yoki old tomon)\n' +
      '🎒 Boshqa mahsulot → sumka, aksessuar va h.k. uchun umumiy studio ko\'rinish\n' +
      '🖼 Faqat fon oq → rasmning O\'ZI o\'zgarmaydi, faqat orqa fon oq bo\'ladi\n\n' +
      'Bir nechta rasmni ketma-ket ham tashlashingiz mumkin — bittasida tanlov qilsangiz, ' +
      'qolganlariga ham xuddi shuni qo\'llashni taklif qilaman. Kiyim/poyabzalda "🔁 Barchasi" ' +
      'tugmasi bitta rasmning barcha burchaklarini bir yo\'la beradi.\n\n' +
      'ℹ️ Eng yaxshi sifat uchun rasmni "Fayl" (siqilmagan) qilib yuboring.'
  )
)

function kindKeyboard(id) {
  return new InlineKeyboard()
    .text('👕 Kiyim', `type:clothing:${id}`)
    .text('👟 Poyabzal', `type:footwear:${id}`)
    .row()
    .text('🎒 Boshqa mahsulot', `type:other:${id}`)
    .text('🖼 Faqat fon oq', `type:background:${id}`)
}

function angleKeyboard(kind, id) {
  const kb = new InlineKeyboard()
  for (const [angle, label] of Object.entries(ANGLE_LABELS[kind])) kb.text(label, `angle:${kind}:${angle}:${id}`)
  if (MULTI_ANGLE_KINDS.has(kind)) {
    kb.row().text(`🔁 Barchasi (${Object.keys(ANGLE_LABELS[kind]).length} ta)`, `allangles:${kind}:${id}`)
  }
  return kb
}

function batchKeyboard(kind, angle) {
  return new InlineKeyboard().text('📦 Ha, qolganlariga ham', `batch:${kind}:${angle}`)
}

async function onImage(ctx, fileId) {
  const id = rememberImage(ctx.chat.id, fileId)
  await ctx.reply('Nima qilamiz?', { reply_markup: kindKeyboard(id) })
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

// Rasmni yuklab, AI orqali qayta ishlaymiz (burchak tanlangandan yoki "Fon oq"/"Boshqa
// mahsulot" to'g'ridan-to'g'ri bosilgandan keyin — hammasi shu funksiyaga tushadi).
// `silent`: "hammasiga qo'llash" (batch) ichida chaqirilganda — har bir rasm uchun
// alohida "Boshqa burchak?"/"Qayta urinish" taklifi bermaymiz, faqat natija/xatoni yuboramiz;
// tashqi tsikl o'zi bitta umumiy hisobot beradi.
async function processImage(ctx, kind, angle, id, { silent = false } = {}) {
  const prompt = PROMPTS[kind]?.[angle]
  const chatId = ctx.chat?.id
  const fileId = chatId != null ? getImage(chatId, id) : undefined
  if (!fileId || !prompt) {
    if (!silent) await ctx.reply('Bu rasm eskirgan — qayta yuboring.')
    return false
  }

  const status = await ctx.reply('⏳ Ishlanmoqda... (10–30 soniya)')
  let ok = false
  try {
    const src = await downloadTelegramFile(fileId)
    const out = await editImageWithTimeout({ ...src, prompt })
    const ext = out.mimeType === 'image/jpeg' ? 'jpg' : 'png'
    const suffix = angle === 'default' ? '' : `-${angle}`
    await ctx.replyWithDocument(new InputFile(out.buffer, `${FILE_BASE[kind]}${suffix}.${ext}`), { caption: '✅ Tayyor' })
    ok = true
    if (!silent) {
      // Kiyim/poyabzalda xuddi shu rasmdan boshqa burchak ham kerak bo'lishi mumkin.
      if (MULTI_ANGLE_KINDS.has(kind)) {
        await ctx.reply('Boshqa burchak kerakmi?', { reply_markup: angleKeyboard(kind, id) })
      }
      // Navbatda boshqa rasm(lar) bo'lsa — shu tanlovni ularga ham qo'llashni taklif qilamiz.
      const remaining = pendingCount(chatId)
      if (remaining > 0) {
        await ctx.reply(
          `📦 Yana ${remaining} ta rasm kutmoqda — hammasiga "${choiceLabel(kind, angle)}" ni qo'llaymizmi?`,
          { reply_markup: batchKeyboard(kind, angle) }
        )
      }
    }
  } catch (e) {
    console.error('Qayta ishlash xatosi:', e)
    if (silent) {
      await ctx.reply('❌ Bitta rasmda xatolik: ' + (e?.message || String(e)))
    } else {
      await ctx.reply('❌ Xatolik: ' + (e?.message || String(e)))
      // Rasm hali xotirada (o'chirilmagan) — bitta bosishda qayta urinish mumkin, qayta yuborish shart emas.
      if (getImage(chatId, id)) {
        await ctx.reply('🔄 Qayta urinib ko\'ramizmi?', { reply_markup: angleKeyboard(kind, id) })
      }
    }
  } finally {
    if (chatId != null) ctx.api.deleteMessage(chatId, status.message_id).catch(() => {})
  }
  return ok
}

// Bitta rasmning BARCHA burchaklarini ketma-ket, bitta so'rovda beramiz ("🔁 Barchasi").
// Umumiy vaqt cheklangan (Vercel 60s) — agar hammasiga ulgurmasak, qolganini alohida
// tugma bilan olishni so'raymiz (hech qachon "osilib qolmaydi").
const ALL_ANGLES_TIME_BUDGET_MS = 40_000
async function processAllAngles(ctx, kind, id) {
  const angles = Object.keys(ANGLE_LABELS[kind])
  const chatId = ctx.chat?.id
  const fileId = chatId != null ? getImage(chatId, id) : undefined
  if (!fileId) {
    await ctx.reply('Bu rasm eskirgan — qayta yuboring.')
    return
  }

  const status = await ctx.reply(`⏳ Ishlanmoqda... (${angles.length} ta rasm, biroz uzoqroq davom etadi)`)
  const started = Date.now()
  let done = 0
  const missed = []
  try {
    const src = await downloadTelegramFile(fileId) // bitta marta yuklaymiz, har bir burchakda qayta ishlatamiz
    for (const angle of angles) {
      if (Date.now() - started > ALL_ANGLES_TIME_BUDGET_MS) {
        missed.push(angle)
        continue
      }
      try {
        const out = await editImageWithTimeout({ ...src, prompt: PROMPTS[kind][angle] })
        const ext = out.mimeType === 'image/jpeg' ? 'jpg' : 'png'
        await ctx.replyWithDocument(new InputFile(out.buffer, `${FILE_BASE[kind]}-${angle}.${ext}`), {
          caption: `✅ ${ANGLE_LABELS[kind][angle]}`,
        })
        done++
      } catch (e) {
        await ctx.reply(`❌ ${ANGLE_LABELS[kind][angle]}: ${e?.message || String(e)}`)
      }
    }
  } finally {
    if (chatId != null) ctx.api.deleteMessage(chatId, status.message_id).catch(() => {})
  }
  if (missed.length > 0) {
    await ctx.reply(
      `⏱ Vaqt yetmadi (${done}/${angles.length} tayyor) — qolganini alohida tugma bilan oling:`,
      { reply_markup: angleKeyboard(kind, id) }
    )
  }
}

// Navbatda kutayotgan qolgan rasmlarga xuddi shu tanlovni ketma-ket qo'llaymiz.
// Bitta so'rovda hammasiga ulgurmasligimiz mumkin (har biri 10-30s) — vaqt tugasa,
// "davom etish" tugmasi bilan hisobot beramiz, hech qachon osilib qolmaymiz.
const BATCH_TIME_BUDGET_MS = 35_000
async function processPendingBatch(ctx, chatId, kind, angle) {
  const started = Date.now()
  let done = 0
  while (Date.now() - started < BATCH_TIME_BUDGET_MS) {
    const pending = pendingByChat.get(chatId)
    if (!pending || pending.size === 0) break
    const nextId = pending.values().next().value
    pending.delete(nextId)
    const ok = await processImage(ctx, kind, angle, nextId, { silent: true })
    if (ok) done++
  }
  const remaining = pendingCount(chatId)
  if (remaining > 0) {
    await ctx.reply(`✅ ${done} ta tayyor. Yana ${remaining} ta qoldi.`, { reply_markup: batchKeyboard(kind, angle) })
  } else {
    await ctx.reply(`✅ Hammasi tayyor (${done} ta).`)
  }
}

// Tur tanlangach: kiyim/poyabzal/boshqa-mahsulotda burchak so'raymiz;
// "Fon oq"/"Boshqa mahsulot" (bitta bosqichli turlar) darhol ishga tushadi.
bot.callbackQuery(/^type:(clothing|footwear|background|other):(\w+)$/, async (ctx) => {
  const [, kind, id] = ctx.match
  await ctx.answerCallbackQuery()
  const chatId = ctx.chat?.id
  if (chatId == null || !getImage(chatId, id)) {
    await ctx.reply('Bu rasm eskirgan — qayta yuboring.')
    return
  }
  claimPending(chatId, id) // tur tanlandi — bu rasm endi "navbatda kutayotgan" emas
  if (SINGLE_STEP_KINDS.has(kind)) {
    await processImage(ctx, kind, 'default', id)
    return
  }
  await ctx
    .editMessageText('Qaysi tomondan? 📸', { reply_markup: angleKeyboard(kind, id) })
    .catch(() => ctx.reply('Qaysi tomondan? 📸', { reply_markup: angleKeyboard(kind, id) }))
})

// Burchak tanlangach (yoki "Fon oq"/"Boshqa mahsulot" qayta urinilganda) — qayta ishlaymiz.
bot.callbackQuery(/^angle:(clothing|footwear|background|other):(\w+):(\w+)$/, async (ctx) => {
  const [, kind, angle, id] = ctx.match
  await ctx.answerCallbackQuery()
  await processImage(ctx, kind, angle, id)
})

// "🔁 Barchasi" — shu rasmning barcha burchaklarini bir yo'la.
bot.callbackQuery(/^allangles:(clothing|footwear):(\w+)$/, async (ctx) => {
  const [, kind, id] = ctx.match
  await ctx.answerCallbackQuery()
  await processAllAngles(ctx, kind, id)
})

// "📦 Ha, qolganlariga ham" — navbatdagi rasmlarga xuddi shu tanlovni qo'llaymiz.
bot.callbackQuery(/^batch:(clothing|footwear|background|other):(\w+)$/, async (ctx) => {
  const [, kind, angle] = ctx.match
  await ctx.answerCallbackQuery()
  const chatId = ctx.chat?.id
  if (chatId == null) return
  await processPendingBatch(ctx, chatId, kind, angle)
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
