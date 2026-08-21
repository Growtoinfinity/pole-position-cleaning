# Reskin Playbook

How to take one of these multi-step quote forms and re-theme it for a new brand, end to end.

Written while converting the Kings Window Cleaning form (navy `#013252` + gold `#BF8639`,
white text on dark) into the Greenmaster Services form (white page, green accents).
Everything brand-specific is a placeholder like `<BRAND-700>` so the same document drives the
next ninety-nine.

The order matters. Tokens before primitives, primitives before screens, screens before
verification. Doing it the other way round means editing the same file three times.

**The single most important thing in here** is §9. A reskin is not done when it compiles and
looks green. It is done after two or three rounds of *find → fix → re-review*, because the
first round of fixes reliably introduces its own bugs. On this project round 1 produced 27
findings, the fixes for those produced 29 more, and those produced 24 more — including one
blocker in a shared CSS class that would have broken the selected state on every option in
the form. None of them were visible in a screenshot.

---

## 0. Audit before you touch anything

Get the size of the job first. Five minutes here saves an hour of surprises.

```bash
grep -rno "#[0-9A-Fa-f]\{6\}" src --include=*.tsx --include=*.ts | sed 's/.*#/#/' | sort | uniq -c | sort -rn
```

On the Kings form:

| Count | Hex | Role in the old theme |
|-------|-----|-----------------------|
| 101 | `#BF8639` | gold accent |
| 24 | `#013252` | navy page background |
| 1 | `#d59b54` | gold hover |
| 1 | `#1b1b1b` | text on gold |

Then inventory the utilities that silently assume a dark background:

```bash
grep -rnc "text-white\|white/[0-9]" src | grep -v ":0$"
grep -rn "bg-\[#\|text-\[#\|border-\[#" src
grep -rnoE "(bg|text|border|ring)-(red|amber|orange|green|slate|gray)-[0-9]{2,3}" src | awk -F: '{print $NF}' | sort | uniq -c
```

Three things to write down:

1. **Which files hold colour.** These are your work units.
2. **Which generated tokens are actually referenced.** Run the grep below — most of the
   scaffolded token block is dead weight you can delete rather than translate.
3. **Whether raster assets carry brand colour.** Open them. See §6.

```bash
grep -rnoE "\b(bg|text|border|ring)-(background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring|sidebar[a-z-]*|chart-[1-5])\b" src | sort | uniq -c
```

On the Kings form that 200-line shadcn token block was referenced **five times**. Everything
else was template scaffolding nobody had pruned.

Also run a dead-code pass now, while you still have fresh eyes:

```bash
# every component that nothing imports
for f in $(find src -name '*.tsx'); do
  n=$(basename "$f" .tsx)
  [ "$(grep -rl "$n" src --include=*.tsx | grep -v "^$f$" | wc -l)" -eq 0 ] && echo "DEAD? $f"
done
```

This surfaced two dead components and nine orphaned images on this project. Restyling dead
files is pure waste, and worse, a dead file's styling drifts and misleads whoever revives it.

---

## 1. Pull the palette out of the logo

Do not invent a palette. Sample the logo, then build a ramp around the sampled values so
tints and shades stay in the same hue family.

Three anchors from the mark:

| Anchor | What to look for | Greenmaster value |
|--------|------------------|-------------------|
| **700** | the darkest solid colour in the wordmark | `#0e7a3a` |
| **500** | the brightest / most saturated colour | `#3fae49` |
| **200** | any pale tint, wash or secondary shape | `#c5e5c8` |

Interpolate the rest into a 50→950 ramp. Keep the hue steady, move lightness.

### The contrast gate

Check every shade you will put text or a border in, **before** you commit. On a white page:

| Shade | vs `#ffffff` | Verdict |
|-------|-------------|---------|
| `<BRAND-800>` `#0a6130` | **7.6 : 1** | headings |
| `<BRAND-700>` `#0e7a3a` | **5.4 : 1** | solid buttons w/ white text, links, body accents |
| `<BRAND-600>` `#1e9040` | **4.1 : 1** | meaningful icons, rings, hover borders, progress fills |
| `<BRAND-500>` `#3fae49` | **2.9 : 1** | decorative tints and washes **only** |
| `<BRAND-400>` `#5fbe6c` | **2.3 : 1** | fills only — **never** a control border |

