# CLAUDE.md

Laplace Analyser: a static, no-build web tool in areeb's family of tools
(`areeb-ece.github.io`, `prereqflow`, `otucalendar`, `satisfactorytools`). `README.md`
has the architecture and the commands; `PLAN.md` has the reasoning behind the design.

## Hard rules

- **No build step, no framework, no dependencies in `package.json`.** Vanilla ES modules.
  The two libraries in `vendor/` (Three.js, KaTeX) are pinned and copied by
  `npm run vendor`; don't add another without asking areeb.
- **The look comes from the master design files** (`areeb-ece.github.io/public/design/`,
  served at `/design/`). `css/style.css` uses their tokens only: no raw colours, sizes or
  durations. `assets/design/` is an offline copy; refresh it when the master changes,
  never edit it.
- **One colour per quantity, everywhere** (`js/palette.js`). `tests/themes.test.js`
  checks each against the panel colour in all 15 themes; every quantity also has a cue
  that isn't colour, because some themes are nearly monochrome.
- **The engine (`js/lib/`) is pure**: no DOM, runs in Node, never imports from outside
  its folder. Views draw what it returns and do no maths of their own.
- **A view draws through its `paint` function only**, which must not touch the DOM or
  the store: the same function draws the page and every saved picture, in any theme and
  at any size. Labels go to `g.math`; keys are described by `legend`.
- **Maths that isn't being typed is typeset** (`js/math.js`), never written out as
  text. What the user should type stays in the code face.
- **Never show a silently wrong result.** Input the engine can't handle is refused with
  an `InputError` whose message says what's wrong and what to type instead. Anything
  ambiguous (`e^-2t`, `1/2t`) is asked about, not guessed.
- **CSP stays strict** (`index.html`). The only loosening is
  `style-src-attr 'unsafe-inline'`, which KaTeX needs. No inline scripts or styles, no
  external requests. The browser check fails on any violation.
- **Tests before commits:** `npm test`, then `npm run test:browser` offline and with
  `DESIGN_DIR` pointing at the portfolio.

## Display rules

No inferable bloat in the UI or in exports (image, SVG, PDF, print, text). Displayed
text is bloat if any of these apply:

1. **Inferable from the view:** it restates what the viewer can already see or count on
   the same screen or export (totals of visible cards, per-column counts, "7 to go" next
   to a list of those 7).
2. **Not about this view:** it describes data that isn't shown (whole-sheet totals on an
   export of the goal path). Any number that stays is computed from exactly what that
   view displays.
3. **Trivia:** it doesn't help the user decide or do anything (link, card or machine
   counts, layout mode, generation dates and timestamps).
4. **Raw internal format:** an internal code where a human label exists ("1-1" →
   "Year 1 Sem 1", "202701" → "Winter 2027").
5. **Duplicate:** the same fact twice on one view. Keep the one in the most useful place.

Test for every candidate: given what's still visible, would the user lose anything they
need if it were gone? If not, leave it out.

Keep: legends and keys, a status label that is the only non-colour cue for that status,
titles, and any fact the user needs that appears nowhere else on the view. Useful text
in the wrong place gets moved, not deleted.
