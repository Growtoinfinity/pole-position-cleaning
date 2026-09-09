> **ADDENDUM — verified against the live API on 2026-09-09. Three of this document's
> headline findings are now out of date, and two of them invert its advice.**
>
> This file is kept verbatim below as the client supplied it. What actually changed:
>
> | Section | Says | Measured live |
> |---|---|---|
> | §2 | no pricing key exists; the config fails to load (401 then 422) | Both fixed. A READ key exists and `GET /config` answers 200. |
> | §6 | `loft` and `number_of_velux` are declared but **never charged** | **Both are charged, and `loft` is REQUIRED.** Omit it and all eight rows answer `missing_inputs`, so nothing quotes at all. A loft conversion adds £2 per window row, £6 fascia, £5 gutter on a 3-bed semi; each Velux adds £1 to the window rows only. |
> | §7 | flats are a silent-wrong-answer trap; `floor_level` is the wrong fix | Fixed as the **bedrooms-banded** option. `floor_level` is gone from `requiredInputs`; a Flat prices from `bedrooms` alone and ignores extension, conservatory, loft and Velux. |
>
> `requiredInputs` is now `["house_type","bedrooms","extension","conservatory","loft","number_of_velux"]`.
>
> Everything else held, including the parts that matter most: `oversized` must still be
> read before `ok`, the two `not_applicable` producers still differ only by message
> string, and the one-offs still double the whole subtotal including uplifts.
>
> `npm run check:pricing -- --live` re-proves all of this against the real API.

# Pricing API — We Wash Everything

How a portal backend or web form fetches live prices for **We Wash Everything
LTD**. Companion to `docs/pricing_api.md`, which is the full reference: this
file carries only what is specific to this client, plus the places where the
general doc's examples are Kings' and would mislead you here.

**Four things are wrong with this client, in this order.** (1) No pricing key
exists, so every route answers `401` today (§2). (2) The config fails
validation, so the moment a key exists the routes it grants answer `422` and
nothing quotes (§2). (3) The flat scheme is wrong at two levels — the config
cannot load, and clearing that error the obvious way makes it quote wrong
numbers silently (§7). (4) Two of the four declared surcharges, loft and velux,
are money the engine will never charge, on every clean, forever — and no fix to
(1)-(3) touches it (§6).

Provenance, because it is not the same as the other two per-client docs.
**Nothing here was produced by running the handlers against this client as it
stands — the handlers refuse to load its config (§2).** Three kinds of
statement appear, and they are marked wherever the difference matters:

- **Read** — transcribed from the live `client_configs` row in Supabase
  (project `qmkovbptmgtfydolohue`, `client_id` `wewasheverything`, `updated_at`
  `2026-09-04T15:03:33.259+00:00`). Every price and every add value in §5 is of this
  kind. They are what the client is selling; they are not yet what the API
  returns, because the API returns nothing for this client.
- **Measured** — produced by driving the real `createApp` /
  `createPricingHandlers` / `createConfigLoader` over real HTTP against that
  exact row with **two keys added and nothing else touched**: a pricing
  credential, so auth passes, and `field_mapping.floor_level`, so the config
  loads. That is the state this client lands in the moment someone clears the
  §2 error the obvious way — which is precisely the state §7 argues against.
  Every quoted price outside §5 is of this kind, §13's expectations included.
  Read them as "what you will get if you fix it wrongly", not as production
  behaviour.
- **Predicted** — read out of the engine source, with the file and line given,
  and never observed. Used only where no measurement was possible.

There is no `config/wewasheverything_config.json` in the repo and no
`test/pricing-wewasheverything.test.js` (see §11). `grep -rn wewasheverything
src/ test/ scripts/ config/` returns nothing. The config exists only in the
database.

**Base URL:** `https://v3-bot-production-5b9f.up.railway.app`

---

## 1. The account

| | |
|---|---|
| `locationId` (preferred selector) | `A9cGvKBunXk003dXUmSV` |
| `clientId` (alternative) | `wewasheverything` |
| `pricingModel` | `matrix` |
| Business | We Wash Everything LTD |

Persona, timezone, owner and contact details are in the onboarding doc. Nothing
in that list is accepted, returned, or read by this API.

Send one or the other selector on every request — query string on `GET`, body
on `POST`. Both `camelCase` and `snake_case` spellings are accepted.
`docs/pricing_api.md` hardcodes Kings' `zfgtbqDWRUrkaHTmvrO7` in every runnable
example. Substitute the id above.

Coverage is **not** part of this API. `GET /api/v1/pricing/config` returns
`clientId`, `pricingModel`, `pricing`, `fieldMapping`, `serviceCatalog`,
`requiredInputs` and `pricingEngineRules` and nothing else
(`src/server/pricing-handlers.js:91-102`); postcode questions go to the bot's
own coverage check. This client's outward-code list and its decision to return
no route days are in the onboarding doc.

---

## 2. Right now: no key exists, and behind it the config does not load

`config.active` is `true` and version 1. That is not the problem. The problem is
that the config fails validation, so **no route that reads it can answer at
all**. Loading it throws:

```
InvalidConfigError: client "wewasheverything": invalid pricing config (model "matrix"):
field_mapping.floor_level is missing — a flat-aware scheme prices flats from it
```

That string is pushed at `src/pricing/matrix.js:924` and thrown at
`src/config-loader.js:91`. It was the only entry in the pricing error list. That
does not prove it is the only load blocker: `validateConfig` throws here before
it checks `coverage`, `flow.require_contact_tag`, `flow.ingress`,
`identity.timezone` and `follow_up` (`src/config-loader.js:96`, `:103`, `:118`,
`:129`, `:144`), so a second defect could surface once this one is fixed. The
model is reported as `"matrix"` by the `config.pricing.model ?? 'matrix'`
fallback in that same message — there is no `pricing.model` key in this config.

Why it trips: the two window services declare `house_type_normalization:
"with_flats"`, so `flatsDeclared(config)` is true
(`src/pricing/matrix.js:612-614`, `FLAT_SCHEMES` at `:119`), which makes
`field_mapping.floor_level` mandatory (`:915-925`). The config maps 25 logical
fields and `floor_level` is not one of them.

And it says so on purpose. `_field_mapping_note` reads: "There is deliberately
NO floor_level (this client flats band on bedrooms, and the live
contact.floor_flat field is left unused)." The GHL field exists and is empty.
Adding one line to `field_mapping` is all it takes to clear the error, which is
precisely the problem — §7.

**What a caller sees today is not the 422. It is a `401`.** This client has no
pricing credential of any kind: `credentials` holds `auth_mode`,
`ghl_pit_token` and `webhook_secret` and nothing else, none of which matches
`PRICING_KEY_NAME_RE` (`src/server/index.js:527`), so `getPricingKeys` returns
`{ clientId }` and no key names, `authorizePricingApi` finds nothing configured
for the route, and every request dies at `src/server/app.js:422`. **Measured**,
on the live config, with a Bearer token and with no `Authorization` header at
all:

```
POST /api/v1/pricing/quotes   -> 401  {"error":"unauthorized"}
```

That happens **before** `getClientContext` ever runs, so the validation failure
above is invisible from outside. Key lookup deliberately skips validation, so
that a quarantined client can still authenticate to the endpoint that repairs
it (`src/config-loader.js:463-484`). The 401 is not a hint that the config is
fine. It is the only answer this client can give, and it hides the one that
matters.

Mint the **admin** key and every read route flips from `401` to `422` in the
same instant. **Measured**, on the live config plus that key and nothing else:

```
config invalid   GET  /api/v1/pricing/config  -> 422 invalid_config
config invalid   POST /api/v1/pricing/quotes  -> 422 invalid_config
config invalid   POST /api/v1/pricing/quote   -> 422 invalid_config
config invalid   PUT  /api/v1/pricing/config  -> works; see below
```

```json
{ "error": "invalid_config",
  "message": "client \"wewasheverything\": invalid pricing config (model \"matrix\"): field_mapping.floor_level is missing — a flat-aware scheme prices flats from it" }
```

**That table is the admin key's answer.** A `read` key — which is what §3 and
§13 tell you to mint — flips only the two routes it grants: `GET /config` and
`POST /quotes` go to `422`, while `POST /quote` (scope `quote`) and `PUT
/config` (scope `write`) keep answering `401`, because a read key does not
grant them (`PRICING_SCOPES`, `src/server/app.js:489-505`; a credential name
that matches no permitted scope never sets `anyConfigured`, so `:415-424`
answers `401`). A `401` on `/quote` after minting a read key is the scope
boundary working, not a failed mint.

All three read routes begin with `loader.getClientContext(selector)`
(`src/server/pricing-handlers.js:87`, `:139`, `:255`), which runs the full
validation. `InvalidConfigError` maps to `422` with `error: "invalid_config"`,
carrying no `details` array — `details` is only present on the other 422,
`invalid_pricing`, which a rejected `PUT` returns (`src/server/app.js:474-481`,
`src/config-loader.js:511-516`).

Rotating a key never helps either way — a `401` here means no credential
exists, and a `422` means the config is broken, not that your credential is.
§12's error table says a `401` means "page a human"; on this client, today, it
means "nobody has minted a key yet".

`PUT /api/v1/pricing/config` is the repair channel and it works. It is also the
one pricing route the scoped keys cannot reach: it needs the admin
`pricing_api_key` (`src/server/app.js:489-492`, route at `:612`). A `read`
key returns `401` — §13's last test probes that, though it cannot prove it until
both keys exist. Mint the admin key with `node --env-file=.env
scripts/set-pricing-api-key.js wewasheverything --scope admin` (`admin` is also
the default when `--scope` is omitted), and keep it out of anything a portal
frontend or web form touches. It validates
the block you send merged over the stored config
(`src/config-loader.js:509`) rather than validating the stored config as a
whole, so a pricing block that no longer declares a flat-aware scheme passes and
is written. A pricing block that still declares `with_flats` is rejected `422
invalid_pricing` with the same sentence in `details`, because
`field_mapping.floor_level` is still absent.

