# Webform → We Wash Everything pricing API — our side

The webform holds no price book. Every number a customer sees comes from the We Wash
Everything pricing API on the v3 bot, so the website, the chat bot, the voice bot and the
booking guard all quote the same figure.

**`docs/pricing-api-wewasheverything.md` is the single source of truth** for that API: the
routes, the request and response shapes, the eight services, the price tables, the banding
rules and the reason codes. **Every `§n` below points into that file, never into this
one** — this file's own sections are referred to by name — and where the two disagree
**that one is right**. This one is the our-side half — what the form sends, what it does
with each answer, and the decisions we made.

It deliberately restates **no price and no table**. A second copy of a price sheet is how
one goes stale, and a stale-but-plausible number quoted to a customer is worse than no
number, because the business then has to honour it or explain itself.

Open questions are at the end.

---

## 1. State of play: nothing quotes yet, and none of it is ours to fix

Four defects sit between this form and a live price. All four are on the client's side of
the wire, and the first two block every quote on every channel (§2):

1. **No pricing credential has been minted for this client.** Every route answers `401`.
   Not "wrong key" — no key of any kind exists in the Supabase row.
2. **The config fails validation**, so the moment a key exists the routes it grants answer
   `422 invalid_config` instead. `field_mapping.floor_level` is missing.
3. **The flat scheme is wrong at both levels** (§7). The config says a flat bands on
   bedrooms; the engine bands on floors. Adding `floor_level` to `field_mapping` clears
   defect 2 and starts the client quoting a 3-bed first-floor flat at the **one-bedroom**
   price — `ok: true`, `oversized: false`, nothing in the response to flag it.
4. **Loft and Velux are declared, mapped, collected and never charged** (§6). The price
   sheet carries an add value for both in every window, fascia and gutter cell; the engine
   reads neither. Four responses varying only in them were measured byte-identical.

`config.active` is `true`, so `409 client_inactive` is not in play — and the plural
`/quotes` route is not gated by it anyway (§3).

Until 1 and 2 are resolved every row reads **"price on request"**, `canSubmit` is false,
and there is no self-serve booking. That is the designed failure, not a regression — see
*There is no local price book* below. The lead is not lost: it still persists, the contact
is still written to GHL with the property on it, and someone can call back with a price.

**Do not clear defect 2 by adding `floor_level`.** Sending it is the trap, not the fix,
and the form does not send it (*What we send* below).

## 2. The route, the selector and the key

```
browser ──► /api/pricing?action=table|commit ──► POST /api/v1/pricing/quotes
            (holds PRICING_API_KEY)               (holds the price book)
```

- **The PLURAL `/quotes` route.** It is the pure calculator: it reads no contact and
  writes nothing, so the property is the whole input. `api/_lib/pricingApi.ts` posts to
  `/api/v1/pricing/quotes`; `/api/pricing/quotes` (unversioned) is a permanent alias and
  we prefer the versioned form. The singular `/quote` needs a write-capable key, needs a
  `contactId`, and writes the price onto that contact. It also **disagrees with `/quotes`
  about which services exist** — on a house with no conservatory it prices a conservatory
  roof clean anyway and files it on the contact (§8b). We own our own writes, and we do
  not want that one.
- **The browser must never call the pricing API directly.** It sends no CORS headers,
  deliberately and permanently. `api/pricing.ts` is the only thing that holds the
  credential; `src/lib/pricing-client.ts` is the browser's only door to it.
- **The key is READ-scoped and server-side only.** `PRICING_API_KEY`, read lazily inside
  `apiKey()` rather than at module load, never `VITE_`-prefixed, never bundled. A `quote`
  key would also authenticate, and it can stamp prices onto contacts — do not hold
  capability we do not use (§3).
- **The selector is `locationId`, and it rides on `GHL_LOCATION_ID`** (via
  `_lib/supabaseServer.ts`). We Wash Everything is `A9cGvKBunXk003dXUmSV`. There is no
  hard-coded fallback any more: an unset location returns `''`, which the API answers with
  `missing_selector`. That is deliberate — the fallback used to be another client's id, so
  one env-loading hiccup sent this client's pricing calls into someone else's CRM.
- **One fetch per property**, at the property-details → quote transition
  (`StepRenderer.tsx`). It has to happen there: every input a row reads must be answered
  before that row can be quoted, and gutter and fascia read all four house inputs even
  though the conservatory answer is what decides whether the roof rows exist at all. A
  resumed session lands on the quote step without passing through property details, so
  `App.tsx` fires the same fetch on resume — otherwise the same property is quoted one way
  fresh and another way resumed.
