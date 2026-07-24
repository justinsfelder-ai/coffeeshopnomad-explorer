// /api/visits.js
//
// Serverless function (runs on Vercel's servers, never in the visitor's browser).
// Fetches every visit record from Airtable, resolves linked-record IDs to their
// display names, strips everything down to public-safe fields, and returns JSON.
// The Airtable token lives only in Vercel's environment variables (AIRTABLE_TOKEN)
// — it is never sent to the client.
//
// Deliberately excludes: Cost, and any other field not explicitly whitelisted below.
//
// IMPORTANT: Airtable's raw REST API returns linked-record fields as bare record
// IDs (e.g. "recXXXXXXXXXXXXXX"), not resolved display names. This function fetches
// the small reference tables separately and builds ID -> name maps to resolve them.

const BASE_ID = "appAs0RvyPOqaEO8X";

const TABLES = {
  visits: "Coffee Time Tracker",
  countries: "Countries",
  cities: "Cities",
  boroughs: "NYC Boroughs",
  areas: "Areas",
  shops: "Coffee Shop Profiles",
};

// Primary (name) field for each reference table.
const PRIMARY_FIELD = {
  countries: "Country",
  cities: "City",
  boroughs: "Borough",
  areas: "Area",
  shops: "Coffee Shop",
};

const VISIT_FIELDS = ["Coffee Shop", "Year", "Country", "City", "NYC Borough", "Area", "Time (hrs)"];

async function fetchAllRecords(token, tableName, fields) {
  const records = [];
  let offset = null;

  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("pageSize", "100");
    if (fields) fields.forEach((f) => url.searchParams.append("fields[]", f));
    if (offset) url.searchParams.set("offset", offset);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Airtable API error ${response.status} for ${tableName}: ${body}`);
    }

    const data = await response.json();
    records.push(...data.records);
    offset = data.offset || null;
  } while (offset);

  return records;
}

function buildNameMap(records, primaryField) {
  const map = new Map();
  records.forEach((r) => {
    map.set(r.id, r.fields[primaryField] || null);
  });
  return map;
}

// Linked-record fields come back as an array of bare ID strings.
// Resolve the first one against the given map.
function resolveFirst(value, map) {
  if (!value || !Array.isArray(value) || value.length === 0) return null;
  return map.get(value[0]) || null;
}

export default async function handler(req, res) {
  const token = process.env.AIRTABLE_TOKEN;

  if (!token) {
    res.status(500).json({ error: "Server misconfigured: missing Airtable token." });
    return;
  }

  try {
    // Fetch all reference tables in parallel, plus the visit records.
    const [countryRecs, cityRecs, boroughRecs, areaRecs, shopRecs, visitRecs] = await Promise.all([
      fetchAllRecords(token, TABLES.countries, [PRIMARY_FIELD.countries]),
      fetchAllRecords(token, TABLES.cities, [PRIMARY_FIELD.cities]),
      fetchAllRecords(token, TABLES.boroughs, [PRIMARY_FIELD.boroughs]),
      fetchAllRecords(token, TABLES.areas, [PRIMARY_FIELD.areas]),
      fetchAllRecords(token, TABLES.shops, [PRIMARY_FIELD.shops]),
      fetchAllRecords(token, TABLES.visits, VISIT_FIELDS),
    ]);

    const countryMap = buildNameMap(countryRecs, PRIMARY_FIELD.countries);
    const cityMap = buildNameMap(cityRecs, PRIMARY_FIELD.cities);
    const boroughMap = buildNameMap(boroughRecs, PRIMARY_FIELD.boroughs);
    const areaMap = buildNameMap(areaRecs, PRIMARY_FIELD.areas);
    const shopMap = buildNameMap(shopRecs, PRIMARY_FIELD.shops);

    const visits = visitRecs
      .map((r) => {
        const f = r.fields;
        return {
          shop: resolveFirst(f["Coffee Shop"], shopMap),
          year: f["Year"] || null,
          country: resolveFirst(f["Country"], countryMap),
          city: resolveFirst(f["City"], cityMap),
          borough: resolveFirst(f["NYC Borough"], boroughMap),
          area: resolveFirst(f["Area"], areaMap),
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
