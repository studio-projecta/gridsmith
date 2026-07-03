import { useStore } from '../store/useStore'
import { clamp } from '../lib/layout'
import type { VAlign } from '../types'
import ExportButton from './ExportButton'

export default function Toolbar() {
  const autoFill = useStore((s) => s.autoFill)
  const clearCells = useStore((s) => s.clearCells)
  const layout = useStore((s) => s.layout)
  const setGridSize = useStore((s) => s.setGridSize)
  const updateLayout = useStore((s) => s.updateLayout)
  const setAutoSize = useStore((s) => s.setAutoSize)

  if (!layout) return null

  return (
    <div className="toolbar">
      {/* spinbutton 순서(행·열·간격)는 e2e 가 인덱스로 참조하므로 유지한다. */}
      <div className="tb-group">
        <label className="tb-field">
          행
          <input
            type="number"
            min={1}
            max={50}
            value={layout.rows}
            onChange={(e) => setGridSize(clamp(Number(e.target.value) || 1, 1, 50), layout.cols)}
          />
        </label>
        <label className="tb-field">
          열
          <input
            type="number"
            min={1}
            max={50}
            value={layout.cols}
            onChange={(e) => setGridSize(layout.rows, clamp(Number(e.target.value) || 1, 1, 50))}
          />
        </label>
        <label className="tb-field">
          간격
          <input
            type="number"
            min={0}
            max={500}
            value={layout.gap}
            onChange={(e) => updateLayout({ gap: clamp(Number(e.target.value) || 0, 0, 500) })}
          />
        </label>
        <label className="tb-field" title="좌우 바깥 여백. 비우면 셀 간격과 동일하게 적용됩니다.">
          여백↔
          <input
            type="number"
            min={0}
            max={2000}
            value={layout.marginX ?? ''}
            placeholder={String(layout.gap)}
            onChange={(e) =>
              updateLayout({
                marginX: e.target.value === '' ? undefined : clamp(Number(e.target.value) || 0, 0, 2000),
              })
            }
          />
        </label>
        <label className="tb-field" title="상하 바깥 여백. 비우면 셀 간격과 동일하게 적용됩니다.">
          여백↕
          <input
            type="number"
            min={0}
            max={2000}
            value={layout.marginY ?? ''}
            placeholder={String(layout.gap)}
            onChange={(e) =>
              updateLayout({
                marginY: e.target.value === '' ? undefined : clamp(Number(e.target.value) || 0, 0, 2000),
              })
            }
          />
        </label>
      </div>

      <span className="tb-divider" />

      <div className="tb-group">
        <label className="tb-field">
          맞춤
          <select
            value={layout.fit}
            onChange={(e) => updateLayout({ fit: e.target.value as 'cover' | 'contain' })}
          >
            <option value="cover">채우기</option>
            <option value="contain">맞추기</option>
          </select>
        </label>
        <label className="tb-field">
          정렬
          <select
            value={layout.align ?? 'center'}
            onChange={(e) => updateLayout({ align: e.target.value as VAlign })}
          >
            <option value="top">상단</option>
            <option value="center">중앙</option>
            <option value="bottom">하단</option>
          </select>
        </label>
      </div>

      <span className="tb-divider" />

      <div className="tb-group">
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={layout.transparentBg}
            onChange={(e) => updateLayout({ transparentBg: e.target.checked })}
          />
          투명 배경
        </label>
        <input
          type="color"
          value={layout.bgColor}
          disabled={layout.transparentBg}
          onChange={(e) => updateLayout({ bgColor: e.target.value })}
        />
        <label className="tb-field" title="배경 테두리 두께(출력 px). 셀 배치에는 영향 없이 가장자리 안쪽에 그려집니다.">
          테두리
          <input
            type="number"
            min={0}
            max={500}
            value={layout.borderWidth ?? 0}
            onChange={(e) => updateLayout({ borderWidth: clamp(Number(e.target.value) || 0, 0, 500) })}
          />
        </label>
        <input
          type="color"
          title="테두리 색"
          aria-label="테두리 색"
          value={layout.borderColor ?? '#000000'}
          disabled={(layout.borderWidth ?? 0) === 0}
          onChange={(e) => updateLayout({ borderColor: e.target.value })}
        />
      </div>

      <span className="tb-divider" />

      <div className="tb-group">
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={layout.autoSize}
            onChange={(e) => setAutoSize(e.target.checked)}
          />
          자동 맞춤
        </label>
        <span
          className="tb-readout"
          title="현재 구성 크기 (비율 유지) · 최종 해상도는 내보낼 때 지정합니다"
        >
          {layout.outputWidth}×{layout.outputHeight}
        </span>
      </div>

      <span className="tb-spacer" />

      <div className="tb-group tb-actions">
        <button onClick={autoFill}>자동 채우기</button>
        <button onClick={clearCells}>비우기</button>
        <ExportButton />
      </div>
    </div>
  )
}