- **Choosing a frequency or ticking an add-on costs nothing.** Neither moves a price; they
  select rows out of a table already in memory. `inputsKeyFor` keys the cache on the
  property alone — kind, bedrooms, extension, conservatory — which is what makes that
  true and what keeps the whole site inside a 60 requests/minute budget. It excludes the
  loft and Velux answers on purpose: the engine charges for neither, so a table fetched
  before they were answered is still the right table afterwards. Add them the day the
  surcharges are actually implemented (§6).
- `table` and `commit` are the same call now and both remain accepted. They used to differ
  on caching, back when pricing was one request per row.
- **4s timeout. Retries on 429 and 503 only**, honouring `Retry-After`, capped at 2s of
  waiting in total. Everything else is a real answer that will not change on a retry.
- **A 401 opens a five-minute circuit.** A bad key is not transient, and retrying it burns
  the budget and fills the log. This is the branch that fires today, on every request,
  which is exactly why it exists.

## 3. What we send

`ServiceKey` and `PricingInputs` in `src/lib/pricing.ts`. Logical input names only — GHL
field paths are the server's business, never ours.

**Four inputs, and only four.**

| Input | Sent for | Value |
|---|---|---|
| `house_type` | every property | the table's own row name, from `HOUSE_TYPE_BY_KIND` |
| `bedrooms` | every property, **flats included** | 1–5 |
| `extension` | houses only | exactly `Yes` / `No` |
| `conservatory` | houses only | exactly `Yes` / `No` |

Notably absent, and absent on purpose:

- **`floor_level`.** A flat bands on bedrooms exactly as a house does — the client's own
  rule, in `flat_banding` (§7). The engine reads `floor_level` as a bedroom column, so
  sending it quotes a 3-bed first-floor flat at the one-bedroom price with nothing in the
  response to flag it. `FlatFloor` and its two maps are gone from the codebase; the form
  no longer asks a flat which floor it is on, and `contact.floor_flat` is written blank.
- **`conservatory_roof_panels`.** There is no `unit_rate` service anywhere in this
  catalogue and the field is not in `field_mapping`; sending a count prices nothing (§4).
  Conservatory roof cleaning is a house × bedroom table here — see *The conservatory
  roof* below.
- **`loft` and `number_of_velux`.** Not pricing inputs (§6). The form still collects them,
  for the survey and the CRM.

`extension` and `conservatory` go as the exact strings or as booleans. The route's gap
check runs `parseYesNo` before the engine and it is stricter than it looks: the JSON
**number** `1` is a re-ask, and so are `"yeah"` and `"yep"`. An unreadable flag comes back
`missing_inputs` rather than silently costing the customer nothing — the right failure, and
one worth keeping by sending only `Yes` and `No` (§6).

A flat sends its house type and its bedrooms and **nothing else**. The five `Flat` cells of
both window tables carry no `add` object, so no uplift could apply, and the form does not
ask a flat either question — sending `No` for a question the customer never saw is
inventing an answer.

**The payload carries no `serviceKeys` list.** The API prices its whole catalogue by
default and reports per row why anything is unpriceable, which is strictly more information
than asking for a subset and inferring the rest.

## 4. Which rows we offer, which the API answers

Eight services exist (§4). `offeredServiceKeys` decides which of them reach a quote
screen, and that is a different question from what we ask for:

| Row | Offered to |
|---|---|
| `ext_window_6weekly`, `ext_window_12weekly` | every residential kind, flats included |
| `full_gutter_clearance`, `fascia_soffit_clean` | every house type — **townhouses included** |
| `conservatory_roof_external`, `conservatory_roof_internal` | a house that answered yes to a conservatory |
| `ext_window_oneoff`, `int_window_oneoff` | nobody, today — priced and returned, not shown |

Three of those lines changed with the rebrand and each one is a trap for anyone reading
older code:

- **Six and twelve weekly. There is no 8-weekly service in this catalogue at all**, and no
  4-weekly. `Frequency` is `6 | 12`.
- **The fascia key is `fascia_soffit_clean`**, not the `fascia_soffit_gutter` the other two
  contracts on this API use — while still writing to the same GHL field. Send the old key
  and the answer is a `200` carrying `reason: "unknown_service"`, never a `400`, and a UI
  that renders `serviceLabel` shows a service that does not exist with a blank price (§4).
