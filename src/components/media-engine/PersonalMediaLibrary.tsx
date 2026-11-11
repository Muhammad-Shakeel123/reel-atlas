import { Bookmark, Clock3, Film, FolderOpen, Heart, ListPlus, Play, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, RefObject } from 'react'
import { createDefaultSelection, createFileSelection, createUrlSelection, safeSourceLabel } from './source'
import type { MediaSelection, MediaSourceKind } from './source'
import { canPersistResumeForSource, fileSessionId, getResumeStorageKey, readSavedResume, RESUME_UPDATED_EVENT } from './resume-storage'

type LibraryItem = {
  id: string
  kind: MediaSourceKind
  title: string
  label: string
  type: string
  src?: string
  playbackId?: string
  lastOpened: number | null
  lastPlayed: number | null
  duration: number | null
  position: number | null
  width: number | null
  height: number | null
  favorite: boolean
  sessionOnly?: boolean
  source?: MediaSelection
}

type LibraryData = {
  items: LibraryItem[]
  playlists: Playlist[]
}

type PlaylistEntry = {
  id: string
  kind: 'mux' | 'hls' | 'url'
  title: string
  label: string
  type: string
  src?: string
  playbackId?: string
  duration: number | null
}

type Playlist = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  items: PlaylistEntry[]
}

export type PlaylistNavigation = {
  playlistName: string
  items: Array<{ id: string; title: string; source: MediaSelection }>
  currentIndex: number
}

type Props = {
  source: MediaSelection
  videoRef: RefObject<HTMLVideoElement | null>
  onSelect: (source: MediaSelection) => void
  onPlaylistSelect: (source: MediaSelection, navigation: PlaylistNavigation) => void
}

const STORAGE_KEY = 'reel-atlas:library:v1'
const EMPTY_LIBRARY: LibraryData = { items: [], playlists: [] }
const MAX_ITEMS = 100
const MAX_PLAYLISTS = 50
const MAX_PLAYLIST_ITEMS = 100
const VIDEO_EXTENSIONS = /\.(?:mp4|m4v|webm|mov|mkv|avi|ogv|ogg|ts|3gp|flv|wmv|vob|asf)$/i

function isSafePersistentSource(source: MediaSelection) {
  return canPersistResumeForSource(source)
}

function displayLabel(source: MediaSelection) {
  if (source.kind === 'file') return safeSourceLabel(source)
  if (source.kind === 'mux') return source.label || 'Mux video'
  try {
    return new URL(source.src).hostname
  } catch {
    return source.label
  }
}

function itemFromSource(source: MediaSelection, identity: string, previous?: LibraryItem): LibraryItem {
  const now = Date.now()
  const canPersist = isSafePersistentSource(source) && !identity.startsWith('memory:')
  return {
    id: identity,
    kind: source.kind,
    title: source.kind === 'file' ? source.fileName ?? 'Local video' : source.label || displayLabel(source),
    label: displayLabel(source),
    type: source.type,
    ...(source.kind === 'mux' && source.playbackId ? { playbackId: source.playbackId } : {}),
    ...((source.kind === 'url' || source.kind === 'hls') && canPersist ? { src: source.src } : {}),
    lastOpened: now,
    lastPlayed: previous?.lastPlayed ?? null,
    duration: previous?.duration ?? null,
    position: previous?.position ?? null,
    width: previous?.width ?? null,
    height: previous?.height ?? null,
    favorite: previous?.favorite ?? false,
    sessionOnly: !canPersist,
    ...(source.kind === 'file' || !isSafePersistentSource(source) ? { source } : {}),
  }
}

function isLibraryItem(value: unknown): value is LibraryItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  if (
    typeof item.id !== 'string'
    || !item.id
    || (item.kind !== 'mux' && item.kind !== 'hls' && item.kind !== 'url')
    || typeof item.title !== 'string'
    || typeof item.label !== 'string'
    || typeof item.type !== 'string'
    || typeof item.favorite !== 'boolean'
    || (item.lastOpened !== null && (typeof item.lastOpened !== 'number' || !Number.isFinite(item.lastOpened)))
    || (item.lastPlayed !== null && (typeof item.lastPlayed !== 'number' || !Number.isFinite(item.lastPlayed)))
    || (item.duration !== null && (typeof item.duration !== 'number' || !Number.isFinite(item.duration) || item.duration <= 0))
    || (item.position !== null && (typeof item.position !== 'number' || !Number.isFinite(item.position) || item.position < 0))
    || (item.width !== null && (typeof item.width !== 'number' || !Number.isFinite(item.width) || item.width <= 0))
    || (item.height !== null && (typeof item.height !== 'number' || !Number.isFinite(item.height) || item.height <= 0))
  ) return false
  if (item.kind === 'mux') return typeof item.playbackId === 'string' && /^[a-z0-9_-]{8,}$/i.test(item.playbackId)
  if ((item.kind !== 'url' && item.kind !== 'hls') || typeof item.src !== 'string') return false
  return canPersistResumeForSource({
    id: item.id,
    kind: item.kind,
    label: item.label,
    src: item.src,
    type: item.type,
  })
}

