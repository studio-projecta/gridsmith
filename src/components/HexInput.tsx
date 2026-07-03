import { useEffect, useState } from 'react'
import { parseColor } from '../lib/color'

interface Props {
  /** 현재 색(`#rrggbb`). */
  value: string
  disabled?: boolean
  'aria-label': string
  /** 유효한 값 입력 시 정규화된 `#rrggbb` 로 호출. */
  onChange: (hex: string) => void
}

/**
 * hex/rgb 를 직접 입력해 색을 지정하는 텍스트 필드.
 * 입력 도중 잘못된 값도 자유롭게 타이핑할 수 있게 로컬 상태를 두고,
 * parseColor 가 성공할 때만 onChange 로 반영한다. blur 시 마지막 유효값으로 되돌린다.
 */
export default function HexInput({ value, disabled, onChange, 'aria-label': ariaLabel }: Props) {
  const [text, setText] = useState(value)

  // 외부(색상 선택기 등)에서 값이 바뀌면 표시를 동기화.
  useEffect(() => setText(value), [value])

  const commit = (raw: string) => {
    setText(raw)
    const parsed = parseColor(raw)
    if (parsed && parsed !== value) onChange(parsed)
  }

  const valid = parseColor(text) != null

  return (
    <input
      type="text"
      className={'hex-input' + (valid ? '' : ' invalid')}
      aria-label={ariaLabel}
      disabled={disabled}
      value={text}
      placeholder="#rrggbb"
      spellCheck={false}
      onChange={(e) => commit(e.target.value)}
      onBlur={() => setText(value)}
    />
  )
}
