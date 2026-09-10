# We Wash Everything — instant quote form

A React + Vite front end and four Vercel functions. A customer answers six questions about
their home and gets a real price on screen, from the live pricing API, and books from there.
Leads land in Supabase and in GoHighLevel, in the We Wash Everything location
(`A9cGvKBunXk003dXUmSV`).

## What runs where

| Path | What it is |
|---|---|
| `src/` | The form. Steps live in `src/steps/`, shared logic in `src/lib/`, state in `src/stores/formStore.ts` |
| `api/submission.ts` | The form's own save/resume/complete route |
| `api/pricing.ts` | The price table the quote screen reads |
| `api/prefill.ts` | **The third-party API.** POST details you already hold, get a quote link back |
| `api/abandonment.ts` | A cron sweep that chases in-progress submissions |
| `api/_lib/ghlFieldMap.ts` | The one place a form snapshot becomes a GHL contact payload |
| `docs/pricing-api-wewasheverything.md` | What this client sells, and what every row means. The source of truth |

## The third-party API

`POST /api/prefill` turns a contact and a property you already hold into a quote link the
customer can open and book from. It writes the CRM contact, mints a token and puts it on
`contact.webform_token`, and a GHL workflow sends the message off that field.

The caller-facing contract is **[`docs/prefill-api-reference.md`](docs/prefill-api-reference.md)** —
request shape, every status code and what to do with each. Change that document whenever
`api/prefill.ts` changes.

Server-to-server only, authenticated with `PREFILL_API_KEY` as a bearer token. A key in
browser JavaScript is a key every visitor can read out of dev tools.

## Getting set up

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

`.env.example` documents every variable and why it exists. The dev server mirrors all four
API routes in-process (see `vite.config.ts`), so `/api/prefill` behaves the same locally as
it does on Vercel, bearer check included.

## Checks

Run these before shipping. None of them needs a browser.

| Command | What it proves |
|---|---|
| `npm run check:api` | The `api/` tree typechecks the way Vercel builds it |
| `npm run check:functions` | Every route's module graph resolves under Node ESM — catches the import failure that once dropped every lead on a 200 |
| `npm run check:inbound` | The three inbound normalisation rules and the `/api/prefill` request contract, case by case. Offline |
| `npm run check:ghl` | Every GHL field id **and its field key** against the live location. Needs `GHL_PIT_TOKEN`. Run after any change to `FIELD` |
| `npm run check:pricing` | Prices from the live pricing API against the price book. Needs `PRICING_API_KEY` |
| `npm run lint` | ESLint |

`check:ghl` is the one that matters most after a rebrand or a snapshot import. GHL mints a
custom-field id per location and discards an unknown id **silently** — the write returns 200
and the field is simply not there — so an id carried over from another sub-account looks
entirely plausible and matches nothing. That mistake cost a week of leads once already.

## Before go-live

**The service area is still the previous business's.** `COVERED_AREAS` and
`COVERED_DISTRICTS` in `src/lib/scheduling.ts` list DH, SR and a set of NE districts — the
North East. We Wash Everything trades from Hartley Wintney, Hampshire. Until those lists are
replaced, every real customer fails the postcode check and is sent to the no-coverage screen.

They are left wrong rather than guessed at: coverage is a commercial fact, not a technical
one, and only the business can say which outward codes they will travel to.
