import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2]
function change(file, before, after) {
  const destination = path.join(root, file)
  const code = fs.readFileSync(destination, 'utf8').replaceAll('\r\n', '\n')
  if (!code.includes(before)) throw new Error(`Source changed: ${file}`)
  fs.writeFileSync(destination, code.replace(before, after))
}
change('src/hooks/useGalaxyNavigation.ts', `  const releaseFollow = useCallback(() => {
    if (followRef.current) {
      // Freeze the rendered look point, including Z, rather than jumping to the old view.
      const center = cameraActions.current?.getLookCenter()
      if (center) update({ ...viewRef.current, center: [center[0], center[1]], centerZ: center[2] })
    }
    clearFollow()
    setFollowEnabled(false)
  }, [clearFollow, update])`, `  const suspendFollow = useCallback(() => {
    if (followRef.current) {
      // Freeze the rendered look point, including Z, rather than jumping to the old view.
      const center = cameraActions.current?.getLookCenter()
      if (center) update({ ...viewRef.current, center: [center[0], center[1]], centerZ: center[2] })
    }
    clearFollow()
  }, [clearFollow, update])
  const releaseFollow = useCallback(() => {
    suspendFollow()
    setFollowEnabled(false)
  }, [suspendFollow])`)
change('src/hooks/useGalaxyNavigation.ts', 'followEnabled, enableFollow, releaseFollow, zoomBy', 'followEnabled, enableFollow, releaseFollow, suspendFollow, zoomBy')
change('src/App.tsx', `  useEffect(() => {
    if (audio.playing && playingPlanet && navigation.followEnabled && navigation.cameraMode === 'orbit') navigation.follow(playingPlanet.id)
  }, [audio.playing, audio.track?.playbackInstance, playingPlanet?.id, galaxy, navigation.followEnabled, navigation.cameraMode, navigation.follow])`, `  useEffect(() => {
    if (!audio.track || (audio.playing && !playingPlanet)) { navigation.suspendFollow(); return }
    if (audio.playing && playingPlanet && navigation.followEnabled && navigation.cameraMode === 'orbit') navigation.follow(playingPlanet.id)
  }, [audio.playing, audio.track?.id, audio.track?.playbackInstance, playingPlanet?.id, galaxy, navigation.followEnabled, navigation.cameraMode, navigation.follow, navigation.suspendFollow])`)
change('src/App.tsx', "disabled={!playingPlanet && !(navigation.followEnabled && albumSync.status === 'loading')}", "disabled={!navigation.followingTarget && !playingPlanet && !(navigation.followEnabled && albumSync.status === 'loading')}")
change('src/App.tsx', '双击星球即播放该曲目并让视角跟随。', '播放歌曲后镜头持续注视对应星球，L 或跟随按钮可解除和恢复。双击星球即播放该曲目并让视角跟随。')
console.log('Unmapped playback freezes the old look point while retaining the follow preference')
