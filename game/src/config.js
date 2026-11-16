// SHARDLINE — shared constants, economy, and the seeded RNG.
// One job: the numbers every other module agrees on.
export const CONFIG = {
  mapWidth: 64, // x: -32..32
  mapDepth: 48, // z: -24..24
  wallHeight: 4.2,
  eyeHeight: 1.62,
  crouchEye: 1.08,
  gravity: 22,
  jumpSpeed: 7.2,
  walkSpeed: 5.2,
  sprintSpeed: 7.4,
  crouchSpeed: 2.6,
  accel: 42,
  friction: 30,
  playerRadius: 0.42,
  playerHp: 100,
  roundTime: 100,
  buyTime: 12,
  plantTime: 3.0,
  defuseTime: 5.0,
  fuseTime: 35,
  winRounds: 7,
  maxRounds: 12,
  startMoney: 800,
  killReward: 300,
  winReward: 1400,
  lossReward: 900,
  plantReward: 300,
};

export const ECONOMY = {
  startMoney: CONFIG.startMoney,
  kill: CONFIG.killReward,
  win: CONFIG.winReward,
  loss: CONFIG.lossReward,
  plant: CONFIG.plantReward,
};

export const PALETTE = {
  canvas: 0x14100c,
  fog: 0x14100c,
  floor: 0x2a2620,
  floorLine: 0x3a342a,
  wall: 0x4a4238,
  wallDark: 0x35302a,
  accent: 0xf0a830, // amber
  teal: 0x2fa8a0, // Wardens
  rust: 0xc0392b, // Jackals
  steel: 0x6b7280,
  hazard: 0xe8b400,
  crane: 0xb7791f,
  furnace: 0x8a3324,
  skyTop: 0x2b3440,
  skyBottom: 0x8a6a3a,
};

export const SITES = {
  A: { id: 'A', name: 'Crane Yard', x: -14, z: -17, radius: 4.5 },
  B: { id: 'B', name: 'Furnace Hall', x: 14, z: 17, radius: 4.5 },
};

export const SPAWNS = {
  // Yaw follows three.js YXZ: yaw -PI/2 faces +X (east), +PI/2 faces -X (west).
  wardens: [
    { x: -28, z: -6, yaw: -Math.PI / 2 },
    { x: -28, z: 0, yaw: -Math.PI / 2 },
    { x: -28, z: 6, yaw: -Math.PI / 2 },
    { x: -26, z: 0, yaw: -Math.PI / 2 },
  ],
  jackals: [
    { x: 28, z: -6, yaw: Math.PI / 2 },
    { x: 28, z: 0, yaw: Math.PI / 2 },
    { x: 28, z: 6, yaw: Math.PI / 2 },
    { x: 26, z: 0, yaw: Math.PI / 2 },
  ],
};

export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic pick from an array with a seeded rng.
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
