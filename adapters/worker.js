// Cloudflare Workers adapter (deployed with `wrangler deploy`, see wrangler.jsonc).
import { createWorker } from './worker-core.js';
import rawConfig from '../config/pasale.config.js';

export default createWorker(rawConfig);