Thresholds: **4.5:1** normal text, **3:1** large text (≥18.66px bold / ≥24px), **3:1** for
the boundary of a UI component and for graphics that carry meaning.

Verify every candidate. Do not eyeball, and do not trust a number someone else supplied — a
reviewer on this project proposed `#8fa298` for the control-border token claiming it cleared
3:1; it computes to **2.70:1** and would not have fixed the bug it was raised for.

```bash
node -e '
const lum = h => { h=h.replace("#",""); const c=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255)
  .map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; };
const cr=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
for (const a of process.argv.slice(1)) console.log(a, cr(a,"#ffffff").toFixed(2)+":1 vs white");
' "#0e7a3a" "#3fae49" "#849789"
```

Write the verdict for each shade into a comment at the top of the CSS. The brightest brand
colour is the one everyone reaches for and the one that fails; naming it *decorative only*
in the file itself is what stops it creeping back in three screens later.

### The rule nobody expects: control boundaries

On a white page, a white control's border is its **only** affordance. WCAG 1.4.11 asks 3:1
of it. Most design systems ship 1.2–1.5:1 borders that look fine on a grey page and vanish
on a white one — text fields and option chips read as blank space until hovered.

So you need **two** neutral line tokens, not one:

| Token | Value | Ratio | Used for |
|-------|-------|-------|----------|
| `line-strong` | `#849789` | **3.10 : 1** | anything interactive, **in every state** |
| `line` | `#cdd9d1` | 1.45 : 1 | dividers, edges of non-interactive panels |

Hover must also clear 3:1. The instinct is to lighten the border on hover (`brand-400`,
2.3:1) — which makes the affordance *less* visible than the resting state it replaced.

---

## 2. One token layer, in `src/index.css`

Tailwind v4's `@theme` block declares the CSS variables **and** generates the utilities, so a
token defined once is immediately usable as `bg-*`, `text-*`, `border-*`, `ring-*`,
`shadow-*`, with opacity modifiers.

```css
@import "tailwindcss";

@theme {
  /* ---- Typography ---- */
  --font-sans:    '<BODY-FONT>', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-display: '<HEADING-FONT>', '<BODY-FONT>', system-ui, sans-serif;

  /* ---- Brand ramp: 700/500/200 sampled from the logo, rest interpolated ---- */
  --color-brand-50:  <BRAND-50>;
  --color-brand-100: <BRAND-100>;
  --color-brand-200: <BRAND-200>;   /* pale tint from the mark */
  --color-brand-300: <BRAND-300>;
  --color-brand-400: <BRAND-400>;   /* 2.3:1 — fills and washes ONLY */
  --color-brand-500: <BRAND-500>;   /* 2.9:1 — DECORATIVE ONLY */
  --color-brand-600: <BRAND-600>;   /* 4.1:1 — icons, rings, hover borders */
  --color-brand-700: <BRAND-700>;   /* 5.4:1 — buttons, links */
  --color-brand-800: <BRAND-800>;   /* 7.6:1 — headings */
  --color-brand-900: <BRAND-900>;
  --color-brand-950: <BRAND-950>;

  /* ---- Text: three levels, no more ---- */
  --color-ink:        <INK>;         /* body copy           ~16:1 */
  --color-ink-muted:  <INK-MUTED>;   /* secondary AND disabled ~6:1 */
  --color-ink-subtle: <INK-SUBTLE>;  /* ~3.9:1 — DECORATIVE ONLY */

  /* ---- Surfaces and lines ---- */
  --color-surface:     <SURFACE>;      /* faint tinted panel */
  --color-line:        <LINE>;         /* dividers, panel edges */
  --color-line-strong: <LINE-STRONG>;  /* control boundaries — must clear 3:1 */

  /* ---- Loading ---- */
  --color-skeleton: <SKELETON>;        /* ~1.7:1 — see §10 */

  /* ---- Status ---- */
  --color-danger: <DANGER>;      --color-danger-soft: <DANGER-SOFT>;
  --color-warn:   <WARN>;        --color-warn-soft:   <WARN-SOFT>;
  --color-warn-border: <WARN-BORDER>;

  /* ---- Bridge tokens: only the ones the base layer / primitives reference ---- */
  --color-background: #ffffff;         --color-foreground: <INK>;
  --color-border: <LINE>;              --color-input: <LINE-STRONG>;
  --color-ring: <BRAND-600>;           --color-muted: <SURFACE>;
  --color-muted-foreground: <INK-MUTED>;
  --color-card: #ffffff;               --color-destructive: <DANGER>;

  /* ---- Radii ---- */
  --radius-md: 0.5rem;   --radius-lg: 0.75rem;   --radius-xl: 1rem;

  /* ---- Elevation: a white card on a white page needs a shadow you can SEE ---- */
  --shadow-card:  0 1px 2px rgb(<INK-RGB> / 0.06), 0 6px 16px -8px rgb(<INK-RGB> / 0.22);
  --shadow-brand: 0 1px 2px rgb(<BRAND-700-RGB> / 0.16), 0 10px 22px -12px rgb(<BRAND-700-RGB> / 0.45);
}
```

