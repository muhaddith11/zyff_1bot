// Rasm AI uchun promptlar. Ikkala holatda ham: asl mahsulotni O'ZGARTIRMASLIK
// (rang, mato, naqsh, logo saqlanadi), faqat fon + taqdimotni yangilash.
//
// Tartib muhim (FLUX.2 klein sinovi): avval nima saqlanishi, keyin taqdimot, oxirida
// qisqa inkorlar. Shu tartib maniken bo'yni chiqishi va yeng uzunligi o'zgarishini yo'qotdi.

export const PROMPTS = {
  // Kiyim — ko'rinmas maniken (ghost mannequin / hollow-man) ustida kiyilgandek.
  clothing: `Professional e-commerce ghost-mannequin product photo of the exact garment from the input image.
Keep the garment exactly as it is in the photo: same garment type, same sleeve length, same body length and fit, same fabric color and brightness (no yellow or beige tint), same stripe or print pattern and spacing, same knit or weave texture, collar, seams, cuffs, hem and small brand tab.
Show it with a natural worn 3D shape, as if worn by an invisible body: filled shoulders and chest, rounded sleeves and hem. The neck opening is hollow: inside it you see the inner back of the garment (inner collar and neck label), and above the collar there is only the white background.
Remove the hanger, shelf, cabinet, room and all price tags or hang tags.
Pure solid white (#FFFFFF) seamless studio background, soft subtle shadow beneath, front view, centered, soft even studio lighting. Photorealistic, sharp focus, high detail, clean catalog style.
No mannequin, no bust, no neck form, no person.`,

  // Poyabzal / tapichka — oppoq fonda, do'kon stelajidagidek tik turgan holatda.
  // "feet"/"hands" so'zlarini qo'shmang: Cloudflare xavfsizlik filtri (3030) natijani bloklab qo'ydi.
  footwear: `Professional e-commerce product photo of the exact footwear (shoes, sneakers or slippers) from the input image.
Keep the footwear exactly as it is in the photo: same model and shape, same colors and brightness (no tint), same materials and texture, sole, stitching, laces or straps, logo and every small detail.
Show only the footwear, standing upright and neatly as displayed in a store, from a slight 3/4 front angle.
Remove the original background, floor, shelf, other products and any price tags or hang tags.
Pure solid white (#FFFFFF) seamless studio background, soft subtle shadow beneath, centered, soft even studio lighting. Photorealistic, sharp focus, high detail, clean catalog style.`,
}
