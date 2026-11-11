import { audioText, captionsText, qualityText, settingsText, speedText } from '@videojs/core/i18n/text/menu';
import { Text as TextPrimitive } from '@videojs/react';
import { Menu } from '@videojs/react';
import {
  ChevronIcon as ChevronIconPrimitive,
  SwitchesIcon as SwitchesIconPrimitive,
  SpeechIcon as SpeechIconPrimitive,
  SpeedIcon as SpeedIconPrimitive,
  CaptionsOffIcon as CaptionsOffIconPrimitive,
  GearIcon as GearIconPrimitive,
} from '@videojs/react/icons/scaffold';
import { AudioTrackRadioGroup } from '@videojs/react/ui/audio-track-radio-group';
import { CaptionsRadioGroup } from '@videojs/react/ui/captions-radio-group';
import { PlaybackRateRadioGroup } from '@videojs/react/ui/playback-rate-radio-group';
import { QualityRadioGroup } from '@videojs/react/ui/quality-radio-group';

import { cn } from '@/lib/resolve-class-name';

import { Button } from './button';
import { RadioItem } from './menu-item';
import { ButtonTooltip } from './tooltip';

function MenuChevron({ back = false }: { back?: boolean } = {}) {
  return (
    <ChevronIconPrimitive
      className={
        back
          ? 'size-4 shrink-0 transform-[rotate(180deg)] rtl:transform-none opacity-70'
          : 'size-4 shrink-0 opacity-70 rtl:transform-[scaleX(-1)]'
      }
    />
  );
}

function QualityMenu() {
  return (
    <Menu.Root>
      <QualityRadioGroup.Root>
        <Menu.Trigger
          className={cn(
            'flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-none min-h-8 w-full shrink-0 bg-media-background bg-clip-padding px-2 py-0 text-start',
            'data-[availability=unavailable]:hidden data-[availability=unsupported]:hidden focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current',
            'data-highlighted:bg-(--media-button-highlight) media-high-contrast:data-highlighted:highlight-media forced-colors:data-highlighted:highlight-media'
          )}
        >
          <SwitchesIconPrimitive className={'size-4.5 shrink-0 opacity-70'} />
          <TextPrimitive token={qualityText.key}>{qualityText.text}</TextPrimitive>
          <span className={'ms-auto inline-flex min-w-0 items-center gap-1 ps-2 opacity-70'}>
            <QualityRadioGroup.Value className={'max-w-24 truncate'} />
            <MenuChevron />
          </span>
        </Menu.Trigger>
        <Menu.Content
          className={cn(
            'absolute max-h-full overflow-auto overscroll-none outline-hidden',
            '[clip-path:inset(0)]',
            'flex flex-col gap-2! p-2 not-data-submenu:inset-x-0 not-data-submenu:top-0',
            'not-data-submenu:data-child-open:transform-[translateX(-100%)]',
            'not-data-submenu:data-child-open:rtl:transform-[translateX(100%)]',
            'not-data-submenu:data-child-open:[clip-path:inset(0_0_0_100%)] not-data-submenu:data-child-open:rtl:[clip-path:inset(0_100%_0_0)]',
            'data-submenu:inset-x-0 data-submenu:top-0 data-submenu:z-10'
          )}
        >
          <Menu.Item
            className={cn(
              'flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-none min-h-8 w-full shrink-0 bg-media-background bg-clip-padding px-2 py-0 text-start',
              'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current',
              'data-highlighted:bg-(--media-button-highlight) media-high-contrast:data-highlighted:highlight-media forced-colors:data-highlighted:highlight-media'
            )}
          >
            <MenuChevron back />
            <TextPrimitive token={qualityText.key}>{qualityText.text}</TextPrimitive>
          </Menu.Item>
          <Menu.Separator className={'hidden'} />
          <QualityRadioGroup.Options
            className={'flex flex-col gap-2'}
            renderItem={(props, item) => (
              <RadioItem {...props}>
                <span>
                  <span>{item.label}</span>
                  {item.tier ? (
                    <sup className={'ps-0.5 pt-px text-media-sm leading-none opacity-70'}>{item.tier}</sup>
                  ) : null}
                </span>
                {item.badge ? (
                  <span className={'rounded-none bg-media-muted px-1.5 text-media-sm'}>{item.badge}</span>
                ) : null}
              </RadioItem>
            )}
          ></QualityRadioGroup.Options>
        </Menu.Content>
      </QualityRadioGroup.Root>
    </Menu.Root>
  );
}