**Do not fix this by adding `floor_level` to `field_mapping`.** It clears the
error and starts the client quoting wrong numbers. §7 is the whole of that
argument, and it is the section to read before touching anything.

Until the defect is resolved: no quote can be served to anyone, on any channel,
by any route. The chat spine is dead for the same reason — any inbound webhook
resolving to this client runs the same `getClientContext` and throws the same
error, and the boot sweep reports it QUARANTINED rather than merely warned,
because `active` is `true` (`src/config-loader.js:231-267`).

But two of the things wrong here are not waiting on that. §7 is the reason
clearing the load error the obvious way makes it worse, and §6 is money the
price sheet promises that the engine will not charge after any of §7's fixes —
a price-sheet defect that survives every repair to this section. Read both
before deciding what to do about §2.

---

## 3. Auth, and the endpoint you want

```
Authorization: Bearer pk_xxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

Use the **`read`** key (`credentials.pricing_read_key`). It reads the price book
and calculates, and it cannot write anything — the right blast radius for a web
form. Do not use a `quote` key here: that one is a write credential, and every
successful call with it stamps a price onto a contact record. Minting, labelled
keys and rotation are unchanged from `docs/pricing_api.md` §1; nothing about
them is client-specific. This client has **no pricing credential at all** — not
in the repo, and not in its Supabase row, whose `credentials` block holds only
`auth_mode`, `ghl_pit_token` and `webhook_secret`. Nothing here answers anything
but `401` until one is minted:

```
node --env-file=.env scripts/set-pricing-api-key.js wewasheverything --scope read
```

**Server-to-server only.** No CORS headers, by design. Your backend calls this
API; your frontend calls your backend. A key that reaches a browser is a key any
visitor can lift out of dev tools.

The key authenticates this client only — pointed at another client's
`locationId` it returns `401`, not another tenant's prices. That matters more
here than usual: three clients share this API and two of them use overlapping
service keys.

The endpoint you want:

```
POST /api/v1/pricing/quotes          <- plural. The calculator.
```

Pure calculator: reads no contact, writes nothing, needs no `contactId`,
authorised by a `read` key, and not gated by `config.active`. Request body is
`{ locationId, inputs, serviceKeys? }`; `inputs` is required and uses the
logical names from `requiredInputs`, never GHL field paths. Omit `serviceKeys`
to price the whole catalogue (never capped); supply it to price a subset (capped
at 50, `src/server/pricing-handlers.js:274-278`).

**Do not use `POST /api/v1/pricing/quote`** (singular) for a portal or form. It
needs a `contactId`, needs a write-capable `quote` key, and writes the price
onto the contact. The two routes also disagree about which services exist for a
property — see §8b.

**Row order.** Rows come back in the order you asked for them when you supply
`serviceKeys`. Omit it and they come back in the config's own service order
(`src/server/pricing-handlers.js:265`), which for this client **leads with the
two derived services**:

```
ext_window_oneoff, int_window_oneoff, ext_window_6weekly, ext_window_12weekly,
fascia_soffit_clean, full_gutter_clearance, conservatory_roof_external,
conservatory_roof_internal
```

§4's table and §13's expected values are listed in reading order, not response
order. **Match on `serviceKey`, never on position.**

What a priced row looks like. **Measured**, Detached 4-bed with both extras,
`serviceKeys: ["ext_window_oneoff"]`:

```json
{ "clientId": "wewasheverything",
  "quotes": [
    { "ok": true, "price": 82, "currency": "GBP",
      "serviceKey": "ext_window_oneoff",
      "serviceLabel": "One-off external window clean",
      "ghlField": "contact.oneoff", "oversized": false,
      "detail": { "model": "multiplier_of_service", "basedOn": "ext_window_6weekly",
                  "multiplier": 2, "includeSurcharges": true, "basedOnPrice": 41,
                  "basedOnDetail": { "model": "house_bedroom_table", "row": "Detached",
                    "bedrooms": 4, "band": 4, "exactBand": true, "base": 29,
                    "extSurcharge": 2, "consSurcharge": 10, "includeSurcharges": true } } }
  ] }
```

Three facts that row carries and nothing else in this doc states. `ghlField`
names the CRM field the price belongs in — this route writes nothing, so you
persist it yourself. A gap in one service never fails the table: every
requested key gets a row, priced or refused. And `currency` is `"GBP"` on a
priced row and `null` on an unpriced one — the batch route nulls it
(`src/server/pricing-handlers.js:421`) even though the engine sets `"GBP"`
unconditionally.

**Persisting it yourself is four fields larger than it looks.** Eight
`ghlField`s cover the per-service prices. The config maps four more money
fields that no quote row names — `contact.first_clean_price`,
`contact.regular_price`, `contact.monthly_value`, `contact.yearly_value` — and
they are derived, not returned: the caller computes them from the services the
customer accepted. `opportunity.on_booking.monetary_value_from` is
`first_clean_price`, so the Acquisition Pipeline's deal value is whatever you
put in that field. Leave it empty and every won booking shows £0.

The `written` key is deleted from every row on this route
(`src/server/pricing-handlers.js:348`), because it writes nothing. Do not look
for it.

**The whole response — the ordinary case, in the order it arrives.**
**Measured**, Semi Detached / 3 bed / extension `"No"` / conservatory `"No"`,
no `serviceKeys`. Trimmed to the fields you branch on; every row also carries
`ghlField`, and a priced row carries `detail`:

```json
{ "clientId": "wewasheverything",
  "quotes": [
    { "ok": true,  "price": 46, "currency": "GBP", "serviceKey": "ext_window_oneoff",
      "serviceLabel": "One-off external window clean", "oversized": false },
    { "ok": true,  "price": 46, "currency": "GBP", "serviceKey": "int_window_oneoff",
      "serviceLabel": "One-off internal window clean", "oversized": false },
    { "ok": true,  "price": 23, "currency": "GBP", "serviceKey": "ext_window_6weekly",
      "serviceLabel": "External window clean every 6 weeks", "oversized": false },
    { "ok": true,  "price": 33, "currency": "GBP", "serviceKey": "ext_window_12weekly",
      "serviceLabel": "External window clean every 12 weeks", "oversized": false },
    { "ok": true,  "price": 99, "currency": "GBP", "serviceKey": "fascia_soffit_clean",
      "serviceLabel": "Fascia and soffit clean", "oversized": false },
    { "ok": true,  "price": 99, "currency": "GBP", "serviceKey": "full_gutter_clearance",
      "serviceLabel": "Gutter clearance", "oversized": false },
    { "ok": false, "price": null, "currency": null, "serviceKey": "conservatory_roof_external",
      "serviceLabel": "Conservatory roof clean (external)", "oversized": false,
      "reason": "not_applicable",
      "message": "this service does not apply to this property", "missing": [] },
    { "ok": false, "price": null, "currency": null, "serviceKey": "conservatory_roof_internal",
      "serviceLabel": "Conservatory roof clean (internal)", "oversized": false,
      "reason": "not_applicable",
      "message": "this service does not apply to this property", "missing": [] }
  ] }
