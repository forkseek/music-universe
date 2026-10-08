import test from 'node:test'
import assert from 'node:assert/strict'
import { matchAlbumSongs } from '../src/lib/albumMusic'
import type { PlatformSong } from '../src/lib/musicPlatforms'
const album = { id:'glass', name:"DON'T TAP THE GLASS", artist:'Tyler, The Creator', cover:'', tracks:[] }
const song = (id:string, name:string, artist:string, extra:Partial<PlatformSong> = {}):PlatformSong => ({provider:'netease',id,playbackId:id,name,artist,album:album.name,cover:'',duration:182000,fee:0,...extra})
test('ignores search suggestions and karaoke, and matches the original among featured artists', () => {
  const results = [song('wrong','Star Wars','Tyler the creator'),song('cover','Big Poe','The Tyler The Creator Tribute Band'),song('karaoke','Big Poe (Karaoke Version)','Tyler, The Creator'),song('real','Big Poe','Tyler, The Creator / Pharrell Williams / Sk8brd')]
  assert.deepEqual(matchAlbumSongs(album,{id:'1',title:'Big Poe',duration:182},results).map(item=>item.id),['real'])
})
test('prefers the requested album and preserves version differences', () => {
  const results = [song('compilation','Big Poe',album.artist,{album:'Hits'}),song('live','Big Poe (Live)',album.artist),song('album','Big Poe',album.artist)]
  assert.deepEqual(matchAlbumSongs(album,{id:'1',title:'Big Poe'},results).map(item=>item.id),['album','compilation'])
})
test('accepts case changes without confusing distinct titles', () => {
  const results = [song('real','Sugar On My Tongue',album.artist),song('different','Sugar',album.artist)]
  assert.deepEqual(matchAlbumSongs(album,{id:'2',title:'Sugar on My Tongue'},results).map(item=>item.id),['real'])
})
