import { useEffect, useMemo, useRef, useState } from 'react'
import { computeSplitGeometry, splitFiles } from '../lib/split'
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

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
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
  const [loaded, setLoaded] = useState<Loaded[]>([])
  const [mode, setMode] = useState<'1x3' | '2x3' | 'custom'>('2x3')
  const [ratioStr, setRatioStr] = useState('2x3')
  const [sepStr, setSepStr] = useState('1')
  const [format, setFormat] = useState<'png' | 'jpeg'>('png')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ rawBytes: number; optBytes: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  // 중첩 자식 위를 지날 때 dragenter/dragleave 가 번갈아 발생해 깜빡이므로 깊이를 센다.
  const dragDepth = useRef(0)

  // 입력·설정이 바뀌면 이전 다운로드의 용량 표시는 더 이상 유효하지 않다.
  useEffect(() => setResult(null), [loaded, ratioStr, sepStr, format])

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

  // 언마운트 시에만 남아 있는 미리보기 URL 을 해제(누적 목록이라 개별 삭제는 그때 revoke).
  const loadedRef = useRef(loaded)
  loadedRef.current = loaded
  useEffect(() => () => {
    loadedRef.current.forEach((l) => URL.revokeObjectURL(l.url))
  }, [])

  const key = (f: File) => `${f.name}:${f.size}:${f.lastModified}`

  // 여러 디렉터리에서 나눠 담을 수 있게 새 선택을 기존 목록에 누적한다(같은 파일은 건너뜀).
  const pickFiles = async (files: File[]) => {
    const next: Loaded[] = []
    for (const file of files) {
      try {
        const bitmap = await createImageBitmap(file)
        next.push({ file, url: URL.createObjectURL(file), width: bitmap.width, height: bitmap.height })
        bitmap.close()
      } catch {
        // 못 읽는 파일은 건너뛴다.
      }
    }
    if (!next.length) {
      alert('이미지를 읽을 수 없습니다.')
      return
    }
    setLoaded((prev) => {
      const seen = new Set(prev.map((l) => key(l.file)))
      const added = next.filter((l) => {
        if (seen.has(key(l.file))) {
          URL.revokeObjectURL(l.url)
          return false
        }
        seen.add(key(l.file))
        return true
      })
      return [...prev, ...added]
    })
  }

  const onDragEnter = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  const onDragOver = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDragLeave = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragging(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (files.length) void pickFiles(files)
  }

  const removeAt = (idx: number) => {
    setLoaded((prev) => {
      const l = prev[idx]
      if (l) URL.revokeObjectURL(l.url)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const clearAll = () => {
    setLoaded((prev) => {
      prev.forEach((l) => URL.revokeObjectURL(l.url))
      return []
    })
  }

  const ratio = parseRatio(ratioStr)
  const sep = Math.max(0, Math.floor(Number(sepStr) || 0))

  // 이미지마다 크기가 달라 셀 크기·유실 px 이 다르므로 파일별로 계산한다.
  const geos = useMemo(() => {
    if (!ratio) return []
    return loaded.map((l) => computeSplitGeometry(l.width, l.height, ratio[0], ratio[1], sep))
  }, [loaded, ratio, sep])

  const valid =
    loaded.length > 0 && ratio !== null && geos.every((g) => g.cellW >= 1 && g.cellH >= 1)
  const totalPieces = ratio ? loaded.length * ratio[0] * ratio[1] : 0
  const dropped = loaded
    .map((l, i) => ({ l, g: geos[i] }))
    .filter(({ g }) => g && (g.droppedX > 0 || g.droppedY > 0))

  const handleDownload = async () => {
    if (!ratio || !valid) return
    setBusy(true)
    try {
      const inputs = loaded.map((l) => ({ name: l.file.name, blob: l.file }))
      // 무손실로 부족하면 손실 폴백으로 조각당 200KB 이하로 맞춘다.
      const SPLIT_TARGET = 200 * 1024
      const { files, rawBytes, optBytes } = await splitFiles(
        inputs,
        ratio[0],
        ratio[1],
        sep,
        format,
        0.92,
        SPLIT_TARGET,
      )
      const zip = await zipStore(files)
      downloadBlob(zip, `split-${ratio[0]}x${ratio[1]}.zip`)
      setResult({ rawBytes, optBytes })
    } catch (err) {
      alert(`분할 실패: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={'modal split-modal' + (dragging ? ' dragover' : '')}
        onClick={(e) => e.stopPropagation()}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragging && <div className="split-drop-overlay">여기에 이미지를 놓으세요</div>}
        <h3>이미지 분할</h3>

        <div className="field">
          <label>이미지</label>
          <label className="split-file-btn">
            {loaded.length ? '파일 추가' : '파일 선택'}
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? [])
                // 여러 번 나눠 담을 수 있게 값 초기화(같은 파일 재선택도 인식).
                e.currentTarget.value = ''
                if (fs.length) void pickFiles(fs)
              }}
            />
          </label>
        </div>

        {loaded.length > 0 && (
          <div className="split-files-head">
            <span className="hint">선택 {loaded.length}개</span>
            <button type="button" className="split-clear" onClick={clearAll}>
              전체 지우기
            </button>
          </div>
        )}

        {loaded.length === 1 && (
          <div className="split-figure">
            <img className="split-preview" src={loaded[0].url} alt="원본 미리보기" />
            <span className="hint">
              원본 {loaded[0].width}×{loaded[0].height}
            </span>
          </div>
        )}
        {loaded.length > 1 && (
          <div className="split-thumbs">
            {loaded.map((l, i) => (
              <span key={l.url} className="split-thumb-item" title={l.file.name}>
                <img className="split-thumb" src={l.url} alt={l.file.name} />
                <button
                  type="button"
                  className="split-thumb-remove"
                  aria-label={`${l.file.name} 제거`}
                  onClick={() => removeAt(i)}
                >
                  ×
                </button>
              </span>
            ))}
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

        {loaded.length > 0 && !ratio && (
          <p className="split-notice">비율 형식이 올바르지 않습니다. 예: 2x3</p>
        )}
        {loaded.length > 0 && ratio && !valid && (
          <p className="split-notice">분할 수가 이미지 크기에 비해 너무 큽니다.</p>
        )}
        {valid && ratio && (
          <>
            <p className="hint">
              {loaded.length === 1
                ? `결과: ${ratio[0] * ratio[1]}개 · ${geos[0].cellW}×${geos[0].cellH}`
                : `결과: 이미지 ${loaded.length}개 × ${ratio[0] * ratio[1]} = 총 ${totalPieces}장`}
            </p>
            {dropped.length > 0 && (
              <p className="split-notice">
                이미지 크기가 딱 나누어 떨어지지 않아요.
                <br />
                다음 이미지에서 일부가 유실돼요:
                <br />
                {dropped.map(({ l, g }) => (
                  <span key={l.url} className="split-drop-line">
                    {loaded.length > 1 ? `${l.file.name}: ` : ''}
                    {[
                      g.droppedX > 0 ? `오른쪽 ${g.droppedX}px` : null,
                      g.droppedY > 0 ? `아래쪽 ${g.droppedY}px` : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                ))}
              </p>
            )}
          </>
        )}

        {result && (
          <p className="split-result">
            {result.optBytes < result.rawBytes
              ? `무손실 최적화: ${fmtBytes(result.rawBytes)} → ${fmtBytes(result.optBytes)} (${(
                  100 *
                  (1 - result.optBytes / result.rawBytes)
                ).toFixed(1)}% 감소)`
              : `총 용량: ${fmtBytes(result.optBytes)}`}
          </p>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            {result ? '닫기' : '취소'}
          </button>
          <button className="export-btn" disabled={busy || !valid} onClick={handleDownload}>
            {busy ? '생성 중…' : '⬇ 분할 다운로드'}
          </button>
        </div>
      </div>
    </div>
  )
}
