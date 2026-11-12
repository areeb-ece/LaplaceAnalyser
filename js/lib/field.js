// The maths box as a tree, and every edit a key can make to it. No DOM here: the page
// (js/mathfield.js) draws this and passes the keys on.
//
// A row is { items, owner }. An item is one of
//   { k: "ch", c }            one character; ghost: true on a bracket the box added itself
//   { k: "frac", num, den }   two rows, one above the other
//   { k: "sup", body }        a power: the row raised after what comes before it
//   { k: "sqrt", body }       a square root over a row
// The cursor is { row, i }: it sits before items[i]. With an anchor as well, what lies
// between the two is selected.
//
// The box holds no meaning of its own: toText() writes the tree out in the syntax
// parse.js reads, with every fraction and power bracketed so nothing is left to guess,
// and fromText() builds the tree back from such text.
import { WORDS, FUNCS } from "./parse.js";

const SLOTS = { frac: ["num", "den"], sup: ["body"], sqrt: ["body"] };
/** The rows inside an item, in reading order. */
export const rowsOf = (it) => (SLOTS[it.k] || []).map((name) => it[name]);
const row = (items = []) => ({ items, owner: null });
const ch = (c, ghost = false) => (ghost ? { k: "ch", c, ghost } : { k: "ch", c });
const frac = (num = [], den = []) => ({ k: "frac", num: row(num), den: row(den) });
const sup = (body = []) => ({ k: "sup", body: row(body) });
const sqrt = (body = []) => ({ k: "sqrt", body: row(body) });
const chars = (text) => [...text].map((c) => ch(c));

/** Is this item the character c? */
export const is = (it, c) => !!it && it.k === "ch" && it.c === c;
const among = (it, set) => !!it && it.k === "ch" && set.includes(it.c);

// The bracket that opens the group position k is in (scanning left from k), and the one
// that closes the group opened at k. -1 when there is none.
function openerOf(items, k) {
  let depth = 0;
  for (let j = k - 1; j >= 0; j--) {
    if (is(items[j], ")")) depth++;
    else if (is(items[j], "(")) { if (!depth) return j; depth--; }
  }
  return -1;
}
export function closerOf(items, k) {
  let depth = 0;
  for (let j = k + 1; j < items.length; j++) {
    if (is(items[j], "(")) depth++;
    else if (is(items[j], ")")) { if (!depth) return j; depth--; }
  }
  return -1;
}
// One pair of brackets around everything.
const wraps = (items) => items.length >= 2 && is(items[0], "(") && closerOf(items, 0) === items.length - 1;
const peel = (items) => (wraps(items) ? items.slice(1, -1) : items);

