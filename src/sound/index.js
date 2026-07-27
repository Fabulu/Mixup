// Web Audio glue: run the driver on its own clock and render the APU.
//
// The driver is on the TIMER interrupt at 4096/69 = 59.36 Hz, NOT VBlank --
// close to the frame rate but not equal to it. Driving it from
// requestAnimationFrame would tie the music's tempo to the display's refresh
// and make it stutter whenever a frame is late, so it runs off the audio
// clock instead, counting CPU cycles between ticks the way the hardware does.

import { APU, CPU_HZ } from './apu.js';
import { loadSoundData, createDriver, request, tick, stopAll, REQ_PLAY, REQ_STOP }
  from './driver.js';

export { REQ_PLAY, REQ_STOP };

const BUFFER = 2048;

export class Sound {
  constructor() {
    this.ctx = null;
    this.apu = null;
    this.drv = null;
    this.node = null;
    this.enabled = false;
    this.pending = [];
    this.cyclesToTick = 0;
  }

  /**
   * Browsers refuse to start audio without a user gesture, so this must be
   * called from a click or key handler. Safe to call more than once.
   */
  async start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;

    let data;
    try { data = await loadSoundData(); } catch { return false; }

    this.ctx = new AC();
    this.apu = new APU(this.ctx.sampleRate);
    this.drv = createDriver(data);
    // TMA $BB with the 4096 Hz clock select: one driver tick every 69 timer
    // ticks, i.e. every CPU_HZ/(4096/69) cycles.
    this.cyclesPerTick = CPU_HZ / data.tickHz;

    // ScriptProcessor rather than an AudioWorklet: the worklet would need the
    // APU shipped as a separate module over a URL, and this runs comfortably
    // inside the callback budget. Revisit if it ever glitches.
    const node = this.ctx.createScriptProcessor(BUFFER, 0, 2);
    node.onaudioprocess = (e) => this.render(e);
    node.connect(this.ctx.destination);
    this.node = node;
    this.enabled = true;

    for (const r of this.pending) request(this.drv, r.id, r.mask);
    this.pending.length = 0;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return true;
  }

  /** Queue a ROM sound id. Works before start(); the request is held. */
  play(id, mask = REQ_PLAY) {
    if (!this.drv) {
      if (this.pending.length < 4) this.pending.push({ id, mask });
      return;
    }
    request(this.drv, id, mask);
  }

  stop() { if (this.drv) stopAll(this.drv); }

  async setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) { if (on) await this.start(); return; }
    if (on) await this.ctx.resume();
    else await this.ctx.suspend();
  }

  /**
   * Drain the game's sound queue into the driver. Called once per game frame;
   * the driver itself is NOT stepped here -- that happens on the audio clock.
   */
  pump(state) {
    if (!state.sound) return;
    const q = state.sound.queue;
    while (q.length) {
      const r = q.shift();
      this.play(r.id, r.mask ?? REQ_PLAY);
    }
  }

  render(e) {
    const out = e.outputBuffer;
    const L = out.getChannelData(0);
    const R = out.getChannelData(1);
    if (!this.enabled) { L.fill(0); R.fill(0); return; }

    const perSample = CPU_HZ / this.ctx.sampleRate;
    let i = 0;
    while (i < L.length) {
      // How many samples until the next driver tick is due?
      const untilTick = Math.max(1, Math.ceil(this.cyclesToTick / perSample));
      const n = Math.min(untilTick, L.length - i);
      this.apu.render(L.subarray(i, i + n), R.subarray(i, i + n), n);
      this.cyclesToTick -= n * perSample;
      i += n;
      if (this.cyclesToTick <= 0) {
        this.cyclesToTick += this.cyclesPerTick;
        for (const [addr, v] of tick(this.drv)) this.apu.write(addr, v);
      }
    }
  }
}