```

Two derived services first, two unpriced rows last, and the two unpriced ones
are the *this-turn* flavour of `not_applicable` (§8b), not the permanent one
(§8). Six of eight priced is the ordinary answer here, not a degraded one.

`requiredInputs` for this client is **measured** as `house_type`, `bedrooms`,
`extension`, `conservatory`, `floor_level` — the four table inputs
(`src/pricing/matrix.js:490`) plus `floor_level` because a flat-aware scheme is
declared (`:650-658`), plus no unit-count fields because there is no `unit_rate`
service anywhere in this config. That list holds only **while a flat-aware
scheme is declared**: under §7's third fix option `flatsDeclared` goes false and
`floor_level` drops out entirely, leaving the four table inputs alone. Read it
from `GET /config` after the fix rather than assuming; you cannot read it today,
because the route 401s and then 422s (§2).

There is no `request_quote` path here. `quoteRequestableServices(config)` filters
to services whose price hangs on a unit count
(`src/pricing/matrix.js:807-810`); with no `unit_rate` service it returns an
empty array, the tool is never exposed to the model, and
`workflows.quote_request.ghl_workflow_id` is the literal `"TBD"`, which
`src/tools.js:214` skips. Do not document or build against it.

---

## 4. What We Wash Everything sells

Eight services, **read** from the live config. Fetch the keys from
`GET /api/v1/pricing/config` rather than hardcoding them; they are reproduced
here so you can sanity-check what you get back. Listed in reading order, which
is not response order (§3).

| Service key | Model | GHL field | Normalisation |
|---|---|---|---|
| `ext_window_6weekly` | `house_bedroom_table`, `price_key` `"6"` | `contact.6weekly` | `with_flats` |
| `ext_window_12weekly` | `house_bedroom_table`, `price_key` `"12"` | `contact.12weekly` | `with_flats` |
| `ext_window_oneoff` | `multiplier_of_service`, 2 × `ext_window_6weekly` | `contact.oneoff` | — |
| `int_window_oneoff` | `multiplier_of_service`, 2 × `ext_window_6weekly` | `contact.ad_hoc_internal_window_cleaning` | — |
| `fascia_soffit_clean` | `house_bedroom_table`, `price_key` `"one"` | `contact.fascia_soffit_and_gutter_clean` | `standard` |
| `full_gutter_clearance` | `house_bedroom_table`, `price_key` `"one"` | `contact.full_gutter_clearance` | `standard` |
| `conservatory_roof_external` | `house_bedroom_table`, `price_key` `"one"` | `contact.conservatory_roof_cleaning` | `standard` |
| `conservatory_roof_internal` | `same_as_service` of `conservatory_roof_external` | `contact.con_roof` | — |

Four things in that table will catch anyone who has integrated another client:

- **`ext_window_oneoff` and `int_window_oneoff` are the same number.** Both are
  `multiplier_of_service` with `based_on: "ext_window_6weekly"`, `multiplier:
  2`, `include_surcharges: true`. The internal clean is priced from the
  **external** 6-weekly table. They differ only by `ghl_field` and catalogue
  label. Do not present them as two independent price points; do not assume an
  internal-window table exists, because there is not one.
- **The multiplier doubles the surcharges too**, not just the base.
  `compute(based_on, ctx, include_surcharges)` runs first, then the subtotal is
  multiplied (`src/pricing/matrix.js:275-287`). A Detached 4-bed with extension
  and conservatory is 2 × (29 + 2 + 10) = **82**, not 2×29 + 2 + 10 = 70.
  **Measured** at 82.
- **`conservatory_roof_internal` returns the external price verbatim.** It has
  no table and no `price_key` of its own and inherits whatever
  `includeSurcharges` the caller passed (`:288-296`). Since the external table
  carries no surcharges at all (§6), the two roof services are always equal. One
  latent trap: `recurrence()` reads a `same_as_service`'s **own** `price_key`
  and never follows `based_on` (`:894-898`), so it reports this one as a one-off.
  Correct here by luck, because the parent's `price_key` is `"one"`. Point a
  `same_as_service` at a 6-weekly parent and every booking total is wrong.
- **There is no 8-weekly window service**, and there is **no `unit_rate`
  service of any kind**. Conservatory roof cleaning is priced from a house ×
  bedroom table here, not per panel. Kings and GreenMaster both price it at
  £10/panel; sending `conservatory_roof_panels` to this client prices nothing,
  and the field is not in `field_mapping`.

The service key is `fascia_soffit_clean`, not `fascia_soffit_gutter` as in both
other clients — while still writing to the same GHL field,
`contact.fascia_soffit_and_gutter_clean`. Anyone diffing configs will trip on
that rename, and it fails quietly. Send the old key and you get a `200`, not a
`400`. **Measured**:

```json
{ "ok": false, "price": null, "currency": null,
  "serviceKey": "fascia_soffit_gutter", "serviceLabel": "fascia_soffit_gutter",
  "reason": "unknown_service", "message": "unknown service \"fascia_soffit_gutter\"",
  "missing": [], "oversized": false }
