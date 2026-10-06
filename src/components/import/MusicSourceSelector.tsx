import type { listProviderStatuses } from "@/lib/music/providers/registry";

export function MusicSourceSelector({ providers }: { providers: Awaited<ReturnType<typeof listProviderStatuses>> }) {
  return <div className="sources" role="list" aria-label="音乐来源状态">{providers.map((provider) =>
    <div className={`source-card ${provider.available ? "source-active" : ""}`} role="listitem" key={provider.id}>
      <div className="source-title"><span className="source-symbol" aria-hidden="true">{provider.id === "file" ? "↥" : provider.id === "demo" ? "◉" : "♫"}</span><strong>{provider.name}</strong><span className={`status-dot ${provider.available ? "ready" : ""}`} /></div>
      <p>{provider.id === "file" ? "CSV · JSON · TXT，立即开始" : provider.id === "demo" ? "60 首歌曲 · 20 位艺术家 · 离线可用"
        : provider.id === "qqmusic" ? `${provider.available ? "当前服务可用" : provider.message} 浏览器侧状态见下方。`
          : provider.available ? "当前服务可用" : provider.message}</p>
      {provider.available && (provider.id === "file" || provider.id === "demo" || provider.id === "qqmusic") &&
        <a className="source-link" href={provider.id === "file" ? "#import-heading" : provider.id === "demo" ? "#library-title" : "#qq-connector"}>
          {provider.id === "file" ? "开始导入" : provider.id === "demo" ? "查看 Demo 入口" : "查看连接入口"} <span aria-hidden="true">↗</span>
        </a>}
    </div>,
  )}</div>;
}
