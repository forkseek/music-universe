const MEDIA_ERRORS: Record<number, string> = {
  1: '音频加载被中断，请重试。',
  2: '音频下载中断，请检查网络后重试。',
  3: '音频无法解码，文件可能已损坏或格式不受支持。',
  4: '无法播放该音频：地址不可用，或浏览器不支持该格式。',
}

/** Native media failure takes precedence over a generic rejected play() promise. */
export function playbackFailure(error: unknown, mediaCode?: number) {
  const name = error instanceof Error || error instanceof DOMException ? error.name : ''
  if (mediaCode && MEDIA_ERRORS[mediaCode]) return { status: 'error' as const, blocked: false, message: MEDIA_ERRORS[mediaCode] }
  if (name === 'NotAllowedError') return { status: 'paused' as const, blocked: true, message: '音源已准备好，请再点击一次播放。' }
  if (name === 'NotSupportedError') return { status: 'error' as const, blocked: false, message: MEDIA_ERRORS[4] }
  return { status: 'paused' as const, blocked: false, message: '音频暂时无法播放，请点击播放重试。' }
}
