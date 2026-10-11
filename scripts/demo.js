// Local end-to-end demo: a stand-in "business inbox" plus the real app wired to
// it, so you can watch a request arrive. Nothing leaves your computer.
import http from 'node:http';
import { createCore } from '../src/core.js';
import { createNodeHandler } from '../adapters/node.js';
import { resolveConfig } from '../src/config.js';
import base from '../config/pasale.config.js';

const INBOX_PORT = 4001;
const APP_PORT = Number(process.env.PORT ?? 3000);

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      console.log(`\n===== BUSINESS INBOX: request received =====\n${JSON.parse(body).text}\n============================================\n`);
    } catch {
      console.log('Inbox received a non-JSON body');
    }
    res.writeHead(200).end('ok');
  });
}).listen(INBOX_PORT);

const env = { ...process.env, PASALE_WEBHOOK_URL: `http://localhost:${INBOX_PORT}/inbox` };
const config = resolveConfig({ ...base, delivery: { type: 'webhook' } }, env);
http.createServer(createNodeHandler(createCore({ config, env }))).listen(APP_PORT, () => {
  console.log(`Demo form:  http://localhost:${APP_PORT}\nWindow sign: http://localhost:${APP_PORT}/sign\nSubmit a request and watch it arrive in this terminal.`);
});
