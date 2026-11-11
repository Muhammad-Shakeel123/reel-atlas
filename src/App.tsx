import { ArrowDown, ArrowUpRight, AudioLines, Bookmark, Captions, ChevronRight, Focus, Library, Maximize2, Monitor, Radio, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Video, VideoPlayer } from '@videojs/react/video'
import { VideoSkin } from '@/components/videojs/video/skin'
import { ReelAtlas } from '@/components/videojs/atlas/reel-atlas'
import { MediaSourcePicker } from '@/components/media-engine/MediaSourcePicker'
import { DeviceCompatibilityCenter } from '@/components/media-engine/DeviceCompatibilityCenter'
import { PlaybackDiagnostics } from '@/components/media-engine/PlaybackDiagnostics'
import { AdvancedPlaybackStudio } from '@/components/media-engine/AdvancedPlaybackStudio'
import { SubtitleAccessibilityStudio } from '@/components/media-engine/SubtitleAccessibilityStudio'
import { AudioExperienceStudio } from '@/components/media-engine/AudioExperienceStudio'
import { MomentExplorer } from '@/components/media-engine/MomentExplorer'
import { PersonalMediaLibrary } from '@/components/media-engine/PersonalMediaLibrary'
import type { PlaylistNavigation } from '@/components/media-engine/PersonalMediaLibrary'
import { PLAYBACK_RATES } from '@/components/media-engine/playback-constants'
import { createDefaultSelection, safeSourceLabel } from '@/components/media-engine/source'
import type { MediaSelection } from '@/components/media-engine/source'
import '@/components/media-engine/media-engine.css'
import '@/components/media-engine/advanced-playback.css'
import './App.css'

const playbackId = 'BV3YZtogl89mg9VcNBhhnHm02Y34zI1nlMuMQfAbl3dM'
const muxSource = { playbackId }
const MuxVideo = lazy(() => import('@videojs/react/media/mux-video/hls-js').then(({ MuxVideo: Component }) => ({ default: Component })))
const HlsJsVideo = lazy(() => import('@videojs/react/media/hlsjs-video').then(({ HlsJsVideo: Component }) => ({ default: Component })))

type MediaSessionControls = {
  selectionId: string
  video: HTMLVideoElement | null
  navigation: PlaylistNavigation | null
}

type RemotePlaybackStatus = {
  selectionId: string
  state: 'checking' | 'unsupported' | 'disabled' | 'unavailable' | 'available' | 'permission-required' | 'secure-context-required' | 'error' | 'connecting' | 'connected'
}

type WebKitAirPlayVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void
  webkitCurrentPlaybackTargetIsWireless?: boolean
}

type AirPlayStatus = {
  selectionId: string
  state: 'unsupported' | 'checking' | 'unavailable' | 'available' | 'connected'
}

const STUDIO_SECTIONS = [
  { id: 'library', label: 'Media Library', detail: 'Collections & playlists', Icon: Library },
  { id: 'moments', label: 'Moment Atlas', detail: 'Bookmarks & notes', Icon: Bookmark },
  { id: 'subtitles', label: 'Subtitles', detail: 'Captions & transcript', Icon: Captions },
  { id: 'audio', label: 'Audio Studio', detail: 'Tracks, EQ & waveform', Icon: AudioLines },
  { id: 'advanced', label: 'Playback Studio', detail: 'Precision & display tools', Icon: SlidersHorizontal },
  { id: 'quality', label: 'Device & Quality', detail: 'Compatibility & diagnostics', Icon: Monitor },
  { id: 'session', label: 'Media Session', detail: 'Remote playback status', Icon: Radio },
] as const

type StudioSectionId = (typeof STUDIO_SECTIONS)[number]['id']

