import { Bookmark, ChevronDown, Clock3, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { SUBTITLE_CUES_CHANGED_EVENT } from './subtitle-utils'
import type { MediaSelection } from './source'

type BookmarkRecord = {
  id: string
  time: number
  title: string
}

type NoteRecord = {
  id: string
  time: number
  text: string
}

type MomentData = {
  bookmarks: BookmarkRecord[]
  notes: NoteRecord[]
}

type CueMarker = {
  id: string
  time: number
  label: string
  kind: 'chapter' | 'caption'
}

type SeekBounds = {
  start: number
  end: number
}

type Props = {
  source: MediaSelection
  videoRef: RefObject<HTMLVideoElement | null>
}

const STORAGE_PREFIX = 'reel-atlas:moments:v1:'
const MAX_BOOKMARK_TITLE = 80
const MAX_NOTE_LENGTH = 500
const EMPTY_DATA: MomentData = { bookmarks: [], notes: [] }

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainder = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}

function getSeekBounds(video: HTMLVideoElement): SeekBounds | null {
  if (video.seekable.length > 0) {
    const lastRange = video.seekable.length - 1
    return { start: video.seekable.start(0), end: video.seekable.end(lastRange) }
  }
  if (Number.isFinite(video.duration) && video.duration > 0) return { start: 0, end: video.duration }
  return null
}

function isValidData(value: unknown): value is MomentData {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const validItems = (items: unknown, key: 'title' | 'text', limit: number) => Array.isArray(items) && items.every((item) => {
    if (typeof item !== 'object' || item === null) return false
    const moment = item as Record<string, unknown>
    return typeof moment.id === 'string'
      && moment.id.length > 0
      && Number.isFinite(moment.time)
      && Number(moment.time) >= 0
      && typeof moment[key] === 'string'
      && moment[key].trim().length > 0
      && moment[key].length <= limit
  })
  const hasUniqueIds = (items: unknown) => Array.isArray(items)
    && new Set(items.flatMap((item) => typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'string' ? [item.id] : [])).size === items.length
  return validItems(record.bookmarks, 'title', MAX_BOOKMARK_TITLE)
    && validItems(record.notes, 'text', MAX_NOTE_LENGTH)
    && hasUniqueIds(record.bookmarks)
    && hasUniqueIds(record.notes)
}

function deriveIdentity(source: MediaSelection) {
  if (source.kind === 'file') {
    return `file|${source.fileName ?? ''}|${source.fileSize ?? 0}|${source.fileLastModified ?? 0}|${source.type}`
  }
  if (source.kind === 'mux' && source.playbackId) return `mux|${source.playbackId}`

  const url = new URL(source.src)
  if (url.search || url.hash || url.username || url.password) return null
  if (url.pathname.split('/').some((part) => /^[a-z0-9_-]{32,}$/i.test(part))) return null
  return `${source.kind}|${url.origin}${url.pathname}`
}

