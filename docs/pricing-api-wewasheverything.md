# Pricing API — We Wash Everything

How a portal backend or web form fetches live prices for **We Wash Everything
LTD**. Companion to `docs/pricing_api.md`, which is the full reference: this
file carries only what is specific to this client, plus the places where the
general doc's examples are Kings' and would mislead you here.

**Read this first if you have integrated Kings or GreenMaster.** This client's
pricing shape is genuinely its own, by design, and four of its differences are
load-bearing:

- **Flats band on BEDROOMS, not floor level.** A flat is asked its bedroom
  count exactly as a house is and is never asked which floor it is on. There is
  no `floor_level` input, no `floor_level` field mapping, and no floor question
  in the bot's tool schema. GreenMaster does the opposite; Kings does not serve
  flats at all. This is the single biggest pricing-shape difference between the
  three clients (§8).
- **Four surcharges, and one of them is per-unit.** `ext` and `cons` are the
  engine's built-in pair; this client also declares `loft` (boolean) and
  `velux` (per unit, optional). It is the only client of the three that
  declares its own surcharge list, and the only one with a per-unit
  surcharge (§7).
- **Town house is a real, materialized price-sheet row**, generated from
  Terraced and asserted byte-identical to it by a test. Kings prices town
  houses differently from terraces; GreenMaster folds the row in the engine.
  Here it is data (§6, §13).
- **No route days, and no appointment slot.** 166 outward codes, no
  `routing_table`, `flow.collect_appointment_slot: false`. The team schedules
  every clean manually and phones the customer, so no day or time is ever
  collected. That is a coverage/booking fact rather than a pricing one, but it
  is why nothing in this API or the bot's tools asks for one.

None of that is a deviation to be corrected. It is what this client sells and
how, and the engine has supported it since commit `a1e2d1e`; 56 test cases lock
it in place (§13).

**What stands between you and a `200`.** As of today one credential exists:
`credentials.pricing_read_key_webform`, a read key. That is enough for a web
form — it authorizes `GET /config` and `POST /quotes`, which is the whole build
described here. It is not enough for anything that writes: `POST /quote` and
`PUT /config` answer `401` until a key of the right scope is minted, and that
`401` is correct rather than broken (§3).

Provenance. Every price, response and error below was produced by driving the
real handlers and the real engine over the real config; none of it is
hand-written. Two kinds of statement are marked where the difference matters:

- **Measured** — produced by driving the real `createApp` /
  `createPricingHandlers` / `createConfigLoader` over real HTTP, and the real
  `createPricingEngine`, against the real `config/wewasheverything_config.json`.
  The only thing injected is a scratch credential value, because a scratch value
  keeps the live key out of this document. Every price outside §6 is of this
  kind.
- **Read** — transcribed from the live `client_configs` row in Supabase
  (project `qmkovbptmgtfydolohue`, `client_id` `wewasheverything`, `updated_at`
  `2026-09-09T15:37:14.244+00:00`) or from the repo config file, which are
  identical in every price (§14). Every figure in §6 is of this kind, and every
  one of them was re-verified cell by cell against a live engine run.

Claims read out of the engine or server source, and not separately observed,
carry a file and line inline (`src/pricing/matrix.js:127`) rather than a bold
marker. Open one if a claim matters to you.

**Base URL:** `https://v3-bot-production-5b9f.up.railway.app`

---

## 1. The account

| | |
|---|---|
| `locationId` (preferred selector) | `A9cGvKBunXk003dXUmSV` |
| `clientId` (alternative) | `wewasheverything` |
| `pricingModel` | `matrix` |
| Business | We Wash Everything LTD |
| `config.active` (live) | `true` |

`pricing.model` is absent from this config and resolves to `"matrix"` by
default (`src/pricing/registry.js:75`). `GET /config` reports it as `"matrix"`
either way.

Send one selector or the other on every request — query string on `GET`, body
on `POST`. Both `camelCase` and `snake_case` spellings are accepted.
`docs/pricing_api.md` hardcodes Kings' `zfgtbqDWRUrkaHTmvrO7` in every runnable
example. Substitute the id above.

Coverage is **not** part of this API. `GET /api/v1/pricing/config` returns
exactly `clientId`, `pricingModel`, `pricing`, `fieldMapping`,
`serviceCatalog`, `requiredInputs` and `pricingEngineRules` — **measured** —
and nothing else. Nor is there a coverage endpoint anywhere on this API: those
seven keys are the whole of what it will tell you about the client.
The 166 outward codes live at `coverage.covered` in the client config, which
only the bot server reads. A form that gates on postcode therefore holds its
own copy, taken from `docs/wewasheverything-onboarding.md`, and that copy has
no drift guard: if the client adds a postcode, someone must edit both. If the
form would rather not own a list, let every postcode through, price the
property, and let the bot decline the area on the follow-up conversation —
`messages.out_of_area` is the wording it uses.

`pricingEngineRules` is prose, not data: five human-readable strings
(`house_type_normalization`, `flat_banding`, `bedroom_band_fallback`,
`missing_or_invalid_input`, `townhouse`) that explain to an admin why
"bungalow" prices as detached and why a flat bands on bedrooms. An admin editor
can surface them beside the grid. Nothing computes from them, and a
customer-facing form should not show them.

Persona, timezone, owner and contact details are in the onboarding doc too.
Nothing in that list is accepted, returned, or read by this API.

---

## 2. How this client's shape differs from the other two, and why

Every cell **measured** by running the real engine and the real config-derived
helpers over all three config files. (*) marks something unique to this client
among the three.

| | Kings Window Cleaning | GreenMaster Services | **We Wash Everything** |
|---|---|---|---|
| `clientId` | `kings-window-cleaning` | `greenmaster-services-nick` | `wewasheverything` |
| `pricingModel` | `matrix` | `matrix` | `matrix` |
| Services | 9 | 5 | **8** |
| Window frequencies | 6 / 8 / 12 wk + external one-off + internal one-off | 4 / 8 wk | (*) only 6 / 12 wk, plus the same two one-offs |
| Sub-models used | table, fixed, multiplier, unit_rate, same_as | table, unit_rate | (*) table ×5, multiplier ×2, same_as ×1 — **no `unit_rate` and no `house_bedroom_fixed` at all** |
| **Flats** | not served (`pricingSupportsFlats` false) | served, banded on **floor level** (`Flat` rows keyed `0`–`4`) | (*) **served, banded on BEDROOMS** (`flat_banding: "bedrooms"`, `Flat` rows keyed `1`–`5`) |
| `floor_level` | not an input | required input, mapped to `contact.floor_flat` | (*) **not an input, not mapped.** The live GHL field exists (clone inheritance) and is deliberately unused |
| Flat `detail` shape | n/a | `floorLevel`, no `bedrooms` | (*) `bedrooms`, no `floorLevel` |
| Flat past the top band | n/a | hard fail, `floor_not_in_table`, `price: null` | (*) **clamps like a house**: 7-bed flat returns £32, `oversized: true` |
| Surcharges declared | none (built-in `ext`+`cons`) | none (built-in pair) | (*) **four**: `ext`, `cons`, `loft` (boolean), `velux` (**per_unit**, `optional`) |
| Per-unit surcharge | none | none | (*) `velux` — the only one across all three |
| Gate-vs-price field split | none | none | (*) `contact.velux` (Yes/No) gates the *question*; `contact.number_of_velux` prices |
| `requiredInputs` | `house_type, bedrooms, extension, conservatory, conservatory_roof_panels` | `…, floor_level, conservatory_roof_panels` | (*) `house_type, bedrooms, extension, conservatory` plus **`loft`** and **`number_of_velux`** |
| Normalization schemes | `standard` only | `with_flats` + `townhouse_as_terraced` | (*) `with_flats` (windows) + **`standard`** (the other three) |
| **Town house** | real row, **own prices** | own prices on windows; folded into Terraced by scheme on gutter/fascia | (*) **real row on all five tables, generated from Terraced and test-locked to it** |
| `minimum_charge` | none | `conservatory_roof_external: 90` | (*) **none anywhere** — `detail` never carries `subtotal` / `minimumCharge` / `minimumApplied` |
| Conservatory roof | `unit_rate`, £10/panel | `unit_rate`, £10/panel, £90 minimum | (*) **a bedroom table.** No panel count is collected; `conservatory_roof_panels` is not mapped |
| `request_quote` tool | 2 services | 1 service | (*) `[]` — the tool is filtered out of the bot's tool set entirely |
| Coverage | 41 outward codes | 25 | (*) **166** — BH 3, CR 5, GU 35, KT 24, PO 17, RG 29, RH 9, SL 9, SM 3, SO 23, SP 3, TW 6 |
| Route days | 41 `routing_table` entries | none | none — `hasRouteDays` false, so `check_coverage` promises no days |
| Appointment slot | collected | `collect_appointment_slot: false` | `collect_appointment_slot: false`; `confirm_booking` has no day/time args |
| Live pricing credentials | `pricing_api_key` + `pricing_read_key_webform` | same pair | (*) **`pricing_read_key_webform` only** (§3) |

Two consequences of that table a copied integration will hit immediately:

- **Do not send `floor_level`.** It is not in `requiredInputs`, not read, and
  not validated. **Measured**: a `Flat`, 3 bedrooms, `floor_level: 4` still
  prices £23 on `band: 3` — the floor is silently ignored, not blended in.
- **Do not send `conservatory_roof_panels`.** No service takes a unit count
  here, so it prices nothing and the field is not in `field_mapping`.

---

## 3. Auth, scopes, and which key to mint

```
Authorization: Bearer pk_xxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

Header only. The secret never rides in the request body.

### What exists today

The live `credentials` block holds `auth_mode`, `ghl_pit_token`,
`webhook_secret` and **`pricing_read_key_webform`** — a read key, prefix
`pk_read_`, 51 characters, the same shape Kings and GreenMaster carry.
**Read** from the live row; the value is stripped from every config the
application layer sees, though it is readable from the row itself with
service-role access (`src/config-loader.js:299-304`).

**Measured**, driving every route with a read key as the only credential:

| Route | Scope | With the read key |
|---|---|---|
| `GET  /api/v1/pricing/config` | `read` | **200** |
| `POST /api/v1/pricing/quotes` | `calculate` | **200** |
| `POST /api/v1/pricing/quote` | `quote` | `401 {"error":"unauthorized"}` |
| `PUT  /api/v1/pricing/config` | `write` | `401 {"error":"unauthorized"}` |
| `GET  /api/v1/bot/pause` | `pause_read` | **200** |
| `PUT  /api/v1/bot/pause` | `pause_write` | `401` |
| `GET  /api/v1/usage/events` | `read` | **200** |

Both `401`s above are the scope boundary working, not a failed mint. A web form
that displays prices needs the top two rows and nothing else, so **it is
already provisioned**. Note the last three rows as blast radius: the same read
key also opens this tenant's bot-pause state and its usage ledger. That is the
designed grouping (`PRICING_SCOPES`, `src/server/app.js:489-505`) — reading who
is paused is the same tenant-scoped read as reading the price book — but a
consumer that should not see either wants its own labelled key rather than a
shared one.

### Minting what your consumer actually needs

Do not clone Kings' and GreenMaster's pair out of habit. Mint the one scope
your consumer requires.

| Scope | Credential written | Grants | Suits |
|---|---|---|---|
| `read` | `pricing_read_key` | `GET /config`, `POST /quotes`, `GET /bot/pause`, `GET /usage/events` | a form or portal that only **displays** prices |
| `quote` | `pricing_quote_key` | `POST /quotes`, `POST /quote` | a voice bot that stamps a price onto a contact |
| `admin` | `pricing_api_key` | everything, including `PUT /config` | a backend that also **saves** prices |

```
node --env-file=.env scripts/set-pricing-api-key.js wewasheverything \
  [--scope read|quote|admin] [--label <name>] [--rotate]
