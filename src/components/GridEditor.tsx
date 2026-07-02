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

  if (!layout) return null

  return (
    <div className="grid-stage">
      <div
        ref={containerRef}
        className="grid-container"
        style={{
          aspectRatio: `${layout.outputWidth} / ${layout.outputHeight}`,
          background: layout.bgColor,
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
              onSelect={(idx) => {
                if (!reorder) setSelectedCell(idx)
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
