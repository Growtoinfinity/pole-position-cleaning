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

### Q2 — Is Bearer auth actually enforced on this route? (security)

An unauthenticated `POST /api/v1/pricing/quote` with body `{}`, sent with no
credentials, returned:

```
400 {"error":"missing_selector","message":"provide locationId (or clientId)"}
```

That is body validation, not an auth rejection. A missing/invalid key should
short-circuit with `401` *before* the request body is looked at.

> Is Bearer auth enforced on this route, and at which stage of the request? If a
> request with no `Authorization` header reaches selector validation, can it also
> reach pricing — i.e. is the endpoint open to anyone who knows the `locationId`?
> The `locationId` is not secret; it is embedded in every LeadConnector webhook URL.

(Also confirmed in the same probe: no `Access-Control-Allow-Origin` on the response,
consistent with the spec. We are building a server-side proxy regardless.)

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

### Q7 — A contactless preview, and/or a batch route

Two separate asks, both from spec §8.

> **(a) Preview:** is there a variant that prices without a `contactId` and without
> writing to a contact? The website needs to render a 9-row table while the customer is
> still changing answers; creating or touching a CRM contact for a browse is wrong, and
> ties price display to CRM availability.
>
> **(b) Batch:** is there a route returning all 9 `serviceKey`s for one property in one
> request, and does a batch call count as 1 or 9 against the 60/min budget?

At one call per row, a nine-row table is nine calls, so 60/min supports roughly 6–7 table
renders per minute across the whole public site. That is the binding constraint.

### Q8 — Write side effects and caching

The response carries `ghlField` and `written`, so a quote call appears to write the price
onto the contact.

> Does every `/pricing/quote` call write to the contact's custom field? If we cache a
> price for identical property inputs and serve it to a different contact, (a) is that
> acceptable for display, and (b) does the booking guard require that contact's own field
> to have been written by a live call?
>
> May we cache returned prices server-side, and for how long? Is there a price-book
> version header or an invalidation webhook, so a price change in the portal doesn't leave
> the website quoting a stale number?
>
> Are repeated identical quote calls idempotent, or do they fire workflows/notifications?
> Do 429/503 retries count against the 60/min budget?

### Q9 — GHL custom-field keys for the property write-back

Spec §6 requires the webform to write the property details to the contact, or the bot's
drop-off resume breaks at the booking guard.

> Please give the exact GHL custom-field **keys** (as used in
> `customFields: [{ key, field_value }]`) behind `{{contact.type_of_house}}`,
> `{{contact.number_of_bedrooms}}`, `{{contact.extension}}`, `{{contact.conservatory}}`,
> `{{contact.conservatory_roof_panels}}`, and the accepted values for each.
>
> Also: does the existing `propertyDetails` webhook workflow already populate them? It
> already receives `numberOfBedrooms`, `extension`, `conservatory` and
> `conservatoryRoofPanels` (`src/lib/unified-payload.ts`). If a workflow already writes
> them we will not add a second, direct write.

### Q10 — Kill switch blast radius

> `409 client_inactive` now takes the public website's prices down with the chat bot.
> Whoever flips `active: false` needs to know that. Is `409` per-location, and is there a
> status endpoint we can poll to degrade before a customer hits it?

---

## 2. Implementation status

Blocked on Q1 (no key) and Q3 (price change not signed off). Everything below is
written to be inert until `PRICING_API_KEY` is set, so it can land without touching
live behaviour.

| Piece | State |
|---|---|
| `src/lib/pricing.ts` — shared vocabulary, form→API input mapping | — |
| `api/_lib/pricingApi.ts` — upstream client, response classification, retry | — |
| `api/pricing.ts` — proxy route holding the key | — |
| `vite.config.ts` dev middleware for `/api/pricing` | — |
| `api/submission.ts` `handleQuote` sources prices from the API | — |
| Browser price table + quote-step UI states | — |
| Property write-back to the GHL contact (Q9) | — |

### Notes that already hold regardless of the answers

- **The browser must never call this API.** No CORS, and the key can write to customer
  records. It goes in the proxy, in `PRICING_API_KEY`, never `VITE_`-prefixed.
- **Read the response in this order:** `oversized` first (never show a price, even when
  one is present), then `ok:false` (`missing[]` → not priceable), then `ok:true`.
  An unclassifiable property returns `ok:false` *and* `oversized:true` with an empty
  `missing[]`.
- **Never round, adjust or recompute a returned price.** Summing distinct returned
  prices for a first-clean total is fine; re-deriving one is not.
- **Flats are declined by the form**, before any API call — the API cannot distinguish a
  flat from a houseboat, and both come back as generic "unclassifiable".
- **>5 bedrooms and unclassifiable types are a custom quote**, not an error, and never a
  clamped price.
- **`conservatory: "Yes"` supplies nothing to the two roof rows** — they read
  `conservatory_roof_panels` only. Our form already asks for the count, but it also
  offers "I'm not sure", which supplies no number; those rows stay "price on visit" and
  are not sent to the API.
