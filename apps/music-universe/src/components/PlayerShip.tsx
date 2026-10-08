import '../player-ship.css'

/**
 * 播放器的飞船与尾焰，按参考图重绘：圆润的白色/橙色机身、玻璃舱里的小机器人、
 * 顶部信号球，以及尾部一道「白热 → 橙色」的长条拖尾。
 *
 * 坐标分工：这里只画图形，沿弧线的定位交给 PlayerBar 的 .player-ship。
 * 拖尾单独用一个 svg（preserveAspectRatio="none"），这样它的长度按船宽百分比
 * 缩放、三个断点都自动等比，不会被船体的宽高比二次拉伸。
 * 排气口画在 x=6.6 即 44 宽的 15%，所以 CSS 用 right:85% 让拖尾右端正好落在排气口上；
 * 竖直方向排气口在 y=15.6（24 高的 65%），对应 CSS 的 top:65%。
 */
export function PlayerShip() {
  return <>
    <span className="player-trail">
      <svg viewBox="0 0 200 40" preserveAspectRatio="none">
        <defs>
          {/* 主光束：尾端完全透明，越靠排气口越亮、越白热。 */}
          <linearGradient id="player-trail-beam" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="200" y2="20">
            <stop offset="0" stopColor="#ff8a2b" stopOpacity="0" />
            <stop offset=".2" stopColor="#ff8f31" stopOpacity=".18" />
            <stop offset=".58" stopColor="#ffa04a" stopOpacity=".52" />
            <stop offset=".87" stopColor="#ffc880" stopOpacity=".88" />
            <stop offset="1" stopColor="#fff4de" stopOpacity="1" />
          </linearGradient>
          {/* 白热内芯：只存在于靠近排气口的一段。 */}
          <linearGradient id="player-trail-core" gradientUnits="userSpaceOnUse" x1="118" y1="20" x2="200" y2="20">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="1" stopColor="#ffffff" stopOpacity=".92" />
          </linearGradient>
          {/* 包住光束外层的柔光，右缘正好收在排气口，不糊住船体。 */}
          <radialGradient id="player-trail-bloom">
            <stop offset="0" stopColor="#ffdca6" stopOpacity=".8" />
            <stop offset=".45" stopColor="#ff9c3d" stopOpacity=".34" />
            <stop offset="1" stopColor="#ff8a2b" stopOpacity="0" />
          </radialGradient>
          {/* 排气口的高光与横向眩光。 */}
          <radialGradient id="player-trail-flare">
            <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
            <stop offset=".34" stopColor="#ffe4b6" stopOpacity=".92" />
            <stop offset="1" stopColor="#ff9a2e" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="164" cy="20" rx="36" ry="9" fill="url(#player-trail-bloom)" />
        <path d="M200 17.6 L0 19.5 L0 20.5 L200 22.4 Z" fill="url(#player-trail-beam)" />
        <path d="M200 19.2 L118 19.8 L118 20.2 L200 20.8 Z" fill="url(#player-trail-core)" />
        <ellipse className="player-trail-flare" cx="190" cy="20" rx="12" ry="1" fill="url(#player-trail-flare)" />
        <circle className="player-trail-flare" cx="197.5" cy="20" r="3.2" fill="url(#player-trail-flare)" />
      </svg>
    </span>
    {/* 船首朝右、排气口朝左，与轨道前进方向一致。 */}
    <svg className="player-ship-body" viewBox="0 0 44 24">
      <defs>
        <linearGradient id="player-ship-hull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset=".45" stopColor="#f7ebd9" />
          <stop offset="1" stopColor="#dcc9ad" />
        </linearGradient>
        <linearGradient id="player-ship-orange" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb768" />
          <stop offset=".55" stopColor="#ef8a34" />
          <stop offset="1" stopColor="#d9691f" />
        </linearGradient>
        <linearGradient id="player-ship-nose" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ef8a34" />
          <stop offset="1" stopColor="#ffc98c" />
        </linearGradient>
        <radialGradient id="player-ship-glass" cx=".36" cy=".2" r="1">
          <stop offset="0" stopColor="#59667c" />
          <stop offset=".5" stopColor="#2b3342" />
          <stop offset="1" stopColor="#151a23" />
        </radialGradient>
        <radialGradient id="player-ship-antenna" cx=".35" cy=".3" r="1">
          <stop offset="0" stopColor="#ffd08a" />
          <stop offset="1" stopColor="#e8761f" />
        </radialGradient>
        <clipPath id="player-ship-hull-clip"><ellipse cx="22" cy="14.8" rx="15" ry="6.4" /></clipPath>
        <clipPath id="player-ship-dome-clip"><path d="M12.4 12.6C12.4 7.2 15.4 4.4 19.4 4.4 23.4 4.4 26.4 7.2 26.4 12.6Z" /></clipPath>
      </defs>

      {/* 后掠尾鳍（白身橙边）与腹鳍 */}
      <path d="M9.6 12.8C6.8 9.4 4.4 7 2.6 5.6 5.8 6.6 9.4 9.2 12.4 12.8Z" fill="#f7efe3" />
      <path d="M9.6 12.8C6.8 9.4 4.4 7 2.6 5.6 5.8 6.6 9.4 9.2 12.4 12.8" fill="none" stroke="#ef8a34" strokeWidth=".5" />
      <path d="M9.4 17.4C7.4 19.6 5.6 21 4 21.8 6.4 21.2 9 19.6 11.4 17.2Z" fill="#e8dcc8" />

      {/* 船体：白色机体 + 下半橙 + 后侧竖带 + 顶部高光，全部裁剪在机体轮廓内 */}
      <g clipPath="url(#player-ship-hull-clip)">
        <ellipse cx="22" cy="14.8" rx="15" ry="6.4" fill="url(#player-ship-hull)" />
        <rect x="7" y="15.9" width="30" height="9" fill="url(#player-ship-orange)" />
        <rect x="23.4" y="8" width="3.4" height="14" fill="#ef8a34" opacity=".85" />
        <ellipse cx="20" cy="11.4" rx="9.4" ry="2.2" fill="#ffffff" opacity=".45" />
      </g>
      <path d="M32.4 10.7C37.4 11.3 41.2 12.9 43.2 14.8 41.2 16.7 37.4 18.3 32.4 18.9Z" fill="url(#player-ship-nose)" />
      <ellipse cx="37.6" cy="13.6" rx="3.4" ry="1" fill="#ffffff" opacity=".3" />

      {/* 玻璃舱：先铺玻璃，再画舱内小机器人，最后压一圈舱罩高光 */}
      <path d="M12.4 12.6C12.4 7.2 15.4 4.4 19.4 4.4 23.4 4.4 26.4 7.2 26.4 12.6Z" fill="url(#player-ship-glass)" />
      <g clipPath="url(#player-ship-dome-clip)">
        <path d="M16 14.8C16.8 13.2 22 13.2 22.8 14.8L22.8 16.4 16 16.4Z" fill="#f2e6d3" />
        <ellipse cx="19.4" cy="11.4" rx="2.8" ry="2.4" fill="#141416" />
        <circle cx="18.4" cy="11.5" r=".9" fill="#08080a" stroke="#ffa63d" strokeWidth=".34" />
        <circle cx="20.4" cy="11.5" r=".9" fill="#08080a" stroke="#ffa63d" strokeWidth=".34" />
        <circle cx="18.15" cy="11.2" r=".24" fill="#ffffff" />
        <circle cx="20.15" cy="11.2" r=".24" fill="#ffffff" />
      </g>
      <path d="M12.4 12.6C12.4 7.2 15.4 4.4 19.4 4.4" fill="none" stroke="#ffffff" strokeWidth=".5" opacity=".6" />
      <ellipse cx="15.6" cy="8.6" rx="1.5" ry="2.4" fill="#ffffff" opacity=".22" transform="rotate(-22 15.6 8.6)" />

      {/* 顶部信号球 */}
      <path d="M19.4 4.7V3.1" stroke="#efe6d8" strokeWidth=".6" />
      <circle cx="19.4" cy="3" r="1.1" fill="url(#player-ship-antenna)" />
      <circle cx="19.05" cy="2.72" r=".3" fill="#fff3dd" opacity=".85" />

      {/* 排气口：拖尾从这里接出（x=6.6 → CSS right:85%，y=15.6 → top:65%） */}
      <ellipse cx="6.6" cy="15.6" rx="1.7" ry="2.2" fill="#ffb768" />
      <ellipse cx="6.6" cy="15.6" rx=".85" ry="1.25" fill="#fff6e2" />
    </svg>
  </>
}
