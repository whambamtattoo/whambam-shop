import Stripe from 'stripe'
import { products } from '../../lib/products'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

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

    for (const cartItem of items) {
      const product = products.find(p => p.id === cartItem.productId)
      if (!product) continue

      const variant = product.variants.find(v => v.id === cartItem.variantId)
      if (!variant) continue

      if (product.category === 'voucher') {
        hasVouchers = true
      } else {
        hasPhysicalItems = true
      }

      let itemName = product.name
      if (product.color) itemName += ` — ${product.color}`
      if (product.category === 'tee') itemName += ` (${variant.label})`
      if (product.category === 'voucher') itemName += ` (${variant.label})`

      lineItems.push({
        price_data: {
          currency: 'gbp',
          product_data: {
            name: itemName,
            description: product.description,
          },
          unit_amount: variant.price * 100,
        },
        quantity: cartItem.quantity || 1,
      })
    }

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

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      shipping_address_collection: {
        allowed_countries: ['GB', 'US', 'CA', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'PT', 'SE', 'NO', 'DK', 'FI', 'IE', 'NZ', 'JP'],
      },
      shipping_options: shippingOptions,
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/shop?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/shop?cancelled=true`,
      metadata: {
        source: 'whambamtattoo.com'
      }
    })

    return res.status(200).json({ url: session.url })

  } catch (error) {
    console.error('Stripe error:', error)
    return res.status(500).json({ error: 'Failed to create checkout session' })
  }
}
