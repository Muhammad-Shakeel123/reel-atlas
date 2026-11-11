import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { ArrowUpRight, FileVideo2, Link2 } from 'lucide-react'
import { createFileSelection, createUrlSelection } from './source'
import type { MediaSelection } from './source'

type Props = { onSelect: (selection: MediaSelection) => void }

export function MediaSourcePicker({ onSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  const openFile = (file?: File) => {
    if (!file) return
    try { onSelect(createFileSelection(file)); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'This video could not be opened.') }
  }
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    openFile(event.currentTarget.files?.[0])
    event.currentTarget.value = ''
  }
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const item = event.dataTransfer.files.item(0)
    if (event.dataTransfer.files.length > 1) { setError('Open one video at a time.'); return }
    openFile(item ?? undefined)
  }
  const handleUrl = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try { onSelect(createUrlSelection(url)); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'This media URL could not be opened.') }
  }

  return (
    <section className="media-source-panel" aria-labelledby="media-source-title">
      <div className="media-source-heading">
        <div><p className="media-engine-kicker">OPEN A SOURCE</p><h3 id="media-source-title">Bring your own film</h3></div>
        <p className="media-source-note">Your local video stays on this device. Reel Atlas does not upload it.</p>
      </div>
        <div className={`media-open-row${dragging ? ' is-dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { const next = event.relatedTarget; if (!(next instanceof Node) || !event.currentTarget.contains(next)) setDragging(false) }} onDrop={handleDrop}>
        <div className="media-local-action">
          <span className="media-source-icon" aria-hidden="true"><FileVideo2 size={17} /></span>
          <div><strong>Local video</strong><span>Drop a file here, or choose one from your device.</span></div>
          <button className="media-engine-button" onClick={() => inputRef.current?.click()} type="button">Choose video</button>
          <input ref={inputRef} accept="video/*,.mp4,.m4v,.webm,.mov,.mkv,.avi,.ts,.3gp,.flv,.wmv,.vob,.asf" className="visually-hidden" onChange={handleChange} tabIndex={-1} type="file" aria-label="Choose a local video file" />
        </div>
        <form className="media-url-form" onSubmit={handleUrl}>
          <label htmlFor="media-url"><Link2 size={16} aria-hidden="true" /><span>Network video</span></label>
          <div><input autoComplete="url" id="media-url" inputMode="url" onChange={(event) => setUrl(event.target.value)} placeholder="https://…/film.mp4 or stream.m3u8" spellCheck={false} type="url" value={url} /><button aria-label="Open network video URL" className="media-url-submit" type="submit"><ArrowUpRight size={17} aria-hidden="true" /></button></div>
        </form>
      </div>
      <p className="media-engine-footnote">Direct MP4, WebM, and MOV files; HLS manifests when the browser playback path allows. Access, CORS, and codec support depend on the source and browser.</p>
      <p aria-live="polite" className="media-source-error" role="status">{error}</p>
    </section>
  )
}
