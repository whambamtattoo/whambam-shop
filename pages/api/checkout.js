import Stripe from 'stripe'
import { products } from '../../lib/products'
import { createClient } from '@supabase/supabase-js'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
const SHIPPING_RATES = {
  uk_free: process.env.STRIPE_SHIPPING_UK_FREE,
  uk_standard: process.env.STRIPE_SHIPPING_UK_STANDARD,
  international: process.env.STRIPE_SHIPPING_INTL,
  international_tracked: process.env.STRIPE_SHIPPING_INTL_TRACKED,
}
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const { items } = req.body
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items in cart' })
    }
    const lineItems = []
    let hasPhysicalItems = false
    let hasVouchers = false
    let hasPostedVouchers = false
    let hasEmailedVouchers = false
    for (const cartItem of items) {
      const product = products.find(p => p.id === cartItem.productId)
      if (!product) continue
      const variant = product.variants.find(v => v.id === cartItem.variantId)
      if (!variant) continue
      if (product.category === 'tee') {
        const { data: stockData } = await supabase
          .from('stock')
          .select('quantity')
          .eq('id', `${cartItem.productId}-${cartItem.variantId}`)
          .single()
        if (!stockData || stockData.quantity < cartItem.quantity) {
          return res.status(400).json({
            error: `Sorry, ${product.name} (${variant.label}) is out of stock.`
          })
        }
        hasPhysicalItems = true
      } else {
        hasVouchers = true
        if (cartItem.delivery === 'email') hasEmailedVouchers = true
        else hasPostedVouchers = true
      }
      let itemName = product.name
      if (product.color) itemName += ` — ${product.color}`
      if (product.category === 'tee') itemName += ` (${variant.label})`
      if (product.category === 'voucher') {
        itemName += ` (${variant.label}) – ${cartItem.delivery === 'email' ? 'emailed' : 'posted'}`
      }
      lineItems.push({
        price_data: {
          currency: 'gbp',
          product_data: {
            name: itemName,
            description: product.category === 'voucher'
              ? (cartItem.delivery === 'email'
                  ? 'Emailed over as a printable voucher. Valid 12 months, redeemable against any tattoo by Whambam Tattoo.'
                  : 'Voucher card posted out. Valid 12 months, redeemable against any tattoo by Whambam Tattoo.')
              : product.description,
            images: product.image ? [product.image] : [],
          },
          unit_amount: variant.price * 100,
        },
        quantity: cartItem.quantity || 1,
      })
    }
    // Only ask for an address and postage when something actually gets posted
    const needsPosting = hasPhysicalItems || hasPostedVouchers
    let shippingOptions
    if (hasPhysicalItems) {
      shippingOptions = [
        { shipping_rate: SHIPPING_RATES.uk_standard },
        { shipping_rate: SHIPPING_RATES.international_tracked },
      ]
    } else {
      shippingOptions = [
        { shipping_rate: SHIPPING_RATES.uk_free },
        { shipping_rate: SHIPPING_RATES.international },
      ]
    }

    const sessionParams = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `https://www.whambamtattoo.com/?success=true#shop`,
      cancel_url: `https://www.whambamtattoo.com/?cancelled=true#shop`,
      metadata: {
        source: 'whambamtattoo.com',
        items: JSON.stringify(items.map(i => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          ...(i.delivery ? { delivery: i.delivery } : {}),
        }))),
      },
    }

    if (needsPosting) {
      sessionParams.shipping_address_collection = {
        allowed_countries: ['GB', 'US', 'CA', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'PT', 'SE', 'NO', 'DK', 'FI', 'IE', 'NZ', 'JP'],
      }
      sessionParams.shipping_options = shippingOptions
    }

    if (hasEmailedVouchers) {
      sessionParams.custom_fields = [
        {
          key: 'recipient_name',
          label: { type: 'custom', custom: 'Name on the voucher' },
          type: 'text',
          optional: true,
          text: { maximum_length: 60 },
        },
        {
          key: 'send_to',
          label: { type: 'custom', custom: 'Email it to (blank = your email)' },
          type: 'text',
          optional: true,
          text: { maximum_length: 120 },
        },
        {
          key: 'message',
          label: { type: 'custom', custom: 'Message for the voucher' },
          type: 'text',
          optional: true,
          text: { maximum_length: 200 },
        },
      ]
      sessionParams.custom_text = {
        submit: {
          message: "Emailed vouchers come straight from Andy, usually the same day (Wed–Sat).",
        },
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)
    return res.status(200).json({ url: session.url })
  } catch (error) {
    console.error('Stripe error:', error)
    return res.status(500).json({ error: 'Failed to create checkout session' })
  }
}
