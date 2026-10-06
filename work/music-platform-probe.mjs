import { fork, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const results = [];
const worker = fork('integrations/mineradio/worker.cjs', [], { execArgv: [], serialization: 'advanced', stdio: ['ignore','ignore','ignore','ipc'] });
const pending = new Map();
worker.on('message', msg => { const p = pending.get(msg.id); if (p) { clearTimeout(p.timer); pending.delete(msg.id); p.resolve(msg); } });
function request(provider, action, args={}) {
  return new Promise(resolve => { const id = crypto.randomUUID(); const timer=setTimeout(() => {pending.delete(id); resolve({error:'timeout'})},65000); pending.set(id,{resolve,timer}); worker.send({id,provider,action,args}); });
}
const profile = mkdtempSync(path.join(tmpdir(),'music-world-probe-'));
const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
const electronResult = new Promise(resolve => {
  const child=spawn(path.resolve('node_modules/electron/dist/electron.exe'),[path.resolve('integrations/mineradio/login.cjs'),'probe',profile],{env,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  const timeout=setTimeout(()=>{child.kill();resolve({electron:'timeout'})},30000);
  child.on('message',m=>{clearTimeout(timeout);resolve({electron:m.status})});
  child.on('exit',()=>{try{rmSync(profile,{recursive:true,force:true,maxRetries:3})}catch{}});
  child.on('error',()=>{clearTimeout(timeout);resolve({electron:'unavailable'})});
});
const checks=await Promise.all(['netease','kugou','qishui'].map(async provider=>{
  const response=await request(provider,'search',{query:'周杰伦 晴天',limit:12,offset:0});
  const songs=response.result?.songs || [];
  const result={provider,error:response.error||response.result?.error||null,count:songs.length,first:songs.slice(0,2).map(s=>({name:s.name,artist:s.artist,hasId:!!s.id}))};
  results.push(result); console.log(JSON.stringify(result));
  if(provider==='netease' && songs.length){const playback=await request(provider,'resolve',songs[0]); console.log(JSON.stringify({provider,playable:playback.result?.playable,trial:playback.result?.trial,error:playback.error||null}));}
}));
void checks;
const qr=await request('netease','qr');
results.push({neteaseQr:!!qr.result?.image,error:qr.error||null});
if(qr.result?.key){const poll=await request('netease','poll',{key:qr.result.key});results.push({neteasePollCode:poll.result?.code,error:poll.error||null});}
results.push(await electronResult);
worker.kill();
writeFileSync('work/music-platform-probe.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));
