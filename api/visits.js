// /api/visits.js
//
// Serverless function (runs on Vercel's servers, never in the visitor's browser).
// Fetches every visit record from Airtable, resolves linked-record IDs to their
// display names, and returns JSON. The Airtable token lives only in Vercel's
// environment variables (AIRTABLE_TOKEN) — it is never sent to the client.
//
// Deliberately excludes: Cost, and any other field not explicitly requested below.

import { TABLES, fetchAllRecords, fetchReferenceMaps, resolveVisit } from "./_lib/airtable.js";

const VISIT_FIELDS = ["Coffee Shop", "Year", "Country", "City", "NYC Borough", "Area", "Time (hrs)"];

export default async function handler(req, res) {
  const token = process.env.AIRTABLE_TOKEN;

  if (!token) {
    res.status(500).json({ error: "Server misconfigured: missing Airtable token." });
    return;
  }

  try {
    const [maps, visitRecs] = await Promise.all([
      fetchReferenceMaps(token),
      fetchAllRecords(token, TABLES.visits, VISIT_FIELDS),
    ]);

    const visits = visitRecs
      .map((r) => resolveVisit(r, maps))
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
