import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabase
      .from('flash_designs')
      .select('id, image_url, subject, size, duration_minutes')
      .eq('featured', true)
      .eq('available', true);

    if (error) throw error;

    // Shuffle so the order is different each time it's fetched
    const shuffled = [...data].sort(() => Math.random() - 0.5);

    res.status(200).json({ designs: shuffled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
