import { Title as TitlePrimitive } from '@videojs/react';

import { cn } from '@/lib/resolve-class-name';

export function Title() {
  return (
    <TitlePrimitive
      className={cn(
        'pointer-events-none min-w-0 px-2 flex-1 truncate text-[calc(var(--media-spacing)*4)] text-media-foreground bg-media-background',
        'media-high-contrast:bg-media-background forced-colors:bg-transparent! forced-colors:text-[CanvasText] forced-colors:z-40',
        'not-data-visible:opacity-0'
      )}
    />
  );
}
