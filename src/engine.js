// Minimal UCI wrapper around the Stockfish worker. Commands run strictly one at a time.
export class Engine {
  constructor(url) {
    this.w = new Worker(url);
    this.on = null;
    this.w.onmessage = (e) => this.on?.(String(e.data));
    // Rejects as soon as the worker script fails to load, so the UI can show the real reason.
    this.dead = new Promise((_, rej) => {
      this.w.onerror = (e) => {
        console.error('Engine worker error:', e.message || e);
        rej(new Error(`engine failed to load (${e.message || url}). Check public/engine/`));
      };
    });
    this.dead.catch(() => {});
    this.q = Promise.resolve();
    this.ready = false;
    this.run(['uci'], 'uciok').then(() => { this.ready = true; console.info('Stockfish: uciok'); });
    this.run(['setoption name Threads value 1', 'setoption name Hash value 16', 'isready'], 'readyok');
  }
  // Send commands, resolve with every output line up to and including one starting with `until`.
  run(cmds, until) {
    const p = this.q.then(() => new Promise((res) => {
      const out = [];
      this.on = (l) => { out.push(l); if (l.startsWith(until)) { this.on = null; res(out); } };
      cmds.forEach((c) => this.w.postMessage(c));
    }));
    this.q = p.catch(() => {});
    return p;
  }
  stop() { this.w.postMessage('stop'); }
}
