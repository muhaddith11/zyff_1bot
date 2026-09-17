// Rasm AI uchun promptlar. Har ikki turda ham: asl mahsulotni O'ZGARTIRMASLIK
// (rang, mato, naqsh, logo saqlanadi), faqat fon + taqdimotni yangilash.
//
// Tartib muhim (FLUX.2 klein sinovi): avval nima saqlanishi, keyin taqdimot, oxirida
// qisqa inkorlar. Shu tartib maniken bo'yni chiqishi va yeng uzunligi o'zgarishini yo'qotdi.
//
// Tuzilma: PROMPTS[kind][angle] — bot.js foydalanuvchidan ikkalasini ham so'raydi.

export const PROMPTS = {
  clothing: {
    // Old tomon — ko'rinmas maniken (ghost mannequin / hollow-man) ustida kiyilgandek.
    front: `Professional e-commerce ghost-mannequin product photo of the exact garment from the input image, seen from the FRONT.
Keep the garment exactly as it is in the photo: same garment type, same sleeve length, same body length and fit, same fabric color and brightness (no yellow or beige tint), same stripe or print pattern and spacing, same knit or weave texture, collar, seams, cuffs, hem and small brand tab.
Show it with a natural worn 3D shape, as if worn by an invisible body: filled shoulders and chest, rounded sleeves and hem. The neck opening is hollow: inside it you see the inner back of the garment (inner collar and neck label), and above the collar there is only the white background.
Remove the hanger, shelf, cabinet, room and all price tags or hang tags. If the photo shows a real person wearing or holding the garment, treat only the garment as the product: completely ignore and remove the person's face, skin, hair and identity — the output must not include any part of a real human.
Pure solid white (#FFFFFF) seamless studio background, soft subtle shadow beneath, front view, centered, soft even studio lighting. Photorealistic, sharp focus, high detail, clean catalog style.
No mannequin, no bust, no neck form, no person, no back view.`,

    // Orqa tomon — xuddi shu ghost-mannequin, orqadan ko'rinishi.
    back: `Professional e-commerce ghost-mannequin product photo of the exact garment from the input image, seen from the BACK.
Keep the garment exactly as it is in the photo: same garment type, same sleeve length, same body length and fit, same fabric color and brightness (no yellow or beige tint), same stripe or print pattern and spacing, same knit or weave texture, seams, cuffs, hem and small brand label.
Show the back of the garment with a natural worn 3D shape, as if worn by an invisible body seen from behind: filled shoulders and back, rounded sleeves and hem. The neck opening is hollow: inside it you see the inner front of the collar, and above it there is only the white background.
Remove the hanger, shelf, cabinet, room and all price tags or hang tags. If the photo shows a real person wearing or holding the garment, treat only the garment as the product: completely ignore and remove the person's face, skin, hair and identity — the output must not include any part of a real human.
Pure solid white (#FFFFFF) seamless studio background, soft subtle shadow beneath, back view, centered, soft even studio lighting. Photorealistic, sharp focus, high detail, clean catalog style.
No mannequin, no bust, no neck form, no person, no front view.`,
  },

  // Faqat fonni oqlash — kiyim/poyabzalga xos qayta chizish YO'Q, rasmning o'zi
  // (poza, burchak, kadr, hatto odam bo'lsa ham) o'zgarishsiz qoladi.
  background: {
    default: `Background replacement only — this is NOT a redesign task.
Keep absolutely everything in this exact photo unchanged: the same product (and the same person, if one is visible, in the exact same pose), the same angle, framing, crop, zoom level, colors, lighting and shadows on the subject, and every detail, tag or label.
Do not redesign, recolor, reshape, straighten or reinterpret anything in the foreground. Do not add a mannequin. Do not change the pose or the camera angle.
The ONLY change: replace the original background (wall, floor, shelf, hanger, room, other objects) with a pure solid white (#FFFFFF) seamless studio background, with a soft, subtle contact shadow beneath the subject so it still looks grounded.
Photorealistic, clean seamless edge between the subject and the new background, no artifacts, no leftover pieces of the old background.`,
  },

  // Kiyim/poyabzal bo'lmagan narsalar uchun (sumka, aksessuar, shlyapa va h.k.) —
  // umumiy "studio rasm" qayta chizish, turga xos shakl talablarisiz.
  other: {
    default: `Professional e-commerce product photo of the exact product from the input image.
Keep the product exactly as it is: same shape, same colors and brightness (no tint), same materials, texture, pattern, logo and every small detail.
Show only the product, centered and neatly presented in its natural standing or resting position.
Remove the original background, floor, shelf, other objects and any price tags or hang tags. If the photo shows a real person holding or wearing the product, treat only the product as the subject: completely ignore and remove the person — the output must not include any part of a real human.
Pure solid white (#FFFFFF) seamless studio background, soft subtle shadow beneath, centered, soft even studio lighting. Photorealistic, sharp focus, high detail, clean catalog style.`,
  },

  footwear: {
    // Umumiy ko'rinish — 3/4 burchak, javondagidek (avvalgi yagona variant).
    overall: `Professional e-commerce product photo of the exact footwear (shoes, sneakers or slippers) from the input image.
Keep the footwear exactly as it is in the photo: same model and shape, same colors and brightness (no tint), same materials and texture, sole, stitching, laces or straps, logo and every small detail.
Show only the footwear, standing upright and neatly as displayed in a store, from a slight 3/4 front angle.
Remove the original background, floor, shelf, other products and any price tags or hang tags. If the photo shows a real person wearing or holding the footwear, treat only the footwear as the product: completely ignore and remove the person — the output must not include any part of a real human.
Pure solid white (#FFFFFF) seamless studio background, soft subtle shadow beneath, centered, soft even studio lighting. Photorealistic, sharp focus, high detail, clean catalog style.`,

    // Yon tomon — toza profil (90°).
    side: `Professional e-commerce product photo of the exact footwear (shoes, sneakers or slippers) from the input image, seen from a pure SIDE PROFILE angle (90 degrees, facing left).
Keep the footwear exactly as it is in the photo: same model and shape, same colors and brightness (no tint), same materials and texture, sole, stitching, laces or straps, logo and every small detail.
Show only the footwear in full side profile, standing upright and neatly as displayed in a store.
Remove the original background, floor, shelf, other products and any price tags or hang tags. If the photo shows a real person wearing or holding the footwear, treat only the footwear as the product: completely ignore and remove the person — the output must not include any part of a real human.
Pure solid white (#FFFFFF) seamless studio background, soft subtle shadow beneath, centered, soft even studio lighting. Photorealistic, sharp focus, high detail, clean catalog style.`,

    // Old tomon — tumshuq kameraga qarab turibdi.
    front: `Professional e-commerce product photo of the exact footwear (shoes, sneakers or slippers) from the input image, seen from a straight-on FRONT angle (toe facing the camera).
Keep the footwear exactly as it is in the photo: same model and shape, same colors and brightness (no tint), same materials and texture, sole, stitching, laces or straps, logo and every small detail.
Show only the footwear from the front, standing upright and neatly as displayed in a store.
Remove the original background, floor, shelf, other products and any price tags or hang tags. If the photo shows a real person wearing or holding the footwear, treat only the footwear as the product: completely ignore and remove the person — the output must not include any part of a real human.
Pure solid white (#FFFFFF) seamless studio background, soft subtle shadow beneath, centered, soft even studio lighting. Photorealistic, sharp focus, high detail, clean catalog style.`,
  },
}

