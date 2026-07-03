/**
 * 사용자가 입력한 hex/rgb 문자열을 `#rrggbb`(소문자)로 정규화한다.
 * 허용: `#rgb`, `#rrggbb`(# 선택), `rgb(r,g,b)`, `r,g,b`. 파싱 불가면 null.
 * color input 과 canvas 는 `#rrggbb` 를 요구하므로 저장값을 이 형태로 맞춘다.
 */
export function parseColor(input: string): string | null {
  const s = input.trim().toLowerCase()
  if (!s) return null

  const rgb = s.match(/^(?:rgb\(\s*)?(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)?$/)
  if (rgb) {
    const parts = [rgb[1], rgb[2], rgb[3]].map(Number)
    if (parts.some((n) => n > 255)) return null
    return '#' + parts.map((n) => n.toString(16).padStart(2, '0')).join('')
  }

  const hex = s.replace(/^#/, '')
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return '#' + hex.split('').map((c) => c + c).join('')
  }
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return '#' + hex
  }
  return null
}
