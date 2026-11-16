// SHARDLINE — bot AI: waypoint routes, roles, vision + hearing, states
// (advance / engage / plant / defuse / retake / fallback), human-like aim
// error that shrinks slightly as rounds go on. Fixed-step only, no per-frame
// allocation in the hot loop: scratch vectors live at module scope.
import * as THREE from 'three';
import { CONFIG, mulberry32 } from './config.js';
import { collideMove } from './map.js';
import { WEAPONS, createWeaponState, canFire, fireWeapon, stepWeapon, currentSpread } from './weapons.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

const BOT_NAMES = {
  wardens: ['Vex', 'Marlowe', 'Iris'],
  jackals: ['Ash', 'Kade', 'Nyx', 'Bram'],
};
const TEAM_COLOR = { wardens: 0x2fa8a0, jackals: 0xc0392b };
const TEAM_DARK = { wardens: 0x1d5f5a, jackals: 0x6e1f16 };

function bfsPath(adjacency, from, to) {
  if (from === to) return [to];
  const prev = new Map([[from, -1]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of adjacency.get(cur) || []) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      if (next === to) {
        const path = [to];
        let n = to;
        while (prev.get(n) !== -1) { n = prev.get(n); path.unshift(n); }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

function nearestNode(waypoints, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (const w of waypoints) {
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bestD) { bestD = d; best = w.id; }
  }
  return best;
}

function buildBotMesh(scene, team) {
  const group = new THREE.Group();
  const color = TEAM_COLOR[team];
  const dark = TEAM_DARK[team];
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2 });
  const darkMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.8, metalness: 0.1 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a586, roughness: 0.8 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.2, metalness: 0.8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.36), suit);
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.3, 0.4), darkMat);
  chest.position.y = 1.12;
  group.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
  head.position.y = 1.58;
  head.castShadow = true;
  group.add(head);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), darkMat);
  helm.position.y = 1.6;
  group.add(helm);
  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.1), visor);
  visorMesh.position.set(0, 1.58, 0.19);
  group.add(visorMesh);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.26), darkMat);
  legL.position.set(-0.16, 0.25, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.7), darkMat);
  gun.position.set(0.3, 1.15, -0.2);
  group.add(gun);
  // Team beacon: small floating marker so teams read at a glance.
  const beacon = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.22, 4),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
  );
  beacon.position.y = 2.05;
  beacon.rotation.x = Math.PI;
  group.add(beacon);
  scene.add(group);
  return { group, body, head, beacon };
}

