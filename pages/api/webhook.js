import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

export const config = {
  api: {
    bodyParser: false,
  },
}

async function buffer(readable) {
  const chunks = []
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

const esc = (v = '') =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Emails Andy when a gift voucher is bought, with who it goes to and how.
async function notifyVoucherOrder(session) {
  const items = JSON.parse(session.metadata?.items || '[]')
  const vouchers = items.filter((i) => i.variantId?.startsWith('voucher'))
  if (!vouchers.length || !process.env.NOTIFICATION_EMAIL || !process.env.RESEND_API_KEY) return

  const field = (key) => session.custom_fields?.find((f) => f.key === key)?.text?.value || ''
  const buyerEmail = session.customer_details?.email || ''
  const buyerName = session.customer_details?.name || ''
  const emailed = vouchers.some((v) => v.delivery === 'email')
  const lines = vouchers
    .map((v) => `<li>£${v.variantId.replace('voucher-', '')} × ${v.quantity || 1} – <strong>${v.delivery === 'email' ? 'EMAIL' : 'POST'}</strong></li>`)
    .join('')
  const addr = session.shipping_details?.address || session.collected_information?.shipping_details?.address
  const addrText = addr
    ? [session.shipping_details?.name, addr.line1, addr.line2, addr.city, addr.postal_code, addr.country].filter(Boolean).map(esc).join('<br>')
    : ''

  const html = `<div style="font-family:Arial, sans-serif; font-size:15px; line-height:1.5;">
    <p>New gift voucher order (£${(session.amount_total || 0) / 100} paid).</p>
    <ul>${lines}</ul>
    <p><strong>Bought by:</strong> ${esc(buyerName)} – ${esc(buyerEmail)}</p>
    ${emailed ? `<p><strong>Name on voucher:</strong> ${esc(field('recipient_name')) || '–'}<br>
    <strong>Email it to:</strong> ${esc(field('send_to') || buyerEmail)}<br>
    <strong>Message:</strong> ${esc(field('message')) || '–'}</p>` : ''}
    ${addrText ? `<p><strong>Post to:</strong><br>${addrText}</p>` : ''}
  </div>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL,
      to: process.env.NOTIFICATION_EMAIL,
      subject: `Gift voucher order – ${emailed ? 'to email' : 'to post'}`,
      html,
      reply_to: buyerEmail || undefined,
    }),
  })
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const buf = await buffer(req)
  const sig = req.headers['stripe-signature']

  let event
  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Webhook signature error:', err.message)
    return res.status(400).json({ error: `Webhook Error: ${err.message}` })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object

    if (session.metadata.type === 'booking') {
      try {
        const {
          fullName, email, phone, location, tattooIdea, size,
          budget, flashDesignRef, slotDate, slotTime,
        } = session.metadata

        await supabase.from('bookings').insert({
          full_name: fullName,
          email,
          phone,
          location,
          tattoo_idea: tattooIdea,
          size,
          budget: budget || null,
          flash_design_ref: flashDesignRef || null,
          slot_date: slotDate,
          slot_time: slotTime,
          deposit_amount: 100,
          stripe_payment_id: session.payment_intent,
          status: 'confirmed',
        })
        console.log('Booking saved:', email)
      } catch (err) {
        console.error('Booking insert error:', err)
      }
      return res.status(200).json({ received: true })
    }

    try {
      const items = JSON.parse(session.metadata.items || '[]')
      for (const item of items) {
        // Only decrement stock for tees, not vouchers
        if (!item.variantId.startsWith('voucher')) {
          const stockId = `${item.productId}-${item.variantId}`

          // Get current stock
          const { data: stockData } = await supabase
            .from('stock')
            .select('quantity')
            .eq('id', stockId)
            .single()
          if (stockData) {
            const newQuantity = Math.max(0, stockData.quantity - (item.quantity || 1))

            await supabase
              .from('stock')
              .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
              .eq('id', stockId)
            console.log(`Stock updated: ${stockId} -> ${newQuantity}`)
          }
        }
      }
    } catch (err) {
      console.error('Stock update error:', err)
    }

    try {
      await notifyVoucherOrder(session)
    } catch (err) {
      console.error('Voucher notification error:', err)
    }
  }

  return res.status(200).json({ received: true })
}
