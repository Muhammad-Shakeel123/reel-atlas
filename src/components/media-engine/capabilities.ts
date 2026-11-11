export type SupportLevel = 'likely' | 'conditional' | 'unknown' | 'unsupported'
export type ProbeResult = { supported: boolean; smooth: boolean; powerEfficient: boolean } | null
export type CapabilityRow = { container: string; codec: string; level: SupportLevel; detail: string }

type ProbeProfile = 'Data Saver' | 'Balanced' | 'High Quality' | 'Cinema'
const profiles: Record<ProbeProfile, { width: number; height: number; bitrate: number; framerate: number }> = {
  'Data Saver': { width: 854, height: 480, bitrate: 900_000, framerate: 30 },
  Balanced: { width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30 },
  'High Quality': { width: 2560, height: 1440, bitrate: 12_000_000, framerate: 30 },
  Cinema: { width: 3840, height: 2160, bitrate: 25_000_000, framerate: 60 },
}

const combinations = [
  { container: 'MP4', codec: 'H.264 / AVC', mime: 'video/mp4; codecs="avc1.42E01E"' },
  { container: 'MP4', codec: 'H.265 / HEVC', mime: 'video/mp4; codecs="hvc1.1.6.L93.B0"' },
  { container: 'MP4', codec: 'AV1', mime: 'video/mp4; codecs="av01.0.05M.08"' },
  { container: 'MP4', codec: 'VP9', mime: 'video/mp4; codecs="vp09.00.10.08"' },
  { container: 'WebM', codec: 'VP8', mime: 'video/webm; codecs="vp8"' },
  { container: 'WebM', codec: 'VP9', mime: 'video/webm; codecs="vp09.00.10.08"' },
  { container: 'WebM', codec: 'AV1', mime: 'video/webm; codecs="av01.0.05M.08"' },
  { container: 'MOV', codec: 'H.264 / AVC', mime: 'video/quicktime; codecs="avc1.42E01E"' },
  { container: 'MKV', codec: 'H.264 / AVC', mime: 'video/x-matroska; codecs="avc1.42E01E"' },
  { container: 'MKV', codec: 'VP9', mime: 'video/x-matroska; codecs="vp09.00.10.08"' },
  { container: 'AVI', codec: 'DivX', mime: 'video/x-msvideo; codecs="DX50"' },
  { container: 'AVI', codec: 'Xvid', mime: 'video/x-msvideo; codecs="XVID"' },
  { container: 'TS', codec: 'H.264 / AVC', mime: 'video/mp2t; codecs="avc1.42E01E"' },
  { container: '3GP', codec: 'H.264 / AVC', mime: 'video/3gpp; codecs="avc1.42E01E"' },
  { container: 'FLV', codec: 'H.264 / AVC', mime: 'video/x-flv; codecs="avc1.42E01E"' },
  { container: 'WMV', codec: 'Windows Media Video', mime: 'video/x-ms-wmv' },
  { container: 'VOB', codec: 'MPEG-2', mime: 'video/mpeg; codecs="mp2v"' },
  { container: 'ASF', codec: 'Windows Media Video', mime: 'video/x-ms-asf' },
]

