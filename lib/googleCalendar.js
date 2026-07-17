import { google } from 'googleapis';

const b64 = process.env.GCAL_CREDS_B64 || '';

let auth;
try {
  const credentialsJson = Buffer.from(b64, 'base64').toString('utf8');
  const credentials = JSON.parse(credentialsJson);

  auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
} catch (err) {
  const decoded = Buffer.from(b64, 'base64').toString('utf8');
  throw new Error(
    `Credential parse failed: ${err.message} | b64Length: ${b64.length} | decodedStart: ${decoded.slice(0, 50)}`
  );
}

const calendar = google.calendar({ version: 'v3', auth });

export async function getBusyTimes(calendarIds, timeMin, timeMax, debug = false) {
  try {
    await auth.authorize();
  } catch (err) {
    throw new Error(`Auth failed: ${err.message}`);
  }

  const res = await calendar.freebusy.query({
    requestBody: { timeMin, timeMax, items: calendarIds.map((id) => ({ id })) },
  });

  if (debug) {
    return res.data.calendars;
  }

  return calendarIds.flatMap((id) => res.data.calendars[id]?.busy || []);
}
