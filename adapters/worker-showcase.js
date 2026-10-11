// Worker for the showcase deployment (`wrangler deploy --env showcase`): same core, the Fancy Ape example config.
import { createWorker } from './worker-core.js';
import rawConfig from '../examples/fancyape/fancyape.config.js';

export default createWorker(rawConfig);
