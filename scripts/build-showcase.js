// Prepares .showcase/public for the showcase deployment: the normal public/ files plus the
// example's images (served at /gallery/) and a read-only copy of its config (/config-source.txt).
// Images are copied byte for byte. Gallery sizes written in the config are checked against the files.
import { cpSync, rmSync, mkdirSync, readdirSync, readFileSync, copyFileSync } from 'node:fs';
import { imageSize } from './image-size.js';
import config from '../examples/fancyape/fancyape.config.js';

const IMAGES = 'examples/fancyape/images';
const out = '.showcase/public';

const problems = [];
for (const g of config.gallery ?? []) {
  if (!g.image) continue;
  const actual = imageSize(readFileSync(`${IMAGES}/${g.image}`));
  if (!actual) console.warn(`${g.image}: size not readable here; keep width and height in the config correct`);
  else if (actual.width !== g.width || actual.height !== g.height) problems.push(`${g.image} is ${actual.width}x${actual.height}; the config says ${g.width}x${g.height}`);
}
if (problems.length) {
  console.error(`Gallery sizes in the config do not match the image files:\n - ${problems.join('\n - ')}`);
  process.exit(1);
}

rmSync('.showcase', { recursive: true, force: true });
cpSync('public', out, { recursive: true });
mkdirSync(`${out}/gallery`, { recursive: true });
for (const f of readdirSync(IMAGES)) {
  if (/\.(jpe?g|png|webp|avif)$/i.test(f)) copyFileSync(`${IMAGES}/${f}`, `${out}/gallery/${f}`);
}
copyFileSync('examples/fancyape/fancyape.config.js', `${out}/config-source.txt`);
console.log('Showcase assets ready in', out);
