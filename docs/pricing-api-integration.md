# Webform → We Wash Everything pricing API — our side

The webform holds no price book. Every number a customer sees comes from the We Wash Everything
pricing API on the v3 bot, so the website, the chat bot, the voice bot and the booking
guard all quote the same figure.

The client publishes their own verified reference for that API — the routes, the request
and response shapes, the service catalogue, the banding rules and the reason codes. **That
document is authoritative for the wire; this one is not.** This file is the our-side half:
what our form sends, what it does with each answer, and the decisions we made. Where this
file restates a contract detail it is only to explain the behaviour hanging off it.

Open questions are at the end.

---

## 1. The route, the selector and the key

```
browser ──► /api/pricing?action=table|commit ──► POST /api/v1/pricing/quotes
            (holds PRICING_API_KEY)               (holds the price book)
```

- **The PLURAL `/quotes` route.** It is the pure calculator: it reads no contact and
  writes nothing, so the property is the whole input. `api/_lib/pricingApi.ts` posts to
  `/api/v1/pricing/quotes`; `/api/pricing/quotes` (unversioned) is a permanent alias, and
  we prefer the versioned form. The singular `/quote` needs a write key and writes the
  price onto a contact — see §6 for why that matters right now, beyond the fact that we
  own our own writes.
- **The browser must never call the pricing API directly.** It sends no CORS headers,
  deliberately and permanently. `api/pricing.ts` is the only thing that holds the
  credential; `src/lib/pricing-client.ts` is the browser's only door to it.
- **The key is READ-scoped and server-side only.** `PRICING_API_KEY`, read lazily inside
  `apiKey()` rather than at module load, never `VITE_`-prefixed, never bundled. Without
  it every row reads "price on request" — there is nothing else for it to read.
- **The selector is `locationId`, and it rides on `GHL_LOCATION_ID`** (via
  `_lib/supabaseServer.ts`). We Wash Everything is `A9cGvKBunXk003dXUmSV`. The hard-coded
  fallback in `supabaseServer.ts` and the value in `.env.example` are both still the old
  Kings id, so an environment that forgets the variable prices against the wrong client
  rather than failing loudly. Set it explicitly in Vercel and in `.env.local`.
- **One fetch per property**, at the property-details → quote transition
  (`StepRenderer.tsx`). It has to happen there: every input a row reads must be answered
  before that row can be quoted, and gutters and fascia read all four house inputs even
  though their prices do not vary with extension or conservatory. Ask earlier and *every*
  row comes back unpriceable, not just the surcharge-sensitive ones.
- **Choosing a frequency or ticking an add-on costs nothing.** Neither moves a price; they
  select rows out of a table already in memory. `inputsKeyFor` keys the cache on the
  property alone, which is what makes that true, and what keeps the whole site inside a
  ~60 requests/minute budget.
- `table` and `commit` are the same call now and both remain accepted. They used to differ
  on caching, back when pricing was one request per row.
- 4s timeout. Retries on 429 and 503 only, honouring `Retry-After`, capped at 2s of waiting
  in total. A 401 is not transient, so it opens a five-minute circuit rather than hammering
  upstream with a bad key.

## 2. What we send

`ServiceKey` and `PricingInputs` in `src/lib/pricing.ts`. Logical input names only — GHL
field paths are the server's business, never ours.

The five service keys are the whole catalogue and the whole We Wash Everything price sheet:

| Key | Priced from | Offered for |
|---|---|---|
| `ext_window_4weekly` | the four house inputs; for a flat, house type + floor | every residential kind |
| `ext_window_8weekly` | the four house inputs; for a flat, house type + floor | every residential kind |
| `full_gutter_clearance` | the four house inputs | terraced, semi-detached, detached |
| `fascia_soffit_gutter` | the four house inputs | terraced, semi-detached, detached |
| `conservatory_roof_external` | `conservatory_roof_panels` alone | a property with a conservatory and a panel count |

Two frequencies and only two (`Frequency = 4 | 8`). The Kings contract's 6-weekly,
12-weekly and one-off rows, its internal window clean and its internal roof clean are not
on the We Wash Everything sheet, so the form neither offers them nor asks about them.

