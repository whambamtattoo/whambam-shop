import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fullName, email, phone, location, tattooIdea, size, budget, flashDesignRef, slotDate, slotTime } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: { name: 'Tattoo Booking Deposit' },
            unit_amount: 10000, // £100 in pence
          },
          quantity: 1,
        },
      ],
      metadata: {
        fullName,
        email,
        phone,
        location,
        tattooIdea,
        size,
        budget: budget || '',
        flashDesignRef: flashDesignRef || '',
        slotDate,
        slotTime,
      },
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/booking-confirmed`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/book`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