function AudioTrackMenu() {
  return (
    <Menu.Root>
      <AudioTrackRadioGroup.Root>
        <Menu.Trigger
          className={cn(
            'flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-none min-h-8 w-full shrink-0 bg-media-background bg-clip-padding px-2 py-0 text-start',
            'data-[availability=unavailable]:hidden data-[availability=unsupported]:hidden focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current',
            'data-highlighted:bg-(--media-button-highlight) media-high-contrast:data-highlighted:highlight-media forced-colors:data-highlighted:highlight-media'
          )}
        >
          <SpeechIconPrimitive className={'size-4.5 shrink-0 opacity-70'} />
          <TextPrimitive token={audioText.key}>{audioText.text}</TextPrimitive>
          <span className={'ms-auto inline-flex min-w-0 items-center gap-1 ps-2 opacity-70'}>
            <AudioTrackRadioGroup.Value className={'max-w-24 truncate'} />
            <MenuChevron />
          </span>
        </Menu.Trigger>
        <Menu.Content
          className={cn(
            'absolute max-h-full overflow-auto overscroll-none outline-hidden',
            '[clip-path:inset(0)]',
            'flex flex-col gap-2! p-2 not-data-submenu:inset-x-0 not-data-submenu:top-0',
            'not-data-submenu:data-child-open:transform-[translateX(-100%)]',
            'not-data-submenu:data-child-open:rtl:transform-[translateX(100%)]',
            'not-data-submenu:data-child-open:[clip-path:inset(0_0_0_100%)] not-data-submenu:data-child-open:rtl:[clip-path:inset(0_100%_0_0)]',
            'data-submenu:inset-x-0 data-submenu:top-0 data-submenu:z-10'
          )}
        >
          <Menu.Item
            className={cn(
              'flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-none min-h-8 w-full shrink-0 bg-media-background bg-clip-padding px-2 py-0 text-start',
              'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current',
              'data-highlighted:bg-(--media-button-highlight) media-high-contrast:data-highlighted:highlight-media forced-colors:data-highlighted:highlight-media'
            )}
          >
            <MenuChevron back />
            <TextPrimitive token={audioText.key}>{audioText.text}</TextPrimitive>
          </Menu.Item>
          <Menu.Separator className={'hidden'} />
          <AudioTrackRadioGroup.Options
            className={'flex flex-col gap-2'}
            renderItem={(props, item) => (
              <RadioItem {...props}>
                <span>{item.label}</span>
              </RadioItem>
            )}
          ></AudioTrackRadioGroup.Options>
        </Menu.Content>
      </AudioTrackRadioGroup.Root>
    </Menu.Root>
  );
}

