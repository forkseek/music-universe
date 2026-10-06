import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const main = process.cwd(), folder = path.join(main, 'work/universe-polish');
const universe = path.resolve(process.env.MUSIC_UNIVERSE_SOURCE || path.join(main, '../../Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe'));
const roots = { main, universe };
const added = {
  main: ['scripts/sync-universe.mjs', 'src/app/album-universe.css', 'src/components/home/AlbumUniverseRoom.tsx', 'src/lib/music/providers/qq-oauth.ts', 'src/app/api/qq/login/callback/route.ts', 'src/app/api/qq/login/complete/route.ts', 'src/app/api/qq/avatar/route.ts'],
  universe: ['src/lib/albumSurface.ts', 'src/hooks/useImmersivePlayer.ts', 'src/lib/json.ts', 'src/lib/deployment.ts', 'src/lib/musicWorldTransport.ts', 'src/hooks/useHallEmbedding.ts', 'src/lib/oauthWindow.ts', 'tests/json.test.ts', 'tests/universe-polish.mjs'],
};
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
function walk(directory, relative = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => {
    const name = path.posix.join(relative, item.name);
    return item.isDirectory() ? walk(path.join(directory, item.name), name) : [name];
  });
}
const files = [];
mkdirSync(folder, { recursive: true });
const empty = path.join(folder, 'empty-preimage'); writeFileSync(empty, '');
for (const [kind, root] of Object.entries(roots)) {
  const backupRoot = path.join(folder, 'backup', kind);
  let patch = '';
  for (const relative of [...new Set([...walk(backupRoot), ...added[kind]])]) {
    const target = path.join(root, relative), backup = path.join(backupRoot, relative);
    if (!existsSync(target)) throw new Error('Missing source: ' + relative);
    const isNew = !existsSync(backup);
    if (!isNew && hash(backup) === hash(target)) continue;
    const result = spawnSync('git', ['-c', 'core.quotepath=false', 'diff', '--no-index', '--no-prefix', '--', isNew ? empty : backup, target], { encoding: 'utf8', windowsHide: true });
    if (![0, 1].includes(result.status)) throw new Error(result.stderr || 'Cannot generate scoped diff');
    let diff = result.stdout.replace(/^diff --git .*$/m, `diff --git a/${relative} b/${relative}${isNew ? '\nnew file mode 100644' : ''}`);
    diff = diff.replace(/^--- .*$/m, isNew ? '--- /dev/null' : `--- a/${relative}`).replace(/^\+\+\+ .*$/m, `+++ b/${relative}`);
    patch += diff;
    files.push({ root: kind, relative, action: isNew ? 'remove' : 'restore', afterSha256: hash(target), ...(isNew ? {} : { backup: path.relative(folder, backup).replaceAll('\\', '/'), beforeSha256: hash(backup) }) });
  }
  writeFileSync(path.join(folder, kind + '.patch'), patch);
}
writeFileSync(path.join(folder, 'rollback-manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), roots, files, sourceOnly: true }, null, 2) + '\n');
console.log(JSON.stringify({ files: files.length, patches: ['main.patch', 'universe.patch'], sourceOnly: true }));
