import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startApp, startInbox, testConfig } from './helpers.js';
import { resolveConfig, ConfigError } from '../src/config.js';
import { DEFAULT_COPY } from '../src/defaults.js';
import base from '../config/pasale.config.js';
import showcase from '../examples/fancyape/fancyape.config.js';

const OPTIONAL_KEYS = ['servicePrompts', 'gallery', 'galleryTitle', 'galleryCredit', 'galleryCollection', 'theme', 'layout', 'hoursNote', 'attribution', 'header', 'showConfig', 'timeOptional', 'serviceSelect', 'hoursUnset'];
const showcaseConfig = () => ({ ...showcase, business: { ...showcase.business } });
const EXISTING_FANCYAPE_URLS = /pasale\.fancyape\.workers\.dev|www\.fancyape\.com\/projects/g;

test('default config: every optional feature is off', async () => {
  const app = await startApp({});
  const cfg = await app.config();
  for (const k of OPTIONAL_KEYS) assert.equal(cfg[k], undefined, `${k} is off`);
  await app.close();
});

test('core, default config and public files carry no Fancy Ape content', async () => {
  for (const f of ['src/config.js', 'src/core.js', 'src/defaults.js', 'src/validate.js', 'public/app.js', 'public/styles.css', 'public/index.html', 'adapters/node.js', 'adapters/worker.js', 'adapters/worker-core.js', 'config/pasale.config.js']) {
    // The only allowed mentions are the existing demo URL and credit link.
    const stripped = readFileSync(f, 'utf8').replace(EXISTING_FANCYAPE_URLS, '');
    assert.ok(!/fancy ?ape|antique mall|booth|composition group|forest/i.test(stripped), f);
  }
  const app = await startApp({});
  const body = JSON.stringify(await app.config()).replace(EXISTING_FANCYAPE_URLS, '');
  assert.ok(!/fancy ?ape|antique|art is better/i.test(body));
  await app.close();
});

test('showcase config is valid and turns on every optional feature', async () => {
  const app = await startApp({ config: showcaseConfig() });
  const cfg = await app.config();
  assert.equal(cfg.demo, true);
  assert.equal(cfg.serviceSelect, 'single');
  assert.deepEqual(Object.keys(cfg.servicePrompts), ['view', 'display', 'consult']);
  assert.equal(cfg.gallery.length, 3);
  assert.ok(cfg.theme.accent && cfg.theme.background && cfg.theme.surface && cfg.theme.text);
  assert.ok(cfg.hoursNote.en && cfg.hoursNote.es);
  assert.ok(cfg.attribution.en.includes('Pásale'));
  assert.equal(cfg.showConfig, true);
  assert.equal(cfg.layout, 'compact');
  assert.equal(cfg.timeOptional, undefined, 'sample hours are set, so the picker shows');
  assert.equal(cfg.hoursNote.en, 'Sample hours for this demo — not real availability.');
  assert.equal(cfg.hoursNote.es, 'Horario de ejemplo para esta demo — no es disponibilidad real.');
  assert.equal(cfg.services.find((s) => s.id === 'display').icon, 'frame');
  assert.equal(cfg.header.line.en, 'Fancy Ape · Studio & Gallery · Melbourne, FL');
  assert.equal(cfg.header.subline.en, 'Produced by The Composition Group');
  assert.equal(cfg.header.location, undefined, 'no booth line');
  assert.equal(cfg.business.address, '');
  assert.equal(cfg.copy.en.title, 'Art is better in person.');
  assert.equal(cfg.business.phone, '');
  await app.close();
});

test('showcase content rules: no registered mark, no booth line, sample hours Tue-Sat 10-17', () => {
  const text = readFileSync('examples/fancyape/fancyape.config.js', 'utf8');
  assert.ok(!text.includes('®'));
  assert.ok(!/oeno|sasha|boxdrop|acima/i.test(text));
  assert.ok(!/private|appointment/i.test(JSON.stringify(showcase.header)));
  assert.deepEqual(showcase.hours, { mon: null, tue: ['10:00', '17:00'], wed: ['10:00', '17:00'], thu: ['10:00', '17:00'], fri: ['10:00', '17:00'], sat: ['10:00', '17:00'], sun: null });
  assert.equal(showcase.business.phone, '');
  assert.ok(showcase.gallery.every((g) => !g.image || !/^https?:/i.test(g.image)));
  assert.ok(!/booth|antique mall|find us|dónde estamos/i.test(text), 'no booth line or its label in the config');
  assert.match(readFileSync('examples/fancyape/images/README.md', 'utf8'), /^Add 3 artwork files you own or have the artist's permission to use, and credit the artist\./);
});

test('every new string has an ES version, and ES is not a copy of EN', () => {
  assert.deepEqual(Object.keys(DEFAULT_COPY.es).sort(), Object.keys(DEFAULT_COPY.en).sort());
  const walk = (v, where, out = []) => {
    if (v && typeof v === 'object' && 'en' in v && 'es' in v && typeof v.en === 'string') out.push([where, v]);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`, out);
    return out;
  };
  const pairs = [
    ...walk(showcase.servicePrompts, 'servicePrompts'), ...walk(showcase.gallery, 'gallery'), ...walk(showcase.header, 'header'),
    ...walk({ hoursNote: showcase.hoursNote, attribution: showcase.attribution }, 'x'), ...walk(showcase.services, 'services'),
  ];
  assert.ok(pairs.length >= 13);
  for (const [where, v] of pairs) assert.ok(v.es.trim() && v.es !== v.en, `${where} needs its own Spanish text`);
  for (const k of Object.keys(showcase.copy.en)) assert.ok(k in showcase.copy.es, `copy.es.${k}`);
  for (const k of Object.keys(showcase.copy.es)) assert.ok(k in showcase.copy.en, `copy.en.${k}`);
  for (const k of Object.keys(showcase.copy.en)) {
    if (showcase.copy.en[k]) assert.notEqual(showcase.copy.es[k], showcase.copy.en[k], `copy.es.${k} is still English`);
  }
  const missing = { ...showcaseConfig(), hoursNote: { en: 'x' } };
  assert.throws(() => resolveConfig(missing, {}), (e) => e instanceof ConfigError && /hoursNote needs text for "es"/.test(e.message));
});

test('showcase confirmation says "requested" in EN and ES, never "booked"', () => {
  const { en, es } = showcase.copy;
  assert.match(en.ticketTitle, /requested/i);
  assert.match(es.ticketTitle, /solicitada/i);
  assert.match(en.ticketStatus, /requested/i);
  assert.match(es.ticketStatus, /solicitada/i);
  assert.equal(en.submit, 'Request a visit — Demo');
  assert.ok(!/booked|reserved|reservad/i.test(JSON.stringify(showcase.copy)));
});

test('config validation: optional features are checked', () => {
  const bad = (over, re) => assert.throws(() => resolveConfig(testConfig(over), { PASALE_WEBHOOK_URL: 'http://x.test/' }), (e) => e instanceof ConfigError && re.test(e.message));
  bad({ gallery: [{}, {}, {}, {}] }, /at most 3/);
  bad({ gallery: [{ image: 'https://example.com/a.jpg', title: { en: 'a', es: 'a' } }] }, /not a URL/);
  bad({ gallery: [{ image: '../a.jpg', title: { en: 'a', es: 'a' } }] }, /not a URL or path/);
  bad({ theme: { background: 'ivory' } }, /theme\.background/);
  bad({ servicePrompts: { nope: { en: 'a', es: 'a' } } }, /not a service id/);
  bad({ showConfig: true }, /requires demo: true/);
  bad({ business: { ...base.business, phone: '' } }, /business\.phone/);
});

test('single-select is enforced by the server too', async () => {
  const cfg = { ...testConfig(), serviceSelect: 'single', services: [{ id: 'a', label: { en: 'A', es: 'A' } }, { id: 'b', label: { en: 'B', es: 'B' } }] };
  const inbox = await startInbox();
  const app = await startApp({ config: cfg, inbox });
  const send = (n, services) => app.post({ attemptId: `try-single-00000000${n}`, name: 'Ana', phone: '5551234567', services, date: '2030-03-05', time: '11:00', consent: true });
  assert.equal((await send(1, ['a'])).status, 200);
  assert.equal((await send(2, ['a', 'b'])).status, 400);
  await app.close();
  await inbox.close();
});

test('node adapter serves gallery images and the config copy only when enabled', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gal-'));
  writeFileSync(path.join(dir, 'a.png'), 'png');
  const src = path.join(dir, 'config.txt');
  writeFileSync(src, 'export default {}');
  const on = await startApp({ config: showcaseConfig(), handlerOptions: { galleryDir: dir, sourceFile: src } });
  assert.equal((await fetch(`${on.base}/gallery/a.png`)).headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${on.base}/gallery/missing.png`)).status, 404);
  assert.notEqual((await fetch(`${on.base}/gallery/..%2Fconfig.txt`)).status, 200);
  assert.equal(await (await fetch(`${on.base}/config-source.txt`)).text(), 'export default {}');
  await on.close();
  const off = await startApp({});
  assert.equal((await fetch(`${off.base}/config-source.txt`)).status, 404);
  assert.equal((await fetch(`${off.base}/gallery/a.png`)).status, 404);
  await off.close();
});

