import { createStore } from './store.js';
import { createCollector } from './collector.js';
const kind = process.argv[2];
if (kind && !['news', 'skills', 'repos'].includes(kind)) throw new Error('用法：npm run collect -- [news|skills|repos]');
const store = createStore();
try { const result = await createCollector(store).collect('cli', kind); console.log(result); if (result.failed) process.exitCode = 1; }
finally { store.close(); }
