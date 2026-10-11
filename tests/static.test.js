import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { startApp } from './helpers.js';
import { SECURITY_HEADERS } from '../src/headers.js';
import base from '../config/pasale.config.js';

test('everything a visitor downloads stays well under 200 KB', async () => {
  const app = await startApp({});
  try {
    let total = 0;
    for (const p of ['/', '/app.js', '/styles.css', '/api/config', '/sign', '/sign.css']) {
      total += (await (await fetch(`${app.base}${p}`)).arrayBuffer()).byteLength;
    }
    assert.ok(total < 60 * 1024, `total ${total} bytes`);
  } finally {
    await app.close();
  }
});

test('no animation library or third-party scripts and styles', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['qrcode-generator']);
  for (const f of readdirSync('public').filter((x) => /\.(html|js|css)$/.test(x))) {
    const src = readFileSync(`public/${f}`, 'utf8');
    assert.ok(!/framer|@keyframes|animation:/.test(src), `${f} has animation`);
    assert.ok(!/(src|href)="https?:/.test(src), `${f} loads something external`);
  }
});

test('styles use transitions only and the UI markup keeps emoji out of the accessibility tree', () => {
  const css = readFileSync('public/styles.css', 'utf8');
  assert.match(css, /transition:/);
  assert.ok(!/animation\s*:|animation-|@keyframes/.test(css));
  // Letter-spaced capitals only on the three step headers, never on field labels or buttons.
  assert.equal((css.match(/text-transform:\s*uppercase/g) ?? []).length, 1);
  assert.match(css, /legend\.step[^}]*text-transform:\s*uppercase/);
  const js = readFileSync('public/app.js', 'utf8');
  assert.match(js, /class: 'ico', 'aria-hidden': 'true'/); // icons are hidden from assistive tech
  assert.match(js, /el\('span', \{ class: 'tlabel'/); // every service tile has a visible text label
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(js), 'no emoji in the interface code');
});

test('icon set: 6 to 8 original line icons with one stroke weight, named in config', async () => {
  const { ICONS, ICON_NAMES } = await import('../public/icons.js');
  assert.ok(ICON_NAMES.length >= 6 && ICON_NAMES.length <= 8, `${ICON_NAMES.length} icons`);
  for (const [name, paths] of Object.entries(ICONS)) assert.ok(paths.length >= 1 && paths.every((d) => /^M[\d\sMLHVCSQTAZa-z.,-]+$/.test(d)), name);
  const js = readFileSync('public/app.js', 'utf8');
  assert.equal((js.match(/'stroke-width': '1\.5'/g) ?? []).length, 1, 'one stroke weight for every icon');
  assert.match(js, /width: '44'/); // 40px or larger
});

test('every dependency is pinned to an exact version', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const [name, v] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) assert.match(v, /^\d+\.\d+\.\d+$/, name);
});

test('public/_headers matches the headers the server sends', () => {
  const file = readFileSync('public/_headers', 'utf8').toLowerCase();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.ok(file.includes(`${k}: ${v}`.toLowerCase()), k);
});

test('wrangler.jsonc deploys a Worker named pasale with public/ assets, API and sign routes, and demo vars', () => {
  const text = readFileSync('wrangler.jsonc', 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const w = JSON.parse(text);
  assert.equal(w.name, 'pasale');
  assert.equal(w.main, 'adapters/worker.js');
  assert.ok(statSync(w.main).isFile());
  assert.equal(w.assets.directory, './public');
  assert.ok(statSync('public').isDirectory());
  assert.deepEqual(w.assets.run_worker_first, ['/api/*', '/sign']);
  assert.deepEqual(w.vars, { DEMO_MODE: 'true' });
  assert.equal(w.workers_dev, true);
  assert.equal(w.preview_urls, false);
  assert.ok(!('RESEND_API_KEY' in w.vars) && !('PASALE_WEBHOOK_URL' in w.vars), 'secrets never go in wrangler.jsonc');
});

test('/sign is a US Letter sign with the headline, business name and a local QR code', async () => {
  const app = await startApp({});
  try {
    const res = await fetch(`${app.base}/sign`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /COME BY\.<br>PÁSALE\./);
    assert.match(html, /Sample Showroom|Test Shop/);
    assert.match(html, /<svg [^>]*viewBox/);
    assert.match(html, /Escanea el código/);
    assert.match(html, /Scan the code/);
    assert.ok(!/<script/.test(html));
    assert.ok(!/(src|href)="https?:/.test(html), 'sign must not load anything external');
    assert.match(readFileSync('public/sign.css', 'utf8'), /size:\s*8\.5in 11in/);
    // The business's own public URL is allowed on the sign; Pásale/Fancy Ape branding is not.
    const withoutOwnUrl = html.split(base.business.publicUrl).join('');
    assert.ok(!/fancyape|made with|hecho con/i.test(withoutOwnUrl), 'no branding on the sign');
  } finally {
    await app.close();
  }
});

test('the sign QR code and the configured public URL point at the live Worker', () => {
  assert.equal(base.business.publicUrl, 'https://pasale.fancyape.workers.dev/');
});

test('footer credit is configurable and the ticket has no branding hooks', async () => {
  const app = await startApp({});
  const cfg = await app.config();
  assert.equal(cfg.showCredit, true);
  assert.equal(cfg.creditUrl, 'https://www.fancyape.com/projects');
  const js = readFileSync('public/app.js', 'utf8');
  const ticket = js.slice(js.indexOf('function renderTicket'), js.indexOf('async function submit'));
  assert.ok(!/credit|fancyape|composition/i.test(ticket));
  await app.close();
});

test('public-repo hygiene: MIT, private package, no personal author, repository URL, as-is notices', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.private, true);
  assert.ok(!('author' in pkg) && !('contributors' in pkg) && !('maintainers' in pkg), 'no person named in package.json');
  assert.equal(pkg.repository.url, 'https://github.com/TheCompositionGroup/pasale');
  const asIs = 'Provided as-is under the MIT license. Not actively maintained; no support is offered.';
  assert.ok(readFileSync('README.md', 'utf8').includes(asIs));
  const sec = readFileSync('SECURITY.md', 'utf8');
  assert.ok(sec.includes(asIs) && sec.includes('Never include customer data in issues, forks, or commits.'));
  const ignore = readFileSync('.gitignore', 'utf8').split('\n');
  for (const entry of ['.env', '.local/', '.wrangler/', 'node_modules']) assert.ok(ignore.includes(entry), `.gitignore covers ${entry}`);
  for (const internal of ['SPEC.md', 'CLAUDE.md']) assert.throws(() => statSync(internal), `${internal} is not shipped`);
});
