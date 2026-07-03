import { useState } from 'react'
import { useStore } from '../store/useStore'
import { cellRect, clamp } from '../lib/layout'
import { DEFAULT_TRANSFORM } from '../types'

function fmt(v: number, decimals: number): string {
  return decimals > 0 ? v.toFixed(decimals) : String(Math.round(v))
}

interface TuneFieldProps {
  label: string
  value: number
  min: number
  max: number
  /** 슬라이더 이동 단위(정밀). */
  step: number
  /** 숫자 입력 ± 버튼 증감 단위. */
  numStep: number
  decimals: number
  onChange: (v: number) => void
}

/**
 * 이름 · 숫자 입력(직접 입력 + ± 스텝) · 슬라이더가 같은 값을 공유하는 미세조정 행.
 * 저장값은 항상 [min,max] 로 clamp 하되, 입력 중에는 타이핑한 문자열을 그대로 보여줘
 * '0' → '0.35' 같은 중간 입력이 즉시 튀지 않게 한다. 포커스가 빠지면 저장값 표기로 되돌린다.
 */
function TuneField({ label, value, min, max, step, numStep, decimals, onChange }: TuneFieldProps) {
  const [typing, setTyping] = useState<string | null>(null)
  const shown = typing ?? fmt(value, decimals)
  return (
    <div className="ft-field">
      <span className="ft-label">{label}</span>
      <input
        className="ft-num"
        type="number"
        min={min}
        max={max}
        step={numStep}
        aria-label={label}
        value={shown}
        onChange={(e) => {
          setTyping(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value.trim() !== '' && !Number.isNaN(n)) onChange(clamp(n, min, max))
        }}
        onBlur={() => setTyping(null)}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          setTyping(null)
          onChange(Number(e.target.value))
        }}
      />
    </div>
  )
}

/**
 * 선택한(이미지가 있는) 셀의 미세조정 패널. 배율/위치와 이 셀만의 안쪽 여백을 조절한다.
 * 값은 imageRect/cellContentRect 를 통해 미리보기와 내보내기에 동일하게 반영된다(WYSIWYG).
 * 셀 선택은 드래그(재배치)와 별개인 클릭 동작이라 재배치·줌과 충돌하지 않는다.
 */
export default function FineTunePanel() {
  const layout = useStore((s) => s.layout)
  const selectedCell = useStore((s) => s.selectedCell)
  const updateCellTransform = useStore((s) => s.updateCellTransform)

  if (!layout || selectedCell == null) return null
  const slot = layout.cells[selectedCell]
  if (!slot) return null
  const t = slot.transform
  const padX = t.padX ?? 0
  const padY = t.padY ?? 0
  // 셀별 여백 상한: 셀 절반 안쪽(콘텐츠가 남도록). 출력 px 기준.
  const cell = cellRect(layout, selectedCell)
  const maxPadX = Math.max(0, Math.floor(cell.w / 2) - 1)
  const maxPadY = Math.max(0, Math.floor(cell.h / 2) - 1)
  const isDefault =
    t.scale === DEFAULT_TRANSFORM.scale &&
    t.offsetX === DEFAULT_TRANSFORM.offsetX &&
    t.offsetY === DEFAULT_TRANSFORM.offsetY &&
    padX === 0 &&
    padY === 0

  const set = (patch: Parameters<typeof updateCellTransform>[1]) =>
    updateCellTransform(selectedCell, patch)

  return (
    // 셀이 바뀌면 입력 중 로컬 상태를 초기화하기 위해 selectedCell 로 리마운트.
    <div className="fine-tune" key={selectedCell}>
      <div className="fine-tune-head">
        <span className="fine-tune-title">미세조정 · 셀 {selectedCell + 1}</span>
        <button
          className="ft-reset"
          disabled={isDefault}
          onClick={() => set({ ...DEFAULT_TRANSFORM })}
        >
          초기화
        </button>
      </div>
      <div className="ft-grid">
        <TuneField
          label="배율"
          value={t.scale}
          min={0.2}
          max={5}
          step={0.01}
          numStep={0.05}
          decimals={2}
          onChange={(v) => set({ scale: v })}
        />
        <TuneField
          label="위치 ↔"
          value={t.offsetX}
          min={-1}
          max={1}
          step={0.01}
          numStep={0.05}
          decimals={2}
          onChange={(v) => set({ offsetX: v })}
        />
        <TuneField
          label="위치 ↕"
          value={t.offsetY}
          min={-1}
          max={1}
          step={0.01}
          numStep={0.05}
          decimals={2}
          onChange={(v) => set({ offsetY: v })}
        />
        <TuneField
          label="내부 여백 ↔"
          value={Math.min(padX, maxPadX)}
          min={0}
          max={maxPadX}
          step={1}
          numStep={1}
          decimals={0}
          onChange={(v) => set({ padX: v })}
        />
        <TuneField
          label="내부 여백 ↕"
          value={Math.min(padY, maxPadY)}
          min={0}
          max={maxPadY}
          step={1}
          numStep={1}
          decimals={0}
          onChange={(v) => set({ padY: v })}
        />
      </div>
    </div>
  )
}
