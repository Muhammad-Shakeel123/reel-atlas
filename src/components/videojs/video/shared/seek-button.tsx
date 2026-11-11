import { SeekButton as SeekButtonPrimitive } from '@videojs/react';
import { SeekIcon as SeekIconPrimitive } from '@videojs/react/icons/scaffold';
import type { ClassValue } from 'cn';

import { cn, resolveClassName } from '@/lib/resolve-class-name';

import { Button } from './button';
import { ButtonTooltip } from './tooltip';

/**
 * Skips playback by a fixed amount. `seconds` has to match the arrow-key hotkey the skin registers, or the engine will
 * not mirror `aria-keyshortcuts` onto the button.
 */
export function SeekButton({
  className,
  iconClassName,
  seconds,
  tooltip = true,
}: {
  className?: ClassValue;
  iconClassName?: ClassValue;
  seconds: number;
  tooltip?: boolean;
}) {
  const backward = seconds < 0;

  return (
    <ButtonTooltip disabled={!tooltip}>
      <SeekButtonPrimitive
        render={<Button />}
        className={(state) => cn(resolveClassName(className, state))}
        seconds={seconds}
      >
        <div className={'relative grid'}>
          <SeekIconPrimitive
            className={cn('col-start-1 row-start-1 size-4.5', backward && 'transform-[scaleX(-1)]', iconClassName)}
          />
          <span
            className={cn(
              'absolute bottom-[calc(var(--media-spacing)*-0.75)] text-[calc(var(--media-spacing)*2.25)] tabular-nums',
              backward ? '-left-px' : '-right-px'
            )}
          >
            {Math.abs(seconds)}
          </span>
        </div>
      </SeekButtonPrimitive>
    </ButtonTooltip>
  );
}
