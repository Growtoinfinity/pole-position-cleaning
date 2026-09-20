# Prefill API — caller reference

For the **v3 portal**, which calls this endpoint to turn a set of details it already holds
into a quote link the customer can open and book from.

> Building this for a different company? That is the other document —
> [`prefilled-quote-links.md`](./prefilled-quote-links.md). This one is the contract for
> calling **Pole Position Cleaning's** form, with its real property types and bands.
>
> The **envelope** is identical across every tenant the portal calls — same auth, same
> `contact`/`property`/`address` shape, same status codes, same response. The **property
> fields** are the per-tenant seam: this client prices on bedrooms, extension,
> conservatory, loft, Velux and outdoor access, and has no `floor` or
> `conservatoryRoofPanels` at all. Sending a sibling tenant's extra fields is safe — they
> are ignored, not rejected.

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
(`contact.webform_token`) as part of the same call, before it answers you.

Address that field by its **key**, never by a custom-field id. An id is minted per GHL
location and is re-minted by a snapshot clone, so an id copied between sub-accounts looks
entirely plausible and matches nothing — and GHL discards an unknown field id *silently*,
returning 200 with the field simply not set. The key is what survives a clone. (This
paragraph replaces an id that was itself a leftover from the location this form was cloned
from, which is the failure mode arguing for its own removal.)

