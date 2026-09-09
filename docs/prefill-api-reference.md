# Prefill API — caller reference

For the **v3 portal**, which calls this endpoint to turn a set of details it already holds
into a quote link the customer can open and book from.

> Building this for a different company? That is the other document —
> [`prefilled-quote-links.md`](./prefilled-quote-links.md). This one is the contract for
> calling **We Wash Everything's** form, with its real property types and bands.

---

## The loop

```
GHL ── tag "quote calculated" applied
 │
 ▼
portal ── POST /api/prefill   { contactId, property }        ← you are here
 │
 ▼
webform ── prices it, mints a token, writes the token to the contact
 │
 ▼
GHL ── workflow sends the link, rendered from {{contact.webform_token}}
```

**You do not write the token.** The webform writes it to `Webform Token`
(`contact.webform_token`, id `BJHCrqtSLGjBoY7YmKfi`) as part of the same call, before it
answers you. By the time you get a 200 the field is set.

**You do not send the message.** The GHL workflow does, off that field.

The response still hands you `token`, `url` and the full `quote` — use them for logging,
or to put the actual price in the message body rather than only a link.

Whether the `quote calculated` tag is removed afterwards is your decision to make and
worth making explicitly: a contact re-tagged later will mint a fresh link and overwrite the
token, which is either exactly what you want or an accidental loop.

---

## Endpoint

```http
POST https://instant-quote.wewasheverything.com/api/prefill
Authorization: Bearer <PREFILL_API_KEY>
Content-Type: application/json
```

The key is a shared secret: the same string is stored in the webform's environment (which
compares it) and in the portal's (which sends it). Server-side only — never from a browser.
There is no other authentication; treat the key as the whole lock.

---

## Request

### `contact`

| Field | Type | Required | Notes |
|---|---|---|---|
| `contactId` | string | **strongly preferred** | The GHL contact id. With it, everything below is optional and the write goes to that exact contact |
| `fullName` | string | required *without* `contactId` | |
| `email` | string | one of email/phone, *without* `contactId` | Validated for shape |
| `phone` | string | one of email/phone, *without* `contactId` | Normalised to E.164 |
| `hearAboutUs` | string | optional | → `How did you hear about us?` |
| `referralName` | string | optional | → `Referrer` |

**Always send `contactId`.** You are reacting to a tag, so you have it. Without it the
webform matches on email, which duplicates any contact held under a different address —
and duplicates a phone-only contact on *every* call, because there is nothing to match on.
The duplicate is the damaging part: the tag, the pipeline and the workflows all stay on the
original, so the customer gets quoted on a record nothing is watching.

### `property`

`type` and `bedrooms` are always required. What else is required depends on `type`:

| `type` | Also required |
|---|---|
| `terraced` `semi_detached` `detached` `townhouse` | `hasExtension`, `hasConservatory` |
| `bungalow` | same, **plus `bungalowKind`** |
| `flat` | nothing — the bedroom count is the whole of it |

| Field | Type | Notes |
|---|---|---|
| `type` | enum | `terraced` `semi_detached` `detached` `townhouse` `flat` `bungalow` |
| `bungalowKind` | enum | `terraced` `semi_detached` `detached` — a bungalow is priced as its base type |
| `bedrooms` | integer | **1–5, on every type, `flat` included.** 6 or more is a custom quote → `422` |
| `hasExtension` | `"yes"`/`"no"` or boolean | Houses only. Both forms accepted |
| `hasConservatory` | `"yes"`/`"no"` or boolean | Houses only. It does more than add an uplift — see below |
| `hasLoftConversion` | `"yes"`/`"no"` or boolean | Houses only. **Optional.** Survey answer, not a pricing input — omitting it does not change the quote |
| `hasVelux` | `"yes"`/`"no"` or boolean | Houses only. **Optional.** Survey answer, not a pricing input |
| `veluxCount` | integer ≥ 1 | Only when `hasVelux` is yes. Omitted defaults to `1`, which the customer adjusts on screen. Ignored when `hasVelux` is no |

**A flat bands on bedrooms, exactly as a house does.** There is no `floor` field and there
never should be one: this client's `Flat` price rows are keyed by bedroom count, and the
customer is deliberately never asked which floor they are on. Send a 3-bedroom flat as
`{ "type": "flat", "bedrooms": 3 }` and nothing else — a flat is asked no other question,
because no other answer can move its price, and it is never offered gutter clearance,
fascia/soffit or either conservatory roof clean.

**A townhouse is a full house here.** It gets gutter clearance and fascia/soffit like any
other house, priced from a `Town house` row identical to the `Terraced` one.

