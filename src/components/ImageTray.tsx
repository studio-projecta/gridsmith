import { useDraggable } from '@dnd-kit/core'
import { useStore } from '../store/useStore'
import type { StoredImage } from '../types'

function TrayThumb({
  img,
  url,
  onDelete,
}: {
  img: StoredImage
  url: string
  onDelete: () => void
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `tray-${img.id}`,
    data: { source: 'tray', imageId: img.id },
  })

  return (
    <div
      className={'thumb' + (isDragging ? ' dragging' : '')}
      title={img.name}
      ref={setNodeRef}
      {...listeners}
      {...attributes}
    >
      <img src={url} alt={img.name} draggable={false} />
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
  const removeImage = useStore((s) => s.removeImage)
  const selectedTypeId = useStore((s) => s.selectedTypeId)

  if (!selectedTypeId) return null

  return (
    <div className="tray">
      <div className="tray-head">
        업로드한 이미지 <span className="count">{images.length}</span>
        <span className="tray-hint">썸네일을 그리드 셀로 드래그하세요</span>
      </div>
      <div className="tray-list">
        {images.map((img) => (
          <TrayThumb
            key={img.id}
            img={img}
            url={urls[img.id]}
            onDelete={() => void removeImage(img.id)}
          />
        ))}
        {images.length === 0 && <div className="tray-empty">이미지를 업로드하세요</div>}
      </div>
    </div>
  )
}
