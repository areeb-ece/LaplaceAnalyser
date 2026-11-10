// The built-in examples. Each is an input exactly as it could be typed, plus where to
// put the probe so the example opens on something worth looking at.
export const PRESETS = [
  { id: "cos", group: "Signals", name: "Cosine", input: { mode: "function", fn: "cos(t)" }, probe: [0.5, 1] },
  { id: "step", group: "Signals", name: "Unit step", input: { mode: "function", fn: "u(t)" }, probe: [1, 1] },
  { id: "decay", group: "Signals", name: "Decaying exponential", input: { mode: "function", fn: "e^(-2t)" }, probe: [-1, 1] },
  { id: "damped", group: "Signals", name: "Damped sinusoid", input: { mode: "function", fn: "e^(-0.5t) sin(3t)" }, probe: [0.5, 2] },
  { id: "ramp", group: "Signals", name: "t·e^(−at)", input: { mode: "function", fn: "t e^(-t)" }, probe: [0, 1] },
  { id: "rc", group: "Circuits and systems", name: "RC circuit, step input", input: { mode: "ode", ode: "0.5y' + y = 1", ics: ["0"] }, probe: [0.5, 1] },
  { id: "rlc", group: "Circuits and systems", name: "Underdamped RLC, step input", input: { mode: "ode", ode: "y'' + 2y' + 10y = 10", ics: ["0", "0"] }, probe: [0.5, 2] },
  { id: "spring", group: "Circuits and systems", name: "Mass on a spring, released", input: { mode: "ode", ode: "y'' + 0.4y' + 4y = 0", ics: ["1", "0"] }, probe: [0.5, 1.5] },
  { id: "resonance", group: "Circuits and systems", name: "Oscillator forced at resonance", input: { mode: "ode", ode: "y'' + 4y = cos(2t)", ics: ["0", "0"] }, probe: [0.5, 1] },
  { id: "critical", group: "Circuits and systems", name: "Critically damped", input: { mode: "ode", ode: "y'' + 4y' + 4y = 0", ics: ["1", "0"] }, probe: [0, 1] },
  { id: "rational", group: "Transforms", name: "Three poles and a zero", input: { mode: "rational", rational: "(s + 3)/((s + 1)(s^2 + 2s + 5))" }, probe: [0.5, 1] },
];
export const DEFAULT_PRESET = PRESETS[0];
