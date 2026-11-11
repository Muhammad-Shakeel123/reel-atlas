import { ErrorDialog as ErrorDialogPrimitive } from '@videojs/react';

import { cn } from '@/lib/resolve-class-name';

import { Button } from './button';

export function ErrorDialog() {
  return (
    <ErrorDialogPrimitive.Root>
      <ErrorDialogPrimitive.Backdrop
        className={'absolute inset-0 z-40 bg-black not-data-open:hidden data-[scope=document]:fixed'}
      />
      <ErrorDialogPrimitive.Popup
        className={cn(
          'absolute left-1/2 top-1/2 z-50 grid w-[calc(100%-var(--media-spacing)*8)] max-w-80 max-h-[calc(100%-var(--media-spacing)*8)] transform-[translate(-50%,-50%)] gap-3 overflow-auto rounded-none bg-media-popover p-5 text-media-popover-foreground not-data-open:hidden',
          'data-[scope=document]:fixed data-[scope=document]:max-h-[calc(100dvh-var(--media-spacing)*8)]',
          'outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-media-ring',
          'media-high-contrast:border media-high-contrast:border-solid media-high-contrast:border-current forced-colors:border forced-colors:border-solid forced-colors:border-[CanvasText]'
        )}
      >
        <ErrorDialogPrimitive.Title className={'text-[calc(var(--media-spacing)*4.5)] leading-7'} />
        <ErrorDialogPrimitive.Description className={'text-[calc(var(--media-spacing)*3.5)]'}>
          This video could not be played. Check your connection and try again.
        </ErrorDialogPrimitive.Description>
        <ErrorDialogPrimitive.Close
          render={<Button />}
          className={'h-8 w-auto justify-self-end border! border-solid border-current px-3'}
        />
      </ErrorDialogPrimitive.Popup>
    </ErrorDialogPrimitive.Root>
  );
}
