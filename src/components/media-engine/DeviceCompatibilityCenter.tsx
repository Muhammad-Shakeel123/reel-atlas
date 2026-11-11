import { useEffect, useRef, useState } from 'react'
import { ChevronDown, CircleHelp, Disc3, Gauge, MonitorCog } from 'lucide-react'
import type { RefObject } from 'react'
import { getQualityAdvice, inspectDeviceCapabilities, QUALITY_PROFILES } from './capabilities'
import type { DeviceCapabilities, QualityProfile, SupportLevel } from './capabilities'
import type { MediaSelection } from './source'

type Props = { videoRef: RefObject<HTMLVideoElement | null>; source: MediaSelection }
const statusLabel: Record<SupportLevel, string> = { likely: 'Likely', conditional: 'Conditional', unknown: 'Unknown', unsupported: 'Unsupported' }

function probeLabel(supported: boolean, smooth?: boolean) {
  if (!supported) return 'Not supported in this estimate'
  if (smooth === false) return 'Supported; smoothness uncertain'
  return 'Supported in this estimate'
}

function performanceEstimate(result: { smooth: boolean; powerEfficient: boolean } | null) {
  return result ? `Smoothness: ${result.smooth ? 'estimated yes' : 'estimated no'} · Power efficiency: ${result.powerEfficient ? 'estimated yes' : 'estimated no'}` : 'Performance estimates unavailable'
}

export function DeviceCompatibilityCenter({ videoRef, source }: Props) {
  const hasLoadedRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null)
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<QualityProfile>('Balanced')
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const video = videoRef.current
    if (!open || !video || hasLoadedRef.current) return
    let active = true
    const updateDimensions = () => setDimensions({ width: video.videoWidth, height: video.videoHeight })
    video.addEventListener('loadedmetadata', updateDimensions)
    video.addEventListener('resize', updateDimensions)
    updateDimensions()
    setLoading(true)
    inspectDeviceCapabilities(video).then((result) => { if (active) { hasLoadedRef.current = true; setCapabilities(result) } }).finally(() => { if (active) setLoading(false) })
    return () => {
      active = false
      video.removeEventListener('loadedmetadata', updateDimensions)
      video.removeEventListener('resize', updateDimensions)
    }
  }, [open, source.id, videoRef])

  const selectedProbe = capabilities?.profiles[profile] ?? null
  const advice = getQualityAdvice(profile, selectedProbe, dimensions.width, dimensions.height, source.kind)

  return (
    <details className="media-engine-panel media-compatibility" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><span className="media-engine-summary-icon"><MonitorCog size={17} aria-hidden="true" /></span><span><strong>Device &amp; format compatibility</strong><small>Browser-reported playback estimates</small></span><ChevronDown className="media-engine-chevron" size={16} aria-hidden="true" /></summary>
      {loading && <p className="media-engine-loading" role="status">Checking available browser capabilities…</p>}
      {capabilities && <div className="media-engine-content">
        <div className="media-device-facts">
          <div><span>Browser</span><strong>{capabilities.browser}</strong></div>
          <div><span>Current source</span><strong>{source.label}</strong></div>
          <div><span>HLS</span><strong>{capabilities.nativeHls ? 'Native playback reported' : capabilities.hlsJsPath ? 'Compatible HLS.js path available' : 'Not detected on this browser'}</strong></div>
          <div><span>DASH</span><strong>Not enabled in this player</strong></div>
        </div>
        <section className="media-quality-advisor" aria-labelledby="quality-advisor-title">
          <div className="media-subsection-heading"><Gauge size={16} aria-hidden="true" /><h4 id="quality-advisor-title">Playback quality advisor</h4></div>
          <label className="media-profile-select">Estimate profile<select onChange={(event) => setProfile(event.target.value as QualityProfile)} value={profile}>{QUALITY_PROFILES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <p>{advice}</p>
          {selectedProbe && <span className="media-quality-status">Browser estimate: {probeLabel(selectedProbe.supported, selectedProbe.smooth)} · {performanceEstimate(selectedProbe)}</span>}
        </section>
        <section className="media-capability-section" aria-labelledby="media-format-title">
          <div className="media-subsection-heading"><Disc3 size={16} aria-hidden="true" /><h4 id="media-format-title">Container &amp; codec combinations</h4></div>
          <p className="media-section-explainer">An extension identifies a container, not the codecs inside it. These results are browser hints; successful playback still depends on the actual file, profile, and stream access.</p>
          <ul className="media-capability-list">{capabilities.matrix.map((row) => <li key={`${row.container}-${row.codec}`}><span><strong>{row.container}</strong><small>{row.codec}</small></span><span className={`media-support-badge status-${row.level}`}>{statusLabel[row.level]}</span></li>)}</ul>
        </section>
        <section className="media-capability-section" aria-labelledby="media-performance-title">
          <div className="media-subsection-heading"><CircleHelp size={16} aria-hidden="true" /><h4 id="media-performance-title">Resolution, smoothness &amp; HDR</h4></div>
          <p className="media-section-explainer">Media Capabilities tests use representative H.264 profiles. They are estimates, not maximum-resolution guarantees or decoder controls.</p>
          <ul className="media-capability-list">{QUALITY_PROFILES.map((item) => {
            const result = capabilities.profiles[item]
            return <li key={item}><span><strong>{item}</strong><small>{({ 'Data Saver': '480p · 30 fps', Balanced: '1080p · 30 fps', 'High Quality': '1440p · 30 fps', Cinema: '4K · 60 fps' })[item]}</small></span><span className="media-profile-result"><strong className="media-support-badge">{result ? probeLabel(result.supported, result.smooth) : 'Unavailable'}</strong><small>{performanceEstimate(result)}</small></span></li>
          })}</ul>
          <p className="media-hdr-note">HDR (HEVC, Rec. 2020 / PQ): <strong>{capabilities.hdr ? `${probeLabel(capabilities.hdr.supported, capabilities.hdr.smooth)} · ${performanceEstimate(capabilities.hdr)}` : 'Not exposed or query unsupported'}</strong></p>
          {!capabilities.mediaCapabilitiesAvailable && <p className="media-hdr-note">This browser does not expose Media Capabilities estimates. Codec hints above remain available.</p>}
        </section>
        <p className="media-compatibility-caveat">The browser does not disclose a manual hardware/software decoder switch. If a file fails, choose another compatible source or convert it to a browser-supported format.</p>
      </div>}
    </details>
  )
}
