// Rasm-tahrirlash provayderi. IMAGE_PROVIDER env orqali tanlanadi:
//   cloudflare — Workers AI FLUX.2 [klein] (kuniga 10 000 neuron bepul, keyin Workers Paid)
//   gemini     — Google Gemini "nano banana" (sifatli, lekin billing shart)
//   replicate  — Black Forest Labs Flux Kontext (global, kredit bilan)
//
// Interfeys: editImage({ buffer, mimeType, prompt }) -> { buffer, mimeType }
//   buffer   — kiruvchi rasm baytlari (Telegram'dan yuklangan)
//   mimeType — 'image/jpeg' yoki 'image/png'
//   qaytadi  — yangi (tahrirlangan) rasm baytlari
import { restoreColors } from './color.js'

export async function editImage({ buffer, mimeType, prompt, signal }) {
  const provider = (process.env.IMAGE_PROVIDER || 'gemini').toLowerCase()
  if (provider === 'cloudflare') return editWithCloudflare({ buffer, prompt, signal })
  if (provider === 'replicate') return editWithReplicate({ buffer, mimeType, prompt })
  if (provider === 'gemini') return editWithGemini({ buffer, mimeType, prompt, signal })
  throw new Error(`Noma'lum IMAGE_PROVIDER: ${provider} (cloudflare, gemini yoki replicate bo'lsin)`)
}

// ── Cloudflare Workers AI (FLUX.2 klein) ───────────────────────────────────
// Model: klein-9b (default). klein-4b arzonroq (≈110 neuron/rasm), lekin mayda
// detallarni buzardi — sinovda logo yozuvi yo'qolgan/buzilgan ("ZYFF STUDIO" ->
// "ZYFF BTUUS"), zamok halqasi oddiy zamokka aylangan, yorliq yozuvi o'chgan.
// klein-9b ≈1800 neuron/rasm (≈$0.02; kuniga 10 000 neuron bepul, keyin pullik).
// Arzon rejimga qaytish: CLOUDFLARE_MODEL=@cf/black-forest-labs/flux-2-klein-4b
//
// Aniqlik uchun 3 ta kiruvchi rasm yuboramiz (prepareReferences):
//   input_image_0 — butun rasm (uzun tomoni 1024px gacha);
//   input_image_1/2 — rasmning ikki yarmi kattalashtirib: model logo, yozuv, zamok,
//   tugma kabi mayda detallarni shulardan aniq ko'chiradi (sinovda 3/3 to'g'ri,
//   ularsiz esa har safar biror detal o'zgardi).
// Natija rangi esa restoreColors() bilan asl rasmga qaytariladi (src/color.js).
//
// DIQQAT: bu yerda ICHKI qayta urinish YO'Q. Avval 3030 (xavfsizlik filtri)
// xatosida bir marta avtomatik qayta urinardik — lekin bu umumiy vaqtni ikki
// baravar oshirib, Vercel'ning 60s function limitiga tushib qolgan (foydalanuvchi
// "Ishlanmoqda..." holatida abadiy qolib ketgan: funksiya javob yuborishga
// ulgurmasdan o'ldirilgan). Endi bitta urinish — muvaffaqiyatsiz bo'lsa darhol
// aniq xato qaytadi, bot.js esa "Qayta urinish" tugmasini qayta ko'rsatadi
// (foydalanuvchi bir bosishda YANGI so'rov qiladi — yangi, to'liq 60s bilan).
async function editWithCloudflare({ buffer, prompt, signal }) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!account || !token) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN env'da yo'q — dash.cloudflare.com → Workers AI → Use REST API")
  }
  const model = process.env.CLOUDFLARE_MODEL || '@cf/black-forest-labs/flux-2-klein-9b'
  const ref = await prepareReferences(buffer)

  const form = new FormData()
  form.append('prompt', withDetailReferences(prompt))
  ref.inputs.forEach((jpeg, i) => {
    form.append(`input_image_${i}`, new Blob([jpeg], { type: 'image/jpeg' }), `input-${i}.jpg`)
  })
  form.append('width', String(ref.width))
  form.append('height', String(ref.height))

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal,
  })
  const text = await res.text().catch(() => '')
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  const b64 = json?.result?.image
  if (res.ok && b64) {
    const output = Buffer.from(b64, 'base64')
    // Rang tuzatish ixtiyoriy yaxshilash — xato bersa ham AI natijasini yo'qotmaymiz.
    const fixed = await restoreColors(ref.colorReference, output).catch((e) => {
      console.error('Rang tuzatish xatosi:', e)
      return null
    })
    if (fixed) return { buffer: fixed.buffer, mimeType: 'image/jpeg' }
    return { buffer: output, mimeType: b64.startsWith('/9j/') ? 'image/jpeg' : 'image/png' }
  }

  console.error(`Cloudflare ${res.status} (${model}):`, text.slice(0, 2000)) // to'liq javob — Vercel loglarida
  const msg = json?.errors?.map((e) => e.message).join('; ') || text.slice(0, 300)
  if (/4006|daily free allocation/i.test(msg)) {
    throw new Error("Bugungi bepul limit tugadi (kuniga 10 000 neuron) — ertaga qayta urinib ko'ring.")
  }
  // 3030: xavfsizlik filtri oddiy mahsulot rasmini ham tasodifan bloklaydi (sinovda ~3 dan 1;
  // odam yuzi/portret kabi rasmlarda ehtimol yanada yuqori).
  if (/3030|flagged/i.test(msg)) {
    throw new Error('Rasm AI xavfsizlik filtridan o\'tmadi — "Qayta urinish" tugmasini bosing yoki boshqa rasm yuboring.')
  }
  // 3040: klein-9b bir vaqtda ko'p so'rov kelganda "Capacity temporarily exceeded" qaytaradi
  // (sinovda 10 ta parallel so'rovdan 5 tasi) — bir necha soniyadan keyin o'tib ketadi.
  if (/3040|capacity/i.test(msg)) {
    throw new Error('AI serveri hozir band — bir necha soniyadan keyin "Qayta urinish" tugmasini bosing.')
  }
  throw new Error(`Cloudflare ${res.status}: ${msg}`)
}

