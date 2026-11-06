// pages/api/google-reviews.js
//
// Reviews for the Whambam site's reviews section.
//
// Primary source: Google Business Profile API (all reviews, newest first,
// plus Andy's replies). Needs owner login via OAuth:
//   GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN
//   (optional) GBP_ACCOUNT_ID, GBP_LOCATION_ID — skips the lookup if set
//
// Backup source + extras: Google Places API (New). Gives the Maps link and
// Google's AI review summary (when Google has made one), and the 5 reviews
// Google picks if the Business Profile call ever fails.
//   GOOGLE_PLACES_API_KEY, GOOGLE_PLACE_ID
//
// Response is cached at Vercel's edge for 6 hours.

const ALLOWED_ORIGINS = [
  "https://www.whambamtattoo.com",
  "https://whambamtattoo.com",
];
// Framer preview and branch links, so the section can be checked before publishing.
const ALLOWED_ORIGIN_PATTERN = /^https:\/\/[a-z0-9-]+\.framer\.(app|website)$/;

const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const MIN_STARS = 4;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGIN_PATTERN.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

function relativeTime(iso) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days < 7) return days === 1 ? "a day ago" : `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return weeks === 1 ? "a week ago" : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (days < 365) return months <= 1 ? "a month ago" : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "a year ago" : `${years} years ago`;
}

// Google sometimes stores "translated + original" text in one comment.
function cleanComment(text) {
  if (!text) return "";
  const original = text.split("(Original)");
  if (original.length > 1) return original[1].trim();
  return text.split("(Translated by Google)")[0].trim();
}

async function getAccessToken() {
  const { GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN } = process.env;
  if (!GBP_CLIENT_ID || !GBP_CLIENT_SECRET || !GBP_REFRESH_TOKEN) {
    throw new Error("Business Profile env vars not set");
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GBP_CLIENT_ID.trim(),
      client_secret: GBP_CLIENT_SECRET.trim(),
      refresh_token: GBP_REFRESH_TOKEN.trim(),
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`token: ${j.error || r.status} ${j.error_description || ""}`.trim());
  return j.access_token;
}

async function gget(url, token) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${new URL(url).hostname}: ${r.status} ${j.error?.message || ""}`.trim());
  return j;
}

// Returns { accountId, locationId } — from env if set, otherwise looked up.
async function findLocation(token) {
  const envAcc = process.env.GBP_ACCOUNT_ID?.trim();
  const envLoc = process.env.GBP_LOCATION_ID?.trim();
  if (envAcc && envLoc) return { accountId: envAcc, locationId: envLoc };

  const { accounts = [] } = await gget(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    token
  );
  for (const acc of accounts) {
    const { locations = [] } = await gget(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations?readMask=name,title,metadata&pageSize=100`,
      token
    );
    const placeId = process.env.GOOGLE_PLACE_ID?.trim();
    const match =
      locations.find((l) => placeId && l.metadata?.placeId === placeId) || locations[0];
    if (match) {
      return {
        accountId: acc.name.split("/")[1],
        locationId: match.name.split("/")[1],
      };
    }
  }
  throw new Error("No Business Profile location found for this Google account");
}

async function fromBusinessProfile() {
  const token = await getAccessToken();
  const { accountId, locationId } = await findLocation(token);
  const base = `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews`;

  let all = [];
  let pageToken = "";
  let meta = {};
  for (let i = 0; i < 5; i++) {
    const q = new URLSearchParams({ pageSize: "50", orderBy: "updateTime desc" });
    if (pageToken) q.set("pageToken", pageToken);
    const page = await gget(`${base}?${q}`, token);
    if (i === 0) meta = { averageRating: page.averageRating, totalReviewCount: page.totalReviewCount };
    all = all.concat(page.reviews || []);
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }

  const reviews = all
    .map((r) => ({
      author: r.reviewer?.isAnonymous ? "Anonymous" : r.reviewer?.displayName || "Anonymous",
      photo: r.reviewer?.profilePhotoUrl || null,
      rating: STARS[r.starRating] || 0,
      text: cleanComment(r.comment),
      relativeTime: relativeTime(r.createTime),
      createTime: r.createTime || null,
      profileUrl: null,
      reply: r.reviewReply?.comment ? cleanComment(r.reviewReply.comment) : null,
    }))
    .filter((r) => r.text && r.rating >= MIN_STARS)
    .sort((a, b) => (b.createTime || "").localeCompare(a.createTime || ""));

  return {
    overallRating: meta.averageRating ?? null,
    totalReviews: meta.totalReviewCount ?? all.length,
    reviews,
  };
}

async function fromPlaces() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  if (!apiKey || !placeId) throw new Error("Places env vars not set");
  const r = await fetch(`https://places.googleapis.com/v1/places/${placeId.trim()}`, {
    headers: {
      "X-Goog-Api-Key": apiKey.trim(),
      "X-Goog-FieldMask": "displayName,rating,userRatingCount,reviews,googleMapsUri,reviewSummary",
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`places: ${r.status} ${data.error?.message || ""}`.trim());

  const summary = data.reviewSummary?.text?.text
    ? {
        text: data.reviewSummary.text.text,
        disclosure: data.reviewSummary.disclosureText?.text || "Summarized with Gemini",
        reviewsUri: data.reviewSummary.reviewsUri || data.googleMapsUri || null,
      }
    : null;

  return {
    businessName: data.displayName?.text ?? "",
    overallRating: data.rating ?? null,
    totalReviews: data.userRatingCount ?? null,
    googleMapsUri: data.googleMapsUri ?? null,
    summary,
    reviews: (data.reviews ?? [])
      .filter((x) => x.text?.text && x.rating >= MIN_STARS)
      .map((x) => ({
        author: x.authorAttribution?.displayName ?? "Anonymous",
        photo: x.authorAttribution?.photoUri ?? null,
        rating: x.rating,
        text: x.text.text,
        relativeTime: x.relativePublishTimeDescription,
        profileUrl: x.authorAttribution?.uri ?? null,
        reply: null,
      })),
  };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const [gbp, places] = await Promise.allSettled([fromBusinessProfile(), fromPlaces()]);

  if (gbp.status === "rejected" && places.status === "rejected") {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({
      error: "Could not load reviews",
      businessProfile: String(gbp.reason?.message || gbp.reason),
      places: String(places.reason?.message || places.reason),
    });
    return;
  }

  const p = places.status === "fulfilled" ? places.value : {};
  const g = gbp.status === "fulfilled" ? gbp.value : null;

  const body = {
    businessName: p.businessName || "WHAMBAM TATTOO",
    overallRating: g?.overallRating ?? p.overallRating ?? null,
    totalReviews: g?.totalReviews ?? p.totalReviews ?? null,
    googleMapsUri: p.googleMapsUri || null,
    summary: p.summary || null,
    source: g ? "business-profile" : "places",
    reviews: (g?.reviews?.length ? g.reviews : p.reviews || []).map(({ createTime, ...r }) => r),
  };

  // Shows why a source failed, without exposing any keys: add ?debug=1
  if (req.query.debug) {
    body.debug = {
      businessProfile: gbp.status === "fulfilled" ? "ok" : String(gbp.reason?.message || gbp.reason),
      places: places.status === "fulfilled" ? "ok" : String(places.reason?.message || places.reason),
    };
    res.setHeader("Cache-Control", "no-store");
  } else {
    // 6 hours at Vercel's edge, serve the old copy for up to 12 more while refreshing.
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=43200");
  }

  res.status(200).json(body);
}
