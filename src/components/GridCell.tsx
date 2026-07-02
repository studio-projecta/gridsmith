import { useRef } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { GridLayout, StoredImage, CellSlot } from '../types'
import { cellRect, imageRect, clamp } from '../lib/layout'
import { useStore } from '../store/useStore'

interface Props {
  index: number
  layout: GridLayout
  slot: CellSlot | null
  image: StoredImage | undefined
  url: string | undefined
  reorder: boolean
  selected: boolean
  onSelect: (index: number) => void
}

export default function GridCell({
  index,
  layout,
  slot,
  image,
  url,
  reorder,
  selected,
  onSelect,
}: Props) {
  const cell = cellRect(layout, index)
  const updateCellTransform = useStore((s) => s.updateCellTransform)

  const cellElRef = useRef<HTMLDivElement | null>(null)
  // 미세조정 팬 드래그의 기준값(포인터 시작 좌표 + 시작 오프셋 + 셀 화면 크기).
  const panRef = useRef<
    { startX: number; startY: number; baseOX: number; baseOY: number; w: number; h: number } | null
  >(null)

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `cell-${index}`,
    data: { index },
    disabled: !reorder,
  })

  const {
    setNodeRef: setDragRef,
    listeners,
    attributes,
    isDragging,
  } = useDraggable({
    id: `cellimg-${index}`,
    data: { source: 'cell', index },
    disabled: !reorder || !slot,
  })

  const setCellRef = (el: HTMLDivElement | null) => {
    setDropRef(el)
    cellElRef.current = el
  }

  const adjust = !reorder && !!slot

  const onPanDown = (e: React.PointerEvent) => {
    if (!adjust || !slot) return
    onSelect(index)
    const rect = cellElRef.current?.getBoundingClientRect()
    if (!rect) return
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseOX: slot.transform.offsetX,
      baseOY: slot.transform.offsetY,
      w: rect.width,
      h: rect.height,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPanMove = (e: React.PointerEvent) => {
    const p = panRef.current
    if (!p) return
    // 화면 이동 dpx 를 셀 폭 대비 비율로 환산 → offset(-1..1) 은 셀 절반 기준이라 ×2.
    const nOX = clamp(p.baseOX + (2 * (e.clientX - p.startX)) / p.w, -1, 1)
    const nOY = clamp(p.baseOY + (2 * (e.clientY - p.startY)) / p.h, -1, 1)
    updateCellTransform(index, { offsetX: nOX, offsetY: nOY })
  }

  const onPanUp = (e: React.PointerEvent) => {
    if (!panRef.current) return
    panRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  // 출력 px → 컨테이너(출력 종횡비) 대비 % 로 변환.
  const leftPct = (cell.x / layout.outputWidth) * 100
  const topPct = (cell.y / layout.outputHeight) * 100
  const wPct = (cell.w / layout.outputWidth) * 100
  const hPct = (cell.h / layout.outputHeight) * 100

  let imgStyle: React.CSSProperties | null = null
  if (image && slot) {
    const ir = imageRect(cell, image.width, image.height, layout.fit, slot.transform)
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
      ref={setCellRef}
      className={
        'grid-cell' +
        (isOver ? ' over' : '') +
        (selected ? ' selected' : '') +
        (isDragging ? ' dragging' : '') +
        (adjust ? ' adjust' : '')
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
        <div
          className="cell-img-wrap"
          ref={setDragRef}
          {...(reorder ? listeners : {})}
          {...(reorder ? attributes : {})}
          onPointerDown={adjust ? onPanDown : undefined}
          onPointerMove={adjust ? onPanMove : undefined}
          onPointerUp={adjust ? onPanUp : undefined}
        >
          <img src={url} alt="" draggable={false} style={imgStyle ?? undefined} />
        </div>
      ) : (
        <span className="cell-empty">{index + 1}</span>
      )}
    </div>
  )
}
