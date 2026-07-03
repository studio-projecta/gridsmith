// 의존성 없는 STORE(무압축) ZIP 쓰기/읽기. 백업 파일과 이미지 묶음 다운로드 전용.
// 이미지 blob 은 이미 압축돼 있어 DEFLATE 이득이 거의 없으므로 STORE 로 단순화한다.
// 읽기는 우리가 쓴 파일(데이터 디스크립터 미사용, 로컬 헤더에 크기 명시)만 대상으로 한다.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipInput {
  name: string
  blob: Blob
}

export interface ZipEntry {
  name: string
  bytes: Uint8Array
}

// 로컬 헤더 30B + 중앙 디렉터리 46B + EOCD 22B (모두 확장필드/주석 없음).
const UTF8_FLAG = 0x0800

export async function zipStore(files: ZipInput[]): Promise<Blob> {
  const enc = new TextEncoder()
  const entries = await Promise.all(
    files.map(async (f) => ({
      nameBytes: enc.encode(f.name),
      bytes: new Uint8Array(await f.blob.arrayBuffer()),
    })),
  )

  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const e of entries) {
    const crc = crc32(e.bytes)
    const size = e.bytes.length

    const local = new Uint8Array(30 + e.nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, UTF8_FLAG, true)
    lv.setUint16(8, 0, true) // method: store
    lv.setUint16(10, 0, true) // mod time
    lv.setUint16(12, 0, true) // mod date
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true) // compressed size
    lv.setUint32(22, size, true) // uncompressed size
    lv.setUint16(26, e.nameBytes.length, true)
    lv.setUint16(28, 0, true) // extra length
    local.set(e.nameBytes, 30)

    const cd = new Uint8Array(46 + e.nameBytes.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, UTF8_FLAG, true)
    cv.setUint16(10, 0, true) // method
    cv.setUint16(12, 0, true) // mod time
    cv.setUint16(14, 0, true) // mod date
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, e.nameBytes.length, true)
    cv.setUint16(30, 0, true) // extra len
    cv.setUint16(32, 0, true) // comment len
    cv.setUint16(34, 0, true) // disk number start
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, offset, true) // local header offset
    cd.set(e.nameBytes, 46)

    parts.push(local, e.bytes)
    central.push(cd)
    offset += local.length + e.bytes.length
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0)
  const cdOffset = offset

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true) // disk number
  ev.setUint16(6, 0, true) // disk with cd
  ev.setUint16(8, entries.length, true) // entries on disk
  ev.setUint16(10, entries.length, true) // total entries
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, cdOffset, true)
  ev.setUint16(20, 0, true) // comment length

  return new Blob([...parts, ...central, eocd] as BlobPart[], { type: 'application/zip' })
}

/** 로컬 헤더를 순차 파싱한다. zipStore 가 만든(STORE, 데이터 디스크립터 없음) 파일 전용. */
export async function unzipStore(blob: Blob): Promise<ZipEntry[]> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const dec = new TextDecoder()
  const out: ZipEntry[] = []
  let p = 0
  while (p + 4 <= buf.length && dv.getUint32(p, true) === 0x04034b50) {
    const method = dv.getUint16(p + 8, true)
    const compSize = dv.getUint32(p + 18, true)
    const nameLen = dv.getUint16(p + 26, true)
    const extraLen = dv.getUint16(p + 28, true)
    const name = dec.decode(buf.subarray(p + 30, p + 30 + nameLen))
    const dataStart = p + 30 + nameLen + extraLen
    if (method !== 0) throw new Error('지원하지 않는 압축 형식의 항목이 있습니다.')
    out.push({ name, bytes: buf.slice(dataStart, dataStart + compSize) })
    p = dataStart + compSize
  }
  return out
}
