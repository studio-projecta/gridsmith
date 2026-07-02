import { useState } from 'react'
import { useStore } from '../store/useStore'
import { composeToBlob, downloadBlob } from '../lib/compose'

export default function ExportButton() {
  const layout = useStore((s) => s.layout)
  const images = useStore((s) => s.images)
  const types = useStore((s) => s.types)
  const selectedTypeId = useStore((s) => s.selectedTypeId)

  const [format, setFormat] = useState<'png' | 'jpeg'>('png')
  const [busy, setBusy] = useState(false)

  const filled = layout ? layout.cells.some((c) => c) : false

  const handleExport = async () => {
    if (!layout) return
    const big = layout.outputWidth * layout.outputHeight > 8000 * 8000
    if (big && !confirm('출력 크기가 매우 큽니다. 브라우저 메모리가 부족할 수 있어요. 계속할까요?')) {
      return
    }
    setBusy(true)
    try {
      const blob = await composeToBlob(layout, images, format)
      const typeName = types.find((t) => t.id === selectedTypeId)?.name ?? 'grid'
      const safe = typeName.replace(/[^\w가-힣.-]+/g, '_')
      downloadBlob(blob, `${safe}_${layout.cols}x${layout.rows}.${format}`)
    } catch (err) {
      alert(`내보내기 실패: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="export-group">
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as 'png' | 'jpeg')}
        title="출력 형식"
      >
        <option value="png">PNG</option>
        <option value="jpeg">JPEG</option>
      </select>
      <button className="export-btn" disabled={busy || !filled} onClick={handleExport}>
        {busy ? '생성 중…' : '⬇ 내보내기'}
      </button>
    </span>
  )
}