Then the base layer — four of these five rules exist to head off a specific bug (§10):

```css
:root {
  color-scheme: light;              /* stops the OS dark preference repainting native controls */
  -webkit-font-smoothing: antialiased;
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-ink font-sans; line-height: 1.55; }
  h1, h2, h3, h4 { @apply font-display; letter-spacing: -0.015em; line-height: 1.25; }
  a { @apply text-brand-700; } a:hover { @apply text-brand-800; }
  :focus-visible { outline: 2px solid var(--color-brand-600); outline-offset: 2px; }
  input[type='checkbox'], input[type='radio'] { accent-color: var(--color-brand-600); }
}
```

Namespace your own component classes and animations with a two-letter brand prefix (`gm-`,
`kw-`, …) and **rename them when you fork**. Leaving `kq-page-column` in a Greenmaster
codebase means the next person greps for the brand and misses half the layout.

### Verify the token layer before writing a single component

```bash
npx vite build
grep -o "\-\-color-brand-[0-9]*:[^;]*" dist/assets/index-*.css
for u in text-brand-800 bg-brand-700 border-line-strong shadow-brand text-danger; do
  printf "%-20s %s\n" "$u" "$(grep -c "\.$u" dist/assets/index-*.css)"
done
```

A utility that comes back `0` is not being generated, and every class using it silently does
nothing. Catch that now, not after restyling twenty files.

> A token defined in `@theme` but never *used* also emits nothing. That is correct Tailwind
> behaviour, not a bug — don't chase it. Check again once a call site exists.

---

## 3. The generic mapping table

Any **dark → light** conversion is this table applied file by file. Going light → dark, read
it right to left.

### Colour

| Old (dark theme) | New (light theme) | Notes |
|------------------|-------------------|-------|
| `bg-[<DARK-BG>]` page background | `bg-white` | |
| `bg-[<DARK-BG>]` on a card/control | `bg-white` + `border border-line` | on dark, cards separate by fill; on light, by border |
| `bg-white/5`, `bg-white/10` | `bg-surface` or `bg-brand-50` | a translucent white panel has no light-mode equivalent |
| `text-white` | `text-ink` | **unless** on a `brand-600`+ fill, where it stays |
| `text-white/90` | `text-ink` | |
| `text-white/70`, `/60` | `text-ink-muted` | |
| `text-white/50`, `/40` | `text-ink-muted` | **not** ink-subtle — see §10 |
| `border-white/20` | `border-line` (panel) / `border-line-strong` (control) | the split matters |
| `border-white/40`, `/50` | `border-line-strong` | |
| `text-[<ACCENT>]` heading | `text-brand-800` | the accent was legible on dark; the same value rarely is on white |
| `bg-[<ACCENT>]` fill | `bg-brand-700` | must clear 4.5:1 if it carries white text |
| `bg-[<ACCENT>]/10` selected tint | `bg-brand-50` | a 10% accent on dark ≈ a 50-shade tint on light |
| `ring-[<ACCENT>]` | `ring-brand-600` | |
| `text-red-300` (error on dark) | `text-danger` | light reds are unreadable on white |
| `bg-red-500/10 border-red-500/20` | `bg-danger-soft border-danger` | |
| `bg-amber-500/10 text-amber-100` | `bg-warn-soft text-warn` | |
| `bg-green-500/20 text-green-400` | `bg-brand-100 text-brand-600` | success is on-brand when the brand is green |
| `bg-white/25` loading shimmer | `bg-skeleton` | a shimmer tuned for dark is invisible on white |

