// /api/visits.js
//
// Serverless function (runs on Vercel's servers, never in the visitor's browser).
// Fetches every visit record from Airtable, strips it down to public-safe fields,
// and returns it as JSON. The Airtable token lives only in Vercel's environment
// variables (AIRTABLE_TOKEN) — it is never sent to the client.
//
// Deliberately excludes: Cost, and any other field not explicitly whitelisted below.

const BASE_ID = "appAs0RvyPOqaEO8X";
const TABLE_NAME = "Coffee Time Tracker";

// Only these fields are ever returned to the public. Add to this list deliberately.
const PUBLIC_FIELDS = [
  "Coffee Shop",
  "Year",
  "Country",
  "City",
  "NYC Borough",
  "Area",
  "Time (hrs)",
];

function firstLinkedName(value) {
  // Lookup/linked-record fields from Airtable's REST API come back as an array
  // of {id, name} objects (or occasionally plain strings). Normalize to a name.
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value[0];
    if (!first) return null;
    return typeof first === "string" ? first : first.name || null;
  }
  return typeof value === "string" ? value : null;
}

export default async function handler(req, res) {
  const token = process.env.AIRTABLE_TOKEN;

  if (!token) {
    res.status(500).json({ error: "Server misconfigured: missing Airtable token." });
    return;
  }

  try {
    const records = [];
    let offset = null;

    do {
      const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}`);
      url.searchParams.set("pageSize", "100");
      PUBLIC_FIELDS.forEach((f) => url.searchParams.append("fields[]", f));
      if (offset) url.searchParams.set("offset", offset);

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Airtable API error ${response.status}: ${body}`);
      }

      const data = await response.json();
      records.push(...data.records);
      offset = data.offset || null;
    } while (offset);

    const visits = records
      .map((r) => {
        const f = r.fields;
        return {
          shop: firstLinkedName(f["Coffee Shop"]),
          year: f["Year"] || null,
          country: firstLinkedName(f["Country"]),
          city: firstLinkedName(f["City"]),
          borough: firstLinkedName(f["NYC Borough"]),
          area: firstLinkedName(f["Area"]),
          hours: typeof f["Time (hrs)"] === "number" ? f["Time (hrs)"] : 0,
        };
      })
      // Drop any row missing its core identity — nothing useful to show without a shop/city.
      .filter((v) => v.shop && v.city);

    // Cache at the edge for 5 minutes — this is a personal dataset that changes
    // occasionally, not a live feed. Reduces Airtable API calls on repeat visits.
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ visits, count: visits.length });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Failed to fetch data. Please try again shortly." });
  }
}
