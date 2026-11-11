// Text to a syntax tree. One grammar serves f(t), F(s) and differential equations; what
// each name is allowed to mean is decided later by whoever reads the tree.
//
// Nodes: { t: "num", v } · { t: "var", name } (t, s, e, pi) · { t: "y", order } ·
//        { t: "call", fn, arg } · { t: "neg", a } · { t: "bin", op, a, b, implicit }
// A node read from inside brackets carries paren: true (used when printing it back).

/** A problem with what was typed, worded for the person who typed it. */
export class InputError extends Error {
  constructor(message) { super(message); this.name = "InputError"; }
}

export const WORDS = ["sinh", "cosh", "sqrt", "step", "sin", "cos", "exp", "pi", "t", "s", "y", "u", "e"];
export const FUNCS = new Set(["sinh", "cosh", "sqrt", "step", "sin", "cos", "exp", "u"]);
const SUPER = { "²": "^2", "³": "^3", "⁴": "^4" };

function clean(src) {
  let text = String(src).toLowerCase()
    .replace(/[−–—]/g, "-").replace(/[·×∙]/g, "*").replace(/÷/g, "/").replace(/π/g, "pi")
    .replace(/[′’‘`]/g, "'").replace(/″/g, "''").replace(/[²³⁴]/g, (c) => SUPER[c]);
  // Leibniz derivatives: dy/dt, d^2y/dt^2, d2y/dt2.
  text = text.replace(/d\s*(?:\^?\s*(\d+))?\s*y\s*\/\s*d\s*t\s*(?:\^?\s*(\d+))?/g, (m, a = "1", b = "1") => {
    if (a !== b) throw new InputError(`"${m.trim()}" doesn't look like a derivative: the two orders differ. Write d^2y/dt^2, or y''.`);
    if (+a > 12) throw new InputError("That derivative is of too high an order for this tool.");
    return " y" + "'".repeat(+a) + " ";
  });
  return text;
}

function tokenize(src) {
  const text = clean(src), out = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    const space = i > 0 && /\s/.test(text[i - 1]);
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(text.slice(i));
    if (num) { out.push({ type: "num", v: Number(num[0]), text: num[0], space }); i += num[0].length; continue; }
    if (/[a-z]/.test(ch)) {
      const word = WORDS.find((w) => text.startsWith(w, i));
      if (!word) {
        const run = /^[a-z]+/.exec(text.slice(i))[0];
        throw new InputError(`I don't know what "${run}" means here. The names I know are t, s, y, e, pi, sin, cos, exp, sinh, cosh, sqrt and u (the unit step).`);
      }
      out.push({ type: "name", v: word, text: word, space });
      i += word.length;
      continue;
    }
    if (ch === "□") throw new InputError("One of the boxes is still empty. Type something in it, or remove it with Backspace.");
    if ("+-*/^()='".includes(ch)) { out.push({ type: ch, text: ch, space }); i++; continue; }
    throw new InputError(`I can't read the character "${ch}".`);
  }
  return out;
}

class Parser {
  constructor(tokens) { this.toks = tokens; this.i = 0; }
  peek(k = 0) { return this.toks[this.i + k]; }
  next() { return this.toks[this.i++]; }
  is(type) { return this.peek()?.type === type; }
  // Would the next token begin a new factor (so that writing it here means "times")?
  startsFactor() { const t = this.peek(); return !!t && (t.type === "num" || t.type === "name" || t.type === "("); }
  rest() { return this.toks.slice(this.i).map((t) => t.text).join(""); }

