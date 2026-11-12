import type { CreatorProject } from './api'

const MAX_SNAPSHOT = 8 * 1024 * 1024
export function projectFingerprint(project: CreatorProject | null) {
  return project ? JSON.stringify({ ...project, updatedAt: '' }) : ''
}
export function validateSnapshot(value: unknown, id: string): CreatorProject {
  const p = value as CreatorProject
  if (!p || p.id !== id || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80 ||
    typeof p.author !== 'string' || typeof p.version !== 'string' || typeof p.champion !== 'string' ||
    typeof p.description !== 'string' || typeof p.createdAt !== 'string' || typeof p.updatedAt !== 'string' ||
    !Number.isInteger(p.skinNum) || p.skinNum < 0 || !Array.isArray(p.tags) || p.tags.some(t => typeof t !== 'string') ||
    !Array.isArray(p.files) || p.files.length > 200 || p.files.some(f => !f ||
      typeof f.relativePath !== 'string' || !/^[\w./-]+$/.test(f.relativePath) ||
      f.relativePath.split('/').some(part => !part || part.startsWith('.')) ||
      !Number.isSafeInteger(f.sizeBytes) || f.sizeBytes < 0 || typeof f.dataBase64 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(f.sha256) || typeof f.formatType !== 'string') ||
    new TextEncoder().encode(JSON.stringify(p)).length > MAX_SNAPSHOT) throw Error('Invalid or oversized project recovery data.')
  return p
}

interface Snapshot { version: 1; revision: number; project: CreatorProject }
let connection: Promise<IDBDatabase> | undefined
function database() {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('laap-creator-recovery', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'project.id' })
    request.onerror = () => { connection = undefined; reject(request.error) }
    request.onsuccess = () => resolve(request.result)
    request.onblocked = () => { connection = undefined; reject(Error('Recovery storage is blocked by another window.')) }
  })
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', mode)
    const request = action(tx.objectStore('drafts'))
    tx.oncomplete = () => resolve(request.result)
    tx.onabort = tx.onerror = () => reject(tx.error ?? request.error ?? Error('Recovery storage failed.'))
  })
}
export async function readRecovery(id: string): Promise<CreatorProject | null> {
  const snapshot = await transaction<Snapshot | undefined>('readonly', store => store.get(id))
  if (!snapshot) return null
  if (snapshot.version !== 1 || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1)
    throw Error('Unsupported project recovery snapshot.')
  return validateSnapshot(snapshot.project, id)
}
export const removeRecovery = (id: string) => transaction('readwrite', store => store.delete(id))
export async function removeSavedRecovery(project: CreatorProject) {
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite')
    const store = tx.objectStore('drafts')
    const request = store.get(project.id)
    request.onsuccess = () => {
      const snapshot = request.result as Snapshot | undefined
      if (snapshot && projectFingerprint(snapshot.project) === projectFingerprint(project)) store.delete(project.id)
    }
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(tx.error ?? Error('Recovery cleanup failed.'))
  })
}
export async function writeRecovery(project: CreatorProject, revision: number) {
  validateSnapshot(project, project.id)
  await transaction('readwrite', store => store.put({ version: 1, revision, project } satisfies Snapshot))
}

/** One native write at a time. A failed write cannot poison the next retry. */
export class ProjectSaveQueue {
  private tail: Promise<unknown> = Promise.resolve()
  private readonly save: (project: CreatorProject) => Promise<CreatorProject>
  constructor(save: (project: CreatorProject) => Promise<CreatorProject>) { this.save = save }
  enqueue(project: CreatorProject) {
    const snapshot = structuredClone(project)
    const next = this.tail.catch(() => {}).then(() => this.save(snapshot))
    this.tail = next
    return next
  }
}
