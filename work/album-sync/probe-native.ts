import { platformCall } from '../../src/lib/music/platforms/runtime';
import { radiohandSearchPage, radiohandAlbum } from '../../src/lib/music/providers/radiohand-qq';
const signal = AbortSignal.timeout(60000);
const results = await Promise.allSettled([
  (async () => {
    const result = await platformCall('netease', 'search', {query:'Sugar on My Tongue Tyler The Creator',limit:12,offset:0},'',signal);
    const song = (result.songs as Record<string,unknown>[]).find(s => s.artist === 'Tyler, The Creator');
    if (!song) throw new Error('No exact NetEase song');
    const album = await platformCall('netease','album',{albumId:song.albumId,trackId:song.id},'',signal);
    return {provider:'netease',id:album.id,name:album.name,total:album.total,tracks:(album.tracks as Record<string,unknown>[]).map(t=>({id:t.id,name:t.name,disc:t.discNumber,no:t.trackNumber}))};
  })(),
  (async () => {
    const result = await radiohandSearchPage('Sugar on My Tongue Tyler',12,signal);
    const song = result.songs.find(s=>s.artist==='Tyler, The Creator');
    if (!song) throw new Error('No exact QQ song');
    const album=await radiohandAlbum(song.albumMid,song.mid,signal);
    return {provider:'qq',id:album.id,name:album.name,total:album.total,tracks:album.tracks.map(t=>({id:t.mid,name:t.name,disc:t.discNumber,no:t.trackNumber}))};
  })()
]);
for(const result of results) console.log(JSON.stringify(result.status==='fulfilled'?result.value:{error:result.reason instanceof Error?result.reason.message:'probe failed'}));
process.exit(results.some(r=>r.status==='fulfilled')?0:1);