```

The label echoes the key you sent, because there is no catalogue entry to name
it (`src/server/pricing-handlers.js:305`). A UI that renders `serviceLabel` will
show a service that does not exist, with a blank price. Validate `serviceKeys`
against `GET /config` before you send them.

The eight `serviceLabel` strings a quote returns, with their catalogue
categories. **Read** from the same live row as §5, because `GET /config` cannot
serve them today (§2):

```
ext_window_6weekly          window_cleaning  External window clean every 6 weeks
ext_window_12weekly         window_cleaning  External window clean every 12 weeks
ext_window_oneoff           window_cleaning  One-off external window clean
int_window_oneoff           addon            One-off internal window clean
full_gutter_clearance       addon            Gutter clearance
fascia_soffit_clean         addon            Fascia and soffit clean
conservatory_roof_external  addon            Conservatory roof clean (external)
conservatory_roof_internal  addon            Conservatory roof clean (internal)
```

`int_window_oneoff` is categorised `addon`, not `window_cleaning`, despite being
a window service and despite being priced off the external window table. If you
group the form by `category`, the internal clean lands with gutters and fascia.

`service_catalog` holds the same eight keys as `pricing.services`, so there is
no orphan on either side. Its `booked_service_option` strings are the exact
picklist labels of the `contact.booked_services` checkbox field (id
`DU0xRlJOZuH0wnmvbdog`), verified byte-exact against the live field on
2026-09-02: `6 weekly external window cleaning`, `12 weekly external window
cleaning`, `one off external window cleaning`, `one off internal window
cleaning`, `gutter clearance`, `fascia and soffit clean`, `conservatory roof
cleaning external`, `conservatory roof cleaning internal`. These are **not** the
`serviceLabel` strings a quote returns — those are the `label` field, listed
above.

`field_mapping` has 25 entries and no `floor_level` (§2). **The four pricing
inputs map to `contact.type_of_house`, `contact.number_of_bedrooms`,
`contact.extension` and `contact.conservatory`.** Those are the fields a portal
writes the customer's answers back to; the API itself takes only the logical
names (§3). Three notes on the rest:

- `type_of_property` (`contact.tyoe_of_property`) is the residential/commercial
  router — `workflows.booking_commercial` carries it alongside `business_name`
  and `building_type` — and **not a pricing input**. But the typo is in the
  live GHL field key and must be preserved character for character — renaming
  the field in the GHL UI does not change its key. Kings and GreenMaster carry
  the identical typo. Any doc or script that "corrects" the spelling produces a
  silent no-op write.
- `velux` (`contact.velux`): the config's own `_surcharges_note` says this
  yes/no field gates whether the count question is asked. **No code reads it** —
  `grep -rni velux src/` returns zero hits — so if that gating happens anywhere
  it happens in the client's system prompt, not here. It is not a pricing
  input, and neither is `number_of_velux`. See §6.
- `loft` (**`contact.do_you_have_a_loft_conversion`**, not `contact.loft`) is
  mapped and written and read by nothing on the pricing path either. Same §6.

---

## 4b. What `house_type` may say

Matching is **case-insensitive substring on the trimmed string**, not an enum.
`"Semi-Detached"`, `"semi detached house"` and `"SEMI"` all reach the same row.
Tested in this order (`src/pricing/matrix.js:182-220`):

| Input contains | Row used |
|---|---|
| `bungalow` + `semi` | Semi Detached |
| `bungalow` + `terrace` | Terraced |
| `bungalow`, anything else | **Detached** |
| `townhouse` / `town house` | Town house |
| `flat` / `apartment` / `maisonette` | Flat — **only** on the two 6/12-weekly window services and the two one-offs derived from them. The other four answer `not_applicable` (§8) |
| `semi` | Semi Detached |
| `detached` | Detached |
| `terrace` | Terraced |
| anything else | `invalid_house_type`, arriving with `oversized: true` — a custom quote, never a re-ask |

**Bungalow is a live input and there is no Bungalow row in any table.** A
bungalow is priced as a detached house on every service. **Measured**, 3-bed,
no extras: `bungalow` returns fascia **109** (the Detached row) where
`semi-detached bungalow` returns **99**, and both return 6-weekly 23, gutter 99.
Every bungalow customer who does not say "semi" or "terraced" pays detached
prices on the add-on services. If that is not the intent it is a price-sheet
conversation, not a bug — but nobody should discover it from a customer.

Because the bungalow test runs first, `"detached bungalow"` is Detached and
`"terraced bungalow"` is Terraced. Under the `standard` scheme used by fascia,
gutter and both roof services, `flat` matches nothing and falls through to
`invalid_house_type` — which is why §8's answers differ by route.

---

## 5. The price tables

All figures below are **read** from the live config, not produced by a run. All
`price_key` lookups are the number shown; the add values are the same cell's
`add` object.

Every table carries a **`Town house` row that is byte-identical to its
`Terraced` row** — prices and add values both, in all five tables. That is a
price-sheet decision, not an engine rule (§11). Each table below prints both
rows in full; where they read the same, they are the same, cell for cell.

### `ext_window_6weekly` — `contact.6weekly`

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Flat | 18 | 20 | 23 | 26 | 32 |
| Detached | 18 | 20 | 23 | 29 | 37 |
| Terraced | 18 | 20 | 23 | 27 | 32 |
| Town house | 18 | 20 | 23 | 27 | 32 |
| Semi Detached | 18 | 20 | 23 | 29 | 35 |

### `ext_window_12weekly` — `contact.12weekly`

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Flat | 28 | 30 | 33 | 36 | 42 |
| Detached | 28 | 30 | 33 | 45 | 47 |
| Terraced | 28 | 30 | 33 | 37 | 42 |
| Town house | 28 | 30 | 33 | 37 | 42 |
| Semi Detached | 28 | 30 | 33 | 39 | 45 |

### Add values for both window tables

Numerically identical across the two tables. Constant across all four house
types; only `cons` varies, and only by band:

| Add key | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| `ext` | 2 | 2 | 2 | 2 | 2 |
| `cons` | 5 | 5 | 7 | 10 | 10 |
| `loft` | 2 | 2 | 2 | 2 | 2 |
| `velux` | 1 | 1 | 1 | 1 | 1 |

**Only the first two of those four columns are ever charged.** `loft` and
`velux` are declared, mapped, collected and ignored by the engine — see §6
before quoting any of these numbers to anyone.

**The five `Flat` cells carry no `add` object at all**, in either window table.
A flat is never surcharged.

### `fascia_soffit_clean` — `contact.fascia_soffit_and_gutter_clean`

No `Flat` row. Every cell carries an add object; **no cell carries a `velux`
key**.

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Detached | 60 | 80 | 109 | 119 | 139 |
| Terraced | 60 | 75 | 90 | 90 | 120 |
| Town house | 60 | 75 | 90 | 90 | 120 |
| Semi Detached | 60 | 79 | 99 | 119 | 129 |

Add values, as `ext / cons / loft`. The third column is never charged (§6):

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Detached | 5 / 5 / 5 | 5 / 5 / 5 | 6 / 6 / 6 | 7 / 7 / 7 | 7 / 7 / 7 |
| Terraced | 5 / 5 / 5 | 5 / 5 / 5 | 5 / 6 / 5 | 6 / 7 / 6 | 7 / 7 / 7 |
| Town house | 5 / 5 / 5 | 5 / 5 / 5 | 5 / 6 / 5 | 6 / 7 / 6 | 7 / 7 / 7 |
| Semi Detached | 5 / 5 / 5 | 5 / 5 / 5 | 6 / 6 / 6 | 7 / 7 / 7 | 7 / 7 / 7 |

Two figures look like transcription errors and are not. **Terraced and Town
house price 90 at band 3 and 90 again at band 4** — the price is flat across two
bedroom counts while the add values do rise (5/6/5 to 6/7/6). And **Detached
band 3 is 109**, an odd figure sitting between Semi Detached's 99 and its own
band-4 119. Both are what the live config says. Do not tidy them.

### `full_gutter_clearance` — `contact.full_gutter_clearance`

No `Flat` row. Every cell carries an add object; no `velux` key on any of them.

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Detached | 77 | 79 | 99 | 119 | 139 |
| Terraced | 70 | 79 | 99 | 119 | 139 |
| Town house | 70 | 79 | 99 | 119 | 139 |
| Semi Detached | 75 | 79 | 99 | 119 | 139 |

Add values, as `ext / cons / loft`. This and the fascia table are the two whose
add values vary along **both** axes — by band and by house type. The third
column is never charged (§6):

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Detached | 5 / 6 / 5 | 5 / 7 / 5 | 5 / 8 / 6 | 6 / 9 / 7 | 7 / 10 / 8 |
| Terraced | 5 / 5 / 5 | 5 / 5 / 5 | 5 / 6 / 5 | 6 / 7 / 6 | 7 / 7 / 7 |
| Town house | 5 / 5 / 5 | 5 / 5 / 5 | 5 / 6 / 5 | 6 / 7 / 6 | 7 / 7 / 7 |
| Semi Detached | 5 / 6 / 5 | 5 / 7 / 5 | 5 / 8 / 5 | 6 / 9 / 6 | 7 / 10 / 7 |

Fascia and gutter are two independent tables with different numbers here, which
is unique among the three clients. At band 2 on Detached the **fascia price (80)
is higher than the gutter price (79)**. That is deliberate in the sense that it
is what the sheet says; it is not a swap.

The two tables also cross once the surcharges land, and by a single pound. On a
Detached 4-bed with both extras: fascia 119 + 7 + 7 = **133**, gutter
119 + 6 + 9 = **134**. Both **measured**. Any code that assumes gutter and
fascia are the same number, or that one is always the larger, breaks here and
only here.

### `conservatory_roof_external` — `contact.conservatory_roof_cleaning`

No `Flat` row, and **not one of these 20 cells carries an `add` object**. This
service never takes an extension or conservatory uplift under any input.
`conservatory_roof_internal` (`contact.con_roof`) returns exactly these numbers.

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Detached | 60 | 75 | 99 | 119 | 139 |
| Terraced | 60 | 75 | 99 | 115 | 125 |
| Town house | 60 | 75 | 99 | 115 | 125 |
| Semi Detached | 60 | 75 | 99 | 119 | 139 |

### Derived: `ext_window_oneoff` and `int_window_oneoff`

Both are 2 × the `ext_window_6weekly` total. With no extension and no
conservatory that is:

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Flat | 36 | 40 | 46 | 52 | 64 |
| Detached | 36 | 40 | 46 | 58 | 74 |
| Terraced | 36 | 40 | 46 | 54 | 64 |
| Town house | 36 | 40 | 46 | 54 | 64 |
| Semi Detached | 36 | 40 | 46 | 58 | 70 |

With surcharges, the uplifts double as well, because they are inside the
multiplied subtotal. **Read `price`; never re-derive one of these from the
6-weekly figure yourself**, and never assume the internal and external one-offs
differ.

Cells without an `add` object, exhaustively: the five `Flat` cells of each
window table, and all 20 cells of `conservatory_roof_external`. Everything else
has one.

---

## 6. Surcharges: four are declared, two are connected

`config.pricing.surcharges` is an array of four entries. This is the only one of
the three client configs that has a surcharges array at all.

| Declared | Type | `input` | `add_key` | Actually charged? |
|---|---|---|---|---|
| Extension | `boolean` | `extension` | `ext` | Yes |
| Conservatory | `boolean` | `conservatory` | `cons` | Yes |
| Loft conversion | `boolean` | `loft` | `loft` | **No** |
| Velux windows | `per_unit`, `optional: true` | `number_of_velux` | `velux` | **No** |

**The engine reads no part of that array.** The only surcharge code in the
system is three lines:

```js
if (includeSurcharges && cell.add) {
  if (toBool(ctx.extension)) extSurcharge = cell.add.ext || 0;
  if (toBool(ctx.conservatory)) consSurcharge = cell.add.cons || 0;
}
```

`src/pricing/matrix.js:360-363`. Two hardcoded add keys, two hardcoded context
flags. `grep -rn "add_key" src/` and `grep -rn "pricing.surcharges" src/` both
return zero hits. Deleting the whole array would change no price; adding a fifth
entry would price nothing.

**How to say yes to the two that work.** Not with `toBool`, which is what the
engine uses and what a source reading suggests. On this API the reader runs
first: `parseYesNo` (`src/pricing/matrix.js:553-561`) turns each flag into
true / false / **null**, and a null makes the per-service gap check demand the
answer before the engine is ever called. **Measured**, Detached 4-bed,
`extension` varied and everything else held:

| Sent | Answer |
|---|---|
| `true`, `"Yes"`, `"yes"`, `"YES "`, `"y"`, `"true"`, `"1"` | priced, `extSurcharge: 2` |
| `false`, `"No"`, `"n"`, `"0"`, `"false"` | priced, `extSurcharge: 0` |
| `1` (the JSON **number**), `"yeah"`, `"yep"`, `"maybe"`, `null`, absent | `ok:false`, `reason:"missing_inputs"`, `missing:["extension"]` |

So an unrecognised flag does **not** silently cost the customer nothing — it
comes back as an explicit question, which is the right failure and the one worth
relying on. Note the trap it hides: `"1"` is yes and the number `1` is a
re-ask, and `"yeah"`/`"yep"` are yes to the engine's `toBool` but a re-ask to
this route. Send booleans or the exact strings `"Yes"` / `"No"`. If you need to
prove a flag landed, read `detail.extSurcharge` and `detail.consSurcharge`.

So the `loft` and `velux` numbers sitting in every window, fascia and gutter
cell are **money the engine will never charge**. `grep -rni velux src/` returns
zero hits — the string does not appear in the source at all. `loft` appears only
in three prose comments about GHL write batching at `src/ghl/store.js:102-109`,
never as a pricing input. On a Detached 5-bed gutter clearance the sheet says a
loft conversion is worth £8; the engine returns the price without it.

**Measured, and it is not subtle.** Detached 3-bed with both extras, quoted four
times: with no loft or velux fields at all; with `loft:"Yes"`; with
`loft:"Yes", velux:"Yes", number_of_velux:6`; and with `loft:true,
number_of_velux:99`. All four responses are byte-identical
(`JSON.stringify(quotes)` compared) — 6-weekly 32, 12-weekly 42, both one-offs
64, fascia 121, gutter 112, both roofs 99. Not one penny of difference. The
sheet's own `add` objects for that property say a loft conversion plus six velux
should have added £2 + £6 on every 6-weekly clean, £8 on every 12-weekly, £6 on
the gutter and £6 on the fascia. Recurring, forever, on every clean.

Two consequences a caller must not get wrong:

- The result object has **no slot** for a third boolean or a per-unit
  surcharge. `detail` carries `extSurcharge` and `consSurcharge` and nothing
  else (`src/pricing/matrix.js:365-378`). There is nowhere for a loft or velux
  figure to appear even if one were computed.
- **Do not collect a velux count expecting it to change a price.** The config's
  own `_surcharges_note` says the yes/no `contact.velux` field is not a pricing
  input; it gates whether the count question is asked. The count then feeds
  nothing.

This is not an untested aspiration. The config's `_field_mapping_note` records
that `velux` was split into a yes/no gate and a count *at the client request*,
and that both GHL fields were created on 2026-09-02 for the purpose. The client
asked to be paid for loft conversions and velux windows, the fields to collect
the answers exist, the price sheet carries the figures — and the engine charges
neither. Settle it with the client before go-live: implement the two
surcharges, or strike them from the sheet. Until then, treat every `loft` and
`velux` value in §5 as documentation of intent rather than of behaviour.

---

## 7. Flats: the tables band on bedrooms, the engine bands on floors

This is the defect behind §2, and it is worse than the error message suggests.

The config says, in `pricing_engine_rules.flat_banding` and in
`pricing.services.*.flat_banding = "bedrooms"`, that a flat is asked for its
bedroom count exactly as a house is and is never asked which floor it is on. The
`Flat` rows in both window tables are keyed `"1"` to `"5"` accordingly, and
those keys mean **bedrooms**.

`grep -rn flat_banding src/` returns **zero hits**. No code reads that key. The
engine has no bedrooms-banded flat scheme, today or at any point in its history.

What the engine does instead, at `src/pricing/matrix.js:322-335`:

```js
if (row === ROWS.FLAT) {
  const floor = parseFloorLevel(ctx.floor_level);
  if (floor === null) { ...INVALID_FLOOR_LEVEL, missing: ['floor_level'] }
  if (!Object.prototype.hasOwnProperty.call(rowObject, String(floor))) {
    return { error: fail(REASONS.FLOOR_NOT_IN_TABLE, ...) };
  }
  return { row, rowObject, floorLevel: floor, band: floor, exactBand: true };
}
```

Floor level, exact match only, no bedroom-style fallback. The bedroom band code
at `:338-345` is only reached for non-Flat rows. GreenMaster — the only working
reference for this path — keys its `Flat` rows `"0"` to `"4"` and means floors,
0 = ground, and maps `floor_level` to `contact.floor_flat`.

**A flat's price reads `floor_level` and nothing else.** `bedrooms`,
`extension` and `conservatory` are accepted, read, discarded, and never chased
(`src/pricing/matrix.js:698-712`, `:750-752`, `:834-843`). The Flat cells carry
no `add` object either (§5), so there is nothing for a surcharge to attach to.
**Measured**: on a flat, the response's `detail` carries `floorLevel` and has no
`bedrooms` key at all — the count the customer gave is simply gone. That is why
the wrong number below is not a blend of two answers. It is the floor number
used as a bedroom column.

`floor_level` accepts a non-negative integer, or a string the parser
understands: `ground` / `g` / `basement` / `lower ground` → 0, `first` through
`tenth` → 1-10, and digits with an optional ordinal suffix and an optional
trailing "floor" (`2`, `2nd`, `2nd floor`, `Ground Floor`). `"top floor"` is
deliberately null — it names a floor without saying which — as is anything else
(`src/pricing/matrix.js:147-163`). `0` is ground, as it is for GreenMaster.

**Two layers of failure, and only the first one is visible today.**

Layer one is the load error in §2: nothing quotes.

Layer two is what happens if someone clears that error the obvious way, by
adding `floor_level` to `field_mapping`. The config loads. The client starts
quoting. And the engine reads a bedroom column as a floor number. This is
**measured**, against exactly that patch:

```
Flat, 3 bedrooms, 1st floor   -> key "1" exists -> 6wk £18, 12wk £28, one-offs £36
                                                  (the 1-BEDROOM prices; the sheet says 23 / 33 / 46)
