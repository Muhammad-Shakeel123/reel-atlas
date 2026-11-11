import { Activity, ChevronDown, Headphones, SlidersHorizontal } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { MediaSelection } from './source'

type NativeAudioTrack = {
  id: string
  kind: string
  label: string
  language: string
  enabled: boolean
}

type NativeAudioTrackList = EventTarget & {
  readonly length: number
  readonly [index: number]: NativeAudioTrack
}

type TrackSnapshot = NativeAudioTrack & {
  index: number
  canSwitch: boolean
}

type Props = {
  source: MediaSelection
  videoRef: RefObject<HTMLVideoElement | null>
}

type EqualizerValues = {
  bass: number
  mid: number
  treble: number
}

type AudioProcessingGraph = {
  context: AudioContext
  source: MediaElementAudioSourceNode
  filters: [BiquadFilterNode, BiquadFilterNode, BiquadFilterNode]
  compressor: DynamicsCompressorNode
  analyser: AnalyserNode
}

const NEUTRAL_EQUALIZER: EqualizerValues = { bass: 0, mid: 0, treble: 0 }

function hasEnabledSetter(track: NativeAudioTrack) {
  let prototype: object | null = track
  while (prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'enabled')
    if (descriptor) return typeof descriptor.set === 'function' || descriptor.writable === true
    prototype = Object.getPrototypeOf(prototype)
  }
  return false
}

function readTracks(list: NativeAudioTrackList): TrackSnapshot[] {
  return Array.from({ length: list.length }, (_, index) => {
    const track = list[index]
    return {
      id: track.id,
      kind: track.kind,
      label: track.label,
      language: track.language,
      enabled: track.enabled,
      index,
      canSwitch: hasEnabledSetter(track),
    }
  })
}