// Where the factor that ends at position `end` begins: what a "/" typed there takes as
// its numerator. Digits, names, primes, whole bracket groups, powers and fractions join
// it; a sign or an = ends it.
function factorStart(items, end) {
  let j = end;
  while (j > 0) {
    const it = items[j - 1];
    if (it.k !== "ch") { j--; continue; }
    if (it.c === ")") { const open = openerOf(items, j - 1); if (open < 0) break; j = open; continue; }
    if (!/[0-9a-zπδ.']/.test(it.c)) break;
    j--;
  }
  return j;
}

const NUMBER = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/;

/**
 * What each item of a row is, for spacing and for the face it is set in:
 *   digit · var · fn (a letter of sin, cosh…) · bin (+ − · between two things) ·
 *   sign (a + or − in front) · rel (=) · open · close · prime · other,
 *   exp10 and raised for the e and the power in a number such as 1e-6,
 *   and frac, sup, sqrt for those.
 * Names are found exactly as parse.js finds them, so the box shows what will be read.
 */
export function kinds(r) {
  const items = r.items, out = new Array(items.length);
  for (let k = 0; k < items.length; k++) {
    const it = items[k], c = it.c;
    if (it.k !== "ch") { out[k] = it.k; continue; }
    if (/[0-9.]/.test(c)) {
      let run = "";
      for (let j = k; j < items.length && items[j].k === "ch" && /[0-9.e+-]/.test(items[j].c); j++) run += items[j].c;
      const m = NUMBER.exec(run);
      if (!m) { out[k] = "other"; continue; }
      for (let n = 0; n < m[0].length; n++) out[k + n] = n < m[1].length ? "digit" : n === m[1].length ? "exp10" : "raised";
      k += m[0].length - 1;
    } else if (/[a-z]/.test(c)) {
      const word = WORDS.find((w) => w.length > 1 && [...w].every((l, n) => is(items[k + n], l)));
      if (!word) { out[k] = "var"; continue; }
      for (let n = 0; n < word.length; n++) out[k + n] = "fn";
      k += word.length - 1;
    } else if (c === "π" || c === "δ") out[k] = "var";
    else if (c === "+" || c === "-") out[k] = k === 0 || among(items[k - 1], "+-*=(/^") ? "sign" : "bin";
    else out[k] = c === "*" ? "bin" : c === "=" ? "rel" : c === "(" ? "open" : c === ")" ? "close" : c === "'" ? "prime" : "other";
  }
  return out;
}

// ── tree to text ──

// A base for which e^-2t would have two readings (see parse.js): a number, e, pi, or a
// bracket that might hold one.
const exponential = (it) => !!it && it.k === "ch" && /[0-9.eπ)]/.test(it.c);
const ATOM = /^(\d+\.?\d*|[a-z]|pi)$/;

/** The row in the syntax parse.js reads. An empty box inside it is written □. */
export function toText(r) {
  const items = r.items, kind = kinds(r);
  if (!items.length) return r.owner ? "□" : "";
  let out = "";
  items.forEach((it, k) => {
    const prev = items[k - 1], next = items[k + 1];
    if (it.k === "ch") {
      if (kind[k] === "rel" || (kind[k] === "bin" && it.c !== "*")) out += ` ${it.c} `;
      else if (it.c === "π") out += /[a-z]$/.test(out) ? " pi" : "pi";
      else if (it.c === "δ") out += /[a-z]$/.test(out) ? " delta" : "delta";
      else out += it.c;
    } else if (it.k === "sup") {
      const text = toText(it.body);
      out += /^(\d+|[a-z])$/.test(text) || wraps(it.body.items) ? "^" + text : `^(${text})`;
      // t^2 e^(-t), not t^2e…: a number must not run into what follows it
      if (next && (next.k !== "ch" || /[0-9a-zπ.]/.test(next.c))) out += " ";
    } else if (it.k === "sqrt") {
      out += `sqrt(${toText(it.body)})`;
    } else {
      // dy/dt and d²y/dt² go out as the derivative they are, not as a division
      const top = /^d(?:\^\(?(\d+)\)?)?y$/.exec(toText(it.num).replace(/ /g, "")), under = /^dt(?:\^\(?(\d+)\)?)?$/.exec(toText(it.den).replace(/ /g, ""));
      if (top && under) { out += ` d${top[1] ? "^" + top[1] : ""}y/dt${under[1] ? "^" + under[1] : ""} `; return; }
      // above the bar only a sum needs brackets; below it, anything longer than one name or number
      const sum = kinds(it.num).some((x, n) => n > 0 && (x === "bin" || x === "rel") && it.num.items[n].c !== "*");
      const num = toText(it.num), den = toText(it.den);
      const body = `${sum && !wraps(it.num.items) ? `(${num})` : num}/${ATOM.test(den) || wraps(it.den.items) ? den : `(${den})`}`;
      const alone = (!prev || among(prev, "+-*=(")) && (!next || among(next, "+-*=)"));
      out += alone ? body : `(${body})`;
    }
  });
  return out.replace(/ {2,}/g, " ").trim();
}

// ── text to tree ──

const SWAP = { "−": "-", "–": "-", "—": "-", "·": "*", "×": "*", "∙": "*", "⋅": "*", "÷": "/", "′": "'", "’": "'", "‘": "'", "`": "'", "´": "'", "″": "''" };
const SUPER = { "²": "2", "³": "3", "⁴": "4" };
// What a key or a pasted character stands for. A dead key that has swallowed the next
// letter (^ then e gives ê on some keyboards) is taken apart again.
function spell(text) {
  let out = "";
  for (const raw of String(text).toLowerCase()) {
    if (SWAP[raw] !== undefined) { out += SWAP[raw]; continue; }
    const parts = raw.normalize("NFD");
    if (parts.length > 1 && /[́̂]/.test(parts)) out += (parts.includes("̂") ? "^" : "'") + parts[0];
    else out += raw === " " ? " " : raw;
  }
  return out;
}

const FLAT = Symbol("flat");
const LEIBNIZ = /^d\s*(?:\^?\s*(\d+))?\s*y\s*\/\s*d\s*t\s*(?:\^?\s*(\d+))?/;

// Reads text the way parse.js would, into items. Where the parser would stop to ask
// (1/2t, e^-2t), this throws FLAT and the text is kept as plain characters, so the
// question still gets asked.
function read(s) {
  let i = 0;
  const skip = () => { while (s[i] === " ") i++; };
  const wordAt = () => WORDS.find((w) => s.startsWith(w, i));
  const factorNext = () => i < s.length && /[0-9a-z.(]/.test(s[i]);

  function group(items) {           // "(" … ")", brackets included
    i++;
    const inner = rowUntil(true);
    if (s[i] !== ")") throw FLAT;
    i++;
    items.push(ch("("), ...inner, ch(")"));
  }
  function root(items) {            // sqrt( … )
    i += 4; skip();
    if (s[i] !== "(") throw FLAT;
    i++;
    const inner = rowUntil(true);
    if (s[i] !== ")") throw FLAT;
    i++;
    items.push(sqrt(inner));
  }
  function primary(items) {
    const c = s[i];
    if (c === "(") return group(items);
    const num = NUMBER.exec(s.slice(i));
    if (num) { items.push(...chars(num[0])); i += num[0].length; return; }
    const w = c && /[a-z]/.test(c) ? wordAt() : null;
    if (!w) throw FLAT;
    if (w === "sqrt") return root(items);
    if (w === "pi") { items.push(ch("π")); i += 2; return; }
    items.push(...(w === "delta" ? [ch("δ")] : chars(w))); i += w.length;
    if (w === "y") { while (s[i] === "'") { items.push(ch("'")); i++; } return; }
    // delta'(t): the impulse's derivatives carry their primes before the bracket
    if (w === "delta" || w === "dirac") while (s[i] === "'") { items.push(ch("'")); i++; }
    if (FUNCS.has(w)) { skip(); if (s[i] !== "(") throw FLAT; group(items); }
  }
  function exponent(base) {         // what follows a ^
    skip();
    if (s[i] === "(") {
      const items = [];
      group(items);
      // y^(4) is the fourth derivative: there the brackets are part of the meaning
      const derivative = (is(base, "y") || is(base, "'")) && items.slice(1, -1).every((it) => it.k === "ch" && /\d/.test(it.c));
      return derivative ? items : items.slice(1, -1);
    }
    const items = [];
    if (s[i] === "-" || s[i] === "+") { if (s[i] === "-") items.push(ch("-")); i++; skip(); }
    const num = NUMBER.exec(s.slice(i));
    if (num) { items.push(...chars(num[0])); i += num[0].length; }
    else {
      const w = s[i] && /[a-z]/.test(s[i]) ? wordAt() : null;
      if (!w || FUNCS.has(w)) throw FLAT;
      if (w === "pi") items.push(ch("π")); else items.push(...chars(w));
      i += w.length;
      if (w === "y") while (s[i] === "'") { items.push(ch("'")); i++; }
    }
    if (exponential(base) && factorNext()) throw FLAT;
    return items;
  }
  function divisor() {              // what follows a /
    skip();
    const items = [];
    while (s[i] === "-" || s[i] === "+") { items.push(ch(s[i])); i++; skip(); }
    primary(items);
    skip();
    if (s[i] === "^") { i++; items.push(sup(exponent(items.at(-1)))); }
    return items;
  }
  function rowUntil(close) {
    const items = [];
    while (i < s.length) {
      const c = s[i];
      if (c === " ") { i++; continue; }
      if (c === ")") { if (close) return items; items.push(ch(")")); i++; continue; }
      if (c === "(") {
        i++;
        const inner = rowUntil(true);
        items.push(ch("("), ...inner);
        if (s[i] === ")") { items.push(ch(")")); i++; }
        continue;
      }
      if (c === "/") {
        i++;
        const num = items.splice(factorStart(items, items.length));
        if (!num.length) throw FLAT;
        items.push(frac(peel(num), peel(divisor())));
        skip();
        if (factorNext()) throw FLAT;
        continue;
      }
      if (c === "^") { i++; if (!items.length) throw FLAT; items.push(sup(exponent(items.at(-1)))); continue; }
      if (SUPER[c]) { items.push(sup([ch(SUPER[c])])); i++; continue; }
      const d = c === "d" ? LEIBNIZ.exec(s.slice(i)) : null;
      if (d) {
        const power = (n) => (n ? [sup(chars(n))] : []);
        items.push(frac([ch("d"), ...power(d[1]), ch("y")], [ch("d"), ch("t"), ...power(d[2])]));
        i += d[0].length;
        continue;
      }
      if (/[a-z]/.test(c)) {
        const w = wordAt();
        if (w === "sqrt") { root(items); continue; }
        if (w === "pi") { items.push(ch("π")); i += 2; continue; }
        if (w === "delta") { items.push(ch("δ")); i += 5; continue; }
        items.push(...chars(w || c)); i += (w || c).length;
        continue;
      }
      items.push(ch(c)); i++;
    }
    return items;
  }
  return rowUntil(false);
}

/** Text in parse.js's syntax, as items. */
function itemsFrom(text) {
  const s = spell(text).replace(/\s+/g, " ").trim();
  try { return read(s); } catch (e) { if (e !== FLAT) throw e; return chars(s); }
}

// ── the box: a tree, a cursor and what is selected ──

/** A new box holding this text, the cursor at its end. */
export function createField(text = "") {
  const st = { root: row(), cur: null, anchor: null, was: null, rows: new Set() };
  reset(st, text);
  return st;
}
/** Replace everything in the box. */
export function reset(st, text) {
  st.root = row(itemsFrom(text));
  st.cur = { row: st.root, i: st.root.items.length };
  st.anchor = null;
  st.was = null;
  settle(st);
}
/** What the box holds, in parse.js's syntax. */
export const textOf = (st) => toText(st.root);

function link(st) {
  st.rows.clear();
  (function walk(r, owner) {
    r.owner = owner;
    st.rows.add(r);
    for (const it of r.items) { it.row = r; for (const inner of rowsOf(it)) walk(inner, it); }
  })(st.root, null);
}

// Adding and removing brackets the box owns, keeping the cursor on the same side of
// what it was next to.
function insertAt(st, r, k, item, cursorAfter) {
  r.items.splice(k, 0, item);
  for (const p of [st.cur, st.anchor]) if (p && p.row === r && (p.i > k || (p.i === k && cursorAfter))) p.i++;
}
function removeAt(st, r, k) {
  r.items.splice(k, 1);
  for (const p of [st.cur, st.anchor]) if (p && p.row === r && p.i > k) p.i--;
}
// Every bracket gets a partner: one that has none is given a ghost at the far end of
// what it could enclose (the row, or the side of the = it is on).
function balance(st, r) {
  for (let k = r.items.length - 1; k >= 0; k--) if (r.items[k].ghost) removeAt(st, r, k);
  let start = 0;
  for (let k = 0; k <= r.items.length; k++) {
    if (k < r.items.length && !is(r.items[k], "=")) continue;
    const open = [];
    let lone = 0;
    for (let j = start; j < k; j++) {
      if (is(r.items[j], "(")) open.push(j);
      else if (is(r.items[j], ")")) { if (open.length) open.pop(); else lone++; }
    }
    for (let n = 0; n < open.length; n++) insertAt(st, r, k + n, ch(")", true), false);
    for (let n = 0; n < lone; n++) insertAt(st, r, start, ch("(", true), true);
    k += open.length + lone;
    start = k + 1;
  }
}
const onY = (node) => { const before = node.row.items[node.row.items.indexOf(node) - 1]; return is(before, "y") || is(before, "'"); };
// Brackets around a whole numerator, denominator, power or root add nothing there.
// (Around a number after y they do: y^(4) is a derivative.)
const idle = (r) => !!r.owner && wraps(r.items) && !(r.owner.k === "sup" && onY(r.owner));

// After every key: pointers, brackets, and the tidying that waits until the cursor has
// left a box.
function settle(st) {
  link(st);
  const { row: r, i } = st.cur;
  // a ghost the cursor has gone past, or typed beside, is a real bracket from then on
  if (r.items[i - 1]?.ghost && r.items[i - 1].c === ")") delete r.items[i - 1].ghost;
  if (r.items[i]?.ghost && r.items[i].c === "(") delete r.items[i].ghost;
  for (const each of [...st.rows]) balance(st, each);
  const was = st.was;
  let inside = false;
  for (let x = st.cur.row; x; x = x.owner && x.owner.row) if (x === was) inside = true;
  if (was && !inside && !st.anchor && st.rows.has(was) && idle(was)) { was.items.pop(); was.items.shift(); }
  st.was = st.cur.row;
  link(st);
}

const after = (node) => ({ row: node.row, i: node.row.items.indexOf(node) + 1 });
const before = (node) => ({ row: node.row, i: node.row.items.indexOf(node) });
const endOf = (r) => ({ row: r, i: r.items.length });
const startOf = (r) => ({ row: r, i: 0 });

// One step right or left: through characters, into and out of boxes. null at the ends.
// With `over`, a box counts as one thing (for selecting).
function right({ row: r, i }, over = false) {
  const it = r.items[i];
  if (it) return it.k === "ch" || over ? { row: r, i: i + 1 } : startOf(rowsOf(it)[0]);
  const o = r.owner;
  if (!o) return null;
  return !over && o.k === "frac" && r === o.num ? startOf(o.den) : after(o);
}
function left({ row: r, i }, over = false) {
  const it = r.items[i - 1];
  if (it) return it.k === "ch" || over ? { row: r, i: i - 1 } : endOf(rowsOf(it).at(-1));
  const o = r.owner;
  if (!o) return null;
  return !over && o.k === "frac" && r === o.den ? endOf(o.num) : before(o);
}
function up({ row: r, i }) {
  for (let x = r; x.owner; x = x.owner.row) if (x.owner.k === "frac" && x === x.owner.den) return endOf(x.owner.num);
  const R = r.items[i], L = r.items[i - 1];
  if (R && (R.k === "sup" || R.k === "frac")) return startOf(rowsOf(R)[0]);
  if (L && (L.k === "sup" || L.k === "frac")) return endOf(rowsOf(L)[0]);
  return null;
}
function down({ row: r, i }) {
  for (let x = r; x.owner; x = x.owner.row) {
    if (x.owner.k === "frac" && x === x.owner.num) return endOf(x.owner.den);
    if (x.owner.k === "sup") return after(x.owner);
  }
  const R = r.items[i], L = r.items[i - 1];
  if (R && R.k === "frac") return startOf(R.den);
  if (L && L.k === "frac") return endOf(L.den);
  return null;
}

/** What is selected: { row, a, b } (items a up to b of that row), or null. */
export function selection(st) {
  if (!st.anchor) return null;
  const chain = (p) => {
    const out = [{ row: p.row, a: p.i, b: p.i }];
    for (let r = p.row; r.owner; r = r.owner.row) { const k = r.owner.row.items.indexOf(r.owner); out.push({ row: r.owner.row, a: k, b: k + 1 }); }
    return out;
  };
  const ends = chain(st.cur);
  for (const x of chain(st.anchor)) {
    const y = ends.find((e) => e.row === x.row);
    if (!y) continue;
    const a = Math.min(x.a, y.a), b = Math.max(x.b, y.b);
    return a === b ? null : { row: x.row, a, b };
  }
  return null;
}
/** The selected part as text ("" when nothing is). */
export function selectedText(st) {
  const sel = selection(st);
  return sel ? toText(row(sel.row.items.slice(sel.a, sel.b))) : "";
}
function cut(st, sel) {
  sel.row.items.splice(sel.a, sel.b - sel.a);
  st.cur = { row: sel.row, i: sel.a };
  st.anchor = null;
}

/**
 * Move the cursor: left, right, up, down, home, end (of the row), start, finish (of
 * everything), out and back (past the box the cursor is in). With extend, select on the way.
 * Returns false when there was nowhere to go.
 */
export function move(st, dir, extend = false) {
  const sel = selection(st);
  if (!extend && sel && (dir === "left" || dir === "right")) {
    st.cur = { row: sel.row, i: dir === "left" ? sel.a : sel.b };
    st.anchor = null;
    settle(st);
    return true;
  }
  if (extend) st.anchor = st.anchor || { ...st.cur }; else st.anchor = null;
  const r = st.cur.row;
  const to = dir === "left" ? left(st.cur, extend) : dir === "right" ? right(st.cur, extend)
    : dir === "up" ? up(st.cur) : dir === "down" ? down(st.cur)
    : dir === "home" ? startOf(r) : dir === "end" ? endOf(r)
    : dir === "start" ? startOf(st.root) : dir === "finish" ? endOf(st.root)
    : dir === "out" ? (r.owner ? after(r.owner) : null) : dir === "back" ? (r.owner ? before(r.owner) : null) : null;
  if (to) st.cur = to;
  settle(st);
  return !!to;
}
/** Put the cursor at a place the page found under the pointer. */
export function place(st, pos, extend = false) {
  if (!st.rows.has(pos.row)) return;
  if (extend) st.anchor = st.anchor || { ...st.cur }; else st.anchor = null;
  st.cur = { row: pos.row, i: Math.max(0, Math.min(pos.row.items.length, pos.i)) };
  settle(st);
}
export function selectAll(st) {
  st.anchor = startOf(st.root);
  st.cur = endOf(st.root);
  settle(st);
}
/** Is the cursor inside a fraction, power or root? */
export const nested = (st) => !!st.cur.row.owner;

// ── keys ──

const spelled = (items, end, word) => end >= word.length && [...word].every((l, n) => is(items[end - word.length + n], l));

function slash(st, sel) {
  let r, a, b;
  if (sel) ({ row: r, a, b } = sel); else { r = st.cur.row; b = st.cur.i; a = factorStart(r.items, b); }
  const num = peel(r.items.splice(a, b - a));
  const node = frac(num, []);
  r.items.splice(a, 0, node);
  st.anchor = null;
  st.cur = startOf(num.length ? node.den : node.num);
}
function shut(st) {
  let { row: r, i } = st.cur;
  // nothing is open in this box: the bracket closes one outside it
  while (r.owner && openerOf(r.items, i) < 0) ({ row: r, i } = after(r.owner));
  if (r.items[i]?.ghost && r.items[i].c === ")") delete r.items[i].ghost; else r.items.splice(i, 0, ch(")"));
  st.cur = { row: r, i: i + 1 };
  // e^(-2t): closing the bracket that holds the whole power finishes the power
  const o = r.owner;
  if (o && (o.k === "sup" || o.k === "sqrt") && i + 1 === r.items.length && openerOf(r.items, i) === 0) st.cur = after(o);
}
function key(st, c) {
  if (c === " ") {
    // a space at the end of a box steps out of it, as it would end a power in typed text
    const { row: r, i } = st.cur;
    if (!st.anchor && r.owner && i === r.items.length) st.cur = right(st.cur);
    return;
  }
  if (c < " ") return;
  const sel = selection(st);
  if (c === "/") return slash(st, sel);
  if (c === "(" && sel) {
    sel.row.items.splice(sel.b, 0, ch(")"));
    sel.row.items.splice(sel.a, 0, ch("("));
    st.cur = { row: sel.row, i: sel.b + 2 };
    st.anchor = null;
    return;
  }
  if (sel) cut(st, sel);
  st.anchor = null;
  if (c === ")") return shut(st);
  // an = belongs to the whole line, never inside a fraction or a power
  if (c === "=") while (st.cur.row.owner) st.cur = after(st.cur.row.owner);
  const { row: r, i } = st.cur;
  if (c === "^") {
    const prev = r.items[i - 1];
    if (prev && prev.k === "sup") { st.cur = endOf(prev.body); return; }
    const node = sup();
    r.items.splice(i, 0, node);
    st.cur = startOf(node.body);
    return;
  }
  if (SUPER[c]) { r.items.splice(i, 0, sup([ch(SUPER[c])])); st.cur = { row: r, i: i + 1 }; return; }
  r.items.splice(i, 0, ch(c));
  st.cur = { row: r, i: i + 1 };
  if (c === "t" && spelled(r.items, i + 1, "sqrt")) {
    const node = sqrt();
    r.items.splice(i - 3, 4, node);
    st.cur = startOf(node.body);
  } else if (c === "i" && spelled(r.items, i + 1, "pi")) {
    r.items.splice(i - 1, 2, ch("π"));
    st.cur = { row: r, i };
  } else if (c === "a" && spelled(r.items, i + 1, "delta")) {
    r.items.splice(i - 4, 5, ch("δ"));
    st.cur = { row: r, i: i - 3 };
  }
}
/** Type these characters, one key at a time. */
export function type(st, text) {
  for (const c of spell(text)) { key(st, c); settle(st); }
}
/** Put text in at the cursor, read as a whole (pasted, or filled in by the browser). */
export function paste(st, text) {
  const sel = selection(st);
  if (sel) cut(st, sel);
  st.anchor = null;
  const items = itemsFrom(text), { row: r, i } = st.cur;
  r.items.splice(i, 0, ...items);
  st.cur = { row: r, i: i + items.length };
  settle(st);
}

// A fraction or power taken apart again: its contents go back into the row around it.
function dissolve(st, r) {
  const o = r.owner, host = o.row, k = host.items.indexOf(o);
  let items = o.k === "frac" ? o.num.items : o.body.items, at = 0;
  if (o.k === "frac") {
    // a sum that was above the bar keeps together in brackets
    const sum = kinds(o.num).some((kind, n) => n > 0 && (kind === "bin" || kind === "rel"));
    if (sum && !wraps(items)) items = [ch("("), ...items, ch(")")];
    at = r === o.den ? items.length : 0;
    items = [...items, ...o.den.items];
  }
  host.items.splice(k, 1, ...items);
  st.cur = { row: host, i: k + at };
}
/** Backspace. */
export function backspace(st) {
  const sel = selection(st);
  if (sel) cut(st, sel);
  else {
    st.anchor = null;
    const { row: r, i } = st.cur, it = r.items[i - 1];
    if (!it) { if (r.owner) dissolve(st, r); }
    else if (it.k !== "ch") st.cur = endOf(rowsOf(it).at(-1));   // step in; the next press deletes there
    else if (it.ghost) st.cur = { row: r, i: i - 1 };
    else { r.items.splice(i - 1, 1); st.cur = { row: r, i: i - 1 }; }
  }
  settle(st);
}
/** Delete (forwards). */
export function del(st) {
  const sel = selection(st);
  if (sel) cut(st, sel);
  else {
    st.anchor = null;
    const { row: r, i } = st.cur, it = r.items[i];
    if (!it) { const to = right(st.cur); if (to) st.cur = to; }
    else if (it.k !== "ch") st.cur = startOf(rowsOf(it)[0]);
    else if (it.ghost) st.cur = { row: r, i: i + 1 };
    else r.items.splice(i, 1);
  }
  settle(st);
}
/** Remove what is selected. */
export function erase(st) {
  const sel = selection(st);
  if (sel) { cut(st, sel); settle(st); }
}

// ── undo ──

const copy = (r) => row(r.items.map((it) => {
  if (it.k === "ch") return ch(it.c, it.ghost);
  const out = { k: it.k };
  for (const name of SLOTS[it.k]) out[name] = copy(it[name]);
  return out;
}));
/** Everything needed to come back to this moment. */
export function save(st) {
  const steps = [];
  for (let r = st.cur.row; r.owner; r = r.owner.row) steps.unshift([r.owner.row.items.indexOf(r.owner), rowsOf(r.owner).indexOf(r)]);
  return { root: copy(st.root), steps, i: st.cur.i };
}
/** Come back to a saved moment. */
export function load(st, snap) {
  st.root = copy(snap.root);
  let r = st.root;
  for (const [k, n] of snap.steps) r = rowsOf(r.items[k])[n];
  st.cur = { row: r, i: snap.i };
  st.anchor = null;
  st.was = null;
  settle(st);
}