export function createBots(scene, map, ctx) {
  const bots = [];
  const rng = mulberry32(ctx.seed || 7);

  function spawnBot(team, index, round) {
    const spawn = map.spawns[team][index];
    const name = BOT_NAMES[team][index % BOT_NAMES[team].length];
    const parts = buildBotMesh(scene, team);
    const isAttacker = team === 'wardens';
    const roles = isAttacker
      ? ['planter', 'rush', 'mid']
      : ['holdA', 'holdB', 'mid', 'roam'];
    const role = roles[index % roles.length];
    const weaponId = round >= 3 && index % 2 === 0 ? 'longbow' : index === 0 ? 'rook' : 'p9';
    const bot = {
      id: `${team}-${index}`,
      team,
      name,
      role,
      pos: new THREE.Vector3(spawn.x, 0, spawn.z),
      yaw: spawn.yaw,
      hp: 100,
      armor: round >= 2 && index % 2 === 1,
      alive: true,
      weaponId,
      weapon: createWeaponState(weaponId),
      state: 'advance',
      path: [],
      pathIdx: 0,
      target: null, // { kind: 'player' | 'bot', ref, pos: Vector3 }
      targetPos: new THREE.Vector3(),
      lastSeen: new THREE.Vector3(),
      lostTimer: 0,
      thinkTimer: rng() * 0.15,
      burstLeft: 0,
      burstPause: 0,
      strafeDir: 1,
      strafeTimer: 0,
      channel: 0, // plant/defuse progress 0..1
      channelKind: null,
      assignedSite: null,
      hearPos: null,
      speed: 3.6,
      mesh: parts.group,
      bodyMesh: parts.body,
      headMesh: parts.head,
      beacon: parts.beacon,
      aimErrorBase: 0.045,
    };
    bot.bodyMesh.userData.fighter = bot;
    bot.bodyMesh.userData.part = 'body';
    bot.headMesh.userData.fighter = bot;
    bot.headMesh.userData.part = 'head';
    bot.mesh.position.copy(bot.pos);
    bot.mesh.rotation.y = bot.yaw;
    bots.push(bot);
    return bot;
  }

  function reset(round) {
    for (const b of bots) scene.remove(b.mesh);
    bots.length = 0;
    for (let i = 0; i < 3; i += 1) spawnBot('wardens', i, round);
    for (let i = 0; i < 4; i += 1) spawnBot('jackals', i, round);
    assignObjectives(round);
  }

  function assignObjectives(round) {
    // Attackers pick a site for the round; the planter carries the charge.
    const siteId = rng() < 0.5 ? 'A' : 'B';
    ctx.roundSite = siteId;
    const site = map.sites[siteId];
    const siteNode = siteId === 'A' ? 5 : 6;
    const otherNode = siteId === 'A' ? 6 : 5;
    for (const b of bots) {
      b.channel = 0;
      b.channelKind = null;
      b.state = 'advance';
      b.target = null;
      if (b.team === 'wardens') {
        if (b.role === 'planter') {
          b.assignedSite = siteId;
          b.path = bfsPath(map.adjacency, nearestNode(map.waypoints, b.pos.x, b.pos.z), siteNode);
        } else if (b.role === 'rush') {
          b.assignedSite = siteId === 'A' ? 'B' : 'A';
          b.path = bfsPath(map.adjacency, nearestNode(map.waypoints, b.pos.x, b.pos.z), otherNode);
        } else {
          b.path = bfsPath(map.adjacency, nearestNode(map.waypoints, b.pos.x, b.pos.z), 9);
        }
      } else {
        // Defenders: hold their site, mid, or roam between sites.
        if (b.role === 'holdA') b.path = bfsPath(map.adjacency, nearestNode(map.waypoints, b.pos.x, b.pos.z), 15);
        else if (b.role === 'holdB') b.path = bfsPath(map.adjacency, nearestNode(map.waypoints, b.pos.x, b.pos.z), 16);
        else if (b.role === 'mid') b.path = bfsPath(map.adjacency, nearestNode(map.waypoints, b.pos.x, b.pos.z), 9);
        else b.path = bfsPath(map.adjacency, nearestNode(map.waypoints, b.pos.x, b.pos.z), siteId === 'A' ? 16 : 15);
      }
      b.pathIdx = 0;
    }
    void site;
  }

  function aliveCount(team) {
    let n = 0;
    for (const b of bots) if (b.team === team && b.alive) n += 1;
    return n;
  }

  function visibleEnemy(bot) {
    // Nearest visible enemy: the player first, then enemy bots.
    let best = null;
    let bestD = 55;
    const candidates = [];
    if (ctx.playerAlive()) candidates.push({ kind: 'player', ref: ctx.player, pos: ctx.playerEye() });
    for (const other of bots) {
      if (other.team === bot.team || !other.alive) continue;
      _v1.set(other.pos.x, 1.4, other.pos.z);
      candidates.push({ kind: 'bot', ref: other, pos: _v1.clone() });
    }
    _v2.set(bot.pos.x, 1.5, bot.pos.z);
    for (const c of candidates) {
      const d = _v2.distanceTo(c.pos);
      if (d > bestD) continue;
      // Vision cone: 100 degrees forward, or very close.
      _v3.copy(c.pos).sub(_v2).normalize();
      const forwardX = -Math.sin(bot.yaw);
      const forwardZ = -Math.cos(bot.yaw);
      const dot = _v3.x * forwardX + _v3.z * forwardZ;
      if (d > 7 && dot < 0.35) continue;
      if (!ctx.hasLOS(_v2, c.pos)) continue;
      best = c;
      bestD = d;
    }
    return best;
  }

  function moveToward(bot, tx, tz, dt, speed) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return true;
    const stepLen = Math.min(len, speed * dt);
    const mx = (dx / len) * stepLen;
    const mz = (dz / len) * stepLen;
    collideMove(map.colliders, map.bounds, bot.pos, mx, mz, 0.42);
    bot.yaw = Math.atan2(-dx, -dz);
    return len - stepLen < 0.05;
  }

  function followPath(bot, dt, speed) {
    if (!bot.path.length || bot.pathIdx >= bot.path.length) return true;
    const node = map.waypoints[bot.path[bot.pathIdx]];
    if (moveToward(bot, node.x, node.z, dt, speed)) bot.pathIdx += 1;
    return bot.pathIdx >= bot.path.length;
  }

  function repath(bot, nodeId) {
    bot.path = bfsPath(map.adjacency, nearestNode(map.waypoints, bot.pos.x, bot.pos.z), nodeId);
    bot.pathIdx = 0;
  }

  function botFire(bot, now) {
    const def = WEAPONS[bot.weaponId];
    if (!canFire(def, bot.weapon, now)) return;
    fireWeapon(def, bot.weapon, now);
    // Aim error: base + round ramp (difficulty rises) + movement.
    const round = ctx.round();
    const err = Math.max(0.012, bot.aimErrorBase - (round - 1) * 0.003);
    _v1.copy(bot.targetPos);
    _v1.x += (rng() * 2 - 1) * err * 8;
    _v1.y += (rng() * 2 - 1) * err * 6;
    _v1.z += (rng() * 2 - 1) * err * 8;
    _v2.set(bot.pos.x, 1.45, bot.pos.z);
    ctx.botShoot(bot, _v2, _v1, def);
  }

  function stepBot(bot, dt, now) {
    if (!bot.alive) return;
    const def = WEAPONS[bot.weaponId];
    stepWeapon(def, bot.weapon, dt);
    bot.thinkTimer -= dt;
    bot.strafeTimer -= dt;
    bot.burstPause -= dt;

    const charge = ctx.charge();
    const isAttacker = bot.team === 'wardens';

    // --- Perception (throttled) ---
    if (bot.thinkTimer <= 0) {
      bot.thinkTimer = 0.15;
      const seen = visibleEnemy(bot);
      if (seen) {
        bot.target = seen;
        bot.targetPos.copy(seen.pos);
        bot.lastSeen.copy(seen.pos);
        bot.lostTimer = 0;
      } else if (bot.target) {
        bot.lostTimer += 0.15;
        if (bot.lostTimer > 3) bot.target = null;
      }
      // Hearing: a shot nearby pulls the bot toward it.
      if (ctx.lastShotPos && bot.pos.distanceTo(ctx.lastShotPos) < 25 && bot.state === 'advance') {
        bot.hearPos = ctx.lastShotPos.clone();
      }
    }

    // --- State transitions ---
    if (bot.target && bot.state !== 'engage' && bot.state !== 'defuse') {
      bot.state = 'engage';
      bot.burstLeft = 3 + Math.floor(rng() * 3);
    }
    if (bot.state === 'engage' && !bot.target) {
      bot.state = charge.planted && !isAttacker ? 'retake' : 'advance';
    }
    if (charge.planted) {
      if (!isAttacker && bot.state !== 'engage' && bot.state !== 'defuse') bot.state = 'retake';
      if (isAttacker && bot.state === 'advance') bot.state = 'hold';
    }

    // --- State behaviour ---
    if (bot.state === 'engage' && bot.target) {
      // Face the target, strafe, fire in bursts.
      bot.targetPos.copy(bot.target.kind === 'player' ? ctx.playerEye() : _v1.set(bot.target.ref.pos.x, 1.4, bot.target.ref.pos.z));
      const dx = bot.targetPos.x - bot.pos.x;
      const dz = bot.targetPos.z - bot.pos.z;
      bot.yaw = Math.atan2(-dx, -dz);
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = 0.7 + rng() * 0.8;
        bot.strafeDir = rng() < 0.5 ? -1 : 1;
      }
      const dist = Math.hypot(dx, dz);
      const want = dist > 16 ? 1 : dist < 6 ? -1 : 0;
      const sx = -dz / (dist || 1);
      const sz = dx / (dist || 1);
      const mx = (sx * bot.strafeDir + (dx / (dist || 1)) * want) * bot.speed * 0.55 * dt;
      const mz = (sz * bot.strafeDir + (dz / (dist || 1)) * want) * bot.speed * 0.55 * dt;
      collideMove(map.colliders, map.bounds, bot.pos, mx, mz, 0.42);
      if (bot.burstLeft > 0 && bot.burstPause <= 0) {
        botFire(bot, now);
        bot.burstLeft -= 1;
        if (bot.burstLeft <= 0) {
          bot.burstPause = 0.6 + rng() * 0.7;
          bot.burstLeft = 3 + Math.floor(rng() * 3);
        }
      }
    } else if (bot.state === 'advance' || bot.state === 'retake') {
      let arrived = false;
      if (bot.state === 'retake' && charge.planted) {
        const siteNode = charge.site === 'A' ? 5 : 6;
        if (!bot.path.length || bot.path[bot.path.length - 1] !== siteNode) repath(bot, siteNode);
        arrived = followPath(bot, dt, bot.speed * 1.15);
      } else {
        arrived = followPath(bot, dt, bot.speed);
      }
      if (arrived) {
        if (bot.state === 'retake') {
          bot.state = 'defuse';
        } else if (isAttacker && bot.role === 'planter' && !charge.planted) {
          bot.state = 'plant';
        } else if (bot.role === 'mid' || bot.role === 'roam') {
          // Wander: pick a new nearby objective node.
          const options = isAttacker ? [9, 7, 8, 3, 4] : [9, 7, 8, 15, 16];
          repath(bot, options[Math.floor(rng() * options.length)]);
        } else {
          bot.state = 'hold';
        }
      }
      if (bot.hearPos && bot.state === 'advance') {
        const d = Math.hypot(bot.hearPos.x - bot.pos.x, bot.hearPos.z - bot.pos.z);
        if (d < 3) bot.hearPos = null;
        else moveToward(bot, bot.hearPos.x, bot.hearPos.z, dt, bot.speed);
      }
    } else if (bot.state === 'plant') {
      // Channel the plant at the site; interrupted by death only.
      const site = map.sites[bot.assignedSite || ctx.roundSite];
      const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
      if (d > site.radius + 1) {
        bot.state = 'advance';
        bot.channel = 0;
      } else {
        bot.channel += dt / CONFIG.plantTime;
        bot.channelKind = 'plant';
        if (bot.channel >= 1) {
          bot.channel = 0;
          bot.channelKind = null;
          bot.state = 'hold';
          ctx.onPlanted(site.id, bot);
        }
      }
    } else if (bot.state === 'defuse') {
      const d = Math.hypot(charge.x - bot.pos.x, charge.z - bot.pos.z);
      if (!charge.planted || d > 3) {
        bot.state = charge.planted ? 'retake' : 'advance';
        bot.channel = 0;
      } else {
        bot.channel += dt / CONFIG.defuseTime;
        bot.channelKind = 'defuse';
        if (bot.channel >= 1) {
          bot.channel = 0;
          bot.channelKind = null;
          ctx.onDefused(bot);
        }
      }
    } else if (bot.state === 'hold') {
      // Hold position; slow scan by turning.
      bot.yaw += dt * 0.4;
    }

    // Sync mesh.
    bot.mesh.position.set(bot.pos.x, 0, bot.pos.z);
    bot.mesh.rotation.y = bot.yaw;
    bot.beacon.rotation.y += dt * 2;
    bot.beacon.position.y = 2.05 + Math.sin(now * 2 + bot.id.length) * 0.05;
  }

  return {
    bots,
    reset,
    aliveCount,
    step(dt, now) {
      for (const b of bots) stepBot(b, dt, now);
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.hp -= amount;
      if (bot.hp <= 0) {
        bot.hp = 0;
        bot.alive = false;
        bot.mesh.visible = false;
        bot.state = 'dead';
        return true;
      }
      // Getting shot makes a bot fall back when badly hurt.
      if (bot.hp < 30 && bot.state !== 'engage') {
        bot.state = 'advance';
        repath(bot, bot.team === 'wardens' ? 0 : 14);
      }
      return false;
    },
    hitMeshes() {
      const out = [];
      for (const b of bots) {
        if (!b.alive) continue;
        out.push(b.bodyMesh, b.headMesh);
      }
      return out;
    },
  };
}
