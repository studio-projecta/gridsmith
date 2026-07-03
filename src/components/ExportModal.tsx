import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { composeToBlob, downloadBlob } from '../lib/compose'
import { clamp, trimEmptyLines } from '../lib/layout'
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
    borderWidth: Math.round((layout.borderWidth ?? 0) * factor),
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
  // 가로/세로 입력. 비워두면 구성 기준 크기 사용. 한쪽을 바꾸면 나머지를 비율대로 자동 갱신.
  const [wStr, setWStr] = useState('')
  const [hStr, setHStr] = useState('')
  // 켜면 모든 칸이 빈 행/열을 빼고 비율을 재조정한 레이아웃으로 미리보기·내보낸다.
  const [trim, setTrim] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // trimEmptyLines 는 뺄 게 없으면 원본을 그대로(동일 참조) 돌려주므로 참조 비교로 활성 여부를 판단한다.
  const trimmed = useMemo(() => (layout ? trimEmptyLines(layout) : null), [layout])
  const trimmable = trimmed !== layout
  const base = trim && trimmable ? trimmed : layout

  // 썸네일: 최종 크기와 무관하게 구성은 동일하므로 작은 해상도로 한 번만 합성한다.
  useEffect(() => {
    if (!base) return
    let url: string | null = null
    let alive = true
    void composeToBlob(scaleLayout(base, PREVIEW_LONG_EDGE), images, 'png').then((blob) => {
      if (!alive) return
      url = URL.createObjectURL(blob)
      setPreview(url)
    })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [base, images])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!base) return null

  // 구성 비율(가로:세로). 한쪽 입력 시 다른 쪽을 이 비율로 맞춘다.
  const ratio = base.outputWidth / base.outputHeight
  const outW = clamp(Number(wStr) || base.outputWidth, 1, 12000)
  const outH = clamp(Number(hStr) || base.outputHeight, 1, 12000)
  // 전체를 균일 스케일. gap 만 절대 px 라 같은 배율로 함께 스케일(벡터 확대).
  const factor = outW / base.outputWidth
  const scaled: GridLayout = {
    ...base,
    outputWidth: outW,
    outputHeight: outH,
    gap: Math.round(base.gap * factor),
    borderWidth: Math.round((base.borderWidth ?? 0) * factor),
  }

  const onWidth = (s: string) => {
    setWStr(s)
    const n = Number(s)
    if (n > 0) setHStr(String(clamp(Math.round(n / ratio), 1, 12000)))
  }
  const onHeight = (s: string) => {
    setHStr(s)
    const n = Number(s)
    if (n > 0) setWStr(String(clamp(Math.round(n * ratio), 1, 12000)))
  }

  // 압축 토글 시 비율이 바뀌므로 이전 비율로 연동돼 있던 입력을 비워 기준 크기로 되돌린다.
  const toggleTrim = (on: boolean) => {
    setTrim(on)
    setWStr('')
    setHStr('')
  }

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
            <span className="dim-label">{outW} px</span>
            <span className="dim-brace dim-brace-h" />
          </div>
          <div className="dim dim-v">
            <span className="dim-label">{outH} px</span>
            <span className="dim-brace dim-brace-v" />
          </div>
          <div
            className={'export-preview' + (base.transparentBg ? ' transparent-bg' : '')}
            style={{ aspectRatio: `${base.outputWidth} / ${base.outputHeight}` }}
          >
            {preview ? (
              <img src={preview} alt="미리보기" />
            ) : (
              <span className="hint">미리보기 생성 중…</span>
            )}
          </div>
        </div>

        <div className="field">
          <label>가로 (px)</label>
          <input
            type="number"
            min={1}
            max={12000}
            value={wStr}
            placeholder={String(base.outputWidth)}
            onChange={(e) => onWidth(e.target.value)}
          />
        </div>
        <div className="field">
          <label>세로 (px)</label>
          <input
            type="number"
            min={1}
            max={12000}
            value={hStr}
            placeholder={String(base.outputHeight)}
            onChange={(e) => onHeight(e.target.value)}
          />
        </div>
        <div className="field">
          <label>형식</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as 'png' | 'jpeg')}>
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
        </div>
        <div className="field">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={trim && trimmable}
              disabled={!trimmable}
              onChange={(e) => toggleTrim(e.target.checked)}
            />
            빈 행/열 제거
          </label>
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
