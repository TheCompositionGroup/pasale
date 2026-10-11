// Builds a Cloudflare Worker handler for a raw config. Static files in the assets
// directory are served by Workers Assets; only /api/* and /sign run this code.
// Secrets and vars arrive in `env`. The core is built once per isolate,
// so rate limiting and duplicate protection live per isolate and are approximate.
import { createCore } from '../src/core.js';
import { resolveConfig, ConfigError } from '../src/config.js';

export function createWorker(rawConfig) {
  let core;
  let configProblem;
  return {
    async fetch(request, env) {
      if (!core && !configProblem) {
        try {
          core = createCore({ config: resolveConfig(rawConfig, env), env });
        } catch (e) {
          if (!(e instanceof ConfigError)) throw e;
          configProblem = e.message;
          console.error(configProblem); // visible in the Cloudflare dashboard logs
        }
      }
      if (configProblem) {
        return new Response(JSON.stringify({ ok: false, error: 'misconfigured' }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
      return core(request, { ip: request.headers.get('cf-connecting-ip') ?? 'unknown' });
    },
  };
}
