// Ruxsat tizimi: botdan faqat admin ruxsat bergan odamlar foydalana oladi.
//
// - ADMIN_ID env — admin'ning Telegram ID'si (botda /id yozsangiz ko'rsatadi).
//   Bo'sh bo'lsa — bot avvalgidek hamma uchun ochiq.
// - Yangi odam botga yozganda (/start, rasm, istalgan xabar) adminga so'rov boradi:
//   "✅ Ruxsat berish" / "⛔ Rad etish". Javobni foydalanuvchiga bot o'zi yetkazadi.
// - /users (faqat admin) — ro'yxat va har bir odamni bitta bosishda yoqish/o'chirish.
//
// Ro'yxat qayerda saqlanadi: Vercel serverless'da xotira har sovuq startda tozalanadi,
// alohida baza (KV/Redis) esa qo'shimcha sozlash talab qiladi. Shuning uchun ro'yxat
// admin bilan bot chatidagi PIN qilingan xabarda turadi — bot uni getChat orqali o'qiydi
// va o'zi tahrirlaydi. Admin bu xabarni o'chirsa yoki pindan olsa, ro'yxat yo'qoladi va
// odamlar qaytadan ruxsat so'raydi (hech kim ruxsatsiz kirib qolmaydi).
import { InlineKeyboard } from 'grammy'

const STORE_HEADER = "📋 Ruxsatlar ro'yxati"
const STORE_NOTE = "(Bu xabarni o'chirmang va pindan olmang — bot ruxsatlarni shu yerda saqlaydi. Boshqarish: /users)"
const CACHE_TTL_MS = 60_000 // ruxsat berilganlar uchun har xabarda Telegram'dan qayta o'qimaymiz
const REQUEST_COOLDOWN_MS = 10 * 60_000 // bitta odam uchun adminga takroriy so'rov yubormaslik

let cache = null // { approved: Map<id, label>, blocked: Map<id, label>, messageId, loadedAt }
const recentRequests = new Map() // userId -> so'rov yuborilgan vaqt

export function adminId() {
  const id = Number(process.env.ADMIN_ID)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

// bot.js'da BOSHQA handlerlardan OLDIN chaqirilishi shart (grammy middleware tartibi).
export function installAccessControl(bot) {
  // /id hamma uchun ochiq — admin o'z ID'sini ADMIN_ID'ga yozishi uchun kerak.
  bot.command('id', (ctx) => ctx.reply(`🆔 Sizning Telegram ID: ${ctx.from.id}`))

  bot.use(async (ctx, next) => {
    const admin = adminId()
    if (!admin) return next()
    const user = ctx.from
    // Botlar (shu jumladan botning O'ZI) — e'tiborsiz: ro'yxat xabarini pin qilganda Telegram
    // "bot ai pinned ..." xizmat xabarini bot nomidan yuboradi; avval u "yangi foydalanuvchi"
    // deb qabul qilinib, adminga botning o'zi haqida so'rov ketgan edi.
    if (!user || user.is_bot) return
    if (user.id === admin) return next()

    let store
    try {
      store = await loadStore(ctx.api, admin)
      // Ro'yxatda yo'q bo'lsa — kesh eskirgan bo'lishi mumkin (admin hozirgina ruxsat bergan,
      // boshqa serverless nusxa esa bilmaydi). Rad etishdan oldin yangisini o'qiymiz.
      if (!store.approved.has(user.id)) store = await loadStore(ctx.api, admin, { fresh: true })
    } catch (e) {
      console.error("Ruxsatlar ro'yxatini o'qib bo'lmadi:", e)
      store = cache
    }
    if (store?.approved.has(user.id)) return next()

    if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {})
    if (!store) {
      await ctx.reply("⚠️ Vaqtincha xatolik — birozdan keyin qayta urinib ko'ring.")
      return
    }
    if (store.blocked.has(user.id)) {
      await ctx.reply('⛔ Admin sizga bu botdan foydalanishga ruxsat bermagan.')
      return
    }
    await requestAccess(ctx, admin)
  })

  bot.callbackQuery(/^acl:(allow|deny):(\d+)$/, async (ctx) => {
    const admin = adminId()
    if (!admin || ctx.from.id !== admin) {
      await ctx.answerCallbackQuery({ text: 'Faqat admin uchun.' })
      return
    }
    const allow = ctx.match[1] === 'allow'
    const userId = Number(ctx.match[2])

    const store = await loadStore(ctx.api, admin, { fresh: true })
    const label = store.approved.get(userId) || store.blocked.get(userId) || (await userLabel(ctx.api, userId))
    store.approved.delete(userId)
    store.blocked.delete(userId)
    ;(allow ? store.approved : store.blocked).set(userId, label)
    await saveStore(ctx.api, admin, store)
    recentRequests.delete(userId)

    await ctx.answerCallbackQuery({ text: allow ? '✅ Ruxsat berildi' : '⛔ Rad etildi' })
    // So'rov xabarida — natijani yozib, tugmalarni olib tashlaymiz; /users ro'yxatida — ro'yxatni yangilaymiz.
    if (ctx.callbackQuery.message?.text?.startsWith('🆕')) {
      await ctx
        .editMessageText(`${ctx.callbackQuery.message.text}\n\n${allow ? '✅ Ruxsat berildi' : '⛔ Rad etildi'}`)
        .catch(() => {})
    } else {
      await ctx.editMessageText(usersText(store), { reply_markup: usersKeyboard(store) }).catch(() => {})
    }

    await ctx.api
      .sendMessage(
        userId,
        allow
          ? "✅ Admin ruxsat berdi! Endi mahsulot rasmini yuborishingiz mumkin (yordam: /start)."
          : '⛔ Admin bu botdan foydalanishga ruxsat bermadi.'
      )
      .catch((e) => console.error('Foydalanuvchiga javob yuborib bo\'lmadi:', e))
  })

  bot.command('users', async (ctx) => {
    const admin = adminId()
    if (!admin || ctx.from.id !== admin) return
    const store = await loadStore(ctx.api, admin, { fresh: true })
    await ctx.reply(usersText(store), { reply_markup: usersKeyboard(store) })
  })
}

