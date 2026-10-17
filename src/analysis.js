// Position evaluation + move classification (thresholds = win% lost by the mover).
export async function evaluate(engine, fen, depth = 12) {
  const out = await engine.run([
    'setoption name UCI_LimitStrength value false',
    'setoption name MultiPV value 1',
    `position fen ${fen}`,
    `go depth ${depth}`,
  ], 'bestmove');
  let cp = 0; // from the side to move's point of view; the last score line is the deepest
  for (const l of out) {
    const m = /score (cp|mate) (-?\d+)/.exec(l);
    if (m) cp = m[1] === 'cp' ? +m[2] : Math.sign(+m[2]) * 10000;
  }
  return { cp, best: out.at(-1).split(' ')[1] };
}

export const classify = (loss, isBest) =>
  isBest ? 'Best'
  : loss < 2 ? 'Excellent'
  : loss < 5 ? 'Good'
  : loss < 10 ? 'Inaccuracy'
  : loss < 20 ? 'Mistake'
  : 'Blunder';