// Avval kiruvchi rasm 496px gacha kichraytirilardi (eski "<512x512" cheklovi) —
// mayda detallar buzilishining asosiy sababi shu edi. 2026-10-09 da tekshirildi:
// klein endi 1024px kiruvchi rasmni ham qabul qiladi.
const REF_MAX = 1024
const OUTPUT_AREA = 1024 * 1024 // natija ≈1 megapiksel, asl rasm proporsiyasida
const DETAIL_PART = 0.55 // har bir yarim rasmning ulushi (o'rtada 10% ustma-ust)

async function prepareReferences(buffer) {
  const { Jimp } = await import('jimp')
  const img = await Jimp.read(buffer)
  // "Fayl" qilib yuborilgan 12 MP rasmda har bir kesimni to'liq o'lchamdan kichraytirish
  // sekin (jimp sof JS) — avval bir marta 2048px gacha tushiramiz, bu detallar uchun yetarli.
  fitInto(img, REF_MAX * 2)
  const { width: W, height: H } = img

  const full = img.clone()
  fitInto(full, REF_MAX)
  const inputs = [await full.getBuffer('image/jpeg', { quality: 92 })]

  // Uzun tomon bo'yicha ikki yarim: tik rasmda yuqori/past, yotiq rasmda chap/o'ng.
  const tall = H >= W
  const len = tall ? H : W
  const part = Math.round(len * DETAIL_PART)
  for (const start of [0, len - part]) {
    const crop = img.clone().crop(tall ? { x: 0, y: start, w: W, h: part } : { x: start, y: 0, w: part, h: H })
    fitInto(crop, REF_MAX)
    inputs.push(await crop.getBuffer('image/jpeg', { quality: 92 }))
  }

  // Natija o'lchami: asl proporsiya (2:3 dan 3:2 gacha cheklangan), ≈1 MP, 16 ga karrali.
  const aspect = Math.min(1.5, Math.max(2 / 3, W / H))
  const width = Math.round(Math.sqrt(OUTPUT_AREA * aspect) / 16) * 16
  const height = Math.round(Math.sqrt(OUTPUT_AREA / aspect) / 16) * 16

  return { inputs, width, height, colorReference: full }
}

// Uzun tomonini `max` px gacha kichraytiradi (kattalashtirmaydi), tomonlar 16 ga karrali.
function fitInto(img, max) {
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const w = Math.max(16, Math.floor((img.width * scale) / 16) * 16)
  const h = Math.max(16, Math.floor((img.height * scale) / 16) * 16)
  img.resize({ w, h })
}

