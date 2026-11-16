// SHARDLINE — boot, the fixed-step loop, shooting, grenades, tracers,
// round flow and the ?shot= staging scenes. One loop, one state store (G).
import * as THREE from 'three';
import { CONFIG, SITES, mulberry32 } from './config.js';
import { createMap, collideMove } from './map.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import {
  WEAPONS, ARMOR, GRENADE, createWeaponState, canFire, fireWeapon,
  stepWeapon, startReload, currentSpread, createViewmodel,
} from './weapons.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot'); // title | buy | fight | end
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const testMode = params.get('test') === '1';
const rng = mulberry32(seed);

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14100c);
scene.fog = new THREE.Fog(0x14100c, 24, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const map = createMap(scene);
const audio = createAudio();
const hud = createHud(document);

// ---------- Central state ----------
const G = {
  now: 0,
  elapsed: 0,
  player: {
    pos: new THREE.Vector3(-28, 0, 0),
    vel: new THREE.Vector3(),
    vy: 0,
    yaw: Math.PI / 2,
    pitch: 0,
    hp: 100,
    armor: false,
    weaponId: 'p9',
    weapon: createWeaponState('p9'),
    grenades: 0,
    onGround: true,
    crouch: false,
    recoil: 0,
    walkPhase: 0,
    scoped: false,
    alive: true,
    stepTimer: 0,
  },
  chargeMesh: null,
  chargeLight: null,
  lastShotPos: null,
  lastShotTime: -99,
  frozen: false,
  started: false,
  roundEndAt: 0,
};

// ---------- Rounds ----------
const rounds = createRounds({
  onRoundStart(round) {
    resetRoundState(round);
    hud.setScore(rounds.state.scoreW, rounds.state.scoreJ, round);
    hud.setMoney(rounds.state.money);
    hud.showBuy(true, rounds.state.money);
    hud.setTimer(CONFIG.buyTime, 'buy');
    hud.banner('ROUND ' + round, 'Buy phase — spend your money, then fight.', 2200);
  },
  onLive() {
    hud.showBuy(false);
    hud.toast('Round live — plant the charge or eliminate the Jackals.');
  },
  onRoundEnd(winner, reason, scoreW, scoreJ) {
    hud.hideBanner();
    hud.showBuy(false);
    hud.showPlant(0, '');
    if (winner === 'wardens') audio.roundWin(); else audio.roundLose();
    hud.banner(winner === 'wardens' ? 'ROUND WON' : 'ROUND LOST', reason, 3200);
    if (rounds.state.phase !== 'matchEnd') {
      hud.showOverlay('roundEnd', { winner, reason, scoreW, scoreJ });
      G.roundEndAt = G.now + 6; // auto-advance
    }
    hud.setScore(scoreW, scoreJ, rounds.state.round);
  },
  onMatchEnd(winner, scoreW, scoreJ) {
    hud.showOverlay('matchEnd', { winner, scoreW, scoreJ, kills: rounds.state.kills });
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onBuy(name) { audio.buy(); hud.toast('Bought ' + name); },
  onPlanted(siteId) {
    audio.plantDone();
    hud.banner('CHARGE PLANTED — SITE ' + siteId, 'Defend it until it detonates.', 3000);
    showCharge(siteId);
  },
  onDefused() {
    hideCharge();
    hud.banner('CHARGE DEFUSED', 'The Jackals stopped the detonation.', 3000);
  },
});

// ---------- Bots ----------
const ctx = {
  seed,
  round: () => rounds.state.round,
  roundSite: 'A',
  player: G.player,
  playerAlive: () => G.player.alive,
  playerEye: () => new THREE.Vector3(G.player.pos.x, G.player.pos.y + eyeHeight(), G.player.pos.z),
  charge: () => rounds.state.charge,
  lastShotPos: null,
  hasLOS: (from, to) => hasLOS(from, to),
  botShoot: (bot, from, targetPos, def) => botShoot(bot, from, targetPos, def),
  onPlanted: (siteId, bot) => {
    const site = map.sites[siteId];
    rounds.plantCharge(siteId, site);
    rounds.addPlantReward();
    hud.killFeed(bot.name + ' planted the charge at Site ' + siteId);
  },
  onDefused: (bot) => {
    rounds.defuseCharge();
    rounds.endRound('jackals', 'Charge defused by ' + bot.name);
  },
};
const bots = createBots(scene, map, ctx);

function eyeHeight() {
  return G.player.crouch ? CONFIG.crouchEye : CONFIG.eyeHeight;
}

// ---------- Input ----------
const input = createInput(renderer.domElement, {
  onLockChange(locked) {
    if (shot || testMode) return;
    if (locked) {
      G.started = true;
      hud.hideOverlay();
      audio.resume();
    } else if (rounds.state.phase === 'live' || rounds.state.phase === 'buy') {
      hud.showOverlay('paused');
    }
  },
  onUnlockedClick() {
    if (shot || testMode) return;
    if (rounds.state.phase === 'title' || rounds.state.phase === 'matchEnd') return; // Play button handles it
    input.requestLock();
  },
  onEnter() {
    if (rounds.state.phase === 'title' || rounds.state.phase === 'matchEnd') return;
  },
});
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 2) setScoped(true);
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2) setScoped(false);
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