```

`--scope` defaults to `admin`. `--label` gives one consumer its own key for a
capability others share: `--scope read --label webform` writes
`credentials.pricing_read_key_webform`, which authorizes exactly what
`pricing_read_key` does (`credentialNamesFor`, `src/server/app.js:358-367`), so
consumers rotate independently and the server's audit line names which one
called (`authorized via credentials.<name>`, `:433`). A label must start with a
lowercase letter or digit, may then contain lowercase letters, digits and
hyphens, and is 1–32 characters.

The key is printed **once** at mint time. It is stripped from every config the
application layer sees (`src/config-loader.js:299-304`), so nothing downstream —
the pricing editor, the agent, a log line — can leak it. It is **not** hashed:
an operator with Supabase service-role access can still read it back from
`client_configs.credentials.pricing_read_key_webform`. Recover it that way if it
is merely mislaid. Use `--rotate` only if it may have leaked, and know that
rotating invalidates the old key instantly for every consumer holding it. The
script refuses to overwrite an existing key without `--rotate`, and only ever
touches the one credential for the chosen scope.

**One correction to the script's own help text.** It describes the `read` scope
as "read prices only — cannot save, cannot quote". A read key genuinely cannot
save and cannot use the writing single-quote route, but it **can** price:
`POST /quotes` authorizes on `calculate`, which admits a read key. That is
deliberate (`src/server/app.js:493-498`) — the batch route writes nothing and
reads no contact, so a public form can hold a credential that is incapable of
writing rather than a quote key whose sibling route can stamp a price onto any
contact.

### What a `401` means here

**Measured**, against the repo config exactly as it stands on disk (no pricing
credential at all), every probe returns the same two-key body:

```
GET  /api/v1/pricing/config?locationId=A9cGvKBunXk003dXUmSV  (no header)     401 {"error":"unauthorized"}
GET  /api/v1/pricing/config?clientId=wewasheverything        (guessed key)   401 {"error":"unauthorized"}
POST /api/v1/pricing/quotes                                  (guessed key)   401 {"error":"unauthorized"}
GET  /api/pricing/config?clientId=wewasheverything           (alias, none)   401 {"error":"unauthorized"}
```

`content-type: application/json; charset=utf-8`. **No `WWW-Authenticate`
header**, no `message`. The unversioned alias is not a bypass. A valid key for a
*different* client is also `401` — **measured**, this client's read key against
`clientId=kings-window-cleaning`.

Auth runs **before** the config is ever validated or resolved into a client
context — the key lookup reads the tenant's row for its credentials and nothing
more. Per route the order is
`resolveApiSelector` → `apiSelectorMissing` (400) → `authorizePricingApi`
(401/503) → `overScopeBudget` (429) → handler, and only the handler calls
`getClientContext` (`src/server/app.js:596-665`). So the response body cannot
distinguish "no key minted", "wrong key", "key for another client" and "typo'd
`locationId`". Only the server's own log line can
(`src/server/app.js:415-424`): `no usable credential for this route (accepts: …)`
versus `key MISSING from the Authorization header` / `key does not grant this
route`. Check what you pasted before paging anyone.

**Server-to-server only.** No CORS headers, by design. Your backend calls this
API; your frontend calls your backend. A key that reaches a browser is a key any
visitor can lift out of dev tools.

---

## 4. The endpoint you want

```
POST /api/v1/pricing/quotes          <- plural. The calculator.
```

Pure calculator: reads no contact, writes nothing, needs no `contactId`,
authorized by a `read` key, and **not gated by `config.active`** — pausing the
chat bot must not blank a public website's prices. Request body is
`{ locationId, inputs, serviceKeys? }`. `inputs` is required and uses the
logical names from `requiredInputs`, never GHL field paths. Omit `serviceKeys`
to price the whole catalogue (never capped); supply it to price a subset
(capped at 50, `src/server/pricing-handlers.js:274-278`).

```json
{
  "locationId": "A9cGvKBunXk003dXUmSV",
  "inputs": {
    "house_type": "Semi Detached",
    "bedrooms": 3,
    "extension": "No",
    "conservatory": "Yes",
    "loft": "No",
    "number_of_velux": 0
  }
}
```

**Do not use `POST /api/v1/pricing/quote`** (singular) for a portal or form. It
needs a `contactId`, needs a write-capable key, writes the price onto the
contact, *is* gated by `config.active`, and disagrees with the batch route about
which services exist for a property — see §9c.

### Row order

Rows come back in the order you asked for them when you supply `serviceKeys`.
Omit it and they arrive in the config's own service order
(`src/server/pricing-handlers.js:265`), **measured** as:

```
ext_window_6weekly, ext_window_12weekly, ext_window_oneoff, int_window_oneoff,
full_gutter_clearance, fascia_soffit_clean, conservatory_roof_external,
conservatory_roof_internal
```

That is today's order, not a contract. **Match on `serviceKey`, never on
position.**

### A priced row

**Measured**, Semi Detached / 3 bed / extension `"No"` / conservatory `"Yes"` /
loft `"No"`:

```json
{
  "ok": true,
  "price": 30,
  "currency": "GBP",
  "serviceKey": "ext_window_6weekly",
  "serviceLabel": "External window clean every 6 weeks",
  "ghlField": "contact.6weekly",
  "oversized": false,
  "detail": {
    "model": "house_bedroom_table",
    "row": "Semi Detached",
    "bedrooms": 3,
    "band": 3,
    "exactBand": true,
    "base": 23,
    "extSurcharge": 0,
    "consSurcharge": 7,
    "includeSurcharges": true
  }
}
```

Three facts that row carries. `ghlField` names the CRM field the price belongs
in — this route writes nothing, so you persist it yourself. A gap in one service
never fails the table: every requested key gets a row, priced or refused. And
`currency` is `"GBP"` on a priced row and **`null`** on an unpriced one — the
batch route nulls it (`src/server/pricing-handlers.js:421`) even though the
engine sets `"GBP"` unconditionally.

**A priced row carries no `missing` key at all.** `missing` appears only on
`ok:false` rows — `shapeQuote`'s refusal branch carries it
(`src/server/pricing-handlers.js:426`) and its `ok:true` branch (`:431-441`)
does not, as do the route's own refusal branches. The key set above is the whole
of it:
`ok, price, currency, serviceKey, serviceLabel, ghlField, oversized, detail` —
**measured**. Branch on `ok` first and read `missing` only inside the `ok:false`
arm; `if (row.missing.length === 0)` throws a `TypeError` on every successful
quote.

The `written` key is deleted from every row on this route (`:348`), because it
writes nothing. Do not look for it. It *is* present on the singular route
(§9c).

### Persisting it yourself is seven fields larger than it looks

Eight `ghlField`s cover the per-service prices. The config maps four more money
fields that no quote row names — `contact.first_clean_price`,
`contact.regular_price`, `contact.monthly_value`, `contact.yearly_value` — and
they are derived, not returned: the caller computes them from the services the
customer accepted. `opportunity.on_booking.monetary_value_from` is
`first_clean_price`, so the Acquisition Pipeline's deal value is whatever you
put in that field. Leave it empty and every won booking shows £0.

Three more mapped fields carry no price and no quote row, and a consumer that
books rather than merely quotes writes all three. `contact.booked_services` is
the checkbox picklist whose exact option strings are in §5;
`contact.booked_services_array` is its paired array field and is written in step
with it — filling one and not the other is the silent half-write.
`contact.quote_request_array` is the manual-quote equivalent, and
`contact.booking_completion_date` records when the first clean is due. None of
them is validated by this API: an unmapped or misspelled key is a no-op write
that returns success.

### `requiredInputs`

**Measured** from `GET /config`:

```json
["house_type","bedrooms","extension","conservatory","loft","number_of_velux"]
```

Six, and no `floor_level`. `loft` is chased when missing and blocks every price
on the property until answered; `number_of_velux` is declared `optional: true`
and is never chased (§7). Read this list from `GET /config` rather than
hardcoding it.

### There is no `request_quote` path here

`pricingQuoteRequestableServices(config)` filters to services whose price hangs
on a unit count; with no `unit_rate` service it returns `[]` — **measured** —
the tool is never exposed to the model, and
`workflows.quote_request.ghl_workflow_id` is the literal `"TBD"`. Do not
document or build against it.

### If your form also hands the lead to the bot

Pricing and hand-off are two different routes with two different credentials.
This API prices. To have the bot pick up a customer who abandoned the form, GHL
posts `POST /trigger/webform-ready` with
`{ "locationId": "A9cGvKBunXk003dXUmSV", "contact_id": "<GHL contact id>" }`. It
answers `200 {"status":"accepted"}` immediately and works asynchronously, so the
body tells you nothing about the outcome. It authenticates on
`credentials.webhook_secret`, **not** on any `pricing_*` key — a read key gets
nothing here, and a webhook secret gets nothing on the pricing routes.
`entry_points.webform_dropoff` is configured for this client and its opener is
written (`messages.webform_dropoff_opener`), but the entry point is inert until
a GHL workflow is pointed at that path for this location. That workflow is not
this integration to build; knowing it is missing is.

---

## 5. What We Wash Everything sells

Eight services, **read** from the config and confirmed against a live
`GET /config`. Fetch the keys from the API rather than hardcoding them; they are
reproduced here so you can sanity-check what you get back.

| Service key | Model | GHL field | Scheme | `flat_banding` |
|---|---|---|---|---|
| `ext_window_6weekly` | `house_bedroom_table`, `price_key` `"6"` | `contact.6weekly` | `with_flats` | `bedrooms` |
| `ext_window_12weekly` | `house_bedroom_table`, `price_key` `"12"` | `contact.12weekly` | `with_flats` | `bedrooms` |
| `ext_window_oneoff` | `multiplier_of_service`, 2 × `ext_window_6weekly` | `contact.oneoff` | — | — |
| `int_window_oneoff` | `multiplier_of_service`, 2 × `ext_window_6weekly` | `contact.ad_hoc_internal_window_cleaning` | — | — |
| `full_gutter_clearance` | `house_bedroom_table`, `price_key` `"one"` | `contact.full_gutter_clearance` | `standard` | — |
| `fascia_soffit_clean` | `house_bedroom_table`, `price_key` `"one"` | `contact.fascia_soffit_and_gutter_clean` | `standard` | — |
| `conservatory_roof_external` | `house_bedroom_table`, `price_key` `"one"` | `contact.conservatory_roof_cleaning` | `standard` | — |
| `conservatory_roof_internal` | `same_as_service` of `conservatory_roof_external` | `contact.con_roof` | — | — |

Four things in that table will catch anyone who has integrated another client:

- **`ext_window_oneoff` and `int_window_oneoff` are always the same number.**
  Both are `multiplier_of_service` on `ext_window_6weekly` with `multiplier: 2`
  and `include_surcharges: true`. The internal clean is priced from the
  **external** 6-weekly table; there is no internal-window table. They differ
  only by `ghl_field` and catalogue label. Do not present them as two
  independent price points.
- **The multiplier doubles the surcharges too**, not just the base. A Detached
  4-bed with extension and conservatory is 2 × (29 + 2 + 10) = **82**, not
  2×29 + 2 + 10 = 70. **Measured** at 82. With loft and 3 velux on top it is
  2 × 46 = **92** — **measured**. Read `price`; never re-derive a one-off from
  the 6-weekly figure yourself.
- **`conservatory_roof_internal` returns the external price verbatim.** It has
  no table and no `price_key` of its own. Since the external table carries no
  `add` object on any cell (§6), the two roof services are always equal. One
  latent trap: `recurrence()` reads a `same_as_service`'s **own** `price_key`
  and never follows `based_on` (`src/pricing/matrix.js:1116-1120`), so it reports
  this one as a one-off. Correct here by luck, because the parent's `price_key`
  is `"one"`. Point a `same_as_service` at a 6-weekly parent and every booking
  total is wrong.
- **There is no 8-weekly window service, and no `unit_rate` service of any
  kind.** Conservatory roof cleaning is priced from a house × bedroom table
  here, not per panel.

**The service key is `fascia_soffit_clean`, not `fascia_soffit_gutter`** as in
both other clients — while still writing to the same GHL field,
`contact.fascia_soffit_and_gutter_clean`. Anyone diffing configs will trip on
that, and it fails quietly: send the old key and you get a `200`, not a `400`.
**Measured**:

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

### Catalogue labels and picklist strings

**Measured** from `GET /config`, with the catalogue `category` and the exact
`booked_service_option` picklist string:

```
ext_window_6weekly          window_cleaning  External window clean every 6 weeks    | 6 weekly external window cleaning
ext_window_12weekly         window_cleaning  External window clean every 12 weeks   | 12 weekly external window cleaning
ext_window_oneoff           window_cleaning  One-off external window clean          | one off external window cleaning
int_window_oneoff           addon            One-off internal window clean          | one off internal window cleaning
full_gutter_clearance       addon            Gutter clearance                       | gutter clearance
fascia_soffit_clean         addon            Fascia and soffit clean                | fascia and soffit clean
conservatory_roof_external  addon            Conservatory roof clean (external)     | conservatory roof cleaning external
conservatory_roof_internal  addon            Conservatory roof clean (internal)     | conservatory roof cleaning internal
```

`int_window_oneoff` is categorized `addon`, not `window_cleaning`, despite being
a window service priced off the external window table. If you group the form by
`category`, the internal clean lands with gutters and fascia.

The `booked_service_option` strings are the exact picklist labels of the
`contact.booked_services` checkbox field (id `DU0xRlJOZuH0wnmvbdog`), verified
byte-exact against the live field on 2026-09-02. They are **not** the
`serviceLabel` strings a quote returns.

### Field mapping

`field_mapping` has 25 entries — **measured**, and identical in the repo file
and the live row. The six pricing inputs map to:

```
house_type       -> contact.type_of_house
bedrooms         -> contact.number_of_bedrooms
extension        -> contact.extension
conservatory     -> contact.conservatory
loft             -> contact.do_you_have_a_loft_conversion
number_of_velux  -> contact.number_of_velux
```

Those are the fields a portal writes the customer's answers back to; the API
itself takes only the logical names. Three notes on the rest:

- **`velux` (`contact.velux`) is mapped but is not a pricing input.** It is the
  yes/no gate that decides whether the count question is asked at all. Only
  `number_of_velux` prices (§7).
- **`loft` maps to `contact.do_you_have_a_loft_conversion`**, not
  `contact.loft`.
- **`type_of_property` maps to `contact.tyoe_of_property`** — the typo is in the
  live GHL field key and must be preserved character for character; renaming the
  field in the GHL UI does not change its key. Kings and GreenMaster carry the
  identical typo. Any script that "corrects" the spelling produces a silent
  no-op write. It is the residential/commercial router, not a pricing input.

There is deliberately **no** `floor_level` (§8), no `active_channel` (the
channel lock is derived), no `appointment_day_requested` /
`appointment_time_requested` (no slot is collected), and no
`conservatory_roof_panels` (no unit-rate service). All four omissions are
recorded as intentional in `docs/wewasheverything-onboarding.md`.

---

## 5b. What `house_type` may say

Matching is **case-insensitive substring on the trimmed string**, not an enum.
`"Semi-Detached"`, `"semi detached house"` and `"SEMI"` all reach the same row.
Tested in this order (`src/pricing/matrix.js:302-344`, and mirrored in this
config's own `pricing_engine_rules.house_type_normalization`):

| Input contains | Row used |
|---|---|
| `bungalow` + `semi` | Semi Detached |
| `bungalow` + `terrace` | Terraced |
| `bungalow`, anything else | **Detached** |
| `townhouse` / `town house` | Town house |
| `flat` / `apartment` / `maisonette` | Flat — **only** on the two window frequencies and the two one-offs derived from them. The other four answer `not_applicable` (§9a) |
| `semi` | Semi Detached |
| `detached` | Detached |
| `terrace` | Terraced |
| anything else | `invalid_house_type`, arriving with **`oversized: true`** — a custom quote, never a re-ask |

**Measured**: `"townhouse"` (no space) → the `Town house` row; `"maisonette"` →
`Flat`, 2-bed £20; `"apartment"` 3-bed → `Flat`, £23; `"detached bungalow"` and
plain `"bungalow"` both → `Detached`, 3-bed 6-weekly £23 and fascia £109.

**Bungalow is a live input and there is no Bungalow row in any table.** Every
bungalow customer who does not say "semi" or "terraced" pays detached prices on
the add-on services — fascia £109 at 3 beds rather than Terraced's £90. If that
is not the intent it is a price-sheet conversation, not a bug, but nobody should
discover it from a customer.

Under the `standard` scheme used by gutter, fascia and the conservatory roof, a
flat matches nothing and falls through to `invalid_house_type` — which is why
§9a's and §9c's answers differ by route.

---

## 6. The price tables

All figures **read** from the config, and re-verified cell by cell against a
live engine run: **110 table cells** (2 window services × 5 rows × 5 bands, plus
3 standard services × 4 rows × 5 bands), whole cell objects compared price and
`add` together, key-order-insensitively, repo against live — **zero
mismatches**. The `price_key` lookup is the number shown; the add values are the
same cell's `add` object.

Every table carries a **`Town house` row byte-identical to its `Terraced`
row** — prices and add values both, in all five tables. That is a price-sheet
decision, not an engine rule, and `test/pricing-wewasheverything.test.js`
asserts it for all five services so drift fails loudly (§13). Each table prints
both rows in full; where they read the same, they are the same, cell for cell.

### `ext_window_6weekly` — `contact.6weekly`

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Flat | 18 | 20 | 23 | 26 | 32 |
| Terraced | 18 | 20 | 23 | 27 | 32 |
| Town house | 18 | 20 | 23 | 27 | 32 |
| Semi Detached | 18 | 20 | 23 | 29 | 35 |
| Detached | 18 | 20 | 23 | 29 | 37 |

### `ext_window_12weekly` — `contact.12weekly`

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Flat | 28 | 30 | 33 | 36 | 42 |
| Terraced | 28 | 30 | 33 | 37 | 42 |
| Town house | 28 | 30 | 33 | 37 | 42 |
| Semi Detached | 28 | 30 | 33 | 39 | 45 |
| Detached | 28 | 30 | 33 | 45 | 47 |

### Add values for both window tables

Numerically identical across the two tables, and constant across all four house
rows; only `cons` varies, and only by band. All four keys are live money (§7):

| Add key | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| `ext` | 2 | 2 | 2 | 2 | 2 |
| `cons` | 5 | 5 | 7 | 10 | 10 |
| `loft` | 2 | 2 | 2 | 2 | 2 |
| `velux` (per window) | 1 | 1 | 1 | 1 | 1 |

**The five `Flat` cells carry no `add` object at all**, in either window table.
A flat pays the bare table figure and no surcharge can ever apply to one — which
is why the flat branch is right not to wait on a loft answer (§8).

### `full_gutter_clearance` — `contact.full_gutter_clearance`

No `Flat` row. Every cell carries an add object; **no cell carries a `velux`
key**.

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Terraced | 70 | 79 | 99 | 119 | 139 |
| Town house | 70 | 79 | 99 | 119 | 139 |
| Semi Detached | 75 | 79 | 99 | 119 | 139 |
| Detached | 77 | 79 | 99 | 119 | 139 |

Add values, as `ext / cons / loft`. This and the fascia table are the two whose
add values vary along **both** axes — by band and by house type:

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Terraced | 5 / 5 / 5 | 5 / 5 / 5 | 5 / 6 / 5 | 6 / 7 / 6 | 7 / 7 / 7 |
| Town house | 5 / 5 / 5 | 5 / 5 / 5 | 5 / 6 / 5 | 6 / 7 / 6 | 7 / 7 / 7 |
| Semi Detached | 5 / 6 / 5 | 5 / 7 / 5 | 5 / 8 / 5 | 6 / 9 / 6 | 7 / 10 / 7 |
| Detached | 5 / 6 / 5 | 5 / 7 / 5 | 5 / 8 / 6 | 6 / 9 / 7 | 7 / 10 / 8 |

### `fascia_soffit_clean` — `contact.fascia_soffit_and_gutter_clean`

No `Flat` row. Every cell carries an add object; **no cell carries a `velux`
key**.

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Terraced | 60 | 75 | 90 | 90 | 120 |
| Town house | 60 | 75 | 90 | 90 | 120 |
| Semi Detached | 60 | 79 | 99 | 119 | 129 |
| Detached | 60 | 80 | 109 | 119 | 139 |

Add values, as `ext / cons / loft`:

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Terraced | 5 / 5 / 5 | 5 / 5 / 5 | 5 / 6 / 5 | 6 / 7 / 6 | 7 / 7 / 7 |
| Town house | 5 / 5 / 5 | 5 / 5 / 5 | 5 / 6 / 5 | 6 / 7 / 6 | 7 / 7 / 7 |
| Semi Detached | 5 / 5 / 5 | 5 / 5 / 5 | 6 / 6 / 6 | 7 / 7 / 7 | 7 / 7 / 7 |
| Detached | 5 / 5 / 5 | 5 / 5 / 5 | 6 / 6 / 6 | 7 / 7 / 7 | 7 / 7 / 7 |

Two figures look like transcription errors and are not. **Terraced and Town
house price fascia at 90 for band 3 and 90 again for band 4** — flat across two
bedroom counts while the add values do rise. And **Detached band 3 is 109**, an
odd figure sitting between Semi Detached's 99 and its own band-4 119. Both are
what the sheet says. Do not tidy them.

Fascia and gutter are two independent tables with different numbers here, which
is unique among the three clients. At band 2 on Detached the **fascia price (80)
is higher than the gutter price (79)**. The two also cross once the surcharges
land, by a single pound: on a Detached 4-bed with both extras, fascia
119 + 7 + 7 = **133** and gutter 119 + 6 + 9 = **134**. Both **measured**. Any
code that assumes gutter and fascia are the same number, or that one is always
the larger, breaks here and only here.

### `conservatory_roof_external` — `contact.conservatory_roof_cleaning`

No `Flat` row, and **not one of these 20 cells carries an `add` object**. This
service never takes an extension, conservatory, loft or velux uplift under any
input. `conservatory_roof_internal` (`contact.con_roof`) returns exactly these
numbers.

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Terraced | 60 | 75 | 99 | 115 | 125 |
| Town house | 60 | 75 | 99 | 115 | 125 |
| Semi Detached | 60 | 75 | 99 | 119 | 139 |
| Detached | 60 | 75 | 99 | 119 | 139 |

### Derived: `ext_window_oneoff` and `int_window_oneoff`

Both are 2 × the `ext_window_6weekly` **total**. With no extras that is:

| House type | 1 bed | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Flat | 36 | 40 | 46 | 52 | 64 |
| Terraced | 36 | 40 | 46 | 54 | 64 |
| Town house | 36 | 40 | 46 | 54 | 64 |
| Semi Detached | 36 | 40 | 46 | 58 | 70 |
| Detached | 36 | 40 | 46 | 58 | 74 |

With surcharges the uplifts double too, because they are inside the multiplied
subtotal.

**Cells without an `add` object, exhaustively:** the five `Flat` cells of each
window table, and all 20 cells of `conservatory_roof_external`. Everything else
has one. Add-key census, **measured** from the config: window tables
`{ext, cons, loft, velux}` on 20 of 25 cells and no `add` on the five `Flat`
cells; gutter and fascia `{ext, cons, loft}` on all 20; conservatory roof no
`add` on all 20.

---

## 7. Surcharges: four declared, one per-unit

`config.pricing.surcharges` is an array of four entries — the only one of the
three client configs that declares its own. **Read** from the config, and every
row below **measured** against the running engine:

| Declared | `type` | `input` | `add_key` | Chased when missing? |
|---|---|---|---|---|
| Extension | `boolean` | `extension` | `ext` | yes |
| Conservatory | `boolean` | `conservatory` | `cons` | yes |
| Loft conversion | `boolean` | `loft` | `loft` | **yes** |
| Velux windows | `per_unit`, `optional: true` | `number_of_velux` | `velux` | **no** |

Declaring the array at all obliges you to re-declare the built-in `ext` and
`cons` — omitting either is a validation error, because every existing cell
still carries `add.ext` / `add.cons` (`src/pricing/matrix.js:1194-1198`).

### Which table carries which uplift

**Measured**, Detached 3-bed, one variable at a time. The six house-service
bases are the `conservatory: "No"` baseline; the two roof rows are measured with
`conservatory: "Yes"`, because under "No" they answer `not_applicable` rather
than a price (§9b). Their £99 is the same under either baseline, since those
cells carry no `add` object at all — and the loft and velux **deltas** below are
identical under both baselines, which is the point the table exists to make:

| Service | base | + loft | Δ | + 4 velux | Δ |
|---|---|---|---|---|---|
| `ext_window_6weekly` | 23 | 25 | +2 | 27 | +4 |
| `ext_window_12weekly` | 33 | 35 | +2 | 37 | +4 |
| `ext_window_oneoff` | 46 | 50 | +4 | 54 | +8 |
| `int_window_oneoff` | 46 | 50 | +4 | 54 | +8 |
| `full_gutter_clearance` | 99 | 105 | +6 | 99 | **0** |
| `fascia_soffit_clean` | 109 | 115 | +6 | 109 | **0** |
| `conservatory_roof_external` | 99 | 99 | **0** | 99 | **0** |
| `conservatory_roof_internal` | 99 | 99 | **0** | 99 | **0** |

The rule behind that table: **a surcharge whose `add_key` is absent from a cell
contributes zero** (`surchargeAmount`, `src/pricing/matrix.js:274-275`). Gutter
and fascia cells carry `{ext, cons, loft}` and no `velux` key, so a velux count
of 9 changes nothing there — **measured**. Conservatory roof cells carry no
`add` at all, so nothing changes them. No special-casing is needed anywhere;
the data decides.

All four stack, and the one-offs double the lot. **Measured**, Detached 4-bed
with extension, conservatory, loft and 3 velux: 6-weekly **46**
(29 + 2 + 10 + 2 + 3), 12-weekly **62**, both one-offs **92**, gutter **141**,
fascia **140**, both conservatory roofs **119**.

### Boolean inputs: how to say yes

`extension`, `conservatory` and `loft` all go through the same route-level
reader, which distinguishes "answered no" from "never answered" and turns an
unrecognised value into an explicit question rather than a silent zero.
**Measured**, Detached 4-bed:

| Sent | Answer |
|---|---|
| `true`, `"Yes"`, `"yes"`, `"YES "`, `"y"`, `"true"`, `"1"` | priced, surcharge applied |
| `false`, `"No"`, `"n"`, `"0"`, `"false"` | priced, surcharge 0 |
| `1` (the JSON **number**), `"yeah"`, `"yep"`, `"maybe"`, `null`, absent | `ok:false`, `reason:"missing_inputs"`, `missing:["<the input>"]` |

Note the trap: `"1"` is yes and the number `1` is a re-ask; `"yeah"` and
`"yep"` are yes to the engine's own `toBool` but a re-ask to this route.
**Send booleans or the exact strings `"Yes"` / `"No"`.**

### `number_of_velux`: per-unit, and optional

`velux` is priced `rate × count` from `number_of_velux`, at £1 per window on
every non-Flat window cell in every band. **Measured**: `4` → +£4, the string
`"3"` → +£3, and `0` is a real answer priced as **zero uplift**, not a missing
count.

Because the declaration carries `optional: true`, an unknown count **never
blocks a quote**. It is absent from `missingInputs` entirely
(`src/pricing/matrix.js:261`) while remaining in `requiredInputs`. **Measured**:
a Detached 3-bed that answered `extension`, `conservatory` **yes** and `loft`
but sent no `number_of_velux` prices all eight services, with the velux uplift
at zero and no `missing` key on any of them. (Answer `conservatory: "No"` and
six price, the two roof rows coming back `not_applicable` — §9b. The velux
point holds either way.)

**`loft` is not optional and does block.** **Measured**: Detached 3-bed with
`extension: "No"`, `conservatory: "No"` and no `loft` returns all eight rows
`ok:false`, `reason:"missing_inputs"`, `message:"still needed: loft"`,
`missing:["loft"]`. Collect it, or nothing prices.

### The gate/count split

`contact.velux` is a mapped yes/no field that is **not** a pricing input and is
not in the bot's tool schema. It gates the *conversation*: only a customer who
has said they have velux windows is asked how many. `contact.number_of_velux` is
the pricing input. That split is deliberate — the gate keeps the count question
off the table for customers it does not apply to, and can never block a quote.
A form should mirror it: ask the yes/no first, show the count field only on yes,
and send `number_of_velux` (never `velux`) to this API.

---

## 7b. The v1 `detail` does not itemize loft or velux

**`price` is authoritative. For this client, `detail` is not a complete
itemization.**

The engine's own detail carries one key per declared surcharge —
`extSurcharge`, `consSurcharge`, `loftSurcharge`, `veluxSurcharge`. The v1 API's
detail shaper is a fixed allow-list written before declared surcharges existed
(`DETAIL_SHAPERS.house_bedroom_table`, `src/server/pricing-handlers.js:369-375`)
and emits only `model, row, bedrooms|floorLevel, band, exactBand, base,
extSurcharge, consSurcharge, includeSurcharges`. There is no pass-through for
`${add_key}Surcharge`.

**Measured**, Detached 4-bed, extension yes, conservatory yes, loft yes, 3
velux:

```json
{"ok":true,"price":46,"currency":"GBP","serviceKey":"ext_window_6weekly",
 "detail":{"model":"house_bedroom_table","row":"Detached","bedrooms":4,"band":4,
           "exactBand":true,"base":29,"extSurcharge":2,"consSurcharge":10,
           "includeSurcharges":true}}
