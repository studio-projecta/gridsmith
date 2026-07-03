import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { cellRect } from '../lib/layout'
import type { GridLayout, DropIntent } from '../types'
import GridCell from './GridCell'

const ZOOM_MIN = 0.25
const ZOOM_MAX = 4

/** 삽입 조준선(사이=밀기)의 위치를 출력 좌표계 → % 로 변환. index==N 이면 마지막 셀의 오른쪽 경계. */
function insertLineStyle(layout: GridLayout, index: number): React.CSSProperties {
  const atEnd = index >= layout.cells.length
  const r = cellRect(layout, atEnd ? layout.cells.length - 1 : index)
  const x = atEnd ? r.x + r.w : r.x
  return {
    left: `${(x / layout.outputWidth) * 100}%`,
    top: `${(r.y / layout.outputHeight) * 100}%`,
    height: `${(r.h / layout.outputHeight) * 100}%`,
  }
}

export default function GridEditor({ dropIntent }: { dropIntent?: DropIntent | null }) {
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
            const dropHint =
              dropIntent?.kind === 'cell' && dropIntent.index === i ? dropIntent.mode : 'none'
            return (
              <GridCell
                key={i}
                index={i}
                layout={layout}
                slot={slot}
                image={image}
                url={slot ? urls[slot.imageId] : undefined}
                selected={selectedCell === i}
                dropHint={dropHint}
                onSelect={(idx) => setSelectedCell(idx)}
              />
            )
          })}
          {dropIntent?.kind === 'insert' && (
            <div className="insert-line" style={insertLineStyle(layout, dropIntent.index)} />
          )}
          {(layout.borderWidth ?? 0) > 0 && (
            // 출력 좌표계 viewBox 로 stroke 를 그려 컨테이너 배율과 무관하게 WYSIWYG 로 스케일.
            // preserveAspectRatio="none" 로 컨테이너에 정확히 늘려 맞춘다. bw/2 인셋으로 stroke 가 안쪽에 들어옴.
            <svg
              className="border-overlay"
              viewBox={`0 0 ${layout.outputWidth} ${layout.outputHeight}`}
              preserveAspectRatio="none"
            >
              <rect
                x={layout.borderWidth! / 2}
                y={layout.borderWidth! / 2}
                width={layout.outputWidth - layout.borderWidth!}
                height={layout.outputHeight - layout.borderWidth!}
                fill="none"
                stroke="#000000"
                strokeWidth={layout.borderWidth}
              />
            </svg>
          )}
        </div>
      </div>

      <p className="grid-hint">
        Ctrl/⌘ + 휠 로 확대·축소 · 셀 선택 후 Delete/Backspace 로 비우기
      </p>
    </div>
  )
}
