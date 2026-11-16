// SHARDLINE — "Foundry Nine": one original compact map built from boxes.
// Procedural canvas textures, AABB colliders, a hand-authored waypoint graph,
// two plant sites and two spawn yards. No external assets.
import * as THREE from 'three';
import { PALETTE, SITES, SPAWNS } from './config.js';

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function floorTexture() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#2a2620';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#3a342a';
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i += 1) {
      g.beginPath(); g.moveTo((i * s) / 4, 0); g.lineTo((i * s) / 4, s); g.stroke();
      g.beginPath(); g.moveTo(0, (i * s) / 4); g.lineTo(s, (i * s) / 4); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 40; i += 1) {
      g.fillRect(Math.random() * s, Math.random() * s, 6 + Math.random() * 18, 4 + Math.random() * 10);
    }
    g.fillStyle = 'rgba(240,168,48,0.10)';
    g.fillRect(0, s / 2 - 4, s, 8);
  }, 8, 6);
}

function wallTexture() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#4a4238';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#35302a';
    g.fillRect(0, 0, s, 10);
    g.fillRect(0, s - 10, s, 10);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    for (let i = 1; i < 4; i += 1) {
      g.beginPath(); g.moveTo((i * s) / 4, 10); g.lineTo((i * s) / 4, s - 10); g.stroke();
    }
    g.fillStyle = 'rgba(240,168,48,0.22)';
    g.fillRect(0, s / 2 - 3, s, 6);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 24; i += 1) g.fillRect(Math.random() * s, Math.random() * s, 8, 5);
  }, 2, 1);
}

function hazardTexture() {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#e8b400';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#17130f';
    for (let i = -2; i < 6; i += 1) {
      g.beginPath();
      g.moveTo(i * 32, s);
      g.lineTo(i * 32 + 32, 0);
      g.lineTo(i * 32 + 64, 0);
      g.lineTo(i * 32 + 32, s);
      g.closePath();
      g.fill();
    }
  }, 4, 1);
}

function crateTexture() {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#5a4a33';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#2e2618';
    g.lineWidth = 8;
    g.strokeRect(4, 4, s - 8, s - 8);
    g.beginPath(); g.moveTo(4, 4); g.lineTo(s - 4, s - 4); g.moveTo(s - 4, 4); g.lineTo(4, s - 4); g.stroke();
    g.fillStyle = 'rgba(240,168,48,0.5)';
    g.font = 'bold 20px monospace';
    g.fillText('FN-9', 14, s / 2 + 7);
  });
}

function furnaceTexture() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#8a3324';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#5c1f14';
    g.fillRect(16, 16, s - 32, s - 32);
    g.fillStyle = '#ff7a2a';
    g.beginPath(); g.arc(s / 2, s / 2, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd23a';
    g.beginPath(); g.arc(s / 2, s / 2, 18, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 4;
    g.strokeRect(0, 0, s, s);
  });
}

