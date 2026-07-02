import { useStore } from '../store/useStore'
import { clamp } from '../lib/layout'
import { DEFAULT_TRANSFORM } from '../types'

const SIZE_PRESETS = [
  { label: '정사각 1500', w: 1500, h: 1500 },
  { label: '정사각 3000', w: 3000, h: 3000 },
  { label: 'FHD 1920×1080', w: 1920, h: 1080 },
  { label: 'A4세로 2480×3508', w: 2480, h: 3508 },
]

export default function ControlPanel() {
  const layout = useStore((s) => s.layout)
  const setGridSize = useStore((s) => s.setGridSize)
  const updateLayout = useStore((s) => s.updateLayout)
  const setAutoSize = useStore((s) => s.setAutoSize)
  const editMode = useStore((s) => s.editMode)
  const selectedCell = useStore((s) => s.selectedCell)
  const updateCellTransform = useStore((s) => s.updateCellTransform)

  if (!layout) return null

  const selSlot =
    editMode === 'adjust' && selectedCell != null ? layout.cells[selectedCell] : null

  return (
    <div className="controls">
      {editMode === 'adjust' && (
        <section className="adjust-section">
          <h3>미세조정 {selectedCell != null ? `· 셀 ${selectedCell + 1}` : ''}</h3>
          {selSlot ? (
            <>
              <div className="field col">
                <label>배율 {selSlot.transform.scale.toFixed(2)}×</label>
                <input
                  type="range"
                  min={0.2}
                  max={5}
                  step={0.01}
                  value={selSlot.transform.scale}
                  onChange={(e) =>
                    updateCellTransform(selectedCell!, { scale: Number(e.target.value) })
                  }
                />
              </div>
              <div className="field col">
                <label>가로 위치</label>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={selSlot.transform.offsetX}
                  onChange={(e) =>
                    updateCellTransform(selectedCell!, { offsetX: Number(e.target.value) })
                  }
                />
              </div>
              <div className="field col">
                <label>세로 위치</label>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={selSlot.transform.offsetY}
                  onChange={(e) =>
                    updateCellTransform(selectedCell!, { offsetY: Number(e.target.value) })
                  }
                />
              </div>
              <button
                className="reset-btn"
                onClick={() => updateCellTransform(selectedCell!, { ...DEFAULT_TRANSFORM })}
              >
                위치·배율 초기화
              </button>
            </>
          ) : (
            <p className="hint">
              셀을 클릭해 선택한 뒤 이미지를 드래그하거나 휠로 확대/축소하세요.
            </p>
          )}
        </section>
      )}

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
      </section>

      <section>
        <h3>출력 이미지</h3>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={layout.autoSize}
            onChange={(e) => setAutoSize(e.target.checked)}
          />
          첫 이미지 크기로 자동 맞춤
        </label>
        {layout.autoSize && (
          <p className="hint">셀이 첫 이미지 원본 크기가 되도록 출력 크기가 자동 계산됩니다.</p>
        )}
        <div className="field">
          <label>가로 (px)</label>
          <input
            type="number"
            min={1}
            max={12000}
            value={layout.outputWidth}
            disabled={layout.autoSize}
            onChange={(e) =>
              updateLayout({
                outputWidth: clamp(Number(e.target.value) || 1, 1, 12000),
                autoSize: false,
              })
            }
          />
        </div>
        <div className="field">
          <label>세로 (px)</label>
          <input
            type="number"
            min={1}
            max={12000}
            value={layout.outputHeight}
            disabled={layout.autoSize}
            onChange={(e) =>
              updateLayout({
                outputHeight: clamp(Number(e.target.value) || 1, 1, 12000),
                autoSize: false,
              })
            }
          />
        </div>
        <div className="presets">
          {SIZE_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() =>
                updateLayout({ outputWidth: p.w, outputHeight: p.h, autoSize: false })
              }
            >
              {p.label}
            </button>
          ))}
        </div>
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
