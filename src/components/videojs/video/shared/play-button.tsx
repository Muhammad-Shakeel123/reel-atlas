import { PlayButton as PlayButtonPrimitive } from '@videojs/react';
import {
  RestartIcon as RestartIconPrimitive,
  PlayIcon as PlayIconPrimitive,
  PauseIcon as PauseIconPrimitive,
} from '@videojs/react/icons/scaffold';
import type { ClassValue } from 'cn';

import { cn, resolveClassName } from '@/lib/resolve-class-name';

import { Button } from './button';
import { ButtonTooltip } from './tooltip';
import { BufferingIndicator } from './video-feedback';

export function PlayButton({
  className,
  iconClassName,
  tooltip = true,
  ...props
}: PlayButtonPrimitive.Props & { iconClassName?: ClassValue; tooltip?: boolean } = {}) {
  return (
    <ButtonTooltip disabled={!tooltip}>
      <PlayButtonPrimitive
        render={<Button />}
        className={(state) => cn('group/play', resolveClassName(className, state))}
        {...props}
      >
        <RestartIconPrimitive
          className={cn('col-start-1 row-start-1 hidden size-4.5', 'group-data-ended/play:block', iconClassName)}
        />
        <PlayIconPrimitive
          className={cn(
            'col-start-1 row-start-1 hidden size-4.5',
            'group-not-data-ended/play:group-data-paused/play:block',
            'group-not-data-ended/play:group-not-data-started/play:block',
            iconClassName
          )}
        />
        <PauseIconPrimitive
          className={cn(
            'col-start-1 row-start-1 hidden size-4.5',
            'group-data-started/play:group-not-data-paused/play:group-not-data-ended/play:block',
            iconClassName
          )}
        />
      </PlayButtonPrimitive>
    </ButtonTooltip>
  );
}

export function AudioPlayButton() {
  return (
    <div className={'relative inline-flex'}>
      <PlayButton />
      <BufferingIndicator className={'z-20 bg-media-background'} />
    </div>
  );
}
