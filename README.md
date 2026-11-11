# Reel Atlas

Reel Atlas is an editorial-style media player experience built around the existing Video.js v10 player. It combines source selection, playback tools, captions and transcripts, timeline notes, a private on-device library, and responsive cinema layouts. Media remains in the browser; the app does not upload user files or provide cloud synchronization.

## Technology

- React 19, TypeScript, and Vite
- Video.js v10 through `@videojs/react`
- Mux playback integration and the browser-supported HLS playback paths
- CSS, Tailwind CSS, and the Geist variable font

The Video.js v10 player and its media element remain central. Optional browser APIs are detected and used only when available; the app does not replace playback with simulated state.

## Setup

Requires Node.js and npm.

```powershell
npm.cmd install
npm.cmd run dev
```

Quality commands:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd ls --depth=0
```

## Features

### Sources and playback

- Start with the configured Mux playback ID, open a direct network media URL, or choose a local video file.
- Direct MP4, WebM, MOV, and other browser-decodable video sources are accepted where the player path supports them. HLS (`.m3u8`) is supported through native browser playback or the available HLS.js adapter. A recognized extension or MIME type does not guarantee codec support.
- Stage 2 controls include playback-rate selection, seek gestures, brightness adjustment within the video, zoom and fit modes, A–B repeat, sleep timer, optional screenshot capture, and browser orientation-lock requests where supported.
- Resume positions use the existing local browser progress records. Resume is offered only for a safe, identifiable source and a valid incomplete position.

Playback depends on the browser, source reachability, codec support, CORS policy, and any host restrictions. A source may be accepted by the picker and still fail to play.

### Subtitles, audio, transcript, and moments

- Choose browser-provided caption/subtitle tracks or import SRT, WebVTT, and timestamped TXT files for local conversion and playback.
- Adjust subtitle appearance and timing, search available transcript cues, and seek to real cues or chapter metadata exposed through `TextTrack`.
- Add personal bookmarks and notes to the actual media timeline.
- Inspect native audio tracks where exposed. Optional three-band EQ and waveform analysis use Web Audio for local video files only; remote sources are not routed through that graph.

Reel Atlas does not generate scenes, transcripts, summaries, speaker identities, or media metadata. Chapter titles and active transcript cues are shown only when provided by the source/browser.

### Library and viewing modes

- Recently opened media, favorites, and playlists are stored separately on the device. Safe network URLs and Mux IDs can be persisted; URLs containing credentials, query strings, hashes, or token-like path segments are excluded.
- Local files and their favorites are session-only. The current page retains the selected `File` object so a local library item can be reopened in that session by creating a fresh object URL. The file and object URL are not persisted; after refresh, select the file or folder again.
- Folder browsing uses `showDirectoryPicker()` when available and reads only top-level files after user selection. Otherwise, individual file selection is available. Folder handles are not retained.
- Standard, Cinema, Immersive, and Focus View change the in-page presentation. Browser fullscreen and native Picture-in-Picture remain separate player/browser controls.

### Media Session and remote playback

- When exposed, the Media Session API receives the current source title and connects play, pause, bounded seek, and valid playback-position updates to the existing video element. Previous/next are registered only for valid entries in the opened playlist.
- The skin’s native Remote Playback/Cast and WebKit AirPlay controls are not simulated. Availability and connection state depend on the current video element, browser, secure-context policy, device discovery, permissions, source URL, and receiving device.
- Browser-native remote playback is not a configurable Google Cast integration. Configurable Chromecast receivers and load requests require the Video.js Google Cast extension and Google Cast sender SDK. A custom receiver needs additional receiver configuration. These are not included.
- Background playback may be throttled or stopped by browser, operating-system, power, or screen-lock policy. Reel Atlas does not force background playback or promise it will continue.

## Privacy and accessibility

Library, resume, bookmark, and note data stays in browser storage on this device. Sensitive or non-reusable source URLs are not written to persistent library/resume storage. Storage availability and quotas vary; browser data can be cleared or unavailable.

Controls use semantic labels and keyboard-operable elements where applicable, with visible focus styles, live feedback, reduced-motion handling, and responsive layouts. Subtitle appearance includes contrast options. This is a practical accessibility effort, not a formal WCAG audit or conformance certification; assistive technology and browser behavior may vary.

## Verification status and limitations

There is no configured automated test suite. In a Windows VS Code embedded Chromium session, browser checks confirmed:

- `npm.cmd run lint`, `npm.cmd run build`, and `npm.cmd ls --depth=0` completed successfully. The build still reports large JavaScript chunks and a dependency module-directive warning.
- A public MP4 loaded and played with real duration, dimensions, buffering, seeking, and play/pause state updates.
- Imported WebVTT cues appeared in the native text track and Moment Atlas; transcript search and cue seeking worked. Replacing the source cleared the prior track and transcript.
- A selected local MP4 decoded, produced a captured frame, remained session-only, and reopened from the library after switching sources. Reopening created a fresh object URL; the previous URL was revoked.
- A–B repeat looped within its selected range. Cinema/Immersive/Focus transitions preserved playback, and Escape exited Focus View. Browser fullscreen and native Picture-in-Picture entered and exited through their browser APIs.
- The local-file equalizer activated and rendered its waveform canvas. Source replacement removed that UI and revoked the local object URL.
- Responsive layouts were checked at 320, 360, 390, 768, 1024, 1440, and 1920 pixels without horizontal page overflow. Reduced-motion, forced-colors, increased-contrast, and visible keyboard focus were checked in Chromium.
- Touch pinch and brightness gestures were exercised with synthetic pointer events only; this is not physical-device validation. Screenshot capture succeeded for the local file; cross-origin capture was blocked as expected. Orientation locking, screen-lock behavior, assistive-technology behavior, and physical-device gestures were not verified.
- The configured Mux source returned a browser playback error. A reachable public HLS manifest also failed in this browser session. Neither should be considered playback-verified. Remote Playback APIs were detected but no device was available; AirPlay was unsupported here.

These are practical browser checks, not a formal WCAG audit or cross-browser/device certification. Network playback, codecs, CORS, permissions, PiP, orientation, remote devices, AirPlay, Chromecast, and background/screen-lock behavior remain conditional. API detection and codec estimates do not certify playback.
