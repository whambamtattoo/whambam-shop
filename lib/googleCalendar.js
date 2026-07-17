import { google } from 'googleapis';

const rawKey = process.env.GOOGLE_PRIVATE_KEY || '';

function formatPrivateKey(key) {
  const cleaned = key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const chunks = cleaned.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${chunks.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: formatPrivateKey(rawKey),
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});

const calendar = google.calendar({ version: 'v3', auth });

export async function getBusyTimes(calendarIds, timeMin, timeMax) {
  try {
    await auth.authorize();
  } catch (err) {
    throw new Error(`Auth failed: ${err.message}`);
  }

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: calendarIds.map((id) => ({ id })),
    },
  });

  const allBusy = calendarIds.flatMap(
    (id) => res.data.calendars[id]?.busy || []
  );

  return allBusy;
}
