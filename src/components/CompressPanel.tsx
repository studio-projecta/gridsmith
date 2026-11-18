import { useEffect, useRef, useState } from 'react'
import { compressPng, uniqueNames, type CompressMode } from '../lib/compress'
import { fmtBytes } from '../lib/format'
import { zipStore } from '../lib/zip'
import { downloadBlob } from '../lib/compose'

interface Props {
  busy: boolean
  setBusy: (busy: boolean) => void
  onClose: () => void
}

interface Item {
  id: number
  file: File
  width: number
  height: number
}

interface Result {
  // 항목 id → 압축 후 바이트.
  sizes: Record<number, number>
  rawBytes: number
  optBytes: number
  lossy: boolean
}

// 크기 제한 없이 PNG 여러 장을 받아 픽셀 크기는 그대로 두고 용량만 줄인다.
export default function CompressPanel({ busy, setBusy, onClose }: Props) {
  const [mode, setMode] = useState<CompressMode>('quality')
  const [items, setItems] = useState<Item[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [done, setDone] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [dragOver, setDragOver] = useState(false)
  // 중첩 자식 위를 지날 때 dragenter/dragleave 가 번갈아 발생해 깜빡이므로 깊이를 센다.
  const depth = useRef(0)
  const nextId = useRef(0)
  const isFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

  // 입력이나 방식이 바뀌면 이전 다운로드의 용량 표시는 더 이상 유효하지 않다.
  useEffect(() => setResult(null), [items, mode])

  const addFiles = async (files: File[]) => {
    const added: Item[] = []
    let skipped = 0
    for (const file of files) {
      if (file.type !== 'image/png') {
        skipped += 1
        continue
      }
      try {
        const bitmap = await createImageBitmap(file)
        added.push({ id: nextId.current++, file, width: bitmap.width, height: bitmap.height })
        bitmap.close()
      } catch {
        skipped += 1
      }
    }
    if (added.length > 0) setItems((prev) => [...prev, ...added])
    setNotice(skipped > 0 ? `PNG 가 아니거나 읽을 수 없는 파일 ${skipped}개는 제외했어요.` : null)
  }

  const handleDownload = async () => {
    if (items.length === 0) return
    setBusy(true)
    setDone(0)
    try {
      const blobs: Blob[] = []
      const sizes: Record<number, number> = {}
      let lossy = false
      for (const [i, item] of items.entries()) {
        // 압축은 메인 스레드를 오래 점유하므로 진행 표시가 그려질 틈을 준다.
        await new Promise((r) => setTimeout(r))
        const res = await compressPng(item.file, mode)
        blobs.push(res.blob)
        sizes[item.id] = res.blob.size
        lossy = lossy || res.lossy
        setDone(i + 1)
      }
      if (items.length === 1) {
        downloadBlob(blobs[0], items[0].file.name)
      } else {
        const names = uniqueNames(items.map((it) => it.file.name))
        downloadBlob(await zipStore(names.map((name, i) => ({ name, blob: blobs[i] }))), 'compressed.zip')
      }
      setResult({
        sizes,
        rawBytes: items.reduce((sum, it) => sum + it.file.size, 0),
        optBytes: blobs.reduce((sum, b) => sum + b.size, 0),
        lossy,
      })
    } catch (err) {
      alert(`압축 실패: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="split-presets">
        <button
          type="button"
          className={'split-preset' + (mode === 'quality' ? ' active' : '')}
          disabled={busy}
          onClick={() => setMode('quality')}
        >
          품질 유지 (무손실)
        </button>
        <button
          type="button"
          className={'split-preset' + (mode === 'size' ? ' active' : '')}
          disabled={busy}
          onClick={() => setMode('size')}
        >
          용량 우선 (256색)
        </button>
      </div>
      <p className="hint">
        {mode === 'quality'
          ? '픽셀을 그대로 유지한 채 다시 압축해요. 화질 변화가 없는 대신 줄어드는 폭이 작아요.'
          : '색을 256색으로 줄여 크게 압축해요. 사진·그라데이션은 화질 차이가 보일 수 있어요.'}
      </p>

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
          if (!busy) void addFiles(Array.from(e.dataTransfer.files))
        }}
      >
        <div className="resize-slot-head">
          <span className="resize-slot-label">PNG 이미지</span>
          <span className="hint">크기 제한 없음 · 여러 장 가능</span>
        </div>
        {items.length > 0 && (
          <ul className="compress-list">
            {items.map((it) => {
              const out = result?.sizes[it.id]
              return (
                <li key={it.id} className="compress-row">
                  <span className="compress-name">{it.file.name}</span>
                  <span className="hint">
                    {it.width}×{it.height} · {fmtBytes(it.file.size)}
                    {out !== undefined &&
                      ` → ${fmtBytes(out)} (${(100 * (1 - out / it.file.size)).toFixed(1)}% 감소)`}
                  </span>
                  <button
                    type="button"
                    className="split-clear"
                    disabled={busy}
                    onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                  >
                    제거
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <label className="split-file-btn">
          파일 선택 또는 드래그
          <input
            type="file"
            accept="image/png"
            multiple
            hidden
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.currentTarget.value = ''
              void addFiles(files)
            }}
          />
        </label>
        {notice && <p className="split-notice">{notice}</p>}
      </div>

      {result && (
        <p className="split-result">
          {result.optBytes < result.rawBytes
            ? `${result.lossy ? '손실' : '무손실'} 최적화: ${fmtBytes(result.rawBytes)} → ${fmtBytes(
                result.optBytes,
              )} (${(100 * (1 - result.optBytes / result.rawBytes)).toFixed(1)}% 감소)`
            : `더 줄일 수 없어 원본 그대로예요: ${fmtBytes(result.optBytes)}`}
        </p>
      )}

      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose} disabled={busy}>
          {result ? '닫기' : '취소'}
        </button>
        <button className="export-btn" disabled={busy || items.length === 0} onClick={handleDownload}>
          {busy ? `처리 중… (${done}/${items.length})` : '⬇ 압축 다운로드'}
        </button>
      </div>
    </>
  )
}