function PlaybackRateMenu() {
  return (
    <Menu.Root>
      <PlaybackRateRadioGroup.Root>
        <Menu.Trigger
          className={cn(
            'flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-none min-h-8 w-full shrink-0 bg-media-background bg-clip-padding px-2 py-0 text-start',
            'data-[availability=unavailable]:hidden data-[availability=unsupported]:hidden focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current',
            'data-highlighted:bg-(--media-button-highlight) media-high-contrast:data-highlighted:highlight-media forced-colors:data-highlighted:highlight-media'
          )}
        >
          <SpeedIconPrimitive className={'size-4.5 shrink-0 opacity-70'} />
          <TextPrimitive token={speedText.key}>{speedText.text}</TextPrimitive>
          <span className={'ms-auto inline-flex min-w-0 items-center gap-1 ps-2 opacity-70'}>
            <PlaybackRateRadioGroup.Value className={'max-w-24 truncate'} />
            <MenuChevron />
          </span>
        </Menu.Trigger>
        <Menu.Content
          className={cn(
            'absolute max-h-full overflow-auto overscroll-none outline-hidden',
            '[clip-path:inset(0)]',
            'flex flex-col gap-2! p-2 not-data-submenu:inset-x-0 not-data-submenu:top-0',
            'not-data-submenu:data-child-open:transform-[translateX(-100%)]',
            'not-data-submenu:data-child-open:rtl:transform-[translateX(100%)]',
            'not-data-submenu:data-child-open:[clip-path:inset(0_0_0_100%)] not-data-submenu:data-child-open:rtl:[clip-path:inset(0_100%_0_0)]',
            'data-submenu:inset-x-0 data-submenu:top-0 data-submenu:z-10'
          )}
        >
          <Menu.Item
            className={cn(
              'flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-none min-h-8 w-full shrink-0 bg-media-background bg-clip-padding px-2 py-0 text-start',
              'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current',
              'data-highlighted:bg-(--media-button-highlight) media-high-contrast:data-highlighted:highlight-media forced-colors:data-highlighted:highlight-media'
            )}
          >
            <MenuChevron back />
            <TextPrimitive token={speedText.key}>{speedText.text}</TextPrimitive>
          </Menu.Item>
          <Menu.Separator className={'hidden'} />
          <PlaybackRateRadioGroup.Options
            className={'flex flex-col gap-2'}
            renderItem={(props, item) => (
              <RadioItem {...props}>
                <span>{item.label}</span>
              </RadioItem>
            )}
          ></PlaybackRateRadioGroup.Options>
        </Menu.Content>
      </PlaybackRateRadioGroup.Root>
    </Menu.Root>
  );
}

function CaptionsMenu() {
  return (
    <Menu.Root>
      <CaptionsRadioGroup.Root>
        <Menu.Trigger
          className={cn(
            'flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-none min-h-8 w-full shrink-0 bg-media-background bg-clip-padding px-2 py-0 text-start',
            'data-[availability=unavailable]:hidden data-[availability=unsupported]:hidden focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current',
            'data-highlighted:bg-(--media-button-highlight) media-high-contrast:data-highlighted:highlight-media forced-colors:data-highlighted:highlight-media'
          )}
        >
          <CaptionsOffIconPrimitive className={'size-4.5 shrink-0 opacity-70'} />
          <TextPrimitive token={captionsText.key}>{captionsText.text}</TextPrimitive>
          <span className={'ms-auto inline-flex min-w-0 items-center gap-1 ps-2 opacity-70'}>
            <CaptionsRadioGroup.Value className={'max-w-24 truncate'} />
            <MenuChevron />
          </span>
        </Menu.Trigger>
        <Menu.Content
          className={cn(
            'absolute max-h-full overflow-auto overscroll-none outline-hidden',
            '[clip-path:inset(0)]',
            'flex flex-col gap-2! p-2 not-data-submenu:inset-x-0 not-data-submenu:top-0',
            'not-data-submenu:data-child-open:transform-[translateX(-100%)]',
            'not-data-submenu:data-child-open:rtl:transform-[translateX(100%)]',
            'not-data-submenu:data-child-open:[clip-path:inset(0_0_0_100%)] not-data-submenu:data-child-open:rtl:[clip-path:inset(0_100%_0_0)]',
            'data-submenu:inset-x-0 data-submenu:top-0 data-submenu:z-10'
          )}
        >
          <Menu.Item
            className={cn(
              'flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-none min-h-8 w-full shrink-0 bg-media-background bg-clip-padding px-2 py-0 text-start',
              'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current',
              'data-highlighted:bg-(--media-button-highlight) media-high-contrast:data-highlighted:highlight-media forced-colors:data-highlighted:highlight-media'
            )}
          >
            <MenuChevron back />
            <TextPrimitive token={captionsText.key}>{captionsText.text}</TextPrimitive>
          </Menu.Item>
          <Menu.Separator className={'hidden'} />
          <CaptionsRadioGroup.Options
            className={'flex flex-col gap-2'}
            renderItem={(props, item) => (
              <RadioItem {...props}>
                <span>{item.label}</span>
              </RadioItem>
            )}
          ></CaptionsRadioGroup.Options>
        </Menu.Content>
      </CaptionsRadioGroup.Root>
    </Menu.Root>
  );
}

