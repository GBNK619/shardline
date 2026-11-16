// SHARDLINE — rounds, economy, the buy menu and the shard charge.
// One state object, one job: what phase the match is in and what it is worth.
import { CONFIG } from './config.js';
import { WEAPONS, ARMOR, GRENADE } from './weapons.js';

export function createRounds(events) {
  const R = {
    phase: 'title', // title | buy | live | roundEnd | matchEnd
    round: 1,
    scoreW: 0,
    scoreJ: 0,
    money: CONFIG.startMoney,
    buyTimer: CONFIG.buyTime,
    roundTimer: CONFIG.roundTime,
    charge: { planted: false, site: null, x: 0, z: 0, fuse: 0 },
    plantProgress: 0, // player's own plant channel, 0..1
    plantSite: null,
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    kills: 0,
    deaths: 0,
  };

  function startMatch() {
    R.round = 1;
    R.scoreW = 0;
    R.scoreJ = 0;
    R.money = CONFIG.startMoney;
    R.matchWinner = null;
    startRound();
  }

  function startRound() {
    R.phase = 'buy';
    R.buyTimer = CONFIG.buyTime;
    R.roundTimer = CONFIG.roundTime;
    R.charge = { planted: false, site: null, x: 0, z: 0, fuse: 0 };
    R.plantProgress = 0;
    R.plantSite = null;
    R.roundWinner = null;
    R.roundReason = '';
    events.onRoundStart(R.round);
  }

  function beginLive() {
    if (R.phase !== 'buy') return;
    R.phase = 'live';
    events.onLive();
  }

  function endRound(winner, reason) {
    if (R.phase !== 'live' && R.phase !== 'buy') return;
    R.phase = 'roundEnd';
    R.roundWinner = winner;
    R.roundReason = reason;
    if (winner === 'wardens') {
      R.scoreW += 1;
      R.money += CONFIG.winReward;
    } else {
      R.scoreJ += 1;
      R.money += CONFIG.lossReward;
    }
    events.onRoundEnd(winner, reason, R.scoreW, R.scoreJ);
    // Match end?
    if (R.scoreW >= CONFIG.winRounds || R.scoreJ >= CONFIG.winRounds || R.round >= CONFIG.maxRounds) {
      R.matchWinner = R.scoreW > R.scoreJ ? 'wardens' : R.scoreJ > R.scoreW ? 'jackals' : 'draw';
      R.phase = 'matchEnd';
      events.onMatchEnd(R.matchWinner, R.scoreW, R.scoreJ);
    }
  }

  function nextRound() {
    if (R.phase === 'matchEnd') return;
    R.round += 1;
    startRound();
  }

  function tryBuy(player, itemId) {
    if (R.phase !== 'buy') return { ok: false, reason: 'Buy phase is over' };
    if (itemId === 'armor') {
      if (player.armor) return { ok: false, reason: 'Armor already owned' };
      if (R.money < ARMOR.price) return { ok: false, reason: 'Not enough money' };
      R.money -= ARMOR.price;
      player.armor = true;
      events.onBuy(ARMOR.name);
      return { ok: true };
    }
    if (itemId === 'grenade') {
      if (player.grenades >= 1) return { ok: false, reason: 'Already carrying a grenade' };
      if (R.money < GRENADE.price) return { ok: false, reason: 'Not enough money' };
      R.money -= GRENADE.price;
      player.grenades += 1;
      events.onBuy(GRENADE.name);
      return { ok: true };
    }
    const def = WEAPONS[itemId];
    if (!def) return { ok: false, reason: 'Unknown item' };
    if (player.weaponId === itemId) return { ok: false, reason: 'Already equipped' };
    if (R.money < def.price) return { ok: false, reason: 'Not enough money' };
    R.money -= def.price;
    player.weaponId = itemId;
    events.onBuy(def.name);
    return { ok: true };
  }

  function addKillReward() {
    R.money += CONFIG.killReward;
    R.kills += 1;
  }

  function addPlantReward() {
    R.money += CONFIG.plantReward;
  }

  function plantCharge(siteId, site) {
    R.charge = { planted: true, site: siteId, x: site.x, z: site.z, fuse: CONFIG.fuseTime };
    events.onPlanted(siteId);
  }

  function defuseCharge() {
    R.charge = { planted: false, site: null, x: 0, z: 0, fuse: 0 };
    events.onDefused();
  }

  return {
    state: R,
    startMatch,
    startRound,
    beginLive,
    endRound,
    nextRound,
    tryBuy,
    addKillReward,
    addPlantReward,
    plantCharge,
    defuseCharge,
  };
}

export const BUY_ITEMS = [
  { id: 'p9', name: 'P9 Sidearm', desc: 'Accurate pistol. Free.', price: 0 },
  { id: 'rook', name: 'Rook SMG', desc: 'Fast, high spread, close range.', price: 900 },
  { id: 'longbow', name: 'Longbow AR', desc: 'All-round rifle. Tap fire to stay accurate.', price: 2700 },
  { id: 'needle', name: 'Needle Marksman', desc: 'Scoped. One headshot, one kill.', price: 4500 },
  { id: 'armor', name: 'Vest Armor', desc: 'Halves body damage.', price: 650 },
  { id: 'grenade', name: 'Frag Grenade', desc: 'Throw with G. Blast radius 6 m.', price: 300 },
];