async function requestAccess(ctx, admin) {
  const user = ctx.from
  const last = recentRequests.get(user.id)
  if (last && Date.now() - last < REQUEST_COOLDOWN_MS) {
    await ctx.reply("⏳ So'rovingiz adminga yuborilgan — ruxsat berilishini kuting.")
    return
  }
  try {
    await ctx.api.sendMessage(
      admin,
      `🆕 Yangi foydalanuvchi botdan foydalanmoqchi:\n\n👤 ${labelOf(user)}\n🆔 ${user.id}\n\nRuxsat berasizmi?`,
      {
        reply_markup: new InlineKeyboard()
          .text('✅ Ruxsat berish', `acl:allow:${user.id}`)
          .text('⛔ Rad etish', `acl:deny:${user.id}`),
      }
    )
  } catch (e) {
    // Ko'pincha sabab: admin botga hali /start bosmagan (bot unga birinchi bo'lib yoza olmaydi).
    console.error("Adminga so'rov yuborib bo'lmadi:", e)
    await ctx.reply("⚠️ Admin bilan bog'lanib bo'lmadi — birozdan keyin qayta urinib ko'ring.")
    return
  }
  recentRequests.set(user.id, Date.now())
  await ctx.reply(
    "👋 Salom! Bu bot faqat ruxsat berilgan foydalanuvchilar uchun.\n\n" +
      "⏳ So'rovingiz adminga yuborildi — ruxsat berilishi bilan sizga xabar beraman."
  )
}

function usersText(store) {
  if (store.approved.size + store.blocked.size === 0) return "Ro'yxat hali bo'sh — yangi odam botga yozganda sizga so'rov keladi."
  const lines = [`✅ Ruxsat berilganlar: ${store.approved.size}`]
  for (const [id, label] of store.approved) lines.push(`   ${label} (${id})`)
  lines.push('', `⛔ Rad etilganlar: ${store.blocked.size}`)
  for (const [id, label] of store.blocked) lines.push(`   ${label} (${id})`)
  lines.push('', "Tugmani bossangiz — o'sha odamning holati o'zgaradi.")
  return lines.join('\n')
}

function usersKeyboard(store) {
  const kb = new InlineKeyboard()
  for (const [id, label] of store.approved) kb.text(`⛔ ${label}`, `acl:deny:${id}`).row()
  for (const [id, label] of store.blocked) kb.text(`✅ ${label}`, `acl:allow:${id}`).row()
  return kb
}

async function loadStore(api, admin, { fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache
  const chat = await api.getChat(admin)
  const pinned = chat.pinned_message
  const store = { approved: new Map(), blocked: new Map(), messageId: null, loadedAt: Date.now() }
  if (pinned?.from?.is_bot && pinned.text?.startsWith(STORE_HEADER)) {
    store.messageId = pinned.message_id
    for (const line of pinned.text.split('\n')) {
      const m = line.match(/^(✅|⛔) (\d+)(?: — (.*))?$/)
      if (m) (m[1] === '✅' ? store.approved : store.blocked).set(Number(m[2]), m[3] || m[2])
    }
  }
  cache = store
  return store
}

async function saveStore(api, admin, store) {
  const text = renderStore(store)
  if (store.messageId) {
    try {
      await api.editMessageText(admin, store.messageId, text)
      cache = { ...store, loadedAt: Date.now() }
      return
    } catch (e) {
      if (/not modified/i.test(e?.description || e?.message || '')) return
      console.error("Ro'yxat xabarini tahrirlab bo'lmadi — yangisini yaratamiz:", e)
    }
  }
  const msg = await api.sendMessage(admin, text, { disable_notification: true })
  await api.pinChatMessage(admin, msg.message_id, { disable_notification: true })
  store.messageId = msg.message_id
  cache = { ...store, loadedAt: Date.now() }
}

// Telegram xabari 4096 belgigacha — sig'masa ismlarsiz (faqat ID) yozamiz.
function renderStore(store, withLabels = true) {
  const lines = [STORE_HEADER, STORE_NOTE, '']
  const row = (mark, id, label) => (withLabels ? `${mark} ${id} — ${label}` : `${mark} ${id}`)
  for (const [id, label] of store.approved) lines.push(row('✅', id, label))
  for (const [id, label] of store.blocked) lines.push(row('⛔', id, label))
  const text = lines.join('\n')
  return text.length > 4096 && withLabels ? renderStore(store, false) : text
}

function labelOf(user) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
  const full = user.username ? `${name} (@${user.username})` : name
  return full.replace(/\s+/g, ' ').trim().slice(0, 40) || String(user.id)
}

async function userLabel(api, userId) {
  try {
    return labelOf(await api.getChat(userId))
  } catch {
    return String(userId)
  }
}
