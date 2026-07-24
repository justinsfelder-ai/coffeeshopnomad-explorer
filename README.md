# CoffeeShopNomad — Visit Explorer

A small, public, read-only query page for CoffeeShopNomad visit data. Built as
the first piece of infrastructure toward the eventual full app — the API
route here is a rough draft of what a real backend data layer will look like.

## How it works

- `index.html` — the frontend. Fetches the full visit dataset once from
  `/api/visits`, then does all filtering and aggregation in the browser.
  No further network calls after the initial load.
- `api/visits.js` — a Vercel serverless function. Runs on Vercel's servers,
  not in the visitor's browser. Holds the Airtable token privately (via an
  environment variable) and returns only the whitelisted fields — Cost/$
  data is deliberately excluded and never leaves Airtable.

## Deploy steps

1. **Push this folder to a GitHub repo** (or drag-and-drop deploy via the
   Vercel dashboard if you'd rather skip Git for now).
2. In Vercel, **create a new project** from that repo.
3. Before (or right after) the first deploy, go to
   **Project Settings → Environment Variables** and add:
   - Name: `AIRTABLE_TOKEN`
   - Value: your Airtable Personal Access Token (the fresh one you generated —
     never commit this to the repo or paste it anywhere public)
   - Environment: Production (and Preview, if you want preview deploys to
     also work)
4. Deploy. Vercel will give you a `*.vercel.app` URL — that's your live page.
5. Once your domain is ready, point it at this Vercel project from Vercel's
   **Domains** settings — no code changes needed.

## Updating what's public

To add or remove a field from what's exposed, edit the `PUBLIC_FIELDS` array
at the top of `api/visits.js`. Nothing outside that list is ever returned,
by design — treat it as the single source of truth for "what's safe to show."

## Local testing (optional)

If you want to test before deploying:

```bash
npm install -g vercel
vercel dev
```

This runs the same serverless function locally. You'll need a `.env.local`
file with `AIRTABLE_TOKEN=your_token_here` (already gitignored).
