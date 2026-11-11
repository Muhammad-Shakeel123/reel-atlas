import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Captions, ChevronDown, Download, Languages, Minus, Plus, RotateCcw, Subtitles, Type } from 'lucide-react'
import { getOriginalCueTimes, parseSubtitleFile, SUBTITLE_CUES_CHANGED_EVENT } from './subtitle-utils'
import './subtitle-studio.css'

type TrackKind = 'captions' | 'subtitles'
type TrackSource = 'Embedded' | 'Imported · local' | 'Player provided'
type SubtitleDescriptor = { id: string; textTrack: TextTrack; kind: TrackKind; label: string; language: string; source: TrackSource }
type ImportedSubtitle = { id: string; element: HTMLTrackElement; objectUrl: string; name: string; message: string; onLoad: () => void; onError: () => void }
type Appearance = { size: 'small' | 'medium' | 'large' | 'xlarge'; color: 'white' | 'warm' | 'yellow'; background: 'off' | 'soft' | 'strong'; font: 'sans' | 'serif' | 'mono'; shadow: boolean; position: 'bottom' | 'middle' | 'top'; align: 'start' | 'center' | 'end'; highContrast: boolean; reduceMotion: boolean }
type CuePosition = { line: number | 'auto'; snap: boolean; align: 'start' | 'center' | 'end' }

const OFF = '__off__'
const trackIds = new WeakMap<TextTrack, string>()
const cuePositions = new WeakMap<VTTCue, CuePosition>()
let trackSequence = 0
const initialAppearance: Appearance = { size: 'medium', color: 'white', background: 'soft', font: 'sans', shadow: true, position: 'bottom', align: 'center', highContrast: false, reduceMotion: false }
const sizes: Record<Appearance['size'], string> = { small: '90%', medium: '100%', large: '125%', xlarge: '150%' }
const colors: Record<Appearance['color'], string> = { white: '#fffdf4', warm: '#f0d9b2', yellow: '#fff05a' }
const backgrounds: Record<Appearance['background'], string> = { off: 'transparent', soft: 'rgb(8 10 8 / 48%)', strong: 'rgb(8 10 8 / 88%)' }
const fonts: Record<Appearance['font'], string> = { sans: 'Arial, sans-serif', serif: 'Georgia, serif', mono: 'ui-monospace, monospace' }

function trackId(track: TextTrack) {
  let id = trackIds.get(track)
  if (!id) { id = 'subtitle-track-' + (++trackSequence); trackIds.set(track, id) }
  return id
}

function releaseImportedTrack({ element, objectUrl, onLoad, onError }: ImportedSubtitle) {
  element.removeEventListener('load', onLoad)
  element.removeEventListener('error', onError)
  element.remove()
  URL.revokeObjectURL(objectUrl)
}

function isVttCue(cue: TextTrackCue): cue is VTTCue {
  return typeof VTTCue !== 'undefined' && cue instanceof VTTCue
}

function readSubtitleTracks(video: HTMLVideoElement): SubtitleDescriptor[] {
  return Array.from(video.textTracks).flatMap((textTrack) => {
    if (textTrack.kind !== 'captions' && textTrack.kind !== 'subtitles') return []
    const element = Array.from(video.querySelectorAll('track')).find((candidate) => candidate.track === textTrack)
    const imported = element?.dataset.reelAtlasImported === 'true'
    return [{
      id: trackId(textTrack),
      textTrack,
      kind: textTrack.kind,
      label: textTrack.label.trim() || textTrack.language.trim() || 'Unknown language',
      language: textTrack.language.trim() || 'Unknown language',
      source: imported ? 'Imported · local' : element ? 'Embedded' : 'Player provided',
    }]
  })
}

function formatCueTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.000'
  return Math.floor(seconds / 60) + ':' + (seconds % 60).toFixed(3).padStart(6, '0')
}

function rememberPosition(cue: TextTrackCue) {
  if (!isVttCue(cue)) return
  if (!cuePositions.has(cue)) cuePositions.set(cue, { line: cue.line, snap: cue.snapToLines, align: cue.lineAlign })
  return cuePositions.get(cue)
}

