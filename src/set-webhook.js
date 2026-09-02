// Vercel'ga deploy qilgandan keyin BIR MARTA ishga tushiring:
//   node src/set-webhook.js https://<app>.vercel.app
// yoki webhookni o'chirish uchun:
//   node src/set-webhook.js --delete
import 'dotenv/config'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error("❌ TELEGRAM_BOT_TOKEN yo'q (.env yoki env)")
  process.exit(1)
}

const arg = process.argv[2]
if (!arg) {
  console.error('Foydalanish:\n  node src/set-webhook.js https://<app>.vercel.app\n  node src/set-webhook.js --delete')
  process.exit(1)
}

const api = (m, p) => fetch(`https://api.telegram.org/bot${token}/${m}?${p}`).then((r) => r.json())

if (arg === '--delete') {
  console.log(await api('deleteWebhook', 'drop_pending_updates=true'))
  process.exit(0)
}

const url = `${arg.replace(/\/$/, '')}/api/bot`
const params = new URLSearchParams({ url, drop_pending_updates: 'true' })
const secret = process.env.WEBHOOK_SECRET
if (secret) params.set('secret_token', secret)

console.log('Webhook o‘rnatilmoqda:', url)
console.log(await api('setWebhook', params.toString()))
console.log('\nTekshirish:')
console.log(await api('getWebhookInfo', ''))
