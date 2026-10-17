import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';
import { Clock, fmt } from './clock.js';
import { Engine } from './engine.js';
import { chooseMove, winPct } from './bot.js';
import { evaluate, classify } from './analysis.js';
import { loadPuzzles } from './puzzle-cache.js';  

const $ = (id) => document.getElementById(id);
const PRESETS = { Bullet: [[1, 0], [2, 1]], Blitz: [[3, 0], [3, 2], [5, 0]], Rapid: [[10, 0], [15, 10]] };

let chess, cg, clock, tc = [10, 0], over = true, flipped = false;
let engine, G = null, botColor = null, botElo = 1200, gameId = 0, pending = null;
const mode = { bot: false, elo: 1200, side: 'w', feedback: true }; // side = the human's colour ('r' = random)

navigator.storage?.persist?.(); // ask iOS not to purge our storage

// ---------- appearance: board themes + piece sets ----------
const BOARDS = [
  { id: 'wood',      name: 'Wood',      light: '#f0d9b5', dark: '#b58863' },
  { id: 'marble',    name: 'Marble',    light: '#eceae6', dark: '#7d7d7d' },
  { id: 'green',     name: 'Green',     light: '#eeeed2', dark: '#769656' },
  { id: 'blue',      name: 'Blue',      light: '#dee3e6', dark: '#788a94' },
  { id: 'purple',    name: 'Purple',    light: '#ede4f2', dark: '#9b72a8' },
  { id: 'neon',      name: 'Neon',      light: '#1c1c30', dark: '#2e2e50' },
  { id: 'sakura',    name: 'Sakura',    light: '#fce4ec', dark: '#d88aa4' },
  { id: 'sandstone', name: 'Sandstone', light: '#e8d8b8', dark: '#b09068' },
  { id: 'ice',       name: 'Ice',       light: '#e8f4fa', dark: '#8cb4cc' },
  { id: 'carbon',    name: 'Carbon',    light: '#3a3a3a', dark: '#1e1e1e' },
];
const PIECES = [
  { id: 'classic', name: 'Classic' },
  { id: 'modern',  name: 'Modern' },
  { id: 'outline', name: 'Outline' },
];
const THEMES = [
  { id: 'dark',     name: 'Dark',     bg: '#161512', panel: '#262421', accent: '#81b64c' },
  { id: 'light',    name: 'Light',    bg: '#f4f4f2', panel: '#e4e3df', accent: '#5c9a3a' },
  { id: 'midnight', name: 'Midnight', bg: '#0c1220', panel: '#182338', accent: '#4f9cff' },
  { id: 'forest',   name: 'Forest',   bg: '#0f1a12', panel: '#1c2c20', accent: '#7bbf5a' },
  { id: 'ocean',    name: 'Ocean',    bg: '#0a1a1f', panel: '#143038', accent: '#2fb8c6' },
  { id: 'rose',     name: 'Rose',     bg: '#1c1216', panel: '#2b1c22', accent: '#e2608e' },
  { id: 'coffee',   name: 'Coffee',   bg: '#1e1611', panel: '#2e241c', accent: '#c48a5a' },
  { id: 'sky',      name: 'Sky',      bg: '#eaf2f8', panel: '#d3e2ee', accent: '#3a8fd0' },
  { id: 'crimson',  name: 'Crimson',  bg: '#1a0d0f', panel: '#2b1418', accent: '#e04560' },
  { id: 'mint',     name: 'Mint',     bg: '#f0f7f3', panel: '#dbeae1', accent: '#2ea672' },
];
const look = {
  theme:  localStorage.getItem('pc-theme')  || 'dark',
  board:  localStorage.getItem('pc-board')  || 'wood',
  pieces: localStorage.getItem('pc-pieces') || 'classic',
};