// Obstacles: {x, z, w, d, h, mat, y?} — colliders are the same footprint.
const OBSTACLES = [
  // Site A — Crane Yard (north, z ~ -17): crane legs + stacked crates.
  { x: -18, z: -20, w: 1.2, d: 1.2, h: 6, mat: 'crane' },
  { x: -10, z: -20, w: 1.2, d: 1.2, h: 6, mat: 'crane' },
  { x: -14, z: -20, w: 9.2, d: 1.0, h: 1.0, mat: 'crane', y: 5.2 },
  { x: -20, z: -15, w: 2.4, d: 2.4, h: 1.2, mat: 'crate' },
  { x: -20, z: -15, w: 1.6, d: 1.6, h: 1.2, mat: 'crate', y: 1.2 },
  { x: -8, z: -14, w: 2.4, d: 1.2, h: 2.4, mat: 'crate' },
  { x: -14, z: -12, w: 3.0, d: 1.2, h: 1.2, mat: 'crate' },
  // Site B — Furnace Hall (south, z ~ +17): furnaces + crates.
  { x: 18, z: 20, w: 4.0, d: 2.0, h: 3.4, mat: 'furnace' },
  { x: 10, z: 20, w: 4.0, d: 2.0, h: 3.4, mat: 'furnace' },
  { x: 20, z: 14, w: 2.4, d: 2.4, h: 1.2, mat: 'crate' },
  { x: 8, z: 14, w: 2.4, d: 1.2, h: 2.4, mat: 'crate' },
  { x: 14, z: 12, w: 3.0, d: 1.2, h: 1.2, mat: 'crate' },
  // Mid corridor: two staggered walls make a lane with sightline breaks.
  { x: -6, z: -4, w: 10, d: 1.0, h: 3.2, mat: 'wall' },
  { x: 6, z: 4, w: 10, d: 1.0, h: 3.2, mat: 'wall' },
  { x: 0, z: -10, w: 1.0, d: 6, h: 2.6, mat: 'wall' },
  { x: 0, z: 10, w: 1.0, d: 6, h: 2.6, mat: 'wall' },
  { x: -2, z: 0, w: 2.4, d: 2.4, h: 1.2, mat: 'crate' },
  { x: 2, z: -1, w: 1.6, d: 1.6, h: 1.2, mat: 'crate', y: 1.2 },
  // Connectors: cover crates on the A and B lanes.
  { x: -22, z: -8, w: 2.4, d: 1.2, h: 1.2, mat: 'crate' },
  { x: -22, z: 8, w: 2.4, d: 1.2, h: 1.2, mat: 'crate' },
  { x: 22, z: -8, w: 2.4, d: 1.2, h: 1.2, mat: 'crate' },
  { x: 22, z: 8, w: 2.4, d: 1.2, h: 1.2, mat: 'crate' },
  { x: -12, z: 14, w: 2.4, d: 2.4, h: 1.2, mat: 'crate' },
  { x: 12, z: -14, w: 2.4, d: 2.4, h: 1.2, mat: 'crate' },
  // Spawn yard cover.
  { x: -24, z: -2, w: 1.2, d: 4, h: 2.2, mat: 'wall' },
  { x: 24, z: 2, w: 1.2, d: 4, h: 2.2, mat: 'wall' },
];

