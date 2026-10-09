'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const http = require('node:http');
const https = require('node:https');

// The SDK creates a fresh keep-alive agent per call and sets no deadline. Scope this
// adapter to the SDK's own Axios instance and official hosts; leave proxies untouched.
function createNeteaseNetwork(axios) {
  const requests = new AsyncLocalStorage();
  const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 2, timeout: 15000 });
  const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 2, timeout: 15000 });
  const interceptor = axios.interceptors.request.use(config => {
    let address;
    try { address = new URL(config.url); } catch { return config; }
    if (address.hostname !== 'music.163.com' && !address.hostname.endsWith('.music.163.com')) return config;
    config.timeout = config.timeout > 0 ? Math.min(config.timeout, 12000) : 12000;
    const signal = requests.getStore();
    if (signal) config.signal = config.signal ? AbortSignal.any([config.signal, signal]) : signal;
    if (config.proxy === false) { config.httpAgent = httpAgent; config.httpsAgent = httpsAgent; }
    return config;
  });
  return {
    run: (signal, action) => requests.run(signal, action),
    close: () => { axios.interceptors.request.eject(interceptor); httpAgent.destroy(); httpsAgent.destroy(); },
  };
}
module.exports = { createNeteaseNetwork };
