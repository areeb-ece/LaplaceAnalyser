// The numerical Laplace integral at the probe, worked out once per change and shared
// by the integrand and integral views: { status, n, dt, T, t, zr, zi, ir, ii }.
import { integralPath, horizon, convergence } from "./lib/integrate.js";

const STEPS = 8000; // what the far end of a long, slowly converging integral may cost

let cache = null;
export function probePath(state) {
  const { model, probe, time } = state;
  if (cache && cache.model === model && cache.re === probe.re && cache.im === probe.im && cache.tMax === time.tMax) return cache;
  // Close to the edge of the region the integral needs a long stretch of time to arrive.
  // Rather than sample that stretch too coarsely to be right, stop sooner (never short
  // of the time window): the view then says it is still converging, which is true.
  let T = horizon(model, probe, time.tMax), fastest = Math.abs(probe.im);
  for (const x of model.terms) fastest = Math.max(fastest, Math.abs(x.lam.im - probe.im), Math.abs(x.lam.re - probe.re));
  const need = (T * fastest * 40) / (2 * Math.PI);
  if (need > STEPS) T = Math.max(time.tMax, (T * STEPS) / need);
  const path = integralPath(model, probe, T, 60000);
  return (cache = { model, re: probe.re, im: probe.im, tMax: time.tMax, status: convergence(model, probe), ...path });
}
/** The sample index of time t on a path. */
export const indexAt = (path, t) => Math.min(path.n, Math.max(0, Math.round(t / path.dt)));
