import { AirPlayButton as AirPlayButtonPrimitive } from '@videojs/react';
import {
  AirPlayEnterIcon as AirPlayEnterIconPrimitive,
  AirPlayExitIcon as AirPlayExitIconPrimitive,
} from '@videojs/react/icons/scaffold';
import type { ClassValue } from 'cn';

import { cn } from '@/lib/resolve-class-name';

import { Button } from './button';
import { ButtonTooltip } from './tooltip';

export function AirPlayButton({ popupClassName }: { popupClassName?: ClassValue } = {}) {
  return (
    <ButtonTooltip popupClassName={popupClassName}>
      <AirPlayButtonPrimitive render={<Button />} className={'group/airplay'}>
        <AirPlayEnterIconPrimitive
          className={cn('col-start-1 row-start-1 size-4.5', 'group-data-[airplay-state=connected]/airplay:hidden')}
        />
        <AirPlayExitIconPrimitive
          className={cn(
            'col-start-1 row-start-1 size-4.5',
            'hidden group-data-[airplay-state=connected]/airplay:block'
          )}
        />
      </AirPlayButtonPrimitive>
    </ButtonTooltip>
  );
}