```

`29 + 2 + 10 = 41`, against a `price` of `46`. The £5 of loft and velux money is
in the price and not in the breakdown. The gap is exactly the dropped uplift —
£2 for a loft plus £1 per velux window — so it has **no upper bound**: the same
property with 9 velux is £11 short and with 20 it is £22 short, both
**measured**. Do not code a fixed tolerance. **Measured** shortfalls:

| Case (`ext_window_6weekly`) | `price` | `base + ext + cons` | gap |
|---|---|---|---|
| Detached 4b, ext + cons | 41 | 41 | 0 |
| Detached 4b, ext + cons + loft | 43 | 41 | **2** |
| Detached 4b, ext + cons + loft + 3 velux | 46 | 41 | **5** |
| Detached 3b, loft only | 25 | 23 | **2** |
| Detached 3b, 4 velux only | 27 | 23 | **4** |

The same applies inside a derived service's `basedOnDetail`: `basedOnPrice` is
right, the detail under it sums short.

**What to do.** Render `price`. If you must show a breakdown, derive the extra
uplift as `price − (base + extSurcharge + consSurcharge)` and label it
collectively, or take the per-cell `add` values from `GET /config`, which
returns `config.pricing` verbatim — the whole `surcharges` array and every
cell's `add` object are there. Do not sum `detail` and present the result as the
price.

This is the one place where this client's shape reaches past what the v1
contract has caught up with. It is a consequence of a shared allow-list, not of
anything wrong with this config: Kings and GreenMaster declare no surcharges, so
they never see it. Fixing it properly means adding both keys to
`DETAIL_SHAPERS`, to `docs/pricing_api.md` and to
`test/pricing-api-contract.test.js` in one commit; nothing covers it today
(§13).

---

## 8. Flats band on bedrooms

This is the headline difference from GreenMaster, and it is intentional at every
layer.

The two window services declare `house_type_normalization: "with_flats"` — so a
flat is classifiable — plus **`flat_banding: "bedrooms"`**. The `Flat` rows are
keyed `"1"` to `"5"` and those keys mean bedrooms. `DEFAULT_FLAT_BANDING` is
`floor_level` (`src/pricing/matrix.js:127`), which is what GreenMaster gets by
declaring nothing; this client opts out of it explicitly.

A bedrooms-banded flat falls straight through the floor branch and onto the
ordinary house path (`resolveRowAndBand`, `:453-476`), inheriting the same band
resolution and the same clamp-above-top-band that every house row uses.

**`floor_level` is never read.** It is not in `requiredInputs`, not in
`field_mapping`, not validated for (the validator's floor_level check is gated
on flats *not* banding on bedrooms, `:1146-1149`), and not offered in the bot's
`get_quote` schema. **Measured**, a `Flat` sent with `floor_level: 4` anyway
still prices on bedrooms:

```json
{"ok":true,"price":23,"currency":"GBP","serviceKey":"ext_window_6weekly",
 "detail":{"model":"house_bedroom_table","row":"Flat","bedrooms":3,"band":3,
           "exactBand":true,"base":23,"extSurcharge":0,"consSurcharge":0,
           "includeSurcharges":true}}
