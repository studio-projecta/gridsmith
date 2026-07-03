import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { GridLayout, StoredImage, CellSlot } from '../types'
import { cellRect, imageRect } from '../lib/layout'

interface Props {
  index: number
  layout: GridLayout
  slot: CellSlot | null
  image: StoredImage | undefined
  url: string | undefined
  selected: boolean
  dropHint: 'none' | 'move' | 'swap'
  onSelect: (index: number) => void
}

export default function GridCell({
  index,
  layout,
  slot,
  image,
  url,
  selected,
  dropHint,
  onSelect,
}: Props) {
  const cell = cellRect(layout, index)

  const { setNodeRef: setDropRef } = useDroppable({
    id: `cell-${index}`,
    data: { index },
  })

  const {
    setNodeRef: setDragRef,
    listeners,
    attributes,
    isDragging,
  } = useDraggable({
    id: `cellimg-${index}`,
    data: { source: 'cell', index },
    disabled: !slot,
  })

  // 출력 px → 컨테이너(출력 종횡비) 대비 % 로 변환.
  const leftPct = (cell.x / layout.outputWidth) * 100
  const topPct = (cell.y / layout.outputHeight) * 100
  const wPct = (cell.w / layout.outputWidth) * 100
  const hPct = (cell.h / layout.outputHeight) * 100

  let imgStyle: React.CSSProperties | null = null
  if (image && slot) {
    const ir = imageRect(cell, image.width, image.height, layout.fit, layout.align)
    imgStyle = {
      position: 'absolute',
      left: `${((ir.x - cell.x) / cell.w) * 100}%`,
      top: `${((ir.y - cell.y) / cell.h) * 100}%`,
      width: `${(ir.w / cell.w) * 100}%`,
      height: `${(ir.h / cell.h) * 100}%`,
    }
  }

  return (
    <div
      ref={setDropRef}
      data-cell-idx={index}
      className={
        'grid-cell' +
        (dropHint === 'move' ? ' drop-move' : '') +
        (dropHint === 'swap' ? ' drop-swap' : '') +
        (selected ? ' selected' : '') +
        (isDragging ? ' dragging' : '')
      }
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${wPct}%`,
        height: `${hPct}%`,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(index)
      }}
    >
      {image && url ? (
        <div className="cell-img-wrap" ref={setDragRef} {...listeners} {...attributes}>
          <img src={url} alt="" draggable={false} style={imgStyle ?? undefined} />
        </div>
      ) : (
        <span className="cell-empty">{index + 1}</span>
      )}
    </div>
  )
}
