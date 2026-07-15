import { useState } from 'react'
import ResizeModal from './ResizeModal'

export default function ResizeButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        className="ghost-btn"
        title="이미지를 모바일(293×248)·PC(195×145) 규격 투명 PNG 로 리사이즈해 ZIP 으로 내려받기"
        onClick={() => setOpen(true)}
      >
        🖼 리사이즈
      </button>
      {open && <ResizeModal onClose={() => setOpen(false)} />}
    </>
  )
}
