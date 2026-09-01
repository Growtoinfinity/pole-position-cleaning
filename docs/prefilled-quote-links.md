# Prefilled quote links

A way to send a customer a URL that opens **straight onto their priced quote**, ready to
book, because you already hold their details and there is nothing left for them to type.

```
POST /api/prefill  ──►  { token, url }  ──►  you email the url  ──►  customer books
     contact + property        a submission row
                               + a CRM contact
                               + a priced quote
```

## 0. The loop it usually sits in

Rarely is this endpoint called by a human. It is normally one hop in a round trip that
starts and ends in the CRM:

```
  ┌─ CRM ── a tag is applied ("<quote-needed>")
  │           │
  │           ▼
  │      your portal  ── holds the API key, knows the contact id
  │           │
  │           │  POST /api/prefill  { contactId, property }
  │           ▼
  │       webform  ── prices it, mints a token, builds the link
  │           │
  │           │  writes the token to the contact's <token> custom field
  │           ▼
  └────── CRM ── a workflow emails/texts the link, built from that field
```

Three consequences fall straight out of this shape, and they are the ones people miss:

1. **The contact already exists.** It was tagged, so the CRM has it. Send its **id** — see
   §3. Matching on email is a guess, and the duplicate it produces is not a tidiness
   problem: the tag, the pipeline and the workflows are all on the *original*, so the
   customer gets quoted on a record nothing is watching.
2. **The webform writes the token back itself.** The portal does not need to. One system
   owns the token because one system generates it, and a round trip that hands it back for
   someone else to store is a round trip that can half-fail.
3. **The CRM sends the message, not the webform.** The link is just a field value; the
   existing workflow renders it. The webform never emails anybody.

Whether the trigger tag is removed afterwards, and by whom, is worth deciding explicitly —
otherwise a contact re-tagged later silently re-mints a link, which may be exactly what you
want or may be a loop.

This document is the **procedure**, not this company's implementation. Pricing inputs,
property questions and CRM field names differ per company; everything below is written so
that only the clearly-marked seams change. Where a name is company-specific it is written
like `<this>`.

---

## 1. What has to already exist

This feature is almost entirely *composition*. Before starting, confirm the form has:

| Precondition | Why it matters |
|---|---|
| A **server-side submission store** with one row per quote and a unique token | The link has to point at something |
| A **`?token=` resume path** that rehydrates the form and jumps to a stored step | This is the whole delivery mechanism |
| A **server-side pricing call** that takes a property and returns prices | The link must carry real prices, not a promise |
| A **CRM push** that writes a contact from a form snapshot | So the lead exists before the customer clicks |

If resume already works — most forms build it for "continue where you left off" emails —
then **you are adding one endpoint, not a feature**. If it does not exist, build it first
and separately; it is the larger half and it is worth having on its own.

> **Check this properly before estimating.** The temptation is to build a bespoke
> "prefill" pipeline. Don't. A second path that constructs quotes its own way will drift
> from the form within a release or two, and the drift shows up as two different prices
> for one property.

---

## 2. The five pieces

### 2.1 A shared property→pricing mapping

The form turns its own answers into whatever the pricing engine takes. That mapping
usually lives in a UI component, which the API cannot import.

**Move it to a dependency-free module** that both the browser and the server runtime can
import. Do not copy it. A second copy is how one caller ends up pricing a property type
the other does not recognise.

```
src/lib/<property-kind>.ts     ← plain function, type-only imports
    ↑                    ↑
  UI component      API endpoint
```

Keep the UI's existing export working by re-exporting from its old home, so nothing else
has to change:

```ts
import { mapFn } from '@/lib/<property-kind>'
export { mapFn }
```

> A bare `export { x } from '...'` does **not** put the name in local scope. If the file
> also *calls* it, you need both the import and the export.

### 2.2 The endpoint

One route, `POST /api/prefill`. Its job, in order:

1. **Authenticate** (see §4).
2. **Validate and reject** — never coerce (see §3).
3. **Price the property first**, before writing anything.
4. **Refuse to mint a link that would open onto an apology** — if the property cannot be
   priced, or the pricing service is down, return an error to the *caller*. A link that
   opens on "we can't show your price" is worse than no link, because it was sent
   deliberately to a named person.
5. **Insert the submission row** with `currentStep` set to the landing step and
   `step_reached` set to whatever that step maps to.
6. **Push to the CRM** using the same function the form uses, with the same arguments.
7. **Return** `{ token, url }`.

Steps 3 and 4 before 5 is the important ordering. Writing the row first and discovering
the price second leaves orphan rows that the abandonment job will later chase.

### 2.3 Getting the landing step right

The row's stored step is what resume navigates to. **Verify the step id you choose is
actually rendered**, by opening a link and looking at the page — not by reading the type.

A step id can be perfectly legal — present in the union, present in the step-number map,
named exactly like the screen you want — and still have no branch in the renderer. You get
a page with a progress bar, a Back link and nothing else, and no error anywhere.

Two fixes, do both:
- Point the endpoint at the id that is genuinely rendered.
- Make the unrendered alias resolve to the same screen, so the next person to make this
  assumption is right instead of debugging a blank page.

### 2.4 A dev mirror

If the dev server mirrors production routes by hand (common with Vite + serverless
functions), add a mirror for the new route **including its auth check**. An endpoint that
is open in dev on a machine holding production credentials is a live endpoint.

### 2.5 Configuration

| Variable | Purpose |
|---|---|
| `PREFILL_API_KEY` | Shared secret. **Refuse every request when unset** — never default to open |
| `PUBLIC_BASE_URL` | The customer-facing origin the link names |

`PUBLIC_BASE_URL` is not cosmetic. Without it the link names whichever deployment
answered the call, which on a protected preview URL **cannot be opened at all** by the
recipient.

---

## 3. Validate, never guess

An ordinary form validates to help someone typing. This endpoint validates because **a
wrong assumption becomes a wrong price in a named customer's inbox**, sent deliberately,
with your company's name on it. A 400 the caller sees immediately is enormously cheaper.

Rules that have earned their place:

- **Take the CRM contact id when the caller has one, and prefer it over everything else.**
  With an id, identity is settled: skip the create-or-match entirely and write to that
  contact. Name and contact details become optional extras rather than requirements, which
  also makes the endpoint work for a phone-only contact — one that email matching can never
  find, so it would get a fresh duplicate on every single call.
- **Reject unknown property types.** Do not fall back to a default band.
- **Enforce the same either/or the form does.** If one property type is priced by a
  different question than another, accepting both sets of answers lets a caller submit a
  combination the form can never produce.
- **Require a way to reach them** — one contact channel minimum, not a specific one.
- **Accept the "I don't know" answers the form accepts.** If a customer can say "not
  sure" and get "priced on the visit", the API must be able to say it too.
- **Name the field and the expectation in every message.** `property.bedrooms must be a
  whole number of 1 or more` is actionable; `invalid input` is a support ticket.
- Accept `true`/`false` **and** `"yes"`/`"no"` for booleans. Callers send both, and this
  costs three lines.

---

## 4. Security

- **Server-to-server only.** This creates CRM contacts and mints URLs carrying live
  prices. A key reachable from browser JavaScript is a key every visitor can lift out of
  dev tools.
