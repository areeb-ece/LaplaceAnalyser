// The built-in examples, by field. Each is an input exactly as it could be typed, with:
//   note   what it models and what the symbols stand for (maths between $ signs)
//   probe  where to put the probe point s (default: half a unit right of the rightmost pole)
//   tMax   how much time to show (default: worked out from the poles)
const fn = (text) => ({ mode: "function", fn: text });
const tf = (text) => ({ mode: "rational", rational: text });
const ode = (text, ...ics) => ({ mode: "ode", ode: text, ics: ics.map(String) });

export const PRESETS = [
  // ── the building blocks ──
  { id: "cos", group: "Signals", name: "Cosine", input: fn("cos(t)"), probe: [0.5, 1], note: "The simplest oscillation. Its transform has a pole at each of $\\pm i$, the two frequencies a cosine is made of." },
  { id: "step", group: "Signals", name: "Unit step", input: fn("u(t)"), probe: [1, 1], note: "A constant switched on at $t = 0$. One pole, at the origin." },
  { id: "ramp", group: "Signals", name: "Ramp", input: fn("t"), probe: [1, 1], note: "Steady growth. Multiplying by $t$ turns the step's single pole into a double one." },
  { id: "decay", group: "Signals", name: "Decaying exponential", input: fn("e^(-2t)"), probe: [-1, 1], note: "A pole on the real axis, at the decay rate $-2$. The integral converges to its right." },
  { id: "growth", group: "Signals", name: "Growing exponential", input: fn("e^(0.3t)"), probe: [1, 1], note: "Growth puts the pole in the right half-plane: the integral needs $\\operatorname{Re}(s) > 0.3$ to converge." },
  { id: "damped", group: "Signals", name: "Damped sinusoid", input: fn("e^(-0.5t) sin(3t)"), probe: [0.5, 2], note: "Decay moves the pair of poles left of the imaginary axis: real part $-0.5$, imaginary parts $\\pm 3$." },
  { id: "tdecay", group: "Signals", name: "Time-weighted decay", input: fn("t e^(-t)"), probe: [0, 1], note: "Rises, then decays. A double pole at $-1$." },
  { id: "pulse", group: "Signals", name: "Smooth pulse", input: fn("t^2 e^(-t)"), probe: [0, 1], note: "A triple pole at $-1$: each extra factor of $t$ raises the pole's order by one." },
  { id: "power", group: "Signals", name: "Power in a resistor", input: fn("sin(t)^2"), probe: [0.5, 1], note: "$\\sin^2 t = \\tfrac12 - \\tfrac12\\cos 2t$: a constant part (the pole at 0) and a part at twice the frequency." },
  { id: "beats", group: "Signals", name: "Beats", input: fn("cos(0.5t) cos(6t)"), probe: [0.5, 6], tMax: 25, note: "Two tones close in pitch, at $5.5$ and $6.5$ rad/s, drifting in and out of step." },
  { id: "square", group: "Signals", name: "Square wave, three harmonics", input: fn("sin(t) + sin(3t)/3 + sin(5t)/5"), probe: [0.5, 3], tMax: 15, note: "The first three terms of a square wave's Fourier series: three pairs of poles on the imaginary axis." },
  { id: "string", group: "Signals", name: "Plucked string", input: fn("e^(-0.3t)(sin(4t) + 0.5sin(8t) + 0.25sin(12t))"), probe: [0.5, 4], tMax: 10, note: "A note and two overtones dying away together: three pairs of poles in a column at real part $-0.3$." },
  { id: "burst", group: "Signals", name: "Tone burst", input: fn("t e^(-0.8t) sin(6t)"), probe: [0.2, 6], note: "A tone that swells and fades. Double poles at $-0.8 \\pm 6i$." },

  // ── electric circuits ──
  { id: "rc", group: "Electric circuits", name: "RC circuit, switched on", input: ode("0.5y' + y = 1", 0), note: "$y$ is the capacitor voltage, charging towards the 1 V source with time constant $RC = 0.5$ s." },
  { id: "rcsine", group: "Electric circuits", name: "RC circuit, sine source", input: ode("y' + y = sin(2t)", 0), probe: [0.5, 2], note: "A start-up transient (the pole at $-1$) on top of the steady sine (the poles at $\\pm 2i$)." },
  { id: "rl", group: "Electric circuits", name: "RL circuit, current building up", input: ode("0.2y' + y = 2", 0), note: "$y$ is the current in the coil: it can't jump, and rises to $V/R = 2$ A with time constant $L/R = 0.2$ s." },
  { id: "lc", group: "Electric circuits", name: "LC circuit, no losses", input: ode("y'' + 9y = 0", 1, 0), probe: [0.5, 3], note: "Charge sloshing between a capacitor and a coil for ever, at 3 rad/s. The poles sit on the imaginary axis." },
  { id: "rlc", group: "Electric circuits", name: "Series RLC, underdamped", input: ode("y'' + 2y' + 10y = 10", 0, 0), probe: [0.5, 2], note: "The capacitor voltage overshoots and rings before it settles on the 1 V source." },
  { id: "rlcover", group: "Electric circuits", name: "Series RLC, overdamped", input: ode("y'' + 5y' + 4y = 4", 0, 0), note: "More resistance: no ringing, two real poles at $-1$ and $-4$, and a slower rise." },
  { id: "critical", group: "Electric circuits", name: "Critically damped", input: ode("y'' + 4y' + 4y = 0", 1, 0), probe: [0, 1], note: "The boundary between ringing and sluggish: the two poles meet in a double pole at $-2$." },

  // ── filters and communications ──
  { id: "lowpass", group: "Filters and communications", name: "Second-order low-pass, step", input: tf("4/(s(s^2 + 1.2s + 4))"), probe: [0.5, 2], note: "The output of a low-pass filter when its input steps from 0 to 1." },
  { id: "bandpass", group: "Filters and communications", name: "Band-pass filter", input: tf("s/(s^2 + 0.4s + 4)"), probe: [0.5, 2], note: "Its impulse response rings at the centre frequency, 2 rad/s. The zero at the origin blocks DC." },
  { id: "butter3", group: "Filters and communications", name: "Butterworth low-pass, third order", input: tf("1/((s + 1)(s^2 + s + 1))"), probe: [0.5, 1], note: "The three poles lie evenly on the left half of the unit circle, which is what makes the passband flat." },
  { id: "butter4", group: "Filters and communications", name: "Butterworth low-pass, fourth order, step", input: tf("1/(s(s^2 + 0.7654s + 1)(s^2 + 1.8478s + 1))"), probe: [0.5, 1], note: "Four poles on the unit circle, plus the step's pole at the origin." },
  { id: "am", group: "Filters and communications", name: "AM radio signal", input: fn("(1 + 0.5cos(t)) cos(8t)"), probe: [0.5, 8], tMax: 15, note: "A carrier at 8 rad/s with its strength varied at 1 rad/s: the carrier's poles and a sideband pair either side." },
  { id: "pll", group: "Filters and communications", name: "Phase-locked loop, phase step", input: tf("(1.4s + 1)/(s(s^2 + 1.4s + 1))"), probe: [0.5, 1], note: "How the loop's output phase catches up after the input phase jumps." },

  // ── control systems ──
  { id: "pcontrol", group: "Control systems", name: "Position control, proportional", input: tf("8/(s(s^2 + 2s + 8))"), probe: [0.5, 2], note: "A motor $\\dfrac{1}{s(s+2)}$ under feedback with gain 8, asked to move one unit. More gain pushes the poles up and the overshoot with them." },
  { id: "cruise", group: "Control systems", name: "Cruise control, PI", input: tf("(2s + 1.5)/(s(s^2 + 2.5s + 1.5))"), note: "Speed after the set point steps up. The integral term removes the steady error; the zero comes from the controller." },
  { id: "motor", group: "Control systems", name: "DC motor speed", input: tf("10/(s(s + 1)(s + 10))"), note: "Speed after the voltage is switched on. The slow pole at $-1$ is the rotor's inertia, the fast one at $-10$ the winding's inductance." },
  { id: "third", group: "Control systems", name: "Third order with a dominant pair", input: tf("20/((s + 5)(s^2 + 2s + 4))"), probe: [0.5, 2], note: "The pole at $-5$ dies away quickly; the pair nearer the imaginary axis decides what you see." },
  { id: "double", group: "Control systems", name: "Double integrator", input: ode("y'' = 1", 0, 0), probe: [1, 1], note: "A satellite under constant thrust: position grows as $t^2/2$. Three poles stacked at the origin." },
  { id: "pendulumup", group: "Control systems", name: "Inverted pendulum, falling", input: ode("y'' - 4y = 0", 0.01, 0), tMax: 3, note: "Balanced upright and nudged. The pole at $+2$ makes the angle run away." },
  { id: "pendulumheld", group: "Control systems", name: "Inverted pendulum, held by feedback", input: ode("y'' + 3y' + 5y = 0", 0.2, 0), probe: [0.5, 2], note: "The same pendulum with a controller pushing back: both poles are now in the left half-plane." },

  // ── mechanics and structures ──
  { id: "spring", group: "Mechanics and structures", name: "Mass on a spring, released", input: ode("y'' + 0.4y' + 4y = 0", 1, 0), probe: [0.5, 1.5], note: "Pulled one unit and let go. Light damping: the poles are close to the imaginary axis." },
  { id: "resonance", group: "Mechanics and structures", name: "Forced at resonance", input: ode("y'' + 4y = cos(2t)", 0, 0), probe: [0.5, 1], note: "Pushed at its own frequency, the swing grows without limit: the forcing's poles land on the system's, making double poles." },
  { id: "nearres", group: "Mechanics and structures", name: "Forced near resonance", input: ode("y'' + 25y = cos(5.6t)", 0, 0), probe: [0.5, 5], tMax: 25, note: "Just off its own frequency, the response swells and fades in beats." },
  { id: "seismo", group: "Mechanics and structures", name: "Seismometer", input: ode("y'' + y' + 9y = sin(2t)", 0, 0), probe: [0.5, 2], note: "A damped mass shaken by the ground. Its own ringing fades and the ground's motion remains." },
  { id: "pendulum", group: "Mechanics and structures", name: "Pendulum, small swings", input: ode("y'' + 9.81y = 0", 0.2, 0), probe: [0.5, 3], note: "One metre long, released from 0.2 rad. It swings at $\\sqrt{g/L} \\approx 3.13$ rad/s." },
  { id: "coupled", group: "Mechanics and structures", name: "Two coupled masses", input: ode("y'''' + 4y'' + 3y = 0", 1, 0, 0, 0), probe: [0.5, 1], tMax: 30, note: "Two equal masses joined by springs. One is pulled aside: the motion passes back and forth between them, a mix of the modes at $1$ and $\\sqrt3$ rad/s." },
  { id: "car", group: "Mechanics and structures", name: "Car suspension over a kerb", input: tf("(80s + 400)/(s(0.2s^4 + 2.4s^3 + 52s^2 + 80s + 400))"), probe: [0.5, 3], note: "The height of the car body after the road steps up. Two pairs of poles: the body bouncing slowly on its springs, the wheel hopping quickly on its tyre." },
  { id: "beam", group: "Mechanics and structures", name: "Cantilever beam, uniform load", input: ode("y'''' = 1", 0, 0, 0.5, -1), probe: [1, 1], tMax: 1, note: "Here $t$ is distance along the beam, not time. $y$ is the deflection of a beam built in at $t = 0$ and free at $t = 1$." },

  // ── heat and fluids ──
  { id: "cooling", group: "Heat and fluids", name: "Coffee cooling", input: ode("y' + 0.3y = 6", 90), note: "Newton's law of cooling: from 90° towards a 20° room, losing three tenths of the difference each minute." },
  { id: "thermo", group: "Heat and fluids", name: "Thermometer in warming water", input: ode("2y' + y = t", 0), note: "The water warms steadily; the thermometer follows, but always $2$ s behind." },
  { id: "tanks", group: "Heat and fluids", name: "Two tanks in series", input: ode("y'' + 0.5y' + 0.06y = 0.06", 0, 0), note: "Salt concentration in the second of two stirred tanks after the feed changes. It starts flat: the first tank has to fill first." },
  { id: "drag", group: "Heat and fluids", name: "Ball thrown up, with air drag", input: ode("y' + 0.5y = -9.81", 20), note: "$y$ is the upward speed, starting at 20 m/s. It settles at the terminal speed, $-19.6$ m/s." },
  { id: "river", group: "Heat and fluids", name: "River flow after a storm", input: fn("0.84t^3 e^(-1.5t)"), probe: [0, 1], note: "Rain routed through four reservoirs in a row (a Nash cascade): the flow downstream rises, peaks and tails off." },

  // ── chemistry and medicine ──
  { id: "chain", group: "Chemistry and medicine", name: "Decay chain", input: ode("y' + 0.3y = e^(-t)", 0), note: "Substance A decays into B, which decays in turn. $y$ is the amount of B: it builds up, then drains away." },
  { id: "drug", group: "Chemistry and medicine", name: "Drug after an injection", input: ode("y'' + 1.3y' + 0.12y = 0", 1, -0.87), note: "Concentration in the blood (a two-compartment model): a quick fall as the drug spreads into tissue, then a slow one as it is cleared." },
  { id: "pill", group: "Chemistry and medicine", name: "Drug after a tablet", input: fn("1.15(e^(-0.2t) - e^(-1.5t))"), probe: [0.5, 1], note: "Absorbed from the gut at rate $1.5$, cleared at rate $0.2$ per hour. The peak comes when the two balance." },
  { id: "glucose", group: "Chemistry and medicine", name: "Blood sugar after a meal", input: ode("y'' + 2y' + 2.6y = 0", 0, 3), probe: [0.5, 1], note: "Glucose above its resting level (Bolie's model): insulin overcorrects slightly, so it dips below before settling." },
  { id: "neuron", group: "Chemistry and medicine", name: "Nerve cell, one incoming signal", input: ode("y' + y = 4t e^(-2t)", 0), note: "The membrane voltage of a neuron, a leaky capacitor, charged by one synaptic current pulse." },

  // ── physics ──
  { id: "radio", group: "Physics", name: "Radioactive decay", input: fn("e^(-0.25t)"), probe: [0.5, 1], note: "The fraction of nuclei left. The half-life is $\\ln 2 / 0.25 \\approx 2.8$." },
  { id: "kicked", group: "Physics", name: "Oscillator given a kick", input: tf("1/(s^2 + 0.6s + 9)"), probe: [0.5, 3], note: "The response to a sharp blow (an impulse). Its transform is the system's transfer function itself." },
  { id: "driven", group: "Physics", name: "Driven, damped oscillator", input: ode("y'' + 0.5y' + 4y = cos(3t)", 0, 0), probe: [0.5, 2], tMax: 25, note: "It starts at its own frequency, 2 rad/s, and ends at the driver's, 3 rad/s." },

  // ── probability and queues ──
  { id: "expdist", group: "Probability and queues", name: "Waiting time, one server", input: fn("2e^(-2t)"), probe: [0, 0], note: "The density of an exponential waiting time. At $s = 0$ its transform is $1$, the total probability; its slope there gives the mean." },
  { id: "erlang", group: "Probability and queues", name: "Three stages in a row", input: fn("4t^2 e^(-2t)"), probe: [0, 0], note: "The Erlang density: the time to pass three exponential stages. Its transform is the single stage's, cubed." },
  { id: "hypo", group: "Probability and queues", name: "Two stages, different rates", input: tf("3/((s + 1)(s + 3))"), probe: [0, 0], note: "Adding independent times multiplies their transforms: $\\dfrac{1}{s+1} \\cdot \\dfrac{3}{s+3}$." },

  // ── economics ──
  { id: "value", group: "Economics", name: "Present value of a growing income", input: fn("e^(0.3t)"), probe: [0.8, 0], tMax: 10, note: "For real $s$, $F(s)$ is what a payment stream is worth today when discounted at rate $s$. It is finite only if $s$ beats the growth rate, $0.3$." },
  { id: "cycle", group: "Economics", name: "Business cycle", input: ode("y'' + 0.4y' + 0.5y = 0.5", 0, 0), probe: [0.5, 1], note: "Output after a rise in demand (a multiplier-accelerator model): it overshoots the new level and cycles back." },

  // ── aerospace ──
  { id: "aircraft", group: "Aerospace", name: "Aircraft pitch after a gust", input: tf("(s + 0.5)/((s^2 + 1.6s + 4)(s^2 + 0.06s + 0.09))"), probe: [0.5, 1], tMax: 60, note: "Two modes at once: the short period (quick, well damped) and the phugoid (slow, barely damped)." },
  { id: "roll", group: "Aerospace", name: "Roll rate after aileron", input: ode("0.4y' + y = 1.5", 0), note: "The roll rate rises to a steady value set by the aileron, with the roll mode's time constant, $0.4$ s." },
];
export const DEFAULT_PRESET = PRESETS[0];
