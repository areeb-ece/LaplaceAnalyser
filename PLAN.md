# Laplace Analyser: plan

Status: **approved and built.** All seven milestones are done. The recommended option
was approved for decisions D1 to D4; for D5 the name is Laplace Analyser, with the
wordmark `LAPLACE/ANALYSER`. Section 14 lists what changed while building.

---

## 1. What I found in the existing repos

Read in depth: `areeb-ece.github.io` (the master design files in `public/design/`, its
`CLAUDE.md` and `PRODUCT.md`) and `satisfactorytools` (shell, CSS, tests, CI). Skimmed:
`prereqflow` and `otucalendar` (markup, package, design fallback), enough to confirm
they follow the same pattern.

### Stack

| | Portfolio | The tools |
| --- | --- | --- |
| Build | Astro 7, static output, GitHub Actions deploy | **None.** Pages serves the `main` branch root |
| Code | TypeScript (erasable syntax), vanilla client JS | Vanilla JS, ES modules, no framework |
| Dependencies | npm, "none added without asking" | **Zero** runtime or dev dependencies in `package.json` |
| Tests | `node --test` + Playwright browser check | `node --test "tests/*.test.js"` + `tests/browser-check.js` (Playwright 1.56.1, installed with `--no-save`) |
| Maths | KaTeX 0.19 at build time | none |

### Shared design system (`/design/`, served by the portfolio on the same origin)

- `tokens.css`: 15 themes (Night is the default), each defining surfaces (`--bg`,
  `--sheet`, `--sheet-2`, `--card`), four ink tiers (`--ink` to `--ink-4`), rules,
  `--accent`, status colours, eight data hues `--c0..--c7`, six highlights `--h0..--h5`,
  and radii. Then the shared scales: type `--fs-1..8`, space `--sp-1..10` (4 px base),
  control heights `--ctl-h*`, motion `--dur-1..3` (zeroed by reduced motion and by
  `data-motion="off"`), layers `--z-*`, focus ring `--ring*`, and mixed colours
  (`--field`, `--well`, `--tint*`, `--hover`, `--row-line`).
- `ui.css`: the `sd-` components (bar, wordmark, buttons, segmented control, fields,
  select, tabs, table, card, callout, tag, kbd, dialog, toast), the settings gear and
  panel, and the night sky.
- `theme.js` (pre-paint) and `ui.js`: one `localStorage["design.settings"]` entry shared
  by every site, exposed as `window.SiteDesign` with `onChange`.
- `fonts.css`: Libre Franklin for text. Each tool ships mononoki itself for figures,
  tables and the wordmark.

### Conventions every tool follows

- Head order: own fallback CSS, then `/design/tokens.css`, `ui.css`, `fonts.css`, then
  `/design/theme.js` and the tool's `js/theme.js`. Offline, a copy of the master in
  `assets/design/` is linked instead and a plain Light/Dark button appears.
- Header: `header.sd-bar` with `SD-WORDMARK<span>/</span>STYLE`, a "by areeb" link to the
  portfolio, actions, then `<span data-design-settings>` for the gear.
- Component CSS uses tokens only: no raw colours, sizes or durations. States are
  attributes (`aria-*`, `data-*`), not classes.
- Strict CSP in a `<meta>` tag: `default-src 'none'; script-src 'self'; style-src 'self';
  connect-src 'none'`. No inline scripts or styles, no CDNs, no external requests.
- Workspace tools (PrereqFlow, the Satisfactory planner) fill the window: a side panel
  on `--sheet` and a stage over the sky.
- Desktop-first, no horizontal scroll, drawer or stacked layout on phones.
- `CLAUDE.md` in each repo carries the "display rules" (no inferable bloat).
- Browser check asserts: no script errors, no CSP violations, no request outside the
  page's own files, no sideways scroll at desktop and phone width.

---

## 2. Decisions that need your sign-off

### D1. Stack: no build step, vanilla ES modules (recommended)

Same as the three tools: `index.html` + `css/` + `js/`, `node --test`, Pages from the
`main` branch root at `/LaplaceAnalyser/`. Types via JSDoc.

Alternative: Vite + TypeScript with an Actions deploy. Better editor support and
tree-shaking, but it is a different setup from every other tool and adds a toolchain to
maintain. I see no strong reason to deviate.