- **Townhouses now buy gutter and fascia.** Every table carries a `Town house` row
  byte-identical to its `Terraced` one (§5). They were excluded under the previous
  contract, which had no such row. Nothing enforces that parity upstream — it is
  twenty-five duplicated cells maintained by hand, with no test (§11).

The two one-off cleans are an alternative to a subscription rather than an add-on to one,
so putting them on the frequency screen would ask the customer to compare a recurring price
with a one-off one. They are priced on every call regardless; add them to
`offeredServiceKeys` the day that product decision is made.

**Both conservatory roofs are separate selections** even though they always return the same
number, because they are separate lines on separate CRM fields. The internal price is read
from its own row and never copied from the external one.

**Match rows on `serviceKey`, never on position.** With `serviceKeys` omitted the response
comes back in the config's own order, which leads with the two *derived* services — so
position 0 is a one-off, not the 6-weekly a reader would expect (§3).

## 5. Reading a row: `oversized` → `ok` → `reason`

`classifyRow` in `api/_lib/pricingApi.ts` is the only place a response row is interpreted,
and the branch order is the whole point. It is not style:

1. **`oversized` first.** An oversized property returns `ok: true` **with a real price**
   that is simply not that property's price — above five bedrooms the tables clamp and
   return the top band. A nine-bedroom detached comes back priced, and the flag is the only
   thing saying so. It walks derived rows too, so a one-off carrying no bedroom count of
   its own is flagged as well (§9).
2. **`ok: false` next**, splitting on `reason`.
3. `ok: true` with a finite `price` last.

`oversized` and `ok` are also not independent: an unclassifiable property arrives
`ok: false` **and** `oversized: true` with an empty `missing` array, so code that tests `ok`
first sees "nothing missing, no price" and has nothing sensible to render.

### The display states

`PriceCell` (`src/lib/pricing.ts`) is the parsed row; `PriceDisplay` from
`src/steps/quote/usePriceDisplay.ts` is what the screen may say. `QuoteStep` and
`QuoteStepMobile` are near-identical implementations of the same table and both read that
one hook, so the two screens cannot word the same condition differently.

| API row | Cell | The customer sees | Selectable |
|---|---|---|---|
| `ok: true`, `oversized: false` | `priced` | the number, exactly as returned | yes |
| `ok: false`, `reason: "missing_inputs"` — or any other reason, or a parity hold | `not_priceable` | "Price on request" | no |
| `oversized: true` (price or not) | `oversized` | "Price on request" | no |
| no key, timeout, 401, circuit open, unreadable body, row not returned | `unavailable` | "Price on request" | no |
| `ok: false`, `reason: "not_applicable"` | `not_applicable` | **nothing — the row is removed** | n/a |

**A row is selectable if and only if it is `priced`.** There is no "price on visit" state
any more: it existed for one thing, a customer who could not count their conservatory roof
panels, and this catalogue has no panel count anywhere in it.

**`not_applicable` hides a row; `missing_inputs` asks a question.** They are different
answers and must never be collapsed. One says no answer the customer can give will ever
price this; the other names an input they can still supply.

### The two kinds of `not_applicable`, and why the cell carries `permanent`

The `reason` code does **not** distinguish its two producers. Only the message string does
(§8b), which makes it a fragile discriminator and one we treat as such:

| | permanent | this turn |
|---|---|---|
| message | `…is not available for this property type` | `…does not apply to this property` |
| Means | structural: four of the eight rows on **every flat** | the conservatory answer is currently no |
| Do | hide it forever | hide it now, re-quote if the answer changes |

`isPermanentlyInapplicable` treats an unrecognised message as **not** permanent,
deliberately. Getting it wrong that way costs one extra re-quote; getting it wrong the
other way hides two sellable services forever and nobody ever finds out.

**Never persist the verdict.** Two of the eight rows come back `not_applicable` on the
majority of requests this client will ever receive — every house that says it has no
conservatory — and a form that remembered that would have hidden conservatory roof cleaning
for good.

### Two dead ends that must not share a screen

`PriceTable.oversized` suppresses the whole table and routes to `LargeUnusualThankYou`.
Every service in this catalogue is priced from a house × bedroom table or derived from one
that is, so an oversized verdict on **any** row is a fact about the property — the old
roof-shaped exemption is gone with the per-panel service it was written for.

Separately, a table can be answered in full and still leave nothing to click:
`hasSelectableRow` is false while `oversized` is false. `StepRenderer` splits that on
`pricingUnavailable`:

- **Every offered row `unavailable` → `QuoteUnavailableStep`.** The fault is ours and says
  nothing about the property. Routing this to the large/unusual thank-you once told the
  owner of an ordinary semi-detached that their home was "large or unusual" because a
  deployment was missing its API key. It is also the state this client is in today
  (*State of play* above).
- **Anything else unpriceable → `LargeUnusualThankYou`.** The API answered and the answer
  is that it cannot price this property. Same promise as the oversized path: no number, a
  human will follow up. **This is the path every flat takes today**, because the engine
  demands `floor_level` and we will not send it (§7).

### The parity hold

`PARITY_UNRESOLVED` in `src/lib/price-table.ts` is an empty list and the mechanism around
it is kept on purpose. Put a `ServiceKey` in it and `withParityHold` rewrites that row to
`not_priceable / parity_unresolved`, so it renders "price on request" rather than letting a
number move under a customer mid-quote. Clear it once the change is signed off, or release
rows without a deploy through `PRICING_PARITY_APPROVED` (a comma-separated list of keys, or
`all`).

## 6. There is no local price book

`src/lib/costing-calc.ts` carries the vocabulary — kinds, frequencies, labels — and
deliberately no arithmetic that produces a price. When the API cannot price, `resolveQuote`
returns a quote with no numbers in it and `source: 'local'`, and every row reads **"price
on request"**. Never a guess, never a `0`.

Rules that hold everywhere:

- **Never round, adjust or recompute a returned price.** Summing distinct returned prices
  into a first-clean total is fine; re-deriving one is not.
- **Never derive a one-off from the 6-weekly figure.** Both one-offs are `2 ×` the
  external 6-weekly total **with the surcharges inside the doubling** — so a detached
  4-bed with both uplifts is `2 × (base + ext + cons)`, not `2 × base + ext + cons`. The
  naive version is fourteen pounds cheaper and looks entirely plausible. The two one-offs
  are also always identical to each other; do not present them as independent price points
  (§4).
- A row with no price contributes nothing to a total rather than a zero, and the quote
  screens print words rather than a `£0` — the largest figure on the page once told a
  customer their booking was free.
- `ghlFieldMap.ts` writes returned prices verbatim, filed under the field each row *names*
  (`ghlField`), and writes **nothing** for a row the API declined rather than a fabricated
  `0`. A field name we do not recognise is skipped and logged, never guessed at.

### The trade this makes

Every row on request means every row is unselectable, so `canSubmit` is false and **an API
outage means no self-serve booking**. That is accepted deliberately. The lead is not lost:
the submission still persists, the contact has already been written to GHL with the
property details on it, and someone can call back with a price.

`pricingSource` on the `/api/submission?action=quote` response says `api` or `local` for
every lead, so a silent fallback is visible afterwards rather than inferred.

### What `npm run check:pricing` can and cannot tell you

`scripts/pricing-check.ts` checks **our reading**, offline: which key we match a row to,
which branch we take, which number we show. Every figure in it is a fixture transcribed
from a measured response in §3 and §13 and fed back through our own code — it asserts no
price of its own, because that would be the second price book this whole design exists to
avoid.

`npm run check:pricing -- --live` runs §13's smoke tests against the real API and compares
the answers to the values the doc measured. It is inert until the first two blockers above
are resolved: today it reports the `401`, and after a key is minted it will report the
`422`.

## 7. The conservatory roof: a table, and two rows of it

**It is not priced per panel here.** Kings and GreenMaster both charge £10 a glazed panel;
this client prices conservatory roof cleaning from a house × bedroom table like everything
else (§4, §5). `ConservatoryRoofPricingInput`, `panelCountOf` and the panel question are
gone from the form, and `conservatory_roof_panels` is not sent.

Not one of that table's twenty cells carries an `add` object, so **neither the extension
nor the conservatory uplift ever moves either roof price** — the conservatory answer
decides whether the rows exist at all, not what they cost.

`conservatory_roof_internal` is a `same_as_service` of the external row and returns exactly
the same number, forever. It is still a separate selection on a separate CRM field, and its
price is read from its own row.

Both rows are gated on `conservatory` being yes. When it is not, both come back
`not_applicable` with the *this turn* message — which is the correct answer, on the
majority of requests, and not an error (§8b).

## 8. Loft and Velux are collected, and they are not pricing inputs

The form asks about a loft conversion and Velux windows, writes both to the CRM, and
**expects neither to change a price**. The price sheet carries a `loft` add value in every
window, fascia and gutter cell and a `velux` value in every window cell; the engine reads
neither. Four responses varying only in them were measured byte-identical (§6).