```

Note `detail` carries **`bedrooms`, not `floorLevel`** — the conditional spread
picks one or the other, never both. A flat's detail is indistinguishable from a
house's except for `row: "Flat"`.

### What a flat is and is not asked

**Measured**: `{"house_type":"Flat","bedrooms":3}` and nothing else is a
**complete** request. All four window services price, each row carrying no
`missing` key at all (§4). A flat is never chased for a floor, an extension, a
conservatory or a loft
— correctly, because `Flat` cells carry no `add` object, so no surcharge could
ever apply to one. **Measured**: a flat that answers extension, conservatory and
loft "Yes" with 9 velux still prices **£23** at 3 bedrooms.

A flat with no bedroom count returns `missing: ["bedrooms"]` on the four window
rows.

### Flat prices

**Measured** end to end:

| | 6-weekly | 12-weekly | ext one-off | int one-off |
|---|---|---|---|---|
| Flat 1-bed | 18 | 28 | 36 | 36 |
| Flat 3-bed | 23 | 33 | 46 | 46 |
| Flat 5-bed | 32 | 42 | 64 | 64 |
| Flat 7-bed | 32 | 42 | 64 | 64 — all **`oversized: true`** |

`maisonette` 2-bed → £20; `apartment` 3-bed → £23. Both classify as `Flat`.

**A flat past the top band behaves exactly like a house**: it clamps to band 5
and flags `oversized: true`, returning a real number you must not display (§10).
GreenMaster's out-of-range flat returns `price: null` instead. That difference
matters for a consumer serving both.

A studio flat is recorded as **1 bedroom**, because the tables start at the
1-bedroom band. `bedrooms: 0` is not a price: **measured**, the route answers
`missing_inputs` with `missing: ["bedrooms"]` on every row.

---

## 9. What is not applicable, and why — three distinct answers

`not_applicable` reaches a caller from **two** producers here, sharing a
`reason` and differing only in `message`. A third refusal, `invalid_house_type`,
looks similar and is not the same thing. All three **measured**.

### 9a. Structural — a flat cannot buy the other four

Gutter, fascia and both conservatory-roof services use
`house_type_normalization: "standard"`, under which a flat is not classifiable
at all — deliberately, because the price sheet has no `Flat` row for them.
**Measured** on `POST /quotes` for a 3-bed flat:

```json
{ "ok": false, "price": null, "currency": null,
  "serviceKey": "full_gutter_clearance", "serviceLabel": "Gutter clearance",
  "reason": "not_applicable",
  "message": "this service is not available for this property type",
  "missing": [], "oversized": false }
