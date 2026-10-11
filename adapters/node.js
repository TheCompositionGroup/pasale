import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECURITY_HEADERS } from '../src/headers.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/icons.js': ['icons.js', 'text/javascript; charset=utf-8'],
  '/extras.js': ['extras.js', 'text/javascript; charset=utf-8'],
  '/extras.css': ['extras.css', 'text/css; charset=utf-8'],
  '/sign.css': ['sign.css', 'text/css; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
};

// Wraps the core as a Node http request listener and serves the files in public/
// (only the whitelist above, so nothing else on disk is reachable).
const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };
const GALLERY_FILE = /^\/gallery\/([A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(jpe?g|png|webp|avif))$/i;

// Optional: galleryDir serves gallery images (file names only, image types only) and
// sourceFile serves one read-only text copy of the config for the showConfig feature.
export function createNodeHandler(core, { trustProxy = false, galleryDir = null, sourceFile = null } = {}) {
  const files = Object.fromEntries(
    Object.entries(STATIC).map(([url, [file, type]]) => [url, { body: readFileSync(path.join(PUBLIC_DIR, file)), type }]),
  );

  function clientIp(req) {
    if (trustProxy) {
      const parts = String(req.headers['x-forwarded-for'] ?? '').split(',');
      const last = parts[parts.length - 1].trim();
      if (last) return last;
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  return async function handler(req, res) {
    const pathname = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && files[pathname]) {
      res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': files[pathname].type, 'cache-control': 'no-cache' });
      res.end(files[pathname].body);
      return;
    }
    if (req.method === 'GET' && sourceFile && pathname === '/config-source.txt') {
      try {
        res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' });
        res.end(readFileSync(sourceFile));
      } catch {
        res.writeHead(404).end();
      }
      return;
    }
    const gallery = galleryDir && req.method === 'GET' ? GALLERY_FILE.exec(pathname) : null;
    if (gallery) {
      try {
        const body = readFileSync(path.join(galleryDir, gallery[1]));
        res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': IMAGE_TYPES[gallery[2].toLowerCase()], 'cache-control': 'no-cache' });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
      return;
    }
    if (req.method === 'GET' && pathname === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: hasBody ? Readable.toWeb(req) : undefined,
      duplex: 'half',
    });
    const response = await core(request, { ip: clientIp(req) });
    const headers = Object.fromEntries(response.headers);
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
    if (response.status === 413) req.destroy();
  };
}