Flat, 1 bedroom,  5th floor   -> key "5" exists -> 6wk £32, 12wk £42, one-offs £64
                                                  (the 5-BEDROOM prices; the sheet says 18 / 28 / 36)
Flat, any bedrooms, ground    -> no key "0"     -> floor_not_in_table, oversized: true
Flat, any bedrooms, 6th floor -> no key "6"     -> floor_not_in_table, oversized: true
```

It cuts both ways. A 3-bed first-floor flat is **undercharged £5 a clean**; a
one-bed fifth-floor studio is **overcharged £14**, presented as a firm price,
forever. Every ground-floor flat — the commonest kind there is — is refused with
the message at `:333`, `no floor 0 in the "Flat" table — beyond the priced
floors`, and routed to a manual quote it does not need. The one-off services
double whatever wrong number comes back.

**Nothing flags the wrong ones.** A Flat row puts `floorLevel` in `detail` in
place of `bedrooms` (`:371`), and `oversized()` decides a property is beyond the
list by comparing `d.bedrooms > d.band` (`:884-886`). With no `bedrooms` key
there is nothing to compare, so **measured**, a 3-bedroom flat on the 1st floor
comes back `ok: true`, `oversized: false`, `price: 18`, with
`detail: { "model":"house_bedroom_table", "row":"Flat", "floorLevel":1,
"band":1, "exactBand":true, "base":18, ... }` and reads as a firm quote. There
is no signal in the response a caller could branch on. That is why this is a
silent-wrong-answer trap rather than a missing feature, and why **adding
`floor_level` is not the fix**.

**And the bot would start asking the opposite question.** The config's
`flat_banding` note says in as many words that a flat "is asked for its bedroom
count exactly as a house is, and is never asked which floor it is on". With
`floor_level` mapped, `missingInputs` for a flat returns *only* `['floor_level']`
and never chases bedrooms (`src/pricing/matrix.js:750-752`), and the model's
`get_quote` schema gains a `floor_level` property described as "For flats only:
the floor the flat is on — 0 for ground floor…" while `bedrooms` is downgraded
to "Required for houses; omit for a flat" (`src/agent/tool-defs.js:287-295`).
So the customer is asked their floor, the answer is written to the field the
engine uses as the band key, and it indexes a bedroom-priced table. The stated
policy and the running behaviour are exact inverses, and the inversion is
invisible because both halves appear to work.

What a correct fix requires — one of:

- **Implement the scheme the config describes.** A bedrooms-banded flat variant
  in `resolveRowAndBand`, selected by a declared key, so `Flat` rows fall
  through to the same bedroom band logic every house row uses. This is the only
  option that keeps the price sheet, the client's stated rule and the quotes in
  agreement. It is an engine change with its own tests, not a config edit.
- **Re-key the `Flat` rows to floors and map `floor_level`.** The config loads
  and prices correctly, but the numbers change meaning: five bedroom columns
  become five floor columns, ground floor needs a `"0"` key adding, and the bot
  starts asking every flat which floor it is on — which the client's own note
  says they do not want. The GHL field to map is `contact.floor_flat`, which
  already exists on the live sub-account and is currently unused (§2).
- **Drop `with_flats` from both window services.** The fastest way to a loading
  config, via `PUT /config` (§2), and the most honest interim state: no scheme
  can classify a flat, so `"flat"` becomes unclassifiable and takes the
  custom-quote path (`src/pricing/matrix.js:200-209` is the branch that stops
  matching; `:616-622` explains why the question is asked config-wide). Flats
  then get a human, not a wrong number. Note this also removes the `Flat` rows
  from reach entirely, makes §8's `not_applicable` answers into
  `invalid_house_type` + `oversized: true` ones on all eight rows, and drops
  `floor_level` out of `requiredInputs` (§3).

Whichever is chosen, decide it with the client. Do not clear a validation error
that is telling the truth.

**A flat with no floor answer.** Settled, not open: it comes back
`ok: false, reason: "missing_inputs", missing: ["floor_level"]` on all four
window rows — never the engine's own `invalid_floor_level`. The per-service gap
check runs before the engine (`src/server/pricing-handlers.js:324-332`) and
applies the same `parseFloorLevel` to the same raw value
(`src/pricing/matrix.js:843`), so `INVALID_FLOOR_LEVEL` at `:327` sits inside a
function the call never reaches. **Measured** here, and the same thing
GreenMaster observes live. Do not write a branch for `invalid_floor_level`.

---

## 8. What a flat cannot buy

Three services use `house_type_normalization: "standard"`, and a flat is not
classifiable under that scheme at all — deliberately, because the price sheet has
no `Flat` row for them:

```
ext_window_6weekly           -> priced from the Flat row
ext_window_12weekly          -> priced from the Flat row
ext_window_oneoff            -> priced (2 x the 6-weekly Flat price)
int_window_oneoff            -> priced (2 x the 6-weekly Flat price)
fascia_soffit_clean          -> not_applicable
full_gutter_clearance        -> not_applicable
conservatory_roof_external   -> not_applicable
conservatory_roof_internal   -> not_applicable
```

**Measured**, and matching `inapplicableServices` at
`src/pricing/matrix.js:793-800`, which drops a service for a flat when its key
starts `conservatory_roof` or when it does not price flats; the two one-off
window services survive because `servicePricesFlats` follows `based_on` to the
root service and finds a non-empty `Flat` row (`:540-547`). The answer is
floor-independent by construction — the same four rows refuse whether or not the
floor is known.

On `/quotes` those four rows arrive as:

```json
{ "ok": false, "price": null, "currency": null,
  "serviceKey": "full_gutter_clearance", "serviceLabel": "Gutter clearance",
  "reason": "not_applicable",
  "message": "this service is not available for this property type",
  "missing": [], "oversized": false }
```

`src/server/pricing-handlers.js:309-316`. **Hide these rows and keep them
hidden.** Do not render them greyed out with a "get in touch" link — no input
the customer can supply will ever price them. This is the permanent flavour of
`not_applicable`; §8b is the other one, and it is not permanent.

`config.messages.flat_service_not_available` records the intended customer
wording — "We only clean the windows on flats. Gutter clearance, fascia and
soffit cleaning and conservatory roof cleaning are for houses only." — but **no
code reads it**. `grep -rn flat_service_not_available src/` is empty;
`config.messages` is consulted for exactly six keys and this is not one of them
(`channel_switch_notice`, `send_delay`, `format_outbound`,
`opt_out_confirmation`, `opt_out_keywords`, `escalation_handoff` —
`src/messenger.js:240`, `:255`, `:263`, `src/server/handlers.js:470`, `:548`,
`:948`). Whatever the bot actually says on a flat comes out of the client's
`system_prompt` column. Read that sentence as design intent, exactly as §11 says
to read every other `_note` in this config.

Note that `int_window_oneoff` survives, so **internal window cleaning is offered
to flats** — its root is `ext_window_6weekly`, which is `with_flats` with a
`Flat` row, so `servicePricesFlats` is true all the way down the chain. If that
is not the business intent, nothing in the config expresses the objection and
nothing will refuse it.

Every price in that fence is subject to §7. The four window rows would be
*priced*; they would not necessarily be priced *correctly*.

---

## 8b. What a house without a conservatory cannot buy

`conservatory` is not only a surcharge flag. It gates the two roof services.
When the answer is anything but yes, `autoPlan` drops every key starting
`conservatory_roof` (`src/pricing/matrix.js:721`) and the batch route answers
them. **Measured**, Semi Detached 3-bed, `conservatory: "No"` — the most
ordinary request this client will ever receive:

```json
{ "ok": false, "price": null, "currency": null,
  "serviceKey": "conservatory_roof_external",
  "serviceLabel": "Conservatory roof clean (external)",
  "reason": "not_applicable",
  "message": "this service does not apply to this property",
  "missing": [], "oversized": false }
