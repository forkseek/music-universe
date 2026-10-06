import {readFile,writeFile,copyFile} from 'node:fs/promises';
const root='C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe';
const sanitize=value=>JSON.parse(JSON.stringify(value,(key,item)=>['src','url','playbackId','cookie','ticket'].includes(key)?undefined:item));
const browser=sanitize(JSON.parse(await readFile('work/album-sync/review/results.json','utf8')));
const localTags=sanitize(JSON.parse(await readFile('work/album-sync/review/local-tags.json','utf8')));
if(browser.some(r=>r.failure)||localTags.some(r=>r.failure))throw new Error('Verification has failures');
await writeFile(root+'/automatic-album-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),
  application:'http://127.0.0.1:5188/',nativeMetadata:{qq:{album:"DON'T TAP THE GLASS (Explicit)",count:10},netease:{album:"DON'T TAP THE GLASS",count:10}},
  browser,localTags,checks:{frontendTests:56,backendTests:157,frontendBuild:true,backendBuild:true,backendLint:true},
  limits:['QQ and NetEase native album details; other sources use strict NetEase catalogue matching.','Untagged audio has no fingerprint identification.','Nonzero decoded browser audio was verified; physical speakers were not measured.']},null,2));
await copyFile('docs/AUTOMATIC_ALBUM_SYNC.md',root+'/AUTOMATIC_ALBUM_SYNC.md');
await copyFile('work/album-sync/review/igor.png',root+'/automatic-album-preview.png');
console.log('Saved integration guide, sanitized verification report and IGOR preview.');
