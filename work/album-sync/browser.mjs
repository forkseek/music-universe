import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const results=[], errors=[], albumCalls=[];
mkdirSync('work/album-sync/review',{recursive:true});
page.on('pageerror',e=>errors.push(e.message));
page.on('response',async response=>{
  if (response.url().endsWith('/api/music/album') && response.request().method()==='POST') {
    const result=await response.json().catch(()=>null);
    albumCalls.push({status:response.status(),album:result?.album?.name,count:result?.album?.tracks?.length,index:result?.trackIndex,error:result?.error?.message});
  }
});
const audio=()=>page.getByTestId('audio-engine').evaluate(a=>({src:a.currentSrc,time:a.currentTime,paused:a.paused,ready:a.readyState}));
const shell=()=>page.locator('.app-shell').evaluate(s=>({album:s.dataset.albumId,cover:s.dataset.albumCover,planet:s.dataset.playingPlanet,index:s.dataset.playingIndex}));
const ready=()=>expect(page.getByTestId('album-sync-status')).toHaveAttribute('data-state','ready',{timeout:60000});
try {
  await page.goto('http://127.0.0.1:5188/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'显示界面',exact:true}).click();
  await page.getByTestId('player-toggle').click();
  await ready();
  await expect(page.getByTestId('album-sync-status')).toContainText('第 01 / 10 首');
  await expect.poll(async()=>!(await audio()).paused).toBe(true);
  let snapshot=await shell();
  expect(snapshot.index).toBe('0');expect(snapshot.cover).toContain('/mw/api/music/album/cover?');
  results.push({defaultPlayback:await audio(),scene:snapshot,albumFetches:[...albumCalls]});
  console.log(JSON.stringify({defaultAlbum:albumCalls.at(-1)}));
  await page.getByRole('button',{name:'下一首',exact:true}).click();
  await expect(page.getByTestId('album-sync-status')).toContainText('第 02 / 10 首',{timeout:60000});
  await expect.poll(async()=>!(await audio()).paused).toBe(true);
  expect((await shell()).index).toBe('1');expect(albumCalls.length).toBe(1);
  results.push({sameAlbumNextTrack:await shell(),albumRequests:albumCalls.length,cache:true});
  const beforeScene=await page.locator('canvas').evaluate(c=>({generation:c.dataset.generation,time:Number(c.dataset.simulationTime)}));
  await page.getByRole('button',{name:'音乐搜索',exact:true}).click();
  await page.getByRole('button',{name:'网易云音乐',exact:true}).click();
  await page.getByTestId('music-search-input').fill('EARFQUAKE Tyler The Creator');
  await page.getByTestId('music-search-submit').click();
  const igor=page.getByTestId('music-search-result').filter({has:page.locator('strong',{hasText:/^EARFQUAKE$/i})}).filter({hasText:'Tyler, The Creator'}).filter({hasText:'IGOR'}).first();
  await expect(igor).toBeVisible({timeout:60000});
  await igor.getByTestId('music-search-play').click();
  await expect(page.getByTestId('album-sync-status')).toContainText('IGOR',{timeout:60000});
  await ready();
  await page.getByRole('button',{name:'关闭音乐搜索',exact:true}).click();
  snapshot=await shell();
  expect(snapshot.index).toBe('1');expect(snapshot.album).not.toBe(results[0].scene.album);
  expect(snapshot.cover).not.toBe(results[0].scene.cover);
  const afterScene=await page.locator('canvas').evaluate(c=>({generation:c.dataset.generation,time:Number(c.dataset.simulationTime)}));
  expect(afterScene.generation).toBe(beforeScene.generation);expect(afterScene.time).toBeGreaterThan(beforeScene.time);
  await expect(page.locator('.planet-detail .detail-number')).toHaveText('02');
  await expect(page.locator('.planet-detail strong')).toHaveText(/EARFQUAKE/i);
  const before=await audio();expect(before.paused).toBe(false);
  await expect.poll(async()=>(await audio()).time,{timeout:10000}).toBeGreaterThan(before.time+.5);
  await page.evaluate(async()=>{
    const context=new AudioContext(), analyser=context.createAnalyser();analyser.fftSize=1024;
    context.createMediaElementSource(document.querySelector('audio')).connect(analyser);analyser.connect(context.destination);
    window.albumAudioProbe={context,analyser};await context.resume();
  });
  const rms=()=>page.evaluate(()=>{const a=window.albumAudioProbe.analyser,x=new Float32Array(a.fftSize);a.getFloatTimeDomainData(x);return Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length)});
  await expect.poll(rms,{timeout:15000}).toBeGreaterThan(.0001);
  results.push({crossAlbumSearch:await shell(),audio:await audio(),rms:await rms(),response:albumCalls.at(-1),cameraAndClockPreserved:{beforeScene,afterScene}});
  console.log(JSON.stringify({crossAlbum:albumCalls.at(-1),audioRms:results.at(-1).rms}));
  await page.screenshot({path:'work/album-sync/review/igor.png'});
  await page.getByRole('button',{name:'下一首',exact:true}).click();
  await expect(page.getByTestId('album-sync-status')).toContainText('第 03 / 12 首',{timeout:60000});
  expect(albumCalls.length).toBe(2);
  results.push({igorNextTrack:await shell(),albumRequests:albumCalls.length,cache:true,errors});
  expect(errors).toEqual([]);
} catch(error){results.push({failure:error.message,albumCalls,errors,status:await page.getByTestId('album-sync-status').textContent().catch(()=>null)});await page.screenshot({path:'work/album-sync/review/failure.png'}).catch(()=>{});process.exitCode=1;}
finally {writeFileSync('work/album-sync/review/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();}