export function detectBrowser(): string {
  const ua = navigator.userAgent
  if (/Edg\//.test(ua)) return 'Microsoft Edge'
  if (/Firefox\//.test(ua)) return 'Mozilla Firefox'
  if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return 'Google Chrome'
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return 'Apple Safari'
  return 'Browser name unavailable'
}

function classify(result: CanPlayTypeResult): { level: SupportLevel; detail: string } {
  if (result === 'probably') return { level: 'likely', detail: 'Browser reports this codec/container combination as probably playable.' }
  if (result === 'maybe') return { level: 'conditional', detail: 'Browser may play it; the actual codec profile and file must be checked during playback.' }
  if (result === '') return { level: 'unsupported', detail: 'Browser reports no decoder for this declared MIME and codec combination. Another source or conversion may be needed.' }
  return { level: 'unknown', detail: 'Browser did not provide a result for this combination.' }
}

export function getCompatibilityRows(video: HTMLVideoElement): CapabilityRow[] {
  return combinations.map(({ container, codec, mime }) => {
    const result = video.canPlayType(mime)
    const status = classify(result)
    return { container, codec, ...status }
  })
}

export type DeviceCapabilities = {
  browser: string
  matrix: CapabilityRow[]
  nativeHls: boolean
  hlsJsPath: boolean
  dash: boolean
  profiles: Record<ProbeProfile, ProbeResult>
  hdr: ProbeResult
  mediaCapabilitiesAvailable: boolean
}

export async function inspectDeviceCapabilities(video: HTMLVideoElement): Promise<DeviceCapabilities> {
  const nativeHls = video.canPlayType('application/vnd.apple.mpegurl') !== ''
  const hlsJsPath = typeof MediaSource !== 'undefined' && typeof MediaSource.isTypeSupported === 'function'
    && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"')
  const mediaCapabilities = navigator.mediaCapabilities
  const query = async (profile: ProbeProfile): Promise<ProbeResult> => {
    if (!mediaCapabilities?.decodingInfo) return null
    const spec = profiles[profile]
    try {
      const result = await mediaCapabilities.decodingInfo({
        type: 'media-source',
        video: { contentType: 'video/mp4; codecs="avc1.42E01E"', width: spec.width, height: spec.height, bitrate: spec.bitrate, framerate: spec.framerate },
      })
      return { supported: result.supported, smooth: result.smooth, powerEfficient: result.powerEfficient }
    } catch { return null }
  }
  const profileNames = Object.keys(profiles) as ProbeProfile[]
  const resultPairs = await Promise.all(profileNames.map(async (profile) => [profile, await query(profile)] as const))
  let hdr: ProbeResult = null
  if (mediaCapabilities?.decodingInfo) {
    try {
      const result = await mediaCapabilities.decodingInfo({
        type: 'media-source',
        video: { contentType: 'video/mp4; codecs="hev1.2.4.L153.B0"', width: 3840, height: 2160, bitrate: 25_000_000, framerate: 30, colorGamut: 'rec2020', transferFunction: 'pq' },
      })
      hdr = { supported: result.supported, smooth: result.smooth, powerEfficient: result.powerEfficient }
    } catch { hdr = null }
  }
  return {
    browser: detectBrowser(), matrix: getCompatibilityRows(video), nativeHls, hlsJsPath,
    dash: false,
    profiles: Object.fromEntries(resultPairs) as Record<ProbeProfile, ProbeResult>,
    hdr, mediaCapabilitiesAvailable: Boolean(mediaCapabilities?.decodingInfo),
  }
}

export type QualityProfile = ProbeProfile
export const QUALITY_PROFILES: QualityProfile[] = ['Data Saver', 'Balanced', 'High Quality', 'Cinema']

export function getQualityAdvice(profile: QualityProfile, probe: ProbeResult, width: number, height: number, kind: string): string {
  const current = width && height ? `${width} × ${height}` : 'not reported yet'
  if (probe?.supported === false) return `${profile} uses a ${profiles[profile].width} × ${profiles[profile].height} H.264 estimate; this browser did not report it as supported. Current video: ${current}.`
  if (probe?.smooth === false) return `${profile} may not play smoothly at its estimated profile on this device. Current video: ${current}. Choose a lower source rendition if one is available.`
  const qualityNote = probe?.supported ? (probe.smooth ? 'The browser estimates this H.264 profile as supported and smooth.' : 'The browser reports support but cannot estimate smooth playback.') : 'This browser does not expose a quality estimate for the profile.'
  const sourceNote = kind === 'hls' || kind === 'mux'
    ? 'An adaptive stream may choose among the renditions supplied by its host; this advisor does not change that selection.'
    : 'This source is fixed; the profile is guidance only and cannot change its resolution.'
  return `${qualityNote} Current video: ${current}. ${sourceNote}`
}
