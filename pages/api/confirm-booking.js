import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) {
    return res.status(400).send('Missing booking id');
  }
  try {
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !booking) {
      return res.status(404).send('Booking not found');
    }
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: { name: 'Tattoo Booking Deposit' },
            unit_amount: 10000,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'booking',
        fullName: booking.full_name,
        email: booking.email,
        phone: booking.phone || '',
        location: booking.location || '',
        tattooIdea: booking.tattoo_idea || '',
        size: booking.size || '',
        budget: booking.budget || '',
        flashDesignRef: booking.flash_design_ref || '',
        slotDate: booking.slot_date,
        slotTime: booking.slot_time,
        bookingId: String(booking.id),
      },
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/booking-confirmed`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/book`,
    });
    await supabase
      .from('bookings')
      .update({ status: 'awaiting_deposit', stripe_payment_id: session.id })
      .eq('id', id);
    const emailHtml = `
      <div style="background:#f5f5f5; padding:32px; font-family:Arial, sans-serif;">
        <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:16px; padding:28px; border:1px solid #eaeaea;">
          <h2 style="margin-top:0; color:#111111; font-family:'Bebas Neue', sans-serif; letter-spacing:1px; font-weight:400; font-size:26px;">Your booking is ready to confirm</h2>
          <p style="color:#222222;">Hi ${booking.full_name},</p>
          <p style="color:#222222;">
            Great news — your flash booking request has been approved. To lock in your slot, please pay the £100 deposit using the link below.
          </p>
          <a href="${session.url}" style="display:inline-block; margin-top:12px; background:#000; color:#fff; padding:14px 24px; border-radius:6px; text-decoration:none; font-family:'Bebas Neue', sans-serif; letter-spacing:1px; font-size:18px;">
            Pay £100 deposit
          </a>
          <p style="color:#222222; margin-top:24px;">
            Once paid, your booking will be fully confirmed. Any questions, just reply to this email.
          </p>
          <p style="margin-top:24px; color:#222222;">Cheers,<br>Andy</p>
        </div>
      </div>
    `;
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL,
        to: booking.email,
        subject: 'Your booking is ready — pay your deposit to confirm',
        html: emailHtml,
        reply_to: process.env.NOTIFICATION_EMAIL,
      }),
    });
    if (!emailRes.ok) {
      const errText = await emailRes.text();
      throw new Error(`Resend error: ${errText}`);
    }
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 60px;">
          <h2>Payment link sent to ${booking.full_name}</h2>
          <p>${booking.email}</p>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
}
