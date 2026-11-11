import { Poster as PosterPrimitive } from '@videojs/react';
import { BufferingIndicator as BufferingIndicatorPrimitive, Controls } from '@videojs/react';
import { SpinnerIcon as SpinnerIconPrimitive } from '@videojs/react/icons/scaffold';
import type { ClassValue } from 'cn';

import { cn, resolveClassName } from '@/lib/resolve-class-name';

export function Poster({ renderImage }: { renderImage?: PosterPrimitive.ImageProps['render'] } = {}) {
  return (
    <PosterPrimitive.Root className={'absolute inset-0 size-full not-data-visible:hidden'}>
      <PosterPrimitive.Image render={renderImage} className={'size-full object-media'} />
    </PosterPrimitive.Root>
  );
}

export function BufferingIndicator({ className }: { className?: ClassValue } = {}) {
  return (
    <BufferingIndicatorPrimitive
      className={(state) =>
        cn(
          'pointer-events-none absolute inset-0 grid place-items-center not-data-visible:hidden not-data-visible:[--media-spinner-animation:none] motion-reduce:[--media-spinner-animation:none]',
          resolveClassName(className, state)
        )
      }
    >
      <SpinnerIconPrimitive className={'size-7'} />
    </BufferingIndicatorPrimitive>
  );
}

export function VideoBufferingIndicator() {
  return (
    <Controls.Group className={'group/buffering-controls contents'}>
      <BufferingIndicator
        className={'z-40 group-not-data-visible/buffering-controls:bg-[rgba(0,0,0,0.4)] forced-colors:bg-transparent!'}
      />
    </Controls.Group>
  );
}
