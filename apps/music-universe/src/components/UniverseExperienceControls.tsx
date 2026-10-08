import { useEffect, useRef } from 'react'
import { Sparkles, X } from 'lucide-react'
import type { CameraMotionPreset } from '../lib/cameraMotion'
import type { MusicEffectLevel } from '../lib/universeExperience'
import '../universe-experience.css'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  effectLevel: MusicEffectLevel
  onEffectLevel: (level: MusicEffectLevel) => void
  motionPreset: CameraMotionPreset
  onMotionPreset: (preset: CameraMotionPreset) => void
  reducedMotion: boolean
  analysisUnavailable: boolean
}

export function UniverseExperienceControls(props: Props) {
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!props.open) return
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) props.onOpenChange(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [props.open, props.onOpenChange])
  return <div ref={root} className="universe-experience-controls" data-testid="universe-experience-controls">
    <button ref={trigger} type="button" className="universe-experience-trigger" aria-label="宇宙效果" aria-expanded={props.open} aria-controls="universe-experience-menu"
      onClick={() => props.onOpenChange(!props.open)}><Sparkles size={15} aria-hidden="true" /><span>宇宙效果</span></button>
    {props.open && <section id="universe-experience-menu" className="universe-experience-menu" aria-label="宇宙效果设置"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); props.onOpenChange(false); trigger.current?.focus() } }}>
      <div className="experience-menu-head"><span>宇宙效果</span><button type="button" aria-label="关闭宇宙效果设置" onClick={() => { props.onOpenChange(false); trigger.current?.focus() }}><X size={15} /></button></div>
      <fieldset><legend>音乐联动</legend><div className="experience-options">
        {(['off', 'subtle', 'full'] as const).map(level => <button key={level} type="button" aria-pressed={props.effectLevel === level} onClick={() => props.onEffectLevel(level)}>
          {{ off: '关闭', subtle: '轻柔', full: '增强' }[level]}</button>)}
      </div></fieldset>
      <fieldset><legend>镜头</legend><div className="experience-options">
        {(['still', 'gentle', 'cruise'] as const).map(preset => <button key={preset} type="button" aria-pressed={(props.reducedMotion ? 'still' : props.motionPreset) === preset}
          disabled={props.reducedMotion && preset !== 'still'} onClick={() => props.onMotionPreset(preset)}>{{ still: '静止', gentle: '微动', cruise: '巡航' }[preset]}</button>)}
      </div></fieldset>
      {props.reducedMotion && <p role="status">已按系统设置减少动态效果</p>}
      {!props.reducedMotion && props.analysisUnavailable && props.effectLevel !== 'off' && <p role="status">当前音源暂不支持音乐联动，播放不受影响</p>}
    </section>}
  </div>
}