**The payload carries no `serviceKeys` list.** The API prices its whole catalogue by
default and reports per row why anything is unpriceable, which is strictly more
information than asking for a subset and inferring the rest. `selectServiceKeys` states
which rows the form *expects* to be priceable and is exercised by `npm run check:pricing`.

| Input | Sent for | Value |
|---|---|---|
| `house_type` | every property | `Terraced` / `Semi Detached` / `Detached` / `Townhouse` / `Flat` (`HOUSE_TYPE_BY_KIND`) |
| `bedrooms` | houses only | 1–5 |
| `floor_level` | flats only | integer, `0` = ground (`FLOOR_LEVEL_BY_FLOOR`) |
| `extension` | houses only | `Yes` / `No` |
| `conservatory` | houses only | `Yes` / `No` |
| `conservatory_roof_panels` | a counted conservatory roof | whole number ≥ 1 |

### `floor_level` is an integer, and the CRM label is a different thing

`FLOOR_LEVEL_BY_FLOOR` maps our `FlatFloor` to the integer the API takes: `0` is the
ground floor, and the priced floors are `0`–`4`. They match **exactly** — unlike bedroom
bands, a flat floor does not fall forward to the next one or clamp to the top; a floor
above 4 comes back `floor_not_in_table` with `oversized: true`. Our floor picker stops at
the 4th, so that reason should never arrive from this form; it would the day the list grew.

`FLOOR_LABEL_BY_FLOOR` maps the same floor to words — `Ground Floor`, `1st Floor` — and it
exists **only** for the `floor_flat` contact field. The two maps are kept apart on purpose:
the API takes a number and the contact record takes a label, and collapsing them into one
map is exactly how a label ends up being posted as a pricing input, where it prices
nothing and reads as unanswered.

### A flat sends `house_type` and `floor_level`, and nothing else

The sheet prices a flat by which floor it is on. The form never asks a flat about bedrooms,
an extension or a conservatory, so the flat branch of `houseInputsOf` sends none of them:
sending `No` for a question the customer was never shown is inventing an answer that moves
a price. The same rule runs through the UI — `StepRenderer` forces `hasConservatory` to
`'no'` for a flat — and through the CRM write, which blanks bedrooms, extension,
conservatory and panels and writes the floor instead.

Flats get **window cleaning only**. Gutter, fascia and the roof clean all come back
`not_applicable` and are hidden (§3), and the form does not offer them in the first place:
`supportsAncillaryServices` refuses gutters and fascia to anything but terraced,
semi-detached and detached, and the roof row is offered only where there is a conservatory.
Showing a row and then failing to price it is worse than not showing it.

### Out of band, decided before any call

`isOutOfBand` refuses to ask at all for more than 5 or fewer than 1 bedrooms, or a flat
with no floor on it. Both route to `LargeUnusualThankYou`. It matters that the *form*
decides: the API's tables clamp above their top band, so an oversized house comes back
`ok: true` with a real-looking number that is simply the top-band rate.

## 3. Reading a row: `oversized` → `ok` → `reason`

`classifyRow` in `api/_lib/pricingApi.ts` is the only place a response row is interpreted,
and the branch order is the whole point. It is not style:

1. **`oversized` first.** An oversized property returns `ok: true` **with a real price**
   that is simply not that property's price — a 9-bedroom Detached comes back with the
   5-bedroom £22 and `oversized: true`. Showing a price whenever `ok` is true quotes the
   wrong number.
2. **`ok: false` next**, splitting on `reason`.
3. `ok: true` with a finite `price` last.

`oversized` and `ok` are also not independent: an unclassifiable property arrives
`ok: false` **and** `oversized: true` with an empty `missing` array, so code that tests
`ok` first sees "nothing missing, no price" and has nothing sensible to render.

### The four display states

`PriceCell` (`src/lib/pricing.ts`) is the parsed row; `PriceDisplay` from
`src/steps/quote/usePriceDisplay.ts` is what the screen may say. `QuoteStep` and
`QuoteStepMobile` are near-identical implementations of the same table and both read that
one hook, so the two screens cannot word the same condition differently.

