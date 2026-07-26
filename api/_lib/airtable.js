// /api/_lib/airtable.js
//
// Shared helpers for talking to the Airtable REST API and resolving
// linked-record IDs to display names. Used by both /api/visits.js and
// /api/recent.js so the two endpoints stay consistent.

export const BASE_ID = "appAs0RvyPOqaEO8X";

export const TABLES = {
  visits: "Coffee Time Tracker",
  countries: "Countries",
  cities: "Cities",
  boroughs: "NYC Boroughs",
  areas: "Areas",
  shops: "Coffee Shop Profiles",
};

// Primary (name) field for each reference table.
export const PRIMARY_FIELD = {
  countries: "Country",
  cities: "City",
  boroughs: "Borough",
  areas: "Area",
  shops: "Coffee Shop",
};

export async function fetchAllRecords(token, tableName, fields, filterByFormula) {
  const records = [];
  let offset = null;

  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("pageSize", "100");
    if (fields) fields.forEach((f) => url.searchParams.append("fields[]", f));
    if (filterByFormula) url.searchParams.set("filterByFormula", filterByFormula);
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

export function buildNameMap(records, primaryField) {
  const map = new Map();
  records.forEach((r) => {
    map.set(r.id, r.fields[primaryField] || null);
  });
  return map;
}

// Linked-record fields come back from Airtable's REST API as an array of bare
// ID strings, not resolved display names. Resolve the first one against a map.
export function resolveFirst(value, map) {
  if (!value || !Array.isArray(value) || value.length === 0) return null;
  return map.get(value[0]) || null;
}

// Fetches the small reference tables in parallel and returns ID -> name maps
// for each. Shared by any endpoint that needs to resolve Coffee Time Tracker's
// linked-record fields.
export async function fetchReferenceMaps(token) {
  const [countryRecs, cityRecs, boroughRecs, areaRecs, shopRecs] = await Promise.all([
    fetchAllRecords(token, TABLES.countries, [PRIMARY_FIELD.countries]),
    fetchAllRecords(token, TABLES.cities, [PRIMARY_FIELD.cities]),
    fetchAllRecords(token, TABLES.boroughs, [PRIMARY_FIELD.boroughs]),
    fetchAllRecords(token, TABLES.areas, [PRIMARY_FIELD.areas]),
    fetchAllRecords(token, TABLES.shops, [PRIMARY_FIELD.shops]),
  ]);

  return {
    countryMap: buildNameMap(countryRecs, PRIMARY_FIELD.countries),
    cityMap: buildNameMap(cityRecs, PRIMARY_FIELD.cities),
    boroughMap: buildNameMap(boroughRecs, PRIMARY_FIELD.boroughs),
    areaMap: buildNameMap(areaRecs, PRIMARY_FIELD.areas),
    shopMap: buildNameMap(shopRecs, PRIMARY_FIELD.shops),
  };
}

// Maps one Coffee Time Tracker record to the public-safe shape, using the
// reference maps to resolve linked-record IDs to names.
export function resolveVisit(record, maps) {
  const f = record.fields;
  return {
    shop: resolveFirst(f["Coffee Shop"], maps.shopMap),
    year: f["Year"] || null,
    country: resolveFirst(f["Country"], maps.countryMap),
    city: resolveFirst(f["City"], maps.cityMap),
    borough: resolveFirst(f["NYC Borough"], maps.boroughMap),
    area: resolveFirst(f["Area"], maps.areaMap),
    hours: typeof f["Time (hrs)"] === "number" ? f["Time (hrs)"] : 0,
    createdTime: record.createdTime,
  };
}
