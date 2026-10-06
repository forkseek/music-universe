import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const target = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe'
for (const [name, destination] of [['albumMusic.ts','src/lib/albumMusic.ts'],['useAlbumMusic.ts','src/hooks/useAlbumMusic.ts'],['useAudioPlayback.ts','src/hooks/useAudioPlayback.ts'],['PlayerBar.tsx','src/components/PlayerBar.tsx'],['audio-output.css','src/audio-output.css']]) copyFileSync(new URL(name,import.meta.url),path.join(target,destination))
const mutate = (file, fn) => { const dest=path.join(target,file); const original=readFileSync(dest,'utf8'); const next=fn(original.replace(/\r\n/g,'\n')); writeFileSync(dest,original.includes('\r\n') ? next.replace(/\n/g,'\r\n') : next) }
const replace = (source, before, after) => { if (!source.includes(before)) throw new Error('Expected source not found: '+before.slice(0,70)); return source.replace(before,after) }
mutate('src/App.tsx',source => {
  if (source.includes('const albumMusic = useAlbumMusic')) {
    return source.replace('if (albumMusic.loading) { albumMusic.cancel(); return }', 'if (albumMusic.loading) { albumMusic.cancel(); audio.pause(); return }')
  }
  source=replace(source,"import { useAudioPlayback } from './hooks/useAudioPlayback'", "import { useAudioPlayback } from './hooks/useAudioPlayback'\nimport { useAlbumMusic } from './hooks/useAlbumMusic'")
  source=replace(source,'  const audio = useAudioPlayback()', '  const audio = useAudioPlayback()\n  const albumMusic = useAlbumMusic(album, audio)')
  source=replace(source,`    setPlaying(true)\n  }\n  const skipTrack`, `    setPlaying(true)\n    const track = galaxy.planets.find(planet => planet.id === target)\n    if (track) {\n      if (audio.track?.planetId === target) audio.play()\n      else void albumMusic.playTrack(target)\n    }\n  }\n  const toggleMusic = () => {\n    if (albumMusic.loading) { albumMusic.cancel(); return }\n    if (audio.track) { audio.toggle(); return }\n    setPulseTarget(activePlanet.id); setPlaying(true); void albumMusic.playTrack(activePlanet.id)\n  }\n  const skipTrack`)
  source=replace(source,'    const current = galaxy.planets.findIndex((planet) => planet.id === navigation.viewRef.current.target)', '    const current = galaxy.planets.findIndex((planet) => planet.id === (audio.track?.planetId || navigation.viewRef.current.target))')
  source=replace(source,'    navigation.focus(galaxy.planets[index].id)\n  }', '    const planet = galaxy.planets[index]\n    navigation.focus(planet.id); setPulseTarget(planet.id); setPlaying(true)\n    void albumMusic.playTrack(planet.id)\n  }')
  source=replace(source,"if (event.code === 'Space') { event.preventDefault(); setPulseTarget(navigation.viewRef.current.target); setPlaying((value) => !value) }", "if (event.code === 'Space') { event.preventDefault(); toggleMusic() }")
  source=replace(source,'live={{ track: audio.track, currentTime: audio.currentTime, duration: audio.duration, playing: audio.playing, seek: audio.seek }}', 'live={{ track: audio.track, currentTime: audio.currentTime, duration: audio.duration, playing: audio.playing, seek: audio.seek }}\n        loading={albumMusic.loading || audio.status === \'loading\'} message={audio.message || albumMusic.message} error={albumMusic.error || !!audio.message}\n        volume={audio.volume} muted={audio.muted} onVolumeChange={audio.setVolume} onMute={audio.toggleMute}\n        onOpenMusic={() => { albumMusic.cancel(); setSearchOpen(true) }}')
  source=replace(source,'onToggle={() => { if (audio.track) { audio.toggle(); return } setPulseTarget(activePlanet.id); setPlaying((value) => !value) }} onSkip={skipTrack}', 'onToggle={toggleMusic} onSkip={skipTrack}')
  source=replace(source,'onClick={() => setSearchOpen(true)} aria-label="音乐搜索"', 'onClick={() => { albumMusic.cancel(); setSearchOpen(true) }} aria-label="音乐搜索"')
  source=replace(source,'    setAlbum(nextAlbum)', '    albumMusic.cancel(); audio.stop()\n    setAlbum(nextAlbum)')
  return source
})
console.log('Album playback connected to the audio engine.')