**`hasConservatory` gates two services, not just a surcharge.** Answer anything but yes and
both conservatory roof rows come back unpriced — for this answer only, not forever. If the
customer later says they do have one, re-quote rather than assuming those rows are gone.

**Loft and Velux never change a price.** They are collected for the CRM and read by nothing
on the pricing path. Send them when you hold them; omitting them does not make a quote any
less correct.

Fields that do not apply to the chosen type are **ignored, not rejected** — sending
`hasExtension` alongside `type: "flat"` is accepted and has no effect. That includes `floor`
and `conservatoryRoofPanels`, which this endpoint used to take and no longer does: a caller
still sending either is not broken, it is simply sending nothing. So a mapping bug that
sends the wrong `type` will not be caught here: the quote comes back priced as whatever type
you named. Get `type` right and the rest follows.

### `address` — optional

| Field | Type |
|---|---|
| `address1` | string |
| `city` | string |
| `postcode` | string |

Supplying it prefills the booking screen so the customer confirms in one click. Leave it
out and they type it themselves. It is not validated against the service area here — the
booking screen does that when they confirm.

---

## Responses

### `200` — link created

Semi-detached, 3 bedrooms, no extension, with a conservatory:

```jsonc
{
  "ok": true,
  "token": "0c179ebd-7691-4662-a8bf-00bad5125e0d",
  "url": "https://instant-quote.wewasheverything.com/?token=0c179ebd-…",
  "contactId": "Biim699orwEQTIo2bf83",
  "quote": { /* schedule, extras, totals */ },
  "table": {
    "cells": {
      "ext_window_6weekly":         { "state": "priced", "price": 30,  "ghlField": "contact.6weekly" },
      "ext_window_12weekly":        { "state": "priced", "price": 40,  "ghlField": "contact.12weekly" },
      "ext_window_oneoff":          { "state": "priced", "price": 60,  "ghlField": "contact.oneoff" },
      "int_window_oneoff":          { "state": "priced", "price": 60,  "ghlField": "contact.ad_hoc_internal_window_cleaning" },
      "fascia_soffit_clean":        { "state": "priced", "price": 105, "ghlField": "contact.fascia_soffit_and_gutter_clean" },
      "full_gutter_clearance":      { "state": "priced", "price": 107, "ghlField": "contact.full_gutter_clearance" },
      "conservatory_roof_external": { "state": "priced", "price": 99,  "ghlField": "contact.conservatory_roof_cleaning" },
      "conservatory_roof_internal": { "state": "priced", "price": 99,  "ghlField": "contact.con_roof" }
    },
    "oversized": false,
    "source": "api",
    "fetchedAt": "2026-09-09T10:14:02.117Z"
  }
}
```

**All eight keys are always present**, priced or not. Look a cell up by its key — never by
position, and never assume a missing key means zero.

Three things about that table that catch people out:

- **The service is `fascia_soffit_clean`**, not `fascia_soffit_gutter` as in other
  contracts on the same upstream API. There is no 4-weekly or 8-weekly row anywhere: this
  client sells 6-weekly and 12-weekly.
- **The two one-offs are always the same number as each other**, and both are 2 × the
  *external* 6-weekly total with the surcharges doubled along with the base. Read `price`.
  Never re-derive a one-off from the 6-weekly figure.
- **Gutter and fascia are two independent tables.** Neither is reliably the larger — on a
  4-bed detached with both uplifts they land a pound apart, gutter above fascia.

Cell states:

| `state` | Means | What to do |
|---|---|---|
| `priced` | `price`, plus the `ghlField` the price belongs in | The only state that can be sold |
| `not_applicable`, `permanent: true` | Structural. Four of the eight rows on every flat — gutter, fascia and both roofs | Hide the row and keep it hidden. No answer will ever price it |
| `not_applicable`, `permanent: false` | True of this turn's answers only — both roof rows whenever `hasConservatory` is not yes | Hide it now, re-quote if that answer changes. **Never store the verdict** |
| `not_priceable` | The API refused the row and said why: `reason`, `missing` | No price to show |
| `oversized` | Beyond the price list. Any number attached to it is the top-band rate, not this property's | Never show it |
| `unavailable` | We could not get an answer for this row: no key, a timeout, a 401. `reason` says which | Not a fact about the property — never tell the customer their home is unusual because of one. Inside a `200` it is always partial; if every offered row were unavailable you would have a `503` instead |

There is no `on_visit` and no `on_request` state any more. Both existed for a conservatory
roof priced per glazed panel; this client prices roof cleaning from a house × bedroom table,
so there is nothing left to confirm on the visit.

