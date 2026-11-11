import {
  CastButton as CastButtonPrimitive,
  PiPButton as PiPButtonPrimitive,
  FullscreenButton as FullscreenButtonPrimitive,
} from '@videojs/react';
import {
  CastEnterIcon as CastEnterIconPrimitive,
  CastExitIcon as CastExitIconPrimitive,
  PipEnterIcon as PipEnterIconPrimitive,
  PipExitIcon as PipExitIconPrimitive,
  FullscreenEnterIcon as FullscreenEnterIconPrimitive,
  FullscreenExitIcon as FullscreenExitIconPrimitive,
} from '@videojs/react/icons/scaffold';

import { cn } from '@/lib/resolve-class-name';

import { AirPlayButton } from './airplay-button';
import { Button } from './button';
import { ButtonTooltip } from './tooltip';

function CastButton() {
  return (
    <ButtonTooltip popupClassName={'[--media-tooltip-side-offset:calc(var(--media-spacing)*3)]!'}>
      <CastButtonPrimitive render={<Button />} className={'group/cast'}>
        <CastEnterIconPrimitive
          className={cn('col-start-1 row-start-1 size-4.5', 'group-data-[cast-state=connected]/cast:hidden')}
        />
        <CastExitIconPrimitive
          className={cn('col-start-1 row-start-1 size-4.5', 'hidden group-data-[cast-state=connected]/cast:block')}
        />
      </CastButtonPrimitive>
    </ButtonTooltip>
  );
}

function PiPButton() {
  return (
    <ButtonTooltip popupClassName={'[--media-tooltip-side-offset:calc(var(--media-spacing)*3)]!'}>
      <PiPButtonPrimitive render={<Button />} className={'group/pip'}>
        <PipEnterIconPrimitive className={cn('col-start-1 row-start-1 size-4.5', 'group-data-pip/pip:hidden')} />
        <PipExitIconPrimitive className={cn('col-start-1 row-start-1 size-4.5', 'hidden group-data-pip/pip:block')} />
      </PiPButtonPrimitive>
    </ButtonTooltip>
  );
}

function FullscreenButton() {
  return (
    <ButtonTooltip popupClassName={'[--media-tooltip-side-offset:calc(var(--media-spacing)*3)]!'}>
      <FullscreenButtonPrimitive render={<Button />} className={'group/fullscreen'}>
        <FullscreenEnterIconPrimitive
          className={cn('col-start-1 row-start-1 size-4.5', 'hidden group-not-data-fullscreen/fullscreen:block')}
        />
        <FullscreenExitIconPrimitive
          className={cn('col-start-1 row-start-1 size-4.5', 'hidden group-data-fullscreen/fullscreen:block')}
        />
      </FullscreenButtonPrimitive>
    </ButtonTooltip>
  );
}

export function ScreenControls() {
  return (
    <>
      <AirPlayButton popupClassName={'[--media-tooltip-side-offset:calc(var(--media-spacing)*3)]!'} />
      <CastButton />
      <PiPButton />
      <FullscreenButton />
    </>
  );
}
