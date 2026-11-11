import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import { getOriginalCueTimes, SUBTITLE_CUES_CHANGED_EVENT } from '@/components/media-engine/subtitle-utils'

type AtlasCue = {
  id: string
  startTime: number
  endTime: number
  text: string
  active: boolean
  nativeCue?: TextTrackCue
}

type CueCollections = {
  chapters: AtlasCue[]
  transcriptTracks: TranscriptTrack[]
}

type TranscriptTrack = {
  id: string
  label: string
  language: string
  kind: 'captions' | 'subtitles'
  cues: AtlasCue[]
  active: boolean
  textTrack: TextTrack
  loading: boolean
  failed: boolean
}

type SeekBounds = { start: number; end: number }

const EMPTY_CUES: CueCollections = { chapters: [], transcriptTracks: [] }
const textTrackIds = new WeakMap<TextTrack, string>()
let nextTextTrackId = 0

function getTextTrackId(track: TextTrack) {
  let id = textTrackIds.get(track)
  if (!id) {
    id = `text-track-${++nextTextTrackId}`
    textTrackIds.set(track, id)
  }
  return id
}

function sameCueList(first: AtlasCue[], second: AtlasCue[]) {
  return first.length === second.length && first.every((cue, index) => {
    const next = second[index]
    return cue.id === next.id && cue.startTime === next.startTime && cue.endTime === next.endTime && cue.text === next.text && cue.active === next.active
  })
}

function sameCueCollections(first: CueCollections, second: CueCollections) {
  return sameCueList(first.chapters, second.chapters)
    && first.transcriptTracks.length === second.transcriptTracks.length
    && first.transcriptTracks.every((track, index) => {
      const next = second.transcriptTracks[index]
      return track.id === next.id
        && track.label === next.label
        && track.language === next.language
        && track.kind === next.kind
        && track.active === next.active
        && track.loading === next.loading
        && track.failed === next.failed
        && sameCueList(track.cues, next.cues)
    })
}

const CueRow = memo(function CueRow({
  cue,
  active,
  onSeek,
  displayText,
}: {
  cue: AtlasCue
  active: boolean
  onSeek: (target: number, label: string) => void
  displayText?: ReactNode
}) {
  return (
    <li className="atlas-cue-row">
      <button
        aria-current={active ? 'true' : undefined}
        className="atlas-cue-button"
        onClick={() => onSeek(cue.startTime, cue.text)}
        type="button"
      >
        <span className="atlas-cue-time">{formatTime(cue.startTime)}</span>
        <span className="atlas-cue-text">{displayText ?? cue.text}</span>
        {active && <span aria-hidden="true" className="atlas-cue-now">NOW</span>}
      </button>
    </li>
  )
})

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const totalSeconds = Math.floor(value)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}

function readCueCollections(video: HTMLVideoElement): CueCollections {
  const chapters: AtlasCue[] = []
  const transcriptTracks: TranscriptTrack[] = []

  Array.from(video.textTracks).forEach((track) => {
    if (track.kind === 'chapters' && track.mode === 'disabled') track.mode = 'hidden'
    if ((track.kind === 'captions' || track.kind === 'subtitles') && track.mode === 'disabled') {
      track.mode = 'hidden'
    }

    if (track.kind !== 'chapters' && track.kind !== 'captions' && track.kind !== 'subtitles') return

    const trackId = getTextTrackId(track)
    const activeCues = track.mode === 'showing' ? new Set(Array.from(track.activeCues ?? [])) : new Set<TextTrackCue>()
    const trackCues: AtlasCue[] = []
    Array.from(track.cues ?? []).forEach((cue, cueIndex) => {
      const text = 'text' in cue && typeof cue.text === 'string' ? cue.text.trim() : ''
      if (!text) return
      const item: AtlasCue = {
        id: `${trackId}-${cue.id || cueIndex}-${cue.startTime}`,
        startTime: cue.startTime,
        endTime: cue.endTime,
        text,
        active: activeCues.has(cue),
        nativeCue: cue,
      }
      if (track.kind === 'chapters') chapters.push(item)
      else trackCues.push(item)
    })
    if (track.kind === 'captions' || track.kind === 'subtitles') {
      const language = track.language.trim()
      const label = track.label.trim() || language || 'Unknown language'
      const trackElement = Array.from(video.querySelectorAll('track')).find((element) => element.track === track)
      transcriptTracks.push({
        id: trackId,
        label,
        language,
        kind: track.kind,
        cues: trackCues.sort((first, second) => first.startTime - second.startTime),
        active: track.mode === 'showing',
        textTrack: track,
        loading: trackElement?.readyState === HTMLTrackElement.LOADING,
        failed: trackElement?.readyState === HTMLTrackElement.ERROR,
      })
    }
  })

  const byStartTime = (first: AtlasCue, second: AtlasCue) => first.startTime - second.startTime
  return {
    chapters: chapters.sort(byStartTime),
    transcriptTracks,
  }
}

