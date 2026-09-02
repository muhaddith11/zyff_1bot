// Rasm AI uchun promptlar. Ikkala holatda ham: asl mahsulotni O'ZGARTIRMASLIK
// (rang, mato, naqsh, logo saqlanadi), faqat fon + taqdimotni yangilash.

export const PROMPTS = {
  // Kiyim — ko'rinmas maniken (ghost mannequin / hollow-man) ustida kiyilgandek.
  clothing: `Professional e-commerce product photo of this garment.
Completely remove the hanger, any wooden shelf, cabinet or room, and the entire background. Remove all paper price tags and hang tags and any hanger clip.
Present the garment as worn on an INVISIBLE ghost mannequin (hollow-man effect): filled with natural human body volume so the shoulders, chest and torso look worn by a person, the sleeves and hem naturally rounded, the neckline open and shaped. No visible person, no mannequin, no skin — only the garment holding a worn 3D shape.
Place it centered on a pure solid white (#FFFFFF) seamless studio background with a soft, subtle drop shadow beneath.
Keep EXACTLY the same fabric, color, stripe pattern, knit/weave texture, collar, sleeve seams, cuffs, hem and any small brand tab or label on the garment — do NOT redesign, recolor or restyle the clothing.
Front view, centered, soft even studio lighting, sharp focus, high detail, clean catalog style, photorealistic.`,

  // Poyabzal / tapichka — oppoq fonda, do'kon stelajidagidek tik turgan holatda.
  footwear: `Professional e-commerce product photo of this footwear (shoes / slippers).
Completely remove the original background, floor, shelf clutter and any price tags or labels.
Place the footwear on a pure solid white (#FFFFFF) seamless studio background, positioned upright and neatly as if displayed on a clean store shelf, shown from a slight 3/4 front angle, with a soft, subtle drop shadow beneath.
Keep EXACTLY the same colors, materials, texture, sole, stitching, logo and all details — do NOT redesign or recolor.
Centered, soft even studio lighting, sharp focus, high detail, clean catalog style, photorealistic.`,
}
