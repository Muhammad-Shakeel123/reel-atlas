import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { usePlayer } from '@videojs/react/video'
import { Aperture, ChevronDown, Clock3, Expand, Frame, Gauge, LockKeyhole, Maximize2, Moon, Move, RotateCcw, Scan, Sun, TimerReset, UnlockKeyhole, Volume2 } from 'lucide-react'
import type { MediaSelection } from './source'
import { fileSessionId, getResumeStorageKey, readPersistentResume, readSessionResume, removePersistentResume, removeSessionResume, writePersistentResume, writeSessionResume } from './resume-storage'

type Props = {
  host: HTMLElement | null
  overlayHost: HTMLElement | null
  videoRef: RefObject<HTMLVideoElement | null>
  source: MediaSelection
  touchLocked: boolean
  onTouchLockedChange: (locked: boolean) => void
  touchGesturesEnabled: boolean
  onTouchGesturesChange: (enabled: boolean) => void
}
type FitMode = 'auto' | 'fit' | 'fill' | 'stretch'
type Point = { x: number; y: number }
type GestureSettings = { brightness: number; doubleTapSeconds: number }
type ResumeOffer = { position: number; duration: number } | null
type TimerChoice = '5' | '10' | '15' | '30' | '45' | '60' | 'custom'
type OrientationLockApi = Omit<ScreenOrientation, 'lock' | 'unlock'> & { lock?: (orientation: OrientationLockType) => Promise<void>; unlock?: () => void }

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }
function formatTime(seconds: number, decimals = false) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds - minutes * 60
  return decimals ? `${minutes}:${remainder.toFixed(2).padStart(5, '0')}` : `${minutes}:${String(Math.floor(remainder)).padStart(2, '0')}`
}
function getSeekBounds(video: HTMLVideoElement) {
  if (video.seekable.length) return { start: video.seekable.start(0), end: video.seekable.end(video.seekable.length - 1) }
  if (Number.isFinite(video.duration) && video.duration > 0) return { start: 0, end: video.duration }
  return null
}
function getOrientationApi(): OrientationLockApi | null {
  if (typeof screen === 'undefined' || !screen.orientation) return null
  return screen.orientation as OrientationLockApi
}

