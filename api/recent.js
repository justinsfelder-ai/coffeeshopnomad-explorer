// /api/recent.js
//
// Serverless function powering the "recently logged" widget — returns coffee
// shop visits *added to the database* (not necessarily visited) within the
// last 24 hours. Uses Airtable's built-in createdTime, not the visit Date
// field, so this reflects logging activity, not the visit's own date.
//
// Filters server-side via Airtable's filterByFormula so we only ever pull
// the handful of recent records, not the full ~1,200+ row dataset.

import { TABLES, fetchAllRecords, fetchReferenceMaps, resolveVisit } from "./_lib/airtable.js";

const VISIT_FIELDS = ["Coffee Shop", "Year", "Country", "City", "NYC Borough", "Area", "Time (hrs)"];

export default async function handler(req, res) {
  const token = process.env.AIRTABLE_TOKEN;

  if (!token) {
    res.status(500).json({ error: "Server misconfigured: missing Airtable token." });
    return;
  }

  try {
    // IS_AFTER(CREATED_TIME(), DATEADD(NOW(), -24, 'hours')) — Airtable formula,
    // evaluated server-side by Airtable itself, not in this function.
    const filterByFormula = "IS_AFTER(CREATED_TIME(), DATEADD(NOW(), -24, 'hours'))";

    const [maps, visitRecs] = await Promise.all([
      fetchReferenceMaps(token),
      fetchAllRecords(token, TABLES.visits, VISIT_FIELDS, filterByFormula),
    ]);

    const visits = visitRecs
      .map((r) => resolveVisit(r, maps))
      .filter((v) => v.shop && v.city)
      // Most recently added first.
      .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

    // Short cache — this widget is meant to feel current, unlike the full explorer.
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    res.status(200).json({ visits, count: visits.length });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Failed to fetch data. Please try again shortly." });
  }
}