function applyLook() {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');

  for (const t of THEMES) root.classList.toggle('theme-' + t.id, t.id === look.theme);

  for (const id of ['board', 'puz-board']) {
    const b = $(id);
    if (!b) continue;
    b.classList.add('board');   // ← ensure base class even if the HTML edit was missed
    for (const x of BOARDS) b.classList.toggle('board-' + x.id, x.id === look.board);
    for (const x of PIECES) b.classList.toggle('pieces-' + x.id, x.id === look.pieces);
  }

  if (meta) meta.content = THEMES.find(t => t.id === look.theme)?.bg || '#161512';

  for (const btn of $('theme-picker').children) btn.classList.toggle('sel', btn.dataset.id === look.theme);
  for (const btn of $('board-picker').children) btn.classList.toggle('sel', btn.dataset.id === look.board);
  for (const btn of $('piece-picker').children) btn.classList.toggle('sel', btn.dataset.id === look.pieces);
}

$('theme-picker').replaceChildren(...THEMES.map((t) => {
  const btn = document.createElement('button');
  btn.className = 'swatch swatch-theme';
  btn.dataset.id = t.id;
  btn.title = t.name;
  btn.innerHTML =
    `<span class="preview preview-theme" style="background:${t.bg}">` +
      `<i style="background:${t.panel}"></i>` +
      `<i style="background:${t.accent}"></i>` +
    `</span>` +
    `<span class="lbl">${t.name}</span>`;
  btn.onclick = () => { look.theme = t.id; localStorage.setItem('pc-theme', t.id); applyLook(); };
  return btn;
}));

$('board-picker').replaceChildren(...BOARDS.map((b) => {
  const btn = document.createElement('button');
  btn.className = 'swatch';
  btn.dataset.id = b.id;
  btn.title = b.name;
  btn.innerHTML =
    `<span class="preview"><i style="background:${b.light}"></i><i style="background:${b.dark}"></i>` +
    `<i style="background:${b.dark}"></i><i style="background:${b.light}"></i></span>` +
    `<span class="lbl">${b.name}</span>`;
  btn.onclick = () => { look.board = b.id; localStorage.setItem('pc-board', b.id); applyLook(); };
  return btn;
}));

$('piece-picker').replaceChildren(...PIECES.map((p) => {
  const btn = document.createElement('button');
  btn.className = 'swatch';
  btn.dataset.id = p.id;
  btn.innerHTML = `<span class="lbl">${p.name}</span>`;
  btn.onclick = () => { look.pieces = p.id; localStorage.setItem('pc-pieces', p.id); applyLook(); };
  return btn;
}));

applyLook();

// ---------- puzzles ----------
let puzCg = null;
let puz = null;
let puzLine = [];
let puzIdx = 0;
let puzDone = false;
let puzChess = null;            // source of truth (was missing)
let puzSolverColor = 'white';   // board orientation, set per puzzle
let puzzleDb = null;
let puzzleDbLoading = null;
const PUZ_MAX_LIVES = 5;
let puzLives = PUZ_MAX_LIVES;

const HEART_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3' +
    'c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5' +
    'c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

function renderLives(justLost = -1) {
  const el = $('puz-lives');
  if (!el) return;
  el.setAttribute('aria-label', `${puzLives} of ${PUZ_MAX_LIVES} lives remaining`);
  el.replaceChildren(...Array.from({ length: PUZ_MAX_LIVES }, (_, i) => {
    const span = document.createElement('span');
    span.className = 'heart'
      + (i >= puzLives ? ' empty' : '')
      + (i === justLost ? ' just-lost' : '');
    span.innerHTML = HEART_SVG;
    return span;
  }));
}

const puzFilter = { phase: 'all', motif: 'all', maxRating: 1500 };

// Map Lichess theme tags → our filter ids (some Lichess tags use alternate spellings).
const PHASE_THEMES = ['opening', 'middlegame', 'endgame'];
const MOTIF_THEMES = {
  fork:            ['fork'],
  pin:             ['pin', 'absolutePin', 'relativePin'],
  skewer:          ['skewer'],
  discoveredAttack:['discoveredAttack', 'discoveredCheck'],
  mateIn1:         ['mateIn1'],
  mateIn2:         ['mateIn2'],
  backRankMate:    ['backRankMate'],
};

// Convert a Lichess puzzle row into the object shape the player already uses.
function prettifyTheme(t) {
  const m = t.match(/^mateIn(\d+)$/);
  if (m) return `Mate in ${m[1]}`;
  return t
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .replace(/^./, c => c.toUpperCase())
    .trim();
}