```

`inapplicableServices` returns exactly these four for a flat, in config order:
`[full_gutter_clearance, fascia_soffit_clean, conservatory_roof_external,
conservatory_roof_internal]`. The two one-off window services survive
because their root is `ext_window_6weekly`, which has a non-empty `Flat` row —
so **internal window cleaning is offered to flats**. If that is not the business
intent, nothing in the config expresses the objection.

This answer is bedroom-independent and permanent: **hide these rows and keep
them hidden.** Do not render them greyed out with a "get in touch" link — no
input the customer can supply will ever price them.

`config.messages.flat_service_not_available` records the intended customer
wording, but no code reads it; whatever the bot says on a flat comes from the
client's system prompt.

### 9b. Situational — a house with no conservatory

`conservatory` is not only a surcharge flag; it gates the two roof services.
When the answer is anything but yes, `autoPlan` drops every key starting
`conservatory_roof` and the batch route answers them. **Measured**, Semi
Detached 3-bed, `conservatory: "No"` — the most ordinary request this client
will ever receive:

```json
{ "ok": false, "price": null, "currency": null,
  "serviceKey": "conservatory_roof_external",
  "serviceLabel": "Conservatory roof clean (external)",
  "reason": "not_applicable",
  "message": "this service does not apply to this property",
  "missing": [], "oversized": false }
