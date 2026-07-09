import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const { data, error } = await supabase
      .from('stock')
      .select('id, product_id, variant_id, quantity')

    if (error) throw error

    // Convert to a easy lookup object
    const stockMap = {}
    data.forEach(item => {
      stockMap[item.id] = item.quantity
    })

    return res.status(200).json(stockMap)

  } catch (error) {
    console.error('Stock fetch error:', error)
    return res.status(500).json({ error: 'Failed to fetch stock' })
  }
}