// "feet"/"hands" so'zlarini promptlarga qo'shmang: Cloudflare xavfsizlik filtri
// (kod 3030, "output flagged") bunday so'zlarda oddiy mahsulot rasmini ham bloklab qo'ygan.

export const ANGLE_LABELS = {
  clothing: { front: '🔵 Old tomon', back: '🔵 Orqa tomon' },
  footwear: { overall: '🔵 Umumiy ko\'rinish', side: '🔵 Yon tomon', front: '🔵 Old tomon' },
  background: { default: '🔄 Qayta urinish' }, // faqat xato bo'lganda ko'rsatiladi (angleKeyboard qayta ishlatiladi)
  other: { default: '🔄 Qayta urinish' }, // xuddi background kabi — bitta bosqich, burchak yo'q
}

// Foydalanuvchiga tanlovni tasvirlash uchun (masalan "batch" taklifida): "Kiyim (old tomon)".
export const KIND_LABEL = { clothing: 'Kiyim', footwear: 'Poyabzal', background: 'Faqat fon oq', other: 'Boshqa mahsulot' }
export const ANGLE_TEXT = {
  clothing: { front: 'old tomon', back: 'orqa tomon' },
  footwear: { overall: 'umumiy', side: 'yon tomon', front: 'old tomon' },
}
export function choiceLabel(kind, angle) {
  const angleText = ANGLE_TEXT[kind]?.[angle]
  return angleText ? `${KIND_LABEL[kind]} (${angleText})` : KIND_LABEL[kind]
}
