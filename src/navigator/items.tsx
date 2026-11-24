import {ChevronLeftIcon} from '@sanity/icons/ChevronLeft'
import {ChevronRightIcon} from '@sanity/icons/ChevronRight'
import {Box, Button, Flex, Stack, Text} from '@sanity/ui'
import React, {useEffect, useMemo, useState} from 'react'
import {
  SanityDefaultPreview,
  SearchResultItemPreview,
  usePerspective,
  useSchema,
  useTranslation,
  useDocumentPreviewStore,
  type PerspectiveStack,
  type SchemaType,
} from 'sanity'

import {SECTION_ANCHOR_TYPE} from '../anchors'
import {linkPickerLocaleNamespace} from '../i18n'
import {SectionPreview} from '../section-preview'
import {NAVIGATOR_MAX_HEIGHT} from './constants'
import {useNavigation, useOptionProps} from './context'
import {formatResultCount, useDocumentSearch} from './document-search'
import {DefaultIcon} from './icons'
import {
  EmptyFolderState,
  PINNED_FIRST_ROW,
  ResultAnnouncement,
  ScrollableList,
  SkeletonItem,
} from './list'
import type {MenuItem, SearchDocument} from './types'

type FolderRow =
  | {type: 'back'}
  | {type: 'document'; document: SearchDocument}
  | {type: 'empty'}
  | {type: 'skeleton'; index: number}

export function PageMenu({menuItems}: {menuItems: MenuItem[]}) {
  return (
    <Flex gap={1} justify="flex-start" direction="column">
      <ScrollableList
        getKey={(item, index) => item.href || item.label || index}
        items={menuItems}
        maxHeight={NAVIGATOR_MAX_HEIGHT}
        renderItem={(item) => {
          return <MenuItemRow item={item} />
        }}
      />
    </Flex>
  )
}

function Group({item}: {item: MenuItem}) {
  return (
    <Stack>
      <Box paddingX={2} paddingTop={3} paddingBottom={2}>
        <Text size={1} weight="medium">
          {item.label}
        </Text>
      </Box>
      {item.children?.map((child, index) => (
        <MenuItemRow key={child.href || child.label || index} item={child} />
      ))}
    </Stack>
  )
}

function MenuItemRow({item}: {item: MenuItem}) {
  const {pushFolder} = useNavigation()
  const folderOptionProps = useOptionProps(`folder:${item.label}`)

  if (item.type === 'folder') {
    return (
      <Button
        {...folderOptionProps}
        mode="bleed"
        padding={1}
        onClick={() => pushFolder(item)}
        width="fill"
      >
        <Flex style={{width: '100%'}} align="center" justify="space-between" gap={3}>
          <Box flex={1}>
            <SanityDefaultPreview layout="compact" title={item.label} icon={item.icon ?? false} />
          </Box>
          <ChevronRightIcon />
        </Flex>
      </Button>
    )
  }

  if (item.type === 'group') {
    return <Group item={item} />
  }

  return <PageItem item={item} optionKey={`route:${item.href}`} />
}

/**
 * A document folder. Opened from a menu it starts with a Back row; as the picker's root (when
 * `title` is set) it starts with that title instead.
 */
export function Folder({
  item,
  title,
  emptyMessage,
}: {
  item: MenuItem
  title?: string
  /** Shown when the folder has no documents. Defaults to "No results". */
  emptyMessage?: string
}) {
  const {popFolder} = useNavigation()
  const backOptionProps = useOptionProps('back')
  const perspective = usePerspective()
  const documentTypes = useMemo(
    () => (item.documentType ? [item.documentType] : []),
    [item.documentType],
  )
  const {
    hits: items,
    loading,
    loadingMore,
    hasNextPage,
    loadMore,
  } = useDocumentSearch('', documentTypes, {
    debounceMs: 0,
    filter: item.filter,
    filterParams: item.filterParams,
    mode: 'browse',
    sort: item.sort,
    projection: item.projection,
  })

  const rows = useMemo<FolderRow[]>(() => {
    const backRow: FolderRow = {type: 'back'}

    if (loading && items.length === 0) {
      return [
        backRow,
        ...Array.from({length: 10}, (_, index) => ({
          type: 'skeleton' as const,
          index,
        })),
      ]
    }

    if (item.documentType && items.length === 0) {
      return [backRow, {type: 'empty'}]
    }

    return [
      backRow,
      ...items.map((document) => ({
        type: 'document' as const,
        document,
      })),
      ...(loadingMore
        ? Array.from({length: 3}, (_, index) => ({
            type: 'skeleton' as const,
            index: items.length + index,
          }))
        : []),
    ]
  }, [item.documentType, items, loading, loadingMore])
  const {t} = useTranslation(linkPickerLocaleNamespace)
  const resultLabel = formatResultCount(t, items.length, hasNextPage)

  return (
    <Flex gap={1} justify="flex-start" direction="column">
      <ResultAnnouncement>
        {loading ? '' : items.length === 0 ? t('search.no-results') : resultLabel}
      </ResultAnnouncement>
      <ScrollableList
        getKey={(row, index) => {
          if (row.type === 'back') return 'back'
          if (row.type === 'empty') return 'empty'
          if (row.type === 'skeleton') return `skeleton-${row.index}`
          return `${row.document._id || 'document'}-${index}`
        }}
        items={rows}
        maxHeight={NAVIGATOR_MAX_HEIGHT}
        onEndReached={hasNextPage ? loadMore : undefined}
        pinnedIndices={PINNED_FIRST_ROW}
        renderItem={(row) => {
          if (row.type === 'back' && title !== undefined) {
            return (
              <Box paddingX={2} paddingY={3}>
                <Flex align="center" justify="space-between" style={{width: '100%'}}>
                  <Text size={1} weight="medium" textOverflow="ellipsis">
                    {title}
                  </Text>
                  {!loading ? (
                    <Text muted size={1} weight="medium">
                      {resultLabel}
                    </Text>
                  ) : null}
                </Flex>
              </Box>
            )
          }

          if (row.type === 'back') {
            return (
              <Button
                {...backOptionProps}
                mode="bleed"
                paddingX={2}
                paddingY={3}
                width="fill"
                onClick={popFolder}
              >
                <Flex align="center" justify="space-between" style={{width: '100%'}}>
                  <Flex align="center" gap={3}>
                    <ChevronLeftIcon />
                    <Text size={1} weight="medium">
                      {t('folder.back')}
                    </Text>
                  </Flex>
                  {!loading ? (
                    <Text muted size={1} weight="medium">
                      {resultLabel}
                    </Text>
                  ) : null}
                </Flex>
              </Button>
            )
          }

          if (row.type === 'skeleton') {
            return <SkeletonItem />
          }

          if (row.type === 'empty') {
            return <EmptyFolderState message={emptyMessage} />
          }

          return (
            <DocumentItem
              icon={item.icon}
              item={row.document}
              optionKey={`doc:${row.document._id}`}
              perspectiveStack={perspective.perspectiveStack}
            />
          )
        }}
      />
    </Flex>
  )
}

