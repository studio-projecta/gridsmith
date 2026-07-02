import { useState } from 'react'
import { useStore } from '../store/useStore'
import ExportModal from './ExportModal'

export default function ExportButton() {
  const layout = useStore((s) => s.layout)
  const [open, setOpen] = useState(false)

  const filled = layout ? layout.cells.some((c) => c) : false

  return (
    <span className="export-group">
      <button className="export-btn" disabled={!filled} onClick={() => setOpen(true)}>
        ⬇ 내보내기
      </button>
      {open && <ExportModal onClose={() => setOpen(false)} />}
    </span>
  )
}
