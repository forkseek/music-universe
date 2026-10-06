import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless:true, args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport:{width:1440,height:900} });
const page = await context.newPage();
const errors=[]; const results=[];
page.on('pageerror', e=>errors.push(e.message));
const headers={'X-Music-World':'1'};
mkdirSync('work/music-platform-review',{recursive:true});
try {
  await page.goto('http://127.0.0.1:5188/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'显示界面',exact:true}).click();
  await page.getByRole('button',{name:'音乐搜索',exact:true}).click();
  await expect(page.locator('.music-platform-tabs button')).toHaveCount(4);
  await expect(page.getByTestId('music-platform-login')).toBeEnabled({timeout:20000});
  for(const provider of ['qq','netease','kugou','qishui']) {
    await page.locator(`[data-platform="${provider}"]`).click();
    await page.getByTestId('music-search-input').fill('周杰伦 晴天');
    const responsePromise=page.waitForResponse(r=>r.url().includes(`/api/music/${provider}/search?`),{timeout:55000});
    await page.getByTestId('music-search-submit').click();
    const response=await responsePromise;
    const data=await response.json();
    await expect(page.getByTestId('music-search-submit')).toBeEnabled();
    const count=await page.getByTestId('music-search-result').count();
    results.push({provider,status:response.status(),count,message:data.error?.message||'',first:data.songs?.[0]?.name});
    console.log(JSON.stringify(results.at(-1)));
    if(provider==='netease' && data.songs?.length) {
      const resolved=await context.request.post('http://127.0.0.1:5188/mw/api/music/netease/play',{headers,data:{playbackId:data.songs[0].playbackId}});
      const audio=await resolved.json();
      if(audio.url) {
        const media=await context.request.get('http://127.0.0.1:5188/mw'+audio.url,{headers:{Range:'bytes=0-1023'},timeout:50000});
        results.push({audio:'netease',playable:audio.playable,rangeStatus:media.status(),bytes:(await media.body()).length,type:media.headers()['content-type']});
        const outsider=await browser.newContext();
        const denied=await outsider.request.get('http://127.0.0.1:5188/mw'+audio.url);
        results.push({audioOwnerCheck:denied.status()}); await outsider.close();
      } else results.push({audio:'netease',playable:false,message:audio.message});
      await page.getByTestId('music-search-play').first().click();
      await expect(page.getByTestId('music-search-now-title')).toContainText(data.songs[0].name,{timeout:50000});
      await expect.poll(()=>page.locator('audio').evaluate(a=>({paused:a.paused,time:a.currentTime,ready:a.readyState})),{timeout:30000}).toMatchObject({paused:false});
      await expect.poll(()=>page.locator('audio').evaluate(a=>a.currentTime),{timeout:15000}).toBeGreaterThan(0);
      results.push({browserPlayback:true});
    }
  }
  await page.locator('[data-platform="netease"]').click();
  await expect(page.getByTestId('music-platform-login')).toBeEnabled();
  await page.getByTestId('music-platform-login').click();
  await expect(page.getByAltText('网易云音乐登录二维码')).toBeVisible({timeout:35000});
  results.push({neteaseQR:true});
  await page.getByRole('button',{name:'取消登录',exact:true}).click();
  await expect(page.getByTestId('music-platform-login-state')).toHaveCount(0);
  await page.locator('[data-platform="qishui"]').click();
  await expect(page.getByTestId('music-platform-login')).toBeEnabled();
  await page.getByTestId('music-platform-login').click();
  await expect(page.getByAltText('汽水音乐登录二维码')).toBeVisible({timeout:55000});
  results.push({qishuiQR:true});
  await page.getByRole('button',{name:'取消登录',exact:true}).click();
  await page.locator('[data-platform="netease"]').click();
  await page.getByTestId('music-search-input').fill('Tyler The Creator');
  await page.getByTestId('music-search-submit').click();
  await expect(page.getByTestId('music-search-result').first()).toBeVisible({timeout:35000});
  await page.screenshot({path:'work/music-platform-review/desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'work/music-platform-review/mobile.png'});
  results.push({mobileOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  await page.getByRole('button',{name:'关闭音乐搜索',exact:true}).click();
  await expect(page.getByTestId('music-search-drawer')).toHaveCount(0);
  results.push({closeRestoresScene:true,errors});
} catch(error) { results.push({failure:error.message,errors}); await page.screenshot({path:'work/music-platform-review/failure.png'}).catch(()=>{}); process.exitCode=1; }
finally { writeFileSync('work/music-platform-review/results.json',JSON.stringify(results,null,2)); console.log(JSON.stringify(results,null,2)); await browser.close(); }
