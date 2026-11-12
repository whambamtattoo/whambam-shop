import { createClient } from '@supabase/supabase-js';
import { listEvents } from '../../lib/googleCalendar';

// Runs once a day (see vercel.json). Looks at Andy's calendar for appointments
// that finished in the last day, finds the client's email in the event
// description, and sends them a thank-you + Google review request.
// Each event is only ever emailed once (tracked in the review_requests table).
//
// Skip an event: put "noreview" anywhere in its description.
// Test without sending: /api/send-review-requests?dryRun=1 (with the cron secret).

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID_ANDY;
const REVIEW_LINK =
  'https://search.google.com/local/writereview?placeid=ChIJ3beQTsUddkgR7efuYc6gW50';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const NOT_A_NAME = new Set([
  'tattoo', 'consult', 'consultation', 'flash', 'session', 'touch', 'touchup',
  'touch-up', 'appointment', 'booking', 'client', 'custom', 'deposit', 'guest',
]);

function firstName(title = '') {
  const word = title.trim().split(/[\s\-–—:,/|]+/)[0] || '';
  if (!/^[A-Za-zÀ-ÿ']{2,}$/.test(word) || NOT_A_NAME.has(word.toLowerCase())) return null;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function clientEmail(event) {
  const desc = (event.description || '').replace(/<[^>]+>/g, ' ');
  const fromDesc = desc.match(EMAIL_RE)?.[0];
  if (fromDesc) return fromDesc.toLowerCase();
  const guest = (event.attendees || []).find((a) => !a.self && !a.organizer && a.email);
  return guest ? guest.email.toLowerCase() : null;
}

function emailHtml(name) {
  return `
    <div style="background:#f5f5f5; padding:32px; font-family:Arial, sans-serif;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border-radius:16px; padding:28px; border:1px solid #eaeaea;">
        <p style="color:#222222;">Hey${name ? ` ${name}` : ''},</p>
        <p style="color:#222222;">
          Thanks for coming in yesterday, it was good to tattoo you. Hope it's healing well.
          If you've got any questions about aftercare, just reply to this.
        </p>
        <p style="color:#222222;">
          If you've got a minute, a quick Google review would really help me out. It's how most new people find me.
        </p>
        <a href="${REVIEW_LINK}" style="display:inline-block; margin-top:8px; background:#000; color:#fff; padding:14px 24px; border-radius:6px; text-decoration:none; font-weight:bold;">
          Leave a review
        </a>
        <p style="margin-top:24px; color:#222222;">Cheers,<br>Andy<br>Whambam Tattoo</p>
      </div>
    </div>
  `;
}

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL,
      to,
      subject,
      html,
      reply_to: process.env.NOTIFICATION_EMAIL,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  if (!CALENDAR_ID) {
    return res.status(500).json({ error: 'GOOGLE_CALENDAR_ID_ANDY not set' });
  }

  const dryRun = req.query.dryRun === '1';
  // Runs at ~10am UK. Window = appointments that ended 12–36 hours ago,
  // i.e. roughly "yesterday". Back-to-back windows, so nothing is missed.
  const now = Date.now();
  const windowStart = new Date(now - 36 * 3600 * 1000);
  const windowEnd = new Date(now - 12 * 3600 * 1000);

  try {
    // Pull a bit wider than the window, then filter on end time.
    const events = await listEvents(
      CALENDAR_ID,
      new Date(windowStart.getTime() - 24 * 3600 * 1000).toISOString(),
      windowEnd.toISOString()
    );

    const results = [];
    for (const event of events) {
      if (event.status === 'cancelled' || !event.end?.dateTime) continue; // skip all-day events
      const ended = new Date(event.end.dateTime);
      if (ended < windowStart || ended > windowEnd) continue;

      const title = event.summary || '(no title)';
      if (/noreview/i.test(event.description || '')) {
        results.push({ title, skipped: 'noreview' });
        continue;
      }
      const to = clientEmail(event);
      if (!to) {
        results.push({ title, skipped: 'no email in description' });
        continue;
      }

      const { data: already } = await supabase
        .from('review_requests')
        .select('event_id')
        .eq('event_id', event.id)
        .maybeSingle();
      if (already) {
        results.push({ title, to, skipped: 'already sent' });
        continue;
      }

      if (dryRun) {
        results.push({ title, to, name: firstName(title), wouldSend: true });
        continue;
      }

      await sendEmail({ to, subject: 'Thanks for coming in', html: emailHtml(firstName(title)) });
      await supabase.from('review_requests').insert({
        event_id: event.id,
        email: to,
        event_title: title,
        appointment_end: event.end.dateTime,
      });
      results.push({ title, to, sent: true });
    }

    // Morning summary to Andy, only when something happened.
    if (!dryRun && results.length && process.env.NOTIFICATION_EMAIL) {
      const lines = results
        .map((r) => `<li>${r.title} – ${r.sent ? `sent to ${r.to}` : `not sent (${r.skipped})`}</li>`)
        .join('');
      await sendEmail({
        to: process.env.NOTIFICATION_EMAIL,
        subject: 'Review requests sent this morning',
        html: `<div style="font-family:Arial, sans-serif;"><p>Yesterday's appointments:</p><ul>${lines}</ul>
               <p style="color:#666;">To get one sent next time, put the client's email in the calendar event's description.</p></div>`,
      });
    }

    return res.status(200).json({ dryRun, window: { from: windowStart, to: windowEnd }, results });
  } catch (err) {
    console.error('review requests error', err);
    return res.status(500).json({ error: err.message });
  }
}
