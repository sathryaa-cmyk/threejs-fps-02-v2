// audio.js — all sound is synthesized with WebAudio. No audio files, no network.
// Gunshots, reload clicks, footsteps, hit ticks, round horn, bomb beeps, wind.
export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.windGain = null; this.enabled = false;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.enabled = true; this.startWind();
    } catch (e) { this.enabled = false; }
  }
  startWind() {
    // Looping filtered noise = desert wind.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 0.4;
    this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0.045;
    src.connect(f); f.connect(this.windGain); this.windGain.connect(this.master); src.start();
  }
  noiseBurst(dur, freq, gain, type = 'lowpass') {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  }
  tone(freq, dur, gain, type = 'sine', slideTo = 0) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  shot(kind) {
    // kind: rifle | smg | sniper | shotgun | pistol
    const map = { rifle: [0.16, 1400, 0.5], smg: [0.1, 1800, 0.38], sniper: [0.35, 900, 0.65], shotgun: [0.28, 700, 0.6], pistol: [0.12, 1600, 0.42] };
    const [dur, freq, gain] = map[kind] || map.rifle;
    this.noiseBurst(dur, freq, gain);
    this.tone(kind === 'sniper' ? 110 : 170, 0.09, 0.25, 'square', 55);
  }
  dryFire() { this.tone(1200, 0.04, 0.12, 'square'); }
  reload() { this.tone(900, 0.05, 0.15, 'square'); setTimeout(() => this.tone(650, 0.05, 0.15, 'square'), 180); setTimeout(() => this.tone(1100, 0.04, 0.12, 'square'), 420); }
  step(run) { this.noiseBurst(0.06, 500, run ? 0.1 : 0.06, 'bandpass'); }
  hit() { this.tone(2100, 0.05, 0.18, 'sine'); }
  headshot() { this.tone(2600, 0.07, 0.22, 'sine'); this.tone(1800, 0.09, 0.15, 'sine'); }
  kill() { this.tone(520, 0.12, 0.2, 'triangle', 780); }
  hurt() { this.tone(140, 0.15, 0.3, 'sawtooth', 70); }
  horn() { this.tone(196, 0.7, 0.25, 'sawtooth'); this.tone(294, 0.7, 0.2, 'sawtooth'); this.tone(392, 0.5, 0.12, 'triangle'); }
  beep(high) { this.tone(high ? 1250 : 880, 0.09, 0.2, 'sine'); }
  plant() { this.tone(440, 0.1, 0.2, 'square'); setTimeout(() => this.tone(660, 0.12, 0.2, 'square'), 120); }
  defuse() { this.tone(660, 0.08, 0.18, 'square'); }
  explode() { this.noiseBurst(1.1, 300, 0.9); this.tone(60, 0.9, 0.5, 'sine', 28); }
  buy() { this.tone(880, 0.07, 0.18, 'triangle'); setTimeout(() => this.tone(1320, 0.09, 0.18, 'triangle'), 90); }
  click() { this.tone(1500, 0.03, 0.1, 'square'); }
}
