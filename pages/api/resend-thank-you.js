import Stripe from 'stripe'
import { buildThankYou } from './webhook'

// One-off: send the shop thank-you email for an order that came in before the
// automatic email existed. POST { email } — finds that buyer's paid shop orders
// from the last 7 days in Stripe and emails the buyer (only ever to their own
// checkout email, and only once per order).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!email) return res.status(400).json({ error: 'email needed' })

  const since = Math.floor(Date.now() / 1000) - 7 * 24 * 3600
  const sent = []
  for await (const s of stripe.checkout.sessions.list({ created: { gte: since }, limit: 100 })) {
    if (s.status !== 'complete' || s.payment_status !== 'paid') continue
    if ((s.customer_details?.email || '').toLowerCase() !== email) continue
    if (s.metadata?.type === 'booking' || s.metadata?.thank_you_sent) continue
    const msg = buildThankYou(s)
    if (!msg) continue
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.FROM_EMAIL, ...msg, reply_to: process.env.NOTIFICATION_EMAIL || undefined }),
    })
    if (!r.ok) return res.status(502).json({ error: `Resend ${r.status}` })
    await stripe.checkout.sessions.update(s.id, { metadata: { ...s.metadata, thank_you_sent: '1' } })
    sent.push({ amount: (s.amount_total || 0) / 100, subject: msg.subject })
  }
  return res.status(200).json({ sent })
}
