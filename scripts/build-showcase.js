// Prepares .showcase/public for the showcase deployment: the normal public/ files plus the
// example's images (served at /gallery/) and a read-only copy of its config (/config-source.txt).
import { cpSync, rmSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';

const out = '.showcase/public';
rmSync('.showcase', { recursive: true, force: true });
cpSync('public', out, { recursive: true });
mkdirSync(`${out}/gallery`, { recursive: true });
for (const f of readdirSync('examples/fancyape/images')) {
  if (/\.(jpe?g|png|webp|avif)$/i.test(f)) copyFileSync(`examples/fancyape/images/${f}`, `${out}/gallery/${f}`);
}
copyFileSync('examples/fancyape/fancyape.config.js', `${out}/config-source.txt`);
console.log('Showcase assets ready in', out);