hud.onPlay(() => {
  audio.resume();
  if (rounds.state.phase === 'title') {
    rounds.startMatch();
    input.requestLock();
  } else if (rounds.state.phase === 'roundEnd') {
    rounds.nextRound();
    input.requestLock();
  } else if (rounds.state.phase === 'matchEnd') {
    rounds.startMatch();
    input.requestLock();
  } else {
    input.requestLock();
  }
});
hud.onBuyClick((itemId) => {
  const res = rounds.tryBuy(G.player, itemId);
  if (!res.ok) {
    audio.denied();
    hud.toast(res.reason);
    return;
  }
  if (WEAPONS[itemId]) equipWeapon(itemId);
  hud.setMoney(rounds.state.money);
  hud.setAmmo(G.player.weapon.mag, G.player.weapon.reserve, WEAPONS[G.player.weaponId].name);
  hud.setHealth(G.player.hp, G.player.armor);
});

// ---------- Viewmodel ----------
let viewmodel = createViewmodel(camera, G.player.weaponId);
function equipWeapon(id) {
  G.player.weaponId = id;
  G.player.weapon = createWeaponState(id);
  viewmodel = viewmodel.setWeapon(id);
  setScoped(false);
  hud.setAmmo(G.player.weapon.mag, G.player.weapon.reserve, WEAPONS[id].name);
}

function setScoped(on) {
  const want = on && G.player.weaponId === 'needle' && G.player.alive && (rounds.state.phase === 'live' || shot === 'fight');
  if (want === G.player.scoped) return;
  G.player.scoped = want;
  camera.fov = want ? 74 / WEAPONS.needle.zoom : 74;
  camera.updateProjectionMatrix();
  hud.showScope(want);
}

// ---------- Raycasting helpers (scratch vectors reused, no per-frame alloc) ----------
const raycaster = new THREE.Raycaster();
raycaster.far = 150;
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function hasLOS(from, to) {
  _dir.copy(to).sub(from);
  const dist = _dir.length();
  if (dist < 0.01) return true;
  _dir.normalize();
  raycaster.set(from, _dir);
  raycaster.far = dist;
  const hits = raycaster.intersectObjects(map.shootables, false);
  raycaster.far = 150;
  return hits.length === 0;
}

// Ray vs sphere (player hit test for bot shots). Returns t or -1.
function raySphere(origin, dir, center, radius) {
  _tmp.copy(center).sub(origin);
  const tca = _tmp.dot(dir);
  if (tca < 0) return -1;
  const d2 = _tmp.lengthSq() - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return -1;
  return tca - Math.sqrt(r2 - d2);
}

// ---------- Tracers & sparks (pooled, reused) ----------
const tracers = [];
for (let i = 0; i < 32; i += 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0 });
  const line = new THREE.Line(geo, mat);
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
let tracerIdx = 0;
function addTracer(from, to, color = 0xffc861) {
  const t = tracers[tracerIdx];
  tracerIdx = (tracerIdx + 1) % tracers.length;
  const pos = t.line.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  t.line.material.color.setHex(color);
  t.line.material.opacity = 0.9;
  t.line.visible = true;
  t.life = 0.09;
}

