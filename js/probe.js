// The numerical Laplace integral at the probe, worked out once per change and shared
// by the integrand and integral views: { status, n, dt, T, t, zr, zi, ir, ii }.
import { integralPath, horizon, convergence } from "./lib/integrate.js";

let cache = null;
export function probePath(state) {
  const { model, probe, time } = state;
  if (cache && cache.model === model && cache.re === probe.re && cache.im === probe.im && cache.tMax === time.tMax) return cache;
  const path = integralPath(model, probe, horizon(model, probe, time.tMax), 4000);
  return (cache = { model, re: probe.re, im: probe.im, tMax: time.tMax, status: convergence(model, probe), ...path });
}
/** The sample index of time t on a path. */
export const indexAt = (path, t) => Math.min(path.n, Math.max(0, Math.round(t / path.dt)));
