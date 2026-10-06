import {copyFile} from 'node:fs/promises';
await copyFile('docs/AUTOMATIC_ALBUM_SYNC.md','C:/path/to/music-universe/AUTOMATIC_ALBUM_SYNC.md');
console.log('Automatic album integration guide saved in the application.');