const sparks = [];
for (let i = 0; i < 12; i += 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30), 3));
  const mat = new THREE.PointsMaterial({ color: 0xffa63d, size: 0.09, transparent: true, opacity: 0 });
  const pts = new THREE.Points(geo, mat);
  pts.visible = false;
  pts.frustumCulled = false;
  scene.add(pts);
  sparks.push({ pts, life: 0 });
}
let sparkIdx = 0;
function addSparks(at) {
  const s = sparks[sparkIdx];
  sparkIdx = (sparkIdx + 1) % sparks.length;
  const pos = s.pts.geometry.attributes.position;
  for (let i = 0; i < 10; i += 1) {
    pos.setXYZ(i, at.x + (Math.random() - 0.5) * 0.3, at.y + (Math.random() - 0.5) * 0.3, at.z + (Math.random() - 0.5) * 0.3);
  }
  pos.needsUpdate = true;
  s.pts.material.opacity = 1;
  s.pts.visible = true;
  s.life = 0.25;
}

function stepEffects(dt) {
  for (const t of tracers) {
    if (t.life > 0) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) t.line.visible = false;
    }
  }
  for (const s of sparks) {
    if (s.life > 0) {
      s.life -= dt;
      s.pts.material.opacity = Math.max(0, s.life / 0.25);
      if (s.life <= 0) s.pts.visible = false;
    }
  }
}

// ---------- Charge mesh ----------
function showCharge(siteId) {
  hideCharge();
  const site = map.sites[siteId];
  const geo = new THREE.IcosahedronGeometry(0.55, 0);
  const mat = new THREE.MeshStandardMaterial({ color: PALETTE_AMBER, emissive: PALETTE_AMBER, emissiveIntensity: 1.4, roughness: 0.3 });
  G.chargeMesh = new THREE.Mesh(geo, mat);
  G.chargeMesh.position.set(site.x, 0.7, site.z);
  scene.add(G.chargeMesh);
  G.chargeLight = new THREE.PointLight(0xffa63d, 20, 12, 1.8);
  G.chargeLight.position.set(site.x, 1.5, site.z);
  scene.add(G.chargeLight);
}
const PALETTE_AMBER = 0xf0a830;
function hideCharge() {
  if (G.chargeMesh) { scene.remove(G.chargeMesh); G.chargeMesh = null; }
  if (G.chargeLight) { scene.remove(G.chargeLight); G.chargeLight = null; }
}

// ---------- Grenades ----------
const grenades = [];
function throwGrenade() {
  if (G.player.grenades <= 0 || rounds.state.phase !== 'live' || !G.player.alive) return;
  G.player.grenades -= 1;
  camera.getWorldDirection(_dir);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2f24, roughness: 0.5, metalness: 0.6 }),
  );
  mesh.position.copy(camera.position);
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: new THREE.Vector3(_dir.x * 17, _dir.y * 17 + 3.5, _dir.z * 17),
    timer: 1.8,
  });
  audio.step();
}
function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.timer -= dt;
    g.vel.y -= 18 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y < 0.12) {
      g.mesh.position.y = 0.12;
      g.vel.y = Math.abs(g.vel.y) * 0.35;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    if (g.timer <= 0) {
      explodeGrenade(g.mesh.position);
      scene.remove(g.mesh);
      grenades.splice(i, 1);
    }
  }
}
function explodeGrenade(pos) {
  audio.explosion();
  addSparks(pos);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.8 }),
  );
  flash.position.copy(pos);
  scene.add(flash);
  let t = 0;
  const grow = () => {
    t += 1 / 60;
    flash.scale.setScalar(1 + t * 14);
    flash.material.opacity = Math.max(0, 0.8 - t * 2.4);
    if (t < 0.35) requestAnimationFrame(grow);
    else scene.remove(flash);
  };
  grow();
  // AoE damage, falloff over 6 m.
  const victims = [];
  for (const b of bots.bots) if (b.alive) victims.push({ kind: 'bot', ref: b, pos: b.pos, y: 1.2 });
  if (G.player.alive) victims.push({ kind: 'player', ref: G.player, pos: G.player.pos, y: 1.2 });
  for (const v of victims) {
    const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z);
    if (d > 6) continue;
    const dmg = Math.round(120 - (d / 6) * 100);
    if (v.kind === 'bot') damageBot(v.ref, dmg, 'body', null, 'Frag Grenade');
    else damagePlayer(dmg, pos, null);
  }
}

// ---------- Damage ----------
function damageBot(bot, amount, part, attacker, weaponName) {
  if (!bot.alive) return;
  let dmg = amount;
  if (part === 'head') dmg *= 3;
  else if (bot.armor) dmg = Math.round(dmg / 2);
  const killed = bots.damage(bot, dmg);
  if (attacker === 'player') {
    hud.hitMarker(killed, killed ? 300 : 120);
    audio.hit(part === 'head');
    if (killed) {
      audio.kill();
      rounds.addKillReward();
      hud.killFeed('You ▸ ' + bot.name + (weaponName ? ' — ' + weaponName : ''));
      hud.setMoney(rounds.state.money);
    }
  }
  return killed;
}

function damagePlayer(amount, fromPos, attackerBot) {
  if (!G.player.alive || rounds.state.phase !== 'live') return;
  let dmg = amount;
  if (G.player.armor) dmg = Math.round(dmg / 2);
  G.player.hp -= dmg;
  audio.hurt();
  if (fromPos) {
    const dx = fromPos.x - G.player.pos.x;
    const dz = fromPos.z - G.player.pos.z;
    const worldAngle = Math.atan2(dx, dz);
    const rel = worldAngle - G.player.yaw;
    hud.damageFrom((rel * 180) / Math.PI);
  }
  hud.setHealth(G.player.hp, G.player.armor);
  if (G.player.hp <= 0) {
    G.player.hp = 0;
    G.player.alive = false;
    rounds.state.deaths += 1;
    hud.killFeed((attackerBot ? attackerBot.name : 'Blast') + ' ▸ You');
    hud.showOverlay('dead');
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

// ---------- Shooting ----------
function playerShoot(now) {
  const def = WEAPONS[G.player.weaponId];
  const st = G.player.weapon;
  if (!canFire(def, st, now)) {
    if (st.mag <= 0 && st.reloading <= 0) audio.dryFire();
    return;
  }
  fireWeapon(def, st, now);
  audio.shot(G.player.weaponId);
  viewmodel.triggerFlash();
  G.player.recoil = Math.min(0.06, G.player.recoil + def.recoil);
  const moving = Math.hypot(G.player.vel.x, G.player.vel.z) > 1;
  const spread = currentSpread(def, st, moving, !G.player.onGround, G.player.crouch);
  camera.getWorldDirection(_dir);
  _dir.x += (rng() * 2 - 1) * spread;
  _dir.y += (rng() * 2 - 1) * spread;
  _dir.z += (rng() * 2 - 1) * spread;
  _dir.normalize();
  _origin.copy(camera.position);
  raycaster.set(_origin, _dir);
  const targets = map.shootables.concat(bots.hitMeshes());
  const hits = raycaster.intersectObjects(targets, false);
  let end;
  if (hits.length) {
    const h = hits[0];
    end = h.point;
    if (h.object.userData.fighter) {
      const bot = h.object.userData.fighter;
      damageBot(bot, def.damage, h.object.userData.part, 'player', def.name);
      addSparks(end);
    } else {
      addSparks(end);
    }
  } else {
    end = _origin.clone().addScaledVector(_dir, 80);
  }
  viewmodel.muzzle.getWorldPosition(_hit);
  addTracer(_hit, end);
  ctx.lastShotPos = G.player.pos.clone();
  ctx.lastShotTime = now;
  hud.setAmmo(st.mag, st.reserve, def.name);
}

function botShoot(bot, from, targetPos, def) {
  audio.shot(bot.weaponId, true);
  _dir.copy(targetPos).sub(from).normalize();
  raycaster.set(from, _dir);
  const enemies = [];
  if (bot.target && bot.target.kind === 'player' && G.player.alive) {
    // Player hit test via ray-sphere, compared against wall distance.
    const wallHits = raycaster.intersectObjects(map.shootables, false);
    const wallDist = wallHits.length ? wallHits[0].distance : Infinity;
    _tmp.set(G.player.pos.x, G.player.pos.y + 1.4, G.player.pos.z);
    const tBody = raySphere(from, _dir, _tmp, 0.55);
    _tmp.set(G.player.pos.x, G.player.pos.y + 1.58, G.player.pos.z);
    const tHead = raySphere(from, _dir, _tmp, 0.26);
    let t = -1;
    let part = 'body';
    if (tHead > 0 && tHead < wallDist) { t = tHead; part = 'head'; }
    else if (tBody > 0 && tBody < wallDist) { t = tBody; part = 'body'; }
    if (t > 0) {
      const hitPoint = from.clone().addScaledVector(_dir, t);
      addTracer(from, hitPoint, 0xff6b5e);
      let dmg = def.damage;
      if (part === 'head') dmg *= 3;
      damagePlayer(dmg, bot.pos, bot);
      ctx.lastShotPos = bot.pos.clone();
      return;
    }
    const end = wallHits.length ? wallHits[0].point : from.clone().addScaledVector(_dir, 60);
    if (wallHits.length) addSparks(end);
    addTracer(from, end, 0xff6b5e);
    ctx.lastShotPos = bot.pos.clone();
    return;
  }
  // Bot vs bot: raycast against enemy fighters + walls.
  for (const other of bots.bots) {
    if (other.team === bot.team || !other.alive) continue;
    enemies.push(other.bodyMesh, other.headMesh);
  }
  const hits = raycaster.intersectObjects(map.shootables.concat(enemies), false);
  if (hits.length) {
    const h = hits[0];
    addTracer(from, h.point, bot.team === 'wardens' ? 0x2fa8a0 : 0xff6b5e);
    if (h.object.userData.fighter) {
      damageBot(h.object.userData.fighter, def.damage, h.object.userData.part, bot.team, def.name);
      addSparks(h.point);
    } else {
      addSparks(h.point);
    }
  } else {
    addTracer(from, from.clone().addScaledVector(_dir, 60), 0xff6b5e);
  }
  ctx.lastShotPos = bot.pos.clone();
}

// ---------- Player movement (fixed step) ----------
function stepPlayer(dt) {
  const p = G.player;
  const k = input.state.keys;
  const look = input.takeLook();
  p.yaw -= look.x * 0.0022;
  p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch - look.y * 0.0022));
  p.pitch += p.recoil;
  p.recoil *= Math.pow(0.0001, dt); // decay
  p.recoil = Math.max(0, p.recoil - dt * 0.25);

  p.crouch = k.has('ControlLeft') || k.has('ControlRight');
  const sprint = (k.has('ShiftLeft') || k.has('ShiftRight')) && !p.crouch;
  const speed = p.crouch ? CONFIG.crouchSpeed : sprint ? CONFIG.sprintSpeed : CONFIG.walkSpeed;
  let fx = 0;
  let fz = 0;
  if (k.has('KeyW')) fz -= 1;
  if (k.has('KeyS')) fz += 1;
  if (k.has('KeyA')) fx -= 1;
  if (k.has('KeyD')) fx += 1;
  const len = Math.hypot(fx, fz) || 1;
  fx /= len;
  fz /= len;
  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  const wx = fx * cos - fz * sin;
  const wz = fx * sin + fz * cos;
  const targetVx = wx * speed;
  const targetVz = wz * speed;
  const accelRate = p.onGround ? CONFIG.accel : CONFIG.accel * 0.4;
  p.vel.x += Math.max(-accelRate * dt, Math.min(accelRate * dt, targetVx - p.vel.x));
  p.vel.z += Math.max(-accelRate * dt, Math.min(accelRate * dt, targetVz - p.vel.z));
  if (fx === 0 && fz === 0 && p.onGround) {
    const f = Math.max(0, 1 - (CONFIG.friction / speed) * dt);
    p.vel.x *= f;
    p.vel.z *= f;
    if (Math.hypot(p.vel.x, p.vel.z) < 0.05) { p.vel.x = 0; p.vel.z = 0; }
  }
  collideMove(map.colliders, map.bounds, p.pos, p.vel.x * dt, p.vel.z * dt, CONFIG.playerRadius);

  // Jump / gravity.
  if (k.has('Space') && p.onGround) {
    p.vy = CONFIG.jumpSpeed;
    p.onGround = false;
  }
  p.vy -= CONFIG.gravity * dt;
  p.pos.y += p.vy * dt;
  if (p.pos.y <= 0) {
    p.pos.y = 0;
    p.vy = 0;
    p.onGround = true;
  }
  const hSpeed = Math.hypot(p.vel.x, p.vel.z);
  if (hSpeed > 0.5 && p.onGround) {
    p.walkPhase += dt * hSpeed * 1.6;
    p.stepTimer -= dt;
    if (p.stepTimer <= 0) {
      p.stepTimer = 0.36;
      audio.step();
    }
  }
  // Firing / reload / grenade / plant (live only, alive only).
  if (rounds.state.phase === 'live' && p.alive) {
    if (input.state.firing) playerShoot(G.now);
    if (input.consumePressed('KeyR')) {
      if (startReload(WEAPONS[p.weaponId], p.weapon)) audio.reload();
    }
    if (input.consumePressed('KeyG')) throwGrenade();
    // Plant: hold E near a site.
    if (k.has('KeyE') && !rounds.state.charge.planted) {
      const site = nearestSite(p.pos.x, p.pos.z);
      if (site) {
        rounds.state.plantProgress += dt / CONFIG.plantTime;
        rounds.state.plantSite = site.id;
        hud.showPlant(rounds.state.plantProgress, 'PLANTING — SITE ' + site.id + ' (hold E)');
        if (rounds.state.plantProgress >= 1) {
          rounds.state.plantProgress = 0;
          hud.showPlant(0, '');
          rounds.plantCharge(site.id, site);
          rounds.addPlantReward();
          hud.killFeed('You planted the charge at Site ' + site.id);
          hud.setMoney(rounds.state.money);
        }
      } else {
        rounds.state.plantProgress = 0;
        hud.showPlant(0, '');
      }
    } else {
      if (rounds.state.plantProgress > 0) {
        rounds.state.plantProgress = Math.max(0, rounds.state.plantProgress - dt * 2);
        hud.showPlant(rounds.state.plantProgress, 'PLANTING — SITE ' + (rounds.state.plantSite || ''));
        if (rounds.state.plantProgress === 0) hud.showPlant(0, '');
      }
    }
  }
  if (input.consumePressed('KeyB') && rounds.state.phase === 'buy') {
    hud.showBuy(!hud.els.buyMenu.hidden ? false : true, rounds.state.money);
  }
  // Buy keys during buy phase.
  if (rounds.state.phase === 'buy') {
    const buyKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
    const buyIds = ['p9', 'rook', 'longbow', 'needle', 'armor', 'grenade'];
    for (let i = 0; i < buyKeys.length; i += 1) {
      if (input.consumePressed(buyKeys[i])) {
        const res = rounds.tryBuy(G.player, buyIds[i]);
        if (!res.ok) { audio.denied(); hud.toast(res.reason); }
        else {
          if (WEAPONS[buyIds[i]]) equipWeapon(buyIds[i]);
          hud.setMoney(rounds.state.money);
          hud.setHealth(G.player.hp, G.player.armor);
        }
      }
    }
  }
  stepWeapon(WEAPONS[p.weaponId], p.weapon, dt);
  viewmodel.step(dt, p.walkPhase, hSpeed > 0.5, p.recoil);
  syncCamera();
}

