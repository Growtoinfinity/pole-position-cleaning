# Prefill API — caller reference

For the **v3 portal**, which calls this endpoint to turn a set of details it already holds
into a quote link the customer can open and book from.

> Building this for a different company? That is the other document —
> [`prefilled-quote-links.md`](./prefilled-quote-links.md). This one is the contract for
> calling **Greenmaster's** form, with its real property types and bands.

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
POST https://instant-quote.greenmasterservices.co.uk/api/prefill
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

`type` is always required. What else is required depends on it:

| `type` | Also required | Not accepted |
|---|---|---|
| `terraced` `semi_detached` `detached` | `bedrooms`, `hasExtension`, `hasConservatory` | `floor` |
| `townhouse` | same as above | `floor` |
| `bungalow` | same, **plus `bungalowKind`** | `floor` |
| `flat` | `floor` only | `bedrooms`, extension, conservatory |

| Field | Type | Notes |
|---|---|---|
| `type` | enum | `terraced` `semi_detached` `detached` `townhouse` `flat` `bungalow` |
| `bungalowKind` | enum | `terraced` `semi_detached` `detached` — a bungalow is priced as its base type |
| `bedrooms` | integer | **1–5.** 6 or more is a custom quote → `422` |
| `floor` | enum | `ground` `first` `second` `third` `fourth`. Higher is a custom quote → `422` |
| `hasExtension` | `"yes"`/`"no"` or boolean | Both accepted |
| `hasConservatory` | `"yes"`/`"no"` or boolean | Both accepted |
| `conservatoryRoofPanels` | integer ≥ 1, or `"unknown"` | Only when `hasConservatory` is yes. `"unknown"` means priced on the visit — a real answer, not a missing one |

A flat is priced **by floor alone**, exactly as the form asks it. It is never offered
gutter clearance, fascia/soffit or a conservatory roof clean.

Fields that do not apply to the chosen type are **ignored, not rejected** — sending
`bedrooms` alongside `type: "flat"` is accepted and has no effect. So a mapping bug that
sends the wrong `type` will not be caught here: the quote comes back priced as whatever
type you named. Get `type` right and the rest follows.

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

```jsonc
{
  "ok": true,
  "token": "0c179ebd-7691-4662-a8bf-00bad5125e0d",
  "url": "https://instant-quote.greenmasterservices.co.uk/?token=0c179ebd-…",
  "contactId": "Biim699orwEQTIo2bf83",
  "quote": { /* schedule, extras, totals */ },
  "table": {
    "cells": {
      "ext_window_4weekly":         { "state": "priced", "price": 20 },
      "ext_window_8weekly":         { "state": "priced", "price": 27 },
      "full_gutter_clearance":      { "state": "priced", "price": 105 },
      "fascia_soffit_gutter":       { "state": "priced", "price": 105 },
      "conservatory_roof_external": { "state": "priced", "price": 90 }
    }
  }
}
```

Cell states you may see: `priced`, `not_applicable` (this property is never offered it),
`on_visit` (panel count unknown), `on_request`.

### Errors

| Code | Meaning | What to do |
|---|---|---|
| `400` | Bad input. `error` names the field and what it expects | Fix and resend; do not retry unchanged |
| `401` | Key missing or wrong | Check config. Not retryable |
| `422` | Property outside the price book — 6+ bedrooms, 5th floor or above | **No link exists.** Route to a human for a manual quote |
| `503` | Pricing service did not answer, or the store is unconfigured | Retry with backoff |
| `500` | Unexpected | Retry once, then alert |

```jsonc
{ "ok": false, "error": "property.bedrooms must be a whole number of 1 or more" }
```

**`422` is a real business outcome, not a failure.** The property genuinely cannot be
self-served. Send it down your manual-quote path rather than retrying — the answer will
not change.

The endpoint deliberately **refuses to mint a link it knows is broken**. A link that opens
onto "we can't show your price" is worse than no link, because it was sent on purpose to a
named person.

---

## Examples

3-bed semi with a conservatory:

```bash
curl -X POST https://instant-quote.greenmasterservices.co.uk/api/prefill \
  -H "Authorization: Bearer $PREFILL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contact":  { "contactId": "Biim699orwEQTIo2bf83" },
    "property": { "type": "semi_detached", "bedrooms": 3,
                  "hasExtension": "no", "hasConservatory": "yes",
                  "conservatoryRoofPanels": 8 },
    "address":  { "address1": "12 Test Street", "city": "Washington",
                  "postcode": "NE37 1AA" }
  }'
```

Second-floor flat — floor is the whole input:

```bash
-d '{ "contact":  { "contactId": "…" },
      "property": { "type": "flat", "floor": "second" } }'
```

Detached bungalow, roof panels not known:

```bash
-d '{ "contact":  { "contactId": "…" },
      "property": { "type": "bungalow", "bungalowKind": "detached", "bedrooms": 2,
                    "hasExtension": "no", "hasConservatory": "yes",
                    "conservatoryRoofPanels": "unknown" } }'
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
return { url: body.url, fourWeekly: body.table.cells.ext_window_4weekly.price }
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