function getSeekBounds(video: HTMLVideoElement): SeekBounds | null {
  if (video.seekable.length > 0) {
    const lastRange = video.seekable.length - 1
    return { start: video.seekable.start(0), end: video.seekable.end(lastRange) }
  }
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return { start: 0, end: video.duration }
  }
  return null
}

function formatVttTime(value: number) {
  const milliseconds = Math.max(0, Math.round(value * 1000))
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const ms = milliseconds % 1000
  const hourPart = hours ? String(hours).padStart(2, '0') + ':' : ''
  return hourPart + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0') + '.' + String(ms).padStart(3, '0')
}

function downloadText(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function highlightMatch(text: string, query: string): ReactNode {
  const term = query.trim()
  if (!term) return text
  const source = text.toLowerCase()
  const needle = term.toLowerCase()
  const pieces: ReactNode[] = []
  let cursor = 0
  let index = source.indexOf(needle)
  while (index >= 0) {
    if (index > cursor) pieces.push(text.slice(cursor, index))
    pieces.push(<mark key={String(index) + '-' + pieces.length}>{text.slice(index, index + term.length)}</mark>)
    cursor = index + term.length
    index = source.indexOf(needle, cursor)
  }
  if (!pieces.length) return text
  if (cursor < text.length) pieces.push(text.slice(cursor))
  return pieces
}

export interface ReelAtlasProps {
  videoRef: RefObject<HTMLVideoElement | null>
}

export function ReelAtlas({ videoRef }: ReelAtlasProps) {
  const [cues, setCues] = useState<CueCollections>(EMPTY_CUES)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [canSeek, setCanSeek] = useState(false)
  const [activeTab, setActiveTab] = useState<'chapters' | 'transcript'>('chapters')
  const [search, setSearch] = useState('')
  const [searchResultCueId, setSearchResultCueId] = useState<string | null>(null)
  const [selectedTranscriptTrackId, setSelectedTranscriptTrackId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const observedTracks = new Set<HTMLTrackElement>()
    const refreshTime = () => {
      setCurrentTime(video.currentTime || 0)
      setDuration(Number.isFinite(video.duration) ? video.duration : 0)
      setCanSeek(getSeekBounds(video) !== null)
    }

    let refreshCues = () => {}
    const cueChangeListeners = new Map<TextTrack, () => void>()
    const watchCueChanges = () => {
      const current = new Set(Array.from(video.textTracks).filter((track) => track.kind === 'captions' || track.kind === 'subtitles'))
      cueChangeListeners.forEach((listener, track) => {
        if (current.has(track)) return
        track.removeEventListener('cuechange', listener)
        cueChangeListeners.delete(track)
      })
      current.forEach((track) => {
        if (cueChangeListeners.has(track)) return
        const listener = () => refreshCues()
        cueChangeListeners.set(track, listener)
        track.addEventListener('cuechange', listener)
      })
    }

    refreshCues = () => {
      const next = readCueCollections(video)
      setCues((previous) => sameCueCollections(previous, next) ? previous : next)
      setSelectedTranscriptTrackId((selected) => {
        const activeTrack = next.transcriptTracks.find((track) => track.active)
        if (activeTrack) return activeTrack.id
        if (selected && next.transcriptTracks.some((track) => track.id === selected)) return selected
        return next.transcriptTracks[0]?.id ?? null
      })
    }

    const refresh = () => {
      refreshTime()
      refreshCues()
    }

    const watchTrackElements = () => {
      observedTracks.forEach((trackElement) => {
        if (video.contains(trackElement)) return
        trackElement.removeEventListener('load', refreshCues)
        trackElement.removeEventListener('error', refreshCues)
        observedTracks.delete(trackElement)
      })
      video.querySelectorAll('track').forEach((trackElement) => {
        if (observedTracks.has(trackElement)) return
        observedTracks.add(trackElement)
        trackElement.addEventListener('load', refreshCues)
        trackElement.addEventListener('error', refreshCues)
        if (trackElement.readyState === HTMLTrackElement.LOADED) refresh()
      })
    }

    const observer = new MutationObserver(() => {
      watchTrackElements()
      watchCueChanges()
      refreshCues()
    })
    observer.observe(video, { childList: true })

    video.addEventListener('loadedmetadata', refresh)
    video.addEventListener('loadeddata', refresh)
    video.addEventListener('durationchange', refreshTime)
    video.addEventListener('timeupdate', refreshTime)
    video.addEventListener('seeked', refreshTime)
    video.textTracks.addEventListener('addtrack', refreshCues)
    video.textTracks.addEventListener('removetrack', refreshCues)
    video.textTracks.addEventListener('change', refreshCues)
    video.addEventListener(SUBTITLE_CUES_CHANGED_EVENT, refreshCues)
    video.textTracks.addEventListener('addtrack', watchCueChanges)
    video.textTracks.addEventListener('removetrack', watchCueChanges)
    watchTrackElements()
    watchCueChanges()
    refresh()

    return () => {
      observer.disconnect()
      video.removeEventListener('loadedmetadata', refresh)
      video.removeEventListener('loadeddata', refresh)
      video.removeEventListener('durationchange', refreshTime)
      video.removeEventListener('timeupdate', refreshTime)
      video.removeEventListener('seeked', refreshTime)
      video.textTracks.removeEventListener('addtrack', refreshCues)
      video.textTracks.removeEventListener('removetrack', refreshCues)
      video.textTracks.removeEventListener('change', refreshCues)
      video.removeEventListener(SUBTITLE_CUES_CHANGED_EVENT, refreshCues)
      video.textTracks.removeEventListener('addtrack', watchCueChanges)
      video.textTracks.removeEventListener('removetrack', watchCueChanges)
      cueChangeListeners.forEach((listener, track) => track.removeEventListener('cuechange', listener))
      observedTracks.forEach((trackElement) => {
        trackElement.removeEventListener('load', refreshCues)
        trackElement.removeEventListener('error', refreshCues)
      })
    }
  }, [videoRef])

  const activeChapter = useMemo(
    () => cues.chapters.find((cue) => currentTime >= cue.startTime && currentTime < cue.endTime) ?? null,
    [cues.chapters, currentTime],
  )
  const filteredTranscript = useMemo(() => {
    const transcript = cues.transcriptTracks.find((track) => track.id === selectedTranscriptTrackId)?.cues ?? []
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return transcript
    return transcript.filter((cue) => cue.text.toLowerCase().includes(normalizedSearch))
  }, [cues.transcriptTracks, search, selectedTranscriptTrackId])
  const resultCueIndex = searchResultCueId === null
    ? -1
    : filteredTranscript.findIndex((cue) => cue.id === searchResultCueId)
  const searchResultIndex = resultCueIndex >= 0 ? resultCueIndex : null
  const selectedTranscriptTrack = cues.transcriptTracks.find((track) => track.id === selectedTranscriptTrackId) ?? null
  const searchIsActive = Boolean(search.trim())

  const chooseTranscriptTrack = useCallback((id: string) => {
    const video = videoRef.current
    const selected = cues.transcriptTracks.find((track) => track.id === id)
    if (!video || !selected) return
    Array.from(video.textTracks).forEach((track) => {
      if (track.kind === 'captions' || track.kind === 'subtitles') track.mode = getTextTrackId(track) === id ? 'showing' : 'hidden'
    })
    setSelectedTranscriptTrackId(id)
    setSearchResultCueId(null)
  }, [cues.transcriptTracks, videoRef])

  const exportTranscript = useCallback((format: 'txt' | 'vtt') => {
    const track = selectedTranscriptTrack
    if (!track?.cues.length) return
    const ordered = [...track.cues].sort((first, second) => first.startTime - second.startTime)
    const body = format === 'txt'
      ? ordered.map((cue) => formatTime(cue.nativeCue ? getOriginalCueTimes(cue.nativeCue).start : cue.startTime) + '\n' + cue.text).join('\n\n')
      : 'WEBVTT\n\n' + ordered.map((cue) => {
        const original = cue.nativeCue ? getOriginalCueTimes(cue.nativeCue) : { start: cue.startTime, end: cue.endTime }
        return formatVttTime(original.start) + ' --> ' + formatVttTime(original.end) + '\n' + cue.text
      }).join('\n\n') + '\n'
    const safeLanguage = (track.language || track.kind).replace(/[^a-z0-9-]+/gi, '-').toLowerCase()
    downloadText('reel-atlas-transcript-' + safeLanguage + '.' + format, body, format === 'vtt' ? 'text/vtt;charset=utf-8' : 'text/plain;charset=utf-8')
  }, [selectedTranscriptTrack])

  const seekTo = useCallback((target: number, label: string) => {
    const video = videoRef.current
    if (!video) return
    const bounds = getSeekBounds(video)
    if (!bounds) {
      setAnnouncement('Seeking is unavailable for this media.')
      return
    }
    const time = Math.min(Math.max(target, bounds.start), bounds.end)
    video.currentTime = time
    setAnnouncement(`Jumped to ${label} at ${formatTime(time)}.`)
  }, [videoRef])

  const nudge = useCallback((amount: number) => {
    const video = videoRef.current
    if (!video) return
    seekTo(video.currentTime + amount, `${amount < 0 ? 'back' : 'forward'} ${Math.abs(amount).toFixed(2)} seconds`)
  }, [seekTo, videoRef])

  const moveSearchResult = useCallback((direction: -1 | 1) => {
    if (!filteredTranscript.length) return
    let nextIndex: number
    if (searchResultIndex !== null) {
      nextIndex = (searchResultIndex + direction + filteredTranscript.length) % filteredTranscript.length
    } else if (direction > 0) {
      const firstAtOrAfterTime = filteredTranscript.findIndex((cue) => cue.startTime >= currentTime)
      nextIndex = firstAtOrAfterTime < 0 ? 0 : firstAtOrAfterTime
    } else {
      nextIndex = -1
      for (let index = filteredTranscript.length - 1; index >= 0; index -= 1) {
        if (filteredTranscript[index].startTime < currentTime) {
          nextIndex = index
          break
        }
      }
      if (nextIndex < 0) nextIndex = filteredTranscript.length - 1
    }
    const next = filteredTranscript[nextIndex]
    setSearchResultCueId(next.id)
    seekTo(next.startTime, `transcript match ${next.text}`)
  }, [currentTime, filteredTranscript, searchResultIndex, seekTo])

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
    const currentIndex = tabs.indexOf(event.currentTarget)
    const nextIndex = event.key === 'ArrowRight' || event.key === 'Home'
      ? (event.key === 'Home' ? 0 : (currentIndex + 1) % tabs.length)
      : event.key === 'ArrowLeft' || event.key === 'End'
        ? (event.key === 'End' ? tabs.length - 1 : (currentIndex - 1 + tabs.length) % tabs.length)
        : -1
    if (nextIndex < 0 || !tabs.length) return
    event.preventDefault()
    tabs[nextIndex].click()
    tabs[nextIndex].focus()
  }

  return (
    <section aria-labelledby="atlas-panel-title" className="atlas-panel">
      <div className="atlas-panel-heading">
        <div>
          <p className="atlas-panel-kicker">EXPLORE THE TIMELINE</p>
          <h3 id="atlas-panel-title">Moment Atlas</h3>
        </div>
        <div aria-label="Precision seeking" className="atlas-nudges" role="group">
          <span>FINE SEEK</span>
          <button aria-label="Seek back 0.25 seconds" disabled={!canSeek} onClick={() => nudge(-0.25)} type="button">
            −0.25s
          </button>
          <button aria-label="Seek forward 0.25 seconds" disabled={!canSeek} onClick={() => nudge(0.25)} type="button">
            +0.25s
          </button>
        </div>
      </div>

      <div className="atlas-current-moment">
        <span className="atlas-current-marker" aria-hidden="true" />
        <span className="atlas-current-label">NOW PLAYING</span>
        <span className="atlas-current-title">
          {activeChapter?.text ?? (cues.chapters.length ? 'Between chapters' : 'Chapter markers not provided')}
        </span>
        <span className="atlas-current-time">
          {formatTime(currentTime)}{duration > 0 ? ` / ${formatTime(duration)}` : ''}
        </span>
      </div>

      <div className="atlas-tabs" role="tablist" aria-label="Explore video content">
        <button
          aria-controls="atlas-chapters-panel"
          aria-selected={activeTab === 'chapters'}
          className="atlas-tab"
          id="atlas-chapters-tab"
          onKeyDown={handleTabKeyDown}
          onClick={() => setActiveTab('chapters')}
          tabIndex={activeTab === 'chapters' ? 0 : -1}
          role="tab"
          type="button"
        >
          Chapters <span>{cues.chapters.length}</span>
        </button>
        <button
          aria-controls="atlas-transcript-panel"
          aria-selected={activeTab === 'transcript'}
          className="atlas-tab"
          id="atlas-transcript-tab"
          onKeyDown={handleTabKeyDown}
          onClick={() => setActiveTab('transcript')}
          tabIndex={activeTab === 'transcript' ? 0 : -1}
          role="tab"
          type="button"
        >
          Transcript <span>{cues.transcriptTracks.reduce((count, track) => count + track.cues.length, 0)}</span>
        </button>
      </div>

      <div aria-labelledby="atlas-chapters-tab" className="atlas-tab-panel" hidden={activeTab !== 'chapters'} id="atlas-chapters-panel" role="tabpanel" tabIndex={0}>
          {cues.chapters.length ? (
            <ol className="atlas-cue-list">{cues.chapters.map((cue) => (
              <CueRow active={currentTime >= cue.startTime && currentTime < cue.endTime} cue={cue} key={`chapter-${cue.id}`} onSeek={seekTo} />
            ))}</ol>
          ) : (
            <p className="atlas-empty-state">This video does not provide chapter markers. Fine seek and timeline controls are still available.</p>
          )}
      </div>
      <div aria-labelledby="atlas-transcript-tab" className="atlas-tab-panel" hidden={activeTab !== 'transcript'} id="atlas-transcript-panel" role="tabpanel" tabIndex={0}>
          {selectedTranscriptTrack?.cues.length ? (
            <>
              {cues.transcriptTracks.length > 1 && (
                <>
                  <label className="atlas-search-label" htmlFor="atlas-transcript-track">Transcript language</label>
                  <select
                    className="atlas-search atlas-track-select"
                    id="atlas-transcript-track"
                    onChange={(event) => chooseTranscriptTrack(event.currentTarget.value)}
                    value={selectedTranscriptTrackId ?? ''}
                  >
                    {cues.transcriptTracks.map((track) => (
                      <option key={track.id} value={track.id}>{track.label}{track.language && track.language !== track.label ? ` (${track.language})` : ''}</option>
                    ))}
                  </select>
                </>
              )}
              <label className="atlas-search-label" htmlFor="atlas-transcript-search">Search {selectedTranscriptTrack?.label ?? 'transcript'}</label>
              <input
                autoComplete="off"
                className="atlas-search"
                id="atlas-transcript-search"
                onChange={(event) => { setSearch(event.currentTarget.value); setSearchResultCueId(null) }}
                placeholder="Find a word or phrase"
                type="search"
                value={search}
              />
              {selectedTranscriptTrack?.cues.length ? <div aria-label="Export selected transcript" className="atlas-transcript-export" role="group">
                <span>EXPORT SELECTED TRACK</span>
                <button onClick={() => exportTranscript('txt')} type="button">Download .txt</button>
                <button onClick={() => exportTranscript('vtt')} type="button">Download .vtt</button>
              </div> : null}
              {filteredTranscript.length ? (
                <>
                  {searchIsActive && (
                    <div className="atlas-search-results">
                      <span aria-live="polite">
                        {searchResultIndex === null
                          ? `${filteredTranscript.length} ${filteredTranscript.length === 1 ? 'match' : 'matches'}`
                          : `${searchResultIndex + 1} of ${filteredTranscript.length} matches`}
                      </span>
                      <div role="group" aria-label="Transcript search results">
                        <button disabled={!filteredTranscript.length} onClick={() => moveSearchResult(-1)} type="button">Previous match</button>
                        <button disabled={!filteredTranscript.length} onClick={() => moveSearchResult(1)} type="button">Next match</button>
                      </div>
                    </div>
                  )}
                  <ol className="atlas-cue-list atlas-transcript-list">
                    {filteredTranscript.map((cue) => (
                      <CueRow
                        active={cue.active}
                        cue={cue}
                        displayText={highlightMatch(cue.text, search)}
                        key={`transcript-${cue.id}`}
                        onSeek={(target, label) => {
                          const resultIndex = filteredTranscript.findIndex((result) => result.id === cue.id)
                          setSearchResultCueId(searchIsActive && resultIndex >= 0 ? cue.id : null)
                          seekTo(target, label)
                        }}
                      />
                    ))}
                  </ol>
                </>
              ) : (
                <p className="atlas-empty-state">No transcript lines match “{search}”.</p>
              )}
            </>
          ) : selectedTranscriptTrack?.failed ? (
            <p aria-live="polite" className="atlas-empty-state" role="status">The browser could not load cues from {selectedTranscriptTrack.label}. Check that the track is available and permitted for this source.</p>
          ) : selectedTranscriptTrack?.loading ? (
            <p aria-live="polite" className="atlas-empty-state">Loading cues from {selectedTranscriptTrack.label}. The transcript will appear when the browser finishes loading this track.</p>
          ) : cues.transcriptTracks.length ? (
            <p className="atlas-empty-state">This selected track has no readable transcript cues yet.</p>
          ) : (
            <p className="atlas-empty-state">A transcript is not available for this video. Add a captions or subtitles text track to enable search and timestamp jumps.</p>
          )}
      </div>

      <p aria-live="polite" className="atlas-announcement">{announcement}</p>
    </section>
  )
}