function restorePosition(cue: TextTrackCue) {
  if (!isVttCue(cue)) return
  const original = cuePositions.get(cue)
  if (!original) return
  cue.line = original.line
  cue.snapToLines = original.snap
  cue.lineAlign = original.align
}

export function SubtitleAccessibilityStudio({ videoRef }: { videoRef: RefObject<HTMLVideoElement | null> }) {
  const [tracks, setTracks] = useState<SubtitleDescriptor[]>([])
  const [hasDescriptions, setHasDescriptions] = useState(false)
  const [imported, setImported] = useState<ImportedSubtitle[]>([])
  const importedRef = useRef<ImportedSubtitle[]>([])
  const mountedRef = useRef(false)
  const [preferredId, setPreferredId] = useState<string | null>(null)
  const [languageCode, setLanguageCode] = useState('')
  const [kind, setKind] = useState<TrackKind>('subtitles')
  const [label, setLabel] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [dragging, setDragging] = useState(false)
  const [appearance, setAppearance] = useState<Appearance>(() => ({
    ...initialAppearance,
    reduceMotion: typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false),
    highContrast: typeof window !== 'undefined' && (window.matchMedia?.('(prefers-contrast: more)').matches ?? false),
  }))
  const [offsets, setOffsets] = useState<Record<string, number>>({})
  const [time, setTime] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const [open, setOpen] = useState(false)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const updateAppearance = <K extends keyof Appearance>(key: K, value: Appearance[K]) => setAppearance((previous) => ({ ...previous, [key]: value }))

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const refresh = () => {
      for (const track of Array.from(video.textTracks)) {
        if ((track.kind === 'captions' || track.kind === 'subtitles') && track.mode === 'disabled') track.mode = 'hidden'
      }
      const list = readSubtitleTracks(video)
      setTracks(list)
      setHasDescriptions(Array.from(video.textTracks).some((track) => track.kind === 'descriptions'))
      const showing = Array.from(video.textTracks).find((track) => (track.kind === 'captions' || track.kind === 'subtitles') && track.mode === 'showing')
      if (showing) setPreferredId(trackId(showing))
      else setPreferredId((previous) => previous && list.some((track) => track.id === previous) ? previous : list[0]?.id ?? null)
    }
    const observed = new Set<HTMLTrackElement>()
    const watchElements = () => {
      observed.forEach((element) => {
        if (!video.contains(element)) {
          element.removeEventListener('load', refresh)
          element.removeEventListener('error', refresh)
          observed.delete(element)
        }
      })
      video.querySelectorAll('track').forEach((element) => {
        if (observed.has(element)) return
        observed.add(element)
        element.addEventListener('load', refresh)
        element.addEventListener('error', refresh)
      })
      refresh()
    }
    const observer = new MutationObserver(watchElements)
    observer.observe(video, { childList: true })
    video.textTracks.addEventListener('addtrack', refresh)
    video.textTracks.addEventListener('removetrack', refresh)
    video.textTracks.addEventListener('change', refresh)
    video.addEventListener('loadedmetadata', refresh)
    watchElements()
    return () => {
      observer.disconnect()
      video.textTracks.removeEventListener('addtrack', refresh)
      video.textTracks.removeEventListener('removetrack', refresh)
      video.textTracks.removeEventListener('change', refresh)
      video.removeEventListener('loadedmetadata', refresh)
      observed.forEach((element) => { element.removeEventListener('load', refresh); element.removeEventListener('error', refresh) })
    }
  }, [videoRef])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      importedRef.current.forEach(releaseImportedTrack)
      importedRef.current = []
    }
  }, [])

  const active = tracks.find((item) => item.textTrack.mode === 'showing') ?? null
  const selected = active ?? tracks.find((item) => item.id === preferredId) ?? null
  const offset = selected ? offsets[selected.id] ?? 0 : 0
  const cueList = selected?.textTrack.cues
  const currentCue = selected?.textTrack.activeCues
    ? Array.from(selected.textTrack.activeCues).filter((cue) => cue.startTime <= time && cue.endTime > time).sort((a, b) => b.startTime - a.startTime)[0] ?? null
    : null
  const canShift = Boolean(cueList && Array.from(cueList).some(isVttCue))

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const values: Record<string, string> = {
      '--atlas-subtitle-color': appearance.highContrast ? '#fff' : colors[appearance.color],
      '--atlas-subtitle-background': appearance.highContrast ? 'rgb(0 0 0 / 94%)' : backgrounds[appearance.background],
      '--atlas-subtitle-size': sizes[appearance.size],
      '--atlas-subtitle-font': fonts[appearance.font],
      '--atlas-subtitle-shadow': appearance.shadow || appearance.highContrast ? '0 1px 3px #000, 0 2px 7px rgb(0 0 0 / 85%)' : 'none',
      '--atlas-subtitle-align': appearance.align,
    }
    Object.entries(values).forEach(([property, value]) => video.style.setProperty(property, value))
    return () => Object.keys(values).forEach((property) => video.style.removeProperty(property))
  }, [appearance, videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const changed: TextTrackCue[] = []
    for (const track of Array.from(video.textTracks)) {
      if (track.kind !== 'captions' && track.kind !== 'subtitles') continue
      for (const cue of Array.from(track.cues ?? [])) {
        const original = rememberPosition(cue)
        if (!isVttCue(cue) || !original) continue
        if (appearance.position === 'top') { cue.snapToLines = true; cue.line = 0; cue.lineAlign = 'start' }
        else if (appearance.position === 'middle') { cue.snapToLines = false; cue.line = 50; cue.lineAlign = 'center' }
        else { cue.snapToLines = true; cue.line = -1; cue.lineAlign = 'end' }
        changed.push(cue)
      }
    }
    return () => changed.forEach(restorePosition)
  }, [appearance.position, tracks, videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const changed: VTTCue[] = []
    for (const track of Array.from(video.textTracks)) {
      if (track.kind !== 'captions' && track.kind !== 'subtitles') continue
      const amount = offsets[trackId(track)] ?? 0
      for (const cue of Array.from(track.cues ?? [])) {
        if (!isVttCue(cue)) continue
        const original = getOriginalCueTimes(cue)
        cue.startTime = Math.max(0, original.start + amount)
        cue.endTime = Math.max(cue.startTime + 0.01, original.end + amount)
        changed.push(cue)
      }
    }
    if (changed.length) video.dispatchEvent(new Event(SUBTITLE_CUES_CHANGED_EVENT))
    return () => changed.forEach((cue) => {
      const original = getOriginalCueTimes(cue)
      cue.startTime = original.start
      cue.endTime = original.end
    })
  }, [offsets, tracks, videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const update = () => setTime(Number.isFinite(video.currentTime) ? video.currentTime : 0)
    video.addEventListener('timeupdate', update)
    video.addEventListener('seeked', update)
    video.addEventListener('loadedmetadata', update)
    update()
    return () => {
      video.removeEventListener('timeupdate', update)
      video.removeEventListener('seeked', update)
      video.removeEventListener('loadedmetadata', update)
    }
  }, [videoRef])

  const selectTrack = useCallback((id: string) => {
    const video = videoRef.current
    if (!video) return
    const list = readSubtitleTracks(video)
    const target = list.find((item) => item.id === id)
    list.forEach((item) => { item.textTrack.mode = item.id === target?.id ? 'showing' : 'hidden' })
    if (target) setPreferredId(target.id)
    setTracks(list)
  }, [videoRef])

  const importFile = useCallback(async (file: File) => {
    const video = videoRef.current
    if (!video) return
    setImportMessage('')
    try {
      const { parsed, encodingNotice } = await parseSubtitleFile(file)
      if (!mountedRef.current || videoRef.current !== video) return
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const trackName = label.trim() || file.name.replace(/\.[^.]+$/, '') || 'Imported subtitles'
      const lang = languageCode.trim()
      if (lang && !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(lang)) throw new Error('Language must be a BCP 47 code such as en or pt-BR, or left blank as unknown.')
      const objectUrl = URL.createObjectURL(new Blob([parsed.webVtt], { type: 'text/vtt;charset=utf-8' }))
      const element = document.createElement('track')
      const updateMessage = (message: string) => {
        if (!mountedRef.current) return
        importedRef.current = importedRef.current.map((item) => item.element === element ? { ...item, message } : item)
        setImported(importedRef.current)
      }
      const onLoad = () => updateMessage('Loaded and ready.')
      const onError = () => updateMessage('Browser could not load this track.')
      try {
        element.kind = kind
        element.label = trackName
        if (lang) element.srclang = lang
        element.dataset.reelAtlasImported = 'true'
        element.src = objectUrl
        element.addEventListener('load', onLoad, { once: true })
        element.addEventListener('error', onError, { once: true })
        readSubtitleTracks(video).forEach((item) => { item.textTrack.mode = 'hidden' })
        video.append(element)
        element.track.mode = 'showing'
      } catch (error) {
        element.removeEventListener('load', onLoad)
        element.removeEventListener('error', onError)
        element.remove()
        URL.revokeObjectURL(objectUrl)
        throw error
      }
      const id = trackId(element.track)
      const importedItem = { id, element, objectUrl, name: file.name, message: parsed.cueCount + ' validated cues · loading', onLoad, onError }
      importedRef.current = [...importedRef.current, importedItem]
      setImported(importedRef.current)
      setPreferredId(id)
      setTracks(readSubtitleTracks(video))
      const description = ext === 'txt' ? 'timestamped text converted to WebVTT' : parsed.convertedFrom === 'srt' ? 'SRT converted to WebVTT' : 'WebVTT loaded'
      setImportMessage((encodingNotice ? encodingNotice + ' ' : '') + file.name + ': ' + parsed.cueCount + ' cues · ' + description + '.')
    } catch (error) {
      if (mountedRef.current) setImportMessage(error instanceof Error ? error.message : 'This subtitle file could not be opened.')
    }
  }, [kind, label, languageCode, videoRef])

  const removeImported = (item: ImportedSubtitle) => {
    const showing = item.element.track.mode === 'showing'
    releaseImportedTrack(item)
    importedRef.current = importedRef.current.filter((entry) => entry.id !== item.id)
    setImported(importedRef.current)
    setOffsets((previous) => { const next = { ...previous }; delete next[item.id]; return next })
    if (showing) setPreferredId(null)
    const video = videoRef.current
    if (video) setTracks(readSubtitleTracks(video))
  }

  const nudgeOffset = (amount: number) => {
    if (!selected || !canShift) return
    const next = Math.max(-10, Math.min(10, Math.round((offset + amount) * 10) / 10))
    setOffsets((previous) => ({ ...previous, [selected.id]: next }))
  }

  const navigateCue = (direction: -1 | 1) => {
    const video = videoRef.current
    if (!video || !selected) return
    const cues = Array.from(selected.textTrack.cues ?? []).filter((cue) => cue.endTime > cue.startTime).sort((a, b) => a.startTime - b.startTime)
    const activeCue = cues.filter((cue) => cue.startTime <= video.currentTime && cue.endTime > video.currentTime).sort((a, b) => b.startTime - a.startTime)[0]
    const currentStart = activeCue?.startTime ?? video.currentTime
    const target = direction < 0
      ? [...cues].reverse().find((cue) => cue.startTime < currentStart - 0.001)
      : cues.find((cue) => cue.startTime > currentStart + 0.001)
    if (!target) { setAnnouncement(direction < 0 ? 'There is no earlier subtitle cue.' : cues.length ? 'There is no later subtitle cue.' : 'No timed cues are available.'); return }
    video.currentTime = target.startTime
    setAnnouncement('Jumped to subtitle cue at ' + formatCueTime(target.startTime) + '.')
  }

  const previewStyle = {
    color: appearance.highContrast ? '#fff' : colors[appearance.color],
    backgroundColor: appearance.highContrast ? 'rgb(0 0 0 / 94%)' : backgrounds[appearance.background],
    fontSize: sizes[appearance.size],
    fontFamily: fonts[appearance.font],
    textShadow: appearance.shadow || appearance.highContrast ? '0 1px 3px #000, 0 2px 7px rgb(0 0 0 / 85%)' : 'none',
    textAlign: appearance.align === 'start' ? 'left' : appearance.align === 'end' ? 'right' : 'center',
  } as const

  return <>
    <div className="subtitle-studio-mount" ref={setHost} />
    {host && createPortal(
      <section aria-labelledby="subtitle-studio-title" className={'subtitle-studio' + (appearance.reduceMotion ? ' subtitle-studio--reduced-motion' : '')}>
        <details open onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary><span className="subtitle-studio__icon"><Subtitles size={17} aria-hidden="true" /></span><span><strong id="subtitle-studio-title">Subtitle &amp; Accessibility Studio</strong><small>Make every line easier to follow.</small></span><ChevronDown className="subtitle-studio__chevron" size={16} aria-hidden="true" /></summary>
          {open && <div className="subtitle-studio__body">
            <details className="subtitle-studio__section" open>
              <summary><Languages size={15} aria-hidden="true" /><span>Subtitle languages</span><ChevronDown className="subtitle-studio__chevron" size={14} aria-hidden="true" /></summary>
              <div className="subtitle-studio__section-body">
                <label className="subtitle-studio__field">Playback subtitles<select aria-label="Playback subtitles" onChange={(event) => selectTrack(event.currentTarget.value)} value={active?.id ?? OFF}><option value={OFF}>Off</option>{tracks.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.kind} · {item.source}</option>)}</select></label>
                <p aria-atomic="true" aria-live="polite" className="subtitle-studio__note" role="status">Choose one real player track. {active ? 'Showing ' + active.label + ' (' + active.kind + ').' : 'Subtitles are off.'} Missing language metadata is shown as Unknown language.</p>
                {tracks.length === 0 && <p className="subtitle-studio__empty">No caption or subtitle tracks are available yet. Embedded tracks appear when the source or player exposes them.</p>}
                {imported.length > 0 && <ul className="subtitle-studio__import-list">{imported.map((item) => <li key={item.id}><span><strong>{item.name}</strong><small>{item.message}</small></span><button className="subtitle-studio__text-button" onClick={() => removeImported(item)} type="button">Remove</button></li>)}</ul>}
              </div>
            </details>
            <details className="subtitle-studio__section">
              <summary><Plus size={15} aria-hidden="true" /><span>Import subtitle</span><ChevronDown className="subtitle-studio__chevron" size={14} aria-hidden="true" /></summary>
              <div className="subtitle-studio__section-body">
                <div className={'subtitle-studio__drop' + (dragging ? ' is-dragging' : '')} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false) }} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files.item(0); if (event.dataTransfer.files.length !== 1 || !file) { setImportMessage('Choose one subtitle file at a time.'); return } void importFile(file) }}>
                  <strong>Keep subtitles on this device</strong><span>Drop one SRT or WebVTT file, or choose it from your device.</span>
                  <button className="subtitle-studio__button" onClick={() => inputRef.current?.click()} type="button">Choose subtitle file</button>
                  <input accept=".srt,.vtt,.txt,.ass,.ssa,.sub,.idx" aria-label="Choose subtitle file" className="subtitle-studio__file" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void importFile(file); event.currentTarget.value = '' }} ref={inputRef} type="file" />
                </div>
                <div className="subtitle-studio__form-grid">
                  <label className="subtitle-studio__field">Track type<select onChange={(event) => setKind(event.currentTarget.value as TrackKind)} value={kind}><option value="subtitles">Translated subtitles</option><option value="captions">Captions with sound cues</option></select></label>
                  <label className="subtitle-studio__field">Language code<input autoComplete="off" maxLength={35} onChange={(event) => setLanguageCode(event.currentTarget.value)} placeholder="Optional, e.g. en or pt-BR" value={languageCode} /></label>
                  <label className="subtitle-studio__field">Track label<input autoComplete="off" maxLength={80} onChange={(event) => setLabel(event.currentTarget.value)} placeholder="Optional display name" value={label} /></label>
                </div>
                <p className="subtitle-studio__note">SRT converts locally to WebVTT. TXT is accepted only with valid timed cues. Files are limited to 5 MB and never uploaded.</p>
                {importMessage && <p aria-live="polite" className="subtitle-studio__status" role="status">{importMessage}</p>}
              </div>
            </details>
            <details className="subtitle-studio__section">
              <summary><Type size={15} aria-hidden="true" /><span>Subtitle appearance</span><ChevronDown className="subtitle-studio__chevron" size={14} aria-hidden="true" /></summary>
              <div className="subtitle-studio__section-body">
                <div aria-label="Subtitle appearance preview" className={'subtitle-studio__preview subtitle-studio__preview--' + appearance.position}><span style={previewStyle}>A line worth keeping.<br />Still clear across two lines.</span></div>
                <div className="subtitle-studio__form-grid">
                  <label className="subtitle-studio__field">Text size<select onChange={(event) => updateAppearance('size', event.currentTarget.value as Appearance['size'])} value={appearance.size}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option><option value="xlarge">Extra large</option></select></label>
                  <label className="subtitle-studio__field">Text color<select onChange={(event) => { updateAppearance('color', event.currentTarget.value as Appearance['color']); updateAppearance('highContrast', false) }} value={appearance.color}><option value="white">Warm white</option><option value="warm">Soft amber</option><option value="yellow">Yellow</option></select></label>
                  <label className="subtitle-studio__field">Caption background<select onChange={(event) => { updateAppearance('background', event.currentTarget.value as Appearance['background']); updateAppearance('highContrast', false) }} value={appearance.background}><option value="off">Transparent</option><option value="soft">Soft box</option><option value="strong">High opacity box</option></select></label>
                  <label className="subtitle-studio__field">Font<select onChange={(event) => updateAppearance('font', event.currentTarget.value as Appearance['font'])} value={appearance.font}><option value="sans">Sans serif</option><option value="serif">Serif</option><option value="mono">Monospaced</option></select></label>
                  <label className="subtitle-studio__field">Position<select onChange={(event) => updateAppearance('position', event.currentTarget.value as Appearance['position'])} value={appearance.position}><option value="bottom">Bottom</option><option value="middle">Middle</option><option value="top">Top</option></select></label>
                  <label className="subtitle-studio__field">Text alignment<select onChange={(event) => updateAppearance('align', event.currentTarget.value as Appearance['align'])} value={appearance.align}><option value="center">Center</option><option value="start">Start</option><option value="end">End</option></select></label>
                </div>
                <label className="subtitle-studio__check"><input checked={appearance.shadow} onChange={(event) => updateAppearance('shadow', event.currentTarget.checked)} type="checkbox" />Subtle text outline</label>
                <label className="subtitle-studio__check"><input checked={appearance.highContrast} onChange={(event) => updateAppearance('highContrast', event.currentTarget.checked)} type="checkbox" />High contrast captions</label>
                <button className="subtitle-studio__text-button" onClick={() => setAppearance({ ...initialAppearance, reduceMotion: appearance.reduceMotion })} type="button"><RotateCcw size={14} aria-hidden="true" />Reset appearance</button>
                <p className="subtitle-studio__note">Native cue styling varies by browser. Text style uses browser cue styling where available; position adjusts WebVTT cues exposed by the browser.</p>
              </div>
            </details>
            <details className="subtitle-studio__section">
              <summary><RotateCcw size={15} aria-hidden="true" /><span>Synchronization &amp; navigation</span><ChevronDown className="subtitle-studio__chevron" size={14} aria-hidden="true" /></summary>
              <div className="subtitle-studio__section-body">
                <p className="subtitle-studio__current-cue">{currentCue ? <><strong>{formatCueTime(currentCue.startTime)}</strong>{isVttCue(currentCue) ? currentCue.text : 'Subtitle cue'}</> : 'No subtitle cue is active at this moment.'}</p>
                <div className="subtitle-studio__nav-row"><button className="subtitle-studio__button" disabled={!selected} onClick={() => navigateCue(-1)} type="button">Previous cue</button><span className="subtitle-studio__offset-readout">{selected ? selected.label + ' · ' + (offset >= 0 ? '+' : '') + offset.toFixed(1) + ' s' : 'No track selected'}</span><button className="subtitle-studio__button" disabled={!selected} onClick={() => navigateCue(1)} type="button">Next cue</button></div>
                <div className="subtitle-studio__sync-row"><button aria-label="Advance subtitle by 0.1 seconds" className="subtitle-studio__icon-button" disabled={!canShift} onClick={() => nudgeOffset(0.1)} type="button"><Plus size={16} aria-hidden="true" /></button><button aria-label="Delay subtitle by 0.1 seconds" className="subtitle-studio__icon-button" disabled={!canShift} onClick={() => nudgeOffset(-0.1)} type="button"><Minus size={16} aria-hidden="true" /></button><button className="subtitle-studio__text-button" disabled={!canShift || offset === 0} onClick={() => selected && setOffsets((value) => ({ ...value, [selected.id]: 0 }))} type="button">Reset offset</button></div>
                <label className="subtitle-studio__field">Subtitle sync offset<input aria-label="Subtitle synchronization offset in seconds" disabled={!canShift} max="10" min="-10" onChange={(event) => selected && setOffsets((value) => ({ ...value, [selected.id]: Number(event.currentTarget.value) }))} step="0.1" type="range" value={offset} /><span className="subtitle-studio__note">{canShift ? 'Offsets are independent for each track.' : 'This track does not expose editable WebVTT cue timing.'}</span></label>
                <div className="subtitle-studio__nav-row"><button className="subtitle-studio__text-button" disabled={!canShift} onClick={() => nudgeOffset(-0.5)} type="button">Delay 0.5 s</button><button className="subtitle-studio__text-button" disabled={!canShift} onClick={() => nudgeOffset(0.5)} type="button">Advance 0.5 s</button></div>
                <p aria-live="polite" className="subtitle-studio__sr-status">{announcement}</p>
                <p className="subtitle-studio__note">Timing changes subtitles, never video playback. Offsets are held in memory; imported source files are not modified.</p>
              </div>
            </details>
            <details className="subtitle-studio__section">
              <summary><Captions size={15} aria-hidden="true" /><span>Accessibility preferences</span><ChevronDown className="subtitle-studio__chevron" size={14} aria-hidden="true" /></summary>
              <div className="subtitle-studio__section-body">
                <label className="subtitle-studio__check"><input checked={Boolean(active)} disabled={!tracks.length} onChange={(event) => selectTrack(event.currentTarget.checked ? preferredId ?? tracks[0]?.id ?? OFF : OFF)} type="checkbox" />Show subtitles during playback</label>
                <label className="subtitle-studio__check"><input checked={appearance.size === 'large' || appearance.size === 'xlarge'} onChange={(event) => updateAppearance('size', event.currentTarget.checked ? 'large' : 'medium')} type="checkbox" />Use larger subtitle text</label>
                <label className="subtitle-studio__check"><input checked={appearance.highContrast} onChange={(event) => updateAppearance('highContrast', event.currentTarget.checked)} type="checkbox" />High contrast captions</label>
                <label className="subtitle-studio__check"><input checked={appearance.reduceMotion} onChange={(event) => updateAppearance('reduceMotion', event.currentTarget.checked)} type="checkbox" />Reduce interface motion</label>
                <p className="subtitle-studio__note">Keyboard: focus the player and press C to toggle captions. Tab through subtitle controls; native player menus keep their own keyboard behavior.</p>
                <p className="subtitle-studio__description">{hasDescriptions ? 'A text description track is exposed. This does not guarantee a spoken audio-description mix.' : 'This source exposes no audio-description text track. Reel Atlas does not synthesize descriptions.'}</p>
              </div>
            </details>
            <details className="subtitle-studio__section">
              <summary><Download size={15} aria-hidden="true" /><span>External subtitle service</span><ChevronDown className="subtitle-studio__chevron" size={14} aria-hidden="true" /></summary>
              <div className="subtitle-studio__section-body">
                <p className="subtitle-studio__empty"><strong>External subtitle service not configured.</strong> OpenSubtitles requires an application API key and API User-Agent. A trusted server-side proxy is needed to keep the key out of browser code. Local import works without an account.</p>
                <a className="subtitle-studio__link" href="https://ai.opensubtitles.com/api-docs" rel="noreferrer" target="_blank">OpenSubtitles API documentation</a>
              </div>
            </details>
          </div>}
        </details>
      </section>, host)}
  </>
}