- **Bearer token, compared whole.** No key configured means every request is refused.
- **Generate the key; do not invent one.** 32 random bytes, base64url.
- **Do not print the key** into a terminal, a log or a chat transcript. Write it into the
  local env file and read it from there. (If it does leak, rotate it — a key in
  scrollback is a key in someone's history.)
- The token in the URL is a **capability**: whoever holds it sees that quote and can book
  it. That is the point, and it is the same exposure the existing resume link already has
  — but it means tokens should be unguessable, and the URL should not be posted publicly.

---

## 5. Consequences worth deciding on deliberately

These are the things that surprise people later. Decide them, then write down what you
decided.

- **Abandonment.** A prefilled row is a real in-progress submission. If there is an
  abandonment sweep, an unopened link **will** be chased by it after the idle window.
  Usually desirable — but it means sending a link enrols someone in a chase sequence, so
  say so to whoever is sending them.
- **Repeat calls.** Decide whether a second call for the same person mints a second link
  or returns the first. Minting a new one is simpler and usually right; the CRM contact
  deduplicates by email regardless, so it is submission rows that multiply, not people.
- **What the link may not contain.** Never put personal data in the query string beyond
  the opaque token. The token is a lookup key; everything else stays server-side.
- **Consent.** The customer never ticked a consent box. The caller is asserting it already
  holds this contact and may quote them. Make that explicit in the code and make sure it
  is true — it is a compliance question, not a coding one.

---

## 6. Testing checklist

Negative first, because none of it writes anything:

- [ ] No auth header → `401`
- [ ] Empty body → `400`
- [ ] Missing name / missing every contact channel → `400`
- [ ] Malformed email → `400`
- [ ] Unknown property type → `400`
- [ ] Each conditionally-required field missing → `400`, naming that field
- [ ] A property the price book does not cover → a distinct code (`422`), not a link
- [ ] Pricing service unreachable → a distinct code (`503`), not a link

Then, once, for real:

- [ ] Valid call returns `{ token, url }` and prices that **match the pricing API**
- [ ] **Open the URL.** It lands on the quote screen with those prices — do not skip this,
      it is the step that catches the wrong-landing-step problem
- [ ] Any address supplied is prefilled on the booking screen
- [ ] The journey completes to the confirmation screen
- [ ] The CRM contact carries the property, the prices and the token
- [ ] Calling with **only** a contact id updates that contact — no duplicate appears
- [ ] Re-quoting the same contact for a *different property type* leaves **no stale
      values**: the prices for services the new property is not offered must be **blanked,
      not skipped**. Skipping leaves the previous answer standing, which is how a flat ends
      up in the CRM carrying a gutter price for a service it is never even shown

Use a reserved test domain (`@example.com`) and omit the phone number, so no automation
can reach a real person. **Then clean up the test contact** — a test booking sitting in a
won pipeline stage quietly skews the dashboard.

---

## 7. What changes per company

Everything else in this document is portable. These are the seams:

| Seam | Varies how |
|---|---|
| Pricing inputs | Which questions the price depends on, and which are conditional on others |
| Property vocabulary | The set of types, and any sub-type that changes the price band |
| "Unknown" answers | Which questions accept "not sure" and what that produces |
| CRM field mapping | Entirely per account — and per **location**, if the account was cloned from another |
| Landing step id | Whatever this form calls its quote screen |
| Out-of-band rule | What "too big to price" means, and what the caller should be told |

> **Cloned CRM accounts.** If the company's CRM was created from a snapshot of another
> company's, every id inside it was re-minted while looking identical in shape. Verify
> every id against the live account before shipping, with a script — some CRMs discard an
> unknown field id silently and return success.

---

## 8. Shape of the contract

Keep the request shaped like the *domain*, not like the form's internal state. The form's
snapshot shape is an implementation detail and will change.

```jsonc
{
  "contact":  {
    "contactId": "...",   // send whenever you have it — see §0 and §3
    "fullName": "...", "email": "...", "phone": "..."   // required only without an id
  },
  "property": { "type": "...", /* whatever this company prices on */ },
  "address":  { /* optional — prefills the booking screen */ }
}
```

```jsonc
// 200
{ "ok": true, "token": "...", "url": "https://.../?token=...", "quote": { }, "table": { } }

// 400 invalid · 401 unauthorised · 422 not priceable · 503 pricing unavailable
{ "ok": false, "error": "property.bedrooms must be a whole number of 1 or more" }
```

Returning the quote alongside the URL costs nothing and lets the caller put the actual
price in the email body rather than only a link.
