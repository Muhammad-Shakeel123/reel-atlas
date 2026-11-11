import { badgeText } from '@videojs/core/i18n/text/live';
import { Text as TextPrimitive } from '@videojs/react';
import { LiveButton as LiveButtonPrimitive } from '@videojs/react';

import { cn } from '@/lib/resolve-class-name';

import { Button } from './button';

export function LiveButton() {
  return (
    <LiveButtonPrimitive
      render={<Button />}
      className={'group/live grid-flow-col w-auto! items-center gap-1.5 px-2.5! text-media-sm'}
    >
      <div
        aria-hidden="true"
        className={cn(
          'inline-block size-2 shrink-0 rounded-none bg-current opacity-40',
          'group-data-live-edge/live:bg-[#f43f5e] group-data-live-edge/live:opacity-100'
        )}
      />
      <TextPrimitive token={badgeText.key}>{badgeText.text}</TextPrimitive>
    </LiveButtonPrimitive>
  );
}
