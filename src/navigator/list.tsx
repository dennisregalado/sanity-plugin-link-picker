import {Box, Button, Card, Text} from '@sanity/ui'
import {useVirtualizer} from '@tanstack/react-virtual'
import React, {useEffect, useMemo, useRef} from 'react'
import {SanityDefaultPreview, useTranslation} from 'sanity'

import {linkPickerLocaleNamespace} from '../i18n'
import {NAVIGATOR_MAX_HEIGHT, VIRTUAL_LIST_OVERSCAN, VIRTUAL_ROW_ESTIMATE_SIZE} from './constants'

/** Caps the navigator's height; lists scroll inside it. */
export function NavigatorFrame({children}: {children: React.ReactNode}) {
  return (
    <div
      style={{
        height: 'min-content',
        maxHeight: NAVIGATOR_MAX_HEIGHT,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}

type ScrollableListProps<T> = {
  estimateSize?: (item: T, index: number) => number
  getKey: (item: T, index: number) => string | number
  items: T[]
  maxHeight: number
  onEndReached?: () => void
  overscan?: number
  pinnedIndices?: number[]
  renderItem: (item: T, index: number) => React.ReactNode
}

const estimateRowSize = () => VIRTUAL_ROW_ESTIMATE_SIZE

const NO_PINNED_ROWS: number[] = []

/** The header/back row stays pinned above the scrolling list */
export const PINNED_FIRST_ROW = [0]

export function ScrollableList<T>({
  estimateSize = estimateRowSize,
  getKey,
  items,
  maxHeight,
  onEndReached,
  overscan = VIRTUAL_LIST_OVERSCAN,
  pinnedIndices = NO_PINNED_ROWS,
  renderItem,
}: ScrollableListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const onEndReachedRef = useRef(onEndReached)
  const pinnedSet = useMemo(() => new Set(pinnedIndices), [pinnedIndices])
  const scrollableIndices = useMemo(
    () => items.map((_, index) => index).filter((index) => !pinnedSet.has(index)),
    [items, pinnedSet],
  )

  useEffect(() => {
    onEndReachedRef.current = onEndReached
  }, [onEndReached])

  // TanStack Virtual returns non-memoizable functions by design; React Compiler skips this component
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: scrollableIndices.length,
    estimateSize: (index) => {
      const itemIndex = scrollableIndices[index]
      return estimateSize(items[itemIndex], itemIndex)
    },
    getScrollElement: () => scrollRef.current,
    overscan,
  })

  const virtualRows = virtualizer.getVirtualItems()
  const lastVirtualRow = virtualRows[virtualRows.length - 1]

  useEffect(() => {
    if (!onEndReachedRef.current || !lastVirtualRow) {
      return
    }

    if (lastVirtualRow.index >= scrollableIndices.length - 1 - VIRTUAL_LIST_OVERSCAN) {
      onEndReachedRef.current()
    }
  }, [lastVirtualRow, scrollableIndices.length])

  return (
    <Box
      ref={scrollRef}
      style={{
        maxHeight,
        overflowY: 'auto',
        scrollBehavior: 'smooth',
        width: '100%',
      }}
    >
      {pinnedIndices.map((index) => (
        <Card
          key={getKey(items[index], index)}
          paddingX={1}
          style={{position: 'sticky', top: 0, zIndex: 1}}
        >
          {renderItem(items[index], index)}
        </Card>
      ))}

      {scrollableIndices.length > 0 ? (
        <Box
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualRows.map((virtualRow) => {
            const itemIndex = scrollableIndices[virtualRow.index]
            const isFirst = virtualRow.index === 0
            const isLast = virtualRow.index === scrollableIndices.length - 1

            return (
              <Box
                key={getKey(items[itemIndex], itemIndex)}
                data-index={virtualRow.index}
                paddingBottom={isLast ? 1 : undefined}
                paddingTop={isFirst ? 1 : undefined}
                paddingX={1}
                ref={virtualizer.measureElement}
                style={{
                  left: 0,
                  position: 'absolute',
                  top: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  width: '100%',
                }}
              >
                {renderItem(items[itemIndex], itemIndex)}
              </Box>
            )
          })}
        </Box>
      ) : null}
    </Box>
  )
}

// Standard visually-hidden styles. (@sanity/ui's SrOnly sets aria-hidden, which also hides the
// text from screen readers, so it can't be used for announcements.)
const VISUALLY_HIDDEN: React.CSSProperties = {
  border: 0,
  clipPath: 'inset(50%)',
  height: 1,
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: 1,
}

/** Announces result counts to screen readers; visually hidden. */
export function ResultAnnouncement({children}: {children: React.ReactNode}) {
  return (
    <output aria-live="polite" style={VISUALLY_HIDDEN}>
      {children}
    </output>
  )
}

export function SkeletonItem() {
  return (
    <Button mode="bleed" width="fill" padding={1} disabled>
      <Box style={{width: '100%'}}>
        <SanityDefaultPreview isPlaceholder layout="compact" />
      </Box>
    </Button>
  )
}

export function EmptyFolderState({message}: {message?: string}) {
  const {t} = useTranslation(linkPickerLocaleNamespace)

  if (message) {
    // A sentence, which a compact preview's single-line title would cut off
    return <PickerHint>{message}</PickerHint>
  }

  return (
    <Box padding={1} style={{width: '100%'}}>
      <MutedPreview>{t('search.no-results')}</MutedPreview>
    </Box>
  )
}

/** A one-line muted message laid out like a compact preview, e.g. for a missing document. */
export function MutedPreview({children}: {children: React.ReactNode}) {
  return (
    <SanityDefaultPreview
      icon={false}
      layout="compact"
      title={
        <Text muted size={1}>
          {children}
        </Text>
      }
    />
  )
}

/** A muted, wrapping note in the picker, e.g. what to type when there is nothing to pick. */
export function PickerHint({children}: {children: React.ReactNode}) {
  return (
    <Box paddingX={2} paddingY={3}>
      <Text muted size={1} style={{lineHeight: 1.5}}>
        {children}
      </Text>
    </Box>
  )
}