export function AudioExperienceStudio({ source, videoRef }: Props) {
  const [tracks, setTracks] = useState<TrackSnapshot[]>([])
  const [trackListExposed, setTrackListExposed] = useState(false)
  const [switchError, setSwitchError] = useState('')
  const [equalizer, setEqualizer] = useState<EqualizerValues>(NEUTRAL_EQUALIZER)
  const [processingState, setProcessingState] = useState<'idle' | 'active' | 'error'>('idle')
  const [processingError, setProcessingError] = useState('')
  const audioGraphRef = useRef<AudioProcessingGraph | null>(null)
  const pendingContextRef = useRef<AudioContext | null>(null)
  const activationPendingRef = useRef(false)
  const disposedRef = useRef(false)
  const waveformRef = useRef<HTMLCanvasElement>(null)

  const refreshTracks = useCallback((list: NativeAudioTrackList) => {
    setTracks(readTracks(list))
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const mediaWithAudioTracks = video as HTMLVideoElement & { audioTracks?: NativeAudioTrackList }
    const list = mediaWithAudioTracks.audioTracks
    if (!list || typeof list.addEventListener !== 'function' || typeof list.removeEventListener !== 'function') {
      return
    }

    let active = true
    const update = () => {
      if (!active) return
      setTrackListExposed(true)
      refreshTracks(list)
    }
    list.addEventListener('change', update)
    list.addEventListener('addtrack', update)
    list.addEventListener('removetrack', update)
    video.addEventListener('loadedmetadata', update)
    video.addEventListener('loadstart', update)
    video.addEventListener('emptied', update)
    queueMicrotask(update)

    return () => {
      active = false
      list.removeEventListener('change', update)
      list.removeEventListener('addtrack', update)
      list.removeEventListener('removetrack', update)
      video.removeEventListener('loadedmetadata', update)
      video.removeEventListener('loadstart', update)
      video.removeEventListener('emptied', update)
    }
  }, [refreshTracks, source.id, videoRef])

  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      activationPendingRef.current = false
      const graph = audioGraphRef.current
      audioGraphRef.current = null
      if (graph) {
        graph.source.disconnect()
        graph.filters.forEach((filter) => filter.disconnect())
        graph.compressor.disconnect()
        graph.analyser.disconnect()
        void graph.context.close()
      } else {
        const pendingContext = pendingContextRef.current
        if (pendingContext && pendingContext.state !== 'closed') void pendingContext.close()
      }
      pendingContextRef.current = null
    }
  }, [source.id])

  const activateEqualizer = async () => {
    if (source.kind !== 'file' || typeof window === 'undefined' || typeof window.AudioContext !== 'function') return
    if (activationPendingRef.current || audioGraphRef.current) return
    const video = videoRef.current
    if (!video) {
      setProcessingError('The media element is not ready yet. Try again after the local video loads.')
      setProcessingState('error')
      return
    }

    activationPendingRef.current = true
    let context: AudioContext | null = null
    let mediaSource: MediaElementAudioSourceNode | null = null
    try {
      context = new window.AudioContext()
      pendingContextRef.current = context
      await context.resume()
      if (disposedRef.current || videoRef.current !== video || !video.isConnected) {
        await context.close()
        if (pendingContextRef.current === context) pendingContextRef.current = null
        return
      }
      if (context.state !== 'running') throw new Error('The browser did not start the audio context from this user action.')

      const bass = context.createBiquadFilter()
      bass.type = 'lowshelf'
      bass.frequency.value = 120
      bass.gain.value = equalizer.bass

      const mid = context.createBiquadFilter()
      mid.type = 'peaking'
      mid.frequency.value = 1000
      mid.Q.value = 1
      mid.gain.value = equalizer.mid

      const treble = context.createBiquadFilter()
      treble.type = 'highshelf'
      treble.frequency.value = 8000
      treble.gain.value = equalizer.treble

      const compressor = context.createDynamicsCompressor()
      compressor.threshold.value = 0
      compressor.knee.value = 0
      compressor.ratio.value = 20
      compressor.attack.value = 0.003
      compressor.release.value = 0.25

      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      mediaSource = context.createMediaElementSource(video)
      const graph: AudioProcessingGraph = { context, source: mediaSource, filters: [bass, mid, treble], compressor, analyser }
      audioGraphRef.current = graph
      pendingContextRef.current = null

      mediaSource.connect(bass)
      bass.connect(mid)
      mid.connect(treble)
      treble.connect(compressor)
      compressor.connect(analyser)
      analyser.connect(context.destination)

      if (!disposedRef.current) {
        setProcessingError('')
        setProcessingState('active')
      }
    } catch (error) {
      if (context && !mediaSource) {
        if (pendingContextRef.current === context) pendingContextRef.current = null
        if (context.state !== 'closed') void context.close()
      } else if (context && mediaSource) {
        try {
          mediaSource.disconnect()
          mediaSource.connect(context.destination)
        } catch (routingError) {
          const routeMessage = routingError instanceof Error ? ` Direct audio routing also failed: ${routingError.message}` : ''
          if (!disposedRef.current) setProcessingError(`${error instanceof Error ? error.message : 'Audio processing could not be started.'}${routeMessage}`)
        }
      }
      if (!disposedRef.current) {
        setProcessingError((current) => current || (error instanceof Error ? error.message : 'Audio processing could not be started.'))
        setProcessingState('error')
      }
    } finally {
      activationPendingRef.current = false
    }
  }

  useEffect(() => {
    const graph = audioGraphRef.current
    if (!graph) return
    graph.filters[0].gain.setTargetAtTime(equalizer.bass, graph.context.currentTime, 0.03)
    graph.filters[1].gain.setTargetAtTime(equalizer.mid, graph.context.currentTime, 0.03)
    graph.filters[2].gain.setTargetAtTime(equalizer.treble, graph.context.currentTime, 0.03)
  }, [equalizer, processingState])

  useEffect(() => {
    if (processingState !== 'active') return
    const video = videoRef.current
    const graph = audioGraphRef.current
    if (!video || !graph) return

    const resumeContext = () => {
      if (graph.context.state === 'running') return
      void graph.context.resume().catch((error: unknown) => {
        if (!disposedRef.current) setProcessingError(error instanceof Error ? error.message : 'The browser could not resume audio processing.')
      })
    }
    const suspendContext = () => {
      if (graph.context.state !== 'running') return
      void graph.context.suspend().catch((error: unknown) => {
        if (!disposedRef.current) setProcessingError(error instanceof Error ? error.message : 'The browser could not suspend audio processing.')
      })
    }

    video.addEventListener('play', resumeContext)
    video.addEventListener('pause', suspendContext)
    video.addEventListener('ended', suspendContext)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') suspendContext()
      else if (!video.paused && !video.ended) resumeContext()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    if (video.paused) suspendContext()
    else resumeContext()
    return () => {
      video.removeEventListener('play', resumeContext)
      video.removeEventListener('pause', suspendContext)
      video.removeEventListener('ended', suspendContext)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [processingState, videoRef])

  useEffect(() => {
    if (processingState !== 'active') return
    const canvas = waveformRef.current
    const video = videoRef.current
    const analyser = audioGraphRef.current?.analyser
    const context = canvas?.getContext('2d')
    if (!canvas || !video || !analyser || !context) return

    const samples = new Uint8Array(analyser.fftSize)
    let animationFrame = 0
    let lastDraw = 0
    let width = 0
    let height = 0
    const drawWaveform = () => {
      const bounds = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const nextWidth = Math.max(1, Math.round(bounds.width * pixelRatio))
      const nextHeight = Math.max(1, Math.round(bounds.height * pixelRatio))
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }
      width = canvas.width
      height = canvas.height
      analyser.getByteTimeDomainData(samples)
      context.clearRect(0, 0, width, height)
      context.beginPath()
      context.strokeStyle = window.matchMedia('(forced-colors: active)').matches ? 'CanvasText' : '#a8b67a'
      context.lineWidth = Math.max(1, pixelRatio)
      for (let index = 0; index < samples.length; index += 1) {
        const x = (index / (samples.length - 1)) * width
        const y = (samples[index] / 255) * height
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      }
      context.stroke()
    }
    const animate = (time: number) => {
      animationFrame = 0
      if (time - lastDraw >= 33) {
        drawWaveform()
        lastDraw = time
      }
      if (!video.paused && !video.ended && document.visibilityState === 'visible') {
        animationFrame = window.requestAnimationFrame(animate)
      }
    }
    const start = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        drawWaveform()
      } else if (!animationFrame && document.visibilityState === 'visible') {
        animationFrame = window.requestAnimationFrame(animate)
      }
    }
    const stop = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      animationFrame = 0
      drawWaveform()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stop()
      else if (!video.paused && !video.ended) start()
    }

    video.addEventListener('play', start)
    video.addEventListener('pause', stop)
    video.addEventListener('ended', stop)
    video.addEventListener('timeupdate', start)
    document.addEventListener('visibilitychange', onVisibilityChange)
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(drawWaveform)
    resizeObserver?.observe(canvas)
    drawWaveform()
    if (!video.paused && !video.ended) start()

    return () => {
      video.removeEventListener('play', start)
      video.removeEventListener('pause', stop)
      video.removeEventListener('ended', stop)
      video.removeEventListener('timeupdate', start)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      resizeObserver?.disconnect()
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
    }
  }, [processingState, videoRef])

  const canSwitchTracks = tracks.length > 1 && tracks.every((track) => track.canSwitch)
  const selectTrack = (index: number) => {
    const video = videoRef.current
    const list = video && (video as HTMLVideoElement & { audioTracks?: NativeAudioTrackList }).audioTracks
    if (!list || !canSwitchTracks || !list[index]) return

    try {
      for (let trackIndex = 0; trackIndex < list.length; trackIndex += 1) {
        list[trackIndex].enabled = trackIndex === index
      }
      const updatedTracks = readTracks(list)
      if (!updatedTracks[index]?.enabled || updatedTracks.some((track, trackIndex) => trackIndex !== index && track.enabled)) {
        setSwitchError('The browser did not confirm the requested audio-track change.')
        return
      }
      setSwitchError('')
      setTracks(updatedTracks)
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : 'The browser rejected the audio-track change.')
    }
  }

  return (
    <section className="audio-experience-panel">
      <details open>
        <summary>
          <span className="advanced-panel-icon"><Headphones size={17} aria-hidden="true" /></span>
          <span>
            <strong>Audio experience</strong>
            <small>Track availability and the player’s synchronized volume controls</small>
          </span>
          <ChevronDown className="advanced-chevron" size={16} aria-hidden="true" />
        </summary>
        <div className="audio-experience-content">
          <section aria-labelledby="audio-track-heading" className="audio-track-section">
            <div className="media-subsection-heading"><Headphones size={14} aria-hidden="true" /><h4 id="audio-track-heading">Audio tracks</h4></div>
            {!trackListExposed ? (
              <p className="advanced-explainer">This browser does not expose an audio-track list for this player.</p>
            ) : tracks.length === 0 ? (
              <p className="advanced-explainer">The browser exposes an audio-track list, but this source has not provided any selectable tracks.</p>
            ) : (
              <>
                <ul className="audio-track-list">
                  {tracks.map((track) => (
                    <li key={`${track.index}:${track.id}`}>
                      {canSwitchTracks ? (
                        <label className="audio-track-option">
                          <input
                            checked={track.enabled}
                            name={`audio-track-${source.id}`}
                            onChange={() => selectTrack(track.index)}
                            type="radio"
                          />
                          <span>
                            <strong>{track.label || `Audio track ${track.index + 1}`}</strong>
                            <small>{[track.language, track.kind].filter(Boolean).join(' · ') || 'Track metadata not provided'}</small>
                          </span>
                          {track.enabled && <small className="audio-track-active">Active</small>}
                        </label>
                      ) : (
                        <div className="audio-track-option audio-track-option--read-only">
                          <span>
                            <strong>{track.label || `Audio track ${track.index + 1}`}</strong>
                            <small>{[track.language, track.kind].filter(Boolean).join(' · ') || 'Track metadata not provided'}</small>
                          </span>
                          {track.enabled && <small className="audio-track-active">Active</small>}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {!canSwitchTracks && tracks.length > 1 && <p className="advanced-explainer">Tracks are listed as reported by the browser, but this source does not expose a verifiable switching control.</p>}
                {tracks.length === 1 && <p className="advanced-explainer">Only one track is exposed, so there is no alternate track to select.</p>}
              </>
            )}
            {switchError && <p aria-live="polite" className="advanced-warning">{switchError}</p>}
          </section>
          <section aria-labelledby="audio-volume-heading" className="audio-volume-section">
            <div className="media-subsection-heading"><h4 id="audio-volume-heading">Volume</h4></div>
            <p className="advanced-explainer">Use the speaker control in the player toolbar for the live volume slider, mute toggle, percentage, and presets. It stays synchronized with playback.</p>
            <p className="advanced-explainer">Audio-track discovery and switching vary by browser, media format, and playback engine. Tracks are shown only when the browser exposes them.</p>
            <p className="advanced-explainer">Audio Boost and independent audio delay are not offered: rerouting sources through Web Audio can fail under cross-origin restrictions, and delaying audio alone needs a custom synchronized media pipeline.</p>
          </section>
          <section aria-labelledby="audio-equalizer-heading" className="audio-processing-section">
            <div className="media-subsection-heading"><SlidersHorizontal size={14} aria-hidden="true" /><h4 id="audio-equalizer-heading">Equalizer &amp; waveform</h4></div>
            {source.kind !== 'file' ? (
              <p className="advanced-explainer">Web Audio processing is limited to locally opened video files. Remote and streaming sources may be blocked by CORS, and routing them could interrupt playback.</p>
            ) : typeof window === 'undefined' || typeof window.AudioContext !== 'function' ? (
              <p className="advanced-explainer">This browser does not support the Web Audio API required for equalization and live waveform analysis.</p>
            ) : processingState === 'idle' ? (
              <>
                <p className="advanced-explainer">Optional Web Audio processing for this local file only. Start it with this button; the equalizer and live waveform become available after browser activation.</p>
                <button className="advanced-button" onClick={() => void activateEqualizer()} type="button">Enable equalizer &amp; live waveform</button>
              </>
            ) : processingState === 'error' ? (
              <p aria-live="polite" className="advanced-warning">Audio processing could not be enabled. {processingError} Choose another local file to return to the unprocessed player path.</p>
            ) : (
              <>
                <div className="audio-processing-status" role="status"><Activity size={13} aria-hidden="true" /> Equalizer active for this local file</div>
                <p className="advanced-explainer">Three-band equalization is limited to ±6 dB. Dynamic compression helps manage boosted peaks; it cannot guarantee clipping prevention on every recording.</p>
                <p className="advanced-explainer">The Web Audio graph remains attached to this media element until you change sources. Resetting returns the EQ bands to 0 dB; source replacement restores the normal player path.</p>
                {processingError && <p aria-live="polite" className="advanced-warning">Audio processing notice: {processingError}</p>}
                {([
                  ['bass', 'Bass'],
                  ['mid', 'Mid'],
                  ['treble', 'Treble'],
                ] as const).map(([band, label]) => (
                  <label className="audio-eq-control" key={band}>
                    <span>{label}</span>
                    <input
                      aria-label={`${label} equalizer gain`}
                      max="6"
                      min="-6"
                      onChange={(event) => {
                        const value = Number(event.currentTarget.value)
                        setEqualizer((current) => ({ ...current, [band]: value }))
                      }}
                      step="1"
                      type="range"
                      value={equalizer[band]}
                    />
                    <output>{equalizer[band] > 0 ? '+' : ''}{equalizer[band]} dB</output>
                  </label>
                ))}
                <button className="advanced-text-button audio-eq-reset" disabled={equalizer.bass === 0 && equalizer.mid === 0 && equalizer.treble === 0} onClick={() => setEqualizer(NEUTRAL_EQUALIZER)} type="button">Reset to neutral</button>
                <div className="audio-waveform">
                  <div className="media-subsection-heading"><Activity size={14} aria-hidden="true" /><h4>Live waveform</h4></div>
                  <canvas aria-label="Live audio waveform from the current playback moment; this is not a full-track waveform" className="audio-waveform-canvas" ref={waveformRef} role="img" />
                  <p className="advanced-explainer">Shows recent audio amplitude during playback, not a precomputed waveform of the full track. Reduced-motion settings limit continuous animation.</p>
                </div>
              </>
            )}
          </section>
        </div>
      </details>
    </section>
  )
}