export function SettingsMenu() {
  return (
    <Menu.Root side="top" align="center">
      <ButtonTooltip label={<TextPrimitive token={settingsText.key}>{settingsText.text}</TextPrimitive>}>
        <Menu.Trigger render={<Button />}>
          <GearIconPrimitive className={'col-start-1 row-start-1 size-4.5'} />
          <TextPrimitive className={'sr-only'} token={settingsText.key}>
            {settingsText.text}
          </TextPrimitive>
        </Menu.Trigger>
      </ButtonTooltip>
      <Menu.Popup
        keepMounted
        className={cn(
          'm-0 overflow-visible border-0 text-inherit',
          'media-transitioning:opacity-0 media-transitioning:blur-media-hidden-popup media-transitioning:scale-media-hidden-popup',
          'data-starting-style:transform-[translate(var(--media-popup-translate-x-distance,0),var(--media-popup-translate-y-distance,0))]',
          'data-ending-style:transform-none',
          'data-[side=top]:origin-bottom data-[side=bottom]:origin-top data-[side=left]:origin-right data-[side=right]:origin-left',
          'data-[side=top]:[--media-popup-translate-y-distance:var(--media-popup-translate-distance)]',
          'data-[side=bottom]:[--media-popup-translate-y-distance:calc(var(--media-popup-translate-distance)*-1)]',
          'data-[side=left]:[--media-popup-translate-x-distance:var(--media-popup-translate-distance)]',
          'data-[side=right]:[--media-popup-translate-x-distance:calc(var(--media-popup-translate-distance)*-1)]',
          'before:pointer-events-auto before:absolute',
          'data-[side=top]:before:inset-x-0 data-[side=top]:before:top-full',
          'data-[side=bottom]:before:inset-x-0 data-[side=bottom]:before:bottom-full',
          'data-[side=left]:before:inset-y-0 data-[side=left]:before:left-full',
          'data-[side=right]:before:inset-y-0 data-[side=right]:before:right-full',
          'data-[side=top]:before:h-(--media-popup-side-offset) data-[side=bottom]:before:h-(--media-popup-side-offset)',
          'data-[side=left]:before:w-(--media-popup-side-offset) data-[side=right]:before:w-(--media-popup-side-offset)',
          'z-20 m-0 min-w-44 max-w-(--media-menu-available-width) overflow-hidden! rounded-none bg-media-popover p-0 text-media-popover-foreground',
          'shadow-none [--media-popup-side-offset:var(--media-popover-side-offset)] [--media-popover-side-offset:calc(var(--media-spacing)*9)]',
          'max-h-[min(var(--media-menu-available-height,--spacing(56)),--spacing(56))] overscroll-none',
          'h-(--media-menu-height) w-(--media-menu-width)',
          'media-high-contrast:outline forced-colors:outline'
        )}
      >
        <Menu.Content
          className={cn(
            'absolute max-h-full overflow-auto overscroll-none outline-hidden',
            '[clip-path:inset(0)]',
            'flex flex-col gap-2! p-2 not-data-submenu:inset-x-0 not-data-submenu:top-0',
            'not-data-submenu:data-child-open:transform-[translateX(-100%)]',
            'not-data-submenu:data-child-open:rtl:transform-[translateX(100%)]',
            'not-data-submenu:data-child-open:[clip-path:inset(0_0_0_100%)] not-data-submenu:data-child-open:rtl:[clip-path:inset(0_100%_0_0)]',
            'data-submenu:inset-x-0 data-submenu:top-0 data-submenu:z-10'
          )}
        >
          <QualityMenu />
          <AudioTrackMenu />
          <PlaybackRateMenu />
          <CaptionsMenu />
        </Menu.Content>
      </Menu.Popup>
    </Menu.Root>
  );
}
