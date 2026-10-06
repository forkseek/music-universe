import { platformCall } from '../../src/lib/music/platforms/runtime';
import { readAlbumCover } from '../../src/lib/music/platforms/albums';
try {
  const local=await fetch('http://127.0.0.1:5188/mw/api/music/album/cover?provider=netease&id=278949442');
  console.log(JSON.stringify({proxyStatus:local.status,type:local.headers.get('content-type'),message:local.ok?'image':await local.text()}));
  const album=await platformCall('netease','album',{albumId:'278949442'},'',AbortSignal.timeout(30000));
  console.log(JSON.stringify({cover:album.cover}));
  for(const headers of [{},{Referer:'https://music.163.com/','User-Agent':'Mozilla/5.0'}]) {
    const response=await fetch(String(album.cover),{headers,signal:AbortSignal.timeout(15000)});
    console.log(JSON.stringify({cdnStatus:response.status,type:response.headers.get('content-type'),length:response.headers.get('content-length')}));
    await response.body?.cancel();
  }
  const cover=await readAlbumCover('netease','278949442',AbortSignal.timeout(30000));
  console.log(JSON.stringify({directStatus:cover.status,type:cover.headers.get('content-type')}));
} catch(error){console.log(JSON.stringify({error:error instanceof Error?error.message:'unknown',code:(error as {code?:string}).code}));}
process.exit();
