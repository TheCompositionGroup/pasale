import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startApp, startInbox, testConfig } from './helpers.js';
import { resolveConfig, ConfigError } from '../src/config.js';
import { DEFAULT_COPY } from '../src/defaults.js';
import base from '../config/pasale.config.js';
import showcase from '../examples/fancyape/fancyape.config.js';

const OPTIONAL_OFF = { servicePrompts: null, gallery: null, theme: null, hoursNote: null, attribution: null, header: null, showConfig: false, timeOptional: false, serviceSelect: 'multiple' };
const showcaseConfig = () => ({ ...showcase, business: { ...showcase.business } });
const EXISTING_FANCYAPE_URLS = /pasale\.fancyape\.workers\.dev|www\.fancyape\.com\/projects/g;

test('default config: every optional feature is off', async () => {
  const app = await startApp({});
  const cfg = await app.config();
  for (const [k, v] of Object.entries(OPTIONAL_OFF)) assert.deepEqual(cfg[k], v, k);
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
  assert.equal(cfg.timeOptional, true);
  assert.equal(cfg.header.line.en, 'Fancy Ape · Studio & Gallery · Melbourne, FL');
  assert.equal(cfg.header.subline.en, 'Produced by The Composition Group');
  assert.equal(cfg.header.location.en, "Retail at America's Antique Mall, Booth 117");
  assert.equal(cfg.copy.en.title, 'Art is better in person.');
  assert.equal(cfg.business.phone, '');
  await app.close();
});

