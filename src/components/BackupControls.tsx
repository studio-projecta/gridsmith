import { useState } from 'react'
import { useStore } from '../store/useStore'
import { exportBackup, importBackup } from '../lib/backup'

export default function BackupControls() {
  const refresh = useStore((s) => s.refresh)
  const [busy, setBusy] = useState(false)

  const handleExport = async () => {
    setBusy(true)
    try {
      await exportBackup()
    } catch (err) {
      alert(`백업 실패: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async (file: File) => {
    setBusy(true)
    try {
      const { types, images } = await importBackup(file)
      await refresh()
      alert(`가져오기 완료 · 유형 ${types}개, 이미지 ${images}장을 추가했습니다.`)
    } catch (err) {
      alert(`가져오기 실패: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  // 파일 입력을 상시 렌더하지 않고 클릭 시 임시 생성해, 업로더 input 과 셀렉터가 겹치지 않게 한다.
  const pickFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip,application/zip'
    input.onchange = () => {
      const f = input.files?.[0]
      if (f) void handleImport(f)
    }
    input.click()
  }

  return (
    <div className="backup-controls">
      <button
        className="ghost-btn"
        disabled={busy}
        title="전체 유형·이미지·배치를 ZIP 파일로 백업"
        onClick={() => void handleExport()}
      >
        ⬇ 백업
      </button>
      <button
        className="ghost-btn"
        disabled={busy}
        title="백업 ZIP 을 병합해서 가져오기"
        onClick={pickFile}
      >
        ＋ 가져오기
      </button>
    </div>
  )
}
