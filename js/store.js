// The one shared state. Every view reads it; a change marks its key dirty and all
// views are told once, in the next animation frame, which keys changed. So a probe
// dragged in one view repaints every other view in that same frame.
//
// Keys: input, model, error, probe { re, im }, time { t, tMax, playing, speed },
//       win { cx, cy, half } (the square of the s-plane on show), opts, theme.

/** Stands for "everything changed" where a set of dirty keys is expected. */
export const ALL = { has: () => true };

export function createStore(state) {
  const subs = new Set();
  let dirty = new Set(), frame = 0;
  const flush = () => {
    frame = 0;
    const was = dirty;
    dirty = new Set();
    for (const fn of subs) fn(state, was);
  };
  const mark = (key) => { dirty.add(key); if (!frame) frame = requestAnimationFrame(flush); };
  return {
    state,
    set(key, value) { state[key] = value; mark(key); },
    /** Merge into an object-valued key. */
    patch(key, part) { state[key] = { ...state[key], ...part }; mark(key); },
    touch: mark,
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
