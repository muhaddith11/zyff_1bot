// Vercel serverless webhook handler.
// Telegram bu manzilga update yuboradi: https://<app>.vercel.app/api/bot
import 'dotenv/config'
import { bot } from '../src/bot.js'

let initialized = false

export default async function handler(req, res) {
  // Brauzerda ochilsa / GET — health check
  if (req.method !== 'POST') {
    res.status(200).send('Product Photo Bot webhook ✅')
    return
  }

  // (ixtiyoriy) sirli token — begona POST'lar botni ishlata olmasin
  const secret = process.env.WEBHOOK_SECRET
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    res.status(401).send('unauthorized')
    return
  }

  try {
    if (!initialized) {
      await bot.init() // bir marta getMe (sovuq startda)
      initialized = true
    }
    await bot.handleUpdate(req.body)
  } catch (e) {
    // Telegram takror yubormasligi uchun xatoda ham 200 qaytaramiz.
    console.error('handleUpdate xatosi:', e)
  }
  res.status(200).send('ok')
}