### D2. Two vendored runtime libraries (a first for the tools)

The brief names Three.js and KaTeX. Neither can come from a CDN under the family CSP,
so both are committed to `vendor/` at pinned versions, copied by `scripts/vendor.js`
(`package.json` stays dependency-free, as in the other tools).

| Library | What ships | Size (min) | Loaded |
| --- | --- | --- | --- |
| Three.js | core ES module only, no addons | about 700 KB (about 180 KB gzipped) | lazily, when the surface panel first opens |
| KaTeX 0.19 (the portfolio's version) | `katex.mjs`, CSS, woff2 fonts | about 600 KB with fonts | with the steps panel |

Consequence: the CSP gains `style-src-attr 'unsafe-inline'`, because KaTeX writes
inline `style` attributes. The portfolio already makes exactly this one loosening for
the same reason. Everything else stays as strict as Satisfactory Tools.

Alternative for the surface: hand-written WebGL2 (no Three.js, about 400 more lines of
my own code). Zero dependencies, but harder for you to maintain later.

### D3. Docking layout: hand-written (recommended)

A split tree of tab stacks, about 700 lines, styled only with `sd-` tokens.

- Why not a library: `dockview-core` and Golden Layout bring their own visual language
  and theming layer, and neither gives keyboard-operable splitters or a keyboard way to
  move a panel, which the brief requires.
- Scope: drag a tab to any edge of a stack (split) or onto its tab strip (join),
  splitters, maximize, close, reopen from a Views menu, three presets, reset.
- Not included: floating windows and pop-outs.

Alternative: vendor `dockview-core` (faster to build, weaker keyboard access, restyling
work to match the family).

### D4. Maths scope edges

- Coefficients are numbers. No symbolic parameters such as `a` or `ω`.
- Mode C accepts strictly proper rational functions only. An improper $F(s)$ means
  $f(t)$ contains impulses; it is rejected with a message saying so.
- Mode C assumes a causal signal, so the region of convergence is right of the
  rightmost pole.
- Denominator degree is capped at 12 (ODE order up to 6, comfortably above the required 4).
- Delayed steps $u(t-a)$ stay a stretch goal, attempted after milestone f.

### D5. Name and address (decided: Laplace Analyser)

Title "Laplace Analyser", wordmark `LAPLACE/ANALYSER`, served at `/LaplaceAnalyser/`,
storage keys `laplaceanalyser.*`.

---

## 3. Architecture

```
index.html              shell: bar, workspace, CSP
css/style.css           layout and local components (tokens only) + night/paper fallback
js/theme.js             offline design fallback (as in Satisfactory Tools)
js/app.js               boot, wiring, presets menu, persistence
js/store.js             shared state, one redraw per animation frame
js/dock.js              docking workspace (split tree, tabs, drag, splitters)
js/palette.js           reads plot colours from the theme tokens for canvas and WebGL
js/plot2d.js            shared 2D canvas helpers: axes, complex-plane grid, arrows, pan/zoom
js/tex.js               engine results -> KaTeX strings
js/views/*.js           one module per view: { id, title, mount(el, store) }
js/lib/                 THE MATH ENGINE: pure, no DOM, runs in Node
  complex.js              complex arithmetic
  poly.js                 polynomials: arithmetic, Horner, Taylor shift, derivative
  roots.js                Aberth iteration, multiplicity clustering, polishing
  parse.js                tokenizer and parser for f(t), F(s) and ODE text
  expoly.js               the ring of exponential polynomials (see section 5)
  laplace.js              forward transform, partial fractions, inverse, ROC
  ode.js                  ODE + initial conditions -> Y(s)
  integrate.js            truncated numerical integral of f(t)e^{-st}
  analyse.js              one entry point: input -> model (or a specific error)
  presets.js              the built-in examples
vendor/                 three, katex (pinned, generated by scripts/vendor.js)
assets/                 fonts (mononoki), icon, design/ (offline copy of the master)
tests/                  *.test.js (node --test), browser-check.js (Playwright)
```

The engine never imports from outside `js/lib/`, and the views never do maths beyond
evaluating what the engine returns.

## 4. State model

One store. Views subscribe and receive the set of changed keys.

| Key | Contents | Written by |
| --- | --- | --- |
| `input` | mode (ode / function / rational), text fields, initial conditions | input panel, presets |
| `model` | derived by `analyse(input)`: $F(s)$ as gain, poles with multiplicity and residues, zeros, ROC abscissa, time-domain terms, worked steps, suggested time window; or an error | store, on `input` change |
| `probe` | $s = \sigma + i\omega$ | surface, pole-zero map, keyboard |
| `time` | cursor $t$, window, playing, speed | time view, transport controls |
| `options` | surface clamp, log scale, thumbnails | surface toolbar |
| `layout` | dock tree | dock |

`store.set()` only marks keys dirty. A single `requestAnimationFrame` callback then
calls every mounted view once, so a probe drag in the 3D view repaints the pole-zero
map, integrand and integral views in that same frame. Hidden panels skip drawing.

Persisted (versioned, validated on load, wrapped in `try/catch`): `input`, `layout`,
`options`. Corrupt or unavailable storage falls back to the cos preset and the
Overview layout.

## 5. Math pipeline

**Signal family.** Every supported $f(t)$ is an exponential polynomial:

$$f(t) = \sum_k c_k\, t^{n_k} e^{\lambda_k t}, \qquad c_k, \lambda_k \in \mathbb{C}$$

Sines and cosines enter through Euler's formula. This set is closed under addition and
multiplication, so products such as $t\,e^{-2t}\cos 3t$ or $\sin^2 t$ reduce to it
exactly, with no computer algebra system.

**Steps.**

1. **Parse** to an AST: `+ - * / ^`, implicit multiplication (`3t`, `2y'`), `exp`,
   `sin`, `cos`, `sinh`, `cosh`, `u(t)`, `pi`, `e`. ODEs use `y'`, `y''`, `y^(4)`.
2. **Reduce** to exponential-polynomial terms. Rejected here, each with its own message:
   non-linear arguments ($\sin t^2$), division by $t$, non-integer powers, unknown names.
3. **Transform** term by term: $\mathcal{L}\{t^n e^{\lambda t}\} = \dfrac{n!}{(s-\lambda)^{n+1}}$.
   Poles of a typed $f(t)$ are therefore known exactly; no root-finding is needed.
4. **ODE** $\sum_k a_k y^{(k)} = g(t)$ with $P(s) = \sum_k a_k s^k$:

   $$Y(s) = \frac{G(s) + I(s)}{P(s)}, \qquad I(s) = \sum_{k=1}^{n} a_k \sum_{j=0}^{k-1} s^{\,k-1-j}\, y^{(j)}(0)$$

5. **Roots** of $P(s)$ (and of a typed rational's numerator and denominator): Aberth
   iteration, then cluster nearby roots into one root of multiplicity $m$, polish it as a
   simple root of $P^{(m-1)}$, snap conjugate pairs and near-real roots.
   The denominator is kept **factored** as (pole, multiplicity) pairs and never
   re-expanded, so a resonant forcing pole merges exactly with a characteristic root.
6. **Partial fractions**, repeated poles included. For a pole $p$ of multiplicity $m$,
   Taylor-shift $N(s)$ and $Q(s) = D(s)/(s-p)^m$ to $p$ and divide the power series to
   order $m-1$. This is exact algebra, with no numerical differentiation.
7. **Inverse**: $\dfrac{A}{(s-p)^j} \mapsto A\,\dfrac{t^{\,j-1}}{(j-1)!}\,e^{pt}$, with
   conjugate pairs combined into real $e^{\sigma t}(a\cos\omega t + b\sin\omega t)$ form.
8. **Region of convergence**: $\operatorname{Re}(s) > \sigma_c = \max_k \operatorname{Re}(p_k)$
   over poles with non-zero residue. Cancelled pole-zero pairs are reported, not hidden.
9. **Worked steps** as KaTeX: the transformed equation, $Y(s)$, the partial-fraction
   form and $y(t)$. Numbers print as small fractions when they are ones, otherwise to
   four significant figures.

**Numerical integral.** $I(T) = \int_0^T f(t)e^{-st}\,dt$ by composite Simpson on a grid
with at least 40 samples per period of the fastest oscillation, accumulated once per
change of $f$ or $s$. Classification by $\operatorname{Re}(s) - \sigma_c$: converges,
boundary (does not settle), diverges. When it diverges the view says so and marks the
surface value as the analytic continuation.

## 6. Views

| View | Rendering | Notes |
| --- | --- | --- |
| Input | DOM, `sd-` fields | mode switch, equation, initial conditions, presets, worked steps, error callout |
| Time domain | canvas 2D | $f(t)$ or $y(t)$, draggable cursor, play / pause / speed, arrow keys scrub |
| S-plane surface | WebGL | height $\lvert F(s)\rvert$, hue $\arg F(s)$, clamp and log toggles, probe stem and label, optional $e^{st}$ thumbnails |
| Pole-zero map | canvas 2D | ×, ○ (multiplicity shown), shaded ROC, draggable probe |
| Integrand | canvas 2D | $f(t)e^{-st}$ traced up to the time cursor |
| Integral | canvas 2D | tip-to-tail path, resultant vector, marker at $F(s)$, convergence status |
| Decomposition | canvas 2D | one phasor per pole term, summed tip-to-tail, scrolling trace of the sum |

**Surface performance.** The mesh is a fixed grid. The vertex shader computes the
height from pole, zero and gain uniforms:

$$\log\lvert F(s)\rvert = \log\lvert K\rvert + \sum \log\lvert s - z_i\rvert - \sum \log\lvert s - p_k\rvert$$

A new equation changes uniforms only, with no mesh rebuild on any thread, so orbiting
and probe dragging stay at 60 fps. A worker is only needed if delayed steps (the stretch
goal) are added, since they do not fit this product form.

**Interaction on the surface.** Drag empty space to orbit, wheel to zoom, right-drag or
two fingers to pan. Click the plane or drag the probe handle to move $s$. Focused, the
arrow keys move the probe and `Shift` + arrows orbit.

## 7. Colour

One role, one token, in every view:

| Quantity | Token | Extra cue |
| --- | --- | --- |
| $f(t)$, $y(t)$, and the phasor sum | `--c0` | solid line |
| Probe $s$ | `--c4` | ring marker, label |
| Integrand $f(t)e^{-st}$ | `--c6` | solid line |
| Running integral and resultant | `--c2` | arrowheads |
| Analytic $F(s)$ | `--c3` | diamond marker |
| Phasors: upper-half-plane poles / conjugates / real poles | `--c5` / `--c7` / `--c1` | labelled |
| Poles and zeros | `--ink` | × and ○ |
| Region of convergence | `--tint` | hatch + label |
| Axes, grid | `--ink-3`, `--rule` | |

- Canvas and WebGL cannot read CSS variables, so `palette.js` resolves them and
  re-resolves on `SiteDesign.onChange`.
- A unit test checks every plot colour for at least 3:1 against `--sheet` in all 15
  themes. In the monochrome themes (Console, Amber) hues nearly coincide, which is why
  each quantity also has a non-colour cue.
- One deliberate exception: surface hue encodes phase, so it is a full hue wheel rather
  than palette colours, with a phase key beside it.

## 8. Layout

- Presets: **Overview** (input, time, surface, pole-zero), **Probe an s value**
  (surface, integrand, integral, pole-zero), **Solve an ODE** (input with steps, time,
  pole-zero, decomposition).
- Splitters are `role="separator"`, focusable, moved with arrow keys. Each panel header
  has a menu (move left / right / up / down, maximize, close) so nothing needs a drag.
- Below 900 px the dock is replaced by one stacked column of the open views.
- Checked at 1280 × 720.

## 9. Accessibility and motion

- Every control reachable by keyboard, shared focus ring, `aria-live` status for errors
  and for the integral's convergence state.
- With `prefers-reduced-motion` or the settings panel's Animations switch off: nothing
  autoplays, camera moves are instant, and time is scrubbed manually. Pressing Play
  still works, since that is an explicit request.

## 10. Verification

- `npm test`: at least 15 transform pairs and 5 ODEs against closed forms at $10^{-6}$.
  Each ODE solution is also substituted back into its equation and initial conditions.
  Plus: repeated and resonant poles, parser rejections, and the numerical integral
  against analytic $F(s)$ within 1% inside the ROC.
- `npm run test:browser` (Playwright 1.56.1, served at `/LaplaceAnalyser/`): no errors,
  no CSP violations, no outside requests, no sideways scroll; cos preset has poles at
  $\pm i$; a probe drag changes the integrand and integral views; a rearranged layout
  survives a reload. Run offline and with `DESIGN_DIR` pointing at the portfolio.
- CI: `.github/workflows/test.yml`, copied from Satisfactory Tools.
- After each milestone: tests, browser check, and screenshots reviewed by eye.

## 11. Milestones (one commit each)

| | Milestone | Done when |
| --- | --- | --- |
| a | Math engine with tests | `npm test` green on the pairs and ODEs above |
| b | Shell, shared styling, docking | panels move, resize, close, reopen, persist |
| c | Time-domain and pole-zero views | cos preset shows $\pm i$; probe draggable |
| d | 3D surface with probe | reference images 2 and 3 (left side) reproducible |
| e | Integrand, integral, decomposition | reference images 1 and 3 (right side) reproducible; 1% check passes |
| f | ODE mode, worked steps, presets, persistence | 8+ presets; steps render in KaTeX |
| g | Polish, performance, README, CI | 60 fps check, all acceptance criteria ticked |

## 12. Small choices made (closest to the existing repos)

- Fallback design files in `assets/design/` linked by `js/theme.js`, as in Satisfactory
  Tools, the newest of the three.
- A `CLAUDE.md` carrying the family's display rules.
- Own orbit controls (about 150 lines) instead of Three's `OrbitControls` addon, which
  needs an inline import map that the CSP forbids, and has no keyboard probe handling.
- No footer: like the other tools, the source link and credits sit in the bar's menu.
- MIT licence, mononoki copied from a sibling repo with its OFL text.

## 13. Outside this repo (not done without your say-so)

- Portfolio: add `laplaceanalyser` to `reservedSlugs`, add a tool notes page, and
  update the "five sites" comments in `public/design/`.
- GitHub: turn on Pages for this repo (`main`, root) once the branch is merged.

## 14. What changed while building

- **Eight panels, not seven.** The worked steps are their own panel instead of living
  inside the input panel, so they can sit beside the plots or be closed.
- **One transport for time, in a strip under the bar.** Play, pause, speed and the
  time slider drive every view, so they sit outside any one panel (a layout without the
  time plot still needs them). The time plot keeps the draggable cursor.
- **The probe can be typed.** Its real and imaginary parts are number fields in the same
  strip: the exact way to place it, and a keyboard route.
- **The time cursor starts at the end of the window**, so every view opens complete
  rather than empty. Play restarts from zero.
- **Typed transforms keep their factors.** `(s + 1)^3` stays a triple root instead of
  being multiplied out and found again numerically.
- **A self-check before anything is shown.** The partial fractions must add back up to
  the fraction they came from; if they don't (poles too close to separate accurately),
  the input is refused.
- **Three.js 0.183.0**, the newest release that ships a minified module build.
- **Not done: delayed steps** `u(t - a)`, the stretch goal. They are refused with a
  message. The surface shader assumes a ratio of polynomials, which a delay isn't.
- **No worker was needed.** The surface's heights are computed on the GPU.

## 15. After the first release

Added at areeb's request, on the same architecture:

- **Save as an image**, as in the other tools: a sheet with a live preview where the
  views, their sizes, the picture's shape and size, the sheet, a see-through background
  and what to show (title block, panel titles, keys, the probe point, the time cursor)
  are chosen. Stills save as PNG; time playing saves as a GIF or a video.
- **No new dependency for any of it.** The GIF writer (median-cut palette, frame
  differences, LZW) and the layout of views in a picture are hand-written and unit
  tested; video uses the browser's own `MediaRecorder`.
- **Every view draws through one function**, used for the page and for pictures. This
  replaced the per-view canvas code of the first release.
- **All maths outside the input boxes is typeset with KaTeX**: plot labels, keys and
  values, the time and probe readouts, the syntax sheet. KaTeX now loads with the page
  rather than on first use. What to type is still shown as typed.
- **Sixty-one examples in eleven fields**, each with a note on what it models.
- **Not offered: SVG.** The other tools save SVG, but the surface is a WebGL raster, so
  a vector file could only hold part of the picture.
