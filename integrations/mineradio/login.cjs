'use strict';
// Official browser sessions, adapted from Mineradio's desktop/main.js.
const { app, BrowserWindow, session } = require('electron');
const provider = process.argv[2];
const profileDir = process.argv[3];
if (!['qq', 'kugou', 'qishui', 'probe'].includes(provider) || !profileDir) process.exit(1);
app.setPath('userData', profileDir);
app.commandLine.appendSwitch('disable-http2');
console.log = console.warn = console.error = () => {};
let done = false;
const send = data => { if (process.connected) process.send(data); };
const finish = data => {
  if (done) return;
  done = true;
  if (process.connected) process.send(data, () => app.exit(0));
  else app.exit(0);
};
process.on('disconnect', () => app.exit(0));
process.on('message', message => { if (message?.action === 'cancel') finish({ status: 'cancelled' }); });
app.on('window-all-closed', () => {});
setTimeout(() => finish({ status: 'expired' }), 240000).unref();

function cookieHeader(cookies, domain) {
  const picked = new Map();
  for (const c of cookies) {
    const host = c.domain.replace(/^\./, '');
    if (!(host === domain || host.endsWith('.' + domain))) continue;
    if (!c.value || (c.expirationDate && c.expirationDate <= Date.now() / 1000)) continue;
    const score = (host === 'y.qq.com' || host.endsWith('.y.qq.com') ? 400 : host === domain ? 240 : 160) + (c.path === '/' ? 40 : 0);
    if (!picked.has(c.name) || picked.get(c.name).score < score) picked.set(c.name, { value: c.value, score });
  }
  return [...picked].map(([name, c]) => `${name}=${c.value}`).join('; ');
}

async function officialWindow() {
  const isQQ = provider === 'qq';
  const domain = isQQ ? 'qq.com' : 'kugou.com';
  const ownSession = session.fromPartition('music-world-login-' + Date.now());
  ownSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  const preferences = { session: ownSession, contextIsolation: true, nodeIntegration: false, sandbox: true };
  const allowed = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && (url.hostname === domain || url.hostname.endsWith('.' + domain)); }
    catch { return false; }
  };
  const win = new BrowserWindow({ width: 940, height: 740, show: false, autoHideMenuBar: true, title: isQQ ? '连接 QQ 音乐' : '连接酷狗音乐', webPreferences: preferences });
  const kg = isQQ ? null : require('./vendor/kugou-api.js');
  let warmup = false;
  let checking = false;
  const read = async () => cookieHeader(await ownSession.cookies.get({}), domain);
  const check = async () => {
    if (checking || done) return;
    checking = true;
    try {
      const cookie = await read();
      const musicReady = isQQ
        ? /(?:^|;\s*)(?:qm_keyst|qqmusic_key|music_key)=[^;]+/.test(cookie) && /(?:^|;\s*)(?:uin|wxuin|qqmusic_uin)=o?\d+/.test(cookie)
        : kg.kugouCookieHasPlayback(cookie);
      if (musicReady) {
        await new Promise(resolve => setTimeout(resolve, 500));
        finish({ status: 'success', cookie: await read() });
      } else if (!warmup && (isQQ ? /(?:^|;\s*)(?:p_skey|skey|pt_oauth_token)=[^;]+/.test(cookie) : kg.kugouCookieHasLogin(cookie))) {
        warmup = true;
        send({ status: 'scanned', message: '账号已确认，正在等待音乐平台完成授权…' });
        setTimeout(() => {
          if (done) return;
          // Keep the OAuth callback alive while warming up the music session.
          const player = new BrowserWindow({ show: false, webPreferences: preferences });
          install(player);
          player.loadURL(isQQ ? 'https://y.qq.com/n/ryqq/player' : 'https://www.kugou.com/newuc/user/uc/type=edit').catch(() => {});
        }, isQQ ? 5000 : 1200);
      }
    } finally { checking = false; }
  };
  function install(window) {
    window.webContents.setWindowOpenHandler(({ url }) => allowed(url)
      ? { action: 'allow', overrideBrowserWindowOptions: { width: 840, height: 700, autoHideMenuBar: true, webPreferences: preferences } }
      : { action: 'deny' });
    window.webContents.on('will-navigate', (event, url) => { if (!allowed(url)) event.preventDefault(); });
    window.webContents.on('did-create-window', child => install(child));
    window.webContents.on('did-finish-load', () => void check().catch(() => {}));
  }
  install(win);
  win.webContents.on('did-finish-load', () => {
    if (done) return;
    win.show();
    // The official page's own login control opens the official QR UI.
    void win.webContents.executeJavaScript(`setTimeout(() => {
      const el = [...document.querySelectorAll('a,button,span,div')].find(el => {
        const text = el.textContent.trim();
        return text.length <= 18 && /登录|登陆/.test(text) && el.getBoundingClientRect().width > 0;
      });
      el?.click();
    }, 700)`).catch(() => {});
  });
  win.on('ready-to-show', () => win.show());
  win.on('closed', () => { if (!done) finish({ status: 'cancelled' }); });
  setInterval(() => void check().catch(() => {}), 1200).unref();
  await win.loadURL(isQQ ? 'https://y.qq.com/n/ryqq/profile' : 'https://www.kugou.com/');
  send({ status: 'pending', message: '请在打开的官方窗口中登录，完成后会自动返回。' });
}

async function qishuiQr() {
  const auth = require('./vendor/qishui-auth-v6.js');
  let config = { deviceId: '', installId: '', verifyPortraitId: '', computerName: 'Music Universe', cookie: '', msToken: '' };
  auth.configure({ getConfig: () => ({ ...config }), updateConfig: patch => { config = { ...config, ...patch }; return { ...config }; } });
  const result = await auth.getQrCode();
  const token = result.data?.token;
  if (!token || !result.data.qrcode) throw new Error('qr');
  send({ status: 'pending', image: result.data.qrcode, message: '请用抖音 App 扫码，按官方页面提示确认汽水音乐登录。' });
  let delayMs = 2300;
  while (!done) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    if (done) break;
    try {
      const state = await auth.checkQrConnect(token);
      const data = state.data || {};
      delayMs = 4500;
      if (Number(data.error_code) === 0 && (['3', 'confirmed'].includes(String(data.status)) || data.confirmed === true || Boolean(data.session_cookie)) && /(?:^|;\s*)(?:sessionid|sessionid_ss|sid_guard|sid_tt)=[^;\s]+/.test(config.cookie)) {
        finish({ status: 'success', cookie: config.cookie });
      } else if (String(data.status) === '2' || data.status === 'scanned') send({ status: 'scanned', message: '已扫码，请在手机上确认。' });
      else if (String(data.status) === 'expired' || Number(data.error_code) === 2) finish({ status: 'expired' });
      else if (Number(data.error_code) === 7) { delayMs = 60000; send({ status: 'pending', message: '平台要求稍后重试，正在等待下一次状态检查。' }); }
    } catch (error) {
      if (error.code === 'QISHUI_MFA_CANCELLED') return finish({ status: 'cancelled', message: '二次验证已取消，请重新连接。' });
      delayMs = 8000;
      send({ status: 'pending', message: '状态检查暂时失败，正在重试；请保留官方验证窗口。' });
    }
  }
}
app.whenReady().then(async () => {
  if (provider === 'probe') return finish({ status: 'ready' });
  if (provider === 'qishui') await qishuiQr();
  else await officialWindow();
}).catch(() => finish({ status: 'error', message: '官方登录暂时无法打开，请稍后重试。' }));
