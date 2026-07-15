import { useEffect, useRef, useState } from 'react'
import { coversTarget, resizePair, type ResizeTarget } from '../lib/resize'
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

// 한 슬롯(모바일/PC)의 파일 선택·드래그앤드롭·미리보기. 새 이미지를 놓으면 기존 것을 대체한다.
function ImageSlot({
  label,
  hint,
  loaded,
  notice,
  onPick,
  onClear,
}: {
  label: string
  hint: string
  loaded: Loaded | null
  notice: string | null
  onPick: (file: File) => void
  onClear: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  // 중첩 자식 위를 지날 때 dragenter/dragleave 가 번갈아 발생해 깜빡이므로 깊이를 센다.
  const depth = useRef(0)
  const isFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

  return (
    <div
      className={'resize-slot' + (dragOver ? ' dragover' : '')}
      onDragEnter={(e) => {
        if (!isFiles(e)) return
        e.preventDefault()
        depth.current += 1
        setDragOver(true)
      }}
      onDragOver={(e) => {
        if (!isFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(e) => {
        if (!isFiles(e)) return
        depth.current -= 1
        if (depth.current <= 0) {
          depth.current = 0
          setDragOver(false)
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        depth.current = 0
        setDragOver(false)
        const f = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
        if (f) onPick(f)
      }}
    >
      <div className="resize-slot-head">
        <span className="resize-slot-label">{label}</span>
        <span className="hint">{hint}</span>
      </div>
      {loaded ? (
        <div className="split-figure">
          <img className="split-preview" src={loaded.url} alt={label} />
          <div className="resize-slot-foot">
            <span className="hint">
              {loaded.file.name} · {loaded.width}×{loaded.height}
            </span>
            <button type="button" className="split-clear" onClick={onClear}>
              제거
            </button>
          </div>
        </div>
      ) : (
        <label className="split-file-btn">
          파일 선택 또는 드래그
          <input
            type="file"
            accept="image/png"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.currentTarget.value = ''
              if (f) onPick(f)
            }}
          />
        </label>
      )}
      {notice && <p className="split-notice">{notice}</p>}
    </div>
  )
}

function specHint(key: ResizeTarget['key']): string {
  return key === 'Mobile' ? '293×248' : '195×145'
}

export default function ResizeModal({ onClose }: Props) {
  const [mobile, setMobile] = useState<Loaded | null>(null)
  const [pc, setPc] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{
    rawBytes: number
    optBytes: number
    oversize: string[]
    lossy: boolean
  } | null>(null)

  // 입력이 바뀌면 이전 다운로드의 용량 표시는 더 이상 유효하지 않다.
  useEffect(() => setResult(null), [mobile, pc])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 언마운트 시 남아 있는 미리보기 URL 을 해제한다.
  const slotsRef = useRef({ mobile, pc })
  slotsRef.current = { mobile, pc }
  useEffect(
    () => () => {
      for (const l of [slotsRef.current.mobile, slotsRef.current.pc]) {
        if (l) URL.revokeObjectURL(l.url)
      }
    },
    [],
  )

  const setSlot = (setter: typeof setMobile, loaded: Loaded | null) => {
    setter((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return loaded
    })
  }

  const pick = async (slot: 'mobile' | 'pc', file: File) => {
    try {
      const bitmap = await createImageBitmap(file)
      const loaded: Loaded = {
        file,
        url: URL.createObjectURL(file),
        width: bitmap.width,
        height: bitmap.height,
      }
      bitmap.close()
      setSlot(slot === 'mobile' ? setMobile : setPc, loaded)
    } catch {
      alert('이미지를 읽을 수 없습니다.')
    }
  }

  const noticeFor = (l: Loaded | null, key: ResizeTarget['key'], w: number, h: number): string | null =>
    l && !coversTarget(l.width, l.height, key)
      ? `${w}×${h} 규격을 커버할 수 없어요 (높이 초과, ${l.width}×${l.height})`
      : null

  const mobileNotice = noticeFor(mobile, 'Mobile', 293, 248)
  const pcNotice = noticeFor(pc, 'PC', 195, 145)
  const valid = !!mobile && !!pc && !mobileNotice && !pcNotice

  const handleDownload = async () => {
    if (!valid || !mobile || !pc) return
    setBusy(true)
    try {
      const { files, rawBytes, optBytes, lossy } = await resizePair(
        { name: mobile.file.name, blob: mobile.file },
        { name: pc.file.name, blob: pc.file },
      )
      const oversize = files
        .filter((f) => f.name.endsWith('_Mobile.png') || f.name.endsWith('_PC.png'))
        .filter((f) => f.blob.size >= MAX_BYTES)
        .map((f) => f.name)
      const zip = await zipStore(files)
      downloadBlob(zip, `${folderBase(mobile.file.name)}.zip`)
      setResult({ rawBytes, optBytes, oversize, lossy })
    } catch (err) {
      alert(`리사이즈 실패: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal split-modal" onClick={(e) => e.stopPropagation()}>
        <h3>이미지 리사이즈</h3>

        <div className="resize-slots">
          <ImageSlot
            label="모바일용"
            hint={specHint('Mobile')}
            loaded={mobile}
            notice={mobileNotice}
            onPick={(f) => void pick('mobile', f)}
            onClear={() => setSlot(setMobile, null)}
          />
          <ImageSlot
            label="PC용"
            hint={specHint('PC')}
            loaded={pc}
            notice={pcNotice}
            onPick={(f) => void pick('pc', f)}
            onClear={() => setSlot(setPc, null)}
          />
        </div>

        {result && (
          <>
            <p className="split-result">
              {result.optBytes < result.rawBytes
                ? `${result.lossy ? '손실' : '무손실'} 최적화: ${fmtBytes(result.rawBytes)} → ${fmtBytes(
                    result.optBytes,
                  )} (${(100 * (1 - result.optBytes / result.rawBytes)).toFixed(1)}% 감소)`
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