function nearestSite(x, z) {
  for (const site of Object.values(SITES)) {
    if (Math.hypot(site.x - x, site.z - z) <= site.radius) return site;
  }
  return null;
}

function syncCamera() {
  const p = G.player;
  camera.position.set(p.pos.x, p.pos.y + eyeHeight(), p.pos.z);
  camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
}

// ---------- Round flow (fixed step) ----------
function resetRoundState(round) {
  const p = G.player;
  const spawn = map.spawns.wardens[0];
  p.pos.set(spawn.x, 0, spawn.z);
  p.vel.set(0, 0, 0);
  p.vy = 0;
  p.yaw = spawn.yaw;
  p.pitch = 0;
  p.hp = CONFIG.playerHp;
  p.armor = false;
  p.grenades = 0;
  p.alive = true;
  p.recoil = 0;
  if (G.player.weaponId !== 'p9') equipWeapon(G.player.weaponId);
  else {
    p.weapon = createWeaponState('p9');
    hud.setAmmo(p.weapon.mag, p.weapon.reserve, WEAPONS.p9.name);
  }
  hideCharge();
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  bots.reset(round);
  hud.setHealth(p.hp, p.armor);
  hud.setAlive(3 + 1, 4);
  hud.hideOverlay();
  hud.showHud(true);
  setScoped(false);
  input.clearPressed();
}

