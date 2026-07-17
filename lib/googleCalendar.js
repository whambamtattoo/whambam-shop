import { google } from 'googleapis';

const rawKey = process.env.GOOGLE_PRIVATE_KEY || '';

console.log('KEY DIAGNOSTIC:', {
  length: rawKey.length,
  startsWith: rawKey.slice(0, 30),
  endsWith: rawKey.slice(-30),
  hasLiteralBackslashN: rawKey.includes('\\n'),
  hasRealNewline: rawKey.includes('\n'),
});

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: rawKey.replace(/\\n/g, '\n').replace(/\r/g, '').trim(),
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
    requestBody: { timeMin, timeMax, items: calendarIds.map((id) => ({ id })) },
  });

  return calendarIds.flatMap((id) => res.data.calendars[id]?.busy || []);
}