// Waypoint graph: hand-authored nodes + edges. Bots walk edges with BFS.
const WAYPOINTS = [
  { id: 0, x: -28, z: 0 },   // Warden spawn
  { id: 1, x: -24, z: -10 },
  { id: 2, x: -24, z: 10 },
  { id: 3, x: -14, z: -10 }, // A approach
  { id: 4, x: -14, z: 10 },  // B approach
  { id: 5, x: -14, z: -17 }, // Site A
  { id: 6, x: 14, z: 17 },   // Site B
  { id: 7, x: 0, z: -6 },    // mid north
  { id: 8, x: 0, z: 6 },     // mid south
  { id: 9, x: 0, z: 0 },     // mid centre
  { id: 10, x: 14, z: -10 }, // A approach east
  { id: 11, x: 14, z: 10 },  // B approach east
  { id: 12, x: 24, z: -10 },
  { id: 13, x: 24, z: 10 },
  { id: 14, x: 28, z: 0 },   // Jackal spawn
  { id: 15, x: -8, z: -17 }, // A hold
  { id: 16, x: 8, z: 17 },   // B hold
  { id: 17, x: -20, z: -17 },// A flank
  { id: 18, x: 20, z: 17 },  // B flank
];
const EDGES = [
  [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [3, 7], [4, 8],
  [7, 9], [8, 9], [7, 10], [8, 11], [10, 12], [11, 13], [12, 14], [13, 14],
  [5, 15], [5, 17], [6, 16], [6, 18], [10, 5], [11, 6], [15, 3], [16, 4],
  [1, 7], [2, 8], [12, 10], [13, 11], [17, 1], [18, 13],
];

export function createMap(scene) {
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const shootables = []; // meshes bullets can hit (walls, crates)
  const group = new THREE.Group();
  scene.add(group);

  const floorTex = floorTexture();
  const wallTex = wallTexture();
  const hazardTex = hazardTexture();
  const crateTex = crateTexture();
  const furnaceTex = furnaceTexture();

  const mats = {
    floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.1 }),
    wall: new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.15 }),
    crate: new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.9, metalness: 0.05 }),
    crane: new THREE.MeshStandardMaterial({ color: PALETTE.crane, roughness: 0.6, metalness: 0.5 }),
    furnace: new THREE.MeshStandardMaterial({ map: furnaceTex, roughness: 0.7, metalness: 0.3, emissive: 0x301008, emissiveIntensity: 0.6 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.8, metalness: 0.1 }),
  };

  // Floor.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(64, 0.2, 48), mats.floor);
  floor.position.set(0, -0.1, 0);
  floor.receiveShadow = true;
  group.add(floor);
  shootables.push(floor);

  // Perimeter walls.
  const wallH = 4.2;
  const perim = [
    { x: 0, z: -24, w: 64.8, d: 0.8 },
    { x: 0, z: 24, w: 64.8, d: 0.8 },
    { x: -32, z: 0, w: 0.8, d: 48.8 },
    { x: 32, z: 0, w: 0.8, d: 48.8 },
  ];
  for (const p of perim) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, wallH, p.d), mats.wall);
    m.position.set(p.x, wallH / 2, p.z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    shootables.push(m);
    colliders.push({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2 });
  }

  // Obstacles.
  for (const o of OBSTACLES) {
    const y0 = o.y || 0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), mats[o.mat] || mats.wall);
    m.position.set(o.x, y0 + o.h / 2, o.z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    shootables.push(m);
    // Only ground-level boxes block movement; stacked crates sit on a collider already.
    if (y0 === 0) {
      colliders.push({ minX: o.x - o.w / 2, maxX: o.x + o.w / 2, minZ: o.z - o.d / 2, maxZ: o.z + o.d / 2 });
    }
  }

  // Hazard stripe rings marking both plant sites.
  for (const site of Object.values(SITES)) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(site.radius - 0.25, site.radius, 40), mats.hazard);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    group.add(ring);
    // Site beacon: a glowing pillar of light.
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 5, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
    );
    beacon.position.set(site.x, 2.5, site.z);
    group.add(beacon);
    // Site label post.
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 0.3), mats.crane);
    post.position.set(site.x + site.radius + 0.6, 1.1, site.z);
    group.add(post);
  }

  // Sky: gradient dome + a low sun disc; fog does the rest.
  const skyGeo = new THREE.SphereGeometry(90, 16, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      bottom: { value: new THREE.Color(PALETTE.skyBottom) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bottom; void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Lighting.
  const hemi = new THREE.HemisphereLight(0xcfd8e6, 0x2a2118, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
  sun.position.set(18, 26, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 80;
  scene.add(sun);
  // Warm furnace glow at site B.
  const furnaceLight = new THREE.PointLight(0xff7a2a, 30, 18, 1.8);
  furnaceLight.position.set(14, 2.5, 19);
  scene.add(furnaceLight);

  // Waypoint adjacency.
  const adjacency = new Map();
  for (const w of WAYPOINTS) adjacency.set(w.id, []);
  for (const [a, b] of EDGES) {
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  }

  return {
    colliders,
    shootables,
    waypoints: WAYPOINTS,
    adjacency,
    sites: SITES,
    spawns: SPAWNS,
    bounds: { minX: -31.4, maxX: 31.4, minZ: -23.4, maxZ: 23.4 },
  };
}

// Circle (radius r) vs AABB colliders, axis-separated so the mover slides along walls.
export function collideMove(colliders, bounds, pos, dx, dz, r) {
  let nx = pos.x + dx;
  let nz = pos.z + dz;
  // X axis.
  let blocked = false;
  for (const c of colliders) {
    if (nz + r > c.minZ && nz - r < c.maxZ && nx + r > c.minX && nx - r < c.maxX) { blocked = true; break; }
  }
  if (!blocked && nx - r > bounds.minX && nx + r < bounds.maxX) pos.x = nx;
  // Z axis.
  blocked = false;
  for (const c of colliders) {
    if (pos.x + r > c.minX && pos.x - r < c.maxX && nz + r > c.minZ && nz - r < c.maxZ) { blocked = true; break; }
  }
  if (!blocked && nz - r > bounds.minZ && nz + r < bounds.maxZ) pos.z = nz;
}
