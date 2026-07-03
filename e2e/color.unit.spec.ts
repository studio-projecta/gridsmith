import { test, expect } from '@playwright/test'
import { parseColor } from '../src/lib/color'

test.describe('parseColor', () => {
  test('#rrggbb / # 없는 6자리', () => {
    expect(parseColor('#ff00ff')).toBe('#ff00ff')
    expect(parseColor('FF00FF')).toBe('#ff00ff')
  })

  test('#rgb 축약형은 확장', () => {
    expect(parseColor('#f0a')).toBe('#ff00aa')
    expect(parseColor('0f8')).toBe('#00ff88')
  })

  test('rgb(r,g,b) 및 r,g,b', () => {
    expect(parseColor('rgb(255, 0, 255)')).toBe('#ff00ff')
    expect(parseColor('0,128,255')).toBe('#0080ff')
  })

  test('공백 트림', () => {
    expect(parseColor('  #abcdef  ')).toBe('#abcdef')
  })

  test('잘못된 입력은 null', () => {
    expect(parseColor('')).toBeNull()
    expect(parseColor('#12')).toBeNull()
    expect(parseColor('#gggggg')).toBeNull()
    expect(parseColor('rgb(300,0,0)')).toBeNull() // 255 초과
    expect(parseColor('nope')).toBeNull()
  })
})
