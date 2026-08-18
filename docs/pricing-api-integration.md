# Webform → v3 bot pricing API: open questions and status

The webform is moving off its own price book (`src/lib/costing.ts`) and onto
`POST /api/v1/pricing/quote` on the v3 bot, so the website, the chat bot, the voice
bot and the booking guard all quote the same number.

This file tracks what has to be answered before that can go live. Everything in
§1 blocks cutover. §2 is the implementation status.

---

## 1. Questions for the bot team / Kings' operator

### Q1 — Issue a `quote`-scoped API key (blocks everything)

There is no pricing-API credential in this repo. The only bearer token here is
`GHL_PIT_TOKEN`, which is for the GHL contacts API and unrelated.

> Please issue a `quote`-scoped key for `locationId=zfgtbqDWRUrkaHTmvrO7`, for use by
> the Kings website's server-side proxy. Confirm the header form
> (`Authorization: Bearer <key>`), and whether the 60/min limit is per-key or per-client.

### Q2 — Is Bearer auth actually enforced on this route? — RESOLVED

Previously an unauthenticated `POST` with body `{}` returned `400 missing_selector`,
i.e. body validation ahead of any auth check. Re-probed after the bot-side fix:

```
POST /api/v1/pricing/quote   (no Authorization header, full valid body)
401 {"error":"unauthorized"}
```

Auth now short-circuits before the body is looked at, which is what was asked for. The
endpoint is no longer reachable by anyone who merely knows the `locationId`.

### Q3 — The internal-window-clean price disagrees by £4 (blocks cutover)

For the spec's own worked example — Semi Detached, 3 bedrooms, no extension, no
conservatory — the two engines disagree on exactly one row:

| Row | Live site today | Your API | Δ |
|---|---|---|---|
| `int_window_oneoff` | **£52** | **£48** | **−£4** |

The site's rule is `2 × the 8-weekly price` (`26 × 2 = 52`, `src/lib/costing-calc.ts:162`).
Your £48 happens to equal `2 × the 6-weekly price` (`24 × 2`), but we are not going to
guess a rule from one data point.

> Which number is correct, and has Kings signed off the change? What is the actual
> rule behind `int_window_oneoff`? Until this is answered we will not cut that row over.

The other eight rows match exactly (24 / 26 / 32 / 50 / 120 / 120 / 80 / 80).

### Q4 — Extension and conservatory uplifts are unverified

The worked example has neither, so it proves nothing about uplifts. Our local book adds
a flat +£4 per uplift at Semi Detached 3-bed (rising to +£6 at 4–5 beds).

> Please supply worked prices for Semi Detached / 3 bed with (a) extension only,
> (b) conservatory only, (c) both — for all four window frequencies.

### Q5 — Bungalows

Our form collapses bungalows onto their base type: a detached bungalow is priced today
as an ordinary `Detached` house. The spec lists `"terraced bungalow"` and
`"detached bungalow"` as accepted `house_type` aliases.

> Do those aliases resolve to the same price row as the plain house type, or a different
> one? If different, bungalow prices move at cutover and Kings needs to sign that off.
> Also: there is no `"semi detached bungalow"` in your accepted list — what should we
> send for one? And is it `"Town house"` or `"Townhouse"`?

### Q6 — Conservatory roof panels

Our panel stepper allows 1–120. Our public copy
(`src/lib/conservatory-roof-copy.ts`) states "£10 per glazed roof panel".

> Is there an upper bound on `conservatory_roof_panels`? Is the roof price still exactly
> `panels × £10`? Once your engine owns that number, our marketing copy becomes an
> unverified claim and will have to change if the rule differs.

### Q7 — A contactless preview (RESOLVED), and a batch route (still open)

**(a) Preview — resolved.** The API no longer requires a `contactId`; it prices from
`inputs` alone. The website can render the table while the customer is still changing
answers, without creating or touching a CRM record, and price display no longer depends
on CRM availability.

`contactId` is now optional throughout: `fetchQuote`, `fetchQuoteTable`, `resolveQuote`
and the `/api/pricing` proxy all accept null. We still *send* the id whenever the
submission row has one, so the price stays attributed to the contact and the bot's
booking guard can read it back — it is enrichment now, not a precondition.

> **(b) Batch — still open:** is there a route returning all 9 `serviceKey`s for one
> property in one request, and does a batch call count as 1 or 9 against the 60/min
> budget?

At one call per row, a nine-row table is nine calls, so 60/min supports roughly 6–7 table
renders per minute across the whole public site. That remains the binding constraint.

### Q8 — Write side effects and caching

The response carries `ghlField` and `written`, so a quote call appears to write the price
onto the contact.

> Does every `/pricing/quote` call write to the contact's custom field? Part of this is
> now moot: pricing without a `contactId` (Q7a) cannot write to anyone, so cached display
> prices are contact-independent by construction — our cache key was already the property,
> never the contact. What remains: does the booking guard require that contact's own field
> to have been written by a live call? We send `useCache: false` on the commit path
> precisely so the chosen rows are live and attributable.
>
> May we cache returned prices server-side, and for how long? Is there a price-book
> version header or an invalidation webhook, so a price change in the portal doesn't leave
> the website quoting a stale number?
>
> Are repeated identical quote calls idempotent, or do they fire workflows/notifications?
> Do 429/503 retries count against the 60/min budget?