export function PageItem({item, optionKey}: {item: MenuItem; optionKey: string}) {
  const {onSelect} = useNavigation()
  const optionProps = useOptionProps(optionKey)

  return (
    <Button
      {...optionProps}
      onClick={() => {
        onSelect?.({
          label: item.omitLabelOnSelect ? undefined : item.label,
          href: item.href,
        })
      }}
      mode="bleed"
      padding={1}
      width="fill"
    >
      <Box style={{width: '100%'}}>
        <SanityDefaultPreview layout="compact" title={item.label} icon={item.icon ?? false} />
      </Box>
    </Button>
  )
}

/** The document's preview title, used as the link label when it's selected. */
export function usePreviewTitle(
  documentId: string | undefined,
  schemaType: SchemaType | undefined,
  perspectiveStack: PerspectiveStack | undefined,
): string | undefined {
  const documentPreviewStore = useDocumentPreviewStore()
  const [resolved, setResolved] = useState<{id: string; title: string | undefined} | null>(null)

  useEffect(() => {
    if (!documentId || !schemaType) return undefined
    const subscription = documentPreviewStore
      .observeForPreview({_id: documentId, _type: schemaType.name}, schemaType, {
        perspective: perspectiveStack,
      })
      .subscribe(({snapshot}) => {
        const title = snapshot?.title
        setResolved({id: documentId, title: typeof title === 'string' ? title : undefined})
      })
    return () => subscription.unsubscribe()
  }, [documentId, documentPreviewStore, perspectiveStack, schemaType])

  return resolved && resolved.id === documentId ? resolved.title : undefined
}

export function DocumentItem({
  icon,
  item,
  optionKey,
  perspectiveStack,
}: {
  icon?: React.ElementType
  optionKey: string
  item: {
    title?: string
    label?: string
    _type?: string
    _id?: string
    slug?: string
    section?: unknown
    parentType?: string
    sectionsField?: string
  }
  perspectiveStack?: PerspectiveStack
}) {
  const {onSelect} = useNavigation()
  const schema = useSchema()
  const schemaType = item._type ? schema.get(item._type) : undefined
  const fallbackMedia = item._id === 'default' ? DefaultIcon : icon
  const previewTitle = usePreviewTitle(item._id, schemaType, perspectiveStack)
  const optionProps = useOptionProps(optionKey)
  const label = item.label || item.title || previewTitle

  return (
    <Button
      {...optionProps}
      mode={'bleed'}
      width="fill"
      padding={1}
      onClick={() =>
        onSelect?.({
          reference: item._id,
          label,
          _type: item._type,
          _id: item._id,
        })
      }
    >
      {item._type === SECTION_ANCHOR_TYPE ? (
        // Sections show their own section type's icon, not the anchor document's
        <Box style={{width: '100%'}}>
          <SectionPreview
            section={item.section}
            parentType={item.parentType}
            sectionsField={item.sectionsField}
            title={label}
            slug={item.slug}
          />
        </Box>
      ) : schemaType && item._id && item._type ? (
        <SearchResultItemPreview
          documentId={item._id}
          documentType={item._type}
          layout="compact"
          perspective={perspectiveStack}
          schemaType={schemaType}
          showBadge={false}
        />
      ) : (
        <Box style={{width: '100%'}}>
          <SanityDefaultPreview layout="compact" title={label} icon={fallbackMedia ?? false} />
        </Box>
      )}
    </Button>
  )
}