function isPlaylistEntry(value: unknown): value is PlaylistEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  if (
    typeof entry.id !== 'string'
    || !entry.id
    || (entry.kind !== 'mux' && entry.kind !== 'hls' && entry.kind !== 'url')
    || typeof entry.title !== 'string'
    || typeof entry.label !== 'string'
    || typeof entry.type !== 'string'
    || (entry.duration !== null && (typeof entry.duration !== 'number' || !Number.isFinite(entry.duration) || entry.duration <= 0))
  ) return false
  if (entry.kind === 'mux') {
    return typeof entry.playbackId === 'string'
      && /^[a-z0-9_-]{8,}$/i.test(entry.playbackId)
      && canPersistResumeForSource({
        id: entry.id,
        kind: 'mux',
        label: entry.label,
        src: `https://stream.mux.com/${entry.playbackId}.m3u8`,
        type: entry.type,
        playbackId: entry.playbackId,
      })
  }
  return typeof entry.src === 'string' && canPersistResumeForSource({
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    src: entry.src,
    type: entry.type,
  })
}

function isPlaylist(value: unknown): value is Playlist {
  if (typeof value !== 'object' || value === null) return false
  const playlist = value as Record<string, unknown>
  if (
    typeof playlist.id !== 'string'
    || !playlist.id
    || typeof playlist.name !== 'string'
    || !playlist.name.trim()
    || typeof playlist.createdAt !== 'number'
    || !Number.isFinite(playlist.createdAt)
    || typeof playlist.updatedAt !== 'number'
    || !Number.isFinite(playlist.updatedAt)
    || !Array.isArray(playlist.items)
    || playlist.items.length > MAX_PLAYLIST_ITEMS
    || !playlist.items.every(isPlaylistEntry)
  ) return false
  const itemIds = playlist.items.map((item) => item.id)
  return new Set(itemIds).size === itemIds.length
}

function parseLibrary(value: unknown): LibraryData | null {
  if (typeof value !== 'object' || value === null || !('items' in value) || !Array.isArray(value.items)) return null
  if (value.items.length > MAX_ITEMS || !value.items.every(isLibraryItem)) return null
  const ids = value.items.map((item) => item.id)
  if (new Set(ids).size !== ids.length) return null
  const playlists = 'playlists' in value ? value.playlists : []
  if (
    !Array.isArray(playlists)
    || playlists.length > MAX_PLAYLISTS
    || !playlists.every(isPlaylist)
  ) return null
  const names = playlists.map((playlist) => playlist.name.trim().toLocaleLowerCase())
  const playlistIds = playlists.map((playlist) => playlist.id)
  return new Set(names).size === names.length && new Set(playlistIds).size === playlistIds.length
    ? { items: value.items, playlists }
    : null
}

function loadLibrary() {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return {
      library: EMPTY_LIBRARY,
      persistentStorage: false,
      storageMessage: 'Browser storage is unavailable. The library will be kept only for this page session.',
    }
  }
  if (!raw) return { library: EMPTY_LIBRARY, persistentStorage: true, storageMessage: '' }
  try {
    const parsed: unknown = JSON.parse(raw)
    const library = parseLibrary(parsed)
    if (library) return { library, persistentStorage: true, storageMessage: '' }
    return {
      library: EMPTY_LIBRARY,
      persistentStorage: false,
      storageMessage: 'Saved library data could not be read. Existing data was left unchanged; this session will not overwrite it.',
    }
  } catch {
    return {
      library: EMPTY_LIBRARY,
      persistentStorage: false,
      storageMessage: 'Saved library data is corrupted. Existing data was left unchanged; this session will not overwrite it.',
    }
  }
}

function formatTime(seconds: number) {
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainder = total % 60
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}

function formatDate(timestamp: number | null) {
  if (!timestamp || !Number.isFinite(timestamp)) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}

