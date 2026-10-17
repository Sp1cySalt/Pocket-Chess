// scripts/build-puzzles.mjs
// Downloads the Lichess puzzle DB (.zst), filters it, writes public/puzzles.json.
// Run once (or whenever you want to refresh): `npm run build:puzzles`
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { decompress } from 'fzstd';
import Papa from 'papaparse';

const SRC = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const OUT = 'public/puzzles.json';

// Tune these to trade file size against pool size.
const MAX_RATING     = 1500;
const MIN_POPULARITY = 70;
const MIN_PLAYS      = 100;
const MAX_PUZZLES    = 50000;

console.log('Downloading…');
const res = await fetch(SRC);
if (!res.ok) throw new Error(`HTTP ${res.status} from ${SRC}`);
const compressed = new Uint8Array(await res.arrayBuffer());
console.log(`  ${(compressed.length / 1024 / 1024).toFixed(1)} MB`);

console.log('Decompressing…');
const csvBytes = decompress(compressed);
console.log(`  ${(csvBytes.length / 1024 / 1024).toFixed(1)} MB decompressed`);

console.log('Parsing…');
const out = [];

// V8 strings max out around 512M characters, so we cannot decode the 1 GB
// CSV into a single string. Decode in 4 MB slices with TextDecoder's
// stream:true (which holds partial multi-byte sequences across slices) and
// feed them into Papa's Node streaming parser as a Readable of strings.
const CHUNK = 4 * 1024 * 1024;
function* decodedChunks() {
  const decoder = new TextDecoder('utf-8');
  for (let i = 0; i < csvBytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, csvBytes.length);
    yield decoder.decode(csvBytes.subarray(i, end), { stream: end < csvBytes.length });
  }
}

await new Promise((resolve, reject) => {
  Papa.parse(Readable.from(decodedChunks()), {
    header: true,
    skipEmptyLines: true,
    step: ({ data: r }) => {
      if (!r.FEN || !r.Moves) return;
      const rating = +r.Rating;
      const pop    = +r.Popularity;
      const plays  = +r.NbPlays;
      if (rating > MAX_RATING || pop < MIN_POPULARITY || plays < MIN_PLAYS) return;
      out.push({
        id: r.PuzzleId,
        fen: r.FEN,
        moves: r.Moves.trim().split(/\s+/),
        rating,
        themes: (r.Themes || '').split(/\s+/).filter(Boolean),
      });
    },
    error: reject,
    complete: resolve,
  });
});
console.log(`  ${out.length} puzzles matched the filters`);

// Shuffle before capping so you don't always get the same 50k.
for (let i = out.length - 1; i > 0; i--) {
  const j = (Math.random() * (i + 1)) | 0;
  [out[i], out[j]] = [out[j], out[i]];
}
out.length = Math.min(out.length, MAX_PUZZLES);

await fs.mkdir('public', { recursive: true });
await fs.writeFile(OUT, JSON.stringify(out));
const size = (await fs.stat(OUT)).size / 1024 / 1024;
console.log(`Wrote ${out.length} puzzles to ${OUT} (${size.toFixed(1)} MB)`);