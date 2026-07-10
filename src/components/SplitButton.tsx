import { useState } from 'react'
import SplitModal from './SplitModal'

export default function SplitButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        className="ghost-btn"
        title="이미지 한 장을 비율로 분할해 ZIP 으로 내려받기"
        onClick={() => setOpen(true)}
      >
        ✂ 분할
      </button>
      {open && <SplitModal onClose={() => setOpen(false)} />}
    </>
  )
}