  expr() {
    let a = this.term();
    while (this.is("+") || this.is("-")) { const op = this.next().type; a = { t: "bin", op, a, b: this.term() }; }
    return a;
  }
  term() {
    let a = this.unary();
    for (;;) {
      if (this.is("*")) { this.next(); a = { t: "bin", op: "*", a, b: this.unary() }; }
      else if (this.is("/")) {
        this.next();
        const b = this.unary();
        // 1/2t and 1/s(s+1) each have two readings; neither is safe to guess.
        if (this.startsFactor()) {
          throw new InputError(`"/" followed by two things side by side is ambiguous near "${this.rest().slice(0, 12)}". Put the whole divisor in brackets, like 1/(2t), or use * to multiply afterwards, like (1/2)*t.`);
        }
        a = { t: "bin", op: "/", a, b };
      }
      else if (this.startsFactor()) a = { t: "bin", op: "*", a, b: this.power(), implicit: true };
      else return a;
    }
  }
  unary() {
    if (this.is("-")) { this.next(); return { t: "neg", a: this.unary() }; }
    if (this.is("+")) { this.next(); return this.unary(); }
    return this.power();
  }
  power() {
    const base = this.primary();
    if (!this.is("^")) return base;
    this.next();
    let e;
    if (this.is("(")) e = this.primary();
    else {
      let sign = 1;
      if (this.is("-")) { this.next(); sign = -1; } else if (this.is("+")) this.next();
      const tok = this.peek();
      if (!tok || (tok.type !== "num" && tok.type !== "name")) throw new InputError("Something is missing after ^. Write the power in brackets, like e^(-2t).");
      if (tok.type === "name" && FUNCS.has(tok.v)) throw new InputError(`Put the power in brackets: ^(${tok.v}(…)).`);
      e = this.primary();
      if (sign < 0) e = { t: "neg", a: e };
      // e^-2t: is the t inside the power? For e and for numbers both readings are real
      // functions, so ask. (For t^2 e^(-t) or s^2(s+1) only one reading is possible.)
      const exponential = base.t === "num" || (base.t === "var" && (base.name === "e" || base.name === "pi"));
      if (exponential && this.startsFactor() && !this.peek().space) {
        throw new InputError(`I can't tell where the power ends near "^${sign < 0 ? "-" : ""}${tok.text}${this.rest().slice(0, 6)}". Put it in brackets: e^(-2t) if the t is part of the power, or e^(-2)*t if it isn't.`);
      }
    }
    if (base.t === "y") {
      // y^(4) is the fourth derivative; y^2 would make the equation non-linear.
      if (e.paren && e.t === "num" && Number.isInteger(e.v) && e.v >= 0 && base.order === 0) return { t: "y", order: e.v };
      throw new InputError("A power of y makes the equation non-linear, which this tool doesn't solve. (For a derivative write y'', or y^(4) with brackets.)");
    }
    return { t: "bin", op: "^", a: base, b: e };
  }
  primary() {
    const tok = this.next();
    if (!tok) throw new InputError("The expression stops early: something is missing at the end.");
    if (tok.type === "num") return { t: "num", v: tok.v };
    if (tok.type === "(") {
      if (this.is(")")) throw new InputError("There's an empty pair of brackets.");
      const a = this.expr();
      if (!this.is(")")) throw new InputError("A bracket is opened but never closed.");
      this.next();
      return { ...a, paren: true };
    }
    if (tok.type === "name") {
      if (tok.v === "y") {
        let order = 0;
        while (this.is("'")) { this.next(); order++; }
        // y(t) and y'(t) are the same as y and y'
        if (this.is("(") && this.peek(1)?.type === "name" && this.peek(1).v === "t" && this.peek(2)?.type === ")") this.i += 3;
        return { t: "y", order };
      }
      if (FUNCS.has(tok.v)) {
        if (this.is("^")) throw new InputError(`Write the power after the brackets: ${tok.v}(t)^2, not ${tok.v}^2(t).`);
        if (!this.is("(")) throw new InputError(`Put what ${tok.v} applies to in brackets, like ${tok.v}(${tok.v === "u" || tok.v === "step" ? "t" : "2t"}).`);
        this.next();
        if (this.is(")")) throw new InputError(`${tok.v}() needs something inside its brackets.`);
        const arg = this.expr();
        if (!this.is(")")) throw new InputError(`The bracket after ${tok.v} is never closed.`);
        this.next();
        return { t: "call", fn: tok.v === "step" ? "u" : tok.v, arg };
      }
      return { t: "var", name: tok.v };
    }
    if (tok.type === ")") throw new InputError("There's a closing bracket with no opening one.");
    if (tok.type === "'") throw new InputError("A prime (') can only follow y, as in y' or y''.");
    if (tok.type === "=") throw new InputError("There's an = sign where I expected a value.");
    throw new InputError(`"${tok.text}" is in a place where I expected a number, a name or a bracket.`);
  }
}

function finish(p, what) {
  const tok = p.peek();
  if (!tok) return;
  if (tok.type === ")") throw new InputError("There's a closing bracket with no opening one.");
  if (tok.type === "'") throw new InputError("A prime (') can only follow y, as in y' or y''.");
  if (tok.type === "=") throw new InputError(what === "equation" ? "There's more than one = sign." : "This box takes an expression, not an equation: leave out the = sign.");
  throw new InputError(`I didn't expect "${tok.text}" there.`);
}

/** One expression. */
export function parse(src) {
  const toks = tokenize(src);
  if (!toks.length) throw new InputError("There's nothing to work with yet: type an expression.");
  const p = new Parser(toks);
  const ast = p.expr();
  finish(p, "expression");
  return ast;
}

/** An equation: { lhs, rhs }. */
export function parseEquation(src) {
  const toks = tokenize(src);
  if (!toks.length) throw new InputError("There's nothing to work with yet: type an equation such as y'' + 4y = cos(2t).");
  if (!toks.some((t) => t.type === "=")) throw new InputError("An equation needs an = sign, for example y'' + 4y = cos(2t).");
  const p = new Parser(toks);
  if (p.is("=")) throw new InputError("Something is missing before the = sign.");
  const lhs = p.expr();
  if (!p.is("=")) finish(p, "equation");
  p.next();
  if (!p.peek()) throw new InputError("Something is missing after the = sign. If the right side is nothing, write 0.");
  const rhs = p.expr();
  finish(p, "equation");
  return { lhs, rhs };
}

/** Does this tree mention y? */
export function hasY(n) {
  if (n.t === "y") return true;
  if (n.t === "neg") return hasY(n.a);
  if (n.t === "call") return hasY(n.arg);
  if (n.t === "bin") return hasY(n.a) || hasY(n.b);
  return false;
}
