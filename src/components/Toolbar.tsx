import { useStore } from '../store/useStore'
import ExportButton from './ExportButton'

export default function Toolbar() {
  const editMode = useStore((s) => s.editMode)
  const setEditMode = useStore((s) => s.setEditMode)
  const autoFill = useStore((s) => s.autoFill)
  const clearCells = useStore((s) => s.clearCells)

  return (
    <div className="toolbar">
      <div className="mode-toggle">
        <button
          className={editMode === 'reorder' ? 'active' : ''}
          onClick={() => setEditMode('reorder')}
        >
          ↔ 재배치
        </button>
        <button
          className={editMode === 'adjust' ? 'active' : ''}
          onClick={() => setEditMode('adjust')}
        >
          ✥ 미세조정
        </button>
      </div>

      <div className="toolbar-actions">
        <button onClick={autoFill}>자동 채우기</button>
        <button onClick={clearCells}>비우기</button>
        <ExportButton />
      </div>
    </div>
  )
}
