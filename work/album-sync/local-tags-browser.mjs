import {chromium,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const chunk=(id,data)=>{const h=Buffer.alloc(8);h.write(id);h.writeUInt32LE(data.length,4);return Buffer.concat([h,data,data.length%2?Buffer.alloc(1):Buffer.alloc(0)]);};
const taggedAudio=(title)=>{
  const fmt=Buffer.alloc(16);fmt.writeUInt16LE(1,0);fmt.writeUInt16LE(1,2);fmt.writeUInt32LE(44100,4);fmt.writeUInt32LE(88200,8);fmt.writeUInt16LE(2,12);fmt.writeUInt16LE(16,14);
  const pcm=Buffer.alloc(44100*12*2);for(let i=0;i<pcm.length/2;i++)pcm.writeInt16LE(Math.round(1800*Math.sin(i/44100*220*Math.PI*2)),i*2);
  const info=Buffer.concat([Buffer.from('INFO'),...Object.entries({INAM:title,IART:'Tyler, The Creator',IPRD:'IGOR'}).map(([id,text])=>chunk(id,Buffer.from(text+'\0')))]);
  const data=Buffer.concat([Buffer.from('WAVE'),chunk('fmt ',fmt),chunk('LIST',info),chunk('data',pcm)]);
  const header=Buffer.alloc(8);header.write('RIFF');header.writeUInt32LE(data.length,4);return Buffer.concat([header,data]);
};
const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),results=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5188/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'显示界面',exact:true}).click();
  await page.getByRole('button',{name:'音乐搜索',exact:true}).click();
  for(const [title,index] of [['EARFQUAKE',1],['I THINK',2]]){
    await page.getByTestId('music-search-file').setInputFiles({name:'local-tag-fixture.wav',mimeType:'audio/wav',buffer:taggedAudio(title)});
    await expect(page.getByTestId('music-search-now-title')).toHaveText(title,{timeout:15000});
    await expect(page.getByTestId('album-sync-status')).toHaveAttribute('data-state','ready',{timeout:60000});
    await expect(page.getByTestId('album-sync-status')).toContainText(title);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-playing-index',String(index));
    const actual=await page.getByTestId('audio-engine').evaluate(a=>({isLocal:a.currentSrc.startsWith('blob:'),playing:!a.paused,time:a.currentTime}));
    expect(actual.isLocal).toBe(true);expect(actual.playing).toBe(true);
    results.push({fixture:'synthetic WAV with RIFF tags',tagTitle:title,index,actual});
  }
  expect(errors).toEqual([]);results.push({sameFilenameDifferentTags:true,errors});
}catch(error){results.push({failure:error.message,status:await page.getByTestId('album-sync-status').textContent().catch(()=>null),errors});process.exitCode=1;}
finally{writeFileSync('work/album-sync/review/local-tags.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));await browser.close();}
