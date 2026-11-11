'use client';

import '../styles/video/scaffold.css';
import { Container as ContainerPrimitive, Poster as PosterPrimitive, Slider as SliderPrimitive } from '@videojs/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/resolve-class-name';

import { VideoGestures } from './behaviors/gestures';
import { VideoHotkeys } from './behaviors/hotkeys';
import { VideoControls } from './controls';
import { ErrorDialog } from './shared/error-dialog';
import { Indicators } from './shared/indicators';
import { SeekIndicator } from './shared/seek-indicator';
import { StatusAnnouncer } from './shared/status-announcer';
import { Poster } from './shared/video-feedback';

export interface VideoSkinProps extends Omit<ContainerPrimitive.Props, 'children'> {
  children?: ReactNode;
  renderPoster?: PosterPrimitive.ImageProps['render'];
  renderThumbnail?: SliderPrimitive.Thumbnail.ImageProps['render'];
  touchLocked?: boolean;
  touchGesturesEnabled?: boolean;
  customTouchSeeking?: boolean;
}

export function VideoSkin({ children, className, renderPoster, renderThumbnail, touchLocked = false, touchGesturesEnabled = true, customTouchSeeking = false, ...props }: VideoSkinProps = {}) {
  return (
    <ContainerPrimitive
      className={cn(
        'media-skin',
        'relative block h-full w-full overflow-hidden rounded-media-player [--spacing:var(--media-spacing)] [font-family:var(--media-font-family,inherit)] text-media text-media-foreground @container/media-root',
        'outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-media-ring',
        'bg-black',
        className
      )}
      data-theme="scaffold"
      data-preset="video"
      {...props}
    >
      {children}
      <Poster renderImage={renderPoster} />
      <ErrorDialog />
      <VideoControls renderThumbnail={renderThumbnail} />

      <VideoHotkeys />
      <VideoGestures touchDisabled={touchLocked || !touchGesturesEnabled} customTouchSeeking={customTouchSeeking && touchGesturesEnabled && !touchLocked} />
      <StatusAnnouncer />
      <Indicators>
        <SeekIndicator />
      </Indicators>
    </ContainerPrimitive>
  );
}
