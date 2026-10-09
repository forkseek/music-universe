import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locateAlbumTrack, matchesRecording, orderedAlbumTracks } from '@/lib/music/platforms/album-matching';
import { readAlbumCover, resolvePlayingAlbum } from '@/lib/music/platforms/albums';
import { GET as legacyCover } from '@/app/api/music/album/cover/route';
import { GET as pathCover } from '@/app/api/music/album/cover/v2/[provider]/[id]/route';
import { NextRequest } from 'next/server';
import { resolvePlatformSong } from '@/lib/music/platforms/catalog';
import type { DatabaseContext } from '@/db/connection';
import { openDatabase } from './helpers/database';
import { users } from '@/db/schema';
const fixtures = vi.hoisted(() => ({call:vi.fn(), qq:vi.fn(), db: null as DatabaseContext | null}));
vi.mock('@/db/connection', async original => ({ ...await original<typeof import('@/db/connection')>(), getDatabase: () => fixtures.db! }));
vi.mock('@/lib/music/platforms/runtime',()=>({platformCall:fixtures.call}));
vi.mock('@/lib/music/platforms/accounts',()=>({readAccount:()=>null}));
vi.mock('@/lib/music/providers/radiohand-qq',()=>({radiohandAlbum:fixtures.qq,radiohandSearchPage:vi.fn(),radiohandSongUrl:vi.fn()}));
const globals = globalThis as typeof globalThis & {musicAlbumMetadata?:Map<string,unknown>;musicCatalog?:Map<string,unknown>};
const signal=()=>new AbortController().signal;
const identity={provider:'netease' as const,trackId:'2',albumId:'10',title:'Second',artist:'Artist',album:'Release'};
const nativeAlbum=()=>({id:'10',name:'Release',artist:'Artist',cover:'https://p1.music.126.net/cover.jpg',total:3,
  tracks:[{id:'3',name:'Third',artist:'Artist',duration:180000,discNumber:2,trackNumber:1},
    {id:'2',name:'Second',artist:'Artist',duration:190000,discNumber:1,trackNumber:2},
    {id:'1',name:'First',artist:'Artist',duration:170000,discNumber:1,trackNumber:1}]});