function lichessToPuzzle(row) {
  const themes = row.themes || [];
  const phase = themes.find(t => PHASE_THEMES.includes(t)) || 'middlegame';
  const motifs = [];
  for (const [key, tags] of Object.entries(MOTIF_THEMES)) {
    if (tags.some(t => themes.includes(t))) motifs.push(key);
  }
  const motifNames = motifs
    .map(id => MOTIFS.find(m => m.id === id)?.name)
    .filter(Boolean);
  const otherThemes = themes.filter(t => !PHASE_THEMES.includes(t));

  const title = motifNames.length
    ? motifNames.slice(0, 2).join(' · ')
    : otherThemes.length
      ? otherThemes.slice(0, 2).map(prettifyTheme).join(' · ')
      : `Puzzle ${row.id}`;

  return {
    id: row.id,
    fen: row.fen,
    moves: row.moves,
    rating: row.rating,
    themes, phase, motifs, title,
    note: '',
  };
}

// Load on demand; concurrent callers share the same promise.
function ensurePuzzleDb() {
  if (puzzleDb) return Promise.resolve(puzzleDb);
  if (puzzleDbLoading) return puzzleDbLoading;

  const btn = $('puz-start');
  const originalLabel = btn.textContent;

  puzzleDbLoading = loadPuzzles((p) => {
    if (p.phase === 'download') {
      const pct = p.total ? ` ${Math.round(p.loaded / p.total * 100)}%` : '';
      btn.textContent = `Downloading${pct}`;
    } else if (p.phase === 'decompress') btn.textContent = 'Decompressing…';
    else if (p.phase === 'parse')      btn.textContent = 'Parsing…';
    else if (p.phase === 'filter')     btn.textContent = 'Filtering…';
    else if (p.phase === 'cache')      btn.textContent = 'Saving…';
  })
    .then((list) => { puzzleDb = list; return list; })
    .finally(() => {
      puzzleDbLoading = null;
      btn.textContent = originalLabel;
    });

  return puzzleDbLoading;
}
const PHASES = [
  { id: 'all',        name: 'All' },
  { id: 'opening',    name: 'Opening' },
  { id: 'middlegame', name: 'Middle' },
  { id: 'endgame',    name: 'Endgame' },
];
const MOTIFS = [
  { id: 'all',             name: 'Any' },
  { id: 'fork',            name: 'Fork' },
  { id: 'pin',             name: 'Pin' },
  { id: 'skewer',          name: 'Skewer' },
  { id: 'discoveredAttack',name: 'Discovered' },
  { id: 'mateIn1',         name: 'Mate in 1' },
  { id: 'mateIn2',         name: 'Mate in 2' },
  { id: 'backRankMate',    name: 'Back rank' },
];
const RATINGS = [
  { id: 1000, name: '≤ 1000' },
  { id: 1500, name: '≤ 1500' },
  { id: 9999, name: 'Any' },
];

function renderPuzzleFilters() {
  for (const b of $('puz-phase').children) b.classList.toggle('sel', b.dataset.id === puzFilter.phase);
  for (const b of $('puz-motif').children) b.classList.toggle('sel', b.dataset.id === puzFilter.motif);
  for (const b of $('puz-rating').children) b.classList.toggle('sel', +b.dataset.id === puzFilter.maxRating);
}

$('puz-phase').replaceChildren(...PHASES.map((p) => {
  const b = document.createElement('button');
  b.className = 'swatch'; b.dataset.id = p.id;
  b.innerHTML = `<span class="lbl">${p.name}</span>`;
  b.onclick = () => { puzFilter.phase = p.id; renderPuzzleFilters(); };
  return b;
}));
$('puz-motif').replaceChildren(...MOTIFS.map((m) => {
  const b = document.createElement('button');
  b.className = 'swatch'; b.dataset.id = m.id;
  b.innerHTML = `<span class="lbl">${m.name}</span>`;
  b.onclick = () => { puzFilter.motif = m.id; renderPuzzleFilters(); };
  return b;
}));
$('puz-rating').replaceChildren(...RATINGS.map((r) => {
  const b = document.createElement('button');
  b.dataset.id = r.id; b.textContent = r.name;
  b.onclick = () => { puzFilter.maxRating = r.id; renderPuzzleFilters(); };
  return b;
}));
renderPuzzleFilters();