function sourceFromItem(item: LibraryItem): MediaSelection {
  if (item.kind === 'file') {
    if (item.source?.file) return createFileSelection(item.source.file)
    throw new Error('This local file is no longer available. Choose the file again from your device.')
  }
  if (item.source) return { ...item.source, id: crypto.randomUUID() }
  if (item.kind === 'mux' && item.playbackId) {
    const selection = createDefaultSelection(item.playbackId)
    return { ...selection, id: crypto.randomUUID(), label: item.title }
  }
  if (!item.src) throw new Error('This saved source cannot be reopened. Choose the media again from your device.')
  return { ...createUrlSelection(item.src), id: crypto.randomUUID(), label: item.title }
}

function sourceFromPlaylistEntry(entry: PlaylistEntry): MediaSelection {
  if (entry.kind === 'mux' && entry.playbackId) {
    const selection = createDefaultSelection(entry.playbackId)
    return { ...selection, id: crypto.randomUUID(), label: entry.title }
  }
  if (!entry.src) throw new Error('This playlist source is unavailable. Remove it and add the media again.')
  return { ...createUrlSelection(entry.src), id: crypto.randomUUID(), label: entry.title }
}

function playlistEntryFromItem(item: LibraryItem): PlaylistEntry | null {
  if (item.sessionOnly) return null
  try {
    const source = sourceFromItem(item)
    if (
      (source.kind !== 'mux' && source.kind !== 'hls' && source.kind !== 'url')
      || !canPersistResumeForSource(source)
    ) return null
    return {
      id: item.id,
      kind: source.kind,
      title: item.title,
      label: item.label,
      type: source.type,
      ...(source.kind === 'mux' && source.playbackId ? { playbackId: source.playbackId } : {}),
      ...((source.kind === 'url' || source.kind === 'hls') ? { src: source.src } : {}),
      duration: item.duration,
    }
  } catch {
    return null
  }
}

function isVideoFile(file: File) {
  return file.type.toLowerCase().startsWith('video/') || VIDEO_EXTENSIONS.test(file.name)
}

function isDuplicatePlaylistName(playlists: Playlist[], name: string, exceptId?: string) {
  const normalized = name.trim().toLocaleLowerCase()
  return playlists.some((playlist) => playlist.id !== exceptId && playlist.name.trim().toLocaleLowerCase() === normalized)
}

function isResumable(progress: Awaited<ReturnType<typeof readSavedResume>>, knownDuration: number | null) {
  if (!progress || progress.position < 5 || progress.position >= progress.duration - Math.max(20, progress.duration * 0.05)) return false
  if (knownDuration && Math.abs(knownDuration - progress.duration) > Math.max(2, knownDuration * 0.05)) return false
  return true
}

