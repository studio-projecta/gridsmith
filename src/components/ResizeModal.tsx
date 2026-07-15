import { useEffect, useMemo, useRef, useState } from 'react'
import { isCoverable, resizeFiles } from '../lib/resize'
import { folderBase } from '../lib/split'
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

const MAX_BYTES = 50 * 1024

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export default function ResizeModal({ onClose }: Props) {
  const [loaded, setLoaded] = useState<Loaded[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{
    rawBytes: number
    optBytes: number
    oversize: string[]
  } | null>(null)
  const [dragging, setDragging] = useState(false)
  // 중첩 자식 위를 지날 때 dragenter/dragleave 가 번갈아 발생해 깜빡이므로 깊이를 센다.
  const dragDepth = useRef(0)

  // 입력이 바뀌면 이전 다운로드의 용량 표시는 더 이상 유효하지 않다.
  useEffect(() => setResult(null), [loaded])

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

  // width 스케일 시 높이가 규격을 넘어 커버할 수 없는 이미지들(다운로드를 막는다).
  const uncoverable = useMemo(
    () => loaded.filter((l) => !isCoverable(l.width, l.height)),
    [loaded],
  )
  const valid = loaded.length > 0 && uncoverable.length === 0

  const handleDownload = async () => {
    if (!valid) return
    setBusy(true)
    try {
      const inputs = loaded.map((l) => ({ name: l.file.name, blob: l.file }))
      const { files, rawBytes, optBytes } = await resizeFiles(inputs)
      const oversize = files
        .filter((f) => f.name.endsWith('_Mobile.png') || f.name.endsWith('_PC.png'))
        .filter((f) => f.blob.size >= MAX_BYTES)
        .map((f) => f.name)
      const zip = await zipStore(files)
      const zipName =
        loaded.length === 1 ? `${folderBase(loaded[0].file.name)}.zip` : 'weflab-thumbnails.zip'
      downloadBlob(zip, zipName)
      setResult({ rawBytes, optBytes, oversize })
    } catch (err) {
      alert(`리사이즈 실패: ${err instanceof Error ? err.message : String(err)}`)
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
        <h3>이미지 리사이즈</h3>

        <div className="field">
          <label>이미지</label>
          <label className="split-file-btn">
            {loaded.length ? '파일 추가' : '파일 선택'}
            <input
              type="file"
              accept="image/png"
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

        {uncoverable.length > 0 && (
          <p className="split-notice">
            커버할 수 없는 이미지가 있어요(높이 초과):
            <br />
            {uncoverable.map((l) => (
              <span key={l.url} className="split-drop-line">
                {l.file.name} ({l.width}×{l.height})
              </span>
            ))}
          </p>
        )}

        {result && (
          <>
            <p className="split-result">
              {result.optBytes < result.rawBytes
                ? `무손실 최적화: ${fmtBytes(result.rawBytes)} → ${fmtBytes(result.optBytes)} (${(
                    100 *
                    (1 - result.optBytes / result.rawBytes)
                  ).toFixed(1)}% 감소)`
                : `총 용량: ${fmtBytes(result.optBytes)}`}
            </p>
            {result.oversize.length > 0 && (
              <p className="split-notice">
                50KB 를 넘는 파일이 있어요:
                <br />
                {result.oversize.map((name) => (
                  <span key={name} className="split-drop-line">
                    {name}
                  </span>
                ))}
              </p>
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            {result ? '닫기' : '취소'}
          </button>
          <button className="export-btn" disabled={busy || !valid} onClick={handleDownload}>
            {busy ? '생성 중…' : '⬇ 리사이즈 다운로드'}
          </button>
        </div>
      </div>
    </div>
  )
}
