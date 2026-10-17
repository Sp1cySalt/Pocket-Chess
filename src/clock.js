// Chess clock on performance.now() (monotonic: unaffected by system clock changes).
export class Clock {
  constructor(minutes, incSeconds, onTick, onFlag) {
    this.inc = incSeconds * 1000;
    this.left = { w: minutes * 60000, b: minutes * 60000 };
    this.turn = null;      // whose clock is current; null until White's first move
    this.running = false;
    this.t0 = 0;
    this.timer = 0;
    this.onTick = onTick;
    this.onFlag = onFlag;
  }
  now(c) {
    const used = this.running && this.turn === c ? performance.now() - this.t0 : 0;
    return Math.max(0, this.left[c] - used);
  }
  resume() {
    if (!this.turn || this.running) return;
    this.running = true;
    this.t0 = performance.now();
    this.timer = setInterval(() => this.tick(), 100);
  }
  pause() {
    if (!this.running) return;
    this.left[this.turn] = this.now(this.turn); // bank elapsed time
    this.running = false;
    clearInterval(this.timer);
  }
  // Call after every move: adds increment to the mover, then starts the opponent's clock.
  switchTo(next) {
    this.pause();
    if (this.turn) this.left[this.turn] += this.inc;
    this.turn = next;
    this.resume();
  }
  tick() {
    this.onTick();
    if (this.now(this.turn) <= 0) {
      const loser = this.turn;
      this.pause();
      this.onFlag(loser);
    }
  }
}

export function fmt(ms) {
  if (ms < 10000) return (Math.floor(ms / 100) / 10).toFixed(1);
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