function puzzlesMatching() {
  if (!puzzleDb) return [];
  return puzzleDb
    .filter((p) =>
      (puzFilter.phase === 'all' || p.themes.includes(puzFilter.phase)) &&
      (puzFilter.motif === 'all' || p.themes.includes(puzFilter.motif)) &&
      p.rating <= puzFilter.maxRating
    )
    .map(lichessToPuzzle);
}

$('puz-start').onclick = async () => {
  try {
    await ensurePuzzleDb();
  } catch (e) {
    console.error(e);
    return modal('Could not load puzzles: ' + e.message, [['OK']]);
  }
  const list = puzzlesMatching();
  if (!list.length) return modal('No puzzles match these filters', [['OK']]);
  startPuzzle(list[Math.floor(Math.random() * list.length)]);
};

$('puz-back').onclick = () => {
  document.querySelector('#mode-pick button#mode-play').click();
  show('home');
};

$('puz-exit').onclick = () => { $('puz-game').hidden = true; $('puz-picker').hidden = false; };

function startPuzzle(p) {
  puz = p; puzIdx = 0; puzDone = false; puzSolverColor = 'white';
  puzLives = PUZ_MAX_LIVES;
  $('puz-picker').hidden = true;
  $('puz-game').hidden = false;
  show('puzzles');
  $('puz-title').textContent = p.title;
  $('puz-verdict').textContent = '';
  $('puz-meta').textContent = `${p.phase} · ${p.motifs.join(', ')} · ${p.rating} Elo`;
  renderLives();  

  puzCg ??= Chessground($('puz-board'), {
    coordinates: true,
    animation: { duration: 150 },
    highlight: { lastMove: true, check: true },
    selectable: { enabled: true },
    draggable: { enabled: true },
    movable: { free: false, showDests: true, events: { after: puzOnMove } },
    drawable: { enabled: true },
  });

  puzLine = [...p.moves];
  puzApplyPosition();
  applyLook();       // re-assert board/pieces classes after Chessground init
}

function puzApplyPosition() {
  puzChess = new Chess(puz.fen);
  // Play the opponent's setup move (always exactly one in Lichess format).
  if (puzIdx < puzLine.length) {
    const u = puzLine[puzIdx];
    puzChess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    puzIdx++;
  }
  puzSolverColor = puzChess.turn() === 'w' ? 'white' : 'black';
  puzSync(true);
}

function puzSync(first) {
  const turn = puzChess.turn() === 'w' ? 'white' : 'black';
  const dests = new Map();
  if (!puzDone) {
    for (const mv of puzChess.moves({ verbose: true })) {
      if (!dests.has(mv.from)) dests.set(mv.from, []);
      dests.get(mv.from).push(mv.to);
    }
  }
  const last = puzChess.history({ verbose: true }).at(-1);
  puzCg.set({
    fen: puzChess.fen(),
    orientation: puzSolverColor,
    turnColor: turn,
    check: puzChess.inCheck() ? turn : false,
    lastMove: last ? [last.from, last.to] : undefined,
    movable: { color: puzDone ? undefined : turn, dests },
    drawable: { autoShapes: [] },
  });
  if (first) $('puz-verdict').textContent = '';
}