**Check `crm.tokenWritten` in the response** before you rely on the workflow firing. The
200 means the link and the quote exist; that flag means the contact was actually written.
See [Responses](#responses).

**You do not send the message.** The GHL workflow does, off that field.

The response still hands you `token`, `url` and the full `quote` — use them for logging,
or to put the actual price in the message body rather than only a link.

Whether the `quote calculated` tag is removed afterwards is your decision to make and
worth making explicitly: a contact re-tagged later will mint a fresh link and overwrite the
token, which is either exactly what you want or an accidental loop.

---

### The service area — 25 outward codes

Bournemouth and the Dorset/Hampshire border:

```
BH1–BH18, BH21–BH25, BH31, SP6
```

**BH19 (Swanage) and BH20 (Wareham) are NOT covered**, which is why this is a list of
districts rather than a blanket "BH" rule.

**This endpoint does not check coverage, and that is deliberate.** The postcode check runs
on the booking screen, so a link minted for an out-of-area property carries a correct quote
and then turns the customer away at the last step. Address is optional here and often
absent, so there is frequently nothing to check — filter on your side before calling, if
you hold the postcode.

Confirmed against the business's own list on 2026-09-19 and against `coverage.covered` in
their pricing config; the two agree exactly. There is no coverage endpoint on the pricing
API, so this is a copy on both sides and will go stale silently if the round changes.

## Endpoint

```http
POST https://instant-quote.polepositioncleaning.co.uk/api/prefill
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
| `hearAboutUs` | string | **optional** | → `How did you hear about us?`. See below |
| `referralName` | string | optional | → `Referrer` |

**`hearAboutUs` is optional and unconstrained.** `contact.how_did_you_hear_about_us` is a
free-text field in this location — it carries no picklist, so there is no option list for an
off-list value to be dropped from, and whatever you send is stored verbatim. Send your own
vocabulary if that is what you hold: a campaign id, `Google Ads`, `TikTok ad #4471`.

Omitting it writes nothing at all rather than blanking the field, so a value a previous
touch established survives a prefill call that has nothing to say about attribution.

The form's own dropdown offers exactly six answers — `Google`, `Facebook`, `Checkatrade`,
`Leaflet`, `Van`, `Referral`. Matching them keeps one set of attribution values across both
intake paths and is worth doing; nothing enforces it. The only limit is 255 characters, which
is a sanity bound: a longer value is a mapping bug worth hearing about now rather than
finding in the CRM later.

**Always send `contactId`.** You are reacting to a tag, so you have it. Without it the
webform matches on email, which duplicates any contact held under a different address —
and duplicates a phone-only contact on *every* call, because there is nothing to match on.
The duplicate is the damaging part: the tag, the pipeline and the workflows all stay on the
original, so the customer gets quoted on a record nothing is watching.

### `property`

`type` and `bedrooms` are always required. What else is required depends on `type`:

| `type` | Also required |
|---|---|
| `terraced` `semi_detached` `detached` `townhouse` | `hasExtension`, `hasConservatory`, `hasLoftConversion` |
| `bungalow` | same, **plus `bungalowKind`** |
| `flat` | nothing — the bedroom count is the whole of it |

| Field | Type | Notes |
|---|---|---|
| `propertyType` | enum | `residential` or `commercial`. **Optional** — left empty it is read off `type`. See below |
| `type` | enum | `terraced` `semi_detached` `detached` `townhouse` `flat` `bungalow` |
| `bungalowKind` | enum | **Required for a bungalow.** `terraced` `semi_detached` `detached` — a bungalow is priced as its base type |
| `townhouseKind` | enum | Optional, townhouse only. `terraced` `semi_detached` `detached`. Moves no money; it keeps `contact.type_of_house` reading the same however the lead was created |
| `bedrooms` | integer | **1–5, on every type, `flat` included.** 6 or more is a custom quote → `422`. A JSON number or a digit string; a boolean or an array is a `400` |
| `hasExtension` | `"yes"`/`"no"` or boolean | Houses only. Both forms accepted |
| `hasConservatory` | `"yes"`/`"no"` or boolean | Houses only. It does more than add an uplift — see below |
| `hasLoftConversion` | `"yes"`/`"no"` or boolean | Houses only. **Required — it is a pricing input.** See below |
| `velux` | `"yes"`/`"no"`/`"none"`/ a number | Houses only. Optional — a Yes/No **gate**, not a count. See Velux below |
| `outdoorAccess` | `"yes"`/`"no"` or boolean | **Every type, flat included.** Optional, and the single biggest price lever here. See below |

**An empty string is not an answer.** Where two spellings of the same field exist,
whichever one carries a value wins, and the preferred name wins a tie. Sending
`{ "propertyType": "", "type_of_property": "commercial" }` is read as commercial, not as an
empty box to be inferred. The same goes for whitespace. Values of the wrong *type* are a
different matter and are rejected: an object or an array where a string belongs is a
mapping bug, not silence, and is answered with a `400` rather than treated as unanswered.

### Aliases — send it under the CRM's name if that is what you hold

Every field above is also accepted under the **GHL contact field key** that holds the same
fact. This is what makes a Facebook lead postable without translating it first: GHL writes a
lead form onto a contact record and fires a workflow carrying nothing but
`{"contact_id": "..."}`, so a portal reacting to one is reading field keys, not this
document's camelCase.

| Canonical | Also accepted |
|---|---|
| `contact.fullName` | `full_name`, `name` |
| `contact.phone` | `phone_number` |
| `contact.hearAboutUs` | `how_did_you_hear_about_us` |
| `contact.referralName` | `referrer` |
| `property.type` | `type_of_house` |
| `property.bedrooms` | `number_of_bedrooms` |
| `property.hasExtension` | `extension` |
| `property.hasConservatory` | `conservatory` |
| `property.hasLoftConversion` | `do_you_have_a_loft_conversion` |
| `property.velux` | `hasVelux`, `number_of_velux` |
| `property.outdoorAccess` | `hasOutdoorAccess`, `outdoor_access` |
| `property.propertyType` | `type_of_property` |
| `address.postcode` | `postal_code`, `postalCode` |
| `address.address1` | `address`, `street` |
| `address.city` | `town` |

A whole request may be spelled in field keys, in camelCase, or in a mixture. Mixing is safe
precisely because an empty string never wins over a populated sibling.

### `propertyType` — optional, and inferred when empty

There are two fields in the CRM: `contact.tyoe_of_property` (GHL's own typo, preserved
character for character) holds `residential` or `commercial`, and `contact.type_of_house`
holds the kind of home. A record kept anywhere other than this form very often has the second
and not the first, because the first answers a question only this form asks.

So **if `propertyType` is empty and `type` is one of the six house types, `propertyType` is
set to `residential`.** You do not have to send it. The inference runs in that direction only:

- A stated `residential` or `commercial` is never overwritten.
- An unrecognised `type` infers nothing — no default is invented, because that would put a
  domestic price band on premises nobody has looked at.
- `large_unusual` is a real value of `contact.type_of_house` but is **not** a house type. It
  marks a property this form will not price, so it infers nothing either.

**`commercial` is refused with a `400`.** This form has a commercial branch, but it does not
reach the quote screen — business premises are surveyed and quoted by hand, so there is no
price for a link to carry. Route those leads to your manual-quote path.

### Loft conversion and Velux **do** change the price

Both are boolean surcharges here — charged once for the property, never per unit. Measured
against the live pricing API, a loft conversion adds **£2** to each window row in every
band, and more to fascia and gutter (**+£6** and **+£5** on a 3-bed semi).

**`hasLoftConversion` is required on a house.** The upstream engine treats `loft` as
mandatory — omit it and every one of the eight rows comes back `missing_inputs: ["loft"]`,
pricing nothing at all. It used to be optional here, and an omission was quietly sent on as
`loft: "No"`; a loft-converted house was then quoted as though it had none, and the customer
got a link to a number they could book at. There is no defensible default, so the endpoint
asks. A `flat` is never asked — a flat's price cells carry no uplifts at all.

### Velux — a gate, not a count

**This client does not count Velux windows.** `velux` is charged once for the property,
there is no `number_of_velux` in its pricing config, and nothing upstream reads a count. So
`velux: "yes"` on its own is a **complete answer** — which is also the only shape the
client's own form can produce, since it asks a Yes/No question and has no count field.

| You send | `contact.velux` |
|---|---|
| `velux: "yes"` / `true` | `Yes` |
| `velux: "no"` / `false` | `No` |
| `velux: "none"` | `No` |
| `velux: 3` or `"3"` | `Yes` — any positive count opens the gate |
| `velux: 0` or `"0"` | `No` |
| `veluxCount: 4`, no `velux` | `Yes` |
| neither | `No`, and `velux` is listed in `assumed` |

A `veluxCount` is still **accepted** — callers reading an older CRM hold one, and it decides
the gate when no gate is sent — but it is not stored and not priced. An explicit `velux`
wins outright and a count beside it is simply discarded; that is not a contradiction worth a
`400`, because the discarded value reaches nothing.

Two shapes are still refused: an unreadable gate (`velux: "maybe"`), and a numeric gate that
disagrees with a numeric count (`velux: "3"` alongside `veluxCount: 5`) — there both fields
claim to be counts, and either reading is a guess about the caller's mapping bug.

### Outdoor access — the front-only price

The one input that can **halve** three of the eight rows, and the only one that is safe to
omit.

`outdoorAccess: "no"` means the cleaner cannot reach the back of the property without
someone being home. The three external window services are then priced
**`max(0.5 × full, £14.00)`**; everything else keeps its full price.

- **Omitted → full price.** Unanswered never discounts. The field is optional for exactly
  this reason: a caller that does not hold it gets an honest full-rate quote rather than a
  `400`.
- **It is not defaulted to `"yes"` and it is not listed in `assumed`.** There is nothing to
  assume — not applying a discount is not a claim about the property, whereas sending
  `"yes"` on your behalf would be.
- **Asked of every type, `flat` included.** The live API does return the front-only price
  for a flat.

Because it moves real money, send it whenever you hold it. A lead quoted at full rate that
should have been front-only is the one error here a customer will notice.

**A flat bands on bedrooms, exactly as a house does.** There is no `floor` field and there
never should be one: this client's `Flat` price rows are keyed by bedroom count, and the
customer is deliberately never asked which floor they are on. Send a 3-bedroom flat as
`{ "type": "flat", "bedrooms": 3 }` — plus `outdoorAccess` if you hold it, which applies to
a flat like anything else. It is asked no other question, because no other answer can move
its price, and it is never offered gutter clearance, fascia/soffit or either conservatory
roof clean.

**A townhouse is a full house here.** It gets gutter clearance and fascia/soffit like any
other house, priced from a `Town house` row identical to the `Terraced` one — whatever it
adjoins, which is why `townhouseKind` is optional and changes no number. Send it if you hold
it: the browser form asks the question, so a townhouse created there writes the sub-kind to
`contact.type_of_house`, and without it a townhouse created through this endpoint writes the
bare word `townhouse` instead. A field that means two things depending on which door the lead
came through cannot be reported on.

**`hasConservatory` gates two services, not just a surcharge.** Answer anything but yes and
both conservatory roof rows come back unpriced — for this answer only, not forever. If the
customer later says they do have one, re-quote rather than assuming those rows are gone.

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
  "url": "https://instant-quote.polepositioncleaning.co.uk/?token=0c179ebd-…",
  "contactId": "<the GHL contact id>",   // echoes the id you sent; see crm.tokenWritten
  "crm": {
    "outcome": "updated",                // created | updated | skipped | failed
    "tokenWritten": true                 // false means the workflow has nothing to send
    // "error": "…"                      // present only when something went wrong
  },
  "assumed": ["velux"],                  // answers we filled in for you; [] when you gave them all
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

**`crm.tokenWritten` is the one field to branch on.** The whole loop depends on the CRM
write: you do not send the message, a GHL workflow does, rendered from
`{{contact.webform_token}}`. If the contact write was skipped or refused, that field is
never set, the workflow has nothing to render, and the customer is simply never contacted.
It is still a `200` — the link, the quote and the row are all real — but if this is `false`
the message is yours to send, from `url`. Log `crm.outcome` and `crm.error` either way.

**`assumed` lists answers we made up on your behalf** to be able to price at all. Today the
only entry it can carry is `velux`, meaning you said nothing about Velux windows and the
property was priced and recorded as having none. That is usually right and occasionally
worth chasing; it is here so you can tell the difference. An empty array means every answer
was yours.

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

The `400`s worth wiring a branch for, because each one means a specific thing about the
record you are sending rather than about your request format:

| `error` says | What it means |
|---|---|
| `property.hasLoftConversion must be yes or no …` | You do not hold the loft answer. Nothing can be priced without it — collect it, or send the lead to a human |
| `property.propertyType is commercial …` | Correctly classified, wrong endpoint. Route to your manual-quote path |
| `property.velux is "3" and property.veluxCount is 5 …` | Two numeric fields disagree. A mapping bug on your side — an explicit `"yes"`/`"no"` never causes this, it simply wins |
| `property.outdoorAccess must be yes or no …` | The access answer arrived as something neither. Omit it rather than guessing — omitted prices at the full rate |
| `contact.contactId is not the shape of a GHL contact id` | Something other than a contact id reached that field — an email address, a dashed UUID, a whole object. It is a shape check, not proof the contact exists |
| `Body must be a JSON object` | Usually a missing `Content-Type: application/json` |

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

3-bed semi with a conservatory — the response above is this call's. `propertyType` is left
out and inferred as `residential`; the address is in the trading area:

```bash
curl -X POST https://instant-quote.polepositioncleaning.co.uk/api/prefill \
  -H "Authorization: Bearer $PREFILL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contact":  { "contactId": "<GHL contact id>" },
    "property": { "type": "semi_detached", "bedrooms": 3,
                  "hasExtension": "no", "hasConservatory": "yes",
                  "hasLoftConversion": "no" },
    "address":  { "address1": "12 High Street", "city": "Hartley Wintney",
                  "postcode": "RG27 8NY" }
  }'
```

A 2-bed flat with no rear access — the bedroom count and the access answer are the whole
input. No floor is asked for, and no loft or Velux answer either. The three external window
rows come back at `max(0.5 × full, £14.00)`:

```bash
-d '{ "contact":  { "contactId": "<GHL contact id>" },
      "property": { "type": "flat", "bedrooms": 2, "outdoorAccess": "no" } }'
```

Detached bungalow, priced as a detached house:

```bash
-d '{ "contact":  { "contactId": "<GHL contact id>" },
      "property": { "type": "bungalow", "bungalowKind": "detached", "bedrooms": 2,
                    "hasExtension": "no", "hasConservatory": "no",
                    "hasLoftConversion": "no" } }'
```

A loft conversion and Velux windows. Both move the price — this quote is higher than the
same house without them. `velux: "yes"` is complete on its own; no count is wanted:

```bash
-d '{ "contact":  { "contactId": "<GHL contact id>" },
      "property": { "type": "terraced", "bedrooms": 4,
                    "hasExtension": "yes", "hasConservatory": "no",
                    "hasLoftConversion": "yes", "velux": "yes" } }'
```

A caller that still holds a count sends it instead, and gets the identical quote — any
positive number opens the same gate:

```bash
-d '{ "contact":  { "contactId": "<GHL contact id>" },
      "property": { "type": "terraced", "bedrooms": 4,
                    "hasExtension": "yes", "hasConservatory": "no",
                    "hasLoftConversion": "yes", "velux": 3 } }'
```

A Facebook lead, spelled entirely in GHL field keys — no translation on your side:

```bash
-d '{ "contact":  { "contactId": "<GHL contact id>", "full_name": "A Lead",
                    "phone_number": "07700900123",
                    "how_did_you_hear_about_us": "Facebook" },
      "property": { "type_of_house": "detached", "number_of_bedrooms": "4",
                    "extension": "Yes", "conservatory": "No",
                    "do_you_have_a_loft_conversion": "Yes",
                    "number_of_velux": 2, "outdoor_access": "no" },
      "address":  { "postal_code": "BH1 1AA" } }'
```

A record that holds only the kind of home, with `velux` carrying the CRM's word for none.
`propertyType` is inferred, and the property is priced and recorded with no Velux:

```bash
-d '{ "contact":  { "contactId": "<GHL contact id>", "hearAboutUs": "Checkatrade" },
      "property": { "type": "detached", "bedrooms": 4,
                    "hasExtension": "no", "hasConservatory": "no",
                    "hasLoftConversion": "no", "velux": "none" } }'
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

// The GHL workflow sends the message off contact.webform_token. If the contact write
// did not land, that field is unset and nobody is ever contacted — so this is the one
// thing to check before assuming the job is done.
if (!body.crm.tokenWritten) {
  alertOps(`prefill wrote no contact (${body.crm.outcome}): ${body.crm.error ?? 'unknown'}`)
  // The link itself is fine. Send it yourself from body.url, or retry.
}

// Answers we filled in for you. Empty when you gave them all.
if (body.assumed.length) log(`quoted with assumed answers: ${body.assumed.join(', ')}`)

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
- **Re-quoting the same contact for a different property is safe, for the property fields.**
  The eight per-service prices and the house-only answers — extension, conservatory, loft,
  the Velux pair — are rewritten or blanked on every call, so a contact re-quoted from a
  house to a flat does not keep its gutter or fascia price, and one re-quoted to a property
  with no Velux does not keep the old count. The one gap: a row that *is* offered to this
  property but that the pricing API declined to price is neither rewritten nor blanked, so
  the previous quote's number for that row stands. What a prefill call does **not** touch is
  anything a completed booking wrote: `booking_completion_date`, the booked-services pair
  and the monthly/yearly values stand until that journey overwrites them. A contact that has
  booked before will show a new quote beside an old booking, which is usually the intent —
  just do not read those fields as belonging to this quote.
- **The link is a capability.** Whoever holds it sees that quote and can book it. Send it
  to the customer; do not post it anywhere public.
- **An unopened link is chased.** The row is a live in-progress submission, so the
  abandonment sweep will follow it up after the idle window. Usually what you want — but
  it means sending a link enrols someone in that sequence.
- **Nothing is emailed by the webform.** Not on success, not on failure.
- **No pipeline movement happens here.** The contact is updated with the property, the
  prices and the token. The opportunity and the booking workflow fire only when the
  customer actually books.
