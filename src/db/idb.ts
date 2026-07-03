import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { GroupType, StoredImage, GridLayout } from '../types'

interface GridsmithDB extends DBSchema {
  types: {
    key: string
    value: GroupType
  }
  images: {
    key: string
    value: StoredImage
    indexes: { byType: string }
  }
  layouts: {
    key: string
    value: GridLayout
  }
}

let dbPromise: Promise<IDBPDatabase<GridsmithDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<GridsmithDB>('gridsmith', 1, {
      upgrade(db) {
        db.createObjectStore('types', { keyPath: 'id' })
        const images = db.createObjectStore('images', { keyPath: 'id' })
        images.createIndex('byType', 'typeId')
        db.createObjectStore('layouts', { keyPath: 'typeId' })
      },
    })
  }
  return dbPromise
}

// --- types ---

export async function getTypes(): Promise<GroupType[]> {
  const db = await getDB()
  const all = await db.getAll('types')
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function putType(type: GroupType): Promise<void> {
  const db = await getDB()
  await db.put('types', type)
}

/** 유형 삭제 시 해당 유형의 이미지·레이아웃까지 cascade 정리. */
export async function deleteType(typeId: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['types', 'images', 'layouts'], 'readwrite')
  await tx.objectStore('types').delete(typeId)
  await tx.objectStore('layouts').delete(typeId)
  const imgStore = tx.objectStore('images')
  const keys = await imgStore.index('byType').getAllKeys(typeId)
  for (const key of keys) await imgStore.delete(key)
  await tx.done
}

// --- images ---

export async function getImages(typeId: string): Promise<StoredImage[]> {
  const db = await getDB()
  return db.getAllFromIndex('images', 'byType', typeId)
}

/** 백업용: 전 유형의 이미지를 한꺼번에 조회. */
export async function getAllImages(): Promise<StoredImage[]> {
  const db = await getDB()
  return db.getAll('images')
}

export async function putImage(image: StoredImage): Promise<void> {
  const db = await getDB()
  await db.put('images', image)
}

export async function deleteImage(imageId: string): Promise<void> {
  const db = await getDB()
  await db.delete('images', imageId)
}

// --- layouts ---

export async function getLayout(typeId: string): Promise<GridLayout | undefined> {
  const db = await getDB()
  return db.get('layouts', typeId)
}

/** 백업용: 전 유형의 레이아웃을 한꺼번에 조회. */
export async function getAllLayouts(): Promise<GridLayout[]> {
  const db = await getDB()
  return db.getAll('layouts')
}

export async function putLayout(layout: GridLayout): Promise<void> {
  const db = await getDB()
  await db.put('layouts', layout)
}