export function PersonalMediaLibrary({ source, videoRef, onSelect, onPlaylistSelect }: Props) {
  const [initialLibrary] = useState(loadLibrary)
  const [library, setLibrary] = useState<LibraryData>(initialLibrary.library)
  const [persistentStorage, setPersistentStorage] = useState(initialLibrary.persistentStorage)
  const [storageMessage, setStorageMessage] = useState(initialLibrary.storageMessage)
  const [feedback, setFeedback] = useState('')
  const [resumeById, setResumeById] = useState<Record<string, boolean>>({})
  const [playlistName, setPlaylistName] = useState('')
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null)
  const [editingPlaylistName, setEditingPlaylistName] = useState('')
  const [addingItemId, setAddingItemId] = useState<string | null>(null)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('')
  const [folderFiles, setFolderFiles] = useState<File[]>([])
  const [folderName, setFolderName] = useState('')
  const [folderError, setFolderError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentIdentity = useRef<string | null>(null)
  const folderPickerWindow = window as Window & { showDirectoryPicker?: () => Promise<unknown> }
  const folderPickerSupported = typeof folderPickerWindow.showDirectoryPicker === 'function'
  const resumeCandidates = library.items.filter((item) => item.lastOpened !== null || item.favorite)
  const resumeCandidateKey = JSON.stringify(resumeCandidates.map((item) => [item.id, item.lastOpened !== null, item.favorite, item.duration]))
  const resumeCandidatesRef = useRef(resumeCandidates)

  useEffect(() => {
    resumeCandidatesRef.current = library.items.filter((item) => item.lastOpened !== null || item.favorite)
  }, [library.items])

  useEffect(() => {
    if (!persistentStorage) return
    try {
      const items = library.items.filter((item) => !item.sessionOnly && (item.lastOpened !== null || item.favorite))
        .slice(0, MAX_ITEMS)
        .map(({ id, kind, title, label, type, src, playbackId, lastOpened, lastPlayed, duration, position, width, height, favorite }) => ({
          id, kind, title, label, type, src, playbackId, lastOpened, lastPlayed, duration, position, width, height, favorite,
        }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, playlists: library.playlists }))
    } catch {
      window.setTimeout(() => {
        setPersistentStorage(false)
        setStorageMessage('Browser storage could not save the library. Existing entries remain available in this page session.')
      }, 0)
    }
  }, [library, persistentStorage])

  useEffect(() => {
    let active = true
    void getResumeStorageKey(source).then((resumeKey) => {
      if (!active) return
      const fileId = fileSessionId(source)
      const identity = fileId
        ? `session:${fileId}`
        : resumeKey && !resumeKey.startsWith('session:')
          ? `saved:${resumeKey}`
          : `memory:${source.id}`
      currentIdentity.current = identity
      setLibrary((current) => {
        const candidate = itemFromSource(source, identity, current.items.find((item) => item.id === identity))
        return { ...current, items: [candidate, ...current.items.filter((item) => item.id !== identity)].slice(0, MAX_ITEMS) }
      })
    }).catch(() => {
      if (!active) return
      const identity = `memory:${source.id}`
      currentIdentity.current = identity
      setLibrary((current) => {
        const candidate = itemFromSource(source, identity, current.items.find((item) => item.id === identity))
        return { ...current, items: [candidate, ...current.items.filter((item) => item.id !== identity)].slice(0, MAX_ITEMS) }
      })
    })
    return () => { active = false }
  }, [source])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let lastSavedPosition = -1
    const updateMetadataAt = (force = false) => {
      const identity = currentIdentity.current
      if (!identity) return
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null
      const position = Number.isFinite(video.currentTime) && video.currentTime >= 0 ? video.currentTime : null
      const width = video.videoWidth > 0 ? video.videoWidth : null
      const height = video.videoHeight > 0 ? video.videoHeight : null
      const positionBucket = position === null ? -1 : Math.floor(position / 5)
      if (!force && positionBucket === lastSavedPosition) return
      lastSavedPosition = positionBucket
      setLibrary((current) => ({
        ...current,
        items: current.items.map((item) => {
          if (item.id !== identity) return item
          if (item.duration === duration && item.position === position && item.width === width && item.height === height) return item
          return { ...item, duration, position, width, height }
        }),
      }))
    }
    const updateMetadata = () => updateMetadataAt()
    const markPlayed = () => {
      const identity = currentIdentity.current
      if (!identity) return
      const now = Date.now()
      setLibrary((current) => ({
        ...current,
        items: current.items.map((item) => item.id === identity ? { ...item, lastPlayed: now } : item),
      }))
      updateMetadataAt(true)
    }
    const updateMetadataFromDuration = () => updateMetadataAt(true)
    video.addEventListener('loadedmetadata', updateMetadataFromDuration)
    video.addEventListener('durationchange', updateMetadataFromDuration)
    video.addEventListener('timeupdate', updateMetadata)
    video.addEventListener('play', markPlayed)
    video.addEventListener('pause', updateMetadataFromDuration)
    video.addEventListener('ended', updateMetadataFromDuration)
    updateMetadataAt(true)
    return () => {
      video.removeEventListener('loadedmetadata', updateMetadataFromDuration)
      video.removeEventListener('durationchange', updateMetadataFromDuration)
      video.removeEventListener('timeupdate', updateMetadata)
      video.removeEventListener('play', markPlayed)
      video.removeEventListener('pause', updateMetadataFromDuration)
      video.removeEventListener('ended', updateMetadataFromDuration)
    }
  }, [source.id, videoRef])

  useEffect(() => {
    let active = true
    const refreshResume = () => {
      void Promise.all(resumeCandidatesRef.current.map(async (item) => {
        const itemSource = item.source ?? (() => {
          try { return sourceFromItem(item) } catch { return null }
        })()
        if (!itemSource) return [item.id, false] as const
        try {
          const progress = await readSavedResume(itemSource)
          return [item.id, isResumable(progress, item.duration)] as const
        } catch {
          return [item.id, false] as const
        }
      })).then((entries) => {
        if (!active) return
        const next = Object.fromEntries(entries)
        setResumeById((previous) => {
          const nextKeys = Object.keys(next)
          return nextKeys.length === Object.keys(previous).length && nextKeys.every((key) => previous[key] === next[key])
            ? previous
            : next
        })
      })
    }
    refreshResume()
    window.addEventListener(RESUME_UPDATED_EVENT, refreshResume)
    const timer = window.setInterval(refreshResume, 15_000)
    return () => {
      active = false
      window.removeEventListener(RESUME_UPDATED_EVENT, refreshResume)
      window.clearInterval(timer)
    }
  }, [resumeCandidateKey])

  const orderedRecent = useMemo(() => library.items
    .filter((item) => item.lastOpened !== null)
    .sort((first, second) => (second.lastPlayed ?? second.lastOpened ?? 0) - (first.lastPlayed ?? first.lastOpened ?? 0)), [library.items])
  const orderedFavorites = useMemo(() => library.items
    .filter((item) => item.favorite)
    .sort((first, second) => (second.lastPlayed ?? second.lastOpened ?? 0) - (first.lastPlayed ?? first.lastOpened ?? 0)), [library.items])
  const orderedPlaylists = useMemo(() => [...library.playlists]
    .sort((first, second) => second.updatedAt - first.updatedAt), [library.playlists])

  const createPlaylist = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = playlistName.trim()
    if (!name) {
      setFeedback('Enter a playlist name.')
      return
    }
    if (isDuplicatePlaylistName(library.playlists, name)) {
      setFeedback('A playlist with that name already exists.')
      return
    }
    if (library.playlists.length >= MAX_PLAYLISTS) {
      setFeedback(`You can create up to ${MAX_PLAYLISTS} playlists.`)
      return
    }
    const now = Date.now()
    const playlist: Playlist = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now, items: [] }
    setLibrary((current) => ({ ...current, playlists: [playlist, ...current.playlists] }))
    setPlaylistName('')
    setFeedback(`${name} playlist created.`)
  }

  const renamePlaylist = (playlistId: string, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = editingPlaylistName.trim()
    if (!name) {
      setFeedback('Enter a playlist name.')
      return
    }
    if (isDuplicatePlaylistName(library.playlists, name, playlistId)) {
      setFeedback('A playlist with that name already exists.')
      return
    }
    setLibrary((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) => playlist.id === playlistId
        ? { ...playlist, name, updatedAt: Date.now() }
        : playlist),
    }))
    setEditingPlaylistId(null)
    setFeedback(`Playlist renamed to ${name}.`)
  }

  const deletePlaylist = (playlist: Playlist) => {
    if (!window.confirm(`Delete the playlist “${playlist.name}”? Its media will remain in your library.`)) return
    setLibrary((current) => ({ ...current, playlists: current.playlists.filter((candidate) => candidate.id !== playlist.id) }))
    setFeedback(`${playlist.name} playlist deleted. Its media was not deleted.`)
  }

  const addItemToPlaylist = (item: LibraryItem) => {
    const entry = playlistEntryFromItem(item)
    if (!entry) {
      setFeedback('This session-only or unsafe source cannot be saved to a playlist.')
      return
    }
    const target = library.playlists.find((playlist) => playlist.id === selectedPlaylistId)
    if (!target) {
      setFeedback('Choose a playlist first.')
      return
    }
    if (target.items.some((candidate) => candidate.id === entry.id)) {
      setFeedback(`${item.title} is already in ${target.name}.`)
      return
    }
    if (target.items.length >= MAX_PLAYLIST_ITEMS) {
      setFeedback(`${target.name} can contain up to ${MAX_PLAYLIST_ITEMS} items.`)
      return
    }
    setLibrary((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) => playlist.id === target.id
        ? { ...playlist, items: [...playlist.items, entry], updatedAt: Date.now() }
        : playlist),
    }))
    setAddingItemId(null)
    setFeedback(`${item.title} added to ${target.name}.`)
  }

  const removePlaylistEntry = (playlist: Playlist, entry: PlaylistEntry) => {
    setLibrary((current) => ({
      ...current,
      playlists: current.playlists.map((candidate) => candidate.id === playlist.id
        ? { ...candidate, items: candidate.items.filter((item) => item.id !== entry.id), updatedAt: Date.now() }
        : candidate),
    }))
    setFeedback(`${entry.title} removed from ${playlist.name}.`)
  }

  const openPlaylistEntry = (playlist: Playlist, entryIndex: number) => {
    try {
      const entries = playlist.items.map((item) => ({
        id: item.id,
        title: item.title,
        source: sourceFromPlaylistEntry(item),
      }))
      const entry = entries[entryIndex]
      if (!entry) {
        setFeedback('This playlist item is no longer available.')
        return
      }
      onPlaylistSelect(entry.source, { playlistName: playlist.name, items: entries, currentIndex: entryIndex })
      setFeedback(`Opened ${entry.title} from ${playlist.name}.`)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'This playlist source could not be opened.')
    }
  }

  const openFolder = async () => {
    const picker = folderPickerWindow.showDirectoryPicker
    if (!picker) {
      fileInputRef.current?.click()
      return
    }
    setFolderError('')
    try {
      const handle = await picker.call(window)
      if (typeof handle !== 'object' || handle === null || !('values' in handle) || typeof handle.values !== 'function') {
        throw new Error('This browser returned an unsupported folder handle.')
      }
      const values = (handle.values as () => AsyncIterable<unknown>).call(handle)
      const files: File[] = []
      for await (const entry of values) {
        if (typeof entry !== 'object' || entry === null || !('kind' in entry) || entry.kind !== 'file' || !('name' in entry) || typeof entry.name !== 'string' || !('getFile' in entry) || typeof entry.getFile !== 'function') continue
        const file = await (entry.getFile as () => Promise<File>).call(entry)
        if (isVideoFile(file)) files.push(file)
      }
      setFolderFiles(files.sort((first, second) => first.name.localeCompare(second.name)))
      setFolderName(typeof handle === 'object' && 'name' in handle && typeof handle.name === 'string' ? handle.name : 'Selected folder')
      setFolderError(files.length ? '' : 'No supported video files were found at the top level of that folder.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setFolderError(error instanceof Error ? `${error.message} You can choose video files individually instead.` : 'The folder could not be read. You can choose video files individually instead.')
    }
  }

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []).filter(isVideoFile)
    setFolderFiles(files.sort((first, second) => first.name.localeCompare(second.name)))
    setFolderName(files.length ? 'Selected files' : '')
    setFolderError(files.length ? '' : 'No supported video files were selected.')
    event.currentTarget.value = ''
  }

  const openLocalFile = (file: File) => {
    try {
      onSelect(createFileSelection(file))
      setFeedback(`Opened ${file.name}. This local source is available for this session only.`)
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : 'This video could not be opened.')
    }
  }

  const setFavorite = useCallback((item: LibraryItem, favorite: boolean) => {
    setLibrary((current) => ({
      ...current,
      items: current.items.flatMap((candidate) => {
        if (candidate.id !== item.id) return [candidate]
        const updated = { ...candidate, favorite }
        return !favorite && updated.lastOpened === null ? [] : [updated]
      }),
    }))
    setFeedback(favorite ? `${item.title} added to favorites.` : `${item.title} removed from favorites.`)
  }, [])

  const removeRecent = useCallback((item: LibraryItem) => {
    setLibrary((current) => ({
      ...current,
      items: current.items.flatMap((candidate) => {
        if (candidate.id !== item.id) return [candidate]
        if (candidate.favorite) return [{ ...candidate, lastOpened: null }]
        return []
      }),
    }))
    setFeedback(`${item.title} removed from recent media.`)
  }, [])

  const openItem = useCallback((item: LibraryItem) => {
    try {
      onSelect(sourceFromItem(item))
      setFeedback(`Opened ${item.title}.`)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'This source cannot be reopened.')
    }
  }, [onSelect])

  const renderItem = (item: LibraryItem, isFavoriteList = false) => {
    const resumeAvailable = Boolean(resumeById[item.id])
    const playlistEntry = playlistEntryFromItem(item)
    const itemRowKey = `${isFavoriteList ? 'favorite' : 'recent'}:${item.id}`
    return (
      <li className="media-library-item" key={itemRowKey}>
        <div className="media-library-item-main">
          <span aria-hidden="true" className="media-library-item-icon"><Film size={15} /></span>
          <div className="media-library-item-copy">
            <strong>{item.title}</strong>
            <span>{item.label} · {item.kind.toUpperCase()}</span>
            <small>
              {item.lastPlayed ? `Played ${formatDate(item.lastPlayed)}` : item.lastOpened ? `Opened ${formatDate(item.lastOpened)}` : 'Favorite'}
              {item.duration ? ` · ${formatTime(item.duration)}` : ''}
              {item.width && item.height ? ` · ${item.width} × ${item.height}` : ''}
            </small>
            {item.duration && item.position !== null && (
              <span className="media-library-progress" aria-label={`Playback progress ${Math.min(100, Math.round(item.position / item.duration * 100))}%`}>
                <i style={{ width: `${Math.min(100, Math.max(0, item.position / item.duration * 100))}%` }} />
              </span>
            )}
          </div>
        </div>
        <div className="media-library-item-actions">
          <button aria-label={`Open ${item.title}`} onClick={() => openItem(item)} type="button"><Play size={14} aria-hidden="true" /><span>Open</span></button>
          {resumeAvailable && (
            <button aria-label={`Open ${item.title} and check saved resume position`} onClick={() => openItem(item)} type="button">
              <Clock3 size={14} aria-hidden="true" /><span>Resume</span>
            </button>
          )}
          <button aria-pressed={item.favorite} aria-label={`${item.favorite ? 'Remove' : 'Add'} ${item.title} ${item.favorite ? 'from' : 'to'} favorites`} onClick={() => setFavorite(item, !item.favorite)} type="button">
            <Heart size={14} aria-hidden="true" /><span>{item.favorite ? 'Favorited' : 'Favorite'}</span>
          </button>
          {!isFavoriteList && (
            <button aria-label={`Remove ${item.title} from recent media`} onClick={() => removeRecent(item)} type="button"><Trash2 size={14} aria-hidden="true" /><span>Remove</span></button>
          )}
          <button
            aria-expanded={addingItemId === itemRowKey}
            aria-label={!playlistEntry
              ? `Cannot add ${item.title} to a playlist because this source is session-only or unsafe to persist`
              : !orderedPlaylists.length
                ? `Create a playlist before adding ${item.title}`
                : `Add ${item.title} to a playlist`}
            disabled={!playlistEntry || !orderedPlaylists.length}
            onClick={() => {
              setSelectedPlaylistId(orderedPlaylists[0]?.id ?? '')
              setAddingItemId((current) => current === itemRowKey ? null : itemRowKey)
            }}
            title={!playlistEntry ? 'Session-only or unsafe sources cannot be saved to playlists.' : !orderedPlaylists.length ? 'Create a playlist first.' : undefined}
            type="button"
          ><ListPlus size={14} aria-hidden="true" /><span>Add to playlist</span></button>
        </div>
        {addingItemId === itemRowKey && playlistEntry && (
          <form className="media-library-add-form" onSubmit={(event) => { event.preventDefault(); addItemToPlaylist(item) }}>
            <label>
              <span className="visually-hidden">Choose playlist for {item.title}</span>
              <select onChange={(event) => setSelectedPlaylistId(event.target.value)} value={selectedPlaylistId}>
                {orderedPlaylists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
              </select>
            </label>
            <button type="submit"><Plus size={13} aria-hidden="true" /> Add</button>
          </form>
        )}
        {!playlistEntry && <p className="media-library-ineligible">This session-only or unsafe source cannot be saved to a playlist.</p>}
      </li>
    )
  }

  return (
    <section aria-labelledby="media-library-title" className="personal-media-library">
      <details open>
        <summary>
          <span aria-hidden="true" className="media-library-icon"><Bookmark size={17} /></span>
          <span className="media-library-summary"><strong id="media-library-title">Personal media library</strong><small>Recent sources and favorites, stored on this device</small></span>
          <span className="media-library-count">{orderedRecent.length} recent · {orderedFavorites.length} favorites · {orderedPlaylists.length} playlists</span>
        </summary>
        <div className="media-library-body">
          {!persistentStorage && <p className="media-library-notice" role="status">{storageMessage}</p>}
          {orderedRecent.length ? (
            <section aria-labelledby="media-library-recent-title">
              <h3 id="media-library-recent-title">Recently played</h3>
              <ul className="media-library-list">{orderedRecent.map((item) => renderItem(item))}</ul>
            </section>
          ) : (
            <p className="media-library-empty">No recent media yet. Open a source to see it here.</p>
          )}
          <section aria-labelledby="media-library-favorites-title">
            <h3 id="media-library-favorites-title">Favorites</h3>
            {orderedFavorites.length
              ? <ul className="media-library-list">{orderedFavorites.map((item) => renderItem(item, true))}</ul>
              : <p className="media-library-empty">No favorites yet. Add a source here with its Favorite action.</p>}
          </section>
          <section aria-labelledby="media-library-playlists-title">
            <div className="media-library-section-heading">
              <h3 id="media-library-playlists-title">Playlists</h3>
              <span>{orderedPlaylists.length} saved</span>
            </div>
            <form className="media-library-create-form" onSubmit={createPlaylist}>
              <label>
                <span className="visually-hidden">New playlist name</span>
                <input maxLength={60} onChange={(event) => setPlaylistName(event.target.value)} placeholder="Name a playlist" value={playlistName} />
              </label>
              <button type="submit"><Plus size={14} aria-hidden="true" /> Create playlist</button>
            </form>
            {orderedPlaylists.length ? (
              <ul className="media-library-playlists">
                {orderedPlaylists.map((playlist) => (
                  <li className="media-library-playlist" key={playlist.id}>
                    <div className="media-library-playlist-heading">
                      <div>
                        <h4>{playlist.name}</h4>
                        <small>{playlist.items.length} {playlist.items.length === 1 ? 'title' : 'titles'} · Updated {formatDate(playlist.updatedAt)}</small>
                      </div>
                      <div className="media-library-playlist-actions">
                        <button onClick={() => { setEditingPlaylistId(playlist.id); setEditingPlaylistName(playlist.name) }} type="button">Rename</button>
                        <button className="media-library-delete" onClick={() => deletePlaylist(playlist)} type="button">Delete</button>
                      </div>
                    </div>
                    {editingPlaylistId === playlist.id && (
                      <form className="media-library-rename-form" onSubmit={(event) => renamePlaylist(playlist.id, event)}>
                        <label>
                          <span className="visually-hidden">Rename {playlist.name}</span>
                          <input autoFocus maxLength={60} onChange={(event) => setEditingPlaylistName(event.target.value)} value={editingPlaylistName} />
                        </label>
                        <button type="submit">Save</button>
                        <button onClick={() => setEditingPlaylistId(null)} type="button">Cancel</button>
                      </form>
                    )}
                    {playlist.items.length ? (
                      <ul className="media-library-playlist-items">
                        {playlist.items.map((entry, entryIndex) => (
                          <li key={entry.id}>
                            <span className="media-library-playlist-copy">
                              <strong>{entry.title}</strong>
                              <small>{entry.label}{entry.duration ? ` · ${formatTime(entry.duration)}` : ''}</small>
                            </span>
                            <span className="media-library-playlist-item-actions">
                              <button aria-label={`Open ${entry.title} from ${playlist.name}`} onClick={() => openPlaylistEntry(playlist, entryIndex)} type="button"><Play size={13} aria-hidden="true" /> Open</button>
                              <button aria-label={`Remove ${entry.title} from ${playlist.name}`} onClick={() => removePlaylistEntry(playlist, entry)} type="button"><Trash2 size={13} aria-hidden="true" /> Remove</button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="media-library-empty">This playlist is empty. Add eligible recent or favorite media above.</p>}
                  </li>
                ))}
              </ul>
            ) : <p className="media-library-empty">No playlists yet. Create one to organize eligible saved media.</p>}
          </section>
          <section aria-labelledby="media-library-folder-title" className="media-library-folder">
            <div className="media-library-section-heading">
              <h3 id="media-library-folder-title">Browse a local folder</h3>
              <span>Session only</span>
            </div>
            <div className="media-library-folder-actions">
              <button onClick={() => folderPickerSupported ? void openFolder() : fileInputRef.current?.click()} type="button">
                <FolderOpen size={14} aria-hidden="true" /> {folderPickerSupported ? 'Choose folder' : 'Choose video files'}
              </button>
              {folderPickerSupported && <button className="media-library-folder-fallback" onClick={() => fileInputRef.current?.click()} type="button">Choose files instead</button>}
              <input
                accept="video/*,.mp4,.m4v,.webm,.mov,.mkv,.avi,.ogv,.ts,.3gp,.flv,.wmv,.vob,.asf"
                aria-label="Choose local video files"
                className="visually-hidden"
                multiple
                onChange={handleFileInput}
                ref={fileInputRef}
                tabIndex={-1}
                type="file"
              />
            </div>
            <p className="media-library-folder-note">
              {folderPickerSupported
                ? 'Folder selection is browser-supported here. Only top-level video files are listed; files are not uploaded and folder permissions are not saved. Select the folder again after a refresh.'
                : 'This browser does not support folder selection here. Choose video files individually; they are not uploaded and remain available for this session only.'}
            </p>
            {folderName && <p className="media-library-folder-name">{folderName} · {folderFiles.length} video {folderFiles.length === 1 ? 'file' : 'files'}</p>}
            {folderFiles.length > 0 && (
              <ul className="media-library-folder-files">
                {folderFiles.map((file, index) => (
                  <li key={`${file.name}:${file.size}:${file.lastModified}:${index}`}>
                    <span>{file.name}</span>
                    <button onClick={() => openLocalFile(file)} type="button"><Play size={13} aria-hidden="true" /> Open</button>
                  </li>
                ))}
              </ul>
            )}
            <p aria-live="polite" className="media-library-folder-error" role="status">{folderError}</p>
          </section>
          <p className="media-library-privacy">
            Library and playlist details stay in browser storage on this device when the source has a safe, stable identity. URLs with credentials, query strings, fragments, or token-like paths and local files remain session-only; local files must be selected again after reload. Resume availability comes from Advanced Playback Studio’s saved position.
          </p>
          <p aria-live="polite" className="media-library-feedback">{feedback}</p>
        </div>
      </details>
    </section>
  )
}