test('showcase content rules: no registered mark, no third-party art, hours empty, booth is retail', () => {
  const text = readFileSync('examples/fancyape/fancyape.config.js', 'utf8');
  assert.ok(!text.includes('®'));
  assert.ok(!/oeno|sasha|boxdrop|acima/i.test(text));
  assert.ok(!/private|appointment/i.test(JSON.stringify(showcase.header)));
  assert.ok(Object.values(showcase.hours).every((h) => h === null));
  assert.equal(showcase.business.phone, '');
  assert.ok(showcase.gallery.every((g) => !g.image || !/^https?:/i.test(g.image)));
  assert.match(readFileSync('examples/fancyape/images/README.md', 'utf8'), /Add 3 artwork files you own\./);
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
  assert.ok(pairs.length >= 14);
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

test('showcase theme text and accent meet WCAG AA contrast on their backgrounds', () => {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const t = showcase.theme;
  for (const bg of [t.background, t.surface]) {
    assert.ok(ratio(t.text, bg) >= 4.5, 'text');
    assert.ok(ratio(t.accent, bg) >= 4.5, 'accent');
  }
});

// showConfig shows the example's config file to every visitor, so it must hold nothing secret.
// Secrets belong in environment variables (RESEND_API_KEY, PASALE_WEBHOOK_URL), never in the file.
function findSecrets(text) {
  const found = [];
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/.test(text)) found.push('email address');
  if (/https?:\/\/[^\s'"]*(hooks?\.|webhook|\/hooks?\/|zapier|make\.com|n8n|discord(app)?\.com\/api|slack\.com\/services)/i.test(text)) found.push('webhook URL');
  if (/\b(sk|re|pk|ghp|xox[bap])[-_][A-Za-z0-9_-]{16,}/.test(text)) found.push('API key or token value');
  if (/^\s*['"]?[A-Za-z_]*(key|token|secret|password)[A-Za-z_]*['"]?\s*:/im.test(text)) found.push('field named key, token, secret or password');
  return found;
}

test('secrets guard: the checker catches what it should', () => {
  assert.deepEqual(findSecrets("ownerEmail: 'a@b.com'"), ['email address']);
  assert.deepEqual(findSecrets("url: 'https://hooks.slack.com/services/T0/B0/x'"), ['webhook URL']);
  assert.deepEqual(findSecrets("apiKey: 'x'"), ['field named key, token, secret or password']);
  assert.deepEqual(findSecrets("secret: 'x'"), ['field named key, token, secret or password']);
  assert.deepEqual(findSecrets("token: 'x'"), ['field named key, token, secret or password']);
  assert.deepEqual(findSecrets("k: 're_abcdefghijklmnop1234'"), ['API key or token value']);
  assert.deepEqual(findSecrets("publicUrl: 'https://example.com/'"), []);
});

test('showConfig output (the config file as served) contains no email, webhook URL, key, token or secret', async () => {
  const file = 'examples/fancyape/fancyape.config.js';
  const app = await startApp({ config: showcaseConfig(), handlerOptions: { sourceFile: file } });
  const served = await (await fetch(`${app.base}/config-source.txt`)).text();
  await app.close();
  assert.equal(served, readFileSync(file, 'utf8'), 'the served text is the file itself');
  assert.deepEqual(findSecrets(served), []);
  // The resolved config object has no such fields either, at any depth.
  const names = [];
  const walk = (v) => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { names.push(k); walk(x); } };
  walk(showcase);
  assert.deepEqual(names.filter((n) => /key|token|secret|password|ownerEmail|webhook/i.test(n)), []);
  // The build step publishes a copy of the same file; it must be the file this test checked.
  assert.match(readFileSync('scripts/build-showcase.js', 'utf8'), /examples\/fancyape\/fancyape\.config\.js/);
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
  'browser: showcase heading order and first step above the fold (1440x900, 390x844)',
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

async function drive(config, fn, viewport = { width: 1280, height: 800 }) {
  const app = await startApp({ config, handlerOptions: { sourceFile: 'examples/fancyape/fancyape.config.js' } });
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
    assert.match(text, /Retail at America's Antique Mall, Booth 117/);
    assert.match(text, /Hours: set by business/);
    assert.match(text, /Scheduling powered by Pásale\./);
    assert.match(text, /Demo experience — no requests are sent or saved\./);
    assert.match(text, /Your details are used only to respond to your request\./);
    assert.equal(await page.locator('button.submit').textContent(), 'Request a visit — Demo');
    // gallery: three placeholder frames labeled "Artwork image"
    assert.equal(await page.locator('.gallery li').count(), 3);
    assert.equal(await page.locator('.gallery .ph', { hasText: 'Artwork image' }).count(), 3);
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
    assert.match(text, /Horario: lo define el negocio/);
    assert.match(text, /Citas con tecnología de Pásale\./);
    assert.match(text, /Producido por The Composition Group/);
    assert.match(text, /Experiencia de demostración/);
    assert.equal(await page.locator('.gallery .ph', { hasText: 'Imagen de la obra' }).count(), 3);
    assert.ok(!/Pick the kind|Demo experience|Hours: set|Scheduling powered|Request a visit|Any pieces/.test(text), 'no English left after toggling to ES');
  });
});

for (const name of ['default', 'showcase']) {
  test(`browser: demo submit makes zero network calls (${name}) and the confirmation says requested`, { skip: skipReason }, async () => {
    await drive(name === 'default' ? testConfig({ demo: true }) : showcaseConfig(), async (page, requests) => {
      const before = requests.length;
      await page.locator('input[name=services]').first().check({ force: true });
      if (name === 'default') {
        await page.locator('input[name=date]:not([disabled])').first().check({ force: true });
        await page.locator('input[name=time]').first().check({ force: true });
      }
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
  await drive(showcaseConfig(), async (page) => {
    assert.equal(await page.locator('details.hours').count(), 0, 'no collapsed, empty-looking Hours control');
    assert.equal(await page.locator('.hours-note p').textContent(), 'Hours: set by business');
    assert.equal(await page.locator('.hours-note .label').textContent(), 'Hours');
    await page.locator('.langs button[lang=es]').click();
    assert.equal(await page.locator('.hours-note p').textContent(), 'Horario: lo define el negocio');
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

test('browser: showcase heading order and first step above the fold (1440x900, 390x844)', { skip: skipReason }, async () => {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await drive(showcaseConfig(), async (page) => {
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.locator('h1').textContent(), 'Art is better in person.');
      const order = await page.locator('.biz-inner > *').evaluateAll((els) => els.slice(0, 3).map((e) => `${e.tagName}.${e.className}`));
      assert.deepEqual(order, ['H1.biz-name', 'P.kicker', 'P.subline']);
      assert.equal(await page.locator('.kicker').textContent(), 'Fancy Ape · Studio & Gallery · Melbourne, FL');
      assert.equal(await page.locator('.subline').textContent(), 'Produced by The Composition Group');
      // Gallery frames share one aspect ratio, and the whole first step (heading to tiles) fits in the first screen.
      const ratios = await page.locator('.gallery .frame').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width / e.getBoundingClientRect().height));
      assert.ok(Math.max(...ratios) - Math.min(...ratios) < 0.05, `frame ratios ${ratios}`);
      const bottom = await page.evaluate(() => document.querySelector('form fieldset').getBoundingClientRect().bottom);
      assert.ok(bottom <= height, `first step ends at ${Math.round(bottom)}px, screen is ${height}px`);
    }, { width, height });
  }
});

after(async () => { await browser?.close(); });