### Structure

| Old pattern | New pattern | Why |
|-------------|-------------|-----|
| Fill-based grouping | Border + a shadow you can see | on white, a fill this light disappears |
| Colour-only selected state | Colour **plus** a tick / ring / dot / weight change | fails for colour-blind users, ambiguous for everyone |
| `opacity-50` for disabled | Change fill, border and text colour | **never opacity** — see §10 |
| `shadow` (Tailwind default) | `shadow-card` | the stock shadow is tuned for grey pages |
| Two `variant="brand"` buttons | one `brand`, one `outline` | on dark both read as "the button"; on white the competition is obvious |
| Hidden step labels on mobile | progress bar + "Step 2 of 5 · Property Type" | a row of bare numbers is not wayfinding |
| Full-width form fields | one shared max-width column | inputs stretching past 1000px read badly and jump between screens |

---

## 4. Primitives, and the contract they owe the screens

Restyle these **before** the screens. Each screen then becomes a mechanical mapping job
instead of a design job — which is what makes it safe to parallelise.

| File | Owns | Contract |
|------|------|----------|
| `ui/button.tsx` | every action | `variant: 'brand' \| 'outline' \| 'ghost'`, `size: 'sm' \| 'md' \| 'lg'` |
| `ui/input.tsx` | text fields | exports `fieldClasses` + `invalidFieldClasses`; `invalid?: boolean` |
| `ui/select.tsx` | native selects | reuses `fieldClasses`, supplies its own chevron |
| `ui/label.tsx` | field labels | |
| `ui/chip.tsx` | pill choices | `selected`, `role?: 'radio' \| 'button'` |
| `ui/InfoNote.tsx` | inline callouts | `variant`, renders its own icon |
| `ui/FieldError.tsx` | validation text | one place for the look of every error |
| `ui/BrandLogo.tsx` | the logo | **the only file that imports the logo asset** |
| `SelectableCard.tsx` | option cards | `icon?: ReactNode`, `role?: 'radio' \| 'button'` |
| `lib/brand.ts` | brand strings | `name`, `shortName`, `homepageUrl` |

Rules that pay for themselves:

- **Extract `fieldClasses` from the Input.** The moment a `<select>` or a hand-rolled
  combobox needs to line up with the inputs, you either share the string or you drift.
- **Never let a screen import the logo directly.** One component means the next rebrand is
  one file, and the alt text is right everywhere for free.
- **One shared column class.** `.gm-step-column { @apply mx-auto w-full max-w-3xl; }` applied
  to every question screen. Without it the heading slides hundreds of pixels sideways between
  consecutive steps as each screen picks its own width.

### The shared selectable, and the trap inside it

A form like this has six or seven "pick this option" surfaces — property cards, frequency
cards, add-on rows, time preferences, chips. Left to themselves they drift into six different
border weights, radii and selected treatments. Hoist one recipe:

```css
.gm-selectable {
  forced-color-adjust: none;   /* stops Windows High Contrast flattening the selected state */
  @apply relative cursor-pointer rounded-xl border-2 border-line-strong bg-white;
  @apply transition-[border-color,background-color,box-shadow] duration-150;
}
.gm-selectable:hover:not(:disabled):not([aria-checked='true']):not([aria-pressed='true']) {
  @apply border-brand-600 bg-brand-50 shadow-card;
}
.gm-selectable[aria-pressed='true'], .gm-selectable[aria-checked='true'] {
  @apply border-brand-600 bg-brand-50;
}
.gm-selectable:disabled { @apply cursor-not-allowed border-line-strong/70 bg-surface; }
.gm-selectable:focus-visible { @apply outline-none ring-2 ring-brand-600 ring-offset-2; }
```