function stepRound(dt) {
  const R = rounds.state;
  if (R.phase === 'buy') {
    R.buyTimer -= dt;
    hud.setTimer(R.buyTimer, 'buy');
    hud.setBuyTimer(R.buyTimer);
    if (R.buyTimer <= 0) rounds.beginLive();
    return;
  }
  if (R.phase !== 'live') return;
  R.roundTimer -= dt;
  hud.setTimer(R.roundTimer, 'live');
  // Planted charge fuse.
  if (R.charge.planted) {
    R.charge.fuse -= dt;
    if (G.chargeMesh) {
      const pulse = 1 + Math.sin(G.now * 8) * 0.15;
      G.chargeMesh.scale.setScalar(pulse);
    }
    if (Math.ceil(R.charge.fuse) !== Math.ceil(R.charge.fuse + dt)) {
      if (R.charge.fuse < 10) audio.beep(true);
      else if (R.charge.fuse < 35) audio.beep(false);
    }
    if (R.charge.fuse <= 0) {
      hideCharge();
      rounds.endRound('wardens', 'Charge detonated at Site ' + R.charge.site);
      return;
    }
  }
  if (R.roundTimer <= 0 && !R.charge.planted) {
    rounds.endRound('jackals', 'Time expired — the charge was never planted');
    return;
  }
  // Elimination.
  const aliveW = (G.player.alive ? 1 : 0) + bots.aliveCount('wardens');
  const aliveJ = bots.aliveCount('jackals');
  hud.setAlive(aliveW, aliveJ);
  if (aliveJ === 0) {
    rounds.endRound('wardens', 'Jackal team eliminated');
    return;
  }
  if (aliveW === 0) {
    rounds.endRound('jackals', 'Warden team eliminated');
    return;
  }
  // Bots fight on.
  bots.step(dt, G.now);
  stepGrenades(dt);
}

