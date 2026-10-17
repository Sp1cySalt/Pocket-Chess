// Lichess win% from centipawns (side to move's point of view).
export const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);

// Buckets by win% lost: [Best/Excellent <=2, Good <=5, Inaccuracy <=10, Mistake <=20, Blunder >20].
// PLACEHOLDER weights: linear from 400 Elo to 1320. The Python calibration script will replace this.
function weights(elo) {
  const t = Math.min(1, Math.max(0, (elo - 400) / 920));
  const L = (a, b) => a + (b - a) * t;
  return [L(20, 65), L(25, 22), L(20, 8), L(20, 4), L(15, 1)];
}
const bucket = (loss) => (loss <= 2 ? 0 : loss <= 5 ? 1 : loss <= 10 ? 2 : loss <= 20 ? 3 : 4);

// Returns a UCI move like "e2e4" or "e7e8q".
export async function chooseMove(engine, fen, elo, ms) {
  // 1320+ : let Stockfish weaken itself.
  if (elo >= 1320) {
    const out = await engine.run([
      'setoption name MultiPV value 1',
      `setoption name UCI_LimitStrength value ${elo < 3190}`,
      `setoption name UCI_Elo value ${elo}`,
      `position fen ${fen}`,
      `go movetime ${ms}`,
    ], 'bestmove');
    return out.at(-1).split(' ')[1];
  }

  // Below 1320: take the top moves, then pick one with a human-like error profile.
  const out = await engine.run([
    'setoption name UCI_LimitStrength value false',
    'setoption name MultiPV value 8',
    `position fen ${fen}`,
    'go movetime 400',
  ], 'bestmove');
  const byPv = new Map();
  for (const l of out) {
    const m = /multipv (\d+) .*?score (cp|mate) (-?\d+).* pv (\S+)/.exec(l);
    if (m) byPv.set(+m[1], { move: m[4], cp: m[2] === 'cp' ? +m[3] : Math.sign(+m[3]) * 10000 });
  }
  const cands = [...byPv.values()];
  if (!cands.length) return out.at(-1).split(' ')[1];
  const top = Math.max(...cands.map((c) => winPct(c.cp)));
  const groups = [[], [], [], [], []];
  for (const c of cands) groups[bucket(top - winPct(c.cp))].push(c);
  const w = weights(elo);
  let r = Math.random() * groups.reduce((s, g, i) => s + (g.length ? w[i] : 0), 0);
  for (let i = 0; i < 5; i++) {
    if (!groups[i].length) continue;
    r -= w[i];
    if (r <= 0) return groups[i][Math.floor(Math.random() * groups[i].length)].move;
  }
  return cands[0].move;
}
