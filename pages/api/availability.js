import { getBusyTimes } from '../../lib/googleCalendar';

const CALENDAR_IDS = [
  process.env.GOOGLE_CALENDAR_ID_EVENTS,
  process.env.GOOGLE_CALENDAR_ID_ANDY,
  process.env.GOOGLE_CALENDAR_ID_GUESTING,
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  const timeMin = new Date(`${date}T00:00:00`).toISOString();
  const timeMax = new Date(`${date}T23:59:59`).toISOString();

  try {
    const busy = await getBusyTimes(CALENDAR_IDS, timeMin, timeMax);
    res.status(200).json({ date, busy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
