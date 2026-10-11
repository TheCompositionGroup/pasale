import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCore } from './src/core.js';
import { createNodeHandler } from './adapters/node.js';
import { resolveConfig, ConfigError } from './src/config.js';

const configPath = path.resolve(process.env.PASALE_CONFIG ?? './config/pasale.config.js');

try {
  const raw = (await import(pathToFileURL(configPath).href)).default;
  const config = resolveConfig(raw, process.env);
  const core = createCore({ config, env: process.env });
  const port = Number(process.env.PORT ?? 3000);
  http.createServer(createNodeHandler(core, {
    trustProxy: config.security.trustProxy,
    galleryDir: config.gallery ? path.join(path.dirname(configPath), 'images') : null,
    sourceFile: config.showConfig ? configPath : null,
  })).listen(port, () => {
    console.log(`Pásale for "${config.business.name}" on port ${port}${config.demo ? ' (DEMO MODE: nothing is sent)' : ''}`);
  });
} catch (e) {
  if (e instanceof ConfigError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
