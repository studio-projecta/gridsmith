import { useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { useStore } from '../store/useStore'
import type { StoredImage } from '../types'

function TrayThumb({
  img,
  url,
  placed,
  onDelete,
  onPlace,
}: {
  img: StoredImage
  url: string
  placed: boolean
  onDelete: () => void
  onPlace: () => void
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `tray-${img.id}`,
    data: { source: 'tray', imageId: img.id },
  })

  // 드래그 후에도 click 이 뒤따를 수 있어, 포인터 이동 거리로 클릭/드래그를 구분한다.
  const downPos = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      className={'thumb' + (isDragging ? ' dragging' : '') + (placed ? ' placed' : '')}
      title={`${img.name} · ${placed ? '이미 배치됨 · ' : ''}클릭하면 다음 빈 칸에 추가`}
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onPointerDownCapture={(e) => {
        downPos.current = { x: e.clientX, y: e.clientY }
      }}
      onClick={(e) => {
        const d = downPos.current
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return
        onPlace()
      }}
    >
      <img src={url} alt={img.name} draggable={false} />
      {placed && <span className="thumb-placed" title="배치됨">✓</span>}
      <button
        className="thumb-del"
        title="삭제"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          if (confirm(`"${img.name}" 이미지를 삭제할까요?`)) onDelete()
        }}
      >
        ✕
      </button>
    </div>
  )
}

export default function ImageTray() {
  const images = useStore((s) => s.images)
  const urls = useStore((s) => s.urls)
  const layout = useStore((s) => s.layout)
  const removeImage = useStore((s) => s.removeImage)
  const placeInNextEmpty = useStore((s) => s.placeInNextEmpty)
  const selectedTypeId = useStore((s) => s.selectedTypeId)

  if (!selectedTypeId) return null

  const placedIds = new Set(
    (layout?.cells ?? []).filter((c) => c != null).map((c) => c!.imageId),
  )
  const placedCount = images.reduce((n, img) => n + (placedIds.has(img.id) ? 1 : 0), 0)

  return (
    <div className="tray">
      <div className="tray-head">
        <span>이미지</span>
        <span className="count">{placedCount} / {images.length}</span>
      </div>
      <div className="tray-hint">클릭=다음 빈 칸 · 드래그=지정 셀</div>
      <div className="tray-list">
        {images.map((img) => (
          <TrayThumb
            key={img.id}
            img={img}
            url={urls[img.id]}
            placed={placedIds.has(img.id)}
            onDelete={() => void removeImage(img.id)}
            onPlace={() => placeInNextEmpty(img.id)}
          />
        ))}
        {images.length === 0 && <div className="tray-empty">이미지를 업로드하세요</div>}
      </div>
    </div>
  )
}