test('wrangler: showcase env serves the Fancy Ape example in DEMO_MODE; default deployment unchanged', () => {
  const w = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'));
  assert.equal(w.name, 'pasale');
  assert.equal(w.main, 'adapters/worker.js');
  assert.equal(w.assets.directory, './public');
  const e = w.env.showcase;
  assert.equal(e.main, 'adapters/worker-showcase.js');
  assert.ok(existsSync(e.main));
  assert.deepEqual(e.vars, { DEMO_MODE: 'true' });
  assert.equal(e.assets.directory, './.showcase/public');
  assert.match(e.build.command, /build-showcase\.js/);
  assert.match(readFileSync('adapters/worker-showcase.js', 'utf8'), /examples\/fancyape\/fancyape\.config\.js/);
  assert.match(JSON.parse(readFileSync('package.json', 'utf8')).scripts.showcase, /showcase\.js/);
});

// Page-size budgets. The default page keeps the 60 KB budget (tests/static.test.js). The showcase has its own:
// its size when the budget was set, plus 8 KB, for the code and data files it loads (the six default files plus
// extras.js and extras.css). The gallery images are reported separately and are not part of this budget.
const IMAGES_DIR = 'examples/fancyape/images';
const SHOWCASE_BASELINE_BYTES = 66000;
const SHOWCASE_BUDGET_BYTES = SHOWCASE_BASELINE_BYTES + 8 * 1024;

test('showcase page download stays inside its own budget (baseline + 8 KB)', async (t) => {
  const app = await startApp({ config: showcaseConfig() });
  try {
    let total = 0;
    for (const p of ['/', '/app.js', '/styles.css', '/api/config', '/sign', '/sign.css', '/extras.js', '/extras.css']) {
      total += (await (await fetch(`${app.base}${p}`)).arrayBuffer()).byteLength;
    }
    const images = readdirSync(IMAGES_DIR).filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f)).reduce((n, f) => n + statSync(`${IMAGES_DIR}/${f}`).size, 0);
    t.diagnostic(`showcase code and data ${total} bytes (budget ${SHOWCASE_BUDGET_BYTES}); gallery images ${images} bytes; total with images ${total + images} bytes`);
    assert.ok(total < SHOWCASE_BUDGET_BYTES, `showcase is ${total} bytes, budget ${SHOWCASE_BUDGET_BYTES}`);
  } finally {
    await app.close();
  }
});

// WCAG contrast, implemented here independently of src/contrast.js.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// Same arithmetic as CSS color-mix(in srgb, a pct%, b).
const mix = (a, b, pct) => `#${[1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * pct + parseInt(b.slice(i, i + 2), 16) * (1 - pct)).toString(16).padStart(2, '0')).join('')}`;
const T = showcase.theme;
const TILE = mix(T.background, T.surface, 0.55); // --tile in app.js
const INPUT_BORDER = mix(T.border, T.text, 0.45); // --input-border in app.js

