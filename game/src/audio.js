// SHARDLINE — all sound is synthesized with WebAudio. No audio files, no network.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function noise(dur, filterFreq, gainVal, type = 'lowpass') {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  function tone(freq, dur, gainVal, type = 'square', slideTo = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  const WEAPON_SOUND = {
    p9: { noiseDur: 0.09, freq: 1800, gain: 0.5, toneFreq: 220, toneDur: 0.07 },
    rook: { noiseDur: 0.07, freq: 2400, gain: 0.42, toneFreq: 300, toneDur: 0.05 },
    longbow: { noiseDur: 0.12, freq: 1400, gain: 0.55, toneFreq: 160, toneDur: 0.09 },
    needle: { noiseDur: 0.22, freq: 900, gain: 0.7, toneFreq: 110, toneDur: 0.16 },
  };

  return {
    resume,
    shot(weaponId, distant = false) {
      const s = WEAPON_SOUND[weaponId] || WEAPON_SOUND.p9;
      const g = distant ? s.gain * 0.35 : s.gain;
      noise(s.noiseDur, s.freq, g);
      tone(s.toneFreq, s.toneDur, g * 0.6, 'square', s.toneFreq * 0.4);
    },
    dryFire() { tone(1200, 0.03, 0.15, 'square'); },
    reload() {
      tone(500, 0.05, 0.2, 'square');
      setTimeout(() => tone(700, 0.05, 0.2, 'square'), 160);
      setTimeout(() => tone(900, 0.06, 0.25, 'square'), 420);
    },
    hit(headshot) {
      tone(headshot ? 2400 : 1800, 0.05, 0.3, 'sine');
    },
    kill() {
      tone(1800, 0.05, 0.3, 'sine');
      setTimeout(() => tone(2400, 0.08, 0.3, 'sine'), 70);
    },
    hurt() { tone(140, 0.15, 0.4, 'sawtooth', 70); },
    step() { noise(0.05, 500, 0.08); },
    beep(final = false) { tone(final ? 1600 : 1100, final ? 0.3 : 0.09, 0.3, 'sine'); },
    plantDone() {
      tone(880, 0.12, 0.35, 'sine');
      setTimeout(() => tone(1320, 0.2, 0.35, 'sine'), 130);
    },
    explosion() {
      noise(0.7, 300, 0.9);
      tone(60, 0.6, 0.6, 'sine', 30);
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.3, 'triangle'), i * 140));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.25, 0.3, 'triangle'), i * 160));
    },
    buy() { tone(1000, 0.06, 0.25, 'sine'); setTimeout(() => tone(1400, 0.08, 0.25, 'sine'), 70); },
    denied() { tone(220, 0.12, 0.3, 'square', 160); },
  };
}