function getSeekTarget(video: HTMLVideoElement, requested: number) {
  if (!Number.isFinite(requested)) return null
  try {
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null
    const ranges = video.seekable
    if (ranges.length > 0) {
      let nearest: number | null = null
      let nearestDistance = Number.POSITIVE_INFINITY
      for (let index = 0; index < ranges.length; index += 1) {
        const start = ranges.start(index)
        const end = ranges.end(index)
        const target = Math.min(end, Math.max(start, requested))
        const distance = Math.abs(target - requested)
        if (distance < nearestDistance) {
          nearest = target
          nearestDistance = distance
        }
      }
      return nearest
    }
    return duration === null ? null : Math.min(duration, Math.max(0, requested))
  } catch {
    return null
  }
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerFrameRef = useRef<HTMLDivElement>(null)
  const studioTabsRef = useRef<HTMLDivElement>(null)
  const studioPanelRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<MediaSelection>(() => createDefaultSelection(playbackId))
  const currentSelectionIdRef = useRef(selection.id)
  const mediaSessionControlsRef = useRef<MediaSessionControls>({ selectionId: selection.id, video: null, navigation: null })
  const [cinemaMode, setCinemaMode] = useState<'standard' | 'cinema' | 'immersive'>('standard')
  const [shouldLoadMedia, setShouldLoadMedia] = useState(() => typeof IntersectionObserver === 'undefined')
  const [mediaMounted, setMediaMounted] = useState(false)
  const [mediaEverMounted, setMediaEverMounted] = useState(false)
  const [activeStudioSection, setActiveStudioSection] = useState<StudioSectionId>('library')
  const [focusMode, setFocusMode] = useState(false)
  const [pipAvailability, setPipAvailability] = useState<'ready' | 'loading' | 'unsupported'>('loading')
  const [pipUnavailableMessage, setPipUnavailableMessage] = useState('Waiting for video metadata.')
  const [pipActive, setPipActive] = useState(false)
  const pipSupported = pipAvailability === 'ready'
  const mediaSessionAvailable = typeof navigator !== 'undefined' && Boolean(navigator.mediaSession)
  const [mediaSessionMessage, setMediaSessionMessage] = useState('')
  const [playlistNavigation, setPlaylistNavigation] = useState<PlaylistNavigation | null>(null)
  const [remotePlaybackStatus, setRemotePlaybackStatus] = useState<RemotePlaybackStatus>({ selectionId: '', state: 'checking' })
  const [airPlayStatus, setAirPlayStatus] = useState<AirPlayStatus>({ selectionId: '', state: 'unsupported' })
  const currentRemotePlaybackStatus = remotePlaybackStatus.selectionId === selection.id
    ? remotePlaybackStatus.state
    : 'checking'
  const currentAirPlayStatus = airPlayStatus.selectionId === selection.id
    ? airPlayStatus.state
    : 'checking'
  const [touchLocked, setTouchLocked] = useState(false)
  const [touchGesturesEnabled, setTouchGesturesEnabled] = useState(true)
  const [studioHost, setStudioHost] = useState<HTMLDivElement | null>(null)
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null)
  const [playbackError, setPlaybackError] = useState('')
  const setVideoRef = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video
    mediaSessionControlsRef.current = { ...mediaSessionControlsRef.current, selectionId: currentSelectionIdRef.current, video }
    setMediaMounted(video !== null)
    if (video) setMediaEverMounted(true)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const updateSupport = () => {
      if (document.pictureInPictureEnabled !== true || !video || typeof video.requestPictureInPicture !== 'function') {
        setPipAvailability('unsupported')
        setPipUnavailableMessage('Picture-in-Picture is not supported by this browser.')
      } else if (video.disablePictureInPicture) {
        setPipAvailability('unsupported')
        setPipUnavailableMessage('Picture-in-Picture is disabled for this video.')
      } else if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        setPipAvailability('loading')
        setPipUnavailableMessage('Picture-in-Picture will be available after video metadata loads.')
      } else {
        setPipAvailability('ready')
        setPipUnavailableMessage('')
      }
      setPipActive(Boolean(video && document.pictureInPictureElement === video))
    }
    const onEnter = () => setPipActive(true)
    const onLeave = () => setPipActive(false)
    updateSupport()
    video?.addEventListener('enterpictureinpicture', onEnter)
    video?.addEventListener('leavepictureinpicture', onLeave)
    video?.addEventListener('loadedmetadata', updateSupport)
    video?.addEventListener('emptied', updateSupport)
    return () => {
      video?.removeEventListener('enterpictureinpicture', onEnter)
      video?.removeEventListener('leavepictureinpicture', onLeave)
      video?.removeEventListener('loadedmetadata', updateSupport)
      video?.removeEventListener('emptied', updateSupport)
    }
  }, [selection.id, mediaMounted])

  useEffect(() => {
    const video = videoRef.current as WebKitAirPlayVideo | null
    if (!video || !mediaMounted || mediaSessionControlsRef.current.selectionId !== selection.id) return

    let active = true
    let availabilityId: number | null = null
    const reportRemote = (state: RemotePlaybackStatus['state']) => {
      if (active) setRemotePlaybackStatus({ selectionId: selection.id, state })
    }
    const remote = video.remote
    const cancelAvailabilityWatch = (id: number) => {
      const reportCleanupError = (error: unknown) => {
        if (error instanceof DOMException && error.name === 'NotFoundError') return
        console.warn('Could not stop remote device availability monitoring.', error)
      }
      try {
        void remote.cancelWatchAvailability(id).catch(reportCleanupError)
      } catch (error) {
        reportCleanupError(error)
      }
    }
    const onConnecting = () => reportRemote('connecting')
    const onConnect = () => reportRemote('connected')
    const onDisconnect = () => reportRemote('checking')
    if (video.disableRemotePlayback) {
      Promise.resolve().then(() => reportRemote('disabled'))
    } else if (remote && typeof remote.watchAvailability === 'function') {
      remote.addEventListener('connecting', onConnecting)
      remote.addEventListener('connect', onConnect)
      remote.addEventListener('disconnect', onDisconnect)
      if (remote.state === 'connected') reportRemote('connected')
      else if (remote.state === 'connecting') reportRemote('connecting')
      else {
        Promise.resolve().then(() => {
          if (!active) return
          try {
            void remote.watchAvailability((available) => reportRemote(available ? 'available' : 'unavailable'))
              .then((id) => {
                  if (active) availabilityId = id
                  else cancelAvailabilityWatch(id)
                })
              .catch((error: unknown) => {
                const name = error instanceof DOMException ? error.name : ''
                  reportRemote(name === 'NotAllowedError' ? 'permission-required' : name === 'SecurityError' ? 'secure-context-required' : 'error')
              })
          } catch (error) {
            const name = error instanceof DOMException ? error.name : ''
            reportRemote(name === 'NotAllowedError' ? 'permission-required' : name === 'SecurityError' ? 'secure-context-required' : 'error')
          }
        })
      }
    } else {
      Promise.resolve().then(() => reportRemote('unsupported'))
    }

    const reportAirPlay = (state: AirPlayStatus['state']) => {
      if (active) setAirPlayStatus({ selectionId: selection.id, state })
    }
    let airPlayTargetAvailable: boolean | null = null
    const onAirPlayAvailability = (event: Event) => {
      const availability = (event as Event & { availability?: string }).availability
      airPlayTargetAvailable = availability === 'available'
      reportAirPlay(airPlayTargetAvailable ? 'available' : 'unavailable')
    }
    const updateAirPlayState = () => {
      if (video.webkitCurrentPlaybackTargetIsWireless) reportAirPlay('connected')
      else if (airPlayTargetAvailable === true) reportAirPlay('available')
      else if (airPlayTargetAvailable === false) reportAirPlay('unavailable')
      else reportAirPlay('checking')
    }
    const hasAirPlayPicker = typeof video.webkitShowPlaybackTargetPicker === 'function'
    if (hasAirPlayPicker) {
      video.addEventListener('webkitplaybacktargetavailabilitychanged', onAirPlayAvailability)
      video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', updateAirPlayState)
      Promise.resolve().then(() => {
        if (video.webkitCurrentPlaybackTargetIsWireless) reportAirPlay('connected')
        else reportAirPlay('checking')
      })
    } else {
      Promise.resolve().then(() => reportAirPlay('unsupported'))
    }

    return () => {
      active = false
      if (remote) {
        remote.removeEventListener('connecting', onConnecting)
        remote.removeEventListener('connect', onConnect)
        remote.removeEventListener('disconnect', onDisconnect)
        if (availabilityId !== null) cancelAvailabilityWatch(availabilityId)
      }
      if (hasAirPlayPicker) {
        video.removeEventListener('webkitplaybacktargetavailabilitychanged', onAirPlayAvailability)
        video.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', updateAirPlayState)
      }
    }
  }, [mediaMounted, selection.id])

  useEffect(() => {
    if (cinemaMode !== 'immersive' && !focusMode) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (cinemaMode === 'immersive' && document.fullscreenElement) return
      if (cinemaMode === 'immersive') setCinemaMode('standard')
      if (focusMode) setFocusMode(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [cinemaMode, focusMode])

  const selectSource = useCallback((next: MediaSelection) => {
    setPlaybackError('')
    setPlaylistNavigation(null)
    currentSelectionIdRef.current = next.id
    mediaSessionControlsRef.current = { selectionId: next.id, video: null, navigation: null }
    setSelection(next)
  }, [])

  const selectPlaylistSource = useCallback((next: MediaSelection, navigation: PlaylistNavigation) => {
    setPlaybackError('')
    currentSelectionIdRef.current = next.id
    mediaSessionControlsRef.current = { selectionId: next.id, video: null, navigation }
    setPlaylistNavigation(navigation)
    setSelection(next)
  }, [])

  useEffect(() => {
    const session = navigator.mediaSession
    if (!session) return
    const videoForCurrentSource = () => {
      const current = mediaSessionControlsRef.current
      return current.selectionId === currentSelectionIdRef.current ? current.video : null
    }
    const reportUnavailable = (action: string) => setMediaSessionMessage(`The ${action} media control is unavailable for the current video.`)
    const seek = (requested: number, action: string) => {
      const video = videoForCurrentSource()
      if (!video) {
        reportUnavailable(action)
        return
      }
      const target = getSeekTarget(video, requested)
      if (target === null) {
        reportUnavailable(action)
        return
      }
      try {
        video.currentTime = target
        setMediaSessionMessage('')
      } catch {
        reportUnavailable(action)
      }
    }
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => {
        const video = videoForCurrentSource()
        if (!video) {
          reportUnavailable('play')
          return
        }
        try {
          void video.play().then(() => setMediaSessionMessage('')).catch(() => reportUnavailable('play'))
        } catch {
          reportUnavailable('play')
        }
      }],
      ['pause', () => {
        const video = videoForCurrentSource()
        if (!video) {
          reportUnavailable('pause')
          return
        }
        try {
          video.pause()
          setMediaSessionMessage('')
        } catch {
          reportUnavailable('pause')
        }
      }],
      ['seekto', (details) => {
        if (typeof details.seekTime === 'number') seek(details.seekTime, 'seek')
        else reportUnavailable('seek')
      }],
      ['seekbackward', (details) => {
        const video = videoForCurrentSource()
        if (!video || !Number.isFinite(video.currentTime)) {
          reportUnavailable('seek backward')
          return
        }
        const offset = typeof details.seekOffset === 'number' && Number.isFinite(details.seekOffset) && details.seekOffset >= 0
          ? details.seekOffset
          : 10
        seek(video.currentTime - offset, 'seek backward')
      }],
      ['seekforward', (details) => {
        const video = videoForCurrentSource()
        if (!video || !Number.isFinite(video.currentTime)) {
          reportUnavailable('seek forward')
          return
        }
        const offset = typeof details.seekOffset === 'number' && Number.isFinite(details.seekOffset) && details.seekOffset >= 0
          ? details.seekOffset
          : 10
        seek(video.currentTime + offset, 'seek forward')
      }],
    ]

    for (const [action, handler] of actions) {
      try { session.setActionHandler(action, handler) } catch { /* Unsupported actions are optional. */ }
    }
    return () => {
      for (const [action] of actions) {
        try { session.setActionHandler(action, null) } catch { /* Unsupported actions are optional. */ }
      }
      try {
        session.metadata = null
        session.playbackState = 'none'
        session.setPositionState()
      } catch { /* The browser may not implement every Media Session operation. */ }
    }
  }, [])

  useEffect(() => {
    const session = navigator.mediaSession
    if (!session) return
    const navigation = playlistNavigation
    const currentNavigation = () => mediaSessionControlsRef.current.navigation
    const openRelativeEntry = (offset: -1 | 1) => {
      const current = currentNavigation()
      if (!current) {
        setMediaSessionMessage('Playlist navigation is unavailable.')
        return
      }
      const nextIndex = current.currentIndex + offset
      const entry = current.items[nextIndex]
      if (!entry) {
        setMediaSessionMessage('There is no more playlist media in that direction.')
        return
      }
      const nextNavigation = { ...current, currentIndex: nextIndex }
      const nextSource = { ...entry.source, id: crypto.randomUUID() }
      currentSelectionIdRef.current = nextSource.id
      mediaSessionControlsRef.current = {
        selectionId: nextSource.id,
        video: null,
        navigation: nextNavigation,
      }
      setPlaylistNavigation(nextNavigation)
      setPlaybackError('')
      setSelection(nextSource)
      setMediaSessionMessage('')
    }
    const previousHandler: MediaSessionActionHandler = () => openRelativeEntry(-1)
    const nextHandler: MediaSessionActionHandler = () => openRelativeEntry(1)
    const canPrevious = Boolean(navigation && navigation.currentIndex > 0)
    const canNext = Boolean(navigation && navigation.currentIndex < navigation.items.length - 1)

    try { session.setActionHandler('previoustrack', canPrevious ? previousHandler : null) } catch { /* Unsupported actions are optional. */ }
    try { session.setActionHandler('nexttrack', canNext ? nextHandler : null) } catch { /* Unsupported actions are optional. */ }
    return () => {
      try { session.setActionHandler('previoustrack', null) } catch { /* Unsupported actions are optional. */ }
      try { session.setActionHandler('nexttrack', null) } catch { /* Unsupported actions are optional. */ }
    }
  }, [playlistNavigation])

  useEffect(() => {
    const session = navigator.mediaSession
    if (!session) return
    const title = selection.label.trim() || safeSourceLabel(selection)
    let messageTimer: number | null = null
    try {
      session.metadata = typeof MediaMetadata === 'function'
        ? new MediaMetadata({ title })
        : null
    } catch {
      messageTimer = window.setTimeout(() => setMediaSessionMessage('Media metadata could not be published in this browser.'), 0)
    }
    return () => {
      if (messageTimer !== null) window.clearTimeout(messageTimer)
      try { session.metadata = null } catch { /* Clear stale metadata when the source changes. */ }
    }
  }, [selection])

  useEffect(() => {
    const session = navigator.mediaSession
    const video = videoRef.current
    if (!session || !video || mediaSessionControlsRef.current.selectionId !== selection.id) {
      if (session) {
        try {
          session.playbackState = 'none'
          session.setPositionState()
        } catch { /* Position state is optional. */ }
      }
      return
    }

    let lastPosition = -1
    let lastPlaybackRate = -1
    const updatePlaybackState = () => {
      try {
        session.playbackState = video.ended ? 'none' : video.paused ? 'paused' : 'playing'
      } catch {
        setMediaSessionMessage('Playback state is unavailable through this browser.')
      }
      updatePositionState(true)
    }
    const updatePositionState = (force = false) => {
      const duration = video.duration
      const currentTime = video.currentTime
      const playbackRate = video.playbackRate
      if (
        typeof session.setPositionState !== 'function'
        || !Number.isFinite(duration)
        || duration <= 0
        || !Number.isFinite(currentTime)
        || currentTime < 0
        || !Number.isFinite(playbackRate)
        || playbackRate <= 0
      ) {
        try { session.setPositionState() } catch { /* Position state is optional. */ }
        lastPosition = -1
        return
      }
      if (!force && Math.abs(currentTime - lastPosition) < 1 && playbackRate === lastPlaybackRate) return
      try {
        session.setPositionState({
          duration,
          position: Math.min(duration, currentTime),
          playbackRate,
        })
        lastPosition = currentTime
        lastPlaybackRate = playbackRate
      } catch {
        setMediaSessionMessage('Playback position is unavailable through this browser.')
      }
    }
    const onTimeUpdate = () => updatePositionState()
    const onSeek = () => updatePositionState(true)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') updatePlaybackState()
    }
    video.addEventListener('play', updatePlaybackState)
    video.addEventListener('pause', updatePlaybackState)
    video.addEventListener('ended', updatePlaybackState)
    video.addEventListener('loadedmetadata', updatePlaybackState)
    video.addEventListener('durationchange', updatePlaybackState)
    video.addEventListener('ratechange', updatePlaybackState)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('seeking', onSeek)
    video.addEventListener('seeked', onSeek)
    video.addEventListener('emptied', updatePlaybackState)
    document.addEventListener('visibilitychange', onVisibilityChange)
    updatePlaybackState()
    return () => {
      video.removeEventListener('play', updatePlaybackState)
      video.removeEventListener('pause', updatePlaybackState)
      video.removeEventListener('ended', updatePlaybackState)
      video.removeEventListener('loadedmetadata', updatePlaybackState)
      video.removeEventListener('durationchange', updatePlaybackState)
      video.removeEventListener('ratechange', updatePlaybackState)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('seeking', onSeek)
      video.removeEventListener('seeked', onSeek)
      video.removeEventListener('emptied', updatePlaybackState)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      try {
        session.playbackState = 'none'
        session.setPositionState()
      } catch { /* Reset state when changing media. */ }
    }
  }, [mediaMounted, selection.id])

  useEffect(() => {
    const objectUrl = selection.objectUrl
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [selection])

  const handleMediaError = useCallback(() => {
    const mediaError = videoRef.current?.error
    const reason = mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
      ? 'This browser could not play this source. Try a browser-compatible MP4 or WebM file, or another HLS stream.'
      : mediaError?.message || 'The source could not be loaded. Check that the URL is reachable and permits playback from this site.'
    setPlaybackError(reason)
  }, [])

  const selectStudioSection = (section: StudioSectionId) => {
    setActiveStudioSection(section)
    if (studioPanelRef.current) studioPanelRef.current.scrollTop = 0
  }

  const handleStudioTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % STUDIO_SECTIONS.length
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + STUDIO_SECTIONS.length) % STUDIO_SECTIONS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = STUDIO_SECTIONS.length - 1
    else return
    event.preventDefault()
    const nextSection = STUDIO_SECTIONS[nextIndex]
    selectStudioSection(nextSection.id)
    studioTabsRef.current?.querySelector<HTMLButtonElement>(`[data-studio-tab="${nextSection.id}"]`)?.focus()
  }

  const sourceObject = useMemo(() => ({ src: selection.src, type: selection.type }), [selection])
  const selectedMuxSource = useMemo(() => selection.id === 'reel-atlas-default-mux' ? muxSource : sourceObject, [selection.id, sourceObject])

  const mediaElement = selection.kind === 'mux'
    ? <MuxVideo key={selection.id} crossOrigin="anonymous" onError={handleMediaError} ref={setVideoRef} source={selectedMuxSource} playsInline />
    : selection.kind === 'hls'
      ? <HlsJsVideo key={selection.id} crossOrigin="anonymous" onError={handleMediaError} ref={setVideoRef} source={sourceObject} playsInline />
      : <Video key={selection.id} onError={handleMediaError} ref={setVideoRef} playsInline><source src={selection.src} type={selection.type} /></Video>

  useEffect(() => {
    const playerFrame = playerFrameRef.current
    if (!playerFrame || shouldLoadMedia) return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldLoadMedia(true)
        observer.disconnect()
      }
    }, { rootMargin: '400px' })
    observer.observe(playerFrame)
    return () => observer.disconnect()
  }, [shouldLoadMedia])

  return (
    <main className={`atlas-page atlas-page--${cinemaMode}${focusMode ? ' atlas-page--focus' : ''}`}>
      <div className="page-grain" aria-hidden="true" />
      <a className="skip-link" href="#player">Skip to the video player</a>

      <header className="site-header">
        <a className="brand" href="#top" aria-label="Reel Atlas home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-name">REEL<span>ATLAS</span></span>
        </a>
        <div className="header-note"><span className="header-note-dot" /> AN EXPERIMENT IN WATCHING</div>
        <a className="header-link" href="#player">
          ENTER THE FILM <ArrowDown size={14} strokeWidth={1.7} aria-hidden="true" />
        </a>
      </header>

      <section className="intro" id="top" aria-labelledby="page-title">
        <div className="intro-copy">
          <p className="eyebrow"><span>REEL ATLAS</span> / A MORE CONSIDERED WAY TO WATCH</p>
          <h1 id="page-title">Stay for <em>the details.</em></h1>
          <p className="intro-description">
            The frame comes first. Everything else knows when to step back.
          </p>
        </div>
        <aside className="intro-aside" aria-label="Product note">
          <span className="aside-rule" />
          <p className="aside-label">A STUDY IN ATTENTION</p>
          <p className="aside-copy">Built around the moments that make a film worth coming back to.</p>
          <span className="aside-index">RA—001</span>
        </aside>
      </section>

      <section className="player-section workspace-section" id="player" aria-labelledby="player-heading">
        <div className="workspace-grid">
          <div className="workspace-player-column">
            <div className="section-heading">
              <div className="workspace-title">
                <p className="eyebrow"><span>PLAYBACK / 001</span> · VIDEO.JS V10</p>
                <h2 id="player-heading">A frame in motion</h2>
              </div>
              <div className="player-heading-actions">
                <div className="cinema-mode-controls" role="group" aria-label="In-page cinema mode">
                  {(['standard', 'cinema', 'immersive'] as const).map((mode) => (
                    <button
                      aria-pressed={cinemaMode === mode}
                      className="cinema-mode-button"
                      key={mode}
                      onClick={() => setCinemaMode(mode)}
                      type="button"
                    >
                      {mode === 'immersive' && <Maximize2 size={13} aria-hidden="true" />}
                      <span>{mode}</span>
                    </button>
                  ))}
                </div>
                <button
                  aria-pressed={focusMode}
                  className="focus-mode-button"
                  onClick={() => setFocusMode((active) => !active)}
                  type="button"
                >
                  <Focus size={14} strokeWidth={1.7} aria-hidden="true" />
                  {focusMode ? 'EXIT FOCUS' : 'FOCUS VIEW'}
                </button>
                <span
                  aria-live="polite"
                  className="pip-capability-label"
                  role="status"
                  title={pipSupported ? 'Picture-in-Picture is available; use the player control.' : pipUnavailableMessage}
                >
                  {pipActive ? 'PIP ACTIVE' : pipSupported ? 'PIP READY' : pipAvailability === 'loading' ? 'PIP NOT READY' : 'PIP UNAVAILABLE'}
                </span>
              </div>
            </div>
            <p aria-live="polite" className="cinema-announcement" role="status">
              {cinemaMode === 'immersive'
                ? 'Immersive in-page viewing. Press Escape or choose another mode to exit. Browser fullscreen is separate.'
                : cinemaMode === 'cinema'
                  ? 'Cinema mode is on. Browser fullscreen is a separate player control.'
                  : focusMode
                    ? 'Focus View is on. Press Escape or choose Exit Focus to restore panels.'
                    : 'Standard player layout.'}
            </p>

            <div className="player-frame" ref={playerFrameRef}>
              <div className="frame-topline" aria-hidden="true">
                <span>REEL ATLAS</span>
                <span className="frame-live"><i /> PLAYER / 001</span>
              </div>
              <VideoPlayer defaultPlaybackRates={PLAYBACK_RATES} key={selection.id} title={selection.label}>
                <VideoSkin className="atlas-video aspect-video w-full" customTouchSeeking touchGesturesEnabled={touchGesturesEnabled} touchLocked={touchLocked}>
                  {shouldLoadMedia ? (
                    <Suspense fallback={<div aria-live="polite" className="mux-loading-state">Preparing the film…</div>}>
                      {mediaElement}
                    </Suspense>
                  ) : (
                    <div aria-live="polite" className="mux-loading-state">Preparing the film…</div>
                  )}
                  <div className="advanced-overlay-host" ref={setOverlayHost} />
                </VideoSkin>
                {mediaMounted && <AdvancedPlaybackStudio host={studioHost} onTouchGesturesChange={setTouchGesturesEnabled} onTouchLockedChange={setTouchLocked} overlayHost={overlayHost} source={selection} touchGesturesEnabled={touchGesturesEnabled} touchLocked={touchLocked} videoRef={videoRef} />}
              </VideoPlayer>
              <div className="frame-bottomline" aria-hidden="true">
                <span>{selection.label}</span>
                <span><i className="frame-live-dot" /> LIVE PICTURE</span>
              </div>
            </div>

            <MediaSourcePicker onSelect={selectSource} />
            {playbackError && <div aria-live="polite" className="media-playback-error" role="alert"><div><strong>Could not play this source</strong><span>{playbackError}</span></div><button className="media-engine-button" onClick={() => { setPlaybackError(''); selectSource({ ...createDefaultSelection(playbackId), id: `reel-atlas-demo-${crypto.randomUUID()}` }) }} type="button"><RotateCcw size={14} aria-hidden="true" /> Return to demo</button></div>}
          </div>

          <aside className="studio-dock" aria-label="Playback studio">
            <div className="studio-dock-heading">
              <div><p className="studio-kicker">YOUR WORKSPACE</p><h2>Studio</h2></div>
              <span className="studio-source-label" title={selection.label}>{selection.label}</span>
            </div>
            <div className="studio-dock-body">
              <div aria-label="Studio sections" className="studio-tabs" ref={studioTabsRef} role="tablist" aria-orientation="vertical">
                {STUDIO_SECTIONS.map(({ id, label, detail, Icon }, index) => (
                  <button
                    aria-controls={`studio-panel-${id}`}
                    aria-selected={activeStudioSection === id}
                    className="studio-tab"
                    data-studio-tab={id}
                    id={`studio-tab-${id}`}
                    key={id}
                    onClick={() => selectStudioSection(id)}
                    onKeyDown={(event) => handleStudioTabKeyDown(event, index)}
                    role="tab"
                    tabIndex={activeStudioSection === id ? 0 : -1}
                    type="button"
                  >
                    <Icon aria-hidden="true" className="studio-tab-icon" size={17} strokeWidth={1.7} />
                    <span><strong>{label}</strong><small>{detail}</small></span>
                    <ChevronRight aria-hidden="true" className="studio-tab-arrow" size={14} />
                  </button>
                ))}
              </div>

              <div className="studio-panel-area" ref={studioPanelRef}>
                <section aria-labelledby="studio-tab-library" className="studio-pane" hidden={activeStudioSection !== 'library'} id="studio-panel-library" role="tabpanel" tabIndex={0}>
                  <div className="studio-pane-heading"><span>01 / COLLECTION</span><h3>Media library</h3></div>
                  {mediaEverMounted ? <PersonalMediaLibrary onPlaylistSelect={selectPlaylistSource} onSelect={selectSource} source={selection} videoRef={videoRef} /> : <div aria-live="polite" className="studio-pane-loading">The library is ready when the player opens.</div>}
                </section>
                <section aria-labelledby="studio-tab-moments" className="studio-pane" hidden={activeStudioSection !== 'moments'} id="studio-panel-moments" role="tabpanel" tabIndex={0}>
                  <div className="studio-pane-heading"><span>02 / ANNOTATION</span><h3>Moments &amp; notes</h3></div>
                  {mediaMounted ? <MomentExplorer key={`moments-${selection.id}`} source={selection} videoRef={videoRef} /> : <div aria-live="polite" className="studio-pane-loading">Preparing the current timeline…</div>}
                </section>
                <section aria-labelledby="studio-tab-subtitles" className="studio-pane" hidden={activeStudioSection !== 'subtitles'} id="studio-panel-subtitles" role="tabpanel" tabIndex={0}>
                  <div className="studio-pane-heading"><span>03 / LANGUAGE</span><h3>Subtitles &amp; transcript</h3></div>
                  {mediaMounted ? <><ReelAtlas key={`transcript-${selection.id}`} videoRef={videoRef} /><SubtitleAccessibilityStudio key={`subtitles-${selection.id}`} videoRef={videoRef} /></> : <div aria-live="polite" className="studio-pane-loading">Waiting for media metadata and text tracks.</div>}
                </section>
                <section aria-labelledby="studio-tab-audio" className="studio-pane" hidden={activeStudioSection !== 'audio'} id="studio-panel-audio" role="tabpanel" tabIndex={0}>
                  <div className="studio-pane-heading"><span>04 / SOUND</span><h3>Audio studio</h3></div>
                  {mediaMounted ? <AudioExperienceStudio key={`audio-${selection.id}`} source={selection} videoRef={videoRef} /> : <div aria-live="polite" className="studio-pane-loading">Audio tools appear when a source is ready.</div>}
                </section>
                <section aria-labelledby="studio-tab-advanced" className="studio-pane" hidden={activeStudioSection !== 'advanced'} id="studio-panel-advanced" role="tabpanel" tabIndex={0}>
                  <div className="studio-pane-heading"><span>05 / PLAYBACK</span><h3>Advanced playback</h3></div>
                  <div ref={setStudioHost} />
                  {!mediaMounted && <div aria-live="polite" className="studio-pane-loading">Preparing playback controls…</div>}
                </section>
                <section aria-labelledby="studio-tab-quality" className="studio-pane" hidden={activeStudioSection !== 'quality'} id="studio-panel-quality" role="tabpanel" tabIndex={0}>
                  <div className="studio-pane-heading"><span>06 / COMPATIBILITY</span><h3>Device &amp; quality</h3></div>
                  {mediaMounted ? <div className="media-tools-grid"><DeviceCompatibilityCenter key={`compat-${selection.id}`} source={selection} videoRef={videoRef} /><PlaybackDiagnostics key={`diagnostics-${selection.id}`} source={selection} videoRef={videoRef} /></div> : <div aria-live="polite" className="studio-pane-loading">Device information will appear when the player is ready.</div>}
                </section>
                <section aria-labelledby="studio-tab-session" className="studio-pane studio-pane--session" hidden={activeStudioSection !== 'session'} id="studio-panel-session" role="tabpanel" tabIndex={0}>
                  <div className="studio-pane-heading"><span>07 / CONNECTIVITY</span><h3>Media session &amp; remote</h3></div>
                  <div className="studio-status-card">
                    <span className="studio-status-icon"><Radio size={17} aria-hidden="true" /></span>
                    <div><strong>Media Session</strong><span>{mediaSessionAvailable ? 'API detected in this browser' : 'Unavailable in this browser'}</span></div>
                    <i className={mediaSessionAvailable ? 'is-available' : ''} />
                  </div>
                  <p className="studio-status-note">Notification, lock-screen and hardware-key controls depend on browser and platform support.</p>
                  <div aria-label="Remote playback capability" aria-live="polite" className="studio-capability-readout" role="status">
                    <strong>Remote Playback</strong>
                    <span>{currentRemotePlaybackStatus === 'checking' ? 'Checking device availability'
                      : currentRemotePlaybackStatus === 'unsupported' ? 'Unsupported in this browser'
                        : currentRemotePlaybackStatus === 'disabled' ? 'Disabled for this video'
                          : currentRemotePlaybackStatus === 'unavailable' ? 'No remote device available'
                            : currentRemotePlaybackStatus === 'available' ? 'Device available · use the player control'
                              : currentRemotePlaybackStatus === 'permission-required' ? 'Browser permission required'
                                : currentRemotePlaybackStatus === 'secure-context-required' ? 'A secure context is required'
                                  : currentRemotePlaybackStatus === 'connected' ? 'Connected'
                                    : currentRemotePlaybackStatus === 'connecting' ? 'Connecting'
                                      : 'Availability could not be checked'}</span>
                  </div>
                  <div aria-label="AirPlay capability" aria-live="polite" className="studio-capability-readout" role="status">
                    <strong>AirPlay</strong>
                    <span>{currentAirPlayStatus === 'checking' ? 'Checking availability'
                      : currentAirPlayStatus === 'unsupported' ? 'Unsupported in this browser'
                        : currentAirPlayStatus === 'unavailable' ? 'No AirPlay target available'
                          : currentAirPlayStatus === 'available' ? 'Target available · use the player control'
                            : currentAirPlayStatus === 'connected' ? 'Connected'
                              : 'Checking availability'}</span>
                  </div>
                  {mediaSessionMessage && <p aria-live="polite" className="studio-status-message" role="status">{mediaSessionMessage}</p>}
                  <p className="studio-status-note">Remote playback requires a compatible browser, media source and receiving device. Chromecast receiver integration is not configured.</p>
                </section>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <footer className="site-footer" id="about">
        <span>REEL ATLAS <span className="footer-separator">/</span> A VIDEO EXPERIENCE</span>
        <span>BUILT AROUND THE FRAME <ArrowUpRight size={11} aria-hidden="true" /></span>
      </footer>
    </main>
  )
}

export default App
