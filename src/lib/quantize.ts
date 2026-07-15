// median-cut 색상 양자화. RGBA 4D 공간에서 박스를 나눠 대표색을 뽑고, 각 픽셀을 자신이 속한
// 박스의 대표색으로 매핑한다. 알파를 채널로 포함하므로 투명·안티에일리어싱이 보존되고, 결과가
// ≤maxColors 색이면 oxipng 가 인덱스(팔레트) PNG 로 변환해 용량이 크게 준다.

interface Box {
  indices: number[] // 유니크 색 인덱스 목록
  channel: number // 다음 분할에 쓸 가장 넓은 채널(0=R,1=G,2=B,3=A)
  range: number // 그 채널의 값 범위(분할 우선순위)
}

/** RGBA 픽셀을 최대 maxColors 개 색으로 양자화한 새 RGBA 배열을 반환한다. */
export function medianCut(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maxColors: number,
): Uint8ClampedArray {
  const n = width * height
  const out = new Uint8ClampedArray(data.length)

  // 유니크 색 히스토그램(packed RGBA → 픽셀 수).
  const hist = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const key = ((data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]) >>> 0
    hist.set(key, (hist.get(key) ?? 0) + 1)
  }

  const uCount = hist.size
  if (maxColors < 1 || uCount <= maxColors) {
    // 이미 목표 이하면 색을 줄일 게 없다(그대로 복사).
    out.set(data)
    return out
  }

  // 유니크 색을 채널별 배열로 펼친다.
  const R = new Uint8Array(uCount)
  const G = new Uint8Array(uCount)
  const B = new Uint8Array(uCount)
  const A = new Uint8Array(uCount)
  const CNT = new Float64Array(uCount)
  const KEY = new Float64Array(uCount)
  let u = 0
  for (const [key, count] of hist) {
    R[u] = (key >>> 24) & 0xff
    G[u] = (key >>> 16) & 0xff
    B[u] = (key >>> 8) & 0xff
    A[u] = key & 0xff
    CNT[u] = count
    KEY[u] = key
    u++
  }

  // 인덱스 목록의 가장 넓은 채널과 그 범위를 구한다.
  const widest = (indices: number[]): { channel: number; range: number } => {
    let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0, amin = 255, amax = 0
    for (const i of indices) {
      const r = R[i], g = G[i], b = B[i], a = A[i]
      if (r < rmin) rmin = r
      if (r > rmax) rmax = r
      if (g < gmin) gmin = g
      if (g > gmax) gmax = g
      if (b < bmin) bmin = b
      if (b > bmax) bmax = b
      if (a < amin) amin = a
      if (a > amax) amax = a
    }
    const ranges = [rmax - rmin, gmax - gmin, bmax - bmin, amax - amin]
    let channel = 0
    for (let c = 1; c < 4; c++) if (ranges[c] > ranges[channel]) channel = c
    return { channel, range: ranges[channel] }
  }

  const chanVal = (i: number, c: number) => (c === 0 ? R[i] : c === 1 ? G[i] : c === 2 ? B[i] : A[i])

  const makeBox = (indices: number[]): Box => {
    const w = widest(indices)
    return { indices, channel: w.channel, range: w.range }
  }

  const boxes: Box[] = [makeBox(Array.from({ length: uCount }, (_, i) => i))]

  while (boxes.length < maxColors) {
    // 범위가 가장 넓은(오차가 큰) 분할 가능한 박스를 고른다.
    let target = -1
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].indices.length > 1 && (target < 0 || boxes[i].range > boxes[target].range)) {
        target = i
      }
    }
    if (target < 0) break // 더 쪼갤 박스가 없다.

    const box = boxes[target]
    const ch = box.channel
    const sorted = box.indices.slice().sort((a, b) => chanVal(a, ch) - chanVal(b, ch))

    // count 가중 중앙값에서 분할(양쪽 모두 비지 않도록 보정).
    let total = 0
    for (const i of sorted) total += CNT[i]
    let acc = 0
    let split = 1
    for (let k = 0; k < sorted.length - 1; k++) {
      acc += CNT[sorted[k]]
      if (acc >= total / 2) {
        split = k + 1
        break
      }
    }

    boxes[target] = makeBox(sorted.slice(0, split))
    boxes.push(makeBox(sorted.slice(split)))
  }

  // 박스별 count 가중 평균색 → 각 유니크 색 key 를 대표색으로 매핑.
  const keyToRep = new Map<number, number>()
  for (const box of boxes) {
    let sr = 0, sg = 0, sb = 0, sa = 0, sc = 0
    for (const i of box.indices) {
      sr += R[i] * CNT[i]
      sg += G[i] * CNT[i]
      sb += B[i] * CNT[i]
      sa += A[i] * CNT[i]
      sc += CNT[i]
    }
    const rr = Math.round(sr / sc)
    const rg = Math.round(sg / sc)
    const rb = Math.round(sb / sc)
    const ra = Math.round(sa / sc)
    const rep = ((rr << 24) | (rg << 16) | (rb << 8) | ra) >>> 0
    for (const i of box.indices) keyToRep.set(KEY[i], rep)
  }

  for (let i = 0; i < n; i++) {
    const o = i * 4
    const key = ((data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]) >>> 0
    const rep = keyToRep.get(key) ?? key
    out[o] = (rep >>> 24) & 0xff
    out[o + 1] = (rep >>> 16) & 0xff
    out[o + 2] = (rep >>> 8) & 0xff
    out[o + 3] = rep & 0xff
  }
  return out
}
