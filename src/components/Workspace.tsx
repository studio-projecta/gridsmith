import { useCallback, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useStore } from '../store/useStore'
import { DEFAULT_TRANSFORM, type DropIntent } from '../types'
import ImageUploader from './ImageUploader'
import ImageTray from './ImageTray'
import Toolbar from './Toolbar'
import GridEditor from './GridEditor'

// 셀 폭에서 이 비율 안쪽의 좌/우 가장자리를 '사이(경계)' 조준으로 본다. 중앙은 셀 조준.
const EDGE_FRACTION = 0.28

function sameIntent(a: DropIntent | null, b: DropIntent | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.kind !== b.kind || a.index !== b.index) return false
  return a.kind === 'cell' && b.kind === 'cell' ? a.mode === b.mode : true
}

// 포인터가 여백/셀 간격 위로 벗어나도 사이 조준을 유지할 여유(px).
const HIT_TOLERANCE = 28

/**
 * 포인터가 놓인 셀(없으면 그리드 영역 안에서 가장 가까운 셀)을 찾는다.
 * dnd-kit 의 over 는 드래그 노드 rect 겹침으로 결정돼 포인터와 어긋나므로,
 * 좌/우 가장자리·바깥 여백에서 조준이 끊기지 않도록 포인터 좌표로 직접 판정한다.
 */
function pickCell(pointer: { x: number; y: number }): { index: number; rect: DOMRect } | null {
  const container = document.querySelector<HTMLElement>('.grid-container')
  if (!container) return null
  const cb = container.getBoundingClientRect()
  if (
    pointer.x < cb.left - HIT_TOLERANCE ||
    pointer.x > cb.right + HIT_TOLERANCE ||
    pointer.y < cb.top - HIT_TOLERANCE ||
    pointer.y > cb.bottom + HIT_TOLERANCE
  ) {
    return null
  }
  let best: { index: number; rect: DOMRect } | null = null
  let bestDist = Infinity
  for (const el of container.querySelectorAll<HTMLElement>('[data-cell-idx]')) {
    const rect = el.getBoundingClientRect()
    const dx = Math.max(rect.left - pointer.x, 0, pointer.x - rect.right)
    const dy = Math.max(rect.top - pointer.y, 0, pointer.y - rect.bottom)
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      bestDist = dist
      best = { index: Number(el.dataset.cellIdx), rect }
    }
  }
  return best
}

