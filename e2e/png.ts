import zlib from 'node:zlib'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/** width×height 단색(RGB) PNG 버퍼 생성. */
export function makeSolidPNG(width: number, height: number, rgb: [number, number, number]): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const rowLen = 1 + width * 3
  const raw = Buffer.alloc(rowLen * height)
  for (let y = 0; y < height; y++) {
    const off = y * rowLen
    raw[off] = 0 // filter type: none
    for (let x = 0; x < width; x++) {
      const p = off + 1 + x * 3
      raw[p] = rgb[0]
      raw[p + 1] = rgb[1]
      raw[p + 2] = rgb[2]
    }
  }
  const idat = zlib.deflateSync(raw)

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * width×height 고엔트로피 노이즈(RGB) PNG 버퍼 생성. 무손실 압축이 잘 안 돼
 * 목표 용량을 넘기므로 손실 폴백 경로를 테스트하는 데 쓴다. LCG 로 결정적으로 생성한다.
 */
export function makeNoisePNG(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  // compression/filter/interlace 0

  let seed = 0x1234abcd
  const rand = () => {
    // 32-bit LCG (numerical recipes).
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return (seed >>> 24) & 0xff
  }

  const rowLen = 1 + width * 3
  const raw = Buffer.alloc(rowLen * height)
  for (let y = 0; y < height; y++) {
    const off = y * rowLen
    raw[off] = 0 // filter type: none
    for (let x = 0; x < width; x++) {
      const p = off + 1 + x * 3
      raw[p] = rand()
      raw[p + 1] = rand()
      raw[p + 2] = rand()
    }
  }
  const idat = zlib.deflateSync(raw)

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