function puzOnMove(from, to) {
  if (puzDone || puzIdx >= puzLine.length) return;

  const expected = puzLine[puzIdx];
  const piece    = puzChess.get(from);
  const promo    = piece?.type === 'p' && (to[1] === '8' || to[1] === '1');
  const uci      = from + to + (promo ? 'q' : '');

  if (uci !== expected) {
    puzLives--;
    const outOfLives = puzLives <= 0;
    renderLives(puzLives);   // pass the index of the heart that just emptied
    puzSync(false);
    puzCg.set({ drawable: { autoShapes: [] } });

    if (outOfLives) {
      puzDone = true;
      puzCg.set({ movable: { color: undefined } });
      $('puz-verdict').className = 'q-Blunder';
      $('puz-verdict').textContent = 'Out of lives — tap Retry to try again.';
    } else {
      $('puz-verdict').className = 'q-Blunder';
      $('puz-verdict').textContent = 'Not the move — try again.';
    }
    return;
  }

  puzChess.move({ from, to, promotion: promo ? 'q' : undefined });
  puzIdx++;
  $('puz-verdict').className = 'q-Good';
  $('puz-verdict').textContent = `Correct. (${puzLives} ${puzLives === 1 ? 'life' : 'lives'} left)`;
  puzSync(false);

  if (puzIdx < puzLine.length) {
    const u = puzLine[puzIdx];
    setTimeout(() => {
      puzChess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      puzIdx++;
      puzSync(false);
      if (puzIdx >= puzLine.length) puzWin();
    }, 220);
  } else {
    puzWin();
  }
}

function puzWin() {
  puzDone = true;
  $('puz-verdict').className = 'q-Best';
  $('puz-verdict').textContent = 'Solved!' + (puz.note ? ' ' + puz.note : '');
  puzCg.set({ movable: { color: undefined } });
}

$('puz-hint').onclick = () => {
  if (!puz || puzDone || puzIdx >= puzLine.length) return;

  const u = puzLine[puzIdx];
  const from = u.slice(0, 2), to = u.slice(2, 4), promo = u[4] || undefined;

  let san;
  try {
    san = new Chess(puzChess.fen()).move({ from, to, promotion: promo }).san;
  } catch (e) {
    console.error('hint failed', e, { fen: puzChess.fen(), from, to, promo });
    $('puz-verdict').className = 'q-Mistake';
    $('puz-verdict').textContent = 'Hint unavailable right now.';
    return;
  }

  puzCg.set({ drawable: { autoShapes: [{ orig: from, dest: to, brush: 'green' }] } });
  $('puz-verdict').className = 'q-Inaccuracy';
  $('puz-verdict').textContent = 'Hint: ' + san;
};

$('puz-retry').onclick = () => { if (puz) startPuzzle(puz); };
$('puz-next').onclick  = async () => {
  try { await ensurePuzzleDb(); } catch { return; }
  const list = puzzlesMatching();
  if (!list.length) return;
  const cur = list.findIndex((x) => x.id === puz?.id);
  startPuzzle(list[(cur + 1) % list.length]);
};

// ---------- views & modal (single page: views swap, nothing navigates away) ----------
function show(name) {
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== 'view-' + name;
}
function modal(title, buttons) {
  $('modal-title').textContent = title;
  $('modal-btns').replaceChildren(...buttons.map(([label, fn]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => { $('modal').hidden = true; fn?.(); };
    return b;
  }));
  $('modal').hidden = false;
}

// ---------- home ----------
// Time control: choose a tab (Bullet / Blitz / Rapid / Custom), then a preset or custom values.
// Selecting only highlights; nothing starts until the Start button is pressed.
const CATS = [...Object.keys(PRESETS), 'Custom'];
const picked = Object.fromEntries(Object.entries(PRESETS).map(([k, list]) => [k, list[0]])); // last choice per tab
let cat = 'Rapid';

function currentTC() { // [minutes, increment], or null while the custom fields are invalid
  if (cat !== 'Custom') return picked[cat];
  const m = parseFloat($('c-min').value), i = parseInt($('c-inc').value || '0', 10);
  return m > 0 && i >= 0 ? [m, i] : null;
}

function renderTC() {
  const t = currentTC();
  for (const b of $('tc-tabs').children) b.classList.toggle('sel', b.dataset.cat === cat);
  $('presets').hidden = cat === 'Custom';
  $('custom').hidden = cat !== 'Custom';
  if (cat !== 'Custom') {
    $('presets').replaceChildren(...PRESETS[cat].map(([m, i]) => {
      const b = document.createElement('button');
      b.textContent = `${m}+${i}`;
      b.classList.toggle('sel', m === t[0] && i === t[1]);
      b.onclick = () => { picked[cat] = [m, i]; renderTC(); };
      return b;
    }));
  }
  $('tc-val').textContent = t ? `${t[0]}+${t[1]}` : '–';
  $('start-go').disabled = !t;
}