// Promptning birinchi qatoridan keyin — 2- va 3-rasm nima ekanini tushuntiramiz.
function withDetailReferences(prompt) {
  const note =
    'Image 1 is the full photo. Images 2 and 3 are close-up crops of the SAME photo (first half and second half) — ' +
    'use them only as an exact reference for small details: logos and their lettering, prints, zippers and zipper pulls, ' +
    'buttons, laces, drawstrings, labels and tabs. Copy every one of these details exactly, letter for letter, with the same ' +
    'shape, size, position and color. The result is one single product photo — never show the crops as separate pictures.'
  const nl = prompt.indexOf('\n')
  return nl === -1 ? `${prompt}\n${note}` : `${prompt.slice(0, nl)}\n${note}${prompt.slice(nl)}`
}

// ── Gemini (nano banana) ───────────────────────────────────────────────────
// Diqqat: Gemini rasm modellari bepul tarifda YO'Q (429, "limit: 0") — kalit
// loyihasiga AI Studio'da billing ulangan bo'lishi shart.
async function editWithGemini({ buffer, mimeType, prompt, signal }) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY .env'da yo'q — https://aistudio.google.com/apikey")
  // gemini-2.5-flash-image 2026-10-02 da o'chiriladi. Arzonrog'i: gemini-3.1-flash-lite-image
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-image'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
        ],
      },
    ],
    // TEXT ham so'raymiz — barcha rasm modellari qo'llaydi; rad etsa sababini matnda ko'ramiz.
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    console.error(`Gemini ${res.status} (${model}):`, t) // to'liq javob — Vercel loglarida
    if (res.status === 429) {
      throw new Error(
        /limit: 0\b/.test(t)
          ? `Gemini: "${model}" bepul tarifda ishlamaydi — AI Studio'da billing ulash kerak.`
          : "Gemini limiti vaqtincha tugadi — 1 daqiqadan keyin qayta urinib ko'ring."
      )
    }
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 400)}`)
  }
  const json = await res.json()
  const parts = json?.candidates?.[0]?.content?.parts || []
  // Gemini 3 "thinking" oraliq rasmlarini (thought: true) o'tkazib, oxirgi rasmni olamiz.
  const part = parts.filter((p) => (p.inlineData || p.inline_data) && !p.thought).pop()
  const inline = part?.inlineData || part?.inline_data
  if (!inline?.data) {
    const txt = parts.map((p) => p.text).filter(Boolean).join(' ').slice(0, 300)
    throw new Error(`Gemini rasm qaytarmadi. ${txt || JSON.stringify(json).slice(0, 300)}`)
  }
  return {
    buffer: Buffer.from(inline.data, 'base64'),
    mimeType: inline.mimeType || inline.mime_type || 'image/png',
  }
}

// ── Replicate (Flux Kontext) ────────────────────────────────────────────────
async function editWithReplicate({ buffer, mimeType, prompt }) {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) throw new Error("REPLICATE_API_TOKEN .env'da yo'q — https://replicate.com/account/api-tokens")
  const model = process.env.REPLICATE_MODEL || 'black-forest-labs/flux-kontext-pro'
  const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`

  // Prefer: wait — natijani sinxron (poll'siz) kutamiz.
  let res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify({
      input: {
        prompt,
        input_image: dataUri,
        aspect_ratio: 'match_input_image',
        output_format: 'png',
        safety_tolerance: 2,
      },
    }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Replicate ${res.status}: ${t.slice(0, 400)}`)
  }
  let pred = await res.json()

  // Prefer:wait odatda tugagan holatni qaytaradi; aks holda poll qilamiz.
  const deadline = Date.now() + 120_000
  while (pred.status && !['succeeded', 'failed', 'canceled'].includes(pred.status)) {
    if (Date.now() > deadline) throw new Error('Replicate: vaqt tugadi')
    await new Promise((r) => setTimeout(r, 1500))
    const p = await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${token}` } })
    pred = await p.json()
  }
  if (pred.status !== 'succeeded') throw new Error(`Replicate: ${pred.error || pred.status}`)

  const out = Array.isArray(pred.output) ? pred.output[0] : pred.output
  if (!out) throw new Error('Replicate natija bermadi')
  const img = await fetch(out)
  const ab = await img.arrayBuffer()
  return { buffer: Buffer.from(ab), mimeType: 'image/png' }
}