beforeEach(async()=>{
  fixtures.call.mockReset();fixtures.qq.mockReset();globals.musicAlbumMetadata?.clear();globals.musicCatalog?.clear();
  vi.stubEnv('MUSIC_CREDENTIAL_SECRET', 'album-fixture-encryption-test-secret');
  fixtures.db = await openDatabase();
  await fixtures.db.db.insert(users).values(['owner','another','one','two'].map(id=>({id,sessionTokenHash:id})));
});
afterEach(async()=>{globals.musicAlbumMetadata?.clear();globals.musicCatalog?.clear();await fixtures.db?.close();fixtures.db=null;vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('recording identity and ordered album metadata',()=>{
  it('uses discs and track numbers, preserving API order for missing numbers',()=>{
    expect(orderedAlbumTracks(nativeAlbum().tracks).map(t=>t.name)).toEqual(['First','Second','Third']);
    expect(orderedAlbumTracks([{name:'Z',discNumber:undefined},{name:'A',discNumber:undefined}]).map(t=>t.name)).toEqual(['Z','A']);
  });
  it('retains Live/remix/release edition differences and rejects another artist',()=>{
    expect(matchesRecording(identity,{id:'2',name:'Second (Live)',artist:'Artist',album:'Release'})).toBe(false);
    expect(matchesRecording(identity,{id:'2',name:'Second',artist:'Cover Artist',album:'Release'})).toBe(false);
    expect(matchesRecording(identity,{id:'2',name:'Second',artist:'Artist',album:'Release (Deluxe)'})).toBe(false);
    expect(matchesRecording(identity,{id:'2',name:'Second (feat. Guest)',artist:'Artist / Guest',album:'Release'})).toBe(true);
  });
  it('does not guess an ambiguous repeated title; ids take priority over displayed titles',()=>{
    const songs=[{id:'11',name:'Second',artist:'Artist'},{id:'12',name:'Second',artist:'Artist'}];
    expect(locateAlbumTrack({...identity,trackId:undefined},songs,false)).toBeNull();
    expect(locateAlbumTrack({...identity,trackId:'12'},songs,true)).toEqual({index:1,matchedBy:'id'});
  });
  it('finds the track using native ids, returns complete album order and safe playback references',async()=>{
    fixtures.call.mockResolvedValue({...nativeAlbum(),cookie:'private-cookie'});
    const result=await resolvePlayingAlbum('owner',identity,signal());
    expect(result.trackIndex).toBe(1);expect(result.matchedBy).toBe('id');
    expect(result.album.tracks.map(t=>t.name)).toEqual(['First','Second','Third']);
    expect(result.album.cover).toBe('/api/music/album/cover/v2/netease/10');
    expect(result.album.tracks.every(t=>t.cover===result.album.cover)).toBe(true);
    expect(result.album.tracks.every(t=>t.playbackId)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private-cookie');
    await expect(resolvePlatformSong('another','netease',result.album.tracks[0].playbackId,signal())).rejects.toMatchObject({code:'TRACK_NOT_FOUND'});
  });
  it('shares album metadata cache while issuing new owner-bound playback references',async()=>{
    fixtures.call.mockResolvedValue(nativeAlbum());
    const first=await resolvePlayingAlbum('one',identity,signal());
    const next=await resolvePlayingAlbum('two',{...identity,trackId:'3',title:'Third'},signal());
    expect(fixtures.call).toHaveBeenCalledTimes(1);expect(next.trackIndex).toBe(2);
    expect(next.album.tracks[0].playbackId).not.toBe(first.album.tracks[0].playbackId);
  });
  it('matches another platform against full release metadata instead of search order',async()=>{
    fixtures.call.mockImplementation(async (_p,action)=> action==='search'?{songs:[{id:'999',name:'Second',artist:'Cover Artist',album:'Release',albumId:'99'},
      {id:'2',name:'Second',artist:'Artist',album:'Release',albumId:'10'}]}:nativeAlbum());
    const result=await resolvePlayingAlbum('owner',{...identity,provider:'kugou',trackId:'hash',albumId:undefined},signal());
    expect(result.trackIndex).toBe(1);expect(result.matchedBy).toBe('metadata');
    expect(fixtures.call.mock.calls.some(c=>c[1]==='album'&&c[2].albumId==='99')).toBe(false);
  });
  it('does not silently turn an incomplete or oversized album into a partial galaxy',async()=>{
    fixtures.call.mockResolvedValue({...nativeAlbum(),total:4});
    await expect(resolvePlayingAlbum('owner',identity,signal())).rejects.toMatchObject({code:'ALBUM_INCOMPLETE'});
  });
  it('rejects malformed ids and missing identity before reaching the upstream',async()=>{
    await expect(resolvePlayingAlbum('owner',{...identity,trackId:'https://127.0.0.1/'},signal())).rejects.toMatchObject({code:'IDENTITY_INVALID'});
    await expect(resolvePlayingAlbum('owner',{...identity,artist:''},signal())).rejects.toMatchObject({code:'IDENTITY_INVALID'});
    expect(fixtures.call).not.toHaveBeenCalled();
  });
  it('accepts the real CDN image/jpg type and normalizes it for WebGL cover textures',async()=>{
    fixtures.call.mockResolvedValue(nativeAlbum());
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array([255,216,255]),{headers:{'Content-Type':'image/jpg','Content-Length':'3'}})));
    const response=await readAlbumCover('netease','10',signal());
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect((await response.arrayBuffer()).byteLength).toBe(3);
  });
  it('refuses arbitrary cover hosts from malformed upstream data',async()=>{
    fixtures.call.mockResolvedValue({...nativeAlbum(),cover:'https://127.0.0.1/private'});
    vi.stubGlobal('fetch',vi.fn());
    await expect(readAlbumCover('netease','10',signal())).rejects.toMatchObject({code:'ALBUM_COVER_INVALID'});
    expect(fetch).not.toHaveBeenCalled();
  });
  it('separates two albums by pathname and upstream bytes, with cache identity declared for Netlify',async()=>{
    fixtures.call.mockImplementation(async (_provider,_action,args)=>({...nativeAlbum(),id:args.albumId,
      cover:`https://p1.music.126.net/${args.albumId}.jpg`}));
    vi.stubGlobal('fetch',vi.fn(async(url)=>new Response(new Uint8Array(String(url).includes('/10.jpg')?[255,216,10]:[255,216,20]),
      {headers:{'Content-Type':'image/jpg'}})));
    const request=new NextRequest('http://localhost/api/music/album/cover/v2/netease/10?id=20');
    const first=await pathCover(request,{params:Promise.resolve({provider:'netease',id:'10'})});
    const second=await pathCover(new NextRequest('http://localhost/api/music/album/cover/v2/netease/20'),
      {params:Promise.resolve({provider:'netease',id:'20'})});
    expect(Array.from(new Uint8Array(await first.arrayBuffer()))).toEqual([255,216,10]);
    expect(Array.from(new Uint8Array(await second.arrayBuffer()))).toEqual([255,216,20]);
    for(const [response,id] of [[first,'10'],[second,'20']] as const){
      expect(response.headers.get('netlify-vary')).toBe('query=provider|id');
      expect(response.headers.get('netlify-cdn-cache-control')).toContain('max-age=86400');
      expect(response.headers.get('cache-control')).toContain('max-age=300');
      expect(response.headers.get('x-album-cover-id')).toBe(id);
    }
  });
  it('keeps the legacy endpoint isolated by query and rejects invalid identities without caching errors',async()=>{
    fixtures.call.mockResolvedValue(nativeAlbum());
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array([255,216,10]),{headers:{'Content-Type':'image/jpg'}})));
    const valid=await legacyCover(new NextRequest('http://localhost/api/music/album/cover?provider=netease&id=10'));
    expect(valid.status).toBe(200);
    expect(valid.headers.get('netlify-vary')).toBe('query=provider|id');
    for(const response of [await legacyCover(new NextRequest('http://localhost/api/music/album/cover?provider=invalid&id=10')),
      await pathCover(new NextRequest('http://localhost/api/music/album/cover/v2/netease/not-an-id'),
        {params:Promise.resolve({provider:'netease',id:'not-an-id'})})]){
      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('netlify-cdn-cache-control')).toBe('no-store');
      expect(response.headers.get('netlify-vary')).toBe(valid.headers.get('netlify-vary'));
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
