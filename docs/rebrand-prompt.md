# Rebrand brief — #156700 green deployment

A ready-to-paste, one-shot prompt for a fresh worktree on the sibling quote form.
Companion to `reskin-playbook.md`: the playbook is the general method, this is the
brand-specific brief. Every contrast figure below was measured, not estimated.

---

Rebrand this multi-step quote form for a new client. It is currently wearing a
previous company's branding — a DARK GREEN page (#06140C ground, white copy,
teal #1B9C85 accent). It needs to become a WHITE page with the new brand below.

Read `docs/reskin-playbook.md` FIRST and follow its order: tokens → primitives →
shell → screens → verify. It was written for exactly this job and its §9
(verify in rounds) and §10 (gotchas) are the parts that save you.

## The brand

- Primary: **#156700** (dark green) — the ONLY brand colour
- Text: **black (#000000)** on the white page; **white** on green fills (see below)
- Headings: **Cormorant Garamond**, body: **Public Sans** (both Google Fonts)
- Page: white
- Logo + favicon are already in `src/assets/` — open them, identify which is the
  wide lockup and which is the square icon, and wire them up. `ui/BrandLogo.tsx`
  must be the ONLY file that imports the logo asset.

## Palette — measured, do not re-derive or eyeball

#156700 is hsl(108, 100%, 20%). Ramp with the brand at 700:

| Token | Hex | vs white | white on it | black on it |
|---|---|---|---|---|
| brand-50 | #F1FBEF | 1.06 | — | 19.79 |
| brand-100 | #DAF2D4 | 1.19 | — | 17.63 |
| brand-200 | #B6E3AB | 1.44 | — | 14.56 |
| brand-300 | #82CD70 | 1.92 | — | 10.92 |
| brand-400 | #48B42D | 2.68 | — | 7.84 |
| brand-500 | #2D8F14 | 4.16 | 4.16 | 5.05 |
| brand-600 | #1D7906 | 5.54 | 5.54 | 3.79 |
| **brand-700** | **#156700** | **7.07** | **7.07** | **2.97** |
| brand-800 | #105200 | 9.42 | 9.42 | 2.23 |
| brand-900 | #0D3C02 | 12.62 | 12.62 | 1.66 |
| brand-950 | #092702 | 16.12 | 16.12 | 1.30 |

Neutrals (page text is black, so these are the derived steps):

| Token | Hex | vs white | Use |
|---|---|---|---|
| ink | #000000 | 21.00 | all copy, headings, button labels on white |
| ink-muted | #565656 | 7.34 | secondary copy AND disabled |
| ink-subtle | #8A8A8A | 3.45 | DECORATIVE ONLY |
| line-strong | #8E8E8E | 3.28 | every interactive boundary, in EVERY state |
| line | #DCDCDC | 1.37 | dividers, non-interactive panel edges |
| surface | #F5F7F4 | 1.08 | recessed fills, quiet bars |
| skeleton | #C9C9C9 | 1.66 | loading placeholders |

Status: danger #B3261E 6.54 · danger-border #D14840 4.46 · danger-soft #FDECEA ·
warn #8A5A00 5.93 · warn-border #A9761A 3.97 · warn-soft #FFF8E8.

line-strong clears 3:1 on every ground it sits on: white 3.28, surface 3.04,
brand-50 3.09.

## THE RULE THAT WILL BITE YOU

**`--color-on-brand` is WHITE (#FFFFFF), not black. This is decided — do not
change it back.**

Black on #156700 is **2.97:1 and fails**. White on it is 7.07:1 and passes. Every
solid brand fill — primary button, selected chip, tick badge, progress marker,
done-step circle — carries WHITE ink.

This is the stated exception to "text is black": a black label on the green CTA is
unreadable, so the client's instruction is that greenish backgrounds take white
text. Black remains the colour of every piece of text sitting on the white page.
Write that reasoning into a comment at the top of `index.css` so nobody "fixes" it
later. The primary CTA stays a solid brand-700 fill with a white label — do not
lighten the fill to make black work.

Two consequences:

- Because the green is DARK, it *can* be a border, an icon, a link, body-accent
  text and a progress bar on white — unlike a light brand colour. Use brand-700
  for links and text, brand-600 (5.54) for small text and icons, brand-500 (4.16)
  for control boundaries and large text. **brand-400 and lighter are fills and
  washes only** — 2.68 fails the 3:1 a boundary owes.
- Solid brand fills need no extra rim to be visible on white: brand-700's own edge
  is 7.07:1.

## Fonts

```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Cormorant Garamond is a delicate, small-on-the-body serif. Set headings at 600/700
and expect to size them up roughly 10–15% versus a sans to hold the same presence
on the page. Give it neutral or slightly open tracking, not the tight negative
tracking a geometric sans wants. Check the smallest heading (the h3/h4 inside
cards) actually holds up — that is where a delicate serif fails first.

Delete any `style={{ fontFamily }}` you find in components; the base layer owns it.

## What "done" looks like

Follow the playbook, but these decisions are already made on the sibling
deployment — match them so the two stay consistent.

**Back button.** It currently sits as a muted text link at the TOP of the question
while every Continue is at the BOTTOM, so correcting an answer means scrolling a
long step all the way back up, and it does not read as a control. Replace it with:

- The step bar made `sticky top-0 z-30` with an opaque `bg-card` fill, so Back is
  on screen at every scroll position.
- Back rendered *centred below the tracker*, not beside it: a pill, `h-9
  rounded-full`, solid `bg-brand-700`, **white** label, `px-4 text-sm
  font-semibold`, hover `bg-brand-800`, focus `ring-2 ring-brand-600
  ring-offset-2`.
- It **names its destination**: "Back to Property Type", "Back to Your Details".
- Step bar inner padding `py-5` (20px), and `mt-5` (20px) between tracker and pill.
- The wrapper is `empty:hidden`, so no empty row is left on steps without a Back.

**Make the store own the back destination.** `goBack()` in
`src/stores/formStore.ts` has the step mapping inlined, so nothing else can read
it. Extract a pure `backTargetFor(state): BackTarget | null`, have `goBack()` apply
whatever it returns, and have the Back control read the same function for BOTH its
label and whether to render at all. Preserve every existing branch exactly —
including `commercialThanks`, which is unreachable from the UI but is still the
store's answer. Check `residentialQuote` has a branch: it is where prefill links
land (`api/prefill.ts` LANDING_STEP), and without it a prominent, enabled Back
button silently swallows the click.

**Logo.** Size by WIDTH, not height — these lockups are stacked, and height-sizing
starves the wordmark. Use a single `w-[170px]` with no breakpoints, identical on
every step.

**Brand strings.** `src/lib/brand.ts`, plus the page `<title>`, `<meta
name="description">` and `<meta name="theme-color">` (set it `#ffffff` to match the
page). Take the real name from the business's own GHL location record via this
repo's GHL MCP server — do not guess. `grep -rn "<OldBrandName>" src index.html`
must come back empty afterwards, ignoring references to `docs/pricing-api-*.md`
filenames.

**Rename the CSS class prefix** (`wwe-` → the new brand's two letters) across
`src/**/*.tsx` and `index.css`, per playbook §2.

**Open every raster asset.** The "powered by" partner logo in `Footer.tsx` may be
white-on-transparent artwork, which vanishes on a white page. If it is pure white,
add `[filter:brightness(0)]`; if it is already dark, add nothing — that filter
flattens coloured artwork into a black blob. Look at the file, do not assume.

## Bugs the sibling deployment had — check for all of them

1. `hover:bg-brand-900` on controls. On dark that was a subtle wash; on white it is
   near-black, so the glyph lands on it at ~1.4:1 and the control becomes a dark
   blob on hover. Check the number stepper in `CommonPropertyDetailsStep.tsx`.
2. Disabled recipes using `border-line` (1.37:1). Disabled owes 3:1 too — use
   `line-strong`. The quote screen *opens* with every control disabled while
   pricing loads, so this is the first thing a customer sees.
3. `disabled:opacity-*` and `hover:opacity-*` anywhere. Never opacity for state —
   it compounds with an already-muted ink. Change fill, border and text instead.
4. Weak focus rings on text inputs (`ring-brand-600/35` composites to ~1.7:1).
   Every control should use a full-strength `ring-2 ... ring-offset-2`.
5. Headings carrying an explicit `text-ink`-style override that fights the base
   layer's heading colour. Pick one and let the base layer own it.
6. `justify-center` on an overflowing flex row pushes the first item past the
   container's start edge where it cannot be scrolled to — check the desktop
   tracker between 768px and 1000px.
7. A sticky sidebar with `top-4` will now scroll under the sticky step bar. Offset
   it past the bar's real height.
8. Icon opacity that compounds: `fill="currentColor" opacity={0.5}` on a meaningful
   icon detail drops under 3:1, and under it again when the card is disabled.

## Rules

- **Presentation only** on the screens. Do not change props, state, handlers,
  effects, validation, form registration, submitted values, copy or analytics. The
  back-destination refactor above is the one deliberate logic change.
- Every colour comes from a token. No `bg-[#...]`, `text-[#...]`, `border-[#...]`.
- **Compute contrast, never eyeball it**, and re-derive any number you are handed:

  ```bash
  node -e 'const lum=h=>{h=h.replace("#","");const c=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]};const cr=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return((x+0.05)/(y+0.05)).toFixed(2)};console.log(cr("#156700","#ffffff"))'
  ```

- **No colour conflicts anywhere** — no dark text on a dark fill, no light text on
  a light fill — in EVERY state: rest, hover, selected, disabled, loading, error.
  Hover rules that repaint a fill without repainting the ink on it are the most
  common instance.

## Verify before claiming done

- `npx tsc -b --force && npx vite build` clean.
- Sweep must come back empty:
  `grep -rn "1B9C85\|06140C\|white/[0-9]\|bg-\[#\|text-\[#\|border-\[#\|disabled:opacity\|<old-prefix>-" src index.html`,
  and `text-white` only on a brand-600-or-darker fill.
- Confirm utilities actually generate — a token defined but never emitted silently
  does nothing: `grep -c "\.bg-brand-700" dist/assets/index-*.css`. Watch your grep
  escaping on variant classes (`md\:foo`, `empty\:hidden`) or you will get false
  zeroes and chase a bug that is not there.
- Read the COMPILED css for the shared selectable recipe and confirm the hover
  rule's `:not([aria-checked='true']):not([aria-pressed='true'])` is present —
  without it, specificity repaints a chosen option as unchosen.
- Drive the running app and read computed styles rather than trusting screenshots.
  Kill transitions first (`*{transition:none!important;animation:none!important}`)
  and force `scroll-behavior:auto`, or a frozen transition will make a working
  state look broken and a swallowed programmatic scroll will make `sticky` look
  broken.
- **Do not submit the form to test it** — it writes a real lead into the client's
  live CRM. Navigate client-side instead: `syncStep` only fires from submit
  handlers, so importing the store module in the dev server and calling
  `setStep(...)` walks the whole flow with zero network writes. Confirm zero calls
  by wrapping `window.fetch`. Note the dev server serves the store at a
  cache-busted URL (`...?t=123`); import the one the app actually loaded or you
  will get a second, unconnected store instance.
- Check 360px, 768px and 1280px, and check the disabled/loading state of the quote
  screen specifically.

Run the playbook's §9 loop at least twice — the first round of fixes reliably
introduces its own bugs. Report at the end: what changed, every contrast decision
with its measured ratio, and anything you found that is a behaviour bug rather
than a branding one (leave those alone and flag them).