| API row | Cell | Display | The customer sees | Selectable |
|---|---|---|---|---|
| `ok: true`, `oversized: false` | `priced` | `price` | the number, exactly as returned | yes |
| *(nothing emits this today — see below)* | `on_visit` | `on_visit` | "Price on visit" | yes |
| `ok: false`, `reason: "missing_inputs"` | `not_priceable` | `on_request` | "Price on request" | no |
| `oversized: true` (price or not) | `oversized` | `on_request` | "Price on request" | no |
| no key, timeout, 401, unreadable body, parity hold | `unavailable` / `not_priceable` | `on_request` | "Price on request" | no |
| `ok: false`, `reason: "not_applicable"` | `not_applicable` | `not_applicable` | **nothing — the row is removed** | n/a |

**`not_applicable` hides a row; `missing_inputs` asks a question.** They are different
answers and must never be collapsed. `not_applicable` means the service does not exist for
this property and no answer the customer can give will ever price it — a flat cannot have
its gutters cleared, whatever it says next — so inviting an enquiry for it wastes their
time and ours. `missing_inputs` names an input a customer *can* still supply, so it is a
question to ask, not a row to drop. In practice the only such input that survives to the
quote screen is `conservatory_roof_panels`, and the form has already asked it, at the
property-details step, before any call is made (§5).

Mechanics worth knowing:

- **`isHidden(display)`** is the filter callers apply *before* rendering a row. The `null`
  return inside `QuoteStep`'s price slot is a backstop, not the mechanism — a hidden row
  must not leave a heading, a checkbox or a gap behind it.
- **`oversized` never shows a number**, even though the row carries one.
- A property-level `oversized` suppresses the whole table: `PriceTable.oversized` sends the
  customer to `LargeUnusualThankYou`. The roof row is excluded from that promotion
  (`ROOF_KEY_SET`) because it is priced on panel count alone and knows nothing about the
  house, so it cannot speak for it.
- `on_visit` is declared and mapped but nothing currently emits it: an uncounted roof
  arrives as `missing_inputs` because the batch call prices the catalogue regardless.
  `carriesNoPrice` in `quoteTotals.ts` is keyed on "carries no number" rather than on
  either state, so the guard holds whichever arrives.
- `selectionIsPriced` treats a selection resting on a `not_applicable` row as unpriceable:
  the row should never have been offered.

### The parity hold

`PARITY_UNRESOLVED` in `src/lib/price-table.ts` is an empty list and the mechanism around
it is kept on purpose. Put a `ServiceKey` in it and `withParityHold` rewrites that row to
`not_priceable / parity_unresolved`, so it renders "price on request" rather than letting a
number move under a customer mid-quote. Clear it once the change is signed off, or release
rows without a deploy through `PRICING_PARITY_APPROVED` (a comma-separated list of keys, or
`all`). It is empty because every row the form offers is published in the We Wash Everything book.

## 4. There is no local price book

`src/lib/costing-calc.ts` carries the vocabulary — kinds, floors, frequencies, labels — and
deliberately no arithmetic that produces a price. When the API cannot price — no key, a
timeout, a 401, rate limiting, an unreadable body — `resolveQuote` returns a quote with no
numbers in it and `source: 'local'`, and every row reads **"price on request"**. Never a
guess, never a `0`.

Rules that hold everywhere:

- **Never round, adjust or recompute a returned price.** Summing distinct returned prices
  into a first-clean total is fine; re-deriving one is not.
- A row with no price contributes nothing to a total rather than a zero, and
  `firstCleanText` prints words rather than a `£0` — the largest, greenest figure on the
  page once told a customer their booking was free.
- `ghlFieldMap.ts` writes returned prices verbatim, filed under the field each row *names*
  (`ghlField`), and writes **nothing** for a row the API declined rather than a fabricated
  `0`. A field name we do not recognise is skipped and logged, never guessed at.

### The trade this makes

Every row on request means every row is unselectable, so `canSubmit` is false and **an API
outage means no self-serve booking**. That is accepted deliberately. The lead is not lost:
the submission still persists, the contact has already been written to GHL with the
property details on it, and someone can call back with a price. A stale-but-plausible
number is worse than none, because the business then has to honour it or explain itself.

`pricingSource` on the `/api/submission?action=quote` response says `api` or `local` for
every lead, so a silent fallback is visible afterwards rather than inferred.