Driving the selected look from `aria-checked` / `aria-pressed` is good — the state lives in
the markup where a screen reader can also see it. But it has two sharp edges:

**The specificity trap.** Write the hover rule the obvious way and it *outranks* the selected
rule:

```
.gm-selectable:hover:not(:disabled)              → (0,3,0)   class + :hover + :not(:disabled)
.gm-selectable[aria-checked='true']              → (0,2,0)   class + attribute
```

Specificity beats source order, so hovering an option you had already chosen repaints it back
to the **unselected** look — and on touch, where `:hover` sticks after a tap, it stays wrong
until you tap elsewhere. The `:not([aria-checked='true']):not([aria-pressed='true'])` above
removes the conflict outright. Verify it in the compiled CSS, not the source:

```bash
grep -o "\.gm-selectable[^{]*{[^}]*}" dist/assets/index-*.css
```

**The silent-miss trap.** Any call site that forgets the aria attribute gets *no selected
styling at all*, and nothing errors. Make "every `.gm-selectable` carries `aria-checked` or
`aria-pressed`" an explicit line item in your verification pass.

### Brand strings

```ts
export const BRAND = {
  name: '<Full Legal Name>',
  shortName: '<Short Name>',
  homepageUrl: '<https://…>',
} as const
```

`grep -rn "<OldBrandName>" src index.html` must come back empty. It hides in: page `<title>`,
`<meta name="description">`, image `alt`, consent/marketing copy, an external homepage link,
**doc comments**, and form placeholders like `e.g. Acme Ltd` — that last one is an example of
the *customer's* business, so it must not become your own brand name.

---

## 5. Typography

Two families at most: a display face for headings that echoes the logo's construction, and a
neutral UI face for everything else. `Poppins` + `Inter` suits a geometric rounded logo;
`Inter` alone is a fine answer if the logo is neutral.

Wire it in `index.html`, let the base layer apply it, and delete every
`style={{ fontFamily: … }}` you find in the components — there were two on this project, both
fighting the stylesheet.

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700&display=swap" rel="stylesheet">
```

If you load only weights 600 and 700, then `font-semibold` vs `font-bold` is a **visible
jump**, not a hint. Pick one for step headings and hold it everywhere.

---

## 6. Assets — the part that bites

Open every image before assuming it survives the theme flip.

**Third-party logos are usually white-on-transparent.** The "powered by" mark on this form
became invisible the instant the page went white. If you cannot get a dark version:

```tsx
<img src={PartnerLogo} alt="Partner" className="h-4 w-auto opacity-60 [filter:brightness(0)]" />
```

`brightness(0)` drives pure-white artwork to pure black. It only works on pure-white
artwork — on a coloured logo it produces a black blob. Ask for a proper asset when you can.

**Raster icons carry the old accent colour.** The nine property-type PNGs here were gold
silhouettes. `hue-rotate` is fragile and looks off. Replacing them with inline SVGs drawn in
`currentColor` is better on every axis: they inherit the brand colour, stay crisp, respond to
hover and selected states, and dropped ~70 kB.

```tsx
export type PropertyIconProps = { className?: string }

