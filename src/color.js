// AI natijasidagi mahsulot rangini asl rasmga qaytarish.
//
// Nega kerak: FLUX.2 klein-9b mayda detallarni (logo yozuvi, zamok halqasi, yorliq)
// juda yaxshi saqlaydi, lekin kiyimni qayta chizganda rangni xiralashtiradi —
// sinovda to'q ko'k hudi kulrang-ko'kka aylandi (to'yinganlik ~1.7 marta kamaydi).
// Promptda "rangni o'zgartirma" deyish yordam bermadi, shuning uchun rangni
// natija tayyor bo'lgach o'zimiz tuzatamiz.
//
// Usul (CIELAB'da):
//   1. Natijadagi mahsulot piksellari (oq fondan aniq farq qiladiganlari) ichidan
//      asosiy rang tusini (hue) topamiz.
//   2. Asl rasmning markaziy qismida xuddi shu tusdagi piksellarni olamiz — fon (yog'och
//      shkaf, devor) odatda chetda va boshqa tusda, shuning uchun bu asosan mahsulot.
//   3. Ikkalasining tusi (hue), to'yinganligi (chroma) va yorqinligini (L) solishtirib,
//      natijadagi faqat shu tusdagi piksellarni asl holatga suramiz.
// Xavfsizlik: tuzatish cheklangan (tus ±20°, chroma faqat ×1–1.6, L ±8), oq fon, kulrang/qora
// piksellar va boshqa tusdagi detallar (oq ip, qizil yorliq) umuman tegilmaydi.
// Mahsulot rangsiz (oq/qora/kulrang) bo'lsa yoki tus asl rasmda topilmasa — hech
// narsa o'zgarmaydi.

const HUE_BAND = 25 // asosiy tusdan ± shu daraja ichidagi piksellar "mahsulot rangi"
const MIN_CHROMA = 8 // bundan past — rangsiz (oq, kulrang, qora) piksel
// Faqat yo'qolgan to'yinganlikni qaytaramiz (modelning ma'lum xatosi — xiralashtirish).
// Natija aslidan xira bo'lmasa — umuman tegmaymiz: aksincha holat ko'pincha fon
// aralashganidan bo'ladi, model xatosidan emas.
const MIN_FADE = 1.05 // asl / natija to'yinganligi shundan kam bo'lsa — xiralashish yo'q
const CHROMA_RATIO_MAX = 1.6
const L_SHIFT_MAX = 8
// Model tusni ham siljitadi (sinovda to'q ko'k hudi ±10–15° binafsharangga og'gan).
const MIN_HUE_SHIFT = 4 // bundan kichik farq — ko'zga ko'rinmaydi, tegmaymiz
const HUE_SHIFT_MAX = 20