$('tc-tabs').replaceChildren(...CATS.map((name) => {
  const b = document.createElement('button');
  b.textContent = name;
  b.dataset.cat = name;
  b.onclick = () => { cat = name; renderTC(); };
  return b;
}));
$('c-min').oninput = renderTC;
$('c-inc').oninput = renderTC;
$('start-go').onclick = () => { const t = currentTC(); if (t) start(...t); };
renderTC();
function choose(sel, cb) {
  const bs = [...document.querySelectorAll(sel)];
  for (const b of bs) b.onclick = () => { bs.forEach((x) => x.classList.toggle('sel', x === b)); cb(b); };
}
choose('#opp button', (b) => { mode.bot = b.id === 'opp-bot'; $('bot-opts').hidden = !mode.bot; });
choose('#bot-opts button', (b) => { mode.side = b.dataset.side; });
choose('#fb button', (b) => { mode.feedback = b.id === 'fb-on'; });
choose('#mode-pick button', (b) => {
  show(b.id === 'mode-puzzles' ? 'puzzles' : 'home');
});
$('elo').oninput = () => { mode.elo = +$('elo').value; $('elo-val').textContent = mode.elo; };
// Hidden debug console for the iPhone: tap the title 7 times.
let taps = 0;
$('title').onclick = async () => { if (++taps >= 7) { taps = 0; (await import('eruda')).default.init(); } };

// ---------- game ----------
function start(m, i) {
  tc = [m, i];
  clock?.pause();
  chess = new Chess();
  over = false;
  gameId++; engine?.stop(); pending = null;
  botColor = !mode.bot ? null : mode.side === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : mode.side === 'w' ? 'b' : 'w';
  botElo = mode.elo;
  flipped = botColor === 'w'; // human's side at the bottom
  clock = new Clock(m, i, renderClocks, (c) => finish(`${c === 'w' ? 'Black' : 'White'} wins on time`));
  show('game'); // show first so Chessground measures a visible board
  cg ??= Chessground($('board'), {
    coordinates: true,
    animation: { duration: 150 },
    highlight: { lastMove: true, check: true },
    premovable: { enabled: true, showDests: true, castle: true },
    selectable: { enabled: true },          // tap-to-move (primary)
    draggable: { enabled: true },           // drag (secondary)
    movable: { free: false, showDests: true, events: { after: onMove } },
  });
  sync(); renderClocks(); renderMoves();
  // One shared engine serves the bot and the move feedback (it queues requests, one at a time).
  G = mode.feedback ? { evals: [], moves: [] } : null;
  $('verdict').textContent = '';
  if (G || botColor) {
    engine ??= new Engine('./engine/stockfish.js');
    engine.run(['ucinewgame', 'isready'], 'readyok');
  }
  if (botColor === 'w') botTurn(); // queue the bot's move before any analysis
  if (G) {
    const g = G, id = gameId;
    evaluate(engine, chess.fen()).then((ev) => { if (id === gameId) g.evals[0] = ev; }).catch(console.error);
  }
}

// Push the chess.js state into the board (also fixes castling / en passant visuals).
function sync() {
  const turn = chess.turn() === 'w' ? 'white' : 'black';
  const dests = new Map();
  if (!over && chess.turn() !== botColor) {
    for (const mv of chess.moves({ verbose: true })) {
      if (!dests.has(mv.from)) dests.set(mv.from, []);
      dests.get(mv.from).push(mv.to);
    }
  }
  const last = chess.history({ verbose: true }).at(-1);
  cg.set({
    fen: chess.fen(),
    orientation: flipped ? 'black' : 'white',
    turnColor: turn,
    check: chess.inCheck() ? turn : false,
    lastMove: last ? [last.from, last.to] : undefined,
    movable: { color: over ? undefined : botColor ? (botColor === 'w' ? 'black' : 'white') : turn, dests },
  });
  if (over) cg.cancelPremove();
  renderCaptures();   // ← add
}

