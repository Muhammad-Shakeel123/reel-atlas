import { Gesture } from '@videojs/react';

export interface VideoGesturesProps {
  disabled?: boolean | undefined;
  touchDisabled?: boolean | undefined;
  customTouchSeeking?: boolean | undefined;
}

export function VideoGestures({ disabled = false, touchDisabled = false, customTouchSeeking = false }: VideoGesturesProps = {}) {
  return (
    <>
      <Gesture disabled={disabled} type="tap" action="togglePaused" pointer="mouse" region="center" />
      <Gesture disabled={disabled || touchDisabled} type="tap" action="toggleControls" pointer="touch" />
      <Gesture disabled={disabled || touchDisabled || customTouchSeeking} type="doubletap" action="seekStep" region="left" />
      <Gesture disabled={disabled || touchDisabled} type="doubletap" action="toggleFullscreen" region="center" />
      <Gesture disabled={disabled || touchDisabled || customTouchSeeking} type="doubletap" action="seekStep" region="right" />
    </>
  );
}
