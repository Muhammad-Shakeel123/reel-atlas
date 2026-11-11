import { StatusAnnouncer as StatusAnnouncerPrimitive } from '@videojs/react';

export function StatusAnnouncer() {
  return (
    <StatusAnnouncerPrimitive className={'absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]'} />
  );
}
