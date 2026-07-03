import type { GroupType, GridLayout, StoredImage, CellSlot } from '../types'
import { zipStore, unzipStore } from './zip'
import { downloadBlob } from './compose'
import * as db from '../db/idb'

// 백업 파일: ZIP 안에 manifest.json(유형·레이아웃·이미지 메타) + images/<id> 원본 blob.
// 썸네일은 저장하지 않는다 — 불러올 때 selectType 의 ensureThumbs 가 재생성한다.
const BACKUP_APP = 'gridsmith'
const BACKUP_VERSION = 1

interface ImageMeta {
  id: string
  typeId: string
  name: string
  width: number
  height: number
  mime: string
  file: string
}

interface Manifest {
  app: string
  version: number
  types: GroupType[]
  layouts: GridLayout[]
  images: ImageMeta[]
}

// 대량 루프에서도 충돌하지 않도록 카운터를 섞은 ID 발급기(가져오기 시 remap 전용).
let idCounter = 0
function newId(): string {
  return (
    Date.now().toString(36) +
    (idCounter++).toString(36) +
    Math.floor(Math.random() * 1e6).toString(36)
  )
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function sanitizeFile(name: string): string {
  // ZIP 항목 이름에서 경로 구분자만 제거(유형/이미지 이름의 한글·공백은 유지).
  return name.replace(/[/\\]+/g, '_').trim() || 'image'
}

/** 전체 앱 상태(모든 유형·이미지·레이아웃)를 ZIP 한 파일로 내보낸다. */
export async function exportBackup(): Promise<void> {
  const [types, images, layouts] = await Promise.all([
    db.getTypes(),
    db.getAllImages(),
    db.getAllLayouts(),
  ])

  const manifest: Manifest = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    types,
    layouts,
    images: images.map((i) => ({
      id: i.id,
      typeId: i.typeId,
      name: i.name,
      width: i.width,
      height: i.height,
      mime: i.blob.type || 'application/octet-stream',
      file: `images/${i.id}`,
    })),
  }

  const files = [
    {
      name: 'manifest.json',
      blob: new Blob([JSON.stringify(manifest)], { type: 'application/json' }),
    },
    ...images.map((i) => ({ name: `images/${i.id}`, blob: i.blob })),
  ]

  const zip = await zipStore(files)
  downloadBlob(zip, `gridsmith-backup-${stamp()}.zip`)
}

export interface ImportResult {
  types: number
  images: number
}

/**
 * 백업 ZIP 을 병합(추가)한다. 재가져오기·기존 데이터와의 충돌을 피하려
 * 유형·이미지 ID 를 모두 새로 발급하고 레이아웃(typeId·셀 imageId) 참조를 remap 한다.
 */
export async function importBackup(file: File): Promise<ImportResult> {
  const entries = await unzipStore(file)
  const byName = new Map(entries.map((e) => [e.name, e.bytes]))

  const manifestBytes = byName.get('manifest.json')
  if (!manifestBytes) throw new Error('manifest.json 이 없습니다. Gridsmith 백업 파일이 아닙니다.')

  let manifest: Manifest
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes))
  } catch {
    throw new Error('백업 정보를 읽을 수 없습니다(manifest.json 손상).')
  }
  if (manifest.app !== BACKUP_APP || !Array.isArray(manifest.types)) {
    throw new Error('Gridsmith 백업 파일 형식이 아닙니다.')
  }

  const typeIdMap = new Map<string, string>()
  const imageIdMap = new Map<string, string>()
  for (const t of manifest.types) typeIdMap.set(t.id, newId())
  for (const im of manifest.images ?? []) imageIdMap.set(im.id, newId())

  for (const t of manifest.types) {
    await db.putType({ ...t, id: typeIdMap.get(t.id)! })
  }

  let imported = 0
  for (const im of manifest.images ?? []) {
    const bytes = byName.get(im.file)
    const newTypeId = typeIdMap.get(im.typeId)
    if (!bytes || !newTypeId) continue
    const image: StoredImage = {
      id: imageIdMap.get(im.id)!,
      typeId: newTypeId,
      name: im.name,
      blob: new Blob([bytes as BlobPart], { type: im.mime || 'application/octet-stream' }),
      width: im.width,
      height: im.height,
    }
    await db.putImage(image)
    imported++
  }

  for (const lay of manifest.layouts ?? []) {
    const newTypeId = typeIdMap.get(lay.typeId)
    if (!newTypeId) continue
    // 셀의 imageId 를 새 ID 로 옮기고, 가져오지 못한 이미지를 가리키는 셀은 비운다.
    const cells = (lay.cells ?? []).map((c): CellSlot | null => {
      if (!c) return null
      const mapped = imageIdMap.get(c.imageId)
      return mapped ? { ...c, imageId: mapped } : null
    })
    await db.putLayout({ ...lay, typeId: newTypeId, cells })
  }

  return { types: manifest.types.length, images: imported }
}

/** 현재 유형의 원본 이미지들을 ZIP 한 파일로 내려받는다. */
export async function exportImagesZip(images: StoredImage[], typeName: string): Promise<void> {
  if (!images.length) return
  const seen = new Map<string, number>()
  const files = images.map((img) => {
    let name = sanitizeFile(img.name)
    // 같은 파일명이 여러 장일 수 있어 확장자 앞에 -1, -2 를 붙여 구분한다.
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    if (count > 0) {
      const dot = name.lastIndexOf('.')
      name = dot > 0 ? `${name.slice(0, dot)}-${count}${name.slice(dot)}` : `${name}-${count}`
    }
    return { name, blob: img.blob }
  })
  const safe = typeName.replace(/[^\w가-힣.-]+/g, '_') || 'images'
  const zip = await zipStore(files)
  downloadBlob(zip, `${safe}-images.zip`)
}
