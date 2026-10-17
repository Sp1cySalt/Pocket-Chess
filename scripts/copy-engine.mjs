// Copies the single-threaded "lite" Stockfish build from node_modules into public/engine/.
import { readdirSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
try {
  const files = walk('node_modules/stockfish').filter((p) => /lite-single/.test(p));
  const js = files.find((p) => p.endsWith('.js'));
  const wasm = files.find((p) => p.endsWith('.wasm'));
  if (!js || !wasm) throw new Error('no *lite-single* .js/.wasm pair found');
  mkdirSync('public/engine', { recursive: true });
  copyFileSync(js, 'public/engine/stockfish.js');
  copyFileSync(wasm, 'public/engine/stockfish.wasm');
  console.log('Engine copied from', js);
} catch (e) {
  console.warn('Could not copy engine:', e.message);
  console.warn('Copy a lite-single .js/.wasm pair from node_modules/stockfish to public/engine/stockfish.js and stockfish.wasm');
}
