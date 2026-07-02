import { useStore } from '../store/useStore'
import ExportButton from './ExportButton'

export default function Toolbar() {
  const autoFill = useStore((s) => s.autoFill)
  const clearCells = useStore((s) => s.clearCells)

  return (
    <div className="toolbar">
      <div className="toolbar-actions">
        <button onClick={autoFill}>자동 채우기</button>
        <button onClick={clearCells}>비우기</button>
        <ExportButton />
      </div>
    </div>
  )
}
