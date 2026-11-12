# Laplace Analyser

**Live: [areeb-ece.github.io/LaplaceAnalyser](https://areeb-ece.github.io/LaplaceAnalyser/)** · made by areeb

See what the Laplace transform does. Type a function, a transform or a differential
equation, and the same thing is shown eight ways at once: the signal in time, its
transform $F(s)$ as a surface over the s-plane, the poles and zeros, the Laplace integral
as a curve and as a sum of vectors, the signal rebuilt from one spinning vector per pole,
and the algebra worked step by step. Any combination of those views can be saved as a
picture, or as a GIF or video with time playing.

The views are inspired by 3Blue1Brown's video on the Laplace transform. The code and
drawings here are this project's own.

It's a static site with no build step, no framework and no server. Everything runs in
the browser tab.

---

## Getting started

```sh
git clone https://github.com/areeb-ece/LaplaceAnalyser.git
```

```sh
cd LaplaceAnalyser
```

```sh
npm run serve
```

Then open <http://localhost:8080>. The page uses JavaScript modules, which browsers
won't load from `file://`, so serve the folder rather than opening `index.html` directly.

To see it exactly as GitHub Pages serves it, under `/LaplaceAnalyser/` and with the
shared design from the portfolio repo checked out next to this one:

```sh
DESIGN_DIR=../areeb-ece.github.io/public/design node tests/serve.js
```

## Deploying

Turn on GitHub Pages for the repository (Settings → Pages → deploy from the `main`
branch, root folder). It is served at `/LaplaceAnalyser/`, next to the portfolio. There
is nothing to build: the files in the repository are the site.

The portfolio reserves the path (`laplaceanalyser` in `reservedSlugs` in its
`site.config.yaml`) so no page of its own can take it, and describes the tool at
[`/tools/laplaceanalyser-notes/`](https://areeb-ece.github.io/tools/laplaceanalyser-notes/).

## Using it

### Input

| Mode | Takes | Example |
| --- | --- | --- |
| Equation | A linear differential equation in `y` with number coefficients, up to order 8, and its starting values | `y'' + 2y' + 5y = e^(-t) cos(2t)` |
| Function f(t) | Sums and products of numbers, powers of `t`, exponentials, sines and cosines, and impulses at $t = 0$ | `t^2 e^(-2t) + sin(3t)`, `2delta(t) + e^(-t)` |
| Transform F(s) | A ratio of polynomials in `s` | `(s + 3)/((s + 1)(s^2 + 4))`, `s/(s + 1)` |

The **Examples** list has 67 starting points from eleven fields, each with a line on
what it models:

| Field | Among the examples |
| --- | --- |
| Signals | step, ramp, exponentials, damped sinusoid, beats, a square wave's first harmonics, a plucked string, the unit impulse and its derivative |
| Electric circuits | RC and RL switched on, RC with a sine source, LC, series RLC under-, over- and critically damped, an RC high-pass's impulse response |
| Filters and communications | low-pass and band-pass filters, Butterworth of order 3 and 4, an AM signal, a phase-locked loop |
| Control systems | proportional and PI control, a DC motor, a double integrator, an inverted pendulum falling and held, a lead compensator |
| Mechanics and structures | mass on a spring, a hammer blow, resonance and near-resonance, a seismometer, coupled masses, a car suspension, a loaded beam |
| Heat and fluids | cooling, a lagging thermometer, tanks in series, a ball with air drag, river flow after a storm |
| Chemistry and medicine | a decay chain, drug levels after an injection, a bolus and a tablet, blood sugar, a nerve cell |
| Physics | radioactive decay, a kicked oscillator, a driven damped oscillator |
| Probability and queues | exponential and Erlang waiting times, two stages at different rates |
| Economics | present value of a growing income, a business cycle |
| Aerospace | aircraft pitch (short period and phugoid), roll rate |

### Typing maths

The boxes typeset what you type as you type it, the way Desmos does:

| Key | Does |
| --- | --- |
| `/` | Starts a fraction. What stands just before it goes on top; select more first to put all of it there. |
| `^` | Starts a power. Everything typed next is raised, until you step out. |
| `Space`, `→` | Steps out of a power or a fraction. `↑` and `↓` go between the top and the bottom of a fraction. |
| `(` | Brings its closing bracket with it, in grey until you type it. Brackets grow with what they hold. |
| `Backspace` | At the start of a fraction or a power, takes it apart again. |
| `Ctrl+Z`, `Ctrl+Shift+Z` | Undo and redo. |

The keys under the box type the same things, for phones and for finding them. A line
typed the old way, with its usual spaces, still comes out right: `e^(-t) sin(3t)`,
`t^2 e^(-2t) + 1` and `(s + 3)/((s + 1)(s^2 + 4))` can be typed exactly as written
here. Copy and paste work on plain text in this syntax:

| Type | Meaning |
| --- | --- |
| `2t`, `3 sin(t)`, `(s+1)(s+2)` | Things side by side are multiplied. `*` works too. |
| `t^2`, `(s+1)^3` | Whole-number powers. |
| `e^(-2t)`, `exp(-2t)`, `2^t` | Exponentials. The closing bracket ends the power. |
| `sin(3t)`, `cos(2t + pi/4)`, `sinh(t)`, `cosh(t)` | The argument must be of the form `a·t + b`. |
| `u(t)`, `step(t)` | The unit step. Every function starts at `t = 0` anyway. |
| `delta(t)`, `delta'(t)`, `delta''(t)` | The unit impulse at `t = 0` and its derivatives, up to the 4th. Also `δ(t)` and `dirac(t)`; the box shows `δ`. |
| `y'`, `y''`, `y^(4)`, `dy/dt`, `d^2y/dt^2` | Derivatives of `y`, in an equation. |
| `1/2`, `pi`, `e`, `sqrt(2)`, `1e-6` | Numbers, anywhere a number is wanted, including starting values. |

Because a power and a fraction show where they end, typing never leaves two readings.
Pasted text can: `e^-2t` and `1/2t` are kept as typed and asked about (write
`e^(-2t)` or `e^(-2)*t`; `1/(2t)` or `(1/2)*t`), not guessed.

### What isn't supported

Each of these is refused with a message that says why:

- Functions whose transform isn't a ratio of polynomials: `1/t`, `sqrt(t)`, `sin(t^2)`,
  `e^(t^2)`, `tan(t)`, `ln(t)`.
- Delayed steps `u(t - a)`, delayed impulses `delta(t - a)` and delay factors `e^(-as)`.
- Squares and products of impulses, `delta(t)^2`, and impulses inside a function,
  `sin(delta(t))`: none of these has a meaning.
- Derivatives of the impulse beyond the 4th, typed or produced by a transform whose
  numerator's degree is more than 4 above its denominator's.
- Non-linear and variable-coefficient equations: `y'' + y^2 = 0`, `t y' + y = 0`.
- Symbolic parameters: coefficients have to be numbers.
- More than 12 poles in all.

A transform typed directly is taken to belong to a causal signal, so its region of
convergence is to the right of its rightmost pole.

### Impulses

`delta(t)` is the unit impulse at $t = 0$: no width, area $1$, and
$\mathcal{L}\{\delta^{(k)}(t)\} = s^k$. So impulses are exactly the polynomial part of a
transform. A transform whose numerator's degree isn't the lower one is divided out first,
$\frac{s^2}{s+1} = s - 1 + \frac{1}{s+1}$, and its inverse starts with impulses:
$\delta'(t) - \delta(t) + e^{-t}$.

- A product sifts: $g(t)\,\delta(t) = g(0)\,\delta(t)$, and
  $g(t)\,\delta'(t) = g(0)\,\delta'(t) - g'(0)\,\delta(t)$.
- In an equation, an impulse on the right is a blow at $t = 0$. The starting values are
  the ones just before it, at $t = 0^-$, which is what the transform uses; $y$ or its
  derivatives jump at $t = 0^+$.
- Impulses alone have no poles, so their integral converges for every $s$.
- **Time domain:** an arrow at $t = 0$ labelled with the impulses. Every value plotted
  or read out is at $t > 0$, where impulses are zero.
- **Integral:** the impulses add $\sum_k d_k s^k$ at once, between $t = 0^-$ and $0^+$.
  They are the first arrow, from the origin; the numerical integral carries on from its
  tip.
- **Integrand** and **Decomposition:** an impulse has no point to plot and no pole, so
  each view names it in its key.

### The views

| View | Shows |
| --- | --- |
| Input | The three modes, the maths boxes, starting values and examples. |
| Worked steps | The transformed equation, $Y(s)$, its partial fractions and $y(t)$. |
| Time domain | $f(t)$ or $y(t)$, with the time cursor. Click or drag to move it. |
| S-plane surface | Height is $\lvert F(s)\rvert$, hue is $\arg F(s)$. Poles are spikes, cut at the height limit. |
| Pole-zero map | Poles (×), zeros (○), the region where the integral converges, and the probe. |
| Integrand | $f(t)e^{-st}$ traced in the complex plane up to the time cursor. |
| Integral | $\int_{0^-}^t f(\tau)e^{-s\tau}\,d\tau$ as arrows laid tip to tail, with $F(s)$ marked. |
| Decomposition | One phasor per pole, its residue times $e^{pt}$, summed tip to tail to give $f(t)$. |

Two things drive every view: the **time cursor** $t$ (the strip under the title bar) and
the **probe** $s$ (drag it on the surface or the pole-zero map, or type it in the strip).

When the probe is left of the region of convergence the integral view shows the arrows
running away and says so, while the surface still has a height there. That height is the
analytic continuation of $F(s)$: the closed form, valid beyond where the integral is.

### Saving pictures

**Save image** opens a sheet with the picture on the right and its options on the left.

| Option | Choices |
| --- | --- |
| Views and their sizes | Any of the seven plots and the worked steps, each small, medium or large. They are arranged to fill the picture, each as near its best shape as the others allow. |
| Format | PNG, a GIF, or a video (MP4 or WebM, whichever the browser records). |
| Shape | 16:9, 3:2, 4:3, 1:1, 3:4, 9:16, or any width and height up to 4096 px. |
| Text and lines | Small, normal or large, independent of the picture's size in pixels. |
| Sheet | The current theme, dark, or light for print; and a see-through background. |
| Show | The title block (the problem, typeset), panel titles, keys and values, the probe point $s$, the time cursor. |
| Time playing | For a GIF or video: how many seconds, and how many frames a second. Time runs from 0 to the end of the window. |

- With the probe point switched off it disappears from the surface and the pole-zero
  map; if a view still depends on $s$, the picture's footer says which $s$ it is for.
- With the time cursor switched off, a still shows the whole window with no cursor
  line, dot or value.
- The credit line is always there, as in the other tools.
- A GIF is encoded in the page (`js/lib/gif.js`); a video is recorded live, so it takes
  as long as the clip.

### Panels

Every view is a panel. Drag a panel's tab onto the edge of another to split it, or onto
its middle to share it as tabs. Drag the gap between two panels to resize them. Each
panel can be maximized or closed, and reopened from **Views**. Three layouts are built
in (Overview, Probe an s value, Solve an ODE), and **Reset** goes back to the first.
The layout and the last input are remembered in this browser.

Below 900 px wide the panels stack in one column instead.

### Keys

| Key | Does |
| --- | --- |
| `Space` | Play or pause time. |
| Arrow keys | On the surface or the pole-zero map: move the probe (`Shift` for bigger steps). On the time plot: move the cursor. On a gap between panels: resize them. On a tab: switch tabs. |
| `Alt` + arrow keys | On the surface: turn the camera. |
| `+` `−` | On the surface or the pole-zero map: zoom. |
| `Esc` | Restore a maximized panel. |

Everything a mouse can do has a keyboard route. A panel is moved with its **⋯** menu
(dock left, right, top or bottom, or join the next panel).

## Checks

```sh
npm test
```

What needs no browser: 21 transform pairs, 10 inverse transforms and 14 differential
equations against their textbook answers to $10^{-6}$, repeated and resonant poles,
every refusal, every example, the numerical integral against $F(s)$ to 1%, the plot
colours' contrast in all 15 themes, the GIF writer (read back by an independent
decoder) and the layout of views in a picture.

```sh
npm i --no-save playwright@1.56.1
```

```sh
npm run test:browser
```

The whole app in Chromium at laptop and phone width: no script errors, no security
policy violations, no request leaving the site, no sideways scroll; the probe drives
every view in the same frame; panels move, resize, close, reopen and survive a reload;
every label is typeset; a PNG, a GIF and a video save with the size and options asked
for; storage can be missing or corrupt. Screenshots go to `test-results/screenshots/`.

```sh
DESIGN_DIR=../areeb-ece.github.io/public/design npm run test:browser
```

The same, with the shared theme, settings panel and sky from the portfolio repo. CI
(`.github/workflows/test.yml`) runs all three on every push.

## How it's put together

```
index.html              the shell: bar, time strip, workspace, syntax sheet, security policy
css/style.css           layout and local components, using only the shared tokens
js/app.js               state, layouts, time transport, what is remembered
js/store.js             the one shared state; tells every view once per frame what changed
js/dock.js              the docking workspace: split tree, tabs, drag and drop, separators
js/palette.js           plot colours resolved from a theme, for canvas and WebGL
js/plot2d.js            shared 2D drawing: complex-plane axes, ticks, arrows
js/math.js              KaTeX three ways: in the page, over a canvas, painted onto a canvas
js/mathfield.js         the maths box: draws lib/field.js's tree, turns keys and clicks into edits
js/legend.js            a plot's key, drawn under it on the page and in saved pictures
js/probe.js             the numerical integral at the probe, shared by two views
js/ui.js                DOM helpers, icons, the menu, safe storage
js/views/               one module per view: { id, title, paint, legend, mount }
js/export/render.js     a saved picture: the chosen views laid out and drawn
js/export/dialog.js     the Save image sheet; PNG, GIF and video
js/lib/                 the math engine (pure: no DOM, runs in Node)
  complex.js poly.js      complex numbers and polynomials
  roots.js                roots and their multiplicities
  parse.js                text → syntax tree
  field.js                the maths box's tree, every edit to it, and tree ↔ text
  expoly.js               signals as sums of c·t^n·e^(λt)
  rational.js             a typed F(s), keeping its factors
  laplace.js              transform, partial fractions, inverse
  ode.js                  equation → Y(s)
  integrate.js            the Laplace integral, numerically
  gif.js                  a GIF writer: palette by median cut, frame differences, LZW
  treemap.js              fitting the chosen views into a picture
  tex.js                  results as TeX and as plain text
  analyse.js              the one entry point: input → model, or a refusal
  presets.js              the examples
vendor/                 Three.js and KaTeX, pinned (npm run vendor)
assets/                 fonts, icon, and an offline copy of the shared design
tests/                  *.test.js (node --test), browser-check.js, serve.js
```

### State

One store holds the input, the model derived from it, the probe, the time cursor, the
visible square of the s-plane and the view options. A change marks its key, and one
`requestAnimationFrame` callback then tells every visible view which keys changed. That
is why dragging the probe in one view repaints the others in the same frame.

### The maths

Every supported signal is an **exponential polynomial**,

$$f(t) = \sum_k c_k\, t^{n_k} e^{\lambda_k t}, \qquad c_k, \lambda_k \in \mathbb{C},$$

with sines and cosines written as pairs of complex exponentials. Such sums are closed
under addition and multiplication, so products like $t\,e^{-2t}\cos 3t$ reduce to this
form exactly, without a computer algebra system.

1. **Parse** the text into a syntax tree.
2. **Reduce** it to terms $c\,t^n e^{\lambda t}$ (a function), to a ratio of factored
   polynomials (a transform), or to coefficients and a forcing function (an equation).
3. **Transform**: $\mathcal{L}\{t^n e^{\lambda t}\} = n!/(s-\lambda)^{n+1}$, so the poles
   of a typed function are known exactly.
4. **Equations**: with $P(s) = \sum_k a_k s^k$,
   $$Y(s) = \frac{G(s) + I(s)}{P(s)}, \qquad I(s) = \sum_{k=1}^{n} a_k \sum_{j=0}^{k-1} s^{\,k-1-j}\, y^{(j)}(0).$$
5. **Roots** by Aberth's method. Roots that coincide are merged only if the polynomial
   really has a repeated root there, then polished as a simple root of a derivative.
   The denominator is kept as its roots and never multiplied out again, so a resonant
   forcing pole merges exactly with a characteristic root.
6. **Partial fractions**, repeated poles included, by expanding numerator and
   denominator about each pole and dividing the power series.
7. **Invert**: $A/(s-p)^j \mapsto A\,t^{\,j-1}e^{pt}/(j-1)!$, and the polynomial part
   (found by long division) $\sum_k d_k s^k \mapsto \sum_k d_k\,\delta^{(k)}(t)$.
8. **Check**: the polynomial part and the partial fractions must add back up to the
   fraction they came from, or the input is refused as too ill-conditioned to show.

The integral view never uses the closed form. It integrates $f(t)e^{-st}$ by Simpson's
rule, so its agreement with $F(s)$ is a real check. Impulses at $t = 0$ are the one
part added by their definition, $\int \delta^{(k)}(t)\,e^{-st}\,dt = s^k$, not
numerically.

### One drawing function per view

Each plot is drawn by one function, `paint(g, state, options, cache)`, where `g` holds
a canvas context, a size, a palette and a place to put labels. On the page that place
is a layer of KaTeX elements over the canvas; for a saved picture the labels are
collected and then painted onto the canvas glyph by glyph, read back from KaTeX's own
layout, so a picture has exactly the typesetting the page shows. Axis numbers are drawn
in KaTeX's faces. The same function serves any theme, any size, with or without the
probe and the time cursor, and every frame of an animation.

### The surface

The mesh is a fixed 320 × 320 grid. The vertex shader computes each height from the
poles, zeros and gain,

$$\log\lvert F(s)\rvert = \log\lvert K\rvert + \sum_i \log\lvert s - z_i\rvert - \sum_k \log\lvert s - p_k\rvert,$$

and the fragment shader computes the phase the same way. A new equation changes a few
uniforms and nothing is rebuilt, and a frame is drawn only when something changed.

### The shared design

The page links the portfolio's design files from the same address:

- `/design/tokens.css`: the 15 themes and the shared type, spacing, control and motion scales;
- `/design/ui.css`: the `sd-` components, the settings panel and the night sky;
- `/design/fonts.css`: Libre Franklin for text;
- `/design/theme.js` and `/design/ui.js`: the visitor's saved settings.

A theme picked on any of areeb's sites applies here too. When `/design/` is missing
(offline, or from a local server), `js/theme.js` links the copy in `assets/design/` and a
Light/Dark button appears. Refresh the copy when the master changes:

```sh
cp ../areeb-ece.github.io/public/design/{tokens,ui}.css assets/design/
```

Plot colours are palette tokens, one per quantity in every view (`js/palette.js`):

| Quantity | Token |
| --- | --- |
| $f(t)$, $y(t)$, and the sum of the phasors | `--c0` |
| The probe $s$ | `--c4` |
| The integrand | `--c6` |
| The running integral | `--c2` |
| The closed-form $F(s)$ | `--c3` |
| Phasors: poles above the axis, their conjugates, real poles | `--c5`, `--c7`, `--c1` |

The one exception is the surface, whose hue is the phase itself.

### Vendored libraries

| Library | Version | Used for |
| --- | --- | --- |
| Three.js | 0.183.0 | The WebGL surface (core module only), loaded when that view first opens |
| KaTeX | 0.19.0 | Typesetting all maths: worked steps, plot labels, keys, saved pictures |

`npm run vendor` copies them from npm into `vendor/`. `package.json` itself has no
dependencies.

## Privacy

The page's Content Security Policy includes `connect-src 'none'`: it can't make network
requests. There are no analytics. The layout, the last input and the Save image
choices are kept in `localStorage` under `laplaceanalyser.*`, and nowhere else. Saved
pictures are made in the page and handed straight to the browser's download.

## Licence

MIT. Three.js and KaTeX are MIT; mononoki and Libre Franklin are under the SIL Open
Font Licence (texts in `vendor/` and `assets/fonts/`).
