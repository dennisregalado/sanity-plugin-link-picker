import {Box, Flex, Text} from '@sanity/ui'
import {useMemo} from 'react'
import {usePerspective, useTranslation, type PerspectiveStack, type QueryParams} from 'sanity'

import {normalizeLinkHref} from '../href'
import {linkPickerLocaleNamespace} from '../i18n'
import {type StaticLinkRoute} from '../routes'
import {NAVIGATOR_MAX_HEIGHT} from './constants'
import {formatResultCount, useDocumentSearch} from './document-search'
import {DefaultIcon, getSystemLinkIcon, normalizeLinkIcon} from './icons'
import {DocumentItem, PageItem} from './items'
import {
  EmptyFolderState,
  PINNED_FIRST_ROW,
  ResultAnnouncement,
  ScrollableList,
  SkeletonItem,
} from './list'
import type {SearchResultItem} from './types'

type SearchRow =
  | {type: 'header'; label: string}
  | {type: 'result'; item: SearchResultItem}
  | {type: 'empty'}
  | {type: 'skeleton'; index: number}

function getTypedLinkResult(query: string): SearchResultItem | null {
  const href = normalizeLinkHref(query)

  if (!href || href === query) {
    return null
  }

  return {
    type: 'link',
    href,
    icon: getSystemLinkIcon(href),
    label: href,
    title: href,
  }
}

export function SearchResults({
  documentTypes,
  query,
  staticRoutes,
  getTypedResult = getTypedLinkResult,
  filter,
  filterParams,
  projection,
}: {
  documentTypes: string[]
  query: string
  staticRoutes: StaticLinkRoute[]
  /** The option for using the typed text as-is, shown first. Defaults to a normalized link. */
  getTypedResult?: (query: string) => SearchResultItem | null
  /** Extra GROQ filter for the document results */
  filter?: string
  filterParams?: QueryParams
  /** Fields fetched per document result */
  projection?: string
}) {
  const perspective = usePerspective()
  const typedLinkResult = useMemo(() => getTypedResult(query), [getTypedResult, query])
  const staticResults = useMemo(
    () =>
      staticRoutes
        .filter((route) =>
          `${route.title} ${route.path}`.toLowerCase().includes(query.toLowerCase()),
        )
        .map<SearchResultItem>((route) => ({
          type: 'route',
          href: route.path,
          icon: normalizeLinkIcon(route.icon),
          label: route.title,
          title: route.title,
        })),
    [query, staticRoutes],
  )
  const {
    hits: documentResults,
    loading,
    loadingMore,
    hasNextPage,
    loadMore,
  } = useDocumentSearch(query, documentTypes, {filter, filterParams, projection})
  const results = useMemo(
    () => [
      ...(typedLinkResult ? [typedLinkResult] : []),
      ...staticResults,
      ...documentResults.map<SearchResultItem>((document) => ({
        type: 'document',
        document,
      })),
    ],
    [documentResults, staticResults, typedLinkResult],
  )
  const {t} = useTranslation(linkPickerLocaleNamespace)
  const resultLabel = loading
    ? t('search.searching')
    : formatResultCount(t, results.length, hasNextPage)
  const rows = useMemo<SearchRow[]>(() => {
    const headerRow: SearchRow = {
      type: 'header',
      label: resultLabel,
    }

    if (loading && results.length === 0) {
      return [
        headerRow,
        ...Array.from({length: 10}, (_, index) => ({
          type: 'skeleton' as const,
          index,
        })),
      ]
    }

    if (results.length === 0) {
      return [headerRow, {type: 'empty'}]
    }

    return [
      headerRow,
      ...results.map((item) => ({type: 'result' as const, item})),
      ...(loadingMore
        ? Array.from({length: 3}, (_, index) => ({
            type: 'skeleton' as const,
            index: results.length + index,
          }))
        : []),
    ]
  }, [loading, loadingMore, resultLabel, results])

  return (
    <Flex gap={1} justify="flex-start" direction="column">
      <ResultAnnouncement>
        {loading ? '' : results.length === 0 ? t('search.no-results') : resultLabel}
      </ResultAnnouncement>
      <ScrollableList
        getKey={(row, index) => {
          if (row.type === 'header') return 'header'
          if (row.type === 'empty') return 'empty'
          if (row.type === 'skeleton') return `skeleton-${row.index}`
          return row.item.type === 'document' ? row.item.document._id : row.item.href || index
        }}
        items={rows}
        maxHeight={NAVIGATOR_MAX_HEIGHT}
        onEndReached={hasNextPage ? loadMore : undefined}
        pinnedIndices={PINNED_FIRST_ROW}
        renderItem={(row) => {
          if (row.type === 'header') {
            return (
              <Box paddingX={2} paddingY={3}>
                <Flex align="center" justify="space-between" style={{width: '100%'}}>
                  <Text size={1} weight="medium">
                    {row.label}
                  </Text>
                </Flex>
              </Box>
            )
          }

          if (row.type === 'skeleton') {
            return <SkeletonItem />
          }

          if (row.type === 'empty') {
            return <EmptyFolderState />
          }

          return <SearchResult item={row.item} perspectiveStack={perspective.perspectiveStack} />
        }}
      />
    </Flex>
  )
}

function SearchResult({
  item,
  perspectiveStack,
}: {
  item: SearchResultItem
  perspectiveStack?: PerspectiveStack
}) {
  if (item.type === 'document') {
    return (
      <DocumentItem
        icon={DefaultIcon}
        item={item.document}
        optionKey={`doc:${item.document._id}`}
        perspectiveStack={perspectiveStack}
      />
    )
  }

  return (
    <PageItem
      optionKey={`${item.type}:${item.href}`}
      item={{
        href: item.href,
        icon: item.icon,
        label: item.label || item.title,
        omitLabelOnSelect: item.type === 'link',
        type: 'page',
      }}
    />
  )
}