async function getStorageKey(source: MediaSelection): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null
  const identity = deriveIdentity(source)
  if (!identity) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${STORAGE_PREFIX}${hex}`
}

function readCueMarkers(video: HTMLVideoElement): CueMarker[] {
  const markers: CueMarker[] = []
  Array.from(video.textTracks).forEach((track, trackIndex) => {
    if (track.kind !== 'chapters' && track.kind !== 'captions' && track.kind !== 'subtitles') return
    Array.from(track.cues ?? []).forEach((cue, cueIndex) => {
      if (!Number.isFinite(cue.startTime) || cue.startTime < 0) return
      const text = 'text' in cue && typeof cue.text === 'string' ? cue.text.replace(/\s+/g, ' ').trim() : ''
      markers.push({
        id: `${trackIndex}:${cue.id || cueIndex}:${cue.startTime}`,
        time: cue.startTime,
        label: track.kind === 'chapters'
          ? text || `Chapter at ${formatTime(cue.startTime)}`
          : `${track.label || track.language || 'Subtitle'} at ${formatTime(cue.startTime)}${text ? `: ${text.slice(0, 100)}` : ''}`,
        kind: track.kind === 'chapters' ? 'chapter' : 'caption',
      })
    })
  })
  return markers.sort((first, second) => first.time - second.time)
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function MomentExplorer({ source, videoRef }: Props) {
  const [moments, setMoments] = useState<MomentData>(EMPTY_DATA)
  const [storageKey, setStorageKey] = useState<string | null>(null)
  const [storageReady, setStorageReady] = useState(false)
  const [storageNotice, setStorageNotice] = useState('')
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bounds, setBounds] = useState<SeekBounds | null>(null)
  const [bufferedRanges, setBufferedRanges] = useState<Array<[number, number]>>([])
  const [cueMarkers, setCueMarkers] = useState<CueMarker[]>([])
  const [bookmarkTitle, setBookmarkTitle] = useState('')
  const [noteText, setNoteText] = useState('')
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null)
  const [editingBookmarkTitle, setEditingBookmarkTitle] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editingNoteText, setEditingNoteText] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    let active = true

    void getStorageKey(source).then((key) => {
      if (!active) return
      if (!key) {
        setStorageNotice('This source may contain a private or signed URL. Moments will stay in memory and will not be saved to browser storage.')
        setStorageReady(true)
        return
      }

      try {
        const stored = localStorage.getItem(key)
        if (stored) {
          const parsed: unknown = JSON.parse(stored)
          if (isValidData(parsed)) setMoments(parsed)
          else {
            setStorageNotice('Saved moments had an unreadable format; they were left unchanged in storage.')
            setStorageReady(true)
            return
          }
        }
        setStorageKey(key)
      } catch {
        setStorageNotice('Browser storage is unavailable. Moments will remain available until this source is closed.')
      } finally {
        setStorageReady(true)
      }
    }).catch(() => {
      if (!active) return
      setStorageNotice('A private storage key could not be prepared. Moments will remain available until this source is closed.')
      setStorageReady(true)
    })
    return () => { active = false }
  }, [source])

  useEffect(() => {
    if (!storageReady || !storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(moments))
    } catch {
      window.setTimeout(() => {
        setStorageNotice('Browser storage could not save these moments. They will remain available until this source is closed.')
      }, 0)
    }
  }, [moments, storageKey, storageReady])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cueFrame = 0
    const refreshPlayback = () => {
      const nextDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
      setDuration(nextDuration)
      setTime(Number.isFinite(video.currentTime) && video.currentTime >= 0 ? video.currentTime : 0)
      const nextBounds = getSeekBounds(video)
      setBounds(nextBounds)
      const ranges: Array<[number, number]> = []
      for (let index = 0; index < video.buffered.length; index += 1) {
        ranges.push([video.buffered.start(index), video.buffered.end(index)])
      }
      setBufferedRanges(ranges)
    }
    const refreshCues = () => {
      if (cueFrame) window.cancelAnimationFrame(cueFrame)
      cueFrame = window.requestAnimationFrame(() => {
        cueFrame = 0
        setCueMarkers(readCueMarkers(video))
      })
    }
    const trackElements = new Set<HTMLTrackElement>()
    const watchTrackElements = () => {
      trackElements.forEach((element) => {
        if (video.contains(element)) return
        element.removeEventListener('load', refreshCues)
        element.removeEventListener('error', refreshCues)
        trackElements.delete(element)
      })
      video.querySelectorAll('track').forEach((element) => {
        if (trackElements.has(element)) return
        trackElements.add(element)
        element.addEventListener('load', refreshCues)
        element.addEventListener('error', refreshCues)
      })
      refreshCues()
    }
    const observer = new MutationObserver(watchTrackElements)
    observer.observe(video, { childList: true })
    video.addEventListener('loadedmetadata', refreshPlayback)
    video.addEventListener('durationchange', refreshPlayback)
    video.addEventListener('timeupdate', refreshPlayback)
    video.addEventListener('progress', refreshPlayback)
    video.addEventListener('seeked', refreshPlayback)
    video.addEventListener('loadeddata', refreshCues)
    video.textTracks.addEventListener('addtrack', refreshCues)
    video.textTracks.addEventListener('removetrack', refreshCues)
    video.textTracks.addEventListener('change', refreshCues)
    video.addEventListener(SUBTITLE_CUES_CHANGED_EVENT, refreshCues)
    queueMicrotask(refreshPlayback)
    watchTrackElements()

    return () => {
      observer.disconnect()
      video.removeEventListener('loadedmetadata', refreshPlayback)
      video.removeEventListener('durationchange', refreshPlayback)
      video.removeEventListener('timeupdate', refreshPlayback)
      video.removeEventListener('progress', refreshPlayback)
      video.removeEventListener('seeked', refreshPlayback)
      video.removeEventListener('loadeddata', refreshCues)
      video.textTracks.removeEventListener('addtrack', refreshCues)
      video.textTracks.removeEventListener('removetrack', refreshCues)
      video.textTracks.removeEventListener('change', refreshCues)
      video.removeEventListener(SUBTITLE_CUES_CHANGED_EVENT, refreshCues)
      trackElements.forEach((element) => {
        element.removeEventListener('load', refreshCues)
        element.removeEventListener('error', refreshCues)
      })
      if (cueFrame) window.cancelAnimationFrame(cueFrame)
    }
  }, [source.id, videoRef])

  const orderedBookmarks = useMemo(() => [...moments.bookmarks].sort((a, b) => a.time - b.time), [moments.bookmarks])
  const orderedNotes = useMemo(() => [...moments.notes].sort((a, b) => a.time - b.time), [moments.notes])
  const durationForTimeline = bounds?.end ?? duration
  const timelineStart = bounds?.start ?? 0
  const canSeek = Boolean(bounds && bounds.end > bounds.start)

  const persistAnnouncement = useCallback((message: string) => {
    setFeedback(message)
  }, [])

  const seekTo = useCallback((target: number, label: string) => {
    const video = videoRef.current
    const seekBounds = video && getSeekBounds(video)
    if (!video || !seekBounds || !Number.isFinite(target) || target < seekBounds.start || target > seekBounds.end) {
      persistAnnouncement('Seeking is unavailable for that moment.')
      return
    }
    try {
      video.currentTime = target
      setTime(target)
      persistAnnouncement(`Jumped to ${label} at ${formatTime(target)}.`)
    } catch {
      persistAnnouncement('The player could not seek to that moment.')
    }
  }, [persistAnnouncement, videoRef])

  const validCurrentPlaybackTime = () => {
    const video = videoRef.current
    const seekBounds = video && getSeekBounds(video)
    if (!video || !seekBounds || !Number.isFinite(video.currentTime)) return null
    if (video.currentTime < seekBounds.start || video.currentTime > seekBounds.end) return null
    return video.currentTime
  }

  const addBookmark = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const timestamp = validCurrentPlaybackTime()
    if (!storageReady || timestamp === null) {
      persistAnnouncement('A valid playback timestamp is not available yet.')
      return
    }
    const title = bookmarkTitle.trim()
    if (!title) {
      persistAnnouncement('Enter a title for this bookmark.')
      return
    }
    const duplicate = moments.bookmarks.some((bookmark) => Math.abs(bookmark.time - timestamp) < 2)
    if (duplicate) {
      persistAnnouncement('A bookmark already exists within two seconds of this moment.')
      return
    }
    setMoments((current) => ({ ...current, bookmarks: [...current.bookmarks, { id: makeId(), time: timestamp, title: title.slice(0, MAX_BOOKMARK_TITLE) }] }))
    setBookmarkTitle('')
    persistAnnouncement(`Bookmark added at ${formatTime(timestamp)}.`)
  }

  const addNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const timestamp = validCurrentPlaybackTime()
    const text = noteText.trim()
    if (!storageReady || timestamp === null) {
      persistAnnouncement('A valid playback timestamp is not available yet.')
      return
    }
    if (!text) {
      persistAnnouncement('Enter text for this note.')
      return
    }
    setMoments((current) => ({ ...current, notes: [...current.notes, { id: makeId(), time: timestamp, text: text.slice(0, MAX_NOTE_LENGTH) }] }))
    setNoteText('')
    persistAnnouncement(`Note added at ${formatTime(timestamp)}.`)
  }

  const saveBookmarkTitle = (id: string) => {
    const title = editingBookmarkTitle.trim()
    if (!title) {
      persistAnnouncement('Bookmark titles cannot be empty.')
      return
    }
    setMoments((current) => ({ ...current, bookmarks: current.bookmarks.map((bookmark) => bookmark.id === id ? { ...bookmark, title: title.slice(0, MAX_BOOKMARK_TITLE) } : bookmark) }))
    setEditingBookmarkId(null)
    persistAnnouncement('Bookmark title updated.')
  }

  const saveNoteText = (id: string) => {
    const text = editingNoteText.trim()
    if (!text) {
      persistAnnouncement('Notes cannot be empty. Delete the note if you no longer need it.')
      return
    }
    setMoments((current) => ({ ...current, notes: current.notes.map((note) => note.id === id ? { ...note, text: text.slice(0, MAX_NOTE_LENGTH) } : note) }))
    setEditingNoteId(null)
    persistAnnouncement('Note updated.')
  }

  const markerPosition = (timestamp: number) => durationForTimeline > timelineStart
    ? Math.max(0, Math.min(100, ((timestamp - timelineStart) / (durationForTimeline - timelineStart)) * 100))
    : 0

  const maxVisibleCues = 24
  const sampledCues = cueMarkers.length > maxVisibleCues
    ? cueMarkers.filter((_, index) => index % Math.ceil(cueMarkers.length / maxVisibleCues) === 0)
    : cueMarkers
  const visibleBookmarks = orderedBookmarks.slice(0, 50)
  const visibleNotes = orderedNotes.slice(0, 50)

  return (
    <section aria-labelledby="moment-explorer-title" className="moment-explorer">
      <details open>
        <summary>
          <span className="moment-explorer-icon"><Bookmark size={17} aria-hidden="true" /></span>
          <span className="moment-explorer-summary">
            <strong id="moment-explorer-title">Moments &amp; notes</strong>
            <small>Explore the real timeline and keep personal notes on this device</small>
          </span>
          <span className="moment-explorer-count">{moments.bookmarks.length} saved</span>
          <ChevronDown className="moment-explorer-chevron" size={16} aria-hidden="true" />
        </summary>
        <div className="moment-explorer-body">
          <section aria-label="Interactive media timeline" className="moment-timeline-section">
            <div className="moment-section-heading">
              <div><p className="moment-explorer-kicker">PLAYBACK MAP</p><h3>Interactive timeline</h3></div>
              <output aria-live="off">{formatTime(time)}{durationForTimeline > 0 ? ` / ${formatTime(durationForTimeline)}` : ''}</output>
            </div>
            {canSeek ? (
              <>
                <div className="moment-timeline">
                  <div aria-hidden="true" className="moment-timeline-rail">
                    {bufferedRanges.map(([start, end], index) => {
                      const rangeStart = Math.max(start, timelineStart)
                      const rangeEnd = Math.min(end, durationForTimeline)
                      if (rangeEnd <= rangeStart) return null
                      return <span className="moment-buffer-range" key={index} style={{ left: `${markerPosition(rangeStart)}%`, width: `${((rangeEnd - rangeStart) / (durationForTimeline - timelineStart)) * 100}%` }} />
                    })}
                    <span className="moment-played-range" style={{ left: `${markerPosition(timelineStart)}%`, width: `${markerPosition(time) - markerPosition(timelineStart)}%` }} />
                  </div>
                  {sampledCues.filter((cue) => cue.time >= timelineStart && cue.time <= durationForTimeline).map((cue) => (
                    <button
                      aria-label={`Seek to ${cue.kind === 'chapter' ? 'chapter' : 'subtitle cue'} at ${formatTime(cue.time)}: ${cue.label}`}
                      className={`moment-timeline-marker moment-timeline-marker--${cue.kind}`}
                      key={`cue:${cue.id}`}
                      onClick={() => seekTo(cue.time, cue.kind === 'chapter' ? 'chapter marker' : 'subtitle cue')}
                      style={{ left: `${markerPosition(cue.time)}%` }}
                      title={cue.label}
                      type="button"
                    />
                  ))}
                  {visibleBookmarks.filter((bookmark) => bookmark.time >= timelineStart && bookmark.time <= durationForTimeline).map((bookmark) => (
                    <button
                      aria-label={`Seek to bookmark ${bookmark.title} at ${formatTime(bookmark.time)}`}
                      className="moment-timeline-marker moment-timeline-marker--bookmark"
                      key={`bookmark:${bookmark.id}`}
                      onClick={() => seekTo(bookmark.time, `bookmark ${bookmark.title}`)}
                      style={{ left: `${markerPosition(bookmark.time)}%` }}
                      title={`${bookmark.title} · ${formatTime(bookmark.time)}`}
                      type="button"
                    />
                  ))}
                  {visibleNotes.filter((note) => note.time >= timelineStart && note.time <= durationForTimeline).map((note) => (
                    <button
                      aria-label={`Seek to personal note at ${formatTime(note.time)}`}
                      className="moment-timeline-marker moment-timeline-marker--note"
                      key={`note:${note.id}`}
                      onClick={() => seekTo(note.time, 'personal note')}
                      style={{ left: `${markerPosition(note.time)}%` }}
                      title={`Note · ${formatTime(note.time)}`}
                      type="button"
                    />
                  ))}
                  <input
                    aria-label="Playback position"
                    className="moment-timeline-range"
                    max={durationForTimeline}
                    min={timelineStart}
                    onChange={(event) => seekTo(Number(event.currentTarget.value), 'timeline')}
                    step="0.1"
                    type="range"
                    value={Math.max(timelineStart, Math.min(time, durationForTimeline))}
                  />
                </div>
                <div aria-label="Timeline marker key" className="moment-timeline-legend">
                  <span><i className="moment-legend-bookmark" /> Bookmark</span>
                  <span><i className="moment-legend-note" /> Note</span>
                  {sampledCues.some((cue) => cue.kind === 'chapter') && <span><i className="moment-legend-chapter" /> Chapter cue</span>}
                  {sampledCues.some((cue) => cue.kind === 'caption') && <span><i className="moment-legend-caption" /> Subtitle cue</span>}
                  <small>
                    {cueMarkers.length > sampledCues.length ? `Showing ${sampledCues.length} of ${cueMarkers.length} actual text cues` : `${cueMarkers.length} actual text cues`}
                    {orderedBookmarks.length > visibleBookmarks.length ? ` · ${visibleBookmarks.length} of ${orderedBookmarks.length} bookmarks marked` : ''}
                    {orderedNotes.length > visibleNotes.length ? ` · ${visibleNotes.length} of ${orderedNotes.length} notes marked` : ''}
                  </small>
                </div>
              </>
            ) : (
              <p className="moment-explorer-empty">Timeline seeking is unavailable until this source reports a seekable duration.</p>
            )}
          </section>

          <div className="moment-entry-grid">
            <section aria-labelledby="moment-bookmarks-heading" className="moment-list-section">
              <div className="moment-section-heading">
                <div><p className="moment-explorer-kicker">SAVE A PLACE</p><h3 id="moment-bookmarks-heading">Bookmarks</h3></div>
                <span>{orderedBookmarks.length}</span>
              </div>
              <form className="moment-entry-form" onSubmit={addBookmark}>
                <label htmlFor="moment-bookmark-title">Bookmark title</label>
                <div>
                  <input id="moment-bookmark-title" maxLength={MAX_BOOKMARK_TITLE} onChange={(event) => setBookmarkTitle(event.currentTarget.value)} placeholder="A detail to return to" value={bookmarkTitle} />
                  <button aria-label={`Add bookmark at ${formatTime(time)}`}                   disabled={!storageReady || !canSeek || !Number.isFinite(time) || time < timelineStart || time > durationForTimeline} title={`Add bookmark at ${formatTime(time)}`} type="submit"><Plus size={15} aria-hidden="true" /> Save</button>
                </div>
                <small>At the current player time: {formatTime(time)}</small>
              </form>
              {orderedBookmarks.length === 0 ? (
                <p className="moment-explorer-empty">No bookmarks yet. Save the current moment to find it quickly later.</p>
              ) : (
                <ul className="moment-record-list">
                  {orderedBookmarks.map((bookmark) => (
                    <li key={bookmark.id}>
                      {editingBookmarkId === bookmark.id ? (
                        <form className="moment-edit-form" onSubmit={(event) => { event.preventDefault(); saveBookmarkTitle(bookmark.id) }}>
                          <label className="visually-hidden" htmlFor={`bookmark-edit-${bookmark.id}`}>Edit bookmark title</label>
                          <input autoFocus id={`bookmark-edit-${bookmark.id}`} maxLength={MAX_BOOKMARK_TITLE} onChange={(event) => setEditingBookmarkTitle(event.currentTarget.value)} value={editingBookmarkTitle} />
                          <button aria-label="Save bookmark title" type="submit">Save</button>
                          <button onClick={() => setEditingBookmarkId(null)} type="button">Cancel</button>
                        </form>
                      ) : (
                        <>
                          <button className="moment-record-seek" onClick={() => seekTo(bookmark.time, `bookmark ${bookmark.title}`)} type="button">
                            <Clock3 size={14} aria-hidden="true" /><span><strong>{bookmark.title}</strong><small>{formatTime(bookmark.time)}</small></span>
                          </button>
                          <div className="moment-record-actions">
                            <button aria-label={`Edit bookmark ${bookmark.title}`} onClick={() => { setEditingBookmarkId(bookmark.id); setEditingBookmarkTitle(bookmark.title) }} type="button"><Pencil size={14} aria-hidden="true" /></button>
                            <button aria-label={`Delete bookmark ${bookmark.title}`} onClick={() => { setMoments((current) => ({ ...current, bookmarks: current.bookmarks.filter((item) => item.id !== bookmark.id) })); persistAnnouncement(`Bookmark ${bookmark.title} deleted.`) }} type="button"><Trash2 size={14} aria-hidden="true" /></button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="moment-notes-heading" className="moment-list-section">
              <div className="moment-section-heading">
                <div><p className="moment-explorer-kicker">KEEP A THOUGHT</p><h3 id="moment-notes-heading">Personal notes</h3></div>
                <span>{orderedNotes.length}</span>
              </div>
              <form className="moment-entry-form moment-note-form" onSubmit={addNote}>
                <label htmlFor="moment-note-text">Note for {formatTime(time)}</label>
                <textarea id="moment-note-text" maxLength={MAX_NOTE_LENGTH} onChange={(event) => setNoteText(event.currentTarget.value)} placeholder="What would you like to remember about this moment?" value={noteText} />
                <div><small>{noteText.length}/{MAX_NOTE_LENGTH}</small><button disabled={!storageReady || !canSeek || !Number.isFinite(time) || time < timelineStart || time > durationForTimeline} type="submit"><Plus size={15} aria-hidden="true" /> Add note</button></div>
              </form>
              {orderedNotes.length === 0 ? (
                <p className="moment-explorer-empty">No notes yet. Add a private note tied to the current playback time.</p>
              ) : (
                <ul className="moment-record-list moment-note-list">
                  {orderedNotes.map((note) => (
                    <li key={note.id}>
                      {editingNoteId === note.id ? (
                        <form className="moment-edit-form moment-edit-form--note" onSubmit={(event) => { event.preventDefault(); saveNoteText(note.id) }}>
                          <label className="visually-hidden" htmlFor={`note-edit-${note.id}`}>Edit personal note</label>
                          <textarea autoFocus id={`note-edit-${note.id}`} maxLength={MAX_NOTE_LENGTH} onChange={(event) => setEditingNoteText(event.currentTarget.value)} value={editingNoteText} />
                          <button type="submit">Save</button>
                          <button onClick={() => setEditingNoteId(null)} type="button">Cancel</button>
                        </form>
                      ) : (
                        <>
                          <button className="moment-record-seek" onClick={() => seekTo(note.time, 'personal note')} type="button">
                            <Clock3 size={14} aria-hidden="true" /><span><strong className="moment-note-copy">{note.text}</strong><small>{formatTime(note.time)}</small></span>
                          </button>
                          <div className="moment-record-actions">
                            <button aria-label="Edit personal note" onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.text) }} type="button"><Pencil size={14} aria-hidden="true" /></button>
                            <button aria-label="Delete personal note" onClick={() => { setMoments((current) => ({ ...current, notes: current.notes.filter((item) => item.id !== note.id) })); persistAnnouncement(`Note at ${formatTime(note.time)} deleted.`) }} type="button"><Trash2 size={14} aria-hidden="true" /></button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <p aria-live="polite" className="moment-explorer-feedback">{feedback}</p>
          <p aria-live="polite" className="moment-explorer-privacy" role="status">{storageNotice || 'Bookmarks and notes are stored only in this browser on this device. They are not uploaded or synced to an account.'}</p>
        </div>
      </details>
    </section>
  )
}
