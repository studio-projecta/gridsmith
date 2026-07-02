import { useStore } from '../store/useStore'
import { clamp } from '../lib/layout'
import type { VAlign } from '../types'

export default function ControlPanel() {
  const layout = useStore((s) => s.layout)
  const setGridSize = useStore((s) => s.setGridSize)
  const updateLayout = useStore((s) => s.updateLayout)
  const setAutoSize = useStore((s) => s.setAutoSize)

  if (!layout) return null

  return (
    <div className="controls">
      <section>
        <h3>그리드</h3>
        <div className="field">
          <label>행 (rows)</label>
          <input
            type="number"
            min={1}
            max={20}
            value={layout.rows}
            onChange={(e) =>
              setGridSize(clamp(Number(e.target.value) || 1, 1, 20), layout.cols)
            }
          />
        </div>
        <div className="field">
          <label>열 (cols)</label>
          <input
            type="number"
            min={1}
            max={20}
            value={layout.cols}
            onChange={(e) =>
              setGridSize(layout.rows, clamp(Number(e.target.value) || 1, 1, 20))
            }
          />
        </div>
        <div className="field">
          <label>셀 간격 gap (px)</label>
          <input
            type="number"
            min={0}
            max={500}
            value={layout.gap}
            onChange={(e) =>
              updateLayout({ gap: clamp(Number(e.target.value) || 0, 0, 500) })
            }
          />
        </div>
        <div className="field">
          <label>셀 맞춤</label>
          <select
            value={layout.fit}
            onChange={(e) => updateLayout({ fit: e.target.value as 'cover' | 'contain' })}
          >
            <option value="cover">채우기 (cover)</option>
            <option value="contain">맞추기 (contain)</option>
          </select>
        </div>
        <div className="field">
          <label>세로 정렬</label>
          <select
            value={layout.align ?? 'center'}
            onChange={(e) => updateLayout({ align: e.target.value as VAlign })}
          >
            <option value="top">상단</option>
            <option value="center">중앙</option>
            <option value="bottom">하단</option>
          </select>
        </div>
      </section>

      <section>
        <h3>출력 이미지</h3>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={layout.autoSize}
            onChange={(e) => setAutoSize(e.target.checked)}
          />
          첫 배치 이미지 크기로 자동 맞춤
        </label>
        <p className="hint">
          현재 구성 {layout.outputWidth}×{layout.outputHeight} px (비율 유지).
          최종 해상도는 내보낼 때 지정합니다.
        </p>
      </section>

      <section>
        <h3>배경</h3>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={layout.transparentBg}
            onChange={(e) => updateLayout({ transparentBg: e.target.checked })}
          />
          투명 배경
        </label>
        <div className="field">
          <label>배경색</label>
          <input
            type="color"
            value={layout.bgColor}
            disabled={layout.transparentBg}
            onChange={(e) => updateLayout({ bgColor: e.target.value })}
          />
        </div>
        {layout.transparentBg && (
          <p className="hint">투명은 PNG 로 내보낼 때만 유지됩니다. JPEG 은 검정으로 채워집니다.</p>
        )}
      </section>
    </div>
  )
}
