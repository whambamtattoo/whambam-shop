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
  }

  return res.status(200).json({ received: true })
}