## 5. The conservatory roof

**£10 per glazed panel with a £90 minimum, so 1–9 panels are all £90 — and the API owns
both numbers.** Nothing on our side may compute `panels × rate`, apply the minimum, or
clamp a returned figure up to it: read the `price` field. Those two numbers are quoted here
only to explain the shape of the row; the client doc is where they are maintained, and a
rate repeated in our UI would become an unverified claim the moment the book moved.
`src/lib/conservatory-roof-copy.ts` therefore states no rate at all — only "Priced per
glazed roof panel. Frames, sills and glazing are fully included."

The row reads `conservatory_roof_panels` and nothing else — not house type, not bedrooms,
not `conservatory: "Yes"`. The count must be a whole number ≥ 1; `0` is rejected on
purpose. "I'm not sure" supplies no number at all rather than a zero, so the row comes back
`missing_inputs` — **which is the correct answer, not an error** — and the CRM records "To
be confirmed on visit".

## 6. The client is `active: false`, and that is why the plural route matters

We Wash Everything is not switched on in the bot yet. The plural `/api/v1/pricing/quotes` is a
pure calculator and answers anyway, which is what lets us build, test and demo real prices
before go-live. The singular `/api/v1/pricing/quote` needs a write key, writes the price
onto a contact, and **409s while the client is inactive** — so a form built on it would
have nothing to show until launch day.

Nothing has to change at go-live: we stay on the plural route because we own our own CRM
writes. What is worth doing at go-live is re-running `npm run check:pricing` against the
now-active client to confirm no number moved.

## 7. What the contact gets

The webform writes the property to GHL itself, through the contacts API — the inbound
webhooks are gone, so no workflow is doing this instead. The bot's drop-off resume and its
booking guard read these fields back. Prices go in each row's own `ghlField`; the property
answers go in the fields mapped in `api/_lib/ghlFieldMap.ts`, with the flat's floor written
as a *label* (§2).

Mutually exclusive fields are blanked rather than merely skipped: a customer who answers as
a house and then goes back and picks a flat has already had the house fields written at the
previous `syncStep`, and they would otherwise stand alongside the floor forever.

Three things carried forward for whoever owns the booking guard:

- **Field ids need re-verifying wholesale before launch.** Every id in `FIELD` except
  `price4Weekly` and `floorFlat` was verified against the *Kings* location; We Wash Everything's
  custom fields carry different ids.
- `conservatory_roof_panels` was never populated by the old webhook flow — empty on all
  100 contacts sampled. A guard reading it has been reading an empty field.
- `type_of_house` holds mixed conventions in the wild: `semi_detached` from the form,
  `Semi Detached` from the bot. A guard that string-matches on it must tolerate both.

## 8. Open questions

### Bungalows are not on the We Wash Everything pricing sheet at all

There is no bungalow row anywhere in the sheet or the catalogue. The form asks a bungalow
customer which base type theirs is and prices them as an ordinary house of that type —
`houseKindFor` in `StepRenderer.tsx` returns the `bungalowKind`, so a `HouseKind` of
`'bungalow'` never exists and `house_type` never says "bungalow". The CRM still records
"Detached Bungalow" and the like through `typeOfHouse`, so the collapse is visible after
the fact.

That may be wrong in either direction: a bungalow is single-storey work and could be
cheaper, or it is a wider footprint at ground level and could be dearer.

> Does the We Wash Everything book price a bungalow differently from the plain house type it
> shares a name with? If it does, what should we send for a semi-detached bungalow?

Do not "fix" the mapping by guessing. A guess here moves a customer-facing price.

### "Flat / Maisonette" is one option, but a maisonette spans more than one floor

`ResidentialTypeStep` offers a single "Flat / Maisonette" tile, and everything behind it
is priced as a `Flat`: one `floor_level`, an integer, exactly one value. A maisonette is by
definition on two or more floors, so whichever floor the customer picks understates the
job, and the window rows are the ones that care.

> Does the book price a maisonette at all — and if so, on which input? If it does not, is a
> maisonette meant to be a custom quote (its own route to `LargeUnusualThankYou`) rather
> than a flat with a floor number attached?

Until that is answered we are quoting maisonettes as flats, knowingly.