export function AdvancedPlaybackStudio({ host, overlayHost, videoRef, source, touchLocked, onTouchLockedChange, touchGesturesEnabled, onTouchGesturesChange }: Props) {
  const playbackRate = usePlayer((state) => state.playbackRate)
  const playbackRateAvailability = usePlayer((state) => state.playbackRateAvailability)
  const setPlaybackRate = usePlayer((state) => state.setPlaybackRate)
  const [panelOpen, setPanelOpen] = useState(false)
  const [fitMode, setFitMode] = useState<FitMode>('auto')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [gestureSettings, setGestureSettings] = useState<GestureSettings>({ brightness: 1, doubleTapSeconds: 10 })
  const [feedback, setFeedback] = useState('')
  const [pointA, setPointA] = useState<number | null>(null)
  const [pointB, setPointB] = useState<number | null>(null)
  const [loopEnabled, setLoopEnabled] = useState(false)
  const [loopMessage, setLoopMessage] = useState('')
  const loopSeeking = useRef(false)
  const [framePosition, setFramePosition] = useState<number | null>(null)
  const [mediaDuration, setMediaDuration] = useState(0)
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [screenshotMessage, setScreenshotMessage] = useState('')
  const [resumeKey, setResumeKey] = useState<string | null>(null)
  const [resumePersistent, setResumePersistent] = useState(false)
  const [resumeOffer, setResumeOffer] = useState<ResumeOffer>(null)
  const [resumeMessage, setResumeMessage] = useState('')
  const [orientation, setOrientation] = useState('')
  const [orientationMessage, setOrientationMessage] = useState('')
  const [timerChoice, setTimerChoice] = useState<TimerChoice>('15')
  const [customMinutes, setCustomMinutes] = useState(20)
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(null)
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null)
  const [sleepMessage, setSleepMessage] = useState('')
  const [screenshotBusy, setScreenshotBusy] = useState(false)
  const gestureSettingsRef = useRef(gestureSettings)
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  const feedbackTimeoutRef = useRef<number | null>(null)
  const orientationLockedRef = useRef(false)

  useEffect(() => { gestureSettingsRef.current = gestureSettings }, [gestureSettings])
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { panRef.current = pan }, [pan])

  const showFeedback = useCallback((text: string) => {
    setFeedback(text)
    if (feedbackTimeoutRef.current !== null) window.clearTimeout(feedbackTimeoutRef.current)
    feedbackTimeoutRef.current = window.setTimeout(() => { setFeedback((current) => current === text ? '' : current); feedbackTimeoutRef.current = null }, 800)
  }, [])

  useEffect(() => () => { if (feedbackTimeoutRef.current !== null) window.clearTimeout(feedbackTimeoutRef.current) }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const update = () => setMediaDuration(Number.isFinite(video.duration) ? video.duration : 0)
    video.addEventListener('loadedmetadata', update)
    video.addEventListener('durationchange', update)
    update()
    return () => { video.removeEventListener('loadedmetadata', update); video.removeEventListener('durationchange', update) }
  }, [source.id, videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if ('preservesPitch' in video) video.preservesPitch = true
    const skin = video.closest<HTMLElement>('.media-skin')
    if (!skin) return
    const oldFit = skin.style.getPropertyValue('--media-object-fit')
    const oldTransform = video.style.transform
    const oldOrigin = video.style.transformOrigin
    const oldFilter = video.style.filter
    const oldTouchAction = video.style.touchAction
    const fit = fitMode === 'fill' ? 'cover' : fitMode === 'stretch' ? 'fill' : 'contain'
    skin.style.setProperty('--media-object-fit', fit)
    video.style.transformOrigin = 'center center'
    video.style.transform = zoom > 1 ? `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` : ''
    video.style.filter = `brightness(${gestureSettings.brightness})`
    video.style.touchAction = touchGesturesEnabled && !touchLocked ? 'none' : oldTouchAction
    return () => {
      if (oldFit) skin.style.setProperty('--media-object-fit', oldFit)
      else skin.style.removeProperty('--media-object-fit')
      video.style.transform = oldTransform
      video.style.transformOrigin = oldOrigin
      video.style.filter = oldFilter
      video.style.touchAction = oldTouchAction
    }
  }, [fitMode, gestureSettings.brightness, pan.x, pan.y, touchGesturesEnabled, touchLocked, videoRef, zoom])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !touchGesturesEnabled || touchLocked) return
    const pointers = new Map<number, Point>()
    let mode: 'candidate' | 'seek' | 'volume' | 'brightness' | 'pan' | 'pinch' | null = null
    let start: Point = { x: 0, y: 0 }
    let startTime = 0
    let startValue = 0
    let startPan: Point = { x: 0, y: 0 }
    let pinchDistance = 0
    let pinchZoom = 1
    let previousTap: { at: number; side: 'left' | 'right' } | null = null
    let pendingSeek: number | null = null
    let lastSeekWrite = 0
    let feedbackFrame = 0
    let feedbackText = ''
    const publishFeedback = (value: string) => {
      feedbackText = value
      if (feedbackFrame) return
      feedbackFrame = requestAnimationFrame(() => { feedbackFrame = 0; setFeedback(feedbackText) })
    }
    const writeSeek = (time: number) => {
      const bounds = getSeekBounds(video)
      if (!bounds) return
      const target = clamp(time, bounds.start, bounds.end)
      pendingSeek = target
      if (performance.now() - lastSeekWrite >= 90) { video.currentTime = target; lastSeekWrite = performance.now() }
      publishFeedback(`Seeking · ${formatTime(target)}`)
    }
    const onDown = (event: PointerEvent) => {
      if ((event.pointerType !== 'touch' && event.pointerType !== 'pen') || event.target !== video) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 2) {
        const [first, second] = Array.from(pointers.values())
        pinchDistance = Math.hypot(first.x - second.x, first.y - second.y)
        pinchZoom = zoomRef.current
        mode = 'pinch'
        return
      }
      start = { x: event.clientX, y: event.clientY }
      startTime = video.currentTime
      startPan = panRef.current
      if (zoomRef.current > 1) { mode = 'pan'; startValue = zoomRef.current }
      else mode = 'candidate'
    }
    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const point = pointers.get(event.pointerId)!
      if (mode === 'pinch' && pointers.size >= 2) {
        const [first, second] = Array.from(pointers.values())
        const distance = Math.hypot(first.x - second.x, first.y - second.y)
        const nextZoom = clamp(pinchZoom * distance / Math.max(1, pinchDistance), 1, 3)
        setZoom(nextZoom)
        if (nextZoom <= 1) setPan({ x: 0, y: 0 })
        publishFeedback(`Zoom · ${Math.round(nextZoom * 100)}%`)
        event.preventDefault()
        return
      }
      if (!mode || mode === 'pinch') return
      const dx = point.x - start.x
      const dy = point.y - start.y
      const width = Math.max(1, video.clientWidth)
      const height = Math.max(1, video.clientHeight)
      if (mode === 'candidate' && Math.max(Math.abs(dx), Math.abs(dy)) > 14) {
        mode = Math.abs(dx) > Math.abs(dy) ? 'seek' : start.x > video.getBoundingClientRect().left + width / 2 ? 'volume' : 'brightness'
        startValue = mode === 'volume' ? video.volume : gestureSettingsRef.current.brightness
      }
      if (mode === 'seek') {
        const bounds = getSeekBounds(video)
        if (bounds) writeSeek(startTime + dx / width * Math.min(30, bounds.end - bounds.start))
        event.preventDefault()
      } else if (mode === 'volume') {
        const nextVolume = clamp(startValue - dy / height, 0, 1)
        video.volume = nextVolume
        if (nextVolume > 0) video.muted = false
        publishFeedback(`Volume · ${Math.round(nextVolume * 100)}%`)
        event.preventDefault()
      } else if (mode === 'brightness') {
        const nextBrightness = clamp(startValue - dy / height * 0.8, 0.5, 1.5)
        setGestureSettings((current) => ({ ...current, brightness: nextBrightness }))
        publishFeedback(`In-player brightness · ${Math.round(nextBrightness * 100)}%`)
        event.preventDefault()
      } else if (mode === 'pan') {
        const maxX = (zoomRef.current - 1) * width / 2
        const maxY = (zoomRef.current - 1) * height / 2
        setPan({ x: clamp(startPan.x + dx, -maxX, maxX), y: clamp(startPan.y + dy, -maxY, maxY) })
        publishFeedback('Pan video')
        event.preventDefault()
      }
    }
    const onUp = (event: PointerEvent) => {
      const point = pointers.get(event.pointerId)
      pointers.delete(event.pointerId)
      if (mode === 'seek' && pendingSeek !== null) video.currentTime = pendingSeek
      if (mode === 'candidate' && point) {
        const now = performance.now()
        const side = start.x < video.getBoundingClientRect().left + video.clientWidth * 0.35 ? 'left' : start.x > video.getBoundingClientRect().left + video.clientWidth * 0.65 ? 'right' : null
        if (side && previousTap?.side === side && now - previousTap.at < 320) {
          const amount = gestureSettingsRef.current.doubleTapSeconds * (side === 'left' ? -1 : 1)
          const bounds = getSeekBounds(video)
          if (bounds) { video.currentTime = clamp(video.currentTime + amount, bounds.start, bounds.end); showFeedback(`${amount > 0 ? '+' : '−'}${Math.abs(amount)} sec`) }
          previousTap = null
        } else if (side) previousTap = { at: now, side }
      }
      if (pointers.size < 2) { if (mode === 'pinch') mode = zoomRef.current > 1 ? 'pan' : null; if (pointers.size === 0) mode = null }
      if (pointers.size === 0) pendingSeek = null
      if (mode === null) publishFeedback('')
    }
    const onCancel = (event: PointerEvent) => { pointers.delete(event.pointerId); mode = null; pendingSeek = null; publishFeedback('') }
    video.addEventListener('pointerdown', onDown)
    video.addEventListener('pointermove', onMove, { passive: false })
    video.addEventListener('pointerup', onUp)
    video.addEventListener('pointercancel', onCancel)
    return () => {
      video.removeEventListener('pointerdown', onDown)
      video.removeEventListener('pointermove', onMove)
      video.removeEventListener('pointerup', onUp)
      video.removeEventListener('pointercancel', onCancel)
      if (feedbackFrame) cancelAnimationFrame(feedbackFrame)
    }
  }, [showFeedback, touchGesturesEnabled, touchLocked, videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !loopEnabled || pointA === null || pointB === null || pointB <= pointA) return
    const onTimeUpdate = () => {
      if (loopSeeking.current || video.currentTime < pointB - 0.04) return
      loopSeeking.current = true
      video.currentTime = pointA
    }
    const onSeeked = () => { loopSeeking.current = false }
    const onEnded = () => {
      if (video.currentTime + 0.1 < pointB) return
      loopSeeking.current = true
      video.currentTime = pointA
      void video.play().catch(() => setLoopMessage('Playback was blocked at the loop boundary. Press play to continue the range.'))
    }
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('ended', onEnded)
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('ended', onEnded)
      loopSeeking.current = false
    }
  }, [loopEnabled, pointA, pointB, videoRef])

  const clearResume = useCallback(() => {
    if (resumeKey && resumePersistent) { try { removePersistentResume(resumeKey) } catch { /* Storage can be unavailable. */ } }
    if (resumeKey && !resumePersistent) removeSessionResume(resumeKey)
    setResumeOffer(null)
    setResumeMessage('Saved progress cleared.')
  }, [resumeKey, resumePersistent])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let active = true
    const localId = fileSessionId(source)
    const resolveKey = async () => {
      try {
        const key = localId ? `session:${localId}` : await getResumeStorageKey(source)
        if (!active) return
        setResumePersistent(!localId && Boolean(key))
        setResumeKey(key)
        if (!key && !localId && (source.kind === 'url' || source.kind === 'hls')) {
          const url = new URL(source.src)
          setResumeMessage(url.search || url.username || url.password
            ? 'Resume is unavailable for URLs with query parameters or credentials because they may contain private or expiring access tokens.'
            : 'This source cannot be safely identified for saved progress. Playback still works normally.')
        }
        const saved = key ? localId ? readSessionResume(key)?.position : readPersistentResume(key)?.position : undefined
        const offerIfReady = () => {
          if (!active || saved === undefined || !Number.isFinite(saved) || saved < 5) return
          const duration = video.duration
          if (Number.isFinite(duration) && duration > 0 && saved < duration - Math.max(20, duration * 0.05)) setResumeOffer({ position: saved, duration })
          else if (key && localId === null) { try { removePersistentResume(key) } catch { /* Storage can be unavailable. */ } }
        }
        video.addEventListener('loadedmetadata', offerIfReady)
        const cleanup = () => video.removeEventListener('loadedmetadata', offerIfReady)
        if (video.readyState >= 1) offerIfReady()
        return cleanup
      } catch {
        if (active) { setResumeKey(null); setResumeMessage('Resume storage is unavailable for this source in this browser.') }
      }
    }
    let removeMetadata: (() => void) | undefined
    void resolveKey().then((cleanup) => { if (!active) cleanup?.(); else removeMetadata = cleanup })
    return () => { active = false; removeMetadata?.() }
  }, [source, videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !resumeKey) return
    let lastSaved = 0
    const save = () => {
      const duration = video.duration
      const position = video.currentTime
      if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return
      if (position < 5 || position >= duration - Math.max(20, duration * 0.05)) {
        if (resumePersistent) { try { removePersistentResume(resumeKey) } catch { /* Storage can be unavailable. */ } }
        else removeSessionResume(resumeKey)
        return
      }
      const now = Date.now()
      if (now - lastSaved < 10_000 && video.paused) return
      lastSaved = now
      if (resumePersistent) {
        try { writePersistentResume(resumeKey, { position, duration }) } catch { setResumeMessage('This browser could not save playback progress.') }
      } else writeSessionResume(resumeKey, { position, duration })
    }
    const interval = window.setInterval(save, 15_000)
    video.addEventListener('pause', save)
    video.addEventListener('ended', save)
    document.addEventListener('visibilitychange', save)
    window.addEventListener('pagehide', save)
    return () => {
      save()
      window.clearInterval(interval)
      video.removeEventListener('pause', save)
      video.removeEventListener('ended', save)
      document.removeEventListener('visibilitychange', save)
      window.removeEventListener('pagehide', save)
    }
  }, [resumeKey, resumePersistent, videoRef])

  useEffect(() => {
    if (!screenshotUrl) return
    return () => URL.revokeObjectURL(screenshotUrl)
  }, [screenshotUrl])

  useEffect(() => {
    if (!timerEndsAt) return
    const video = videoRef.current
    if (!video) return
    let expired = false
    const update = () => {
      const remaining = Math.max(0, timerEndsAt - Date.now())
      setTimerRemaining(remaining)
      if (remaining <= 0 && !expired) { expired = true; video.pause(); setTimerEndsAt(null); setTimerRemaining(null); setSleepMessage('Timer ended. Playback paused.') }
    }
    const interval = window.setInterval(update, 15_000)
    document.addEventListener('visibilitychange', update)
    const timeout = window.setTimeout(update, Math.max(0, timerEndsAt - Date.now()))
    update()
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
      document.removeEventListener('visibilitychange', update)
    }
  }, [timerEndsAt, videoRef])

  useEffect(() => {
    const orientation = screen.orientation
    const update = () => setOrientation(orientation?.type ?? '')
    update()
    orientation?.addEventListener('change', update)
    return () => orientation?.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const releaseWhenFullscreenEnds = () => {
      if (document.fullscreenElement || !orientationLockedRef.current) return
      getOrientationApi()?.unlock?.()
      orientationLockedRef.current = false
    }
    document.addEventListener('fullscreenchange', releaseWhenFullscreenEnds)
    return () => {
      document.removeEventListener('fullscreenchange', releaseWhenFullscreenEnds)
      if (orientationLockedRef.current) getOrientationApi()?.unlock?.()
      orientationLockedRef.current = false
    }
  }, [])

  const stepFrame = (direction: -1 | 1) => {
    const video = videoRef.current
    if (!video) return
    const bounds = getSeekBounds(video)
    if (!bounds) { setFramePosition(video.currentTime); return }
    const target = clamp(video.currentTime + direction / 30, bounds.start, bounds.end)
    video.currentTime = target
    setFramePosition(target)
  }

  const readCurrentTime = () => setFramePosition(videoRef.current?.currentTime ?? 0)

  const captureFrame = async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) { setScreenshotMessage('Wait until a video frame is ready, then capture again.'); return }
    if (screenshotBusy) return
    setScreenshotBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas capture is unavailable in this browser.')
      context.filter = `brightness(${gestureSettings.brightness})`
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('The image could not be created.')), 'image/png'))
      const url = URL.createObjectURL(blob)
      setScreenshotUrl(url)
      setScreenshotMessage('Frame captured from the active video.')
    } catch {
      setScreenshotMessage('This source does not allow frame capture. Cross-origin or protected media may block screenshots.')
    } finally {
      setScreenshotBusy(false)
    }
  }

  const downloadFrame = () => {
    if (!screenshotUrl) return
    const link = document.createElement('a')
    link.href = screenshotUrl
    link.download = `reel-atlas-frame-${Date.now()}.png`
    link.click()
  }

  const copyFrame = async () => {
    if (!screenshotUrl) return
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard image writing is not available.')
      const response = await fetch(screenshotUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setScreenshotMessage('Frame copied to the clipboard.')
    } catch { setScreenshotMessage('Clipboard image access is unavailable. Download the PNG instead.') }
  }

  const setRepeatPointA = () => {
    const video = videoRef.current
    if (!video) return
    setPointA(video.currentTime)
    setLoopEnabled(false)
    setLoopMessage('Point A set.')
    if (pointB !== null && video.currentTime >= pointB) setPointB(null)
  }
  const setRepeatPointB = () => {
    const video = videoRef.current
    if (!video) return
    if (pointA === null || video.currentTime <= pointA + 0.1) { setLoopMessage('Set A first, then set B at a later time.'); return }
    setPointB(video.currentTime)
    setLoopMessage('Point B set. Turn on repeat to loop this range.')
  }
  const toggleLoop = () => {
    if (pointA === null || pointB === null || pointB <= pointA) { setLoopMessage('A valid A–B range is required before repeating.'); return }
    setLoopEnabled((enabled) => !enabled)
    setLoopMessage(loopEnabled ? 'A–B repeat paused.' : 'Repeating the selected range. This is browser seeking, not frame-accurate looping.')
  }
  const chooseResume = (resume: boolean) => {
    const video = videoRef.current
    if (!video || !resumeOffer) return
    video.currentTime = resume ? resumeOffer.position : 0
    setResumeOffer(null)
    if (!resume) clearResume()
    else setResumeMessage(`Resuming near ${formatTime(resumeOffer.position)}.`)
    void video.play().catch(() => setResumeMessage('Position restored. Press play to continue.'))
  }
  const startSleepTimer = () => {
    const minutes = timerChoice === 'custom' ? customMinutes : Number(timerChoice)
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 480) { setSleepMessage('Choose a duration between 1 and 480 minutes.'); return }
    setTimerEndsAt(Date.now() + minutes * 60_000)
    setSleepMessage('Sleep timer started.')
  }
  const requestLandscape = async () => {
    const orientationApi = getOrientationApi()
    if (!orientationApi?.lock) { setOrientationMessage('Orientation lock is not supported here. Use your device rotation controls.'); return }
    if (!document.fullscreenElement) { setOrientationMessage('Enter fullscreen first; the browser only allows orientation requests from fullscreen on some devices.'); return }
    try { await orientationApi.lock('landscape'); orientationLockedRef.current = true; setOrientationMessage('Landscape preference requested from the browser.') }
    catch { setOrientationMessage('The browser or device denied orientation lock. Use your device rotation controls.') }
  }

  if (!host) return null
  return <>
    {createPortal(
      <section className="advanced-playback-panel" aria-labelledby="advanced-playback-title">
        <details open onToggle={(event) => setPanelOpen(event.currentTarget.open)}>
          <summary><span className="advanced-panel-icon"><Scan size={17} aria-hidden="true" /></span><span><strong id="advanced-playback-title">Advanced Playback Studio</strong><small>More than playback. Explore every moment.</small></span><ChevronDown className="advanced-chevron" size={16} aria-hidden="true" /></summary>
          {panelOpen && <div className="advanced-panel-content">
            <details className="advanced-section" open><summary><Move size={15} aria-hidden="true" /><span>Gesture controls</span><ChevronDown className="advanced-chevron" size={14} aria-hidden="true" /></summary><div className="advanced-section-body">
              <label className="advanced-check"><input checked={touchGesturesEnabled} onChange={(event) => onTouchGesturesChange(event.target.checked)} type="checkbox" />Enable touch gestures on the video picture</label>
              <p className="advanced-explainer">Swipe horizontally to seek, swipe up or down on the right half for volume and on the left half for in-player brightness. Double-tap either edge to seek. Touches on controls keep their normal behavior.</p>
              <label className="advanced-control-row">Double-tap seek<select onChange={(event) => setGestureSettings((value) => ({ ...value, doubleTapSeconds: Number(event.target.value) }))} value={gestureSettings.doubleTapSeconds}><option value={5}>5 seconds</option><option value={10}>10 seconds</option><option value={15}>15 seconds</option></select></label>
              <label className="advanced-control-row"><span><Sun size={15} aria-hidden="true" />In-player brightness <output>{Math.round(gestureSettings.brightness * 100)}%</output></span><input aria-label="In-player brightness" max="150" min="50" onChange={(event) => setGestureSettings((value) => ({ ...value, brightness: Number(event.target.value) / 100 }))} type="range" value={Math.round(gestureSettings.brightness * 100)} /></label>
              <p className="advanced-explainer">This changes only the video’s appearance in Reel Atlas. System brightness still uses your device controls.</p>
            </div></details>
            <details className="advanced-section"><summary><Expand size={15} aria-hidden="true" /><span>Display &amp; zoom</span><ChevronDown className="advanced-chevron" size={14} aria-hidden="true" /></summary><div className="advanced-section-body">
              <fieldset className="advanced-mode-group"><legend>Video fit</legend>{(['auto', 'fit', 'fill', 'stretch'] as const).map((mode) => <label key={mode}><input checked={fitMode === mode} onChange={() => { setFitMode(mode); if (mode === 'auto') { setZoom(1); setPan({ x: 0, y: 0 }) } }} name="video-fit" type="radio" /><span>{mode === 'auto' ? 'Auto / original ratio' : mode[0].toUpperCase() + mode.slice(1)}</span></label>)}</fieldset>
              {fitMode === 'stretch' && <p className="advanced-warning">Stretch fills the player but can distort the picture’s proportions.</p>}
              <label className="advanced-control-row"><span><Maximize2 size={15} aria-hidden="true" />Zoom <output>{Math.round(zoom * 100)}%</output></span><input aria-label="Video zoom" max="300" min="100" onChange={(event) => { setZoom(Number(event.target.value) / 100); if (Number(event.target.value) === 100) setPan({ x: 0, y: 0 }) }} type="range" value={Math.round(zoom * 100)} /></label>
              <p className="advanced-explainer">Pinch to zoom on touch screens. Drag the zoomed picture to pan. Auto shows the whole image at its natural proportions inside the player.</p>
              <button className="advanced-button" onClick={() => { setFitMode('auto'); setZoom(1); setPan({ x: 0, y: 0 }) }} type="button"><RotateCcw size={14} aria-hidden="true" />Reset zoom and fit</button>
            </div></details>
            <details className="advanced-section"><summary><Gauge size={15} aria-hidden="true" /><span>Playback speed</span><ChevronDown className="advanced-chevron" size={14} aria-hidden="true" /></summary><div className="advanced-section-body">
              <p className="advanced-current-value">Current speed <strong>{playbackRate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×</strong></p>
              <p className="advanced-explainer">Choose a preset in the player’s Settings → Playback speed menu. Rates from 0.25× to 4× are offered where the media allows them. Pitch preservation depends on the browser.</p>
              <button className="advanced-button" disabled={playbackRateAvailability === 'unsupported' || playbackRate === 1} onClick={() => setPlaybackRate(1)} type="button">Reset to 1×</button>
              {playbackRateAvailability === 'unsupported' && <p className="advanced-warning">This source does not expose playback-rate control.</p>}
            </div></details>
            <details className="advanced-section"><summary><RotateCcw size={15} aria-hidden="true" /><span>A–B repeat</span><ChevronDown className="advanced-chevron" size={14} aria-hidden="true" /></summary><div className="advanced-section-body">
              <div className="advanced-point-row"><span>A <strong>{pointA === null ? '—' : formatTime(pointA, true)}</strong></span><button className="advanced-button" onClick={setRepeatPointA} type="button">Set A here</button></div>
              <div className="advanced-point-row"><span>B <strong>{pointB === null ? '—' : formatTime(pointB, true)}</strong></span><button className="advanced-button" disabled={pointA === null} onClick={setRepeatPointB} type="button">Set B here</button></div>
              {pointA !== null && pointB !== null && mediaDuration > 0 && <div aria-label={`Selected loop range from ${formatTime(pointA)} to ${formatTime(pointB)}`} className="advanced-loop-range"><span style={{ left: `${pointA / mediaDuration * 100}%`, right: `${100 - pointB / mediaDuration * 100}%` }} /></div>}
              <div className="advanced-button-row"><button aria-pressed={loopEnabled} className="advanced-button" onClick={toggleLoop} type="button">{loopEnabled ? 'Pause repeat' : 'Repeat range'}</button><button className="advanced-text-button" onClick={() => { setLoopEnabled(false); setPointA(null); setPointB(null); setLoopMessage('A–B range cleared.') }} type="button">Clear range</button></div>
              <p aria-live="polite" className="advanced-feedback-text">{loopMessage || 'Set A and B at different times to create a repeat range.'}</p>
              <p className="advanced-explainer">The player seeks back to A when it reaches B. Browser seeking is not frame-accurate.</p>
            </div></details>
            <details className="advanced-section"><summary><Frame size={15} aria-hidden="true" /><span>Precision frame lab</span><ChevronDown className="advanced-chevron" size={14} aria-hidden="true" /></summary><div className="advanced-section-body">
              <p className="advanced-current-value">Current time <strong>{framePosition === null ? 'Not sampled' : formatTime(framePosition, true)}</strong></p>
              <button className="advanced-text-button" onClick={readCurrentTime} type="button">Read current time</button>
              <div className="advanced-button-row"><button className="advanced-button" onClick={() => stepFrame(-1)} type="button">Previous estimated frame</button><button className="advanced-button" onClick={() => stepFrame(1)} type="button">Next estimated frame</button></div>
              <p className="advanced-explainer">Uses an estimated 30 fps interval (about 33 ms). The browser may seek to a nearby decodable frame; this is not frame-accurate editing.</p>
            </div></details>
            <details className="advanced-section"><summary><Aperture size={15} aria-hidden="true" /><span>Screenshot studio</span><ChevronDown className="advanced-chevron" size={14} aria-hidden="true" /></summary><div className="advanced-section-body">
              <button className="advanced-button" disabled={screenshotBusy} onClick={() => void captureFrame()} type="button"><Aperture size={14} aria-hidden="true" />{screenshotBusy ? 'Capturing…' : 'Capture current frame'}</button>
              {screenshotUrl && <><img alt="Preview of the captured video frame" className="advanced-screenshot-preview" src={screenshotUrl} /><div className="advanced-button-row"><button className="advanced-button" onClick={downloadFrame} type="button">Download PNG</button><button className="advanced-button" onClick={() => void copyFrame()} type="button">Copy image</button></div></>}
              <p aria-live="polite" className="advanced-feedback-text">{screenshotMessage || 'Captures the decoded video frame when the browser permits canvas access.'}</p>
            </div></details>
            <details className="advanced-section"><summary><Clock3 size={15} aria-hidden="true" /><span>Resume &amp; history</span><ChevronDown className="advanced-chevron" size={14} aria-hidden="true" /></summary><div className="advanced-section-body">
              {resumeOffer ? <><p className="advanced-explainer">Saved progress is available at {formatTime(resumeOffer.position)} of {formatTime(resumeOffer.duration)}.</p><div className="advanced-button-row"><button className="advanced-button" onClick={() => chooseResume(true)} type="button">Resume</button><button className="advanced-button" onClick={() => chooseResume(false)} type="button">Start from beginning</button></div><button className="advanced-text-button" onClick={clearResume} type="button">Clear saved progress</button></> : <p className="advanced-explainer">{resumeMessage || (resumePersistent ? 'Progress for eligible network sources is saved locally under a salted, opaque key. URL query strings are excluded.' : source.kind === 'file' ? 'Local-file progress is held only in this page session; the browser cannot reopen a local file after reload.' : 'Progress will be offered after this source has been watched for a little while.')}</p>}
              <p className="advanced-explainer">Local file contents and full source URLs are never saved.</p>
            </div></details>
            <details className="advanced-section"><summary><LockKeyhole size={15} aria-hidden="true" /><span>Touch / control lock</span><ChevronDown className="advanced-chevron" size={14} aria-hidden="true" /></summary><div className="advanced-section-body">
              <label className="advanced-check"><input checked={touchLocked} onChange={(event) => onTouchLockedChange(event.target.checked)} type="checkbox" />Lock on-screen touch controls</label>
              <p className="advanced-explainer">When locked, touch taps and gestures cannot change playback. Keyboard controls remain available, and an on-player unlock button stays visible. This does not lock screen orientation.</p>
            </div></details>
            <details className="advanced-section"><summary><Move size={15} aria-hidden="true" /><span>Orientation</span><ChevronDown className="advanced-chevron" size={14} aria-hidden="true" /></summary><div className="advanced-section-body">
              <p className="advanced-current-value">Device orientation <strong>{orientation || 'Not reported'}</strong></p>
              <button className="advanced-button" disabled={typeof getOrientationApi()?.lock !== 'function'} onClick={() => void requestLandscape()} type="button">Request landscape in fullscreen</button>
              {getOrientationApi()?.lock && <button className="advanced-text-button" onClick={() => { getOrientationApi()?.unlock?.(); orientationLockedRef.current = false; setOrientationMessage('Orientation preference released.') }} type="button">Release orientation preference</button>}
              <p className="advanced-explainer">Reel Atlas cannot rotate a physical device. If browser orientation locking is unavailable or denied, use your device’s rotation controls.</p>
              {orientationMessage && <p aria-live="polite" className="advanced-feedback-text">{orientationMessage}</p>}
            </div></details>
            <details className="advanced-section"><summary><Moon size={15} aria-hidden="true" /><span>Sleep timer</span><ChevronDown className="advanced-chevron" size={14} aria-hidden="true" /></summary><div className="advanced-section-body">
              <label className="advanced-control-row">Pause after<select onChange={(event) => setTimerChoice(event.target.value as TimerChoice)} value={timerChoice}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="custom">Custom</option></select></label>
              {timerChoice === 'custom' && <label className="advanced-control-row">Custom minutes<input aria-label="Custom sleep timer minutes" max="480" min="1" onChange={(event) => setCustomMinutes(Number(event.target.value))} type="number" value={customMinutes} /></label>}
              <div className="advanced-button-row"><button className="advanced-button" onClick={startSleepTimer} type="button"><TimerReset size={14} aria-hidden="true" />{timerEndsAt ? 'Restart timer' : 'Start timer'}</button>{timerEndsAt && <button className="advanced-text-button" onClick={() => { setTimerEndsAt(null); setTimerRemaining(null); setSleepMessage('Sleep timer cancelled.') }} type="button">Cancel</button>}</div>
              {timerRemaining !== null && <p aria-live="off" className="advanced-current-value">Time remaining <strong>{formatTime(timerRemaining / 1000)}</strong></p>}
              {sleepMessage && <p aria-live="polite" className="advanced-feedback-text">{sleepMessage}</p>}
              <p className="advanced-explainer">The timer uses wall-clock time. Background tabs and device sleep can delay the pause until the browser resumes.</p>
            </div></details>
          </div>}
        </details>
      </section>, host)}
    {overlayHost && createPortal(<>
      {touchLocked && <div className="advanced-control-lock" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}><span><LockKeyhole size={15} aria-hidden="true" /> Touch controls locked</span><button onClick={() => onTouchLockedChange(false)} type="button"><UnlockKeyhole size={15} aria-hidden="true" /> Unlock</button></div>}
      {feedback && <div aria-hidden="true" className="advanced-gesture-feedback">{feedback.startsWith('Volume') ? <Volume2 size={17} /> : feedback.startsWith('Brightness') ? <Sun size={17} /> : feedback.startsWith('Zoom') ? <Maximize2 size={17} /> : <Move size={17} />}{feedback}</div>}
    </>, overlayHost)}
  </>
}
