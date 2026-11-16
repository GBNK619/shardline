// SHARDLINE — weapons: five guns + armor + a frag grenade.
// Accuracy counts more than speed: spread blooms with movement and sustained
// fire, the first shots are near-perfect, headshots pay x3.
import * as THREE from 'three';
import { PALETTE } from './config.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', key: '1', price: 0,
    damage: 34, headMult: 3, mag: 12, reserve: 48, interval: 0.18,
    auto: false, reloadTime: 1.1, spread: 0.006, moveSpread: 0.02,
    bloom: 0.004, maxBloom: 0.03, recoil: 0.010, range: 60, zoom: 1,
  },
  rook: {
    id: 'rook', name: 'Rook SMG', key: '2', price: 900,
    damage: 22, headMult: 3, mag: 30, reserve: 90, interval: 0.09,
    auto: true, reloadTime: 1.6, spread: 0.016, moveSpread: 0.03,
    bloom: 0.006, maxBloom: 0.05, recoil: 0.008, range: 40, zoom: 1,
  },
  longbow: {
    id: 'longbow', name: 'Longbow AR', key: '3', price: 2700,
    damage: 30, headMult: 3, mag: 25, reserve: 75, interval: 0.12,
    auto: true, reloadTime: 2.0, spread: 0.004, moveSpread: 0.022,
    bloom: 0.005, maxBloom: 0.045, recoil: 0.012, range: 80, zoom: 1,
  },
  needle: {
    id: 'needle', name: 'Needle Marksman', key: '4', price: 4500,
    damage: 90, headMult: 3, mag: 5, reserve: 15, interval: 1.15,
    auto: false, reloadTime: 2.6, spread: 0.001, moveSpread: 0.05,
    bloom: 0.002, maxBloom: 0.01, recoil: 0.035, range: 120, zoom: 2.2,
  },
};

export const ARMOR = { id: 'armor', name: 'Vest Armor', key: '5', price: 650 };
export const GRENADE = { id: 'grenade', name: 'Frag Grenade', key: '6', price: 300 };

// One shared weapon state object per fighter; the game owns it, this module
// only mutates it through these helpers.
export function createWeaponState(weaponId) {
  const def = WEAPONS[weaponId];
  return {
    id: weaponId,
    mag: def.mag,
    reserve: def.reserve,
    bloom: 0,
    cooldown: 0,
    reloading: 0, // seconds left, 0 = not reloading
    lastShot: -99,
  };
}

export function currentSpread(def, state, moving, airborne, crouching) {
  let s = def.spread + state.bloom;
  if (moving) s += def.moveSpread;
  if (airborne) s += 0.035;
  if (crouching) s *= 0.7;
  return s;
}

export function canFire(def, state, now) {
  if (state.reloading > 0) return false;
  if (state.mag <= 0) return false;
  return now - state.lastShot >= def.interval;
}

export function fireWeapon(def, state, now) {
  state.mag -= 1;
  state.lastShot = now;
  state.bloom = Math.min(def.maxBloom, state.bloom + def.bloom);
  return true;
}

export function stepWeapon(def, state, dt) {
  state.bloom = Math.max(0, state.bloom - dt * 0.06);
  if (state.reloading > 0) {
    state.reloading -= dt;
    if (state.reloading <= 0) {
      state.reloading = 0;
      const need = def.mag - state.mag;
      const take = Math.min(need, state.reserve);
      state.mag += take;
      state.reserve -= take;
    }
  }
}

export function startReload(def, state) {
  if (state.reloading > 0 || state.mag >= def.mag || state.reserve <= 0) return false;
  state.reloading = def.reloadTime;
  return true;
}

// Low-poly viewmodel: boxes on the camera, bobbing with the walk cycle.
// Built once per fighter view; the muzzle tip is exposed for tracers.
export function createViewmodel(camera, weaponId) {
  const group = new THREE.Group();
  const def = WEAPONS[weaponId];
  const colors = {
    p9: 0x3a3f46, rook: 0x4a3f30, longbow: 0x2f3a2f, needle: 0x37424e,
  };
  const bodyMat = new THREE.MeshStandardMaterial({ color: colors[weaponId] || 0x3a3f46, roughness: 0.5, metalness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.6, metalness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.4, metalness: 0.5, emissive: PALETTE.accent, emissiveIntensity: 0.25 });

  const len = weaponId === 'needle' ? 0.85 : weaponId === 'p9' ? 0.32 : 0.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, len), bodyMat);
  group.add(body);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), darkMat);
  grip.position.set(0, -0.12, len * 0.28);
  grip.rotation.x = 0.3;
  group.add(grip);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), darkMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -len / 2 - 0.06);
  group.add(barrel);
  if (weaponId === 'needle') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 10), darkMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.09, -0.05);
    group.add(scope);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 10), accentMat);
    lens.position.set(0, 0.09, -0.17);
    lens.rotation.y = Math.PI;
    group.add(lens);
  }
  if (weaponId === 'longbow' || weaponId === 'rook') {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.08), darkMat);
    mag.position.set(0, -0.13, -0.05);
    mag.rotation.x = 0.15;
    group.add(mag);
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.015, len * 0.5), accentMat);
  stripe.position.set(0, 0.068, -len * 0.1);
  group.add(stripe);

  // Muzzle flash: a small additive plane + light, hidden unless firing.
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMat);
  flash.position.set(0, 0.02, -len / 2 - 0.16);
  group.add(flash);
  const flashLight = new THREE.PointLight(0xffc861, 0, 6, 2);
  flashLight.position.set(0, 0, -len / 2 - 0.2);
  group.add(flashLight);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -len / 2 - 0.14);
  group.add(muzzle);

  group.position.set(0.28, -0.24, -0.5);
  camera.add(group);

  let flashTimer = 0;
  return {
    group,
    muzzle,
    def,
    setWeapon(nextId) {
      // Rebuild is cheap and only happens on buy/switch, never per frame.
      camera.remove(group);
      const next = createViewmodel(camera, nextId);
      return next;
    },
    triggerFlash() {
      flashTimer = 0.05;
      flashMat.opacity = 0.95;
      flashLight.intensity = 14;
      flash.rotation.z = Math.random() * Math.PI;
    },
    step(dt, walkPhase, moving, recoilKick) {
      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0) {
          flashMat.opacity = 0;
          flashLight.intensity = 0;
        }
      }
      const bob = moving ? Math.sin(walkPhase * 2) * 0.012 : 0;
      const sway = moving ? Math.cos(walkPhase) * 0.008 : 0;
      group.position.set(0.28 + sway, -0.24 + bob, -0.5 + recoilKick * 0.12);
      group.rotation.x = recoilKick * 0.35;
    },
  };
}