```

So **two of the eight rows come back unpriced on the majority of requests**, and
this is not the same refusal as §9a.

| | §9a — structural | §9b — this turn |
|---|---|---|
| `reason` | `not_applicable` | `not_applicable` |
| `message` | `…is not available for this property type` | `…does not apply to this property` |
| Source | `inapplicableServices`, `pricing-handlers.js:313` | `autoPlan`, `pricing-handlers.js:337` |
| Means | no input will ever price it | the conservatory answer is currently no |
| Do | hide the row | hide it **this turn**; re-quote if the answer changes |

**The `reason` code does not distinguish them. Only the message string does.**
That is a fragile discriminator: branch on it if you must, but never cache "not
applicable" as a permanent property of a service. **Measured**, the same Semi
Detached 3-bed with `conservatory: "Yes"` prices both roof rows at 99 while
every other row moves too — 6-weekly 23→30, 12-weekly 33→40, one-offs 46→60,
gutter 99→107, fascia 99→105. A form that hides conservatory roof cleaning
forever because the customer said "no conservatory" first has hidden two
sellable services, and nobody will ever see it happen.

**One hole worth knowing about.** The §9b filter runs only while `autoPlan`
reports the inputs complete, and completeness requires 1 ≤ bedrooms ≤ 5. Above
five bedrooms the applicability gate switches off entirely. **Measured**,
Detached 7-bed with `conservatory: "No"`: all eight rows come back `ok: true`,
including both conservatory roofs at £139, for a property that just said it has
no conservatory. Every row is `oversized: true`, which is the only thing
standing between that and a quote — one more reason §10's branch order is not a
style preference.

### 9c. The singular route consults neither

**Measured**, and it matters if anyone reaches for `POST /quote`:

| Question | `POST /quotes` (batch) | `POST /quote` (singular) |
|---|---|---|
| Flat, `full_gutter_clearance` | `not_applicable`, `oversized:false` | `invalid_house_type`, `message:'unrecognised house type "Flat"'`, **`oversized: true`** |
| House with `conservatory:"No"`, `conservatory_roof_external` | `not_applicable` | **`ok:true`, `price:99`, `written:true`** — and it writes £99 to `contact.conservatory_roof_cleaning` |

Two routes, one engine, disagreeing about whether a service exists for a
property — and only the disagreeing one persists a number to the customer
record. **Use `/quotes`.**

---

## 10. Branch order: `oversized` → `ok` → `reason`

**Check `oversized` before `ok`.** For a property beyond the price list the API
returns a price *and* flags it. **Measured**, Detached, `ext_window_6weekly`:

```
5 bedrooms -> ok=true  price=37  band=5  exactBand=true   oversized=false
6 bedrooms -> ok=true  price=37  band=5  exactBand=false  oversized=true    <- the 5-bed price
7 bedrooms -> ok=true  price=37  band=5  exactBand=false  oversized=true    <- still the 5-bed price
```

A form that shows `price` whenever `ok` is true will quote £37 for a
seven-bedroom detached house. The number is real; it is simply not this
property's price. `oversized: true` means **refuse to display it** and route to
a manual quote.

The flag walks `basedOnDetail`, so derived services are flagged too — **measured**,
Detached 7-bed returns all eight rows `ok:true, oversized:true`: 6-weekly 37,
12-weekly 47, both one-offs 74, gutter 139, fascia 139, and both conservatory
roofs 139 despite `conservatory: "No"` (§9b). Every one of those numbers is
displayable and every one is wrong for the property.

Flats clamp and flag the same way (§8) — a 7-bed flat returns £32 with
`oversized: true`.

| State | Looks like | Do |
|---|---|---|
| Priced | `ok:true`, `oversized:false` | Show `price` + `currency` |
| Ask | `ok:false`, `reason:"missing_inputs"`, `missing:[…]` | Ask for exactly what `missing` names |
| Hide, permanently | `ok:false`, `reason:"not_applicable"`, message `…is not available for this property type` | Drop the row. No answer will ever price it (§9a) |
| Hide, this turn | `ok:false`, `reason:"not_applicable"`, message `…does not apply to this property` | Drop it now; re-quote if the conservatory answer changes (§9b) |
| Manual quote | `oversized:true` (with or without a price) | Never show a number; hand to the team |
| Manual quote | `ok:false`, `reason:"invalid_house_type"`, `oversized:true` | Never a re-ask — an unrecognised property type goes to the team |
| Anything else | a `reason` you do not recognise | Treat as a manual quote and log it. Never show a price, never re-ask — v1 grows additively |

`missing_inputs` and `not_applicable` are genuinely different answers — "ask
this" versus "this does not exist for them". Collapsing them either asks a
question that has no answer or hides a service the customer could have bought.
For this client `not_applicable` is not an edge case: four of eight rows on
every flat, two of eight on every house that says it has no conservatory.

One name collision: `missing_inputs` is both a `400` error code (the route was
called with no `inputs` object at all) and an `ok:false` reason inside a `200`
body. Different things. Branch on the status first.

---

## 11. Bedroom bands, and what happens past five

The generic rule — exact count, else the next higher band, else clamp to the
highest band for that house type — is `docs/pricing_api.md` §0 and holds here
for **every** row, `Flat` included. Every table runs 1 to 5 on every row it
carries with no gaps, so the fall-forward step never fires today.

The clamp at the top is what §10's flag exists to catch: more than 5 bedrooms is
a large or unusual property that goes to the team. `pricing_engine_rules.bedroom_band_fallback`
says "flats included", and that is now literally true — **measured**, a 7-bed
flat clamps to band 5 and flags `oversized`.

If `house_type` or `bedrooms` is missing, unrecognised, or not a valid integer,
no price is returned rather than a guess or a default. That is the intended
behaviour and it is what the agent's missing-price fail-safe is built on. An
unclassifiable house type comes back `invalid_house_type` with `oversized: true`
— a custom quote, not a re-ask, because the client's rule is never to make a
customer pick a category that does not fit their home.

---

## 12. Errors

| Status | `error` | Meaning | Retry? |
|---|---|---|---|
| 400 | `missing_selector` | No `locationId` / `clientId`. Answered **before** auth, so it is not masked by a 401 | No |
| 400 | `missing_inputs` | No `inputs` object — `/quotes` always needs one | No |
| 400 | `invalid_service_keys` | `serviceKeys` was present but not a non-empty array | No |
| 400 | `too_many_services` | More than 50 caller-supplied `serviceKeys` | No |
| 401 | `unauthorized` | No key, wrong key, a key for another client, or a key that does not grant this route. The body cannot tell them apart (§3) | No |
| 409 | `client_inactive` | `config.active` is not `true`. **Singular `/quote` only** — `/quotes` and `/config` ignore it | No |
| 422 | `invalid_config` | The stored config failed validation. Not reachable today: `validatePricingConfig` returns `[]` | No |
| 422 | `invalid_pricing` | A `PUT` was rejected; see `details`. Nothing was written | No |
| 429 | `rate_limited` | 60/min per tenant on the batch route (it charges the **quote** budget despite authorising on `calculate`), `GET /config` draws a separate 60/min `read` budget, `PUT` draws 20/min `write`; plus a pre-auth per-IP cap of 120/min | Yes, after `Retry-After` |
| 503 | `lookup_failed` | Transient database fault during key lookup | Yes, after `Retry-After` |

**Measured** 400 bodies, verbatim:

```json
{"error":"missing_selector","message":"provide locationId (or clientId)"}
{"error":"missing_inputs","message":"an `inputs` object is required"}
{"error":"invalid_service_keys","message":"serviceKeys must be a non-empty array when provided"}
```

Retry `429` and `503` only, honouring `Retry-After`. Everything else is a real
answer.

### `ok:false` reasons you will actually see

`missing_inputs`, `not_applicable` (both flavours, §9), `invalid_house_type`
(always with `oversized: true`) and `unknown_service`. **Measured** distinct
bodies:

```json
{"ok":false,"price":null,"currency":null,"serviceKey":"ext_window_6weekly","serviceLabel":"External window clean every 6 weeks","reason":"missing_inputs","message":"still needed: loft","missing":["loft"],"oversized":false}
{"ok":false,"price":null,"currency":null,"serviceKey":"ext_window_6weekly","serviceLabel":"External window clean every 6 weeks","reason":"invalid_house_type","message":"unrecognised house type \"houseboat\"","missing":[],"oversized":true}
{"ok":false,"price":null,"currency":null,"serviceKey":"not_a_service","serviceLabel":"not_a_service","reason":"unknown_service","message":"unknown service \"not_a_service\"","missing":[],"oversized":false}
```

Batch rows carry no `written` key; singular-route rows carry `"written": false`.

### Reason codes that cannot occur on this config

A branch written for any of these is dead code:

- **`invalid_bedrooms`** — the route's per-service gap check runs first and
  pushes `bedrooms` for exactly the values the parser rejects. **Measured**:
  `bedrooms: 0` and `bedrooms: "abc"` both return `missing_inputs` with
  `missing: ["bedrooms"]`, never `invalid_bedrooms`.
- **`invalid_floor_level`** and **`floor_not_in_table`** — no service here bands
  a flat on floor level, so neither branch is reachable.
- **`missing_unit_count`** — belongs to `unit_rate` services; this client has
  none.
- **`empty_table_row`** — every row carries bands `"1"` to `"5"`.
- **`house_type_not_in_table`** — every row this client's normalisers can
  produce exists in every table they apply to.
- **`config_error`** — every cell carries its `price_key` and every declared
  model is valid.
- **`cycle`** — the two `based_on` chains are one hop and acyclic.

That leaves `unknown_service` and `invalid_house_type` from the engine's
`REASONS` map, alongside the route-level `missing_inputs` and `not_applicable`.

---

## 13. What the test suite guards, and what it does not

`test/pricing-wewasheverything.test.js` — 581 lines, **56 cases, all passing**
(`npm run test:wwe`, also the fifth entry in `npm test`). It loads all three
real config files from disk and drives the real engine, so it locks the **file**,
not the database row (§14).

**What it asserts.** Eleven groups:

1. **Config validity** — `validateConfig` throws on nothing;
   `validatePricingConfig` returns `[]`.
2. **Flats band on bedrooms** — flat 1/4/5-bed prices; `apartment` and
   `maisonette` classify as `Flat`; a flat pays no surcharge whatever it
   answers; `floor_level` is absent from this client's `requiredInputs` **and
   present in GreenMaster's**, asserted as a pair so the two cannot drift
   together; a flat with bedrooms has nothing missing, without them has
   `['bedrooms']` and never `floor_level`.
3. **Out of band, flats included** — 7-bed flat and 7-bed detached both
   oversized; oversized survives the multiplier chain; an over-band property has
   nothing left to chase, which is the precondition for the booking escalation
   gate.
4. **Town house == Terraced** — the drift guard. For all five table services,
   `table['Town house']` is deep-equal to `table.Terraced`, with a count
   assertion (`checked === 5`) so a service added later without a Town house row
   fails. Plus `KNOWN_SCHEMES` frozen to its three entries, so no fourth scheme
   was smuggled in for this client. **This is the assertion
   `pricing_engine_rules.townhouse` points at, and it is real.**
5. **Declared surcharges** — loft on three tables; velux per unit; `0` velux as
   a real answer; an unknown count never blocking; the gate/count split asserted
   structurally (`velux` not in `requiredInputs`, `number_of_velux` in it); loft
   *is* chased; a table with no velux column unaffected by a count; all four
   stacking; `detail` carrying all four surcharge keys.
6. **Doubling** — both one-offs are 2 × (base + surcharges); only the two window
   frequencies recur.
7. **Flats cannot buy the other four** — the exact `inapplicableServices` list;
   a flat's plan is exactly the four window services; a flat gutter enquiry
   answers `INVALID_HOUSE_TYPE` and *not* `house_type_not_in_table`, asserted
   explicitly because the latter is excluded from the oversized walk and would be
   a silent dead end.
8. **Table values** — **exhaustive** for the two window tables (Flat / Terraced /
   Semi Detached / Detached × bands 1–5 × both frequencies, 40 assertions); spot
   checks for the rest, including the Detached 1-bed gutter **£77 owner
   correction**, where the sheet said £87 and would have priced a 1-bed above a
   2-bed.
9. **Tool schema** — `bedrooms` required and `floor_level` absent; `loft`
   boolean and `number_of_velux` integer; `conservatory_roof_panels` absent;
   `request_quote` filtered out; `confirm_booking` carrying no day or time and a
   description that forbids asking; `check_coverage`'s description free of any
   day promise.
10. **Cross-client parity — the load-bearing half.** Kings and GreenMaster both
    still validate; **neither declares `pricing.surcharges` and no service in
    either declares `flat_banding`**, so every gated path stays skipped; their
    `requiredInputs` are frozen literally; **Kings' `detail` key set is frozen to
    exactly nine keys**, so no `*Surcharge` key may leak in; **GreenMaster flats
    still band on floor** with `detail.floorLevel` and no `bedrooms`; Kings' tool
    schemas are byte-identical with the new options defaulted versus supplied.
11. **`validate()` rejections** — a typo'd `flat_banding`; `flat_banding:
    "bedrooms"` on a scheme that cannot classify a flat; dropping a built-in
    surcharge; a surcharge input with no `field_mapping` entry; a bad `type`; a
    duplicate `add_key`; a non-boolean `optional`; an empty `surcharges: []`.

**What it does not cover.** Real gaps, worth knowing before you rely on the
green tick:

- **The pricing API layer, entirely.** No test file touches
  `src/server/pricing-handlers.js` with this client, and neither
  `test/pricing-api.test.js` nor `test/pricing-api-contract.test.js` mentions
  `loftSurcharge` or `veluxSurcharge`. That is why §7b's dropped detail keys
  went unnoticed.
- **Auth and scope.** Nothing asserts which credential authorises which route
  for this client.
- **Table completeness beyond the window tables.** Gutter, fascia and
  conservatory roof are spot-checked at roughly 10 of 60 cells; the graded
  surcharge ladders (gutter Detached `loft` running 5→8, `cons` 6→10) are
  exercised at five points. A hand-edit to a middle cell would pass.
- **Town house band values** are locked only transitively, via the parity guard.
- **Coverage.** Nothing exercises the 166 outward codes or `check_coverage`.
- **`bedrooms: 0`.** The engine returns `invalid_bedrooms` with `oversized:
  false` — an unflagged dead end at engine level that only the route's gap check
  and the system prompt's "record a studio as 1 bedroom" rule prevent from
  reaching a customer. Untested.
- **The database.** The suite reads the repo file. It says nothing about the row
  the API actually serves (§14).

---

## 14. Repo versus live: which artefact the API serves

**The API serves the database row.** `createConfigLoader` reads
`store.getClientConfigById`; the repo JSON is read only by
`scripts/seed-client.js` and by the test suite.

**Measured**, comparing `config/wewasheverything_config.json` against the live
row with a recursive key sort, all 26 top-level keys present on both sides:

| Key | Repo | Live | Affects the pricing API? |
|---|---|---|---|
| `active` | `false` | **`true`** | **One route only.** `POST /quote` answers `409 client_inactive` when it is not `true`; `GET /config` and `POST /quotes` deliberately ignore it |
| `credentials` | `ghl_pit_token`, `webhook_secret` | plus `auth_mode` and **`pricing_read_key_webform`** | No. Credentials are stripped by the loader before any pricing handler sees the config |

**Nothing else differs in substance.** A raw `JSON.stringify` comparison flags
17 keys, but every one of the other 15 is **key-order only** — deep-sorted, they
are exactly equal. That includes `pricing`, `field_mapping`, `coverage` and
`pricing_engine_rules`.

**Every price is identical in both artefacts.** 110 table cells compared as
whole objects — price and `add` together, key-order-insensitively — **zero
mismatches**. So is the `surcharges` array, the whole 25-entry `field_mapping`,
and all 166 coverage codes.

**Seeding is a separate step, and there is nothing to seed.**
`scripts/seed-client.js` copies the live `credentials` object wholesale over the
file's placeholders, and preserves a live `active` that differs from the file's
("flip it in Supabase, not by re-seeding"). Both substantive drifts self-heal,
and the residue is key ordering. Do **not** tell an integrator to seed before
going live.

**But do not hand-edit `active` into the row from the file either.** Setting it
to `false` takes down `POST /quote` (409) while leaving `GET /config` and
`POST /quotes` answering `200` with unchanged prices — **measured**. A partial
outage that a web form cannot see is worse than a whole one.

One stale sentence elsewhere, worth correcting when someone is next in that
file: `docs/wewasheverything-onboarding.md` says the three house-only services
declare `townhouse_as_terraced`. They declare **`standard`**. Both schemes are
flatless, so the behaviour and the reasoning around it are right; only the
scheme name is wrong.

---

## 15. Smoke tests

Every expected value below is **measured** against the real handlers over the
real config. They run today with the existing read key.

```bash
LOC=A9cGvKBunXk003dXUmSV
BASE=https://v3-bot-production-5b9f.up.railway.app
READ_KEY=          # the value of credentials.pricing_read_key_webform.
                   # Printed once at mint time. Not hashed — recover it from the
                   # client_configs row in Supabase if mislaid. Rotate only if it
                   # may have leaked:
                   # node --env-file=.env scripts/set-pricing-api-key.js \
                   #   wewasheverything --scope read --label webform --rotate