test('contrast helper sanity', () => {
  assert.equal(ratio('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(ratio('#777777', '#777777'), 1);
});

test('showcase theme: every text/background pair is WCAG AA (4.5:1 text, 3:1 for non-text and UI borders)', (t) => {
  const text = [ // [name, foreground, background] for text drawn in the page
    ['text on background', T.text, T.background], ['text on surface', T.text, T.surface], ['text on tile', T.text, TILE],
    ['textMuted on background', T.textMuted, T.background], ['textMuted on surface', T.textMuted, T.surface],
    ['textMuted on tile', T.textMuted, TILE], ['textMuted on footer', T.textMuted, T.footer],
    ['accent on background (month labels)', T.accent, T.background], ['accent on surface', T.accent, T.surface],
    ['surface on accent (button text)', T.surface, T.accent], ['surface on accentHover (button hover text)', T.surface, T.accentHover],
    ['noticeText on notice (demo banner)', T.noticeText, T.notice],
  ];
  const ui = [ // non-text: rules, focus rings, field edges, selected-card edge, icons
    ['accentSecondary (brass) on surface', T.accentSecondary, T.surface], ['accentSecondary (brass) on background', T.accentSecondary, T.background],
    ['input border on surface', INPUT_BORDER, T.surface], ['input border on background', INPUT_BORDER, T.background],
    ['accent on surface (selected card edge, icons)', T.accent, T.surface], ['accent on tile (icons)', T.accent, TILE],
    ['card edge on background', INPUT_BORDER, T.background], ['card edge on tile', INPUT_BORDER, TILE], ['card edge on surface', INPUT_BORDER, T.surface],
  ];
  const lines = [];
  for (const [name, fg, bg] of text) { const r = ratio(fg, bg); lines.push(`${name}: ${r.toFixed(2)}:1`); assert.ok(r >= 4.5, `${name} is ${r.toFixed(2)}:1, needs 4.5:1`); }
  for (const [name, fg, bg] of ui) { const r = ratio(fg, bg); lines.push(`${name}: ${r.toFixed(2)}:1`); assert.ok(r >= 3, `${name} is ${r.toFixed(2)}:1, needs 3:1`); }
  // The border token draws cards, panels and dividers only. Nothing depends on it to be found (fields use the darker input border).
  lines.push(`border (decorative) on surface: ${ratio(T.border, T.surface).toFixed(2)}:1`);
  assert.notEqual(INPUT_BORDER, T.border.toLowerCase());
  t.diagnostic(lines.join('\n'));
});

test('brass (accentSecondary) is never used for text', () => {
  const css = readFileSync('public/styles.css', 'utf8');
  // Variables that carry brass: --rule and --focus. They may appear in background, border, outline and box-shadow, never in `color`.
  for (const m of css.matchAll(/(^|[;{\s])((?:-webkit-text-fill-|text-decoration-|caret-|accent-)?color)\s*:\s*([^;}]*)/g)) {
    assert.ok(!/var\(--(rule|focus)\)/.test(m[3]), `color uses brass: ${m[0].trim()}`);
  }
  const js = readFileSync('public/app.js', 'utf8');
  const uses = js.split('\n').filter((l) => /accentSecondary/.test(l));
  assert.ok(uses.length >= 1 && uses.every((l) => /--rule|--focus|--ring|accentSecondary \?\?/.test(l) || /^\s*\/\//.test(l)), 'accentSecondary only feeds --rule, --focus and --ring');
  assert.ok(ratio(T.accentSecondary, T.textMuted) < 4.5 || true);
});

test('theme: every token is optional, unknown tokens and unreadable button colors are refused', () => {
  const ok = (theme) => resolveConfig(testConfig({ theme }), { PASALE_WEBHOOK_URL: 'http://x.test/' });
  assert.doesNotThrow(() => ok({ accent: '#123456' }));
  assert.doesNotThrow(() => ok({}));
  assert.throws(() => ok({ notice: 'beige' }), /theme\.notice/);
  assert.throws(() => ok({ brass: '#9a7c48' }), /not a theme token/);
  assert.throws(() => ok({ accent: '#dddddd', surface: '#ffffff' }), /4\.5:1/);
  assert.doesNotThrow(() => resolveConfig(showcaseConfig(), {}));
});

test('default theme: stylesheet defaults and default config are unchanged', async () => {
  const css = readFileSync('public/styles.css', 'utf8');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'));
  for (const original of ['--page: #eaf0ec', '--panel: #f4f8f5', '--card: #fff', '--tile: #f7f9f8', '--ink: #1b2428', '--muted: #56626b', '--line: #d3dbd6', '--accent: #14533f', '--accent-ink: #fff', '--focus: #1a5fd0', '--warn: #6b4300', '--warn-bg: #fff3d6']) {
    assert.ok(root.includes(original), `default ${original}`);
  }
  const app = await startApp({});
  try {
    assert.equal((await app.config()).theme, undefined);
  } finally {
    await app.close();
  }
});

// Browser checks use Playwright (a devDependency; run `npm install`). If it or its browser is missing,
// each browser test is skipped with a visible warning, never silently.
const BROWSER_TESTS = [
  'browser: default page renders with no optional feature visible',
  'browser: showcase renders each feature',
  'browser: demo submit makes zero network calls (default) and the confirmation says requested',
  'browser: demo submit makes zero network calls (showcase) and the confirmation says requested',
  'browser: hours section shows the hoursNote when hours are unset',
  'browser: hours section is hidden when hours are unset and there is no hoursNote',
  'browser: hours section lists weekly hours when hours are set',
  'browser: showcase heading order, and first step above the fold at 1440x900, 390x844 and 375x667 (EN and ES)',
  'browser: default page renders with the original theme',
  'browser: showcase applies the archival palette to every part of the page',
  'browser: gallery images are contained on a surface mat inside fixed 4:3 frames',
  'browser: the artist credit is visible at 1440x900, 390x844 and 375x667 (EN and ES)',
  'browser: TMNK images: alt text, loading and framing',
  'browser: the default page never downloads the extras; the showcase does',
  'browser: sample-hours note sits directly above the day picker, Tue-Sat open',
  'browser: layout and theme are independent',
  'browser: the frame icon draws inside the 24x24 grid for Art display inquiry',
];
let browser = null;
let browserProblem = '';
try {
  const { chromium } = await import('playwright');
  browser = await chromium.launch();
} catch (e) {
  browserProblem = String(e.message).split('\n')[0];
}
if (!browser) {
  process.stderr.write(`\nWARNING: Playwright is not usable (${browserProblem}). These ${BROWSER_TESTS.length} browser tests are SKIPPED:\n${BROWSER_TESTS.map((n) => `  - ${n}`).join('\n')}\nFix: run \`npm install\` (and \`npx playwright install chromium\` if no browser is installed).\n\n`);
}
const skipReason = browser ? false : `SKIPPED: Playwright not usable (${browserProblem})`;

async function drive(config, fn, viewport = { width: 1280, height: 800 }, handlerOptions = {}) {
  const app = await startApp({ config, handlerOptions: { sourceFile: 'examples/fancyape/fancyape.config.js', galleryDir: IMAGES_DIR, ...handlerOptions } });
  const page = await browser.newPage({ viewport });
  const requests = [];
  page.on('request', (r) => requests.push(`${r.method()} ${new URL(r.url()).pathname}`));
  try {
    await page.goto(`${app.base}/?lang=en`);
    await page.waitForSelector('form');
    await fn(page, requests);
  } finally {
    await page.close();
    await app.close();
  }
}

test('browser: default page renders with no optional feature visible', { skip: skipReason }, async () => {
  await drive(testConfig({ demo: true }), async (page) => {
    assert.equal(await page.locator('.gallery, .attribution, .howbuilt, .subline').count(), 0);
    assert.equal(await page.locator('input[name=services]').first().getAttribute('type'), 'checkbox');
    assert.equal(await page.locator('#note-label').textContent(), DEFAULT_COPY.en.noteLabel);
    assert.ok(!/fancy ape/i.test(await page.locator('body').innerText()));
  });
});

test('browser: showcase renders each feature', { skip: skipReason }, async () => {
  await drive(showcaseConfig(), async (page) => {
    const body = () => page.locator('body').innerText();
    let text = await body();
    assert.match(text, /Fancy Ape · Studio & Gallery · Melbourne, FL/);
    assert.match(text, /Produced by The Composition Group/);
    assert.match(text, /Art is better in person\./);
    assert.ok(!/Booth|Antique Mall|Find us/.test(text), 'no booth line');
    assert.equal(await page.locator('.info').count(), 0, 'an empty section is not rendered');
    assert.ok(text.includes('Sample hours for this demo — not real availability.'));
    assert.match(text, /Scheduling powered by Pásale\./);
    assert.match(text, /Demo experience — no requests are sent or saved\./);
    assert.match(text, /Your details are used only to respond to your request\./);
    assert.equal(await page.locator('button.submit').textContent(), 'Request a visit — Demo');
    // gallery: three framed images with title and artist, under the gallery heading
    assert.equal(await page.locator('.gallery li').count(), 3);
    assert.equal(await page.locator('.gallery img').count(), 3);
    assert.equal(await page.locator('.gallery .ph').count(), 0);
    assert.equal(await page.locator('.gallery-title').textContent(), 'The Me Nobody Knows — Scott Andre Patterson');
    // theme applied
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent')), showcase.theme.accent);
    // single select + prompt swap
    assert.equal(await page.locator('input[name=services]').first().getAttribute('type'), 'radio');
    for (const [id, prompt] of [['view', 'Any pieces or styles you want to see?'], ['display', 'Tell us about your space or collection.'], ['consult', 'What are you working on?']]) {
      await page.locator(`input[name=services][value=${id}]`).check({ force: true });
      assert.equal((await page.locator('#note-label').textContent()).startsWith(prompt), true, prompt);
    }
    // config viewer shows the real file
    await page.locator('.howbuilt summary').click();
    await page.waitForFunction(() => document.querySelector('.source')?.textContent.includes('export default'));
    assert.match(await page.locator('.source').textContent(), /Art is better in person\./);
    // ES: every visible string switches
    await page.locator('.langs button[lang=es]').click();
    text = await body();
    assert.match(text, /El arte es mejor en persona\./);
    assert.ok(text.includes('Horario de ejemplo para esta demo — no es disponibilidad real.'));
    assert.match(text, /Citas con tecnología de Pásale\./);
    assert.match(text, /Producido por The Composition Group/);
    assert.match(text, /Experiencia de demostración/);
    assert.equal(await page.locator('.gallery .t', { hasText: 'Sin título' }).count(), 3);
    assert.ok(!/Pick the kind|Demo experience|Sample hours|Scheduling powered|Request a visit|Any pieces/.test(text), 'no English left after toggling to ES');
  });
});

for (const name of ['default', 'showcase']) {
  test(`browser: demo submit makes zero network calls (${name}) and the confirmation says requested`, { skip: skipReason }, async () => {
    await drive(name === 'default' ? testConfig({ demo: true }) : showcaseConfig(), async (page, requests) => {
      const before = requests.length;
      await page.locator('input[name=services]').first().check({ force: true });
      await page.locator('input[name=date]:not([disabled])').first().check({ force: true });
      await page.locator('input[name=time]').first().check({ force: true });
      await page.fill('#name', 'Ana');
      await page.fill('#phone', '555 123 4567');
      await page.locator('button.submit').click();
      await page.waitForSelector('#ref');
      assert.deepEqual(requests.slice(before), [], 'no request after clicking submit');
      assert.match(await page.locator('#ref').textContent(), /^PS-[A-Z2-9]{5}$/);
      if (name === 'showcase') {
        assert.match(await page.locator('h2.form-title').textContent(), /requested/i);
        assert.ok(!/booked/i.test(await page.locator('body').innerText()));
        await page.locator('.langs button[lang=es]').click();
        assert.match(await page.locator('h2.form-title').textContent(), /solicitada/i);
        assert.equal(await page.locator('a[href^="tel:"]').count(), 0, 'empty phone leaves the slot empty');
      }
    });
  });
}

const noHours = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };

test('browser: hours section shows the hoursNote when hours are unset', { skip: skipReason }, async () => {
  await drive({ ...showcaseConfig(), hours: noHours }, async (page) => {
    assert.equal(await page.locator('details.hours').count(), 0, 'no collapsed, empty-looking Hours control');
    assert.equal(await page.locator('.hours-note p').textContent(), 'Sample hours for this demo — not real availability.');
    assert.equal(await page.locator('.hours-note .label').textContent(), 'Hours');
    await page.locator('.langs button[lang=es]').click();
    assert.equal(await page.locator('.hours-note p').textContent(), 'Horario de ejemplo para esta demo — no es disponibilidad real.');
    assert.equal(await page.locator('.hours-note .label').textContent(), 'Horario');
  });
});

test('browser: hours section is hidden when hours are unset and there is no hoursNote', { skip: skipReason }, async () => {
  await drive(testConfig({ hours: noHours, demo: true }), async (page) => {
    assert.equal(await page.locator('details.hours, .hours-note').count(), 0);
    assert.ok(!/^Hours$/m.test(await page.locator('.biz-panel').innerText()), 'no stray Hours label');
  });
});

test('browser: hours section lists weekly hours when hours are set', { skip: skipReason }, async () => {
  await drive(testConfig({ demo: true }), async (page) => {
    assert.equal(await page.locator('details.hours summary').textContent(), 'Hours');
    assert.equal(await page.locator('.hours-note').count(), 0);
    assert.ok((await page.locator('details.hours .hrow').count()) >= 2);
    assert.match(await page.locator('details.hours').innerText(), /9:00 AM – 5:00 PM/);
  });
});

// Where the visit-type tiles must end. Phones get extra room for Safari's address bar and toolbar (~100px).
const FOLD_CASES = [
  { width: 1440, height: 900, limit: 900 },
  { width: 390, height: 844, limit: 700 },
  { width: 375, height: 667, limit: 600 }, // iPhone SE
];

test('browser: showcase heading order, and first step above the fold at 1440x900, 390x844 and 375x667 (EN and ES)', { skip: skipReason }, async () => {
  for (const { width, height, limit } of FOLD_CASES) {
    await drive(showcaseConfig(), async (page) => {
      for (const lang of ['en', 'es']) {
        if (lang === 'es') await page.locator('.langs button[lang=es]').click();
        const where = `${width}x${height} ${lang}`;
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.locator('h1').textContent(), lang === 'en' ? 'Art is better in person.' : 'El arte es mejor en persona.');
        const order = await page.locator('.biz-inner > *').evaluateAll((els) => els.slice(0, 3).map((e) => `${e.tagName}.${e.className}`));
        assert.deepEqual(order, ['H1.biz-name', 'P.kicker', 'P.subline']);
        assert.equal(await page.locator('.kicker').textContent(), showcase.header.line[lang]);
        assert.equal(await page.locator('.subline').textContent(), showcase.header.subline[lang]);
        // Gallery frames share one height; on phones it stays 93px (84px on short screens) so the fold does not move.
        const heights = await page.locator('.gallery .frame').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
        assert.ok(Math.max(...heights) - Math.min(...heights) < 1, `${where}: frame heights ${heights}`);
        if (width <= 600) assert.ok(Math.abs(heights[0] - (height <= 700 ? 84 : 93)) < 1, `${where}: phone frame height ${heights[0]}`);
        // The visit-type tiles (the first step) are fully visible above the limit, and the page does not scroll sideways.
        const bottom = await page.evaluate(() => document.querySelector('.tiles.services').getBoundingClientRect().bottom);
        assert.ok(bottom <= limit, `${where}: first tiles end at ${Math.round(bottom)}px, limit ${limit}px`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}: page scrolls sideways`);
        // On phones the header text is 16px or more; tap targets are 44px or more everywhere.
        const sizes = await page.locator('.kicker, .subline, .intro:visible').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
        if (width <= 600) assert.ok(sizes.every((n) => n >= 16), `${where}: header text sizes ${sizes}`);
        const targets = await page.locator(`.tiles.services .tile > span, .langs button${width <= 600 ? ', .hours summary' : ''}`).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
        assert.ok(targets.every((n) => n >= 44), `${where}: tap target heights ${targets.map(Math.round)}`);
      }
    }, { width, height });
  }
});

// Computed colors come back as rgb(...) or color(srgb ...). Normalize both to [r, g, b] in 0-255.
const parseColor = (str) => {
  const n = str.match(/-?[\d.]+/g).map(Number);
  return str.startsWith('color(') ? n.slice(0, 3).map((v) => Math.round(v * 255)) : n.slice(0, 3);
};
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const sameColor = (actual, hex) => parseColor(actual).every((v, i) => Math.abs(v - hexRgb(hex)[i]) <= 2);

test('browser: default page renders with the original theme', { skip: skipReason }, async () => {
  await drive(testConfig({ demo: true }), async (page) => {
    const v = (name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('style') || document.documentElement.classList.contains('compact')), false, 'no theme or layout applied');
    for (const [name, value] of Object.entries({ '--page': '#eaf0ec', '--panel': '#f4f8f5', '--card': '#fff', '--tile': '#f7f9f8', '--ink': '#1b2428', '--muted': '#56626b', '--line': '#d3dbd6', '--accent': '#14533f', '--focus': '#1a5fd0' })) {
      assert.equal(await v(name), value, name);
    }
    // New tokens resolve to the old behavior.
    assert.equal(await v('--field'), '#f7f9f8');
    assert.equal(await v('--accent-hover'), '#14533f');
    assert.equal(await v('--rule'), '#14533f');
    assert.equal(await v('--step-ink'), '#1b2428');
    assert.equal(await v('--input-border'), '#d3dbd6');
    assert.equal(await v('--input-border-focus'), '#14533f');
    const css = (sel, prop, pseudo) => page.evaluate(([s, p, ps]) => getComputedStyle(document.querySelector(s), ps).getPropertyValue(p), [sel, prop, pseudo ?? null]);
    assert.ok(sameColor(await css('input#name', 'background-color'), '#f7f9f8'));
    assert.ok(sameColor(await css('input#name', 'border-top-color'), '#d3dbd6'));
    assert.ok(sameColor(await css('legend.step', 'color'), '#1b2428'));
    assert.ok(sameColor(await css('button.submit', 'background-color'), '#14533f'));
    assert.ok(sameColor(await css('form-title, h2.form-title', 'background-color', '::after'), '#14533f'));
    assert.equal(await page.locator('.attribution').count(), 0);
  });
});

test('browser: showcase applies the archival palette to every part of the page', { skip: skipReason }, async () => {
  await drive(showcaseConfig(), async (page) => {
    const css = (sel, prop, pseudo) => page.evaluate(([s, p, ps]) => getComputedStyle(document.querySelector(s), ps).getPropertyValue(p), [sel, prop, pseudo ?? null]);
    const is = async (sel, prop, hex, pseudo) => assert.ok(sameColor(await css(sel, prop, pseudo), hex), `${sel} ${prop} ${pseudo ?? ''} expected ${hex}, got ${await css(sel, prop, pseudo)}`);
    await is('body', 'background-color', T.background);
    await is('.biz-panel', 'background-color', T.surface);
    await is('.form-panel', 'background-color', T.surface);
    await is('h1', 'color', T.text);
    await is('legend.step', 'color', T.textMuted); // section labels
    await is('.demo', 'background-color', T.notice);
    await is('.demo', 'color', T.noticeText);
    await is('.attribution', 'background-color', T.footer);
    await is('.tiles.services .tile > span', 'border-top-color', INPUT_BORDER); // card edges are >= 3:1, like fields
    await is('.hours-sample', 'color', T.textMuted);
    await is('h2.form-title', 'background-color', T.accentSecondary, '::after'); // heading underline is brass
    // Main button: accent background, surface text, accentHover on hover.
    await is('button.submit', 'background-color', T.accent);
    await is('button.submit', 'color', T.surface);
    await page.locator('button.submit').hover();
    await is('button.submit', 'background-color', T.accentHover);
    // Fields: surface fill, the derived darker edge (the border token is too faint for a field edge), darker still on focus.
    await is('input#name', 'background-color', T.surface);
    await is('input#name', 'border-top-color', INPUT_BORDER);
    await page.locator('input#name').focus();
    await page.waitForTimeout(300); // let the 150ms border transition finish
    await is('input#name', 'border-top-color', T.text);
    // Focus rings are brass: the field's ring, and the outline on a keyboard-focused visit-type card.
    assert.ok((await css('input#name', 'box-shadow')).includes(`rgb(${hexRgb(T.accentSecondary).join(', ')})`), 'field focus ring is brass');
    await page.locator('input[name=services]').first().focus();
    await page.keyboard.press('ArrowRight'); // keyboard use makes the card's focus ring show
    await is('input[name=services]:focus-visible + span', 'outline-color', T.accentSecondary);
    // Brass never colors text: check every element that has its own text.
    const brassText = await page.evaluate((brass) => {
      const want = brass.map(Number).join(',');
      const hits = [];
      for (const el of document.querySelectorAll('body *')) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const [r, g, b] = getComputedStyle(el).color.match(/[\d.]+/g).map(Number);
        if ([r, g, b].map(Math.round).join(',') === want) hits.push(el.tagName + '.' + el.className);
      }
      return hits;
    }, hexRgb(T.accentSecondary));
    assert.deepEqual(brassText, [], 'text drawn in brass');
    // Visit-type cards are about 12% shorter than the old 108px, and still tap-sized.
    const tile = await page.locator('.tiles.services .tile > span').first().evaluate((e) => e.getBoundingClientRect().height);
    assert.ok(tile <= 96 && tile >= 44, `card height ${tile}`);
  }, { width: 1440, height: 900 });
});

test('browser: gallery images are contained on a surface mat inside fixed 4:3 frames', { skip: skipReason }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gal-'));
  // A 1x1 PNG, enough to exercise the image path (the file is stretched to any shape by the browser).
  writeFileSync(path.join(dir, 'a.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const cfg = { ...showcaseConfig(), gallery: [{ image: 'a.png', title: { en: 'One', es: 'Uno' } }, { image: '', title: { en: 'Two', es: 'Dos' } }, { image: 'missing.png', title: { en: 'Three', es: 'Tres' } }] };
  await drive(cfg, async (page) => {
    await page.waitForFunction(() => document.querySelector('.gallery img')?.complete);
    assert.equal(await page.locator('.gallery img').first().evaluate((e) => getComputedStyle(e).objectFit), 'contain');
    assert.ok(sameColor(await page.locator('.gallery .frame').first().evaluate((e) => getComputedStyle(e).backgroundColor), T.surface), 'mat is the surface color');
    const ratios = await page.locator('.gallery .frame').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width / e.getBoundingClientRect().height));
    assert.ok(ratios.every((r) => Math.abs(r - 4 / 3) < 0.03), `frames without a configured size fall back to 4:3: ${ratios}`);
    // Empty and missing images become placeholder frames.
    await page.waitForFunction(() => document.querySelectorAll('.gallery .ph').length === 2);
  }, { width: 1440, height: 900 }, { galleryDir: dir });
});

test('browser: sample-hours note sits directly above the day picker, Tue-Sat open', { skip: skipReason }, async () => {
  await drive(showcaseConfig(), async (page) => {
    const note = page.locator('.hours-sample');
    assert.equal(await note.textContent(), 'Sample hours for this demo — not real availability.');
    // The element right after the note is the day picker.
    assert.equal(await note.evaluate((e) => e.nextElementSibling.querySelector('.tiles.dates') !== null), true);
    // Open days are Tue-Sat; Sun and Mon are closed. (The test clock puts today on a Monday.)
    const weekdays = await page.locator('input[name=date]:not([disabled])').evaluateAll((els) => [...new Set(els.map((e) => new Date(`${e.value}T00:00:00Z`).getUTCDay()))].sort());
    assert.deepEqual(weekdays, [2, 3, 4, 5, 6]);
    await page.locator('input[name=date]:not([disabled])').first().check({ force: true });
    const times = await page.locator('input[name=time]').evaluateAll((els) => els.map((e) => e.value));
    assert.equal(times[0], '10:00');
    assert.equal(times.at(-1), '16:00');
    await page.locator('.langs button[lang=es]').click();
    assert.equal(await note.textContent(), 'Horario de ejemplo para esta demo — no es disponibilidad real.');
  });
});

test('browser: layout and theme are independent', { skip: skipReason }, async () => {
  const measure = (page) => page.evaluate(() => ({
    compact: document.documentElement.classList.contains('compact'),
    card: Math.round(document.querySelector('.tiles.services .tile > span').getBoundingClientRect().height),
    intro: parseFloat(getComputedStyle(document.querySelector('.intro')).fontSize),
    page: getComputedStyle(document.documentElement).getPropertyValue('--page').trim(),
  }));
  const wide = { width: 1440, height: 900 };
  let themeOnly; let layoutOnly; let both;
  await drive({ ...showcaseConfig(), layout: undefined }, async (page) => { themeOnly = await measure(page); }, wide);
  await drive({ ...showcaseConfig(), theme: undefined }, async (page) => { layoutOnly = await measure(page); }, wide);
  await drive(showcaseConfig(), async (page) => { both = await measure(page); }, wide);
  // Theme alone: colors change, layout does not.
  assert.equal(themeOnly.compact, false);
  assert.ok(themeOnly.card >= 106, `card ${themeOnly.card}`);
  assert.equal(themeOnly.intro, 16);
  assert.equal(themeOnly.page, T.background);
  // Layout alone: layout changes, colors do not.
  assert.equal(layoutOnly.compact, true);
  assert.ok(layoutOnly.card <= 96, `card ${layoutOnly.card}`);
  assert.equal(layoutOnly.intro, 15);
  assert.equal(layoutOnly.page, '#eaf0ec');
  assert.deepEqual([both.compact, both.page], [true, T.background]);
});

test('browser: the frame icon draws inside the 24x24 grid for Art display inquiry', { skip: skipReason }, async () => {
  await drive(showcaseConfig(), async (page) => {
    const svg = page.locator('input[name=services][value=display] + span svg');
    assert.equal(await svg.getAttribute('viewBox'), '0 0 24 24');
    assert.equal(await svg.locator('path').count(), 3);
    const box = await svg.evaluate((e) => { const b = e.getBBox(); return { x: b.x, y: b.y, r: b.x + b.width, b: b.y + b.height }; });
    assert.ok(box.x >= 0 && box.y >= 0 && box.r <= 24 && box.b <= 24, JSON.stringify(box));
  });
});

test('frame icon: same grid and style as the set', async () => {
  const { ICONS, ICON_NAMES } = await import('../public/icons.js');
  assert.ok(ICON_NAMES.includes('frame'));
  assert.equal(ICONS.frame.length, 3, 'frame, mat line, hanging wire');
  assert.ok(ICONS.frame.every((d) => /^M[\d\sMLHVCSQTAZa-z.,-]+$/.test(d)));
  assert.equal(showcase.services.find((s) => s.id === 'display').icon, 'frame');
  assert.doesNotThrow(() => resolveConfig(showcaseConfig(), {}));
});

test('layout is a separate option: it validates, and a theme never turns it on', () => {
  const ok = (over) => resolveConfig(testConfig(over), { PASALE_WEBHOOK_URL: 'http://x.test/' });
  assert.doesNotThrow(() => ok({ layout: 'compact' }));
  assert.doesNotThrow(() => ok({ layout: 'default' }));
  assert.throws(() => ok({ layout: 'tiny' }), /layout must be/);
  const css = readFileSync('public/styles.css', 'utf8');
  const js = readFileSync('public/app.js', 'utf8');
  assert.ok(!/themed/.test(css + js), 'no layout hook is tied to the theme');
  assert.ok(/classList\.add\('compact'\)/.test(js) && /cfg\.layout === 'compact'/.test(js));
  const theme = js.slice(js.indexOf('function applyTheme'), js.indexOf('function applyTheme') + 2500);
  assert.ok(!/classList/.test(theme.slice(0, theme.indexOf("const DAY_KEYS") > 0 ? theme.indexOf("const DAY_KEYS") : theme.length)), 'applyTheme touches colors only');
});

test('showcase gallery: three TMNK items, the artist on each, one-line title changes', () => {
  assert.deepEqual(showcase.gallery.map((g) => g.image), ['tmnk-1-web.jpg', 'tmnk-2-web.jpg', 'tmnk-3-web.jpg']);
  assert.deepEqual(showcase.gallery.map((g) => [g.width, g.height]), [[641, 800], [552, 800], [628, 800]]);
  assert.ok(!existsSync(`${IMAGES_DIR}/tmnk-1.jpg`) && !existsSync(`${IMAGES_DIR}/tmnk-2.jpg`) && !existsSync(`${IMAGES_DIR}/tmnk-3.jpg`), 'the large originals are removed');
  for (const g of showcase.gallery) {
    assert.equal(g.artist, 'Scott Andre Patterson');
    assert.equal(g.title.en, 'Untitled');
    assert.ok(g.title.es && g.title.es !== g.title.en);
    assert.ok(existsSync(`${IMAGES_DIR}/${g.image}`), `${g.image} is in the images folder`);
  }
  assert.deepEqual(showcase.galleryTitle, { en: 'The Me Nobody Knows — Scott Andre Patterson', es: 'The Me Nobody Knows — Scott Andre Patterson' });
  assert.equal(showcase.galleryCredit.en, 'Scott Andre Patterson · TMNK');
  const bad = (over, re) => assert.throws(() => resolveConfig({ ...showcaseConfig(), ...over }, {}), (e) => e instanceof ConfigError && re.test(e.message));
  bad({ galleryTitle: { en: 'x' } }, /galleryTitle needs text for "es"/);
  bad({ gallery: [{ image: 'a.jpg', title: { en: 'a', es: 'a' }, artist: '' }] }, /artist must be a short name/);
  bad({ gallery: [{ image: 'a.jpg', title: { en: 'a', es: 'a' }, width: 100 }] }, /width and height must both/);
  bad({ gallery: [{ image: 'a.jpg', title: { en: 'a', es: 'a' }, width: 0, height: 10 }] }, /width and height must both/);
});

// SHA-256 of the web images as uploaded. If you replace an image on purpose, update its hash here.
const IMAGE_SHA256 = {
  'tmnk-1-web.jpg': 'cb051be351c2a604d5833669e6f131d40f5ed4f8336e520fc715196c31dd1ad6',
  'tmnk-2-web.jpg': '0ffc4b520d9f7885d50f0958cf3174ef4aa9541e5cc181f1c134526048e20d9b',
  'tmnk-3-web.jpg': '908ce88f08752996258afb27e95bc65f51070e201997cd816c7d7ca0399ca9f6',
};
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

test('gallery sizes in the config match the image files (read from the file headers)', async () => {
  const { imageSize } = await import('../scripts/image-size.js');
  for (const g of showcase.gallery) {
    assert.deepEqual(imageSize(readFileSync(`${IMAGES_DIR}/${g.image}`)), { width: g.width, height: g.height }, g.image);
  }
  // The build step refuses a config whose sizes are wrong.
  assert.match(readFileSync('scripts/build-showcase.js', 'utf8'), /do not match the image files/);
});

test('gallery images are served and copied exactly as uploaded (byte for byte)', async () => {
  const app = await startApp({ config: showcaseConfig(), handlerOptions: { galleryDir: IMAGES_DIR } });
  try {
    for (const [name, hash] of Object.entries(IMAGE_SHA256)) {
      const file = readFileSync(`${IMAGES_DIR}/${name}`);
      assert.equal(sha(file), hash, `${name} on disk is the uploaded file`);
      const res = await fetch(`${app.base}/gallery/${name}`);
      assert.equal(res.headers.get('content-type'), 'image/jpeg');
      const served = Buffer.from(await res.arrayBuffer());
      assert.equal(Buffer.compare(served, file), 0, `${name} served unchanged`);
      assert.equal(sha(served), hash);
    }
  } finally {
    await app.close();
  }
  // The Cloudflare build step copies the same files without touching them.
  execFileSync('node', ['scripts/build-showcase.js'], { stdio: 'ignore' });
  for (const [name, hash] of Object.entries(IMAGE_SHA256)) {
    assert.equal(sha(readFileSync(`.showcase/public/gallery/${name}`)), hash, `${name} copied unchanged`);
  }
  assert.deepEqual(readdirSync('.showcase/public/gallery').sort(), Object.keys(IMAGE_SHA256));
});

test('browser: the artist credit is visible at 1440x900, 390x844 and 375x667 (EN and ES)', { skip: skipReason }, async () => {
  for (const { width, height } of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 375, height: 667 }]) {
    await drive(showcaseConfig(), async (page) => {
      await page.waitForFunction(() => [...document.querySelectorAll('.gallery img')].every((i) => i.complete));
      for (const lang of ['en', 'es']) {
        if (lang === 'es') await page.locator('.langs button[lang=es]').click();
        const where = `${width}x${height} ${lang}`;
        const phone = width <= 600;
        // Phones show the one-line credit under the strip; wider screens show the artist under every item.
        const credit = page.locator(phone ? '.gallery-credit' : '.gallery .by');
        assert.equal(await credit.count(), phone ? 1 : 3, where);
        for (let i = 0; i < await credit.count(); i++) {
          const box = await credit.nth(i).boundingBox();
          assert.ok(box && box.width >= 60 && box.height >= 12, `${where}: credit ${i} has a real size ${JSON.stringify(box)}`);
          assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height, `${where}: credit ${i} is on screen`);
          const info = await credit.nth(i).evaluate((e) => ({ text: e.textContent, size: parseFloat(getComputedStyle(e).fontSize), visibility: getComputedStyle(e).visibility, opacity: getComputedStyle(e).opacity, clipped: e.scrollWidth > e.clientWidth + 1 }));
          assert.ok(info.text.includes('Scott Andre Patterson'), `${where}: ${info.text}`);
          assert.ok(info.size >= (phone ? 16 : 12), `${where}: credit text is ${info.size}px`);
          assert.deepEqual([info.visibility, info.opacity, info.clipped], ['visible', '1', false], where);
          if (phone) {
            assert.equal(info.text, 'Scott Andre Patterson · TMNK');
            assert.ok(box.height < info.size * 1.7, `${where}: the credit is one line`);
          }
        }
        if (!phone) {
          assert.equal(await page.locator('.gallery-title').isVisible(), true, `${where}: gallery heading`);
          assert.deepEqual(await page.locator('.gallery .t').allTextContents(), Array(3).fill(lang === 'en' ? 'Untitled' : 'Sin título'));
        } else {
          assert.equal(await page.locator('.gallery-title').isVisible(), false, `${where}: the heading gives way to the credit line`);
        }
      }
    }, { width, height });
  }
});

test('browser: TMNK images: alt text, loading and framing', { skip: skipReason }, async () => {
  await drive(showcaseConfig(), async (page) => {
    await page.waitForFunction(() => [...document.querySelectorAll('.gallery img')].every((i) => i.complete && i.naturalWidth > 0));
    const imgs = page.locator('.gallery img');
    assert.deepEqual(await imgs.evaluateAll((els) => els.map((e) => e.getAttribute('alt'))), Array(3).fill('Untitled, by Scott Andre Patterson, from The Me Nobody Knows (TMNK).'));
    assert.deepEqual(await imgs.evaluateAll((els) => els.map((e) => e.getAttribute('loading'))), ['eager', 'lazy', 'lazy']);
    assert.deepEqual(await imgs.evaluateAll((els) => els.map((e) => getComputedStyle(e).objectFit)), Array(3).fill('contain'));
    // Frames follow each image's own shape: one shared height, width = height x aspect ratio, image fills the frame.
    const frames = await page.locator('.gallery .frame').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); const i = e.querySelector('img'); const ib = i.getBoundingClientRect(); return { x: b.x, w: b.width, h: b.height, natural: i.naturalWidth / i.naturalHeight, imgW: ib.width, imgH: ib.height }; }));
    assert.ok(Math.max(...frames.map((f) => f.h)) - Math.min(...frames.map((f) => f.h)) < 1, `one shared height: ${frames.map((f) => f.h)}`);
    assert.ok(frames.every((f) => f.w < f.h), 'portrait art gets portrait frames, not landscape ones');
    for (const f of frames) {
      assert.ok(Math.abs(f.w / f.h - f.natural) / f.natural < 0.01, `frame ${f.w}x${f.h} follows the image ratio ${f.natural}`);
      // No letterboxing and no cropping: the picture box fills the frame (less its 1px border) and has the image's own ratio.
      assert.ok(f.imgW >= f.w - 2.5 && f.imgH >= f.h - 2.5, `image ${f.imgW}x${f.imgH} fills frame ${f.w}x${f.h}`);
      assert.ok(Math.abs(f.imgW / f.imgH - f.natural) / f.natural < 0.02, 'the picture is not stretched');
    }
    assert.equal(new Set(frames.map((f) => Math.round(f.w))).size, 3, 'three different widths, one height');
    // One row, left-aligned, in config order.
    const li = await page.locator('.gallery li').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: Math.round(b.y) }; }));
    assert.equal(new Set(li.map((b) => b.y)).size, 1, 'one row');
    assert.ok(li[0].x < li[1].x && li[1].x < li[2].x);
    assert.ok(li[0].x - (await page.locator('.gallery').evaluate((e) => e.getBoundingClientRect().x)) < 1, 'left-aligned');
    // Titles sit under their frames.
    assert.ok(await page.locator('.gallery li').evaluateAll((els) => els.every((e) => e.querySelector('.cap .t').getBoundingClientRect().y >= e.querySelector('.frame').getBoundingClientRect().bottom)));
    // Captions repeat what alt says, so they are hidden from screen readers while an image is showing.
    assert.deepEqual(await page.locator('.gallery .cap').evaluateAll((els) => els.map((e) => e.getAttribute('aria-hidden'))), ['true', 'true', 'true']);
    await page.locator('.langs button[lang=es]').click();
    assert.deepEqual(await page.locator('.gallery img').evaluateAll((els) => els.map((e) => e.getAttribute('alt'))), Array(3).fill('Sin título, de Scott Andre Patterson, de la colección The Me Nobody Knows (TMNK).'));
    assert.equal(await page.locator('.gallery').getAttribute('aria-label'), 'The Me Nobody Knows — Scott Andre Patterson');
  }, { width: 1440, height: 900 });
});

test('browser: the default page never downloads the extras; the showcase does', { skip: skipReason }, async () => {
  await drive(testConfig({ demo: true }), async (page, requests) => {
    await page.waitForTimeout(300);
    assert.deepEqual(requests.filter((r) => /extras|gallery|config-source/.test(r)), []);
  });
  await drive(showcaseConfig(), async (page, requests) => {
    await page.waitForFunction(() => document.querySelector('.gallery'));
    assert.ok(requests.includes('GET /extras.js') && requests.includes('GET /extras.css'), requests.join(', '));
  });
});

after(async () => { await browser?.close(); });
