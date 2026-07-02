import { create } from 'zustand'
import type { GroupType, StoredImage, GridLayout, CellSlot } from '../types'
import { DEFAULT_TRANSFORM, makeDefaultLayout, reflowCells, computeAutoOutput } from '../types'
import * as db from '../db/idb'

const LAST_TYPE_KEY = 'gridsmith:lastTypeId'

/**
 * autoSize 가 켜져 있으면 출력 px 를 그리드에 배치된(읽기순서상 첫) 셀 이미지의
 * 원본 크기 × 그리드 기준으로 맞춘다. 배치된 이미지가 없으면 그대로 둔다.
 * 변경이 없으면 원본 layout 을 그대로 반환(불필요한 저장/렌더 방지).
 */
function withAutoSize(layout: GridLayout, images: StoredImage[]): GridLayout {
  if (layout.autoSize === false) return layout
  const firstSlot = layout.cells.find((c) => c != null)
  if (!firstSlot) return layout
  const img = images.find((i) => i.id === firstSlot.imageId)
  if (!img) return layout
  const { outputWidth, outputHeight } = computeAutoOutput(
    layout.rows,
    layout.cols,
    layout.gap,
    img.width,
    img.height,
  )
  if (outputWidth === layout.outputWidth && outputHeight === layout.outputHeight) return layout
  return { ...layout, outputWidth, outputHeight }
}

function uid(): string {
  return (
    Date.now().toString(36) +
    Math.floor(Math.random() * 1e9).toString(36)
  )
}

interface StoreState {
  types: GroupType[]
  selectedTypeId: string | null
  images: StoredImage[]
  layout: GridLayout | null
  /** imageId -> object URL (blob 미리보기용). */
  urls: Record<string, string>
  selectedCell: number | null

  init: () => Promise<void>
  selectType: (id: string) => Promise<void>
  addType: (name: string) => Promise<void>
  renameType: (id: string, name: string) => Promise<void>
  removeType: (id: string) => Promise<void>

  addImages: (files: File[]) => Promise<void>
  removeImage: (id: string) => Promise<void>

  updateLayout: (patch: Partial<GridLayout>) => void
  setAutoSize: (on: boolean) => void
  setGridSize: (rows: number, cols: number) => void
  setCellSlot: (index: number, slot: CellSlot | null) => void
  moveCell: (from: number, to: number) => void
  placeInNextEmpty: (imageId: string) => void
  autoFill: () => void
  clearCells: () => void

  setSelectedCell: (index: number | null) => void
}

// 레이아웃 저장 디바운스 (드래그 중 과도한 IndexedDB 쓰기 방지).
let saveTimer: ReturnType<typeof setTimeout> | null = null
function persistLayout(layout: GridLayout) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void db.putLayout(layout)
  }, 300)
}

async function decodeSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return size
}

function buildUrls(images: StoredImage[]): Record<string, string> {
  const urls: Record<string, string> = {}
  for (const img of images) urls[img.id] = URL.createObjectURL(img.blob)
  return urls
}

function revokeUrls(urls: Record<string, string>) {
  for (const url of Object.values(urls)) URL.revokeObjectURL(url)
}

