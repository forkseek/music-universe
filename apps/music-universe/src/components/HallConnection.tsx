import { useEffect, useState } from 'react'
import { ArrowUpRight, ChevronRight, Disc3, Heart, Music2 } from 'lucide-react'
import { MUSIC_HALL_URL } from '../lib/musicWorld'
import type { CompanionRoom } from './CompanionRooms'

/**
 * 旅伴面板：上方是返回音乐大厅的入口，下方是三个房间入口。
 *
 * 三个房间（音乐电台 / 我的曲库 / 我的旅程）改为应用内浮层 —— 点击后由 App 打开
 * 对应的 .companion-rooms 面板，全程不发生网页跳转，也不打断沉浸播放。
 */
const doors = [
  { room: 'world', title: '音乐电台', detail: '在浮层里打开音乐电台，跟着下一首歌继续漫游。', Icon: Music2 },
  { room: 'library', title: '我的曲库', detail: '在浮层里查看你的曲库，寻找下一张想探索的专辑。', Icon: Disc3 },
  { room: 'journey', title: '我的旅程', detail: '在浮层里回顾你的播放旅程，重新遇见听过的歌。', Icon: Heart },
] as const

export default function HallConnection({ onOpenRoom }: { onOpenRoom: (room: CompanionRoom) => void }) {
  const [hint, setHint] = useState<string | null>(null)
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') setHint(null) }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [])
  return <section className="hall-connection" aria-label="与音乐大厅相连">
    <a className="hall-companion" href={MUSIC_HALL_URL} aria-label="跟随机器人返回音乐大厅">
      <span className="hall-companion-portrait" role="img" aria-label="音乐大厅的奶油白与橙色小机器人" />
      <span className="hall-companion-copy"><span className="hall-connection-eyebrow">MUSIC WORLD <i /> THE SAME LITTLE VOYAGER</span><strong>大厅里的旅伴，陪你到下一片星系。</strong><span>每一首歌，都是一个入口。<span className="hall-return">返回音乐大厅 <ArrowUpRight size={11} /></span></span></span>
    </a>
    <nav className="hall-doors" aria-label="音乐大厅快捷入口">
      {doors.map(({ room, title, detail, Icon }) => <div className="hall-door" key={room} onMouseEnter={() => setHint(room)} onMouseLeave={() => setHint(null)}>
        <button type="button" aria-label={`打开${title}`} aria-describedby={hint === room ? `hall-hint-${room}` : undefined} onClick={() => onOpenRoom(room)} onFocus={() => setHint(room)} onBlur={() => setHint(null)}>
          <span className={`hall-door-ring hall-door-${room}`}><Icon size={18} strokeWidth={1.45} /></span><span>{title}</span><ChevronRight size={12} />
        </button>
        {hint === room && <div className="hall-cloud" role="tooltip" id={`hall-hint-${room}`}><span>光点里的入口</span><strong>{title}</strong><p>{detail}</p><small>点击打开浮层 <ChevronRight size={10} /></small></div>}
      </div>)}
    </nav>
  </section>
}