```

```bash
# 1. Auth + connectivity. Expect 200, pricingModel "matrix", 8 services, and
#    requiredInputs = house_type, bedrooms, extension, conservatory, loft,
#    number_of_velux — six, with NO floor_level.
#    401 means the server matched no credential: check you pasted READ_KEY,
#    that it is this client's key, and that $LOC is right. The response cannot
#    tell those apart; only the server log line can (src/server/app.js:415-424).
curl -H "Authorization: Bearer $READ_KEY" \
  "$BASE/api/v1/pricing/config?locationId=$LOC"
```

```bash
# 2. A house, no extras. NOTE loft:"No" — without it every row comes back
#    missing_inputs ["loft"] and nothing prices.
#    Expect 8 rows: SIX priced and TWO refused.
#      ok:true   6weekly 23, 12weekly 33, oneoff 46, int oneoff 46,
#                gutter 99, fascia 99      (all oversized:false)
#      ok:false  both conservatory_roof rows, reason "not_applicable",
#                message "this service does not apply to this property"
#    That is CORRECT: conservatory is No, so there is no roof to clean (9b).
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Semi Detached","bedrooms":3,"extension":"No","conservatory":"No","loft":"No"}}'
```

```bash
# 2b. The same property with a conservatory. Every row moves and both roof
#     rows appear:
#       6weekly 30, 12weekly 40, both one-offs 60,
#       gutter 107, fascia 105, roof ext 99, roof int 99
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Semi Detached","bedrooms":3,"extension":"No","conservatory":"Yes","loft":"No"}}'
```

```bash
# 3. Surcharges and the doubling. Detached 4-bed, both extras. All 8 priced:
#      6weekly     41   (29 + ext 2 + cons 10)
#      12weekly    57   (45 + 2 + 10)
#      oneoff      82   (2 x 41) — NOT 2x29+2+10 = 70
#      int oneoff  82   (identical to oneoff, always)
#      gutter     134   (119 + ext 6 + cons 9)
#      fascia     133   (119 + 7 + 7)   <- the one pound where gutter exceeds fascia
#      roof ext   119, roof int 119     <- that table carries no add object
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Detached","bedrooms":4,"extension":"Yes","conservatory":"Yes","loft":"No"}}'
```

```bash
# 4. All four surcharges at once. Same property, plus loft and 3 velux:
#      6weekly 46 (29+2+10+2+3), 12weekly 62, both one-offs 92,
#      gutter 141 (+7 loft), fascia 140 (+7 loft), both roofs 119 (unchanged).
#    Check detail on the 6-weekly row: base 29, extSurcharge 2, consSurcharge 10
#    and NOTHING for loft or velux. 29+2+10 = 41 against a price of 46 (7b).
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Detached","bedrooms":4,"extension":"Yes","conservatory":"Yes","loft":"Yes","number_of_velux":3}}'
```

```bash
# 5. velux is optional; loft is not. Detached 3-bed, no velux count at all.
#    Expect 8 rows: SIX priced — 23 / 33 / 46 / 46 / 99 / 109, none carrying a
#    `missing` key — plus the two conservatory_roof rows not_applicable
#    (9b, conservatory is No).
#    Now delete "loft":"No" and re-run: all eight become
#    reason "missing_inputs", message "still needed: loft", missing ["loft"].
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Detached","bedrooms":3,"extension":"No","conservatory":"No","loft":"No"}}'
```

```bash
# 6. A FLAT, banded on bedrooms, with nothing else supplied at all.
#    Expect the four window rows priced from the 3 bedrooms sent —
#      6weekly 23, 12weekly 33, both one-offs 46 — every one with NO `missing`
#      key, oversized:false, detail.row "Flat", detail.bedrooms 3, band 3,
#      and NO floorLevel key anywhere.
#    Expect gutter, fascia and both roofs ok:false, reason "not_applicable",
#      message "this service is not available for this property type" — the
#      PERMANENT flavour (9a). Hide them and keep them hidden.
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Flat","bedrooms":3}}'
```

```bash
# 6b. The same flat, with a floor_level and every surcharge switched on.
#     Expect the IDENTICAL four prices: 23 / 33 / 46 / 46. floor_level is not
#     an input here, and Flat cells carry no add object.
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Flat","bedrooms":3,"floor_level":4,"extension":"Yes","conservatory":"Yes","loft":"Yes","number_of_velux":9}}'
```

```bash
# 7. Town house == Terraced. Sends conservatory "Yes" ON PURPOSE: with "No" the
#    two roof rows come back not_applicable and one of the five tables the
#    parity guard covers is never exercised. Expect all 8 priced:
#      6weekly 43, 12weekly 53, both one-offs 86,
#      gutter 138, fascia 109, roof ext 115, roof int 115.
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Town house","bedrooms":4,"extension":"Yes","conservatory":"Yes","loft":"Yes","number_of_velux":2}}'

# 7b. The assertion: the same call as "Terraced" returns the SAME eight numbers.
#     The row string does NOT all live at detail.row — the five table services
#     carry it there, while ext_window_oneoff, int_window_oneoff and
#     conservatory_roof_internal carry it at detail.basedOnDetail.row. Normalise
#     only the top level and three rows diff and the test reads FAILED when it
#     passed. Replace the string at every depth:
#       diff <(... "Town house" ... | sed 's/Town house/X/g') \
#            <(... "Terraced"   ... | sed 's/Terraced/X/g')
#     Measured: identical after substitution, on all eight rows.
```

```bash
# 8. Oversized. Expect ALL EIGHT rows ok:true, oversized:true —
#      6weekly 37, 12weekly 47, both one-offs 74, gutter 139, fascia 139,
#      AND roof ext 139, roof int 139 despite conservatory being "No".
#    Above five bedrooms the applicability gate switches off (9b), so the
#    conservatory filter stops firing. Do NOT display any of these numbers.
curl -X POST "$BASE/api/v1/pricing/quotes" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","inputs":{"house_type":"Detached","bedrooms":7,"extension":"No","conservatory":"No","loft":"No"}}'
```

```bash
# 9. The scope boundary. A read key must not reach the writing routes.
#    Both MUST return 401 {"error":"unauthorized"} — measured.
curl -X PUT "$BASE/api/v1/pricing/config" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","pricing":{}}'

curl -X POST "$BASE/api/v1/pricing/quote" \
  -H "Authorization: Bearer $READ_KEY" -H "Content-Type: application/json" \
  -d '{"locationId":"'"$LOC"'","contactId":"REPLACE","serviceKey":"ext_window_6weekly","inputs":{"house_type":"Detached","bedrooms":3,"extension":"No","conservatory":"No","loft":"No"}}'
