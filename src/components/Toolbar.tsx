import { useStore } from '../store/useStore'
import { clamp } from '../lib/layout'
import type { VAlign } from '../types'
import ExportButton from './ExportButton'
import HexInput from './HexInput'

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
      {/* 왼쪽: 그리드 기하. spinbutton DOM 순서(행·열·간격·그리드여백가로세로·셀내부여백가로세로)는
          e2e 가 인덱스로 참조하므로 유지한다. 가로/세로 라벨 중복은 aria-label 로 구분. */}
      <div className="tb-geo">
        <div className="tb-cluster">
          <span className="tb-cluster-cap">배열</span>
          <div className="tb-cluster-fields">
            <label className="tb-field">
              <span className="tb-sub">행</span>
              <input
                type="number"
                min={1}
                max={50}
                aria-label="행"
                value={layout.rows}
                onChange={(e) => setGridSize(clamp(Number(e.target.value) || 1, 1, 50), layout.cols)}
              />
            </label>
            <label className="tb-field">
              <span className="tb-sub">열</span>
              <input
                type="number"
                min={1}
                max={50}
                aria-label="열"
                value={layout.cols}
                onChange={(e) => setGridSize(layout.rows, clamp(Number(e.target.value) || 1, 1, 50))}
              />
            </label>
          </div>
        </div>

        <div className="tb-cluster">
          <span className="tb-cluster-cap">셀 간격</span>
          <div className="tb-cluster-fields">
            <label className="tb-field">
              <span className="tb-sub" aria-hidden="true" />
              <input
                type="number"
                min={0}
                max={500}
                aria-label="셀 간격"
                value={layout.gap}
                onChange={(e) => updateLayout({ gap: clamp(Number(e.target.value) || 0, 0, 500) })}
              />
            </label>
          </div>
        </div>

        <div className="tb-cluster">
          <span className="tb-cluster-cap">그리드 여백</span>
          <div className="tb-cluster-fields">
            <label className="tb-field" title="좌우 바깥 여백. 비우면 셀 간격과 동일하게 적용됩니다.">
              <span className="tb-sub">가로</span>
              <input
                type="number"
                min={0}
                max={2000}
                aria-label="그리드 여백 가로"
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
              <span className="tb-sub">세로</span>
              <input
                type="number"
                min={0}
                max={2000}
                aria-label="그리드 여백 세로"
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
        </div>

        <div className="tb-cluster">
          <span className="tb-cluster-cap">셀 내부 여백</span>
          <div className="tb-cluster-fields">
            <label className="tb-field" title="셀 안쪽 좌우 여백(모든 셀 공통, 출력 px). 이미지와 셀 경계 사이에 배경이 보입니다.">
              <span className="tb-sub">가로</span>
              <input
                type="number"
                min={0}
                max={2000}
                aria-label="셀 내부 여백 가로"
                value={layout.cellPadX ?? 0}
                onChange={(e) => updateLayout({ cellPadX: clamp(Number(e.target.value) || 0, 0, 2000) })}
              />
            </label>
            <label className="tb-field" title="셀 안쪽 상하 여백(모든 셀 공통, 출력 px). 이미지와 셀 경계 사이에 배경이 보입니다.">
              <span className="tb-sub">세로</span>
              <input
                type="number"
                min={0}
                max={2000}
                aria-label="셀 내부 여백 세로"
                value={layout.cellPadY ?? 0}
                onChange={(e) => updateLayout({ cellPadY: clamp(Number(e.target.value) || 0, 0, 2000) })}
              />
            </label>
          </div>
        </div>
      </div>

      <span className="tb-divider" />

      {/* 오른쪽: 기하 묶음의 두 줄 높이에 맞춰 이미지 맞춤/배경/테두리를 2줄로 채운다. */}
      <div className="tb-controls">
        <div className="tb-row">
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
          <span className="tb-divider" />
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

        <div className="tb-row">
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
            title="배경색"
            aria-label="배경색"
            value={layout.bgColor}
            disabled={layout.transparentBg}
            onChange={(e) => updateLayout({ bgColor: e.target.value })}
          />
          <HexInput
            aria-label="배경색 hex"
            value={layout.bgColor}
            disabled={layout.transparentBg}
            onChange={(hex) => updateLayout({ bgColor: hex })}
          />
          <span className="tb-divider" />
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
          <HexInput
            aria-label="테두리색 hex"
            value={layout.borderColor ?? '#000000'}
            disabled={(layout.borderWidth ?? 0) === 0}
            onChange={(hex) => updateLayout({ borderColor: hex })}
          />
        </div>
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
