import { request } from '@playwright/test';
const api = await request.newContext({baseURL:'http://127.0.0.1:5188',extraHTTPHeaders:{'X-Music-World':'1'}});
await api.get('/mw/api/music/session');
for(const q of ['Tyler The Creator Big Poe','Tyler The Creator Sugar on My Tongue']) {
  const response=await api.get('/mw/api/music/netease/search',{params:{q,page:1},timeout:45000});
  const data=await response.json();
  const songs=data.songs||[];
  console.log(JSON.stringify({q,status:response.status(),songs:songs.slice(0,4).map(s=>({name:s.name,artist:s.artist,album:s.album,fee:s.fee}))}));
  if(songs[0]) {
    const result=await api.post('/mw/api/music/netease/play',{data:{playbackId:songs[0].playbackId},timeout:45000});
    const audio=await result.json();
    console.log(JSON.stringify({q,playable:audio.playable,trial:audio.trial,message:audio.message||audio.error?.message}));
  }
}
await api.dispose();
