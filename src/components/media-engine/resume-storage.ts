import type { MediaSelection } from './source'

export type SavedResume = {
  position: number
  duration: number
}

const REPEAT_PROGRESS_PREFIX = 'reel-atlas:resume:v1:'
const RESUME_SALT_KEY = 'reel-atlas:resume-salt:v1'
const sessionResume = new Map<string, SavedResume>()
export const RESUME_UPDATED_EVENT = 'reel-atlas:resume-updated'

function hasTokenLikePath(url: URL) {
  return url.pathname.split('/').some((part) => {
    let segment: string
    try { segment = decodeURIComponent(part) } catch { return true }
    return /^[a-z0-9_-]{32,}$/i.test(segment) || /^(?:token|signature|sig|auth|api[_-]?key)[=_-]/i.test(segment)
  })
}

export function canPersistResumeForSource(source: MediaSelection) {
  if (source.kind !== 'url' && source.kind !== 'hls' && source.kind !== 'mux') return false
  try {
    const url = new URL(source.src)
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:')
      || url.search
      || url.hash
      || url.username
      || url.password
      || hasTokenLikePath(url)
    ) return false
    if (source.kind === 'mux') {
      return Boolean(source.playbackId && /^[a-z0-9_-]{8,}$/i.test(source.playbackId))
        && url.hostname === 'stream.mux.com'
        && url.pathname === `/${source.playbackId}.m3u8`
    }
    return true
  } catch {
    return false
  }
}

export function fileSessionId(source: MediaSelection) {
  if (source.kind !== 'file') return null
  return `${source.fileName ?? 'video'}|${source.fileSize ?? 0}|${source.fileLastModified ?? 0}`
}

export async function getResumeStorageKey(source: MediaSelection): Promise<string | null> {
  if (source.kind === 'file') return `session:${fileSessionId(source)}`
  if (!globalThis.crypto?.subtle) return null
  if (!canPersistResumeForSource(source)) return null
  const url = new URL(source.src)
  const identity = source.kind === 'mux' && source.playbackId
    ? `mux|${source.playbackId}`
    : `${url.origin}${url.pathname}`

  let salt = localStorage.getItem(RESUME_SALT_KEY)
  if (!salt) {
    const bytes = crypto.getRandomValues(new Uint8Array(24))
    salt = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(RESUME_SALT_KEY, salt)
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${identity}`))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${REPEAT_PROGRESS_PREFIX}${hex}`
}

export function readSessionResume(key: string) {
  return sessionResume.get(key) ?? null
}

export function writeSessionResume(key: string, value: SavedResume) {
  sessionResume.set(key, value)
  window.dispatchEvent(new Event(RESUME_UPDATED_EVENT))
}

export function removeSessionResume(key: string) {
  sessionResume.delete(key)
  window.dispatchEvent(new Event(RESUME_UPDATED_EVENT))
}

export function readPersistentResume(key: string): SavedResume | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || !('position' in value) || !('duration' in value)) return null
    const { position, duration } = value
    if (typeof position !== 'number' || typeof duration !== 'number' || !Number.isFinite(position) || !Number.isFinite(duration) || position < 0 || duration <= 0 || position >= duration) return null
    return { position, duration }
  } catch {
    return null
  }
}

export function writePersistentResume(key: string, value: SavedResume) {
  localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new Event(RESUME_UPDATED_EVENT))
}

export function removePersistentResume(key: string) {
  localStorage.removeItem(key)
  window.dispatchEvent(new Event(RESUME_UPDATED_EVENT))
}

export async function readSavedResume(source: MediaSelection): Promise<SavedResume | null> {
  const key = await getResumeStorageKey(source)
  if (!key) return null
  return key.startsWith('session:')
    ? readSessionResume(key)
    : readPersistentResume(key)
}
