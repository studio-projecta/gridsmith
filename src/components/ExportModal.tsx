import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { composeToBlob, downloadBlob } from '../lib/compose'
import { clamp } from '../lib/layout'
import type { GridLayout } from '../types'

const PREVIEW_LONG_EDGE = 320

// 구성은 비율로 계산되고 gap 만 절대 px 라, gap 도 같은 배율로 스케일해야 균일(벡터) 확대가 된다.
function scaleLayout(layout: GridLayout, longEdge: number): GridLayout {
  const base = Math.max(layout.outputWidth, layout.outputHeight)
  const factor = longEdge / base
  return {
    ...layout,
    outputWidth: Math.round(layout.outputWidth * factor),
    outputHeight: Math.round(layout.outputHeight * factor),
    gap: Math.round(layout.gap * factor),
  }
}

interface Props {
  onClose: () => void
}

export default function ExportModal({ onClose }: Props) {
  const layout = useStore((s) => s.layout)
  const images = useStore((s) => s.images)
  const types = useStore((s) => s.types)
  const selectedTypeId = useStore((s) => s.selectedTypeId)

  const [format, setFormat] = useState<'png' | 'jpeg'>('png')
  // 비워두면 구성 기준 긴 변을 그대로 사용. 값을 넣으면 그 긴 변으로 균일 스케일.
  const [sizeInput, setSizeInput] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 썸네일: 최종 크기와 무관하게 구성은 동일하므로 작은 해상도로 한 번만 합성한다.
  useEffect(() => {
    if (!layout) return
    let url: string | null = null
    let alive = true
    void composeToBlob(scaleLayout(layout, PREVIEW_LONG_EDGE), images, 'png').then((blob) => {
      if (!alive) return
      url = URL.createObjectURL(blob)
      setPreview(url)
    })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [layout, images])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!layout) return null

  const base = Math.max(layout.outputWidth, layout.outputHeight)
  const longEdge = sizeInput === '' ? base : clamp(Number(sizeInput) || base, 1, 12000)
  const scaled = scaleLayout(layout, longEdge)

  const handleExport = async () => {
    const big = scaled.outputWidth * scaled.outputHeight > 8000 * 8000
    if (big && !confirm('출력 크기가 매우 큽니다. 브라우저 메모리가 부족할 수 있어요. 계속할까요?')) {
      return
    }
    setBusy(true)
    try {
      const blob = await composeToBlob(scaled, images, format)
      const typeName = types.find((t) => t.id === selectedTypeId)?.name ?? 'grid'
      const safe = typeName.replace(/[^\w가-힣.-]+/g, '_')
      downloadBlob(blob, `${safe}_${scaled.outputWidth}x${scaled.outputHeight}.${format}`)
      onClose()
    } catch (err) {
      alert(`내보내기 실패: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <h3>내보내기</h3>

        <div className="export-figure">
          <div className="dim dim-h">
            <span className="dim-label">{scaled.outputWidth} px</span>
            <span className="dim-brace dim-brace-h" />
          </div>
          <div className="dim dim-v">
            <span className="dim-label">{scaled.outputHeight} px</span>
            <span className="dim-brace dim-brace-v" />
          </div>
          <div
            className={'export-preview' + (layout.transparentBg ? ' transparent-bg' : '')}
            style={{ aspectRatio: `${layout.outputWidth} / ${layout.outputHeight}` }}
          >
            {preview ? (
              <img src={preview} alt="미리보기" />
            ) : (
              <span className="hint">미리보기 생성 중…</span>
            )}
          </div>
        </div>

        <div className="field">
          <label>긴 변의 최종 크기 (px)</label>
          <input
            type="number"
            min={1}
            max={12000}
            value={sizeInput}
            placeholder={String(base)}
            onChange={(e) => setSizeInput(e.target.value)}
          />
        </div>
        <div className="field">
          <label>형식</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as 'png' | 'jpeg')}>
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
        </div>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="export-btn" disabled={busy} onClick={handleExport}>
            {busy ? '생성 중…' : '⬇ 내보내기'}
          </button>
        </div>
      </div>
    </div>
  )
}