```

`src/server/pricing-handlers.js:333-341`. So **two of the eight rows come back
unpriced on the majority of requests**, and they are not the same kind of
refusal as §8's.

| | §8 — structural | §8b — this turn |
|---|---|---|
| `reason` | `not_applicable` | `not_applicable` |
| `message` | `this service is not available for this property type` | `this service does not apply to this property` |
| Source | `inapplicableServices`, `pricing-handlers.js:313` | `autoPlan`, `pricing-handlers.js:337` |
| Means | no input will ever price it | the conservatory answer is currently no |
| Do | hide the row | hide it **this turn**; re-quote if the answer changes |

**The `reason` code does not distinguish them. Only the message string does.**
That is a fragile discriminator and you should treat it as one: branch on it if
you must, but never cache "not applicable" as a permanent property of a service.
Send `conservatory: "Yes"` and both rows price — **measured** at 99 each on a
Semi Detached 3-bed. A form that hides conservatory roof cleaning forever
because the customer said "no conservatory" first has hidden two sellable
services, and neither the customer nor the client will ever see it happen.

**One hole worth knowing about.** The plan gate only runs when `autoPlan` says
the inputs are complete (`pricing-handlers.js:293-294`), and `autoPlan` requires
1 ≤ bedrooms ≤ 5 (`src/pricing/matrix.js:717`). Above five bedrooms the whole
applicability gate switches off. **Measured**, Detached 9-bed with
`conservatory: "No"`: all eight rows come back `ok: true`, including
`conservatory_roof_external` and `conservatory_roof_internal` at £139 each, for
a property that just said it has no conservatory. They are all
`oversized: true`, which is the only thing standing between that and a quote —
one more reason §9's branch order is not a style preference.

The singular `POST /quote` route consults **neither** producer. It runs only the
per-service gap check, which for a non-flat property does not drop
conservatory-roof services (`src/pricing/matrix.js:851-856`). So the same Semi
Detached 3-bed with `conservatory: "No"` gets a conservatory roof clean priced
at £99 on `/quote` — and that route **writes it to
`contact.conservatory_roof_cleaning`**. Two routes, one engine, disagreeing
about whether a service exists for the property, and only the disagreeing one
persists a number to the customer record. Another reason to use `/quotes`.

---

## 9. Branch order: `oversized` -> `ok` -> `reason`

**Check `oversized` before `ok`.** This is not a style preference. For a house
beyond the price list the API returns a price *and* flags it. **Predicted** from
`resolveBedroomBand` (`src/pricing/matrix.js:237-243`, which clamps to the
highest band) and `oversized` (`:871-888`), against the §5 tables:

```
Detached, ext_window_6weekly
   5 bedrooms -> ok=true  price=37  oversized=false
   6 bedrooms -> ok=true  price=37  oversized=true     <- the 5-bed price
   9 bedrooms -> ok=true  price=37  oversized=true     <- still the 5-bed price
```

A form that shows `price` whenever `ok` is true will quote £37 for a
nine-bedroom detached house. The number is real; it is simply not this
property's price. `oversized: true` means **refuse to display it** and route to
a manual quote.

The flag walks `basedOnDetail` up to five hops (`:884-886`), so a one-off window
quote for that same nine-bedroom house — which carries no bedroom count of its
own — is flagged too. Do not assume derived services are exempt. **Measured**,
Detached 9-bed, no extras: all eight rows `ok: true, oversized: true` — 6-weekly
37, 12-weekly 47, both one-offs 74, fascia 139, gutter 139, and both
conservatory roofs 139 even though the request said no conservatory (§8b).
Every one of those numbers is displayable and every one of them is wrong for the
property. `oversized` is the only thing telling you so.

| State | Looks like | Do |
|---|---|---|
| Priced | `ok: true`, `oversized: false` | Show `price` + `currency` |
| Ask | `ok: false`, `reason: "missing_inputs"`, `missing: [...]` | Ask for exactly what `missing` names |
| Hide, permanently | `ok: false`, `reason: "not_applicable"`, message `...is not available for this property type` | Drop the row. No answer will ever price it (§8) |
| Hide, this turn | `ok: false`, `reason: "not_applicable"`, message `...does not apply to this property` | Drop the row now, re-quote if the conservatory answer changes (§8b) |
| Manual quote | `oversized: true` (with or without a price) | Never show a number; hand to the team |
| Refused, unpriceable | `ok: false`, `reason: "floor_not_in_table"`, `oversized: true` | A ground-floor or 6th-floor flat under §7. Manual quote |
| Anything else | a `reason` you do not recognise | Treat as a manual quote and log it. Never show a price, never re-ask. v1 grows additively (§14) |

The two `not_applicable` rows share a `reason` and differ only in `message`.
Branch on the message if you must, but never persist the verdict: one is a fact
about the property type, the other is a fact about this turn's answers.

`missing_inputs` and `not_applicable` are genuinely different answers — "ask
this" versus "this does not exist for them". Collapsing them either asks a
question that has no answer or hides a service the customer could have bought.
For this client `not_applicable` is not an edge case: it is four of the eight
rows on every flat (§8), and two of the eight on every house that says it has no
conservatory (§8b).

One name collision to keep straight: `missing_inputs` is both a `400` error code
(the route was called with no `inputs` object at all,
`src/server/pricing-handlers.js:259-261`) and an `ok: false` reason inside a
`200` body (`:326-330`). Different things. Branch on the status first.

---

## 10. Bedroom bands, and what happens past five

The generic rule — exact count, else the next higher band, else clamp to the
highest band for that house type — is `docs/pricing_api.md` §0 and holds here
(`src/pricing/matrix.js:237-243`). Every table runs 1 to 5 on every house type
with no gaps, so it rarely fires.

That clamp at the top is what §9's oversized flag exists to catch: more than 5
bedrooms is out of band — a large or unusual property that goes to the team for
a manual quote.

`pricing_engine_rules.bedroom_band_fallback` ends "flats included". **That part
is false.** The Flat branch never parses bedrooms at all
(`src/pricing/matrix.js:322-336`), so a 6-bedroom flat is not out of band: it
prices at whatever floor row matches, and `oversized()`'s `bedrooms > band` walk
cannot fire because the detail carries `floorLevel`, not `bedrooms` (`:371`).
A flat can only be flagged oversized by `floor_not_in_table`. One more `_note`
to read as intent (§11).

The Flat row is the exception to all of it: floors match exactly, with no
falling forward and no clamping (§7).

A studio flat is recorded as **1 bedroom**, because the tables start at the
1-bedroom band.

If `house_type` or `bedrooms` is missing, unrecognised, or not a valid integer,
the engine returns **no price** rather than guessing or defaulting. That is the
intended behaviour, and it is what the agent's missing-price fail-safe is built
on. An unclassifiable house type comes back `invalid_house_type` with
`oversized: true` (`:872`) — a custom quote, not a re-ask, because the client's
rule is never to make a customer pick a category that does not fit their home.

---

## 11. The test that does not exist

`pricing_engine_rules.townhouse` states, correctly, that a townhouse is priced
exactly as a terraced house; that the rule lives in the price sheet rather than
the engine, because every table carries a real `Town house` row generated from
its `Terraced` row; and that the engine therefore needs no folding scheme. All
true — the two rows are `JSON.stringify`-identical in all five tables today, and
**measured** end to end: bedrooms 1-5 × extension {No, Yes} × conservatory
{No, Yes} × all eight services is 160 quote rows — 140 priced, plus the 20
`conservatory_roof` rows that `conservatory: "No"` refuses identically on both
house types (§8b) — and Town house matched Terraced on every one. Replace the
house-type string wherever it occurs and the two responses are byte-identical
JSON. It occurs at more than one depth: `detail.row` on the five table
services, and `detail.basedOnDetail.row` on `ext_window_oneoff`,
`int_window_oneoff` and `conservatory_roof_internal`, which carry no `row` of
their own.

It then claims that `test/pricing-wewasheverything.test.js` asserts the two rows
stay identical, so any drift fails loudly.

**That file does not exist.** `test/` holds `pricing-api-contract`,
`pricing-api`, `pricing-flats`, `pricing-models`, `pricing-regression` and
`pricing.test.js`, and nothing named for this client. `grep -rn wewasheverything
src/ test/ scripts/ config/` returns nothing at all. So:

- The claim is substantively true and its evidence is fabricated. That parity
  was measured here, once, by hand. It is enforced nowhere.
- Nothing guards the invariant. Reprice `Terraced` through the portal and the
  `Town house` row silently keeps the old numbers — twenty-five cells across
  five tables that must be edited in pairs by hand, with no test and no warning.
- The config's own note is evidence of intent, not of coverage. **Six
  statements across five of this config's self-documenting notes** are false or
  unimplemented in the same way: this one; `flat_banding` (§7), which describes
  a scheme no code implements; `bedroom_band_fallback`'s "flats included"
  (§10); `_surcharges_note`'s optional velux count (§6), which has no mechanism
  behind it because this config declares no `unit_rate` service;
  `_surcharges_note`'s claim that loft is "priced on windows (+2), gutter
  clearance (+5 to +8) and fascia (+5 to +7)", none of which is charged (§6);
  and `_field_mapping_note`'s "this client flats band on bedrooms", which
  restates `flat_banding`'s unimplemented scheme in a second place, so
  correcting one leaves the other standing. Read every `_note` in this config
  as a design statement to be checked, never as a description of the running
  system.
  `pricing_engine_rules` has exactly one consumer in the whole system —
  `src/server/pricing-handlers.js:101`, which echoes it verbatim to the portal
  on `GET /config`. The engine never reads a word of it.

Kings takes the opposite approach — its `Town house` rows carry genuinely
different figures from `Terraced` (6-weekly band 4: Terraced 26, Town house 30).
GreenMaster uses the `townhouse_as_terraced` *scheme* for its gutter and fascia
tables, which folds the row in the engine and cannot drift. WWE is the only one
of the three that materialises the duplicate and relies on discipline to keep it.

Writing that test is cheap and it is the one thing on this page that can be
fixed without a client conversation.

---

## 12. Errors

Same table as the general doc. The ones you will actually meet here, today and
after the fix:

| Status | `error` | Meaning | Retry? |
|---|---|---|---|
| 401 | `unauthorized` | **Today, on every route, before anything else.** This client has no pricing credential (§2) | No — mint a key |
| 422 | `invalid_config` | The moment a key exists, on every read route that key grants. The config does not load (§2) | No — fix the config |
| 422 | `invalid_pricing` | A `PUT` was rejected; see `details`. Nothing was written | No |
| 400 | `missing_selector` | No `locationId` / `clientId`. Answered **before** auth, so it is not masked by the 401 | No |
| 400 | `missing_inputs` | No `inputs` object — `/quotes` always needs one | No |
| 400 | `invalid_service_keys` | `serviceKeys` was present but not a non-empty array | No |
| 400 | `too_many_services` | More than 50 caller-supplied `serviceKeys` | No |
| 429 | `rate_limited` | 60/min per tenant on the batch route (the `quote` budget; `GET /config` draws a separate 60/min `read` budget), plus a pre-auth per-IP cap of 120/min | Yes, after `Retry-After` |
| 503 | `lookup_failed` | Transient database fault | Yes, after `Retry-After` |

Retry `429` and `503` only, honouring `Retry-After`. Everything else is a real
answer.

The `401` row normally means "wrong key, or an unknown client — page a human".
On this client, today, it means nobody has minted a key. Do not page anyone
until you have checked that first.

`409 client_inactive` is not in that list because `config.active` is `true` here;
it would only affect the singular `/quote` route
(`src/server/pricing-handlers.js:150`), which you should not be using. The
portal's Stop bot switch is a separate gate that pauses the chat bot, not this
API — `docs/bot_pause_api.md`.

The `ok: false` reason codes a caller will actually see here, once the config
loads: `missing_inputs`, `not_applicable` (four rows on every flat, §8, plus
both `conservatory_roof` rows on any house answering `conservatory: "No"`, §8b),
`invalid_house_type` (arrives with `oversized: true`), `unknown_service`, and —
while §7 stands unfixed — `floor_not_in_table`.

Six codes exist in `REASONS` (`src/pricing/matrix.js:35-55`) that no caller of
either route can reach on this config, and a branch written for any of them is
dead code:

- `invalid_bedrooms`. The per-service gap check runs first and pushes `bedrooms`
  for exactly the values `parseBedrooms` rejects
  (`src/pricing/matrix.js:853`), so you get `missing_inputs` with
  `missing: ["bedrooms"]`. **Measured**: `bedrooms: "abc"` returns
  `missing_inputs`, never `invalid_bedrooms`. A count above 5 parses fine,
  clamps, and flags `oversized` (§9).
- `invalid_floor_level`. Same interception, same reason (§7).
- `missing_unit_count`. It belongs to `unit_rate` services and this client has
  none.
- `empty_table_row`. A house-type row with no bands (`:343`). Every row here
  carries `"1"` to `"5"`.
- `config_error`. A cell that exists but carries no value under the service's
  `price_key` (`:355`), an unknown `model`, or a missing `table` (`:298`,
  `:309`). Unreachable today — every cell carries its `price_key` and every
  declared model is valid — and the most likely thing to see if §7's second fix
  re-keys the `Flat` rows and misses a cell.
- `cycle`. A `based_on` loop (`:263-265`). The two chains here
  (`*_oneoff` → `ext_window_6weekly`, `conservatory_roof_internal` →
  `conservatory_roof_external`) are one hop and acyclic.

A seventh, `house_type_not_in_table`, you will also not see: every row this
client's normalizer can produce exists in every table it applies to. That
leaves three of the ten `REASONS` codes reachable here — `unknown_service`,
`invalid_house_type` and, while §7 stands unfixed, `floor_not_in_table` —
alongside the route-level `missing_inputs` and `not_applicable` above.

---

## 13. Smoke tests — after the fix

**None of these can pass today, and today they do not even reach the config.**
With no pricing key minted, every one returns `401 unauthorized`. Mint a `read`
key and tests 1 to 7c return `422 invalid_config` until §2 is resolved — the
final `PUT` probe is a different case, and the end of this section is about
why. They are written to be run immediately after the fix, as the check that it
did what was intended.

Every expected value below is **measured** — real handlers, real HTTP, against
the live config with a key and `field_mapping.floor_level` added and nothing
else. That is the wrong fix (§7). It is deliberately the state these numbers
describe, so that running them tells you which fix actually landed: tests 7, 7b
and 7c below **fail on purpose** if the flat scheme was repaired properly.
Tests 1-6 are unaffected by any of §7's options.

Rows come back derived-first (§3). Match on `serviceKey`, not position.

```bash
LOC=A9cGvKBunXk003dXUmSV
BASE=https://v3-bot-production-5b9f.up.railway.app
READ_KEY=          # paste the key printed by:
                   # node --env-file=.env scripts/set-pricing-api-key.js wewasheverything --scope read

