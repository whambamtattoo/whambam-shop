import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    fullName,
    email,
    phone,
    placement,
    colourPreference,
    notes,
    flashSubject,
    size,
    price,
    duration,
    slotDate,
    slotTime,
  } = req.body;

  let bookingId;

  try {
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        full_name: fullName,
        email,
        phone,
        location: 'London',
        tattoo_idea: `Flash design: ${flashSubject || ''}`,
        size,
        budget: price,
        flash_design_ref: flashSubject || null,
        slot_date: slotDate,
        slot_time: slotTime,
        deposit_amount: 100,
        status: 'requested',
      })
      .select('id')
      .single();

    if (error) throw error;
    bookingId = data.id;
  } catch (err) {
    return res.status(500).json({ error: `Booking save failed: ${err.message}` });
  }

  const formattedDate = new Date(`${slotDate}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const confirmUrl = `https://whambam-shop.vercel.app/api/confirm-booking?id=${bookingId}`;

  const subject = `New booking request: ${fullName} — ${formattedDate} ${slotTime}`;

  const text = `
New flash booking request

Name: ${fullName || '-'}
Email: ${email || '-'}
Phone: ${phone || '-'}
Placement: ${placement || '-'}
Colour preference: ${colourPreference || '-'}

Design: ${flashSubject || '-'}
Size: ${size || '-'}
Price: ${price || '-'}
Approx duration: ${duration || '-'}

Requested date: ${formattedDate}
Requested time: ${slotTime || '-'}

Additional notes:
${notes || '-'}

Confirm and send payment link:
${confirmUrl}
  `.trim();

  const html = `
    <div style="background:#f5f5f5; padding:32px; font-family:Arial, sans-serif;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:16px; padding:28px; border:1px solid #eaeaea;">
        <h2 style="margin-top:0; color:#111111;">New flash booking request</h2>
        <div style="margin:20px 0; padding:16px; border:1px solid #eeeeee; border-radius:12px; background:#fafafa; color:#222222; line-height:1.8;">
          <strong>Name:</strong> ${fullName || '-'}<br>
          <strong>Email:</strong> <a href="mailto:${email || ''}">${email || '-'}</a><br>
          <strong>Phone:</strong> ${phone || '-'}<br>
          <strong>Placement:</strong> ${placement || '-'}<br>
          <strong>Colour preference:</strong> ${colourPreference || '-'}<br>
          <strong>Design:</strong> ${flashSubject || '-'}<br>
          <strong>Size:</strong> ${size || '-'}<br>
          <strong>Price:</strong> ${price || '-'}<br>
          <strong>Requested date:</strong> ${formattedDate}<br>
          <strong>Requested time:</strong> ${slotTime || '-'}
        </div>
        <div style="margin:20px 0;">
          <strong style="display:block; margin-bottom:8px; color:#111111;">Additional notes:</strong>
          <div style="padding:16px; border:1px solid #eeeeee; border-radius:12px; background:#fafafa; color:#222222; line-height:1.7;">
            ${(notes || '-').replace(/\n/g, '<br>')}
          </div>
        </div>
        <a href="${confirmUrl}" style="display:inline-block; margin-top:12px; background:#000; color:#fff; padding:14px 24px; border-radius:6px; text-decoration:none; font-weight:bold;">
          Confirm & send payment link
        </a>
      </div>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL,
        to: process.env.BOOKING_REQUEST_NOTIFY_EMAIL,
        subject,
        text,
        html,
        reply_to: email || undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API error: ${response.status} ${errorText}`);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
