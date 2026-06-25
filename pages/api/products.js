import { products } from '../../lib/products'

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.whambamtattoo.com')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  return res.status(200).json(products)
}
