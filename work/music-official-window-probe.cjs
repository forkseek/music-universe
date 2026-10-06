const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'music-official-probe-'));
app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-http2');
const results = [];
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  for (const [platform, url] of [['qq','https://y.qq.com/n/ryqq/profile'],['kugou','https://www.kugou.com/']]) {
    const window = new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,partition:platform+'-probe'}});
    try {
      await Promise.race([window.loadURL(url),new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),25000))]);
      await new Promise(resolve=>setTimeout(resolve,2000));
      const state = await window.webContents.executeJavaScript(`({title:document.title,loginControls:[...document.querySelectorAll('a,button,span,div')].filter(e=>e.textContent.trim().length<=18&&/登录|登陆/.test(e.textContent.trim())&&e.getBoundingClientRect().width>0).length})`);
      results.push({platform,loaded:true,...state});
    } catch { results.push({platform,loaded:false}); }
    window.destroy();
  }
  fs.writeFileSync(path.resolve('work/music-platform-review/official-windows.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
  app.exit(0);
});
