import {
  StatusIndicator as StatusIndicatorPrimitive,
  VolumeIndicator as VolumeIndicatorPrimitive,
} from '@videojs/react';
import {
  CaptionsOnIcon as CaptionsOnIconPrimitive,
  CaptionsOffIcon as CaptionsOffIconPrimitive,
  FullscreenEnterIcon as FullscreenEnterIconPrimitive,
  FullscreenExitIcon as FullscreenExitIconPrimitive,
  PipEnterIcon as PipEnterIconPrimitive,
  PipExitIcon as PipExitIconPrimitive,
  VolumeHighIcon as VolumeHighIconPrimitive,
  VolumeLowIcon as VolumeLowIconPrimitive,
  VolumeOffIcon as VolumeOffIconPrimitive,
} from '@videojs/react/icons/scaffold';
import type { ReactNode } from 'react';

import { cn } from '@/lib/resolve-class-name';

const STATUS_ACTIONS = ['toggleSubtitles', 'toggleFullscreen', 'togglePictureInPicture'] as const;

/**
 * Transient feedback stacks above the title and below the controls, and never takes pointer input. The whole group is
 * hidden from assistive technology: `StatusAnnouncer` already speaks these same events, so exposing both would announce
 * every one of them twice.
 */
export function Indicators({ children }: { children?: ReactNode } = {}) {
  return (
    <div
      aria-hidden="true"
      className={
        'pointer-events-none absolute inset-0 z-20 grid grid-cols-3 items-center justify-items-center forced-colors:z-40'
      }
    >
      <VolumeIndicator />
      <StatusIndicator />
      {children}
    </div>
  );
}

function StatusIndicator() {
  return (
    <StatusIndicatorPrimitive.Root
      actions={STATUS_ACTIONS}
      className={cn(
        'pointer-events-none flex items-center gap-2 rounded-none bg-media-background px-2.5 py-1',
        'media-high-contrast:bg-media-background media-high-contrast:outline media-high-contrast:outline-current',
        'forced-colors:bg-[Canvas] forced-colors:text-[CanvasText] forced-colors:outline forced-colors:outline-[CanvasText]',
        'group/input-status col-start-2 row-start-1 self-start mt-3'
      )}
    >
      <CaptionsOnIconPrimitive
        className={cn('hidden size-4.5 shrink-0', 'group-data-[status=captions-on]/input-status:block')}
      />
      <CaptionsOffIconPrimitive
        className={cn('hidden size-4.5 shrink-0', 'group-data-[status=captions-off]/input-status:block')}
      />
      <FullscreenEnterIconPrimitive
        className={cn('hidden size-4.5 shrink-0', 'group-data-[status=fullscreen]/input-status:block')}
      />
      <FullscreenExitIconPrimitive
        className={cn('hidden size-4.5 shrink-0', 'group-data-[status=exit-fullscreen]/input-status:block')}
      />
      <PipEnterIconPrimitive className={cn('hidden size-4.5 shrink-0', 'group-data-[status=pip]/input-status:block')} />
      <PipExitIconPrimitive
        className={cn('hidden size-4.5 shrink-0', 'group-data-[status=exit-pip]/input-status:block')}
      />
      <StatusIndicatorPrimitive.Value />
    </StatusIndicatorPrimitive.Root>
  );
}

function VolumeIndicator() {
  return (
    <VolumeIndicatorPrimitive.Root
      className={cn(
        'pointer-events-none flex items-center gap-2 rounded-none bg-media-background px-2.5 py-1',
        'media-high-contrast:bg-media-background media-high-contrast:outline media-high-contrast:outline-current',
        'forced-colors:bg-[Canvas] forced-colors:text-[CanvasText] forced-colors:outline forced-colors:outline-[CanvasText]',
        'group/volume-status col-start-2 row-start-1 mt-3.5 self-start'
      )}
    >
      <VolumeIndicatorPrimitive.Fill className={'flex items-center rtl:flex-row-reverse gap-2'}>
        <VolumeHighIconPrimitive
          className={cn('hidden size-4.5 shrink-0', 'group-data-[level=high]/volume-status:block')}
        />
        <VolumeLowIconPrimitive
          className={cn('hidden size-4.5 shrink-0', 'group-data-[level=low]/volume-status:block')}
        />
        <VolumeOffIconPrimitive
          className={cn('hidden size-4.5 shrink-0', 'group-data-[level=off]/volume-status:block')}
        />
        <VolumeIndicatorPrimitive.Value className={'tabular-nums'} />
      </VolumeIndicatorPrimitive.Fill>
    </VolumeIndicatorPrimitive.Root>
  );
}
