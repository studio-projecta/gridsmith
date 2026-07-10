import { useEffect, useMemo, useState } from 'react'
import { computeSplitGeometry, splitImage } from '../lib/split'
import { zipStore } from '../lib/zip'
import { downloadBlob } from '../lib/compose'

interface Props {
  onClose: () => void
}

interface Loaded {
  file: File
  url: string
  width: number
  height: number
}

// "2x3" / "2X3" / "2×3" 를 [cols, rows] 로. 유효하지 않으면 null.
function parseRatio(s: string): [number, number] | null {
  const m = s.trim().match(/^(\d+)\s*[x×X]\s*(\d+)$/)
  if (!m) return null
  const cols = Number(m[1])
  const rows = Number(m[2])
  if (cols < 1 || rows < 1) return null
  return [cols, rows]
}

export default function SplitModal({ onClose }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [mode, setMode] = useState<'1x3' | '2x3' | 'custom'>('2x3')
  const [ratioStr, setRatioStr] = useState('2x3')
  const [sepStr, setSepStr] = useState('1')
  const [format, setFormat] = useState<'png' | 'jpeg'>('png')
  const [busy, setBusy] = useState(false)

  // 프리셋: 자주 쓰는 비율은 구분선 1px 고정으로 바로 선택. 사용자 지정은 직접 입력.
  const selectPreset = (preset: '1x3' | '2x3') => {
    setMode(preset)
    setRatioStr(preset)
    setSepStr('1')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 언마운트 시 마지막 미리보기 URL 해제.
  useEffect(() => () => {
    if (loaded) URL.revokeObjectURL(loaded.url)
  }, [loaded])

  const pickFile = async (file: File) => {
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      alert('이미지를 읽을 수 없습니다.')
      return
    }
    const width = bitmap.width
    const height = bitmap.height
    bitmap.close()
    setLoaded((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return { file, url: URL.createObjectURL(file), width, height }
    })
  }

  const ratio = parseRatio(ratioStr)
  const sep = Math.max(0, Math.floor(Number(sepStr) || 0))

  const geo = useMemo(() => {
    if (!loaded || !ratio) return null
    return computeSplitGeometry(loaded.width, loaded.height, ratio[0], ratio[1], sep)
  }, [loaded, ratio, sep])

  const valid = geo !== null && geo.cellW >= 1 && geo.cellH >= 1

  const handleDownload = async () => {
    if (!loaded || !ratio || !valid) return
    setBusy(true)
    try {
      const files = await splitImage(loaded.file, ratio[0], ratio[1], sep, format)
      const zip = await zipStore(files)
      downloadBlob(zip, `split-${ratio[0]}x${ratio[1]}.zip`)
      onClose()
    } catch (err) {
      alert(`분할 실패: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal split-modal" onClick={(e) => e.stopPropagation()}>
        <h3>이미지 분할</h3>

        <div className="field">
          <label>이미지</label>
          <label className="split-file-btn">
            {loaded ? '이미지 변경' : '파일 선택'}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void pickFile(f)
              }}
            />
          </label>
        </div>

        {loaded && (
          <div className="split-figure">
            <img className="split-preview" src={loaded.url} alt="원본 미리보기" />
            <span className="hint">
              원본 {loaded.width}×{loaded.height}
            </span>
          </div>
        )}

        <div className="field">
          <label>분할 방식</label>
          <div className="split-presets">
            <button
              type="button"
              className={'split-preset' + (mode === '1x3' ? ' active' : '')}
              onClick={() => selectPreset('1x3')}
            >
              1x3
            </button>
            <button
              type="button"
              className={'split-preset' + (mode === '2x3' ? ' active' : '')}
              onClick={() => selectPreset('2x3')}
            >
              2x3
            </button>
            <button
              type="button"
              className={'split-preset' + (mode === 'custom' ? ' active' : '')}
              onClick={() => setMode('custom')}
            >
              사용자 지정
            </button>
          </div>
        </div>
        {mode === 'custom' && (
          <>
            <div className="field">
              <label>분할 비율</label>
              <input
                type="text"
                value={ratioStr}
                placeholder="예: 2x3"
                onChange={(e) => setRatioStr(e.target.value)}
              />
            </div>
            <div className="field">
              <label>구분선 (px)</label>
              <input
                type="number"
                min={0}
                value={sepStr}
                onChange={(e) => setSepStr(e.target.value)}
              />
            </div>
          </>
        )}
        <div className="field">
          <label>형식</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as 'png' | 'jpeg')}>
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
        </div>

        {loaded && !ratio && (
          <p className="split-notice">비율 형식이 올바르지 않습니다. 예: 2x3</p>
        )}
        {geo && !valid && (
          <p className="split-notice">분할 수가 이미지 크기에 비해 너무 큽니다.</p>
        )}
        {geo && valid && ratio && (
          <>
            <p className="hint">
              결과: {ratio[0] * ratio[1]}개 · {geo.cellW}×{geo.cellH}
            </p>
            {(geo.droppedX > 0 || geo.droppedY > 0) && (
              <p className="split-notice">
                이미지 크기가 딱 나누어 떨어지지 않아요.
                <br />
                다음과 같은 부분이 유실돼요:{' '}
                {[
                  geo.droppedX > 0 ? `오른쪽 ${geo.droppedX}px` : null,
                  geo.droppedY > 0 ? `아래쪽 ${geo.droppedY}px` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="export-btn" disabled={busy || !valid} onClick={handleDownload}>
            {busy ? '생성 중…' : '⬇ 분할 다운로드'}
          </button>
        </div>
      </div>
    </div>
  )
}