function onMove(from, to, meta) {
  const promo = chess.get(from).type === 'p' && (to[1] === '8' || to[1] === '1');
  if (!promo) return play(from, to);
  if (meta?.premove) return play(from, to, 'q'); // premoved pawns auto-queen
  modal('Promote to', [['♛ Queen', 'q'], ['♜ Rook', 'r'], ['♝ Bishop', 'b'], ['♞ Knight', 'n']]
    .map(([label, p]) => [label, () => play(from, to, p)]));
}

function play(from, to, promotion) {
  if (over) return;
  const fenBefore = chess.fen();
  const mv = chess.move({ from, to, promotion });
  clock.switchTo(chess.turn());
  if (G) { // analysis is queued first so your verdict is quick; the bot's search follows
    if (!botColor || mv.color !== botColor) $('verdict').textContent = '';
    track(mv, fenBefore);
  }
  renderMoves();
  if (chess.isGameOver()) finish(resultText());
  else {
    sync(); renderClocks();
    if (chess.turn() === botColor) botTurn();
    else if (botColor) cg.playPremove(); // the bot just moved: fire a queued premove (if still legal)
  }
}

const resultText = () =>
  chess.isCheckmate() ? `${chess.turn() === 'w' ? 'Black' : 'White'} wins by checkmate`
  : chess.isStalemate() ? 'Draw by stalemate'
  : chess.isInsufficientMaterial() ? 'Draw: insufficient material'
  : chess.isThreefoldRepetition() ? 'Draw by repetition'
  : 'Draw by 50-move rule';

function finish(msg) {
  over = true;
  clock.pause();
  sync(); renderClocks();
  modal(msg, [['Rematch', () => start(...tc)], ['View board'], ['Menu', () => show('home')]]);
}

function renderClocks() {
  const bottom = flipped ? 'b' : 'w', top = flipped ? 'w' : 'b';
  for (const [pos, c] of [['top', top], ['bottom', bottom]]) {
    const ms = clock.now(c);
    $('name-' + pos).textContent = botColor ? (c === botColor ? `Bot ${botElo}` : 'You') : c === 'w' ? 'White' : 'Black';
    $('clock-' + pos).textContent = fmt(ms);
    $('player-' + pos).classList.toggle('active', !over && clock.turn === c);
    $('player-' + pos).classList.toggle('low', ms < 20000);
  }
}
const CAPTURE_GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const CAPTURE_ORDER = { q: 0, r: 1, b: 2, n: 3, p: 4 };

function computeCaptures() {
  const byWhite = [];
  const byBlack = [];
  for (const mv of chess.history({ verbose: true })) {
    if (!mv.captured) continue;
    (mv.color === 'w' ? byWhite : byBlack).push(mv.captured);
  }
  const sum = (list) => list.reduce((s, t) => s + (PIECE_VALUE[t] || 0), 0);
  return { byWhite, byBlack, diff: sum(byWhite) - sum(byBlack) };
}

function renderCaptures() {
  if (!chess) return;
  const bottom = flipped ? 'b' : 'w';
  const top = flipped ? 'w' : 'b';
  const { byWhite, byBlack, diff } = computeCaptures();

  for (const [pos, color] of [['top', top], ['bottom', bottom]]) {
    const el = $('captures-' + pos);
    if (!el) continue;
    const captured = color === 'w' ? byWhite : byBlack;
    const oppColor = color === 'w' ? 'b' : 'w';
    const myDiff = color === 'w' ? diff : -diff;

    const sorted = [...captured].sort((a, b) => CAPTURE_ORDER[a] - CAPTURE_ORDER[b]);
    const parts = sorted.map((t) => {
      const cls = oppColor === 'w' ? 'cap-white' : 'cap-black';
      return `<span class="cap ${cls}">${CAPTURE_GLYPHS[t]}</span>`;
    });
    if (myDiff > 0) parts.push(`<span class="diff">+${myDiff}</span>`);
    el.innerHTML = parts.join('');
  }
}
function renderMoves() {
  const el = $('moves');
  el.replaceChildren(...chess.history().map((san, i) => {
    const s = document.createElement('span');
    s.textContent = (i % 2 ? '' : `${i / 2 + 1}. `) + san + ' ';
    const label = G?.moves[i]?.label;
    if (label) s.className = 'q-' + label;
    return s;
  }));
  el.scrollLeft = el.scrollWidth;
}