# 1. Auth + connectivity. Expect 200, pricingModel "matrix", 8 services.
#    401 means the server matched no credential — check you actually pasted
#    READ_KEY, that it is this client's key, and that $LOC is right, before
#    concluding no key was minted. The response cannot tell those apart; only
#    the bot server's log line can (src/server/app.js:415-424).
#    422 invalid_config means the fix has not landed.
curl -H "Authorization: Bearer $READ_KEY" \
  "$BASE/api/v1/pricing/config?locationId=$LOC"
```

```bash
# 2. A house, no extras. Expect 8 rows: SIX priced and TWO refused.
#      ok:true   6weekly 23, 12weekly 33, oneoff 46, int oneoff 46,
#                fascia 99, gutter 99   (all oversized:false)
#      ok:false  conservatory_roof_external and conservatory_roof_internal,
#                reason "not_applicable",
#                message "this service does not apply to this property"
#    That is CORRECT, not a failure: conservatory is No, so there is no roof
#    to clean (section 8b). Re-run with conservatory "Yes" and both price at 99,
#    while every other row moves: 6weekly 30, 12weekly 40, both one-offs 60,
#    fascia 105, gutter 107.
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Semi Detached","bedrooms":3,"extension":"No","conservatory":"No"}}'
```

```bash
# 3. Surcharges, and the doubling. Detached 4-bed with both extras. All 8 priced.
#      6weekly     41   (29 + ext 2 + cons 10)
#      12weekly    57   (45 + 2 + 10)
#      oneoff      82   (2 x 41) — NOT 2x29+2+10 = 70
#      int oneoff  82   (identical to oneoff, always)
#      fascia     133   (119 + 7 + 7)
#      gutter     134   (119 + 6 + 9)   <- the one pound where gutter exceeds fascia
#      roof ext   119, roof int 119     <- that table carries no add object,
#                                          so neither extra changes it. Conservatory
#                                          "Yes" is what makes these two rows appear
#                                          at all (section 8b).
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Detached","bedrooms":4,"extension":"Yes","conservatory":"Yes"}}'
```

```bash
# 4. The two one-offs are the same number. Expect ext_window_oneoff and
#    int_window_oneoff both 64, on every input, forever.
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","serviceKeys":["ext_window_oneoff","int_window_oneoff"],"inputs":{"house_type":"Terraced","bedrooms":5,"extension":"No","conservatory":"No"}}'
```

```bash
# 5. Town house == Terraced. Sends conservatory "Yes" ON PURPOSE: with "No" the
#    two roof rows come back not_applicable and the one table nothing else
#    guards (section 11) is never exercised. Expect all 8 priced:
#      6weekly 37, 12weekly 47, both one-offs 74, fascia 97, gutter 126,
#      roof ext 115, roof int 115.
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Town house","bedrooms":4,"extension":"No","conservatory":"Yes"}}'

