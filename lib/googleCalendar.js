import { google } from 'googleapis';

const credentialsJson = Buffer.from(
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64,
  'base64'
).toString('utf8');

const credentials = JSON.parse(credentialsJson);

const auth = new google.auth.JWT({
  email: credentials.client_email,
  key: credentials.private_key,
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
