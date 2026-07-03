import { create } from 'zustand'
import type { GroupType, StoredImage, GridLayout, CellSlot, CellTransform } from '../types'
import { DEFAULT_TRANSFORM, makeDefaultLayout, reflowCells, computeAutoOutput } from '../types'
import { decodeMeta } from '../lib/thumb'
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
    layout.marginX,
    layout.marginY,
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

/**
 * index 위치에 slot 을 끼워넣고 이후 셀들을 뒤로 민다.
 * 삽입 지점 이후 첫 빈 칸을 먼저 제거해 밀기를 흡수하므로, 빈 칸이 있으면 그리드가 커지지 않는다.
 * 흡수할 빈 칸이 없어 길이가 넘치면 reflowCells 가 행을 늘려 밀려난 이미지를 보존한다(never-lose).
 */
function insertWithPush(
  cells: (CellSlot | null)[],
  index: number,
  slot: CellSlot,
  rows: number,
  cols: number,
): { rows: number; cells: (CellSlot | null)[] } {
  const next = cells.slice()
  const hole = next.findIndex((c, i) => i >= index && c == null)
  if (hole !== -1) next.splice(hole, 1)
  next.splice(index, 0, slot)
  return reflowCells(next, rows, cols)
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
  refresh: () => Promise<void>
  selectType: (id: string) => Promise<void>
  addType: (name: string) => Promise<void>
  renameType: (id: string, name: string) => Promise<void>
  removeType: (id: string) => Promise<void>
  reorderTypes: (orderedIds: string[]) => Promise<void>

  addImages: (files: File[]) => Promise<void>
  removeImage: (id: string) => Promise<void>

  updateLayout: (patch: Partial<GridLayout>) => void
  setAutoSize: (on: boolean) => void
  setGridSize: (rows: number, cols: number) => void
  setCellSlot: (index: number, slot: CellSlot | null) => void
  updateCellTransform: (index: number, patch: Partial<CellTransform>) => void
  insertCellSlot: (index: number, slot: CellSlot) => void
  moveCellInsert: (from: number, insertIndex: number) => void
  moveCellTo: (from: number, to: number) => void
  swapCells: (a: number, b: number) => void
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

/** 썸네일이 없는(과거) 이미지에 썸네일을 생성·저장해 채워준다. */
async function ensureThumbs(images: StoredImage[]): Promise<StoredImage[]> {
  const out: StoredImage[] = []
  for (const img of images) {
    if (img.thumbBlob) {
      out.push(img)
      continue
    }
    try {
      const { thumbBlob } = await decodeMeta(img.blob)
      const updated = { ...img, thumbBlob }
      await db.putImage(updated)
      out.push(updated)
    } catch {
      out.push(img) // 디코드 실패 시 원본 그대로(폴백).
    }
  }
  return out
}

function buildUrls(images: StoredImage[]): Record<string, string> {
  const urls: Record<string, string> = {}
  // 미리보기는 썸네일 사용(없으면 원본 폴백). 원본 blob 은 내보내기에서만 디코드.
  for (const img of images) urls[img.id] = URL.createObjectURL(img.thumbBlob ?? img.blob)
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

  // 백업 가져오기 후 유형 목록을 다시 읽고 현재(또는 첫) 유형을 재선택해 화면을 갱신한다.
  refresh: async () => {
    const types = await db.getTypes()
    set({ types })
    const cur = get().selectedTypeId
    const target = types.find((t) => t.id === cur) ?? types[0]
    if (target) await get().selectType(target.id)
  },

  selectType: async (id) => {
    const [rawImages, existing] = await Promise.all([
      db.getImages(id),
      db.getLayout(id),
    ])
    const images = await ensureThumbs(rawImages)
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
    // 유형 순서는 createdAt 오름차순. 같은 ms 에 추가해도 순서가 뒤섞이지 않게 마지막보다 항상 큰 값을 준다.
    const last = get().types[get().types.length - 1]
    const createdAt = Math.max(Date.now(), (last?.createdAt ?? 0) + 1)
    const type: GroupType = { id: uid(), name: name.trim() || '새 유형', createdAt }
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

  // 유형을 orderedIds 순서로 재배치한다. 기존 createdAt 값 집합을 순서대로 다시 매핑해
  // (값은 보존, 소유자만 교체) 순서 전용 필드/스키마 변경 없이 영속화한다.
  reorderTypes: async (orderedIds) => {
    const types = get().types
    if (orderedIds.length !== types.length) return
    const byId = new Map(types.map((t) => [t.id, t]))
    const times = types.map((t) => t.createdAt).sort((a, b) => a - b)
    const next = orderedIds.map((id, i) => ({ ...byId.get(id)!, createdAt: times[i] }))
    const changed = next.filter((t) => byId.get(t.id)!.createdAt !== t.createdAt)
    if (!changed.length) return
    await Promise.all(changed.map((t) => db.putType(t)))
    set({ types: next })
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
        const { width, height, thumbBlob } = await decodeMeta(file)
        const img: StoredImage = {
          id: uid(),
          typeId,
          name: file.name,
          blob: file,
          thumbBlob,
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
      for (const img of added) urls[img.id] = URL.createObjectURL(img.thumbBlob ?? img.blob)
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
    // gap·여백은 출력 크기 계산에 영향 → autoSize 면 재계산.
    if ('gap' in patch || 'marginX' in patch || 'marginY' in patch) {
      next = withAutoSize(next, get().images)
    }
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

  // 선택 셀 이미지의 미세조정(배율·offset)만 갱신. autoSize 는 이미지 원본 크기 기준이라 영향 없음.
  updateCellTransform: (index, patch) => {
    const layout = get().layout
    if (!layout) return
    const slot = layout.cells[index]
    if (!slot) return
    const cells = layout.cells.slice()
    cells[index] = { ...slot, transform: { ...slot.transform, ...patch } }
    const next = { ...layout, cells }
    persistLayout(next)
    set({ layout: next })
  },

  insertCellSlot: (index, slot) => {
    const layout = get().layout
    if (!layout) return
    const { rows, cells } = insertWithPush(layout.cells, index, slot, layout.rows, layout.cols)
    const next = withAutoSize({ ...layout, rows, cells }, get().images)
    persistLayout(next)
    set({ layout: next })
  },

  // 셀 사이(경계)에 드롭: 원본 셀을 빼서 삽입 위치에 끼워넣고 이후 셀들을 뒤로 민다.
  moveCellInsert: (from, insertIndex) => {
    const layout = get().layout
    if (!layout) return
    const base = layout.cells.slice()
    const [moved] = base.splice(from, 1)
    if (!moved) return
    // from 제거로 그 뒤 인덱스가 한 칸 당겨지므로 삽입 위치를 보정한다.
    const index = insertIndex > from ? insertIndex - 1 : insertIndex
    const { rows, cells } = insertWithPush(base, index, moved, layout.rows, layout.cols)
    const next = withAutoSize({ ...layout, rows, cells }, get().images)
    persistLayout(next)
    set({ layout: next })
  },

  // 빈 칸에 드롭: 원본을 그 칸으로 옮기고 원래 칸은 비운다(다른 셀은 그대로).
  moveCellTo: (from, to) => {
    const layout = get().layout
    if (!layout || from === to) return
    const cells = layout.cells.slice()
    cells[to] = cells[from]
    cells[from] = null
    const next = withAutoSize({ ...layout, cells }, get().images)
    persistLayout(next)
    set({ layout: next })
  },

  // 있는 칸에 드롭: 두 셀의 내용을 맞바꾼다(각자의 transform 도 함께 이동).
  swapCells: (a, b) => {
    const layout = get().layout
    if (!layout || a === b) return
    const cells = layout.cells.slice()
    ;[cells[a], cells[b]] = [cells[b], cells[a]]
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
