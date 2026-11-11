export type ParsedSubtitle = {
  webVtt: string
  cueCount: number
  convertedFrom: 'srt' | 'vtt' | 'timestamped text'
}

export const SUBTITLE_CUES_CHANGED_EVENT = 'reel-atlas:subtitle-cues-changed'

const originalCueTimes = new WeakMap<TextTrackCue, { start: number; end: number }>()

export function getOriginalCueTimes(cue: TextTrackCue) {
  let value = originalCueTimes.get(cue)
  if (!value) {
    value = { start: cue.startTime, end: cue.endTime }
    originalCueTimes.set(cue, value)
  }
  return value
}

type TimedCue = { start: number; end: number; text: string; line: number }

const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024
const timestampPattern = /^((?:\d{2,}:)?\d{2}):(\d{2})[,.](\d{3})(?:\s+.*)?$/

export function decodeSubtitleFile(bytes: ArrayBuffer) {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''), encodingNotice: '' }
  } catch {
    return {
      text: new TextDecoder('windows-1252').decode(bytes).replace(/^\uFEFF/, ''),
      encodingNotice: 'The file was decoded as Windows-1252 because it was not valid UTF-8.',
    }
  }
}

function parseTimestamp(value: string) {
  const match = timestampPattern.exec(value.trim())
  if (!match) return null
  const major = match[1].split(':').map(Number)
  const hours = major.length === 2 ? major[0] : 0
  const minutes = major.length === 2 ? major[1] : major[0]
  const seconds = Number(match[2])
  const milliseconds = Number(match[3])
  if (minutes > 59 || seconds > 59) return null
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

function timestampToVtt(seconds: number) {
  const totalMilliseconds = Math.round(seconds * 1000)
  const totalSeconds = Math.floor(totalMilliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const finalSeconds = totalSeconds % 60
  const ms = totalMilliseconds % 1000
  const hourText = hours > 0 ? `${String(hours).padStart(2, '0')}:` : ''
  return `${hourText}${String(minutes).padStart(2, '0')}:${String(finalSeconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

function escapeUntrustedCueText(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function collectCues(text: string, isVtt: boolean): { cues: TimedCue[]; invalidLines: number[] } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n[\t ]*\n+/)
  const cues: TimedCue[] = []
  const invalidLines: number[] = []
  let previousStart = -1
  let searchFromLine = isVtt ? lines.findIndex((line) => line.trim().startsWith('WEBVTT')) + 1 : 0

  for (const block of blocks) {
    const blockLines = block.split('\n')
    const firstLine = blockLines.find((line) => line.trim() !== '')?.trim() ?? ''
    if (isVtt && (!firstLine || /^WEBVTT(?:\s|$)/.test(firstLine) || /^(NOTE|STYLE|REGION)(?:\s|$)/.test(firstLine))) continue
    const timingIndex = blockLines.findIndex((line) => line.includes('-->'))
    if (timingIndex < 0) {
      if (block.trim()) invalidLines.push(searchFromLine + 1)
      searchFromLine += blockLines.length + 1
      continue
    }
    const timingLine = blockLines[timingIndex]
    const [startText, endAndSettings] = timingLine.split('-->')
    const endText = endAndSettings?.trim().split(/\s+/, 1)[0] ?? ''
    const start = parseTimestamp(startText.trim())
    const end = parseTimestamp(endText)
    const cueText = blockLines.slice(timingIndex + 1).join('\n').trim()
    if (start === null || end === null || end <= start || !cueText || start < previousStart) {
      invalidLines.push(searchFromLine + timingIndex + 1)
    } else {
      cues.push({ start, end, text: cueText, line: searchFromLine + timingIndex + 1 })
      previousStart = start
    }
    searchFromLine += blockLines.length + 1
  }
  return { cues, invalidLines }
}

export function parseSubtitleText(text: string, extension: string): ParsedSubtitle {
  const normalizedExtension = extension.toLowerCase().replace(/^\./, '')
  const isVtt = normalizedExtension === 'vtt' || (normalizedExtension === 'txt' && /^\s*WEBVTT(?:\s|$)/.test(text))
  if (normalizedExtension !== 'vtt' && normalizedExtension !== 'srt' && normalizedExtension !== 'txt') {
    throw new Error('This format is not supported here. Choose an SRT or WebVTT (.vtt) file. ASS/SSA need a styling renderer; SUB/IDX need paired-file decoding.')
  }
  if (isVtt && !/^\s*WEBVTT(?:\s|$)/.test(text)) throw new Error('A .vtt file must begin with a WEBVTT header.')
  const { cues, invalidLines } = collectCues(text, isVtt)
  if (invalidLines.length) {
    const locations = invalidLines.slice(0, 3).join(', ')
    const suffix = invalidLines.length > 3 ? ` and ${invalidLines.length - 3} more` : ''
    throw new Error(`Found ${invalidLines.length} invalid or out-of-order cue block${invalidLines.length === 1 ? '' : 's'} at line${invalidLines.length === 1 ? '' : 's'} ${locations}${suffix}. Check each timestamp and ensure its end is after its start.`)
  }
  if (!cues.length) {
    throw new Error(normalizedExtension === 'txt'
      ? 'This text file does not contain a recognized timestamped subtitle sequence.'
      : 'No valid timed subtitle cues were found in this file.')
  }
  const convertedFrom = isVtt ? 'vtt' : normalizedExtension === 'txt' ? 'timestamped text' : 'srt'
  if (isVtt) return { webVtt: text.replace(/^\uFEFF/, ''), cueCount: cues.length, convertedFrom }
  const body = cues.map((cue, index) => `${index + 1}\n${timestampToVtt(cue.start)} --> ${timestampToVtt(cue.end)}\n${escapeUntrustedCueText(cue.text)}`).join('\n\n')
  return { webVtt: `WEBVTT\n\n${body}\n`, cueCount: cues.length, convertedFrom }
}

export async function parseSubtitleFile(file: File): Promise<{ parsed: ParsedSubtitle; encodingNotice: string }> {
  if (file.size === 0) throw new Error('This subtitle file is empty.')
  if (file.size > MAX_SUBTITLE_BYTES) throw new Error('Subtitle files must be 5 MB or smaller.')
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!['srt', 'vtt', 'txt'].includes(extension)) {
    throw new Error('Choose an SRT or WebVTT (.vtt) file. ASS/SSA styling and paired SUB/IDX formats are not supported.')
  }
  const decoded = decodeSubtitleFile(await file.arrayBuffer())
  return { parsed: parseSubtitleText(decoded.text, extension), encodingNotice: decoded.encodingNotice }
}
