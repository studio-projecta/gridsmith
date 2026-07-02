import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import GridCell from './GridCell'

const ZOOM_MIN = 0.25
const ZOOM_MAX = 4

export default function GridEditor() {
  const layout = useStore((s) => s.layout)
  const images = useStore((s) => s.images)
  const urls = useStore((s) => s.urls)
  const selectedCell = useStore((s) => s.selectedCell)
  const setSelectedCell = useStore((s) => s.setSelectedCell)
  const setCellSlot = useStore((s) => s.setCellSlot)

  const containerRef = useRef<HTMLDivElement | null>(null)
  // 편집 미리보기 줌(출력 크기와 무관한 표시 배율).
  const [zoom, setZoom] = useState(1)
  const setZoomClamped = (z: number) =>
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100)))

  const imgMap = useMemo(() => new Map(images.map((i) => [i.id, i])), [images])

  // 휠 + Ctrl/⌘ 이면 미리보기 줌. onWheel 은 passive 라 preventDefault 불가하여 네이티브 리스너 사용.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      setZoomClamped(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom])

  // 선택한 셀에서 Delete/Backspace 로 이미지 비우기(트레이 원본은 유지).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return
      }
      if (selectedCell == null || !layout?.cells[selectedCell]) return
      e.preventDefault()
      setCellSlot(selectedCell, null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedCell, layout, setCellSlot])

  if (!layout) return null

  return (
    <div className="grid-stage">
      <div className="zoom-bar">
        <button
          className="zoom-btn"
          title="축소"
          aria-label="축소"
          onClick={() => setZoomClamped(zoom - 0.25)}
          disabled={zoom <= ZOOM_MIN}
        >
          −
        </button>
        <span className="zoom-value">{Math.round(zoom * 100)}%</span>
        <button
          className="zoom-btn"
          title="확대"
          aria-label="확대"
          onClick={() => setZoomClamped(zoom + 0.25)}
          disabled={zoom >= ZOOM_MAX}
        >
          ＋
        </button>
        <button className="zoom-reset" title="100%로" onClick={() => setZoom(1)}>
          맞춤
        </button>
      </div>

      <div className="grid-scroll">
        <div
          ref={containerRef}
          className={'grid-container' + (layout.transparentBg ? ' transparent-bg' : '')}
          style={
            {
              aspectRatio: `${layout.outputWidth} / ${layout.outputHeight}`,
              background: layout.transparentBg ? undefined : layout.bgColor,
              '--zoom': zoom,
            } as React.CSSProperties
          }
          onClick={() => setSelectedCell(null)}
        >
          {layout.cells.map((slot, i) => {
            const image = slot ? imgMap.get(slot.imageId) : undefined
            return (
              <GridCell
                key={i}
                index={i}
                layout={layout}
                slot={slot}
                image={image}
                url={slot ? urls[slot.imageId] : undefined}
                selected={selectedCell === i}
                onSelect={(idx) => setSelectedCell(idx)}
              />
            )
          })}
        </div>
      </div>

      <p className="grid-hint">
        Ctrl/⌘ + 휠 로 확대·축소 · 셀 선택 후 Delete/Backspace 로 비우기
      </p>
    </div>
  )
}