### Q9 — GHL custom-field keys for the property write-back — RESOLVED

Spec §6 requires the webform to write the property details to the contact, or the bot's
drop-off resume breaks at the booking guard.

No longer a question for the bot team. The webform now writes these itself, directly,
through the GHL contacts API — the inbound webhooks are gone entirely, so there is no
workflow left that could be doing it instead. Field **ids** (not keys) were read from the
location and verified against 100 contacts the old webhook flow had created:

| Merge field | Field id | Written from |
|---|---|---|
| `{{contact.type_of_house}}` | `PtBN5jD5Ej2q2f0niHTd` | sub-kind when there is one, else the house type |
| `{{contact.number_of_bedrooms}}` | `17NOwXGT5YH8BJuTV4x6` | `propertyDetails.bedrooms` |
| `{{contact.extension}}` | `pOzEyx3FQAfR7xImR8ri` | `yes` / `no` |
| `{{contact.conservatory}}` | `yXybNWTUis74KZ5F9tyk` | `yes` / `no` |
| `{{contact.conservatory_roof_panels}}` | `tK5vUWWHyt9vPlqRtqyi` | panel count, or "To be confirmed on visit" |

Two things worth flagging to whoever owns the booking guard:

- `conservatory_roof_panels` was **never populated** before this change — empty on all 100
  contacts sampled, despite the old payload carrying it on every request. If the guard
  reads it, it has been reading an empty field.
- `type_of_house` holds mixed conventions in the wild: `semi_detached` from the form,
  `Semi Detached` from the bot. The form keeps writing snake_case. If the guard
  string-matches on it, it needs to tolerate both.

See `api/_lib/ghlFieldMap.ts` for the full map, including the price rows.

### Q10 — Kill switch blast radius

> `409 client_inactive` now takes the public website's prices down with the chat bot.
> Whoever flips `active: false` needs to know that. Is `409` per-location, and is there a
> status endpoint we can poll to degrade before a customer hits it?

---

## 2. Implementation status

Blocked on Q1 (no key) and Q3 (price change not signed off). Q2, Q7a and Q9 are
resolved. Everything below is written to be inert until `PRICING_API_KEY` is set, so it
can land without touching live behaviour.

| Piece | State |
|---|---|
| `src/lib/pricing.ts` — shared vocabulary, form→API input mapping | done |
| `api/_lib/pricingApi.ts` — upstream client, response classification, retry | done |
| `api/pricing.ts` — proxy route holding the key | done |
| `vite.config.ts` dev middleware for `/api/pricing` | done |
| `api/submission.ts` `handleQuote` sources prices from the API | done |
| `src/lib/price-table.ts` — API table → the existing `CalcResult` shape | done |
| Browser price table (`costingStore.loadPriceTable`) | done |
| Quote-step UI states, both desktop and mobile | done |
| `npm run check:pricing` — logic checks against the worked example | done |
| Property write-back to the GHL contact | done — direct write, see Q9 |
| Contactless pricing (Q7a) | done — `contactId` optional throughout |
| Batch route (Q7b) | blocked — one call per row until then |

### How to switch it on

1. Set `PRICING_API_KEY` in Vercel (and `.env.local` for `npm run dev`). Nothing else
   changes: with it unset every path falls back to the local book, which is the current
   live behaviour.
2. Prices then come from the API everywhere *except* `int_window_oneoff`, which renders
   "price on request" until Q3 is answered. Once Kings signs the £52 → £48 change off,
   clear `PARITY_UNRESOLVED` in `src/lib/price-table.ts` (or set
   `PRICING_PARITY_APPROVED=int_window_oneoff` to release just that row).
3. `pricingSource` on the `/api/submission?action=quote` response says `api` or `local`
   for every lead, and a `local` result is logged server-side when the contact fields are
   written, so you can confirm the cutover took and spot silent fallbacks afterwards.

### What one quote costs

One fetch per property, at the property-details → quote transition. Clicking a
frequency or ticking an add-on costs nothing — neither moves a price, they only select
rows from the table already in memory. A property with no conservatory, or one whose
owner could not count their roof panels, is 7 calls rather than 9.

### Notes that already hold regardless of the answers

- **The browser must never call this API.** No CORS, and the key can write to customer
  records. It goes in the proxy, in `PRICING_API_KEY`, never `VITE_`-prefixed.
- **Read the response in this order:** `oversized` first (never show a price, even when
  one is present), then `ok:false` (`missing[]` → not priceable), then `ok:true`.
  An unclassifiable property returns `ok:false` *and* `oversized:true` with an empty
  `missing[]`.
- **Never round, adjust or recompute a returned price.** Summing distinct returned
  prices for a first-clean total is fine; re-deriving one is not. This holds for the CRM
  write too: `ghlFieldMap.ts` writes returned prices verbatim, and writes *nothing* for a
  row the API declined to price rather than a fabricated `0`.
- **Flats are declined by the form**, before any API call — the API cannot distinguish a
  flat from a houseboat, and both come back as generic "unclassifiable".
- **>5 bedrooms and unclassifiable types are a custom quote**, not an error, and never a
  clamped price.
- **`conservatory: "Yes"` supplies nothing to the two roof rows** — they read
  `conservatory_roof_panels` only. Our form already asks for the count, but it also
  offers "I'm not sure", which supplies no number; those rows stay "price on visit" and
  are not sent to the API.