function step(dt) {
  G.now += dt;
  if (rounds.state.phase === 'title' || rounds.state.phase === 'matchEnd') {
    // Idle scene: slow camera drift on the title screen.
    if (rounds.state.phase === 'title' && !shot) {
      G.player.yaw += dt * 0.03;
      syncCamera();
    }
    return;
  }
  if (rounds.state.phase === 'roundEnd') {
    bots.step(dt, G.now); // let the scene settle
    stepGrenades(dt);
    if (G.now >= G.roundEndAt && rounds.state.phase === 'roundEnd') {
      rounds.nextRound();
      input.requestLock();
    }
    return;
  }
  stepPlayer(dt);
  stepRound(dt);
  stepEffects(dt);
  // HUD readouts.
  const p = G.player;
  const def = WEAPONS[p.weaponId];
  hud.setAmmo(p.weapon.mag, p.weapon.reserve, def.name);
  hud.setHealth(p.hp, p.armor);
  hud.setMoney(rounds.state.money);
  const spreadPx = 4 + (currentSpread(def, p.weapon, Math.hypot(p.vel.x, p.vel.z) > 1, !p.onGround, p.crouch) * 900);
  hud.setCrosshairSpread(Math.min(34, spreadPx));
}

// ---------- Main loop ----------
let accumulator = 0;
let lastTime = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!G.frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function aimAt(x, y, z) {
  const p = G.player;
  const dx = x - p.pos.x;
  const dy = y - (p.pos.y + eyeHeight());
  const dz = z - p.pos.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

// ---------- Staging scenes ----------
function runShot(name) {
  hud.hideOverlay();
  if (name === 'title') {
    G.player.pos.set(-20, 0, 10);
    G.player.yaw = 1.15;
    G.player.pitch = -0.02;
    bots.reset(1);
    syncCamera();
    hud.showOverlay('title');
    hud.showHud(false);
  } else if (name === 'buy') {
    rounds.startMatch();
    rounds.state.money = 3200;
    hud.setMoney(3200);
    G.player.pos.set(-26, 0, -2);
    G.player.yaw = 1.9;
    G.player.pitch = -0.03;
    syncCamera();
    settle(10);
    hud.showBuy(true, 3200);
  } else if (name === 'fight') {
    rounds.startMatch();
    rounds.beginLive();
    G.player.pos.set(2, 0, -4);
    const jackal = bots.bots.find((b) => b.team === 'jackals');
    if (jackal) {
      jackal.pos.set(8, 0, -14);
      jackal.yaw = Math.PI;
      jackal.state = 'hold';
      jackal.mesh.position.copy(jackal.pos);
      jackal.mesh.rotation.y = jackal.yaw;
    }
    const mate = bots.bots.find((b) => b.team === 'wardens');
    if (mate) {
      mate.pos.set(-3, 0, -7);
      mate.yaw = 1.2;
      mate.state = 'hold';
      mate.mesh.position.copy(mate.pos);
      mate.mesh.rotation.y = mate.yaw;
    }
    settle(10);
    aimAt(8, 1.2, -14);
    playerShoot(G.now);
    settle(6);
  } else if (name === 'end') {
    rounds.state.scoreW = 7;
    rounds.state.scoreJ = 5;
    rounds.state.kills = 14;
    rounds.state.phase = 'matchEnd';
    rounds.state.matchWinner = 'wardens';
    G.player.pos.set(-20, 0, 10);
    G.player.yaw = 1.15;
    G.player.pitch = -0.02;
    bots.reset(1);
    syncCamera();
    hud.showOverlay('matchEnd', { winner: 'wardens', scoreW: 7, scoreJ: 5, kills: 14 });
  }
  hud.setScore(rounds.state.scoreW, rounds.state.scoreJ, rounds.state.round);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      G.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

// ---------- Test hooks (?test=1) ----------
window.__shardline = {
  state() {
    const R = rounds.state;
    return {
      phase: R.phase,
      round: R.round,
      scoreW: R.scoreW,
      scoreJ: R.scoreJ,
      money: R.money,
      buyTimer: R.buyTimer,
      roundTimer: R.roundTimer,
      hp: G.player.hp,
      alive: G.player.alive,
      weaponId: G.player.weaponId,
      mag: G.player.weapon.mag,
      reserve: G.player.weapon.reserve,
      armor: G.player.armor,
      grenades: G.player.grenades,
      aliveW: (G.player.alive ? 1 : 0) + bots.aliveCount('wardens'),
      aliveJ: bots.aliveCount('jackals'),
      chargePlanted: R.charge.planted,
      chargeSite: R.charge.site,
      fuse: R.charge.fuse,
      roundSite: ctx.roundSite,
      kills: R.kills,
    };
  },
  startMatch: () => rounds.startMatch(),
  beginLive: () => rounds.beginLive(),
  nextRound: () => rounds.nextRound(),
  buy: (id) => {
    const res = rounds.tryBuy(G.player, id);
    if (res.ok && WEAPONS[id]) equipWeapon(id);
    return res;
  },
  giveMoney: (n) => { rounds.state.money += n; },
  forceWin: () => rounds.endRound('wardens', 'Test force win'),
  forceLose: () => rounds.endRound('jackals', 'Test force lose'),
  forcePlant: (siteId) => {
    const site = map.sites[siteId || ctx.roundSite];
    rounds.plantCharge(site.id, site);
  },
  teleport: (x, z, yaw) => {
    G.player.pos.set(x, 0, z);
    if (yaw !== undefined) G.player.yaw = yaw;
    syncCamera();
  },
  aimAt,
  fire: () => playerShoot(G.now),
  reload: () => startReload(WEAPONS[G.player.weaponId], G.player.weapon),
  throwGrenade: () => throwGrenade(),
  killAllJackals: () => {
    for (const b of bots.bots) if (b.team === 'jackals' && b.alive) bots.damage(b, 9999);
  },
  killAllWardens: () => {
    G.player.alive = false;
    G.player.hp = 0;
    for (const b of bots.bots) if (b.team === 'wardens' && b.alive) bots.damage(b, 9999);
  },
  botPositions: () => bots.bots.map((b) => ({
    id: b.id, team: b.team, x: +b.pos.x.toFixed(2), z: +b.pos.z.toFixed(2),
    alive: b.alive, hp: b.hp, state: b.state, role: b.role,
  })),
  playerPos: () => ({ x: +G.player.pos.x.toFixed(2), y: +G.player.pos.y.toFixed(2), z: +G.player.pos.z.toFixed(2), yaw: +G.player.yaw.toFixed(3) }),
  restart: () => rounds.startMatch(),
  step: (n) => settle(n || 1),
  errors: [],
};

window.addEventListener('error', (e) => {
  window.__shardline.errors.push(String(e.message || e.error));
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.showOverlay('title');
hud.showHud(false);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
