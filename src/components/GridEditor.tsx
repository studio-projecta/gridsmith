import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../store/useStore'
import { clamp } from '../lib/layout'
import GridCell from './GridCell'

export default function GridEditor() {
  const layout = useStore((s) => s.layout)
  const images = useStore((s) => s.images)
  const urls = useStore((s) => s.urls)
  const editMode = useStore((s) => s.editMode)
  const selectedCell = useStore((s) => s.selectedCell)
  const setSelectedCell = useStore((s) => s.setSelectedCell)
  const updateCellTransform = useStore((s) => s.updateCellTransform)
  const setCellSlot = useStore((s) => s.setCellSlot)

  const containerRef = useRef<HTMLDivElement | null>(null)

  const imgMap = useMemo(() => new Map(images.map((i) => [i.id, i])), [images])

  const reorder = editMode === 'reorder'

  // 휠로 선택 셀 확대/축소 (미세조정 모드). onWheel 은 passive 라 preventDefault 불가하여 네이티브 리스너 사용.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (reorder || selectedCell == null) return
      const slot = layout?.cells[selectedCell]
      if (!slot) return
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.05 : 1 / 1.05
      updateCellTransform(selectedCell, {
        scale: clamp(slot.transform.scale * factor, 0.2, 5),
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [reorder, selectedCell, layout, updateCellTransform])

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
      <div
        ref={containerRef}
        className={'grid-container' + (layout.transparentBg ? ' transparent-bg' : '')}
        style={{
          aspectRatio: `${layout.outputWidth} / ${layout.outputHeight}`,
          background: layout.transparentBg ? undefined : layout.bgColor,
        }}
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
              reorder={reorder}
              selected={selectedCell === i}
              onSelect={(idx) => setSelectedCell(idx)}
            />
          )
        })}
      </div>
      <p className="grid-hint">셀을 클릭해 선택한 뒤 Delete/Backspace 키로 해당 칸을 비울 수 있습니다.</p>
    </div>
  )
}
