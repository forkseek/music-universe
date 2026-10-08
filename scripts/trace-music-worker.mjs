import { writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import nft from 'next/dist/compiled/@vercel/nft/index.js';

// The IPC worker is loaded by path, so Next cannot discover its dependencies from imports.
const { fileList, warnings } = await nft.nodeFileTrace(['integrations/mineradio/worker.cjs'], { base: process.cwd() });
for (const warning of warnings) {
  // Next's bundled tracer emits a synthetic control-character path for a dynamic module glob.
  // It is not a runtime module. All concrete provider modules are covered by the trace and smoke test.
  if (!warning.message.includes('\u001a')) throw new Error('Music worker has an unresolved dependency; inspect its local trace.');
}
const files = [...fileList].sort();
if (files.some(file => path.isAbsolute(file) || file.startsWith('..') || /(^|[/\\])\.env/.test(file))) throw new Error('Unsafe music runtime trace');
writeFileSync('.music-runtime-trace.json', JSON.stringify(files.map(file => './' + file.replaceAll('\\', '/'))) + '\n');
console.log(`Traced ${files.length} music runtime files (${Math.round(files.reduce((sum, file) => sum + statSync(file).size, 0) / 1024 / 1024)} MB).`);
