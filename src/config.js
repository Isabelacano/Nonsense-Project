// Central tuning table. Everything that defines "how the game feels" lives here,
// so the rules, the demon and the worker can be balanced without touching logic.

export const STAGES = [
  { key: 'order',      name: 'Order',      hint: 'Job ticket #1: take the scaffolding off the facade. Walk up to it and press E.' },
  { key: 'resistance', name: 'Resistance', hint: 'That was not supposed to happen. Keep at it — surely it ends somewhere.' },
  { key: 'escalation', name: 'Escalation', hint: 'Backup is on the way. Hold Ctrl to move carefully — it seems to calm the thing down.' },
  { key: 'domination', name: 'Domination', hint: 'More hands, more chaos. Running only makes it faster.' },
  { key: 'reversal',   name: 'Reversal',   hint: 'The permanent building is giving way. The temporary one is not.' },
  { key: 'aftermath',  name: 'Aftermath',  hint: 'The temporary structure outlasted the permanent one.' },
];

export const CFG = {
  // Scaffold lattice: one cell = one bay. The facade plane is z = 0, courtyard is +z.
  grid: { S: 2.0, x0: -40.3, z0: 0.3, iMin: 0, iMax: 50, jMax: 12, kMin: -8, kMax: 16 },

  // The campus around the courtyard, from OpenStreetMap footprints (© OpenStreetMap contributors,
  // ODbL), in game metres: x along the main building's front (its south-west end at x = -36),
  // z out into the courtyard. Rectangles are [minX, maxX, minZ, maxZ].
  site: {
    vdvA: [-54.8, -39.9, 9.0, 35.7],    // Van-de-Velde-Bau, the arm along the west of the lawn
    vdvB: [-59.7, -11.6, 34.2, 51.2],   // Van-de-Velde-Bau, the arm facing the main building (one L with vdvA)
    no15: [-1.0, 24.7, 35.6, 48.5],     // Geschwister-Scholl-Straße 15 (Campus.Office)
    eastA: [40.4, 55.3, 9.0, 35.7],     // east wing: mirror of vdvA, where M18 stands (white)
    eastB: [27.0, 60.2, 34.2, 51.2],    // east wing: mirror of vdvB, facing the main building (one L with eastA)
    liszt: [70.2, 81.9, -12.8, -1.4],   // Liszt-Haus, continuing the main building's line
    lawn: [-35.6, -9.0, 10.0, 31.6],    // the courtyard lawn in front of the south-west section
  },

  worker: {
    walk: 3.6, run: 7.6, sneak: 1.05,
    accel: 14, turn: 12,
    jumpV: 7.6, gravity: 18,
    radius: 0.42, height: 1.75, step: 0.62,
    reach: 1.55, dismantleTime: 0.75,
  },

  // Demon tempo multiplier: the scaffolding simulation runs on dt * tempo.
  tempo: { idle: 0.55, walk: 1.0, run: 2.7, sneak: 0.12, response: 4.0 },

  // Per-stage numbers (index = stage).
  growthRate:   [0,    0.32, 0.8,  1.8,  2.2,  1.3],   // ambient bays / demon-second
  replication:  [4,    3,    4,    5,    7,    4],     // new bays per dismantle attempt
  remoteSeeds:  [1,    1,    1,    2,    2,    1],     // of which appear far away
  mischiefGap:  [99,   6,    3.6,  2.6,  2.2,  3.0],   // demon-seconds between tricks
  wallDamage:   [0,    0.0015, 0.006, 0.013, 0.03, 0.03], // per adjacent bay per demon-second (capped per stage: demon.wear)
  jabChance:    [0,    0,    0.35, 0.5,  0.6,  0.4],
  maxLevel:     [5,    8,    9,    11,   12,   12],
  maxBays: 1500,      // hard pool size; ordinary sessions stop at scaffold.softCap (900), the giant ending uses it all

  // Stage thresholds.
  toEscalation: { bays: 48, attempts: 5 },
  toDomination: { bays: 135, attempts: 12 },
  toReversal:   { bays: 240, integrity: 0.6 },
  toAftermath:  { integrity: 0.22 },
  collapseGap: 3.4, // demon-seconds between column failures during Reversal

  initialScaffold: { i0: 8, i1: 12, j1: 5 },

  // The courtyard: the playable ground, and the boundary every ending's exit is measured against
  // (world space, metres). Anyone or anything outside it has left the scene.
  court: { minX: -39.5, maxX: 62, minZ: 0.55, maxZ: 33.2 },

  // performance limit for the crowd (workers are called in by events, not to a target number)
  crew: { max: 90 },
};

// Is a world-space point outside the courtyard by more than `margin` metres?
export function outsideCourt(p, margin = 0) {
  const c = CFG.court;
  return p.x < c.minX - margin || p.x > c.maxX + margin || p.z < c.minZ - margin || p.z > c.maxZ + margin;
}