### Errors

| Code | Meaning | What to do |
|---|---|---|
| `400` | Bad input. `error` names the field and what it expects | Fix and resend; do not retry unchanged |
| `401` | Key missing or wrong | Check config. Not retryable |
| `422` | The property cannot be self-served: 6 or more bedrooms, or the API refused every row it would be offered | **No link exists.** Route to a human for a manual quote |
| `503` | Pricing service did not answer, answered with no prices at all, or the store is unconfigured | Retry with backoff |
| `500` | Unexpected | Retry once, then alert |

```jsonc
{ "ok": false, "error": "property.bedrooms must be a whole number of 1 or more" }
```

A `422` carries `oversized`, which says which kind it is: `true` for a property past the
price list, `false` for one the API declined to price. Both go down the same manual-quote
path; only your logs care about the difference.

**`422` is a real business outcome, not a failure.** The property genuinely cannot be
self-served. Send it down your manual-quote path rather than retrying — the answer will
not change.

**`503` and `422` are not the same news.** A `503` means we could not get an answer — and
that includes the case where the upstream returned `200` but every cell came back
`unavailable`, which is what an unminted or wrong pricing key looks like from here. A `422`
means we did get an answer and it was "not this property". Only the first is worth
retrying, and only the second is worth telling the customer anything about.

The endpoint deliberately **refuses to mint a link it knows is broken**. A link that opens
onto "we can't show your price" is worse than no link, because it was sent on purpose to a
named person.

---

## Examples

3-bed semi with a conservatory — the response above is this call's:

```bash
curl -X POST https://instant-quote.wewasheverything.com/api/prefill \
  -H "Authorization: Bearer $PREFILL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contact":  { "contactId": "Biim699orwEQTIo2bf83" },
    "property": { "type": "semi_detached", "bedrooms": 3,
                  "hasExtension": "no", "hasConservatory": "yes" },
    "address":  { "address1": "12 Test Street", "city": "Washington",
                  "postcode": "NE37 1AA" }
  }'
```

A 2-bed flat — the bedroom count is the whole input, and no floor is asked for:

```bash
-d '{ "contact":  { "contactId": "…" },
      "property": { "type": "flat", "bedrooms": 2 } }'
```

Detached bungalow, priced as a detached house:

```bash
-d '{ "contact":  { "contactId": "…" },
      "property": { "type": "bungalow", "bungalowKind": "detached", "bedrooms": 2,
                    "hasExtension": "no", "hasConservatory": "no" } }'
```

A house whose loft conversion and Velux windows you already know about. They reach the CRM
and change nothing about the price:

```bash
-d '{ "contact":  { "contactId": "…" },
      "property": { "type": "terraced", "bedrooms": 4,
                    "hasExtension": "yes", "hasConservatory": "no",
                    "hasLoftConversion": "yes", "hasVelux": "yes", "veluxCount": 3 } }'
```

From the portal:

```js
const res = await fetch(`${WEBFORM_BASE}/api/prefill`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.PREFILL_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ contact: { contactId }, property }),
})

const body = await res.json()

if (res.status === 422) return routeToManualQuote(contactId, body.error)
if (!res.ok) throw new Error(`prefill ${res.status}: ${body.error}`)

// The token is already on the contact. This is for your logs, or for putting the
// real price into the message rather than only a link.
//
// Read the cell by key and check its state first. A 200 guarantees at least one
// sellable row, not that this particular row is one of them — the internal window
// clean is offered to flats, gutter clearance is not.
const cell = body.table.cells.ext_window_6weekly
return { url: body.url, sixWeekly: cell.state === 'priced' ? cell.price : null }
```

---

## Behaviour worth knowing

- **Each call mints a new link** and overwrites `contact.webform_token`. The previous
  link stops being the one the CRM sends, though it keeps working if someone still has it.
  Call once per intent, not once per retry of a 5xx that may have already succeeded.
- **Re-quoting the same contact for a different property is safe.** Values that no longer
  apply are blanked, not left behind — a contact re-quoted from a house to a flat does not
  keep its gutter or fascia price.
- **The link is a capability.** Whoever holds it sees that quote and can book it. Send it
  to the customer; do not post it anywhere public.
- **An unopened link is chased.** The row is a live in-progress submission, so the
  abandonment sweep will follow it up after the idle window. Usually what you want — but
  it means sending a link enrols someone in that sequence.
- **Nothing is emailed by the webform.** Not on success, not on failure.
- **No pipeline movement happens here.** The contact is updated with the property, the
  prices and the token. The opportunity and the booking workflow fire only when the
  customer actually books.
