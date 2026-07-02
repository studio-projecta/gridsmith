import { useRef, useState } from 'react'
import { useStore } from '../store/useStore'

export default function ImageUploader() {
  const selectedTypeId = useStore((s) => s.selectedTypeId)
  const addImages = useStore((s) => s.addImages)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  if (!selectedTypeId) return null

  const handleFiles = (files: FileList | null) => {
    if (!files || !files.length) return
    void addImages(Array.from(files))
  }

  return (
    <div
      className={`uploader ${dragOver ? 'drag-over' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        handleFiles(e.dataTransfer.files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <span>＋ 이미지 업로드 (클릭 또는 드래그)</span>
    </div>
  )
}
