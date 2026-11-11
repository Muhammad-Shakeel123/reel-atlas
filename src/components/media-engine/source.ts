export type MediaSourceKind = 'mux' | 'hls' | 'file' | 'url'

export type MediaSelection = {
  id: string
  kind: MediaSourceKind
  label: string
  src: string
  type: string
  fileName?: string
  file?: File
  playbackId?: string
  objectUrl?: string
  fileSize?: number
  fileLastModified?: number
}

const MEDIA_TYPES: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
  mov: 'video/quicktime', m3u8: 'application/vnd.apple.mpegurl', mpd: 'application/dash+xml',
  mkv: 'video/x-matroska', avi: 'video/x-msvideo', ts: 'video/mp2t', '3gp': 'video/3gpp',
  flv: 'video/x-flv', wmv: 'video/x-ms-wmv', vob: 'video/mpeg', asf: 'video/x-ms-asf',
}

export function createDefaultSelection(playbackId: string): MediaSelection {
  return { id: 'reel-atlas-default-mux', kind: 'mux', label: 'Reel Atlas film', src: `https://stream.mux.com/${playbackId}.m3u8`, type: 'application/vnd.apple.mpegurl', playbackId }
}

export function createFileSelection(file: File): MediaSelection {
  if (!file.size) throw new Error('This file is empty. Choose a video with content.')
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (extension === 'm3u8' || extension === 'mpd') throw new Error('Local HLS and DASH manifests need their related stream files. Open a network manifest URL instead.')
  const type = file.type.startsWith('video/') ? file.type : MEDIA_TYPES[extension]
  if (!type || !type.startsWith('video/')) throw new Error('This file type is not recognized as a video. Choose an MP4, WebM, MOV, or another browser-playable video.')
  const objectUrl = URL.createObjectURL(file)
  return { id: crypto.randomUUID(), kind: 'file', label: file.name, fileName: file.name, file, fileSize: file.size, fileLastModified: file.lastModified, src: objectUrl, type, objectUrl }
}

export function createUrlSelection(input: string): MediaSelection {
  let url: URL
  try { url = new URL(input.trim()) } catch { throw new Error('Enter a complete media URL, including https:// or http://.') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only http:// and https:// media URLs can be opened.')
  if (url.username || url.password) throw new Error('For your security, URLs containing embedded usernames or passwords are not accepted.')

  const host = url.hostname.toLowerCase()
  const muxMatch = host === 'stream.mux.com' ? url.pathname.match(/^\/([^/]+)\.m3u8$/) : null
  if (muxMatch?.[1]) return { id: crypto.randomUUID(), kind: 'mux', label: 'Mux stream', src: url.href, type: 'application/vnd.apple.mpegurl', playbackId: muxMatch[1] }

  const pathname = url.pathname.toLowerCase()
  const isHls = pathname.endsWith('.m3u8') || url.searchParams.get('format')?.toLowerCase() === 'm3u8'
  if (isHls) return { id: crypto.randomUUID(), kind: 'hls', label: 'HLS stream', src: url.href, type: 'application/vnd.apple.mpegurl' }
  if (pathname.endsWith('.mpd')) throw new Error('DASH manifests are not enabled in this player. Reel Atlas supports MP4/WebM URLs and HLS streams.')
  const extension = pathname.split('.').pop() ?? ''
  const type = MEDIA_TYPES[extension]
  if (!type || type.includes('mpegurl') || type.includes('dash+xml')) {
    throw new Error('This URL must point directly to an MP4, WebM, MOV, or HLS (.m3u8) media source.')
  }
  return { id: crypto.randomUUID(), kind: 'url', label: url.hostname, src: url.href, type }
}

export function safeSourceLabel(source: MediaSelection): string {
  if (source.kind === 'file') return source.fileName ?? 'Local video file'
  try {
    const url = new URL(source.src)
    return `${url.hostname}${url.pathname.length > 48 ? `${url.pathname.slice(0, 45)}…` : url.pathname}`
  } catch { return source.label }
}