export function DetachedIcon({ className }: PropertyIconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth={2.25}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden
         className={cn('h-16 w-16', className)}>
      {/* … */}
    </svg>
  )
}
```

Keep the set on one optical grid — same bounding box, same implied ground line, same roof
pitch, same window size — or they read as nine icons from nine different sets. And colour
them `brand-600`, not `brand-500`: an icon that carries the meaning of an option is a
meaningful graphic and owes 3:1, not the 2.9:1 the brightest brand shade gives you.

**The favicon** is easy to miss and often an absolute URL pointing at the previous client's
CDN. Point it at the same file the header uses so one logo swap covers both:

```html
<link rel="icon" type="image/png" href="/src/assets/logo.png" />
```

**`theme-color`.** `<meta name="theme-color" content="<BRAND-700>">` tints mobile browser
chrome. Cheap win.

---

## 7. Shell before screens

Four files set the frame everything else sits inside:

- **Header** — logo, `h1`, one line of sub-copy. **Collapse it after the first step.** On a
  360px phone the full header plus the step bar ate 43% of the viewport on *every* screen,
  pushing each question below the fold. The pitch only needs making once.
- **Step bar** — desktop gets labelled circles; mobile gets a progress bar plus the step name
  in words. Give the back button its own row so the tracker stays centred, and give it a real
  44px tap target — it is the only way to correct an earlier answer.
- **Main** — the content column and the step-transition animation.
- **App** — the page background, the initial loading state, and the **scroll reset**.

Define the content column as a component class, never as a string assembled in TypeScript —
a class name built in a TS string never reaches Tailwind's scanner and silently fails to
compile.

**Reset scroll on every step change.** Without it the browser keeps the previous offset, so
pressing Continue from the bottom of a long step drops the customer into the middle of the
next one with the question already off-screen above. Measured on this form: a 360px phone
landed 148px past the heading on one transition and 708px past it on another.

```tsx
useEffect(() => {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
}, [step])
```

---

## 8. Screens, in parallel

With tokens and primitives fixed, each screen is independent. Group them so no two workers
touch the same file, and give every worker the same spec: the utility list, the contrast
budget, the primitive contracts, the heading recipe, and one instruction that matters more
than the rest —

> **Presentation only.** Do not change props, state, handlers, effects, validation rules,
> form registration, submitted values or analytics calls. Same behaviour, new skin.

A sensible grouping for a form of this shape:

| Group | Files |
|-------|-------|
| Icon set | `components/icons/*` — **must land first**, the card screens import it |
| Contact / first step | the entry form |
| Type-selection steps | every option-card grid |
| Detail steps | chips, steppers, conditional fieldsets |
| Quote (desktop) | the price screen |
| Quote (mobile) | the narrow-column price screen |
| Booking | dates, times, address |
| Commercial branch | the alternate flow |
| Terminal screens | thank-you, not-covered, not-supported |

Coordination rules learned the hard way:

- **Nobody runs the build.** Concurrent `tsc -b` / `vite build` race on the output directory
  and on `tsbuildinfo`. One verification pass runs it afterwards, alone.
- **Fix shared contracts up front.** Write the icon module's exact export names into every
  worker's brief so importers and author agree without waiting on each other.
- **Give workers permission to push back.** "If a finding is wrong when you read the code, say
  so in your report and skip it" catches briefs written from a stale reading.

---

## 9. Verification — the loop, not the checkbox

**Budget for three rounds.** Round 1 finds the leftovers. Fixing those introduces new bugs.
Round 2 finds those. This is not a sign anything went wrong; it is what the work is.

Each round is: **build → automated sweep → two independent reviewers → fix → repeat**.

Use *two* reviewers per round with different briefs, because they catch different things:

1. **A checker**, given the explicit list of what should now be true. Verifies claims.
2. **A fresh-eyes critic**, given no list, asked to walk the journey as a customer at 360px
   and 1280px. This is the one that finds the £0 total and the trap screen with no buttons.

Verify what actually shipped, not what the source says. Read the compiled CSS for anything
involving specificity or `@apply`, and re-derive contrast numbers rather than accepting them.

### Driving a real browser

Reading computed styles from a live page beats a screenshot: you get the actual resolved
colour and can compute contrast on the spot.

```js
const card = document.querySelector('.gm-selectable[aria-checked="true"]')
getComputedStyle(card).borderTopColor   // → the value that really shipped
```

**Kill transitions and animations first.** A headless or backgrounded browser pane does not
composite frames, so in-flight CSS transitions never advance and `getComputedStyle` returns
the *start* value forever. Half an hour was spent on this project chasing a selected state
that looked broken and was not — the element had `opacity-100` in its class list and computed
`opacity: 0`, purely because a 150ms transition was frozen at frame zero.

```js
const s = document.createElement('style')
s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'
document.head.appendChild(s)
```

Two more traps in this kind of scripted walk:

- **React has not re-rendered yet.** Read state back after a `setTimeout`, not in the same
  tick as the click, or you will measure the previous render.
- **Zero-size nodes are false positives** in an overflow sweep. `<option>` elements and hidden
  inputs report as out-of-bounds; filter to `width > 2 && height > 2`.
- **`position: sticky` "failing"** is usually the element running out of *containing block*,
  not out of stickiness. Compare its offset against its parent across two scroll positions
  before concluding anything: if the gap between them changed, it stuck.

### Automated sweep

```bash
grep -rn "<OLD-ACCENT>\|<OLD-BG>" src index.html      # must be empty
grep -rn "white/[0-9]" src                            # every hit is a dark-theme leftover
grep -rn "text-white" src                             # only legal on a brand-600+ fill
grep -rn "text-red-300\|text-red-400" src             # errors tuned for dark
grep -rn "bg-\[#\|text-\[#\|border-\[#" src           # any arbitrary colour
grep -rn "opacity-4\|opacity-5\|opacity-6\|disabled:opacity" src   # see §10
grep -rn "<OldBrandName>" src index.html
grep -rn "assets/logo.png" src                        # only BrandLogo.tsx
grep -rn "<old-css-prefix>-" src                      # renamed component classes
grep -rn "gm-selectable" src                          # each must carry aria-checked/pressed
npx tsc -b --force && npx vite build
```

The most common build break after a parallel restyle is an **unused import** left behind when
the JSX using it was replaced — a PNG import after the icon swap, a `logo` import after
`BrandLogo`. `tsc` catches all of them if `noUnusedLocals` is on.

### Manual checklist

- [ ] Every screen at 360px, 768px and 1280px. **768px especially** — if a `useResponsive`
      hook hands over at exactly 768, the desktop layout renders at its own tightest width.
- [ ] Tab through one full journey. Is the focus ring visible on every control, on white?
- [ ] Screenshot, desaturate, look again. Is every selected state still obvious?
- [ ] Do disabled controls read as disabled rather than merely faint — and can you still read
      the text explaining *why* they are disabled?
- [ ] Native `<select>`, checkbox and radio with the OS in **dark mode**. (This is what
      `color-scheme: light` is for. Test it.)
- [ ] Every state of every screen: initial, loading, empty, validation-failed, unavailable,
      dead-end, success. These are where reskins rot.
- [ ] Walk a **dead end** and a **failed submit** on a phone. Can the customer get out? Does
      anything move when they press the button?

---

## 10. Gotchas, roughly in the order they will bite you

**`h1 { font-size: 3.2em }` in the stock stylesheet.** Vite's starter leaves this behind. It
sits outside any `@layer`, so it beats every Tailwind `text-*` utility in the cascade and
your `text-3xl` heading silently renders at the wrong size. Delete it.

**`color-scheme: light dark` on `:root`.** With the OS in dark mode the browser repaints
native selects, checkboxes and scrollbars dark inside your white form. Set `light` explicitly.

**`overflow-x-hidden` on a wrapper silently kills `position: sticky`.** `overflow-x: hidden`
computes `overflow-y` to `auto`, which makes that element the sticky child's scroll container.
It never scrolls, so the sticky element just… doesn't stick. On this form it disabled the
running-total sidebar on the one screen where it mattered. Keep the clip on `body`.

**A translucent-white panel has no light-mode translation.** `bg-white/5` was doing real work
on navy. On white it is nothing. That is a decision, not a substitution.

**Disabled must never use `opacity`.** Fading white-on-green lands near **2:1**. Worse,
opacity *compounds*: a `disabled:text-ink-subtle` under a `disabled:opacity-45` computed to
roughly 1.5:1 — the stepper's minus button was invisible at its minimum value. And it is
exactly backwards: the text explaining *why* a control is unavailable becomes the least
readable thing on it. Change fill, border and text colour instead, and keep every word at
full opacity. Then grep for it, because it comes back.

**Loading placeholders need their own token.** A shimmer at `brand-100` is 1.16:1 on white,
and `animate-pulse` halves it to ~1.08:1. The whole quote screen rendered as blank disabled
rows — it read as *broken*, not *busy*. A skeleton wants ~1.7:1.

**Order your disabled-button hint by what is actually true on arrival.** A three-way hint
whose "nothing selected yet" branch sits above its "still loading" branch can never show the
loading message — because on arrival *both* are true, and the customer is told to pick
something while every row is disabled.

**Never render `£0` from a total that reduces "priced on visit" rows to zero.** The customer
sees a free quote in the largest, boldest figure on the page and books. Show "Priced on the
visit" instead, and when it is a mix, name what the number excludes.

**`useState(false)` in a responsive hook flashes the wrong layout.** First paint is always the
desktop branch, then an effect corrects it. Seed it lazily from the real width. Separately:
if two breakpoint-swapped components each hold their own local state, resizing across the
breakpoint unmounts one and mounts the other and the customer's selections vanish. Lift that
state into the store.

**A hidden input cannot take focus, so `shouldFocusError` is a silent no-op.** Chip and card
groups that register a `<input type="hidden">` for validation will publish an error, fail to
scroll to it, and leave the customer pressing a button that appears to do nothing. Pass an
`onInvalid` handler to `handleSubmit` that scrolls the group into view.

**`setValue` without `shouldValidate: true` leaves stale errors on screen.** After one failed
submit the red "please choose one" stays pinned under an option the customer has now visibly
chosen.

**A component defined inside a render function remounts on every render.** React treats it as
a different element type, so the button you just clicked is destroyed and focus is lost —
a keyboard user cannot press `+` twice. Hoist it to module scope.

**Placeholders are not labels.** They render at your faintest token, they vanish on first
keystroke, and they routinely carry information found nowhere else ("Gate code, how to find
the property"). Move that into a helper line under the label.

**Required markers are a convention you must finish.** If screen 1 marks every required field
with `*` and screen 3 marks none, required-ness only surfaces after a failed submit. Audit
every screen, and check no *optional* field wears one.

**Marking a dead end "complete" can strip its only way out.** Adding a not-supported screen to
an `isComplete` set removed its Back button, leaving a page with zero controls and no escape
but a reload. Terminal and dead-end are not the same thing.

**`tailwind-merge` needs no configuration for custom tokens** — but verify once per project
rather than assuming:

```bash
node -e "const{twMerge}=require('tailwind-merge');console.log(twMerge('text-ink','text-brand-800'),'|',twMerge('text-sm','text-ink'))"
```

**Verify with transitions disabled.** See §9 — a frozen transition makes a perfectly good
selected state look broken, and it is very easy to "fix" a bug that was never there.

**Copy bugs hide in the theme.** This conversion surfaced a residential thank-you screen that
thanked the customer "for your commercial premises", and a dead component that had been
routed around for months. Read the strings while you are in there.

---

## 11. The short version

1. `grep` the hex inventory and the dead files. Count the work.
2. Sample 700 / 500 / 200 from the logo, build the ramp, **compute every contrast ratio**.
3. Split the neutral line token in two: `line-strong` ≥3:1 for controls, `line` for dividers.
4. Write `@theme`. Build. Confirm the utilities actually generate.
5. Rename the CSS class prefix to the new brand.
6. Restyle the primitives. Extract `fieldClasses`. Create `BrandLogo`, `lib/brand.ts`, one
   shared column class and one shared selectable recipe — and check the recipe's specificity
   in the **compiled** CSS.
7. Open every asset. Replace brand-coloured rasters with `currentColor` SVGs. Fix the favicon.
8. Restyle the shell: header (collapsing), step bar, main, app-level loading, **scroll reset**.
9. Fan the screens out in parallel with the mapping table and *presentation only* as the rule.
10. Build, sweep, two reviewers, fix. **Three times.**
11. Walk the whole journey at three widths, in every state, before you call it done.