export async function restoreColors(referenceImage, outputBuffer) {
  const { Jimp } = await import('jimp')
  const out = await Jimp.read(outputBuffer)
  const OD = out.bitmap.data

  // 1) Natijadagi mahsulot piksellari va ularning asosiy tusi
  const product = []
  for (let i = 0; i < OD.length; i += 12) {
    if (nearWhite(OD[i], OD[i + 1], OD[i + 2]) < 40) continue
    product.push(toLch(OD[i], OD[i + 1], OD[i + 2]))
  }
  const chromatic = product.filter((p) => p[1] > MIN_CHROMA)
  if (chromatic.length < product.length * 0.3) return null // rangsiz mahsulot

  const bins = new Array(36).fill(0)
  for (const p of chromatic) bins[Math.floor(p[2] / 10) % 36]++
  const peak = bins.indexOf(Math.max(...bins)) * 10 + 5
  const hue = meanHue(chromatic.filter((p) => hueDiff(p[2], peak) <= HUE_BAND))
  const outBand = chromatic.filter((p) => hueDiff(p[2], hue) <= HUE_BAND)

  // 2) Asl rasmdagi shu rangdagi piksellar — faqat markaziy qismdan: mahsulot odatda
  // markazda, chetlarda esa fon (sinovda krossovka tagligi bilan bir xil tusdagi karton
  // qutilar butun rasmdan olinganda taglikni noto'g'ri xiralashtirgan). Model tusni ham
  // siljitishi mumkin, shuning uchun avval kengroq oraliqda qidirib, asl tusni topamiz.
  const { width: RW, height: RH, data: RD } = referenceImage.bitmap
  const near = []
  let centerPixels = 0
  for (let y = Math.floor(RH * 0.15); y < RH * 0.85; y += 2) {
    for (let x = Math.floor(RW * 0.2); x < RW * 0.8; x += 2) {
      const i = (y * RW + x) * 4
      centerPixels++
      const p = toLch(RD[i], RD[i + 1], RD[i + 2])
      if (p[1] > MIN_CHROMA && hueDiff(p[2], hue) <= HUE_BAND + HUE_SHIFT_MAX) near.push(p)
    }
  }
  const origHue = near.length ? meanHue(near) : hue
  const origBand = near.filter((p) => hueDiff(p[2], origHue) <= HUE_BAND)
  if (origBand.length < centerPixels * 0.05) return null // asl rasmda bu rang deyarli yo'q

  const fade = median(origBand, 1) / median(outBand, 1)
  const chromaRatio = fade >= MIN_FADE ? Math.min(fade, CHROMA_RATIO_MAX) : 1
  // Yorqinlikka faqat xiralashish aniqlanganda ishonamiz (aks holda fon aralashgan bo'lishi mumkin).
  const lShift = chromaRatio > 1 ? clamp(median(origBand, 0) - median(outBand, 0), -L_SHIFT_MAX, L_SHIFT_MAX) : 0
  const shift = signedHueDiff(origHue, hue)
  const hueShift = Math.abs(shift) >= MIN_HUE_SHIFT ? clamp(shift, -HUE_SHIFT_MAX, HUE_SHIFT_MAX) : 0
  if (chromaRatio === 1 && hueShift === 0) return null // tuzatadigan narsa yo'q

  // 3) Faqat shu tusdagi piksellarni suramiz; chegaralarda silliq so'nadi (keskin o'tish bo'lmasin)
  for (let i = 0; i < OD.length; i += 4) {
    const r = OD[i], g = OD[i + 1], b = OD[i + 2]
    if (nearWhite(r, g, b) <= 15) continue // oq fon (rasmning yarmicha) — Lab hisoblamasdan o'tamiz
    const [L, A, B] = toLab(r, g, b)
    const C = Math.hypot(A, B)
    const h = hueOf(A, B)
    const hueWeight = clamp(1 - (hueDiff(h, hue) - 20) / 15, 0, 1) // ±20° to'liq, ±35° dan keyin 0
    const chromaWeight = Math.min(1, C / MIN_CHROMA) // rangsiz piksellar tegilmaydi
    const whiteWeight = clamp((nearWhite(r, g, b) - 15) / 40, 0, 1) // oq fon va yaltiroq joylar tegilmaydi
    const w = hueWeight * chromaWeight * whiteWeight
    if (w <= 0) continue
    const k = 1 + (chromaRatio - 1) * w
    const rot = (hueShift * w * Math.PI) / 180
    const cos = Math.cos(rot), sin = Math.sin(rot)
    const [nr, ng, nb] = fromLab(L + lShift * w, k * (A * cos - B * sin), k * (A * sin + B * cos))
    OD[i] = nr
    OD[i + 1] = ng
    OD[i + 2] = nb
  }
  return { buffer: await out.getBuffer('image/jpeg', { quality: 95 }), chromaRatio, lShift, hueShift, hue }
}

// Tuslar aylana bo'ylab (359° va 1° yonma-yon) — o'rtachasi birlik vektorlar orqali.
function meanHue(points) {
  let x = 0, y = 0
  for (const p of points) {
    x += Math.cos((p[2] * Math.PI) / 180)
    y += Math.sin((p[2] * Math.PI) / 180)
  }
  return hueOf(x, y)
}
function signedHueDiff(to, from) {
  return ((to - from + 540) % 360) - 180
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const nearWhite = (r, g, b) => 255 - Math.min(r, g, b)
const hueOf = (a, b) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
function hueDiff(h1, h2) {
  const d = Math.abs(h1 - h2) % 360
  return d > 180 ? 360 - d : d
}
function median(points, idx) {
  const s = Float64Array.from(points, (p) => p[idx]).sort()
  return s[s.length >> 1]
}

// sRGB (D65) <-> CIELAB. Gamma o'girishlari jadvaldan (har pikselda ** 2.4 sekin).
const LINEAR = Float64Array.from({ length: 256 }, (_, c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
const GAMMA_STEPS = 4096
const GAMMA = Uint8Array.from({ length: GAMMA_STEPS + 1 }, (_, i) => {
  const c = i / GAMMA_STEPS
  return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255)
})
const toLinear = (c) => LINEAR[c]
const toGamma = (c) => GAMMA[Math.round(clamp(c, 0, 1) * GAMMA_STEPS)]
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
const fInv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27))

function toLab(r, g, b) {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b)
  const fx = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047)
  const fy = f(0.2126 * R + 0.7152 * G + 0.0722 * B)
  const fz = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
function toLch(r, g, b) {
  const [L, A, B] = toLab(r, g, b)
  return [L, Math.hypot(A, B), hueOf(A, B)]
}
function fromLab(L, a, b) {
  const fy = (L + 16) / 116
  const x = fInv(fy + a / 500) * 0.95047, y = fInv(fy), z = fInv(fy - b / 200) * 1.08883
  return [
    toGamma(3.2406 * x - 1.5372 * y - 0.4986 * z),
    toGamma(-0.9689 * x + 1.8758 * y + 0.0415 * z),
    toGamma(0.0557 * x - 0.204 * y + 1.057 * z),
  ]
}