# 5b. The actual assertion: the same call as Terraced returns the SAME eight
#     numbers. Only the row string differs, and it does NOT all live at
#     detail.row: the five table services carry it there, while
#     ext_window_oneoff, int_window_oneoff and conservatory_roof_internal
#     carry it at detail.basedOnDetail.row. Normalise only the top level and
#     three rows diff and the test reads as FAILED when it passed. The
#     runnable form replaces the string at every depth:
#       diff <(... | sed 's/Town house/X/g') <(... | sed 's/Terraced/X/g')
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Terraced","bedrooms":4,"extension":"No","conservatory":"Yes"}}'
```

```bash
# 6. Oversized. Expect ALL EIGHT rows ok:true, oversized:true —
#      6weekly 37, 12weekly 47, both one-offs 74, fascia 139, gutter 139,
#      AND roof ext 139, roof int 139 despite conservatory being "No".
#    Above five bedrooms the plan gate switches off entirely (section 8b), so
#    the conservatory filter stops firing. Do NOT display any of these numbers.
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Detached","bedrooms":9,"extension":"No","conservatory":"No"}}'
```

```bash
# 7. A flat, no floor answer. Expect NO prices at all.
#      the four window rows: ok:false, reason "missing_inputs",
#                            message "still needed: floor_level",
#                            missing ["floor_level"]
#      fascia, gutter, both roofs: ok:false, reason "not_applicable",
#                            message "this service is not available for this
#                            property type" — permanent (section 8)
#    THIS TEST ALSO FAILS ON PURPOSE once section 7 is fixed, and how it fails
#    tells you which option landed. Under option 3 (drop with_flats) all EIGHT
#    rows come back ok:false, price:null, oversized:TRUE,
#    reason "invalid_house_type", message 'unrecognised house type "Flat"',
#    missing [] — no row above survives. Under option 1 (bedrooms-banded flats)
#    the four window rows PRICE from the 3 bedrooms sent: 23 / 33 / 46 / 46.
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Flat","bedrooms":3}}'
```

```bash
# 7b. THE SECTION 7 TRAP, MADE VISIBLE. A 3-bedroom flat on the 1st floor.
#     Expect ok:true, oversized:false, and 6weekly 18, 12weekly 28, both
#     one-offs 36 — the ONE-BEDROOM prices. The price sheet says 23 / 33 / 46.
#     The bedrooms you sent are discarded; detail carries floorLevel:1, band:1
#     and no bedrooms key at all.
#     If this returns 23 / 33 / 46, the flat scheme was fixed properly and this
#     test has done its job. Delete it.
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Flat","bedrooms":3,"floor_level":1}}'
```

```bash
# 7c. A GROUND-FLOOR FLAT — the commonest kind — is unquotable.
#     Expect the four window rows ok:false, reason "floor_not_in_table",
#     message 'no floor 0 in the "Flat" table — beyond the priced floors',
#     oversized:TRUE. The other four are not_applicable as in test 7.
#     Same answer for floor_level 6. Also meant to fail once section 7 is
#     fixed properly.
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Flat","bedrooms":3,"floor_level":0}}'
```

A read key must not be able to save prices. This must return `401`:

```bash
curl -X PUT "$BASE/api/v1/pricing/config" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","pricing":{}}'
```

That test is **not** meaningful today, and it is the one most likely to give a
false all-clear. With no credential of any kind configured for this client, the
`401` it returns is the "nothing is configured" branch, not the scope boundary
it is meant to prove — and the body is byte-identical to the `401` a correctly
refused read key gives, and to the one a typo'd `locationId` gives
(`src/server/app.js:415-424` answers `401` on both branches; only its own log
line says which). Run it only after minting.

Then attribute it, by proving the admin key *does* reach the route. **Do not
re-send `pricing:{}` with the admin key** — that never succeeds, in any state.
`{}` declares no `services`, so `validate` returns early
(`src/pricing/matrix.js:905-907`) and the answer is `422 invalid_pricing` with
`details: ["pricing.services must be an object"]`, **measured** identically
before and after `field_mapping.floor_level` exists. It is not destructive —
validation runs before any write — but it discriminates nothing: a read key
would have been stopped one layer earlier with a `401`.

Send a real block instead: take the `pricing` object returned by `GET
/api/v1/pricing/config` and send it straight back, unchanged, with the admin
key. **Measured**, both answers are attributable to the admin key having
reached the route:

```
admin + unchanged live pricing block, §2 unresolved  -> 422 invalid_pricing,
    details ["field_mapping.floor_level is missing — a flat-aware scheme
              prices flats from it"]
admin + unchanged live pricing block, config loading -> 200 {"ok":true,
    "clientId":"wewasheverything","pricing":{…}}
```

A `401` you cannot attribute proves nothing.

---

## 14. Before you ship

None of the following is integration work, and all of it comes first. It is
listed first because it is what gets forgotten.

**Blocks any quote at all** — the four defects in the preamble:

- [ ] A pricing key has been minted for this client — there was none, and until there is, every route answers `401` (§2)
- [ ] The config loads — `GET /config` returns `200`, not `401` and not `422 invalid_config` (§2)
- [ ] The flat scheme was fixed deliberately, not by adding `floor_level` to clear the error (§7)
- [ ] The loft and velux surcharges have been settled **with the client** — implemented, or struck from the price sheet. Today the sheet promises money the engine never charges, on every clean, forever (§6)

**Blocks a safe launch, and safe maintenance after it:**

- [ ] `scripts/ghl-discover-fields.js` re-proves all 25 `field_mapping` entries against the live sub-account — an unmapped field is a silent no-op, the failure that looks like success (the config's own `_field_mapping_note`, which asks for exactly this before go-live)
- [ ] `scripts/ghl-verify-booked-services.js` confirms all eight `booked_service_option` strings still match the `contact.booked_services` picklist byte for byte (§4)
- [ ] `config/wewasheverything_config.json` is seeded in the repo, matching the live Supabase row — this client exists only in the database, unlike the other two
- [ ] `test/pricing-wewasheverything.test.js` exists and asserts every `Town house` row is JSON-identical to its `Terraced` row (§11)

Then the integration itself:

- [ ] The key lives in your backend's environment, never in anything a browser downloads
- [ ] It is a `read` key, not a `quote` key
- [ ] You call `/quotes` (plural), not `/quote` — they disagree about conservatory roofs, and only `/quote` writes (§8b)
- [ ] No service key, input name, price or house type is hardcoded — all of it comes from `GET /config`
- [ ] Rows are matched on `serviceKey`, never on position (§3)
- [ ] You branch `oversized` -> `ok` -> `reason`, in that order
- [ ] `not_applicable` hides a row; `missing_inputs` asks a question — four rows of eight on a flat, two of eight on a house with no conservatory, and the second kind is **not** permanent (§8b)
- [ ] Nothing computes a one-off price as `2 × base` or assumes the two one-offs differ
- [ ] `extension` and `conservatory` are sent as booleans or the exact strings `"Yes"` / `"No"` — the number `1` is a re-ask, not a yes (§6)
- [ ] Nothing collects a loft answer or a velux count expecting either to change a price (§6)
- [ ] Unknown keys in a response are ignored, not rejected — v1 grows additively

---

## 15. Where `docs/pricing_api.md` will mislead you

The general doc is accurate about the contract and about Kings. These passages
are Kings-shaped and wrong for We Wash Everything. Line references re-checked
against the current file:

| Section | Says | Here |
|---|---|---|
| §0, oversized | A 6-bed detached is "flagged and routed to a manual quote" | It returns `ok: true` and a price (37 on 6-weekly). Only `oversized: true` marks it |
| §0, conservatory roof | "not a table at all — per roof panel" | It **is** a table here. No `unit_rate` service exists in this config, and `conservatory_roof_panels` is not mapped |
| §0, bedroom fallback | Next higher band, then clamps | True for bedroom rows. The `Flat` row matches exactly and never clamps (§7) |
| §2 | `requiredInputs` example lists `conservatory_roof_panels` | Not an input here. The four table inputs plus `floor_level` — and `floor_level` only while a flat-aware scheme is declared (§3) |
| §3.1 / §3.3 / §3.4 / §7 | `ext_window_6weekly`, `contact.6weekly` used as if generic | The key happens to exist here, with the same GHL field. Coincidence, not contract — read it from `GET /config` |
| §3.3 | `8 panels -> price 80` | No service takes a panel count. The request prices nothing |
| §3.3 | `invalid_floor_level` arrives with `missing: ["floor_level"]` | Never returned by either route. The gap check intercepts and answers `missing_inputs` (§7) |
| §3.3 | `not_applicable` is a reason the singular route returns | It is produced only in the batch route (`src/server/pricing-handlers.js:309-316`, `:333-341`). On a flat the singular route answers `invalid_house_type` + `oversized: true`; on a conservatory-less house it prices the roof anyway and writes it (§8b) |
| §3.3 | `not_applicable` has one meaning | **Two** producers here, same `reason`, different `message`: one permanent, one this-turn (§8b) |
| §3.4 | "nine services … the other seven" | Kings' catalogue. Eight services here, four `not_applicable` on any flat and two more on any house with no conservatory |
| §5 editor | A table cell holds `add: { ext, cons }` | Window cells here hold `add: { ext, cons, loft, velux }` and fascia/gutter cells `{ ext, cons, loft }` (§5). An editor built to that spec cannot see or change the extra columns — which the engine ignores anyway (§6) |
| §5 editor | `unit_rate` is "a single editable number, the `rate`" | No `unit_rate` service exists here. Also omits `minimum_charge` generally |
| §6 voice | `house_type` enum: terraced, semi-detached, detached, bungalow, townhouse | No flat value, so a flat is unreachable. This client sells window cleaning to flats. Matching is substring, not enum (§4b) |
| §6 voice | Handler reads `body.oversized` / `body.ok` / `body.price` | `/quotes` returns `{clientId, quotes:[...]}` — those live per row, one level down |
| §6 voice | Three branches: oversized / !ok / else | No branch for `not_applicable`, which arrives `ok: false, oversized: false, missing: []` and stalls the agent. Four rows per flat, two per conservatory-less house |
| §7 test | `expect price 24` for a semi-detached 3-bed | 23 here, on the same service key |
| §7 test | Test-phase gate is `require_contact_tag` | Irrelevant here. The operative gate is that no key exists and the config does not load (§2) |

Two of the general doc's Kings-shaped statements happen to hold here and are not
traps: the `2 × (base + surcharges)` rule (with different numbers — here both
one-offs are 2 × the *external* 6-weekly total), and "grids all run 1-5 on every
house type" (true as a fact about today's numbers, not as a contract; build the
grid from the union of keys present).

Most of the rows above also affect anyone integrating a future client, since
they are stated as general rules rather than as facts about Kings. They have
been left in place rather than edited so that Kings' live integration is not
disturbed.
