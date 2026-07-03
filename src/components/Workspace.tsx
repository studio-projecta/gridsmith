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
  // 드롭 시점에 최신 intent 를 동기 참조하기 위한 사본.
  const intentRef = useRef<DropIntent | null>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)

  // 클릭/삭제와 드래그를 구분하기 위한 최소 이동 거리.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

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
    const overIndex = e.over?.data.current?.index as number | undefined
    if (overIndex == null || !layout) {
      setIntent(null)
      return
    }
    const source = e.active.data.current?.source as 'tray' | 'cell' | undefined
    const el = document.querySelector<HTMLElement>(`[data-cell-idx="${overIndex}"]`)
    const pointer = pointerRef.current
    let frac = 0.5
    if (el && pointer) {
      const rect = el.getBoundingClientRect()
      frac = rect.width > 0 ? (pointer.x - rect.left) / rect.width : 0.5
    }

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
        <div className="work-body">
          <aside className="tray-col">
            <ImageUploader />
            <ImageTray />
          </aside>
          <GridEditor dropIntent={dropIntent} />
        </div>
      </div>

      <DragOverlay>
        {activeUrl ? <img className="drag-overlay-img" src={activeUrl} alt="" /> : null}
      </DragOverlay>
    </DndContext>
  )
}