export const useStore = create<StoreState>((set, get) => ({
  types: [],
  selectedTypeId: null,
  images: [],
  layout: null,
  urls: {},
  selectedCell: null,

  init: async () => {
    const types = await db.getTypes()
    set({ types })
    const last = localStorage.getItem(LAST_TYPE_KEY)
    const target = types.find((t) => t.id === last) ?? types[0]
    if (target) await get().selectType(target.id)
  },

  selectType: async (id) => {
    const [images, existing] = await Promise.all([
      db.getImages(id),
      db.getLayout(id),
    ])
    const base = existing ?? makeDefaultLayout(id)
    const layout = withAutoSize(base, images)
    if (!existing || layout !== base) await db.putLayout(layout)

    revokeUrls(get().urls)
    localStorage.setItem(LAST_TYPE_KEY, id)
    set({
      selectedTypeId: id,
      images,
      layout,
      urls: buildUrls(images),
      selectedCell: null,
    })
  },

  addType: async (name) => {
    const type: GroupType = { id: uid(), name: name.trim() || '새 유형', createdAt: Date.now() }
    await db.putType(type)
    set((s) => ({ types: [...s.types, type] }))
    await get().selectType(type.id)
  },

  renameType: async (id, name) => {
    const type = get().types.find((t) => t.id === id)
    if (!type) return
    const updated = { ...type, name: name.trim() || type.name }
    await db.putType(updated)
    set((s) => ({ types: s.types.map((t) => (t.id === id ? updated : t)) }))
  },

  removeType: async (id) => {
    await db.deleteType(id)
    const remaining = get().types.filter((t) => t.id !== id)
    set({ types: remaining })
    if (get().selectedTypeId === id) {
      revokeUrls(get().urls)
      set({ selectedTypeId: null, images: [], layout: null, urls: {}, selectedCell: null })
      if (remaining[0]) await get().selectType(remaining[0].id)
    }
  },

  addImages: async (files) => {
    const typeId = get().selectedTypeId
    if (!typeId) return
    const added: StoredImage[] = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      try {
        const { width, height } = await decodeSize(file)
        const img: StoredImage = {
          id: uid(),
          typeId,
          name: file.name,
          blob: file,
          width,
          height,
        }
        await db.putImage(img)
        added.push(img)
      } catch {
        // 디코드 불가 파일은 건너뜀.
      }
    }
    if (!added.length) return
    set((s) => {
      const images = [...s.images, ...added]
      const urls = { ...s.urls }
      for (const img of added) urls[img.id] = URL.createObjectURL(img.blob)
      return { images, urls }
    })
  },

  removeImage: async (id) => {
    await db.deleteImage(id)
    set((s) => {
      const url = s.urls[id]
      if (url) URL.revokeObjectURL(url)
      const { [id]: _removed, ...urls } = s.urls
      const images = s.images.filter((i) => i.id !== id)
      // 삭제된 이미지를 참조하던 셀 비우고, autoSize 면 첫 배치 셀 기준으로 출력 크기 갱신.
      let layout = s.layout
      if (layout) {
        const cells = layout.cells.map((c) => (c?.imageId === id ? null : c))
        layout = withAutoSize({ ...layout, cells }, images)
        persistLayout(layout)
      }
      return { images, urls, layout }
    })
  },

  updateLayout: (patch) => {
    const layout = get().layout
    if (!layout) return
    let next = { ...layout, ...patch }
    // gap 은 출력 크기 계산에 영향 → autoSize 면 재계산.
    if ('gap' in patch) next = withAutoSize(next, get().images)
    persistLayout(next)
    set({ layout: next })
  },

  setAutoSize: (on) => {
    const layout = get().layout
    if (!layout) return
    let next = { ...layout, autoSize: on }
    if (on) next = withAutoSize(next, get().images)
    persistLayout(next)
    set({ layout: next })
  },

  setGridSize: (rows, cols) => {
    const layout = get().layout
    if (!layout) return
    // 읽기순서 기준 리플로우 + 배치 이미지가 모두 담기도록 행 자동 확장(이미지 유실 방지).
    const { rows: finalRows, cells } = reflowCells(layout.cells, rows, cols)
    const next = withAutoSize({ ...layout, rows: finalRows, cols, cells }, get().images)
    persistLayout(next)
    set({ layout: next, selectedCell: null })
  },

  setCellSlot: (index, slot) => {
    const layout = get().layout
    if (!layout) return
    const cells = layout.cells.slice()
    cells[index] = slot
    const next = withAutoSize({ ...layout, cells }, get().images)
    persistLayout(next)
    set({ layout: next })
  },

  moveCell: (from, to) => {
    const layout = get().layout
    if (!layout || from === to) return
    // 끼워넣기(insert): from 을 빼서 to 위치에 삽입 → 사이 항목들이 밀린다(arrayMove).
    const cells = layout.cells.slice()
    const [moved] = cells.splice(from, 1)
    cells.splice(to, 0, moved)
    const next = withAutoSize({ ...layout, cells }, get().images)
    persistLayout(next)
    set({ layout: next })
  },

  placeInNextEmpty: (imageId) => {
    const layout = get().layout
    if (!layout) return
    // 읽기순서상 첫 빈 셀에 배치. 빈 셀이 없으면 무시.
    const index = layout.cells.findIndex((c) => c == null)
    if (index === -1) return
    const cells = layout.cells.slice()
    cells[index] = { imageId, transform: { ...DEFAULT_TRANSFORM } }
    const next = withAutoSize({ ...layout, cells }, get().images)
    persistLayout(next)
    set({ layout: next })
  },

  autoFill: () => {
    const { layout, images } = get()
    if (!layout) return
    // 이미 어떤 셀에든 올라간 이미지는 중복 배치하지 않는다.
    const used = new Set<string>()
    for (const c of layout.cells) if (c) used.add(c.imageId)
    const available = images.filter((img) => !used.has(img.id))

    const cells = layout.cells.slice()
    let k = 0
    for (let i = 0; i < cells.length && k < available.length; i++) {
      if (cells[i]) continue
      cells[i] = { imageId: available[k].id, transform: { ...DEFAULT_TRANSFORM } }
      k++
    }
    const next = withAutoSize({ ...layout, cells }, images)
    persistLayout(next)
    set({ layout: next })
  },

  clearCells: () => {
    const layout = get().layout
    if (!layout) return
    const next = { ...layout, cells: new Array(layout.rows * layout.cols).fill(null) }
    persistLayout(next)
    set({ layout: next, selectedCell: null })
  },

  setSelectedCell: (index) => set({ selectedCell: index }),
}))
