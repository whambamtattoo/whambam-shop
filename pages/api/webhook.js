import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { products } from '../../lib/products'

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


// Black Friday 2026: vouchers bought 27–30 Nov get extra value (see gift voucher plan)
const BLACK_FRIDAY = { start: Date.UTC(2026, 10, 27, 0, 0), end: Date.UTC(2026, 11, 1, 0, 0) }
const BF_BONUS = { 50: 60, 100: 125, 150: 185, 200: 250 }

function thankYouHtml({ name, emailedTo, posted, teeLines, voucherLines }) {
  const p = 'margin:0 0 18px; color:#000000; font-size:16px; line-height:1.55;'
  const btn = "display:inline-block; background:#000000; color:#ffffff; padding:14px 0; width:220px; text-align:center; border-radius:8px; text-decoration:none; text-transform:uppercase; font-family:'Bebas Neue', Impact, 'Arial Narrow', sans-serif; font-size:22px; font-weight:700; letter-spacing:1px;"
  const next = []
  if (emailedTo) next.push(`I'll email the voucher over to <strong>${esc(emailedTo)}</strong> myself, usually the same day (I'm in Wednesday to Saturday).`)
  if (posted) next.push(`I'll get the voucher card in the post to you first class, usually the next working day.`)
  if (teeLines.length) {
    const many = teeLines.length > 1 || /^\d+ ×/.test(teeLines[0])
    const list = teeLines.length > 1 ? `${teeLines.slice(0, -1).join(', ')} and ${teeLines.at(-1)}` : teeLines[0]
    next.push(`You've ordered ${list}. I'll get ${many ? 'them' : 'it'} packed up and posted out to you as soon as I can.`)
  }
  return `
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" rel="stylesheet">
    <div style="background:#ffffff; padding:32px 20px; font-family:Arial, Helvetica, sans-serif;">
      <div style="max-width:560px; margin:0 auto;">
        <p style="${p}">Hey${name ? ` ${esc(name)}` : ''},</p>
        <p style="${p}">Cheers for your order, really appreciate it!!</p>
        ${voucherLines ? `<p style="${p}">${voucherLines}</p>` : ''}
        ${next.map((t) => `<p style="${p}">${t}</p>`).join('')}
        ${voucherLines ? `<p style="${p}">Vouchers are good for 12 months and can go towards any tattoo with me, flash or custom. When whoever's got it is ready, they can book a flash design or send me an enquiry on the website.</p>
        <p style="margin:0 0 32px;"><a href="https://www.whambamtattoo.com/flash-tattoos-london" style="${btn}">SEE THE FLASH</a></p>` : ''}
        <p style="${p}">Any questions, just reply to this email.</p>
        <p style="${p} margin-bottom:0;">Cheers,<br>Andy</p>
        <div style="margin-top:6px; color:#000000; font-size:14px; line-height:1.5;">
          <div style="width:60px; border-top:1px solid #000000; margin:6px 0 10px;"></div>
          <strong>WHAMBAM TATTOO</strong> - American traditional &amp; script<br>
          Good Times Tattoo, 1st Floor, 8 Lower Clapton Road, London E5 0PD &middot; 020 7739 2438<br>
          <a href="https://www.whambamtattoo.com/" style="color:#1a0dab;">WEBSITE</a> &middot;
          <a href="https://www.instagram.com/whambamtattoo/" style="color:#1a0dab;">INSTAGRAM</a> &middot;
          <a href="https://www.facebook.com/whambamtattoo/" style="color:#1a0dab;">FACEBOOK</a>
        </div>
      </div>
    </div>`
}

// Sends the buyer a thank-you in Andy's voice for shop orders (vouchers and tees).
export function buildThankYou(session) {
  const items = JSON.parse(session.metadata?.items || '[]')
  if (!items.length) return null
  const to = session.customer_details?.email
  if (!to) return null
  const field = (key) => session.custom_fields?.find((f) => f.key === key)?.text?.value || ''
  const name = (session.customer_details?.name || '').trim().split(/\s+/)[0] || ''
  const vouchers = items.filter((i) => i.variantId?.startsWith('voucher'))
  const created = (session.created || Date.now() / 1000) * 1000
  const isBF = created >= BLACK_FRIDAY.start && created < BLACK_FRIDAY.end
  const voucherLines = vouchers.length
    ? vouchers.map((v) => {
        const paid = Number(v.variantId.replace('voucher-', ''))
        const qty = v.quantity > 1 ? `${v.quantity} × ` : 'a '
        const bonus = isBF && BF_BONUS[paid]
        return bonus
          ? `You've got ${qty}£${paid} gift voucher, and because you bought it over Black Friday weekend it'll be made out for <strong>£${bonus}</strong>.`
          : `You've got ${qty}£${paid} gift voucher.`
      }).join('<br>')
    : ''
  const emailed = vouchers.some((v) => v.delivery === 'email')
  const html = thankYouHtml({
    name,
    emailedTo: emailed ? field('send_to') || to : '',
    posted: vouchers.some((v) => v.delivery !== 'email'),
    teeLines: items
      .filter((i) => !i.variantId?.startsWith('voucher'))
      .map((i) => {
        const product = products.find((p) => p.id === i.productId)
        const variant = product?.variants.find((v) => v.id === i.variantId)
        const title = product ? `${i.quantity > 1 ? '' : 'the '}${esc(product.name.replace(/^WHAMBAM\s+/i, 'Whambam '))}${product.color ? ` in ${product.color.toLowerCase()}` : ''}` : 'a tee'
        const size = variant ? `, size ${esc(variant.label)}` : ''
        return `${i.quantity > 1 ? `${i.quantity} × ` : ''}<strong>${title}${size}</strong>`
      }),
    voucherLines,
  })
  return { to, subject: vouchers.length ? 'Cheers for your gift voucher order!' : 'Cheers for your order!', html }
}

async function sendThankYou(session) {
  if (!process.env.RESEND_API_KEY) return
  const email = buildThankYou(session)
  if (!email) return
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.FROM_EMAIL, ...email, reply_to: process.env.NOTIFICATION_EMAIL || undefined }),
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

    try {
      await sendThankYou(session)
    } catch (err) {
      console.error('Thank-you email error:', err)
    }
  }

  return res.status(200).json({ received: true })
}
