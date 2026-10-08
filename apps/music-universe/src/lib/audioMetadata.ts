export async function readLocalAudioMetadata(file: File) {
  const { parseBlob } = await import('music-metadata')
  const { common, format } = await parseBlob(file, { skipCovers: true, duration: false })
  return { title: common.title?.trim(), artist: (common.artists?.join(' / ') || common.artist)?.trim(), album: common.album?.trim(),
    durationMs: format.duration ? format.duration * 1000 : undefined, trackNumber: common.track.no || undefined, discNumber: common.disk.no || undefined }
}
