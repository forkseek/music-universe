export function officialQqAuthorizeUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'graph.qq.com' || url.port || url.username || url.password || url.pathname !== '/oauth2.0/authorize') throw new Error('QQ 官方授权地址无效，请重新连接。')
  return url.href
}
export function openAuthWindow(): Window | null {
  const popup = window.open('about:blank', '_blank', 'popup=yes,width=720,height=620')
  if (popup) popup.opener = null
  return popup
}
