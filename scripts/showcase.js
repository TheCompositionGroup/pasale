// Local preview of the showcase (Fancy Ape example): `npm run showcase`, then open http://localhost:3000.
// Demo mode is forced on, so nothing is sent or saved.
process.env.PASALE_CONFIG = 'examples/fancyape/fancyape.config.js';
process.env.DEMO_MODE = 'true';
await import('../server.js');