```

Note what test 9 does *not* prove. The `401` body is byte-identical whether the
key is refused for scope, is the wrong client's, or does not exist at all
(§3). To attribute it, prove the positive as well: the same read key returning
`200` on `GET /config`. A `401` you cannot attribute proves nothing.

### The full response body

**Measured**, `POST /api/v1/pricing/quotes` with the read key, body
`{"locationId":"A9cGvKBunXk003dXUmSV","inputs":{"house_type":"Semi Detached","bedrooms":3,"extension":"No","conservatory":"Yes","loft":"No"}}`
→ HTTP 200:

```json
{
  "clientId": "wewasheverything",
  "quotes": [
    { "ok": true, "price": 30, "currency": "GBP", "serviceKey": "ext_window_6weekly",
      "serviceLabel": "External window clean every 6 weeks", "ghlField": "contact.6weekly",
      "oversized": false,
      "detail": { "model": "house_bedroom_table", "row": "Semi Detached", "bedrooms": 3,
                  "band": 3, "exactBand": true, "base": 23, "extSurcharge": 0,
                  "consSurcharge": 7, "includeSurcharges": true } },
    { "ok": true, "price": 40, "currency": "GBP", "serviceKey": "ext_window_12weekly",
      "serviceLabel": "External window clean every 12 weeks", "ghlField": "contact.12weekly",
      "oversized": false,
      "detail": { "model": "house_bedroom_table", "row": "Semi Detached", "bedrooms": 3,
                  "band": 3, "exactBand": true, "base": 33, "extSurcharge": 0,
                  "consSurcharge": 7, "includeSurcharges": true } },
    { "ok": true, "price": 60, "currency": "GBP", "serviceKey": "ext_window_oneoff",
      "serviceLabel": "One-off external window clean", "ghlField": "contact.oneoff",
      "oversized": false,
      "detail": { "model": "multiplier_of_service", "basedOn": "ext_window_6weekly",
                  "multiplier": 2, "includeSurcharges": true, "basedOnPrice": 30,
                  "basedOnDetail": { "model": "house_bedroom_table", "row": "Semi Detached",
                    "bedrooms": 3, "band": 3, "exactBand": true, "base": 23,
                    "extSurcharge": 0, "consSurcharge": 7, "includeSurcharges": true } } },
    { "ok": true, "price": 60, "currency": "GBP", "serviceKey": "int_window_oneoff",
      "serviceLabel": "One-off internal window clean",
      "ghlField": "contact.ad_hoc_internal_window_cleaning", "oversized": false,
      "detail": { "model": "multiplier_of_service", "basedOn": "ext_window_6weekly",
                  "multiplier": 2, "includeSurcharges": true, "basedOnPrice": 30,
                  "basedOnDetail": { "model": "house_bedroom_table", "row": "Semi Detached",
                    "bedrooms": 3, "band": 3, "exactBand": true, "base": 23,
                    "extSurcharge": 0, "consSurcharge": 7, "includeSurcharges": true } } },
    { "ok": true, "price": 107, "currency": "GBP", "serviceKey": "full_gutter_clearance",
      "serviceLabel": "Gutter clearance", "ghlField": "contact.full_gutter_clearance",
      "oversized": false,
      "detail": { "model": "house_bedroom_table", "row": "Semi Detached", "bedrooms": 3,
                  "band": 3, "exactBand": true, "base": 99, "extSurcharge": 0,
                  "consSurcharge": 8, "includeSurcharges": true } },
    { "ok": true, "price": 105, "currency": "GBP", "serviceKey": "fascia_soffit_clean",
      "serviceLabel": "Fascia and soffit clean",
      "ghlField": "contact.fascia_soffit_and_gutter_clean", "oversized": false,
      "detail": { "model": "house_bedroom_table", "row": "Semi Detached", "bedrooms": 3,
                  "band": 3, "exactBand": true, "base": 99, "extSurcharge": 0,
                  "consSurcharge": 6, "includeSurcharges": true } },
    { "ok": true, "price": 99, "currency": "GBP", "serviceKey": "conservatory_roof_external",
      "serviceLabel": "Conservatory roof clean (external)",
      "ghlField": "contact.conservatory_roof_cleaning", "oversized": false,
      "detail": { "model": "house_bedroom_table", "row": "Semi Detached", "bedrooms": 3,
                  "band": 3, "exactBand": true, "base": 99, "extSurcharge": 0,
                  "consSurcharge": 0, "includeSurcharges": true } },
    { "ok": true, "price": 99, "currency": "GBP", "serviceKey": "conservatory_roof_internal",
      "serviceLabel": "Conservatory roof clean (internal)", "ghlField": "contact.con_roof",
      "oversized": false,
      "detail": { "model": "same_as_service", "basedOn": "conservatory_roof_external",
                  "basedOnDetail": { "model": "house_bedroom_table", "row": "Semi Detached",
                    "bedrooms": 3, "band": 3, "exactBand": true, "base": 99,
                    "extSurcharge": 0, "consSurcharge": 0, "includeSurcharges": true } } }
  ]
}
```

---

## 16. Before you ship

**Provisioning**

- [ ] Decide the scope your consumer actually needs, and mint only that
      (§3). A display-only web form needs `--scope read --label webform`, which
      already exists. A backend that saves prices needs `--scope admin`; a voice
      bot needs `--scope quote`. Do not clone Kings' pair by default
- [ ] The key lives in your backend's environment, never in anything a browser
      downloads
- [ ] You know that the read key also opens `GET /api/v1/bot/pause` and
      `GET /api/v1/usage/events` for this tenant, and that this is acceptable —
      or you have minted a separately labelled key for the consumer that should
      not

**Integration**

- [ ] You call `/quotes` (plural), not `/quote` — they disagree about flats and
      conservatory roofs, and only `/quote` writes (§9c)
- [ ] Nothing is hardcoded: service keys, input names, prices and house types
      all come from `GET /config`
- [ ] Rows are matched on `serviceKey`, never on position (§4)
- [ ] Nothing reads `row.missing` before checking `ok`. A **priced** row has no
      `missing` key at all, so `row.missing.length` throws on every successful
      quote (§4)
- [ ] You branch `oversized` → `ok` → `reason`, in that order (§10)
- [ ] `not_applicable` hides a row; `missing_inputs` asks a question — four rows
      of eight on every flat, two of eight on every house with no conservatory,
      and the second kind is **not** permanent (§9b)
- [ ] **`loft` is collected and sent.** Without it every row on every property
      returns `missing_inputs` and nothing prices (§7)
- [ ] `number_of_velux` is sent only when the customer said they have velux
      windows; omitting it is safe and priced as zero
- [ ] `extension`, `conservatory` and `loft` are sent as booleans or the exact
      strings `"Yes"` / `"No"` — the number `1` is a re-ask, not a yes (§7)
- [ ] **No `floor_level`** is collected or sent for a flat (§8)
- [ ] **No `conservatory_roof_panels`** is collected or sent (§5)
- [ ] The UI renders `price`, and does not reconstruct it by summing `detail` —
      the loft and velux uplifts are not in there (§7b)
- [ ] Nothing computes a one-off price as `2 × base`, or assumes the two
      one-offs differ (§5)
- [ ] Unknown keys in a response are ignored, not rejected — v1 grows additively

**If your consumer also writes**

- [ ] An admin-scope editor round-trips the whole `pricing` block faithfully
      from `GET /config`. `PUT /config` replaces the block as given, and
      **measured**, omitting `surcharges` entirely validates clean and returns
      `200`, silently reverting this client to the built-in `ext`/`cons` pair —
      every loft and velux uplift gone fleet-wide within the 60-second cache
      TTL. Setting it to `[]` is rejected (`422 invalid_pricing`); omitting it is
      not. Kings and GreenMaster cannot hit this, because they declare nothing to
      lose. It is the strongest argument for giving a display-only consumer a
      **read** key. It is silent in the price but not in the contract: when
      `surcharges` is dropped, `GET /config` returns **four** `requiredInputs`
      instead of six — `loft` and `number_of_velux` vanish from the list your
      form already reads on every render. Assert `requiredInputs.length === 6`
      after any `PUT`, or watch it in a health check. **Measured**: a Detached
      4-bed with extension, conservatory, loft and 3 velux prices **46** with the
      array declared and **41** without it, from the same `200` response
- [ ] `Town house` rows are edited in step with `Terraced` — 25 cells across five
      tables. The test catches drift, so run `npm run test:wwe` after any
      price edit (§13)

**Still open on the client, and not this integration's to fix**

- [ ] `billing.billing_contact_id` is TBD by choice: usage still logs, only the
      threshold tag is skipped
- [ ] `flow.verify_contact_id` is unset, so the boot credential check proves GHL
      reads work but never exercises the write round trip. All three clients
      leave it unset; it is worth closing on a new account
- [ ] Nine price-sheet questions are recorded in the onboarding doc as worth
      putting to the owner — among them that conservatory roof is priced by
      bedroom count here where Kings and GreenMaster price per panel, so a large
      conservatory on a small house has no escape hatch

---

## 17. Where `docs/pricing_api.md` will mislead you

The general doc is accurate about the contract and about Kings. These passages
are Kings-shaped and wrong for We Wash Everything.

| Section | Says | Here |
|---|---|---|
| §0, oversized | A 6-bed detached is "flagged and routed to a manual quote" | It returns `ok: true` and a price (37 on 6-weekly). Only `oversized: true` marks it (§10) |
| §0, conservatory roof | "not a table at all — per roof panel" | It **is** a table here. No `unit_rate` service exists in this config, and `conservatory_roof_panels` is not mapped |
| §0, bedroom fallback | Next higher band, then clamps | True here for every row, `Flat` included — unlike GreenMaster, whose flats match a floor exactly and never clamp (§11) |
| §0 / §5, surcharges | A table cell holds `add: { ext, cons }` | Window cells here hold `{ ext, cons, loft, velux }` and gutter/fascia cells `{ ext, cons, loft }`. An editor built to the two-key spec cannot see or change the extra columns, and a `PUT` that drops them reverts this client to the built-in pair (§16) |
| §2 | `requiredInputs` example lists `conservatory_roof_panels` | Six inputs here, none of them a panel count: `house_type, bedrooms, extension, conservatory, loft, number_of_velux` (§4) |
| §3.1 / §3.3 / §3.4 / §7 | `ext_window_6weekly`, `contact.6weekly` used as if generic | The key happens to exist here with the same GHL field. Coincidence, not contract — read it from `GET /config` |
| §3.1 example | `full_gutter_clearance` is `house_bedroom_fixed`, cell value **is** the price (`"3": 120`) | Here it is `house_bedroom_table` with `price_key: "one"` and an `add` object, like every other table service. No `house_bedroom_fixed` service exists in this config. Branch on the service's own `model`, never on its key |
| §3.3 | `8 panels -> price 80` | No service takes a panel count. The request prices nothing |
| §3.3 | `detail` itemizes the price | For this client it does not: `loftSurcharge` and `veluxSurcharge` are dropped by the v1 shaper, so on a window service `base + extSurcharge + consSurcharge` is short by the whole loft and velux uplift — £2 plus £1 per velux window. That is £5 on §7b's example and it has no ceiling; **measured** on a Detached 3-bed with a loft, the gap runs £2 at 0 velux, £5 at 3, £11 at 9 and £22 at 20. Do not code a fixed tolerance (§7b) |
| §3.3 | `invalid_floor_level` arrives with `missing: ["floor_level"]` | Unreachable here. No service bands a flat on floor level (§8) |
| §3.3 | `not_applicable` is a reason the singular route returns | It is produced only in the batch route. On a flat the singular route answers `invalid_house_type` + `oversized: true`; on a conservatory-less house it prices the roof anyway and writes it (§9c) |
| §3.3 | `not_applicable` has one meaning | **Two** producers here, same `reason`, different `message`: one permanent, one this-turn (§9a, §9b) |
| §3.4 | "nine services … the other seven" | Kings' catalogue. Eight here, four `not_applicable` on any flat and two more on any house with no conservatory |
| §5 editor | `table["Flat"]` is banded by FLOOR (`"0"` = ground); render it with floor labels | **The single most damaging row in the general doc for this client.** Flat keys `"1"`–`"5"` are BEDROOMS here (§8). An editor that labels them as floors mislabels five live prices in an editable grid and nothing errors. Read `flat_banding` off the service before labelling anything: `"bedrooms"` means the Flat row is an ordinary bedroom grid |
| §5 editor | `unit_rate` is "a single editable number, the `rate`" | No `unit_rate` service exists here. Also omits `minimum_charge`, which this client does not use anywhere either |
| §6 voice | `house_type` enum: terraced, semi-detached, detached, bungalow, townhouse | No flat value, so a flat is unreachable — and this client sells window cleaning to flats. Matching is substring, not enum (§5b) |
| §6 voice | Handler reads `body.oversized` / `body.ok` / `body.price` | `/quotes` returns `{clientId, quotes:[…]}` — those live per row, one level down |
| §6 voice | Three branches: oversized / !ok / else | No branch for `not_applicable`, which arrives `ok:false, oversized:false, missing:[]` and stalls the agent |
| §7 test | `expect price 24` for a semi-detached 3-bed | 23 here, on the same service key — and the request needs `loft` or it returns `missing_inputs` |
| §7 test | Test-phase gate is `require_contact_tag` | Not set here by choice: this client is ungated and serves every contact |

Two of the general doc's Kings-shaped statements happen to hold here and are not
traps: the `2 × (base + surcharges)` rule (with different numbers — here **both**
one-offs are 2 × the *external* 6-weekly total), and "grids all run 1-5 on every
house type" (true as a fact about today's numbers, not as a contract; build the
grid from the union of keys present).

Most of the rows above also affect anyone integrating a future client, since
they are stated as general rules rather than as facts about Kings. They have
been left in place rather than edited so that Kings' live integration is not
disturbed.