// ---------- controls ----------
$('btn-flip').onclick = () => { flipped = !flipped; sync(); renderClocks(); };
$('btn-resign').onclick = () => {
  if (over || !chess.history().length) return;
  if (botColor) return modal('Resign?', [['Resign', () => finish(`${botColor === 'w' ? 'White' : 'Black'} wins by resignation`)], ['Cancel']]);
  modal('Who resigns?', [
    ['White', () => finish('Black wins by resignation')],
    ['Black', () => finish('White wins by resignation')],
    ['Cancel'],
  ]);
};
$('btn-menu').onclick = () => {
  if (over || !chess.history().length) return show('home');
  modal('Leave this game?', [['Leave', () => { clock.pause(); over = true; gameId++; engine?.stop(); show('home'); }], ['Stay']]);
};

// ---------- backgrounding: stop the clock, ask before resuming ----------
let wasRunning = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { wasRunning = !!clock?.running; clock?.pause(); return; }
  if (!wasRunning) return;
  wasRunning = false;
  if ($('modal').hidden) modal('Paused', [['Resume', resume]]);
  else resume();
});

// ---------- bot ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resume the clock; if the bot finished thinking while we were paused, play its move now.
function resume() { clock.resume(); const p = pending; pending = null; p?.(); }

async function botTurn() {
  const id = gameId, side = chess.turn(), fen = chess.fen();
  const ms = Math.round(Math.min(1500, Math.max(150, clock.now(side) / 40))); // fixed, clock-aware think time
  try {
    const uci = await Promise.race([chooseMove(engine, fen, botElo, ms), engine.dead, sleep(20000)]);
    if (!uci) throw new Error(engine.ready ? 'the engine started but a search never finished' : 'the engine never finished starting up (is public/engine/stockfish.wasm there?)');
    if (botElo < 1320) await sleep(300 + Math.random() * 1200); // human-like pause
    if (id !== gameId || over) return;
    const apply = () => { if (id === gameId && !over) play(uci.slice(0, 2), uci.slice(2, 4), uci[4]); };
    if (clock.turn && !clock.running) pending = apply; else apply(); // paused: wait for Resume
  } catch (e) {
    console.error(e);
    if (id === gameId && !over) modal('Engine problem: ' + e.message, [['OK']]);
  }
}

// ---------- move feedback ----------
// Evaluate the position after each move (side to move's view). A move's loss is the mover's
// win% before (evals[k]) minus after (-evals[k+1]), so one evaluation per move is enough.
async function track(mv, fenBefore) {
  const g = G, id = gameId, k = g.moves.length;
  g.moves.push({ uci: mv.from + mv.to + (mv.promotion || ''), san: mv.san, color: mv.color, fenBefore });
  const ev = chess.isGameOver()
    ? { cp: chess.isCheckmate() ? -10000 : 0 }
    : await evaluate(engine, chess.fen()).catch(console.error);
  if (id !== gameId || !ev) return;
  g.evals[k + 1] = ev;
  rate(k);
}

function rate(k) {
  const g = G, a = g.evals[k], b = g.evals[k + 1], m = g.moves[k];
  if (!a || !b || (botColor && m.color === botColor)) return; // the bot's moves aren't rated
  m.loss = Math.max(0, winPct(a.cp) - winPct(-b.cp));
  m.label = classify(m.loss, m.uci === a.best);
  renderMoves();
  // show it unless you've already moved again (the bot replying in between doesn't hide it)
  if (g.moves.findLastIndex((x) => !botColor || x.color !== botColor) === k) showVerdict(k);
}

function sanOf(fen, uci) {
  try { return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san; }
  catch { return ''; }
}

function showVerdict(k) {
  const m = G.moves[k], el = $('verdict');
  const best = m.loss >= 5 ? sanOf(m.fenBefore, G.evals[k].best) : '';
  el.className = 'q-' + m.label;
  el.textContent = `${m.san} · ${m.label}` + (best && best !== m.san ? ` (-${Math.round(m.loss)}%) · best was ${best}` : '');
}