export default function Workspace() {
  const insertCellSlot = useStore((s) => s.insertCellSlot)
  const setCellSlot = useStore((s) => s.setCellSlot)
  const moveCellInsert = useStore((s) => s.moveCellInsert)
  const moveCellTo = useStore((s) => s.moveCellTo)
  const swapCells = useStore((s) => s.swapCells)
  const layout = useStore((s) => s.layout)
  const urls = useStore((s) => s.urls)

  const [activeUrl, setActiveUrl] = useState<string | null>(null)
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null)
  // 좌측 트레이 폭(px). 리사이저 바를 좌우로 끌어 조절.
  const [trayWidth, setTrayWidth] = useState(170)
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null)
  // 드롭 시점에 최신 intent 를 동기 참조하기 위한 사본.
  const intentRef = useRef<DropIntent | null>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)

  // 클릭/삭제와 드래그를 구분하기 위한 최소 이동 거리.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const TRAY_MIN = 120
  const TRAY_MAX = 480
  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeRef.current = { startX: e.clientX, startW: trayWidth }
  }
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current
    if (!r) return
    const next = r.startW + (e.clientX - r.startX)
    setTrayWidth(Math.min(TRAY_MAX, Math.max(TRAY_MIN, next)))
  }
  const onResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return
    resizeRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const setIntent = (next: DropIntent | null) => {
    if (sameIntent(intentRef.current, next)) return
    intentRef.current = next
    setDropIntent(next)
  }

  // 리스너 add/remove 가 동일 참조를 쓰도록 안정화(리렌더 시 누수 방지). pointerRef 만 만지므로 deps 없음.
  const onPointerMove = useCallback((e: PointerEvent) => {
    pointerRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleStart = (e: DragStartEvent) => {
    window.addEventListener('pointermove', onPointerMove)
    const data = e.active.data.current
    if (!data) return
    if (data.source === 'tray') setActiveUrl(urls[data.imageId as string] ?? null)
    else if (data.source === 'cell' && layout) {
      const slot = layout.cells[data.index as number]
      setActiveUrl(slot ? urls[slot.imageId] ?? null : null)
    }
  }

  const handleMove = (e: DragMoveEvent) => {
    const pointer = pointerRef.current
    if (!layout || !pointer) {
      setIntent(null)
      return
    }
    const picked = pickCell(pointer)
    if (!picked) {
      setIntent(null)
      return
    }
    const overIndex = picked.index
    const source = e.active.data.current?.source as 'tray' | 'cell' | undefined
    // 좌/우 가장자리로 사이를 판정한다: 셀 좌측=그 셀 앞, 우측=그 셀 뒤(읽기순서).
    // 여백 위(frac<0 또는 >1)에서도 끝 판정이 그대로 이어지도록 clamp 하지 않는다.
    // 1열이면 모든 셀이 행의 첫 셀이라 좌측 타겟이 곧 그 행 위(이전 행 마지막과의 사이)가 된다.
    const rect = picked.rect
    const frac = rect.width > 0 ? (pointer.x - rect.left) / rect.width : 0.5

    if (frac < EDGE_FRACTION) {
      setIntent({ kind: 'insert', index: overIndex })
    } else if (frac > 1 - EDGE_FRACTION) {
      setIntent({ kind: 'insert', index: overIndex + 1 })
    } else {
      // 자기 자신 위 중앙은 조준 표시하지 않는다(스왑/이동 대상이 없음).
      if (source === 'cell' && (e.active.data.current?.index as number) === overIndex) {
        setIntent(null)
        return
      }
      const mode = layout.cells[overIndex] ? 'swap' : 'move'
      setIntent({ kind: 'cell', index: overIndex, mode })
    }
  }

  const cleanup = () => {
    window.removeEventListener('pointermove', onPointerMove)
    pointerRef.current = null
    setActiveUrl(null)
    setIntent(null)
  }

  const handleEnd = (e: DragEndEvent) => {
    const intent = intentRef.current
    const data = e.active.data.current
    cleanup()
    if (!intent || !data) return

    if (data.source === 'tray') {
      const slot = { imageId: data.imageId as string, transform: { ...DEFAULT_TRANSFORM } }
      // 트레이엔 스왑 상대가 없으므로 사이/있는 칸은 밀기, 빈 칸은 그 자리에 놓기.
      if (intent.kind === 'insert') insertCellSlot(intent.index, slot)
      else if (intent.mode === 'move') setCellSlot(intent.index, slot)
      else insertCellSlot(intent.index, slot)
    } else if (data.source === 'cell') {
      const from = data.index as number
      if (intent.kind === 'insert') moveCellInsert(from, intent.index)
      else if (intent.mode === 'swap') swapCells(from, intent.index)
      else moveCellTo(from, intent.index)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleStart}
      onDragMove={handleMove}
      onDragEnd={handleEnd}
      onDragCancel={cleanup}
    >
      <div className="workspace">
        <Toolbar />
        <div className="work-body" style={{ '--tray-w': `${trayWidth}px` } as React.CSSProperties}>
          <aside className="tray-col">
            <ImageUploader />
            <ImageTray />
          </aside>
          <div
            className="col-resizer"
            role="separator"
            aria-orientation="vertical"
            title="드래그하여 폭 조절"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          >
            <span className="col-resizer-grip" />
          </div>
          <GridEditor dropIntent={dropIntent} />
        </div>
      </div>

      <DragOverlay>
        {activeUrl ? <img className="drag-overlay-img" src={activeUrl} alt="" /> : null}
      </DragOverlay>
    </DndContext>
  )
}
