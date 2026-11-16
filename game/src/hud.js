// SHARDLINE — HUD: DOM overlays and readouts. One job: show game state.
// The game owns state; this module only writes it to the page.
import { BUY_ITEMS } from './rounds.js';

export function createHud(doc) {
  const $ = (id) => doc.getElementById(id);
  const els = {
    hud: $('hud'),
    hp: $('hp-value'),
    armor: $('armor-value'),
    money: $('money-value'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    ammoBox: $('ammo'),
    weaponName: $('weapon-name'),
    timer: $('timer-value'),
    scoreW: $('score-w'),
    scoreJ: $('score-j'),
    aliveW: $('alive-w'),
    aliveJ: $('alive-j'),
    roundLabel: $('round-label'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    damageDir: $('damage-dir'),
    vignette: $('vignette'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    buyTimer: $('buy-timer'),
    buyMenu: $('buy-menu'),
    buyList: $('buy-list'),
    buyMoney: $('buy-money'),
    plantBar: $('plant-bar'),
    plantFill: $('plant-fill'),
    plantLabel: $('plant-label'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    playBtn: $('play'),
    keysList: $('keys-list'),
    scope: $('scope'),
    toast: $('toast'),
  };

  let toastTimer = 0;

  function setText(el, v) {
    if (el && el.textContent !== String(v)) el.textContent = String(v);
  }

  function show(el, on) {
    if (el) el.hidden = !on;
  }

  return {
    els,
    setHealth(hp, armor) {
      setText(els.hp, Math.max(0, Math.ceil(hp)));
      setText(els.armor, armor ? 'ARMOR' : '—');
      if (els.vignette) els.vignette.style.opacity = hp < 35 ? String((35 - hp) / 35 * 0.85) : '0';
    },
    setMoney(m) { setText(els.money, '$' + m); setText(els.buyMoney, '$' + m); },
    setAmmo(mag, reserve, name) {
      setText(els.ammoMag, mag);
      setText(els.ammoReserve, '/ ' + reserve);
      setText(els.weaponName, name);
      if (els.ammoBox) els.ammoBox.classList.toggle('empty', mag === 0);
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(els.timer, Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'));
      if (els.timer) els.timer.classList.toggle('urgent', seconds <= 10 && phase === 'live');
    },
    setScore(w, j, round) {
      setText(els.scoreW, w);
      setText(els.scoreJ, j);
      setText(els.roundLabel, 'ROUND ' + round + ' / 12');
    },
    setAlive(w, j) {
      setText(els.aliveW, w + ' alive');
      setText(els.aliveJ, j + ' alive');
    },
    setCrosshairSpread(px) {
      if (els.crosshair) els.crosshair.style.setProperty('--gap', px + 'px');
    },
    hitMarker(kill, ms = 120) {
      if (!els.hitmarker) return;
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', !!kill);
      clearTimeout(this._hitT);
      this._hitT = setTimeout(() => els.hitmarker.classList.remove('on', 'kill'), ms);
    },
    damageFrom(angleDeg) {
      if (!els.damageDir) return;
      els.damageDir.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg)`;
      els.damageDir.classList.add('on');
      clearTimeout(this._dmgT);
      this._dmgT = setTimeout(() => els.damageDir.classList.remove('on'), 600);
    },
    killFeed(text) {
      if (!els.killfeed) return;
      const div = doc.createElement('div');
      div.textContent = text;
      els.killfeed.prepend(div);
      while (els.killfeed.children.length > 5) els.killfeed.removeChild(els.killfeed.lastChild);
      setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 6000);
    },
    banner(title, sub, ms = 2600) {
      setText(els.bannerTitle, title);
      setText(els.bannerSub, sub || '');
      show(els.banner, true);
      clearTimeout(this._bannerT);
      this._bannerT = setTimeout(() => show(els.banner, false), ms);
    },
    hideBanner() { show(els.banner, false); },
    toast(msg) {
      setText(els.toast, msg);
      show(els.toast, true);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => show(els.toast, false), 2200);
    },
    showBuy(open, money) {
      show(els.buyMenu, open);
      if (open) {
        setText(els.buyMoney, '$' + money);
        if (els.buyList && !els.buyList.children.length) {
          for (const item of BUY_ITEMS) {
            const row = doc.createElement('button');
            row.type = 'button';
            row.className = 'buy-row';
            row.dataset.item = item.id;
            row.innerHTML = `<span class="buy-key">${item.id === 'armor' ? '5' : item.id === 'grenade' ? '6' : BUY_ITEMS.indexOf(item) + 1}</span><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
            els.buyList.appendChild(row);
          }
        }
      }
    },
    setBuyTimer(s) { setText(els.buyTimer, Math.max(0, Math.ceil(s)) + 's'); },
    onBuyClick(fn) {
      if (els.buyList) els.buyList.addEventListener('click', (e) => {
        const row = e.target.closest('.buy-row');
        if (row) fn(row.dataset.item);
      });
    },
    showPlant(progress, label) {
      show(els.plantBar, progress > 0 && progress < 1);
      if (els.plantFill) els.plantFill.style.width = Math.round(progress * 100) + '%';
      setText(els.plantLabel, label || '');
    },
    showOverlay(kind, data) {
      // kind: title | paused | roundEnd | matchEnd | dead
      show(els.overlay, true);
      const t = els.overlayTitle;
      const c = els.overlayCopy;
      const btn = els.playBtn;
      if (kind === 'title') {
        setText(t, 'SHARDLINE');
        setText(c, 'Foundry Nine. Four Wardens against four Jackals. Plant the shard charge at Crane Yard or Furnace Hall — or eliminate the other team. First to 7 rounds takes the match.');
        setText(btn, 'Click to play');
        show(els.keysList, true);
      } else if (kind === 'paused') {
        setText(t, 'Paused');
        setText(c, 'Pointer lock released. Click resume to keep playing.');
        setText(btn, 'Resume');
        show(els.keysList, false);
      } else if (kind === 'roundEnd') {
        setText(t, data.winner === 'wardens' ? 'ROUND WON' : 'ROUND LOST');
        setText(c, data.reason + ' — Wardens ' + data.scoreW + ' : ' + data.scoreJ + ' Jackals. Next round starts soon.');
        setText(btn, 'Continue');
        show(els.keysList, false);
      } else if (kind === 'matchEnd') {
        const w = data.winner;
        setText(t, w === 'wardens' ? 'MATCH WON' : w === 'jackals' ? 'MATCH LOST' : 'MATCH DRAWN');
        setText(c, 'Final score — Wardens ' + data.scoreW + ' : ' + data.scoreJ + ' Jackals. Kills: ' + data.kills + '. Play again to run it back.');
        setText(btn, 'Play again');
        show(els.keysList, false);
      } else if (kind === 'dead') {
        setText(t, 'YOU ARE DOWN');
        setText(c, 'Your team fights on. Spectate until the round ends.');
        setText(btn, 'Wait for round end');
        show(els.keysList, false);
      }
    },
    hideOverlay() { show(els.overlay, false); },
    showHud(on) { show(els.hud, on); },
    showScope(on) { show(els.scope, on); },
    onPlay(fn) { if (els.playBtn) els.playBtn.addEventListener('click', fn); },
  };
}
