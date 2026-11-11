import { MuteButton as MuteButtonPrimitive } from '@videojs/react';
import {
  VolumeOffIcon as VolumeOffIconPrimitive,
  VolumeHighIcon as VolumeHighIconPrimitive,
} from '@videojs/react/icons/scaffold';

import { cn, resolveClassName } from '@/lib/resolve-class-name';

import { Button } from './button';

export function MuteButton({ className, ...props }: MuteButtonPrimitive.Props = {}) {
  return (
    <MuteButtonPrimitive
      render={<Button />}
      className={(state) => cn('group/mute', resolveClassName(className, state))}
      {...props}
    >
      <VolumeOffIconPrimitive
        className={cn('col-start-1 row-start-1 size-4.5', 'hidden group-data-muted/mute:block')}
      />
      <VolumeHighIconPrimitive
        className={cn('col-start-1 row-start-1 size-4.5', 'hidden group-not-data-muted/mute:block')}
      />
    </MuteButtonPrimitive>
  );
}
