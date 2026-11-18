import { test, expect } from '@playwright/test'
import { uniqueNames } from '../src/lib/compress'

test.describe('uniqueNames', () => {
  test('빈 배열은 빈 배열', () => {
    expect(uniqueNames([])).toEqual([])
  })

  test('겹치지 않으면 그대로', () => {
    expect(uniqueNames(['a.png', 'b.png'])).toEqual(['a.png', 'b.png'])
  })

  test('겹치는 이름은 확장자 앞에 -1, -2 를 붙인다', () => {
    expect(uniqueNames(['a.png', 'a.png', 'a.png'])).toEqual(['a.png', 'a-1.png', 'a-2.png'])
  })

  test('붙인 이름이 기존 이름과 겹치면 다음 번호로 넘어간다', () => {
    expect(uniqueNames(['a.png', 'a-1.png', 'a.png'])).toEqual(['a.png', 'a-1.png', 'a-2.png'])
  })

  test('확장자가 없으면 끝에 붙인다', () => {
    expect(uniqueNames(['img', 'img'])).toEqual(['img', 'img-1'])
  })

  test('점으로 시작하는 이름은 통째로 stem 으로 본다', () => {
    expect(uniqueNames(['.png', '.png'])).toEqual(['.png', '.png-1'])
  })
})
