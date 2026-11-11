import { Menu as MenuPrimitive } from '@videojs/react';
import { CheckIcon as CheckIconPrimitive } from '@videojs/react/icons/scaffold';

import { cn } from '@/lib/resolve-class-name';

export function RadioItem({ children, ...props }: MenuPrimitive.RadioItemProps) {
  return (
    <MenuPrimitive.RadioItem
      className={cn(
        'group/menu-radio flex cursor-pointer items-center justify-between gap-3 rounded-none min-h-8 w-full shrink-0 bg-media-background bg-clip-padding px-2 py-0',
        'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current',
        'data-highlighted:bg-(--media-button-highlight) media-high-contrast:data-highlighted:highlight-media forced-colors:data-highlighted:highlight-media',
        'data-custom:italic'
      )}
      {...props}
    >
      {children}
      <MenuPrimitive.ItemIndicator
        forceMount
        className={'ms-auto -me-1 shrink-0 opacity-0 group-aria-checked/menu-radio:opacity-100'}
      >
        <CheckIconPrimitive className={'size-4.5 shrink-0 opacity-70'} />
      </MenuPrimitive.ItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}