The answers are still worth collecting — they tell the cleaner what to expect at the
property, and the client asked for the fields, which were created for the purpose. They are
simply not on the pricing path, they are not in the cache key, and nothing in the UI may
imply that ticking either one moves a figure.

**This is a live money question, not a curiosity.** The client asked to be paid for loft
conversions and Velux windows, the sheet says what they are worth, and the engine charges
neither, on every clean, forever. It has to be settled with the client — implemented, or
struck from the sheet — and no fix to the other three defects touches it.

## 9. What the contact gets

The webform writes the property to GHL itself, through the contacts API — the inbound
webhooks are gone, so no workflow is doing this instead. The bot's drop-off resume and its
booking guard read these fields back. Prices go in each row's own `ghlField`; the property
answers go in the fields mapped in `api/_lib/ghlFieldMap.ts`.

Mutually exclusive fields are blanked rather than merely skipped: a customer who answers as
a house and then goes back and picks a flat has already had the house fields written at the
previous `syncStep`, and they would otherwise stand alongside the flat's answers forever.
`contact.floor_flat` is one of them — it exists on the live sub-account, this client does
not ask a flat its floor, and an earlier version of this form did write a label there.

**Persisting the quote is four fields larger than the eight `ghlField`s.**
`contact.first_clean_price`, `contact.regular_price`, `contact.monthly_value` and
`contact.yearly_value` are mapped but named by no quote row — they are derived from the
services the customer accepted, and we compute them. `opportunity.on_booking
.monetary_value_from` is `first_clean_price`, so the Acquisition Pipeline's deal value is
whatever we put in that field: leave it empty and every won booking shows £0 (§3).

The `booked_services` checkbox takes **exact picklist strings**, and they are not the
`serviceLabel` strings a quote returns. They live in `CHECKLIST` in `ghlFieldMap.ts`; GHL
drops a checkbox value that is not an exact option as silently as it drops an unknown field
id. `npm run check:ghl` verifies every id and every option string against the live
location, and it is the only thing that can — a bad id returns `200` and simply does not
write.

## 10. Open questions

### Loft and Velux (§6)

> Implement the two surcharges, or strike them from the price sheet?

The form collects both either way. Nothing else waits on the answer, and the money is
recurring.

### Bungalows are not on the sheet at all

There is no Bungalow row in any table. The API's own normaliser prices a bungalow that says
neither "semi" nor "terraced" as **detached** on every service, which on the add-on rows is
the dearest row there is (§4b).

The form sidesteps that by asking a bungalow customer which base type theirs is and pricing
them as an ordinary house of it — `houseKindFor` in `src/lib/property-kind.ts` returns the
`bungalowKind`, so a `HouseKind` of `'bungalow'` never exists and `house_type` never says
"bungalow". The CRM still records "Detached Bungalow" and the like through `typeOfHouse`,
so the collapse is visible after the fact.

That may be wrong in either direction: a bungalow is single-storey work and could be
cheaper, or it is a wider footprint at ground level and could be dearer.

> Does the book price a bungalow differently from the plain house type it shares a name
> with? If it does, what should we send for a semi-detached bungalow?

Do not "fix" the mapping by guessing. A guess here moves a customer-facing price.

### "Flat / Maisonette" is one option, and a maisonette spans more than one floor

`ResidentialTypeStep` offers a single "Flat / Maisonette" tile and everything behind it is
priced as a `Flat` — which the API agrees with: `flat`, `apartment` and `maisonette` all
match the same row (§4b). Now that flats band on bedrooms this is less obviously wrong than
it was under a floor number. But the `Flat` cells carry no `add` object at all, so a
maisonette's extra floor cannot be reflected in the price by any answer the customer gives.

> Does the book mean to price a maisonette as a flat? If not, is it a custom quote?

Until that is answered we are quoting maisonettes as flats, knowingly.

### The catalogue sells two services the form does not offer

Both one-off window cleans — the external and the internal — are priced on every call and
shown to nobody (*Which rows we offer* above). The internal one is also offered to **flats**
by the API, because its root service prices flats, and nothing in the config objects if
that is not the intent (§8).

> Should the form sell the one-off cleans, and to whom?

### And the one this form cannot answer for itself

Defect 3 in *State of play*. Which of §7's three fixes lands decides what a flat does here:
price from the bedrooms we already send, or become a custom quote outright. The form is written for
the first and behaves correctly under the second — it sends bedrooms and no floor, so a
correct fix needs no change here, and until then every flat reaches a human rather than a
wrong number.
