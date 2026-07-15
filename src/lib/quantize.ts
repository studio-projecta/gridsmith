// libimagequant(WASM, GPL) 색상 양자화. pngquant급 팔레트 선택 + 디더링으로 투명 PNG 를
// 손실 압축한다. imagequant 는 RGBA 를 받아 팔레트 PNG 를 직접 만들어 반환한다(알파 보존).
//
// imagequant 패키지는 Node 에서 해석 가능한 진입점(main/exports)이 없어(브라우저는 Vite 가
// module 필드로 로드) 지연 동적 import 로 불러온다. 덕분에 순수 함수 단위 테스트(Node)가
// 이 모듈을 거쳐도 실제 호출 전엔 wasm 을 끌어오지 않는다.

let modPromise: Promise<typeof import('imagequant')> | null = null

function loadImagequant(): Promise<typeof import('imagequant')> {
  if (!modPromise) modPromise = import('imagequant')
  return modPromise
}

/**
 * RGBA 픽셀을 maxColors 색으로 양자화(+디더링)한 팔레트 PNG 바이트를 반환한다.
 * gamma 0 은 sRGB(대부분의 이미지)를 뜻한다.
 */
export async function quantizePng(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maxColors: number,
): Promise<Uint8Array> {
  const { Imagequant, ImagequantImage } = await loadImagequant()
  const rgba = new Uint8Array(data.buffer, data.byteOffset, data.length)
  const image = new ImagequantImage(rgba, width, height, 0)
  const iq = new Imagequant()
  iq.set_max_colors(maxColors)
  return iq.process(image)
}
