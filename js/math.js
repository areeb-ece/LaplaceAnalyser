// Typeset maths with KaTeX (vendor/katex). The script is loaded the first time it's
// needed; if it can't load, the TeX source is shown as it is.
let loading = null;
function katex() {
  if (window.katex) return Promise.resolve(window.katex);
  return (loading ??= new Promise((done) => {
    const s = document.createElement("script");
    s.src = new URL("../vendor/katex/katex.min.js", import.meta.url).href;
    s.onload = () => done(window.katex ?? null);
    s.onerror = () => done(null);
    document.head.append(s);
  }));
}
/** Put tex into el, as a displayed equation unless inline is set. */
export function typeset(el, tex, inline = false) {
  if (el.dataset.tex === tex) return;
  el.dataset.tex = tex;
  katex().then((k) => {
    if (el.dataset.tex !== tex) return; // something newer was asked for meanwhile
    if (k) k.render(tex, el, { displayMode: !inline, throwOnError: false });
    else el.textContent = tex;
  });
}
