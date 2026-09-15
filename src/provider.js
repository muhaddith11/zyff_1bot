// Rasm-tahrirlash provayderi. IMAGE_PROVIDER env orqali tanlanadi:
//   gemini    — Google Gemini "nano banana" (tavsiya: arzon, sifatli, oddiy)
//   replicate — Black Forest Labs Flux Kontext (global, kredit bilan)
//
// Interfeys: editImage({ buffer, mimeType, prompt }) -> { buffer, mimeType }
//   buffer   — kiruvchi rasm baytlari (Telegram'dan yuklangan)
//   mimeType — 'image/jpeg' yoki 'image/png'
//   qaytadi  — yangi (tahrirlangan) rasm baytlari

export async function editImage({ buffer, mimeType, prompt }) {
  const provider = (process.env.IMAGE_PROVIDER || 'gemini').toLowerCase()
  if (provider === 'replicate') return editWithReplicate({ buffer, mimeType, prompt })
  if (provider === 'gemini') return editWithGemini({ buffer, mimeType, prompt })
  throw new Error(`Noma'lum IMAGE_PROVIDER: ${provider} (gemini yoki replicate bo'lsin)`)
}

// ── Gemini (nano banana) ───────────────────────────────────────────────────
// Diqqat: Gemini rasm modellari bepul tarifda YO'Q (429, "limit: 0") — kalit
// loyihasiga AI Studio'da billing ulangan bo'lishi shart.
async function editWithGemini({ buffer, mimeType, prompt }) {
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
