import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useStore } from '../store/useStore'
import { DEFAULT_TRANSFORM } from '../types'
import ImageUploader from './ImageUploader'
import ImageTray from './ImageTray'
import Toolbar from './Toolbar'
import GridEditor from './GridEditor'
import ControlPanel from './ControlPanel'

export default function Workspace() {
  const setCellSlot = useStore((s) => s.setCellSlot)
  const swapCells = useStore((s) => s.swapCells)
  const layout = useStore((s) => s.layout)
  const urls = useStore((s) => s.urls)

  const [activeUrl, setActiveUrl] = useState<string | null>(null)

  // 클릭/삭제와 드래그를 구분하기 위한 최소 이동 거리.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleStart = (e: DragStartEvent) => {
    const data = e.active.data.current
    if (!data) return
    if (data.source === 'tray') setActiveUrl(urls[data.imageId as string] ?? null)
    else if (data.source === 'cell' && layout) {
      const slot = layout.cells[data.index as number]
      setActiveUrl(slot ? urls[slot.imageId] ?? null : null)
    }
  }

  const handleEnd = (e: DragEndEvent) => {
    setActiveUrl(null)
    const over = e.over
    const data = e.active.data.current
    if (!over || !data) return
    const targetIndex = over.data.current?.index as number | undefined
    if (targetIndex == null) return

    if (data.source === 'tray') {
      setCellSlot(targetIndex, {
        imageId: data.imageId as string,
        transform: { ...DEFAULT_TRANSFORM },
      })
    } else if (data.source === 'cell') {
      swapCells(data.index as number, targetIndex)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleStart}
      onDragEnd={handleEnd}
      onDragCancel={() => setActiveUrl(null)}
    >
      <div className="workspace">
        <ImageUploader />
        <ImageTray />
        <Toolbar />
        <div className="editor-row">
          <GridEditor />
          <ControlPanel />
        </div>
      </div>

      <DragOverlay>
        {activeUrl ? <img className="drag-overlay-img" src={activeUrl} alt="" /> : null}
      </DragOverlay>
    </DndContext>
  )
}
