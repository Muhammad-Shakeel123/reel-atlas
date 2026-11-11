import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { Activity, ChevronDown, ShieldCheck } from 'lucide-react'
import type { MediaSelection } from './source'
import { safeSourceLabel } from './source'

type Props = { videoRef: RefObject<HTMLVideoElement | null>; source: MediaSelection }
type Snapshot = { time: number; duration: number; width: number; height: number; rate: number; ready: number; network: number; buffered: number; dropped: number | null; total: number | null; error: string }
const readyStates = ['Nothing', 'Metadata', 'Current data', 'Future data', 'Enough data']
const networkStates = ['Empty', 'Idle', 'Loading', 'No source']
function time(value: number) {
  if (!Number.isFinite(value)) return '—'
  const seconds = Math.max(0, Math.floor(value))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function PlaybackDiagnostics({ videoRef, source }: Props) {
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!open || !video) return
    const update = () => {
      let dropped: number | null = null
      let total: number | null = null
      try {
        const quality = video.getVideoPlaybackQuality?.()
        if (quality) { dropped = quality.droppedVideoFrames; total = quality.totalVideoFrames }
      } catch { /* Browser does not expose playback quality. */ }
      let buffered = 0
      try {
        for (let index = 0; index < video.buffered.length; index += 1) {
          const start = video.buffered.start(index)
          const end = video.buffered.end(index)
          if (video.currentTime >= start && video.currentTime <= end) { buffered = Math.max(0, end - video.currentTime); break }
        }
      } catch { /* Buffered ranges may change between reads. */ }
      setSnapshot({ time: video.currentTime, duration: video.duration, width: video.videoWidth, height: video.videoHeight, rate: video.playbackRate, ready: video.readyState, network: video.networkState, buffered, dropped, total, error: video.error ? `${video.error.code}: ${video.error.message || 'The browser did not provide more detail.'}` : '' })
    }
    const events = ['loadedmetadata', 'loadeddata', 'resize', 'timeupdate', 'progress', 'waiting', 'playing', 'ratechange', 'error', 'emptied', 'durationchange', 'seeked'] as const
    events.forEach((eventName) => video.addEventListener(eventName, update))
    update()
    return () => events.forEach((eventName) => video.removeEventListener(eventName, update))
  }, [open, source.id, videoRef])

  return (
    <details className="media-engine-panel media-diagnostics" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><span className="media-engine-summary-icon"><Activity size={17} aria-hidden="true" /></span><span><strong>Playback diagnostics</strong><small>Optional, browser-reported details</small></span><ChevronDown className="media-engine-chevron" size={16} aria-hidden="true" /></summary>
      {snapshot && <div className="media-engine-content">
        <dl className="media-diagnostic-list">
          <div><dt>Source</dt><dd>{safeSourceLabel(source)}</dd></div>
          <div><dt>Playback position</dt><dd>{time(snapshot.time)} / {time(snapshot.duration)}</dd></div>
          <div><dt>Video size</dt><dd>{snapshot.width && snapshot.height ? `${snapshot.width} × ${snapshot.height}` : 'Not available yet'}</dd></div>
          <div><dt>Encoded frame rate</dt><dd>Not reported by the media element</dd></div>
          <div><dt>Playback rate</dt><dd>{snapshot.rate}×</dd></div>
          <div><dt>Ready state</dt><dd>{readyStates[snapshot.ready] ?? 'Unknown'} ({snapshot.ready})</dd></div>
          <div><dt>Network state</dt><dd>{networkStates[snapshot.network] ?? 'Unknown'} ({snapshot.network})</dd></div>
          <div><dt>Buffered ahead</dt><dd>{snapshot.buffered.toFixed(1)} seconds</dd></div>
          <div><dt>Dropped frames</dt><dd>{snapshot.dropped === null ? 'Not exposed by this browser' : `${snapshot.dropped} of ${snapshot.total ?? 'unknown'}`}</dd></div>
        </dl>
        <p className={snapshot.error ? 'media-diagnostic-error' : 'media-diagnostic-note'}>{snapshot.error ? `Playback error: ${snapshot.error}` : <><ShieldCheck size={14} aria-hidden="true" /> Bitrate and decoder details are not provided by the browser for this source.</>}</p>
      </div>}
    </details>
  )
}
