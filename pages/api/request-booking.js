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
    location,
    flashSubject,
    size,
    price,
    duration,
    slotDate,
    slotTime,
  } = req.body;

  const subject = `New booking request: ${fullName} — ${slotDate} ${slotTime}`;

  const text = `
New flash booking request

Name: ${fullName || '-'}
Email: ${email || '-'}
Phone: ${phone || '-'}
Location: ${location || '-'}

Design: ${flashSubject || '-'}
Size: ${size || '-'}
Price: ${price || '-'}
Approx duration: ${duration || '-'}

Requested date: ${slotDate || '-'}
Requested time: ${slotTime || '-'}
  `.trim();

  const html = `
    <div style="background:#f5f5f5; padding:32px; font-family:Arial, sans-serif;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:16px; padding:28px; border:1px solid #eaeaea;">
        <h2 style="margin-top:0; color:#111111;">New flash booking request</h2>
        <div style="margin:20px 0; padding:16px; border:1px solid #eeeeee; border-radius:12px; background:#fafafa; color:#222222; line-height:1.8;">
          <strong>Name:</strong> ${fullName || '-'}<br>
          <strong>Email:</strong> <a href="mailto:${email || ''}">${email || '-'}</a><br>
          <strong>Phone:</strong> ${phone || '-'}<br>
          <strong>Location:</strong> ${location || '-'}<br>
          <strong>Design:</strong> ${flashSubject || '-'}<br>
          <strong>Size:</strong> ${size || '-'}<br>
          <strong>Price:</strong> ${price || '-'}<br>
          <strong>Approx duration:</strong> ${duration || '-'}<br>
          <strong>Requested date:</strong> ${slotDate || '-'}<br>
          <strong>Requested time:</strong> ${slotTime || '-'}
        </div>
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
        to: process.env.NOTIFICATION_EMAIL,
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
