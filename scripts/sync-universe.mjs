import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = path.resolve(process.env.MUSIC_UNIVERSE_SOURCE || process.argv[2] || path.join(root, 'apps/music-universe'));
const destination = path.join(root, 'public/universe');
if (path.dirname(destination) !== path.join(root, 'public')) throw new Error('Invalid universe destination');
if (!existsSync(path.join(source, 'package.json'))) {
  if (existsSync(path.join(destination, 'index.html')) && existsSync(path.join(destination, 'build-manifest.json'))) {
    console.log('Using the already synchronized universe build. Set MUSIC_UNIVERSE_SOURCE to rebuild it.');
    process.exit(0);
  }
  throw new Error('Set MUSIC_UNIVERSE_SOURCE to the existing music-universe source directory.');
}
const pkg = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
if (pkg.name !== 'music-universe') throw new Error('MUSIC_UNIVERSE_SOURCE must point to music-universe.');
const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
if (!existsSync(npmCli)) throw new Error('Run this script with npm run build:universe.');
const build = spawnSync(process.execPath, [npmCli, 'run', 'build:hall'], { cwd: source, stdio: 'inherit', windowsHide: true });
if (build.status !== 0) process.exit(build.status || 1);
const dist = path.join(source, 'dist');
const entry = readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!entry.includes('/universe/assets/')) throw new Error('Expected a build with base=/universe/.');
mkdirSync(destination, { recursive: true });
// Remove superseded hashed bundles only; do not accumulate old JS on every release.
const assetDirectory = path.join(destination, 'assets');
if (existsSync(assetDirectory)) {
  for (const item of readdirSync(assetDirectory, { withFileTypes: true })) {
    if (item.isFile() && !existsSync(path.join(dist, 'assets', item.name))) rmSync(path.join(assetDirectory, item.name));
  }
}
cpSync(dist, destination, { recursive: true });
// Public fonts are not transformed by Vite. Keep their URLs relative to this stylesheet.
const fonts = path.join(destination, 'fonts/fonts.css');
if (existsSync(fonts)) writeFileSync(fonts, readFileSync(fonts, 'utf8').replaceAll('/fonts/', './'));
function files(directory, relative = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => {
    const name = path.posix.join(relative, item.name);
    if (item.isDirectory()) return files(path.join(directory, item.name), name);
    if (!item.isFile()) throw new Error('Unexpected non-file in universe build.');
    if (name === 'build-manifest.json') return [];
    return [{ path: name, sha256: createHash('sha256').update(readFileSync(path.join(directory, item.name))).digest('hex') }];
  });
}
const manifest = { version: 1, base: '/universe/', builtAt: new Date().toISOString(), files: files(destination) };
writeFileSync(path.join(destination, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Synchronized ${manifest.files.length} universe resources to public/universe.`);
