import { copyFile } from 'node:fs/promises';
await copyFile(new URL('./automaticAlbum.test.ts',import.meta.url),'C:/path/to/music-universe/tests/automaticAlbum.test.ts');
console.log('Album synchronization tests installed.');
