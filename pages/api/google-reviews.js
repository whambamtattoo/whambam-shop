// pages/api/google-reviews.js
//
// Server-side proxy for the Google Places API (New).
// Keeps your API key secret and lets the Framer component fetch clean JSON.
//
// Set these two env vars in Vercel (Project Settings > Environment Variables):
//   GOOGLE_PLACES_API_KEY   -> your restricted API key
//   GOOGLE_PLACE_ID         -> ChIJ3beQTsUddkgR7efuYc6gW50 (Whambam Tattoo)

const ALLOWED_ORIGIN = "https://www.whambamtattoo.com";

export default async function handler(req, res) {
  // Allow your live site to call this endpoint (cross-origin, since Framer
  // hosts the front end and Vercel hosts this API separately).
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    res.status(500).json({ error: "Missing GOOGLE_PLACES_API_KEY or GOOGLE_PLACE_ID env vars" });
    return;
  }

  const fieldMask = "displayName,rating,userRatingCount,reviews,googleMapsUri";

  try {
    const googleRes = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
    });

    if (!googleRes.ok) {
      const errText = await googleRes.text();
      res.status(googleRes.status).json({ error: "Google Places API error", detail: errText });
      return;
    }

    const data = await googleRes.json();

    // TEMPORARY DEBUG MODE — visit the URL with ?debug=1 on the end to see
    // exactly what Google sent back, before any filtering happens.
    if (req.query.debug) {
      res.status(200).json({
        rawReviewsFromGoogle: data.reviews ?? "MISSING - Google did not return a reviews field at all",
        fullResponseKeys: Object.keys(data),
      });
      return;
    }

    // Trim to just what the widget needs, and only 4-5★ reviews with actual text.
    const reviews = (data.reviews ?? [])
      .filter((r) => r.text?.text && r.rating >= 4)
      .map((r) => ({
        author: r.authorAttribution?.displayName ?? "Anonymous",
        photo: r.authorAttribution?.photoUri ?? null,
        rating: r.rating,
        text: r.text.text,
        relativeTime: r.relativePublishTimeDescription,
        profileUrl: r.authorAttribution?.uri ?? null,
      }));

    // Cache for 6 hours at the edge — reviews don't change often, and this
    // keeps you well within the free monthly Google API quota.
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=43200");

    res.status(200).json({
      businessName: data.displayName?.text ?? "",
      overallRating: data.rating ?? null,
      totalReviews: data.userRatingCount ?? null,
      googleMapsUri: data.googleMapsUri ?? null,
      reviews,
    });
  } catch (err) {
    res.status(500).json({ error: "Fetch failed", detail: String(err) });
  }
}
