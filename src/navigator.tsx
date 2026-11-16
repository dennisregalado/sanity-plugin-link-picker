/**
 * Shopify-style link picker for Sanity fields.
 *
 * Groups render section labels, routes select URL values immediately, and
 * document folders drill into Sanity query results to select references.
 */

import {ChevronLeftIcon} from '@sanity/icons/ChevronLeft'
import {ChevronRightIcon} from '@sanity/icons/ChevronRight'
import {Box, Button, Flex, Stack, Text} from '@sanity/ui'
import {useVirtualizer} from '@tanstack/react-virtual'
import {AtSignIcon, GlobeIcon, LinkIcon, PhoneIcon, type LucideIcon} from 'lucide-react'
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  createContext,
  useContext,
} from 'react'
import {
  SanityDefaultPreview,
  SearchResultItemPreview,
  createSearch,
  getSearchableTypes,
  removeDupes,
  useClient,
  usePerspective,
  useSchema,
  useSearchMaxFieldDepth,
  useValuePreview,
  useWorkspace,
  DEFAULT_STUDIO_CLIENT_OPTIONS,
  type QueryParams,
  type SchemaType,
} from 'sanity'

import {getSystemLinkType, normalizeLinkHref, type SystemLinkType} from './href'
import {
  applyReferenceTypes,
  getFlattenedLinkRoutes,
  getReferenceTypesFromRoutes,
  type LinkIconInput,
  type LinkRouteDefinition,
  type StaticLinkRoute,
} from './routes'

const DefaultIcon = () => <Text>✨</Text>

const NAVIGATOR_MAX_HEIGHT = 390

const ICON_SIZE = 16

const VIRTUAL_LIST_OVERSCAN = 5

const VIRTUAL_ROW_ESTIMATE_SIZE = 52

const SEARCH_PAGE_SIZE = 25

const SEARCH_DEBOUNCE_MS = 300

const STICKY_ROW_BACKGROUND = 'var(--card-bg-color, var(--card-backdrop-color, canvas))'

type LinkIcon = () => React.ReactNode

const defaultLinkTypeIcons: Record<SystemLinkType, LucideIcon> = {
  internal: LinkIcon,
  external: GlobeIcon,
  email: AtSignIcon,
  phone: PhoneIcon,
}

type FolderRow =
  | {type: 'back'}
  | {type: 'document'; document: SearchDocument}
  | {type: 'empty'}
  | {type: 'skeleton'; index: number}

type SearchRow =
  | {type: 'header'; label: string}
  | {type: 'result'; item: SearchResultItem}
  | {type: 'empty'}
  | {type: 'skeleton'; index: number}

type SearchResultItem =
  | {
      type: 'document'
      document: SearchDocument
    }
  | {
      type: 'link' | 'route'
      label?: string
      title?: string
      href: string
      icon?: () => React.ReactNode
    }

type SearchDocument = {
  _id: string
  _type: string
  _originalId?: string
  label?: string
  title?: string
}

type NavigatorProps = {
  onSelect?: (item: {
    label?: string
    href?: string
    reference?: string
    _type?: string
    _id?: string
  }) => void
  onClose?: () => void
  routes?: LinkRouteDefinition[]
  referenceTypes?: string[]
  searchQuery?: string
}

type MenuItem = {
  label?: string // Display name in UI
  href?: string // Navigation URL for 'page' type items
  type?: string // 'page' | 'folder' | 'group'
  icon?: () => React.ReactNode // Icon component (emoji-based)
  children?: MenuItem[] // Nested items for 'group' type
  omitLabelOnSelect?: boolean
  documentType?: string
  filter?: string
  filterParams?: QueryParams
}

function NormalizedLinkIcon({
  children,
  shift = false,
}: {
  children: React.ReactNode
  shift?: boolean
}) {
  return (
    <span
      style={{
        alignItems: 'center',
        display: 'inline-flex',
        height: 20,
        justifyContent: 'center',
        lineHeight: 0,
        transform: shift ? 'translate(-3px, -1px)' : undefined,
        verticalAlign: 'middle',
        width: 20,
      }}
    >
      <span
        style={{
          alignItems: 'center',
          display: 'inline-flex',
          fontSize: 16,
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        {children}
      </span>
    </span>
  )
}

export function normalizeLinkIcon(
  icon: LinkIconInput | undefined,
  options?: {shift?: boolean},
): LinkIcon | undefined {
  if (!icon) {
    return undefined
  }

  if (typeof icon === 'function' || isReactComponentObject(icon)) {
    return () => (
      <NormalizedLinkIcon shift={options?.shift}>
        {React.createElement(icon as React.ElementType)}
      </NormalizedLinkIcon>
    )
  }

  return () => (
    <NormalizedLinkIcon shift={options?.shift}>
      {typeof icon === 'string' ? <Text>{icon}</Text> : (icon as React.ReactNode)}
    </NormalizedLinkIcon>
  )
}

function isReactComponentObject(icon: unknown): icon is React.ElementType {
  return Boolean(
    icon && typeof icon === 'object' && '$$typeof' in icon && !React.isValidElement(icon),
  )
}

export function getSystemLinkIcon(href: string, options?: {shift?: boolean}): LinkIcon {
  const Icon = defaultLinkTypeIcons[getSystemLinkType(href)]

  return () => (
    <NormalizedLinkIcon shift={options?.shift}>
      <Icon size={ICON_SIZE} />
    </NormalizedLinkIcon>
  )
}

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

function normalizeRoutes(routes: LinkRouteDefinition[]): MenuItem[] {
  return routes.map((route) => {
    switch (route.type) {
      case 'route':
        return {
          label: route.title,
          href: route.path,
          type: 'page',
          icon: normalizeLinkIcon(route.icon),
        }
      case 'group':
        return {
          label: route.title,
          type: 'group',
          icon: normalizeLinkIcon(route.icon),
          children: normalizeRoutes(route.routes),
        }
      case 'documents':
        return {
          label: route.title,
          type: 'folder',
          icon: normalizeLinkIcon(route.icon),
          documentType: route.documentType,
          filter: route.filter,
          filterParams: route.filterParams,
        }
      default:
        throw new Error(`Unsupported link route: ${JSON.stringify(route)}`)
    }
  })
}

/**
 * NAVIGATION CONTEXT SYSTEM
 * =========================
 *
 * Manages the hierarchical navigation state using React Context.
 * Maintains a stack of folders to enable breadcrumb-style navigation.
 *
 * Navigation Flow:
 * - Root: navigationStack is empty, shows main menu
 * - Folder: pushFolder() adds to stack, shows folder contents
 * - Back: popFolder() removes last item, goes up one level
 */
type NavigationContextType = {
  navigationStack: MenuItem[] // Array of navigation history
  pushFolder: (folder: MenuItem) => void // Navigate into a folder
  popFolder: () => void // Go back one level
  onSelect?: (item: {
    label?: string
    href?: string
    reference?: string
    _type?: string
    _id?: string
  }) => void
  onClose?: () => void
}

const NavigationContext = createContext<NavigationContextType | null>(null)

function useNavigation() {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider')
  }
  return context
}

function NavigationProvider({
  children,
  onClose,
  onSelect,
}: {
  children: React.ReactNode
  onClose?: () => void
  onSelect?: (item: {
    label?: string
    href?: string
    reference?: string
    _type?: string
    _id?: string
  }) => void
}) {
  const [navigationStack, setNavigationStack] = useState<MenuItem[]>([])

  const pushFolder = (folder: MenuItem) => {
    setNavigationStack((prev) => [...prev, folder])
  }

  const popFolder = () => {
    setNavigationStack((prev) => prev.slice(0, -1))
  }

  return (
    <NavigationContext.Provider value={{navigationStack, pushFolder, popFolder, onSelect, onClose}}>
      {children}
    </NavigationContext.Provider>
  )
}

export function VisualEditorNavigator({
  onClose,
  onSelect,
  routes,
  referenceTypes,
  searchQuery,
}: NavigatorProps) {
  const filteredRoutes = useMemo(
    () => applyReferenceTypes(routes || [], referenceTypes),
    [routes, referenceTypes],
  )
  const menuItems = useMemo(() => normalizeRoutes(filteredRoutes), [filteredRoutes])
  const documentTypes = useMemo(() => getReferenceTypesFromRoutes(filteredRoutes), [filteredRoutes])
  const staticRoutes = useMemo(() => getFlattenedLinkRoutes(filteredRoutes), [filteredRoutes])

  return (
    <NavigationProvider onClose={onClose} onSelect={onSelect}>
      <NavigatorContent
        documentTypes={documentTypes}
        menuItems={menuItems}
        searchQuery={searchQuery}
        staticRoutes={staticRoutes}
      />
    </NavigationProvider>
  )
}

function NavigatorContent({
  documentTypes,
  menuItems: propMenuItems,
  searchQuery,
  staticRoutes,
}: {
  documentTypes: string[]
  menuItems: MenuItem[]
  searchQuery?: string
  staticRoutes: StaticLinkRoute[]
}) {
  const {navigationStack} = useNavigation()
  const currentFolder = navigationStack[navigationStack.length - 1]
  const trimmedSearchQuery = searchQuery?.trim() || ''

  return (
    <div
      style={{
        height: 'min-content',
        maxHeight: NAVIGATOR_MAX_HEIGHT,
        overflow: 'hidden',
      }}
    >
      {trimmedSearchQuery ? (
        <SearchResults
          documentTypes={documentTypes}
          query={trimmedSearchQuery}
          staticRoutes={staticRoutes}
        />
      ) : currentFolder ? (
        <Folder item={currentFolder} />
      ) : (
        <PageMenu menuItems={propMenuItems} />
      )}
    </div>
  )
}

type DocumentSearchOptions = {
  debounceMs?: number
  filter?: string
  filterParams?: QueryParams
  /** Empty query + skip scoring = Studio document-list browse mode */
  mode?: 'search' | 'browse'
}

function useDocumentSearch(
  query: string,
  documentTypes: string[],
  options: DocumentSearchOptions = {},
) {
  const {debounceMs = SEARCH_DEBOUNCE_MS, filter, filterParams, mode = 'search'} = options
  const allowEmptyQuery = mode === 'browse'
  const client = useClient(DEFAULT_STUDIO_CLIENT_OPTIONS)
  const schema = useSchema()
  const maxFieldDepth = useSearchMaxFieldDepth()
  const {search: searchConfig} = useWorkspace()
  const strategy = searchConfig?.strategy || 'groq2024'

  const searchableTypes = useMemo(() => {
    if (documentTypes.length === 0) {
      return []
    }

    const allowed = new Set(documentTypes)
    return getSearchableTypes(schema, documentTypes).filter((type) => allowed.has(type.name))
  }, [documentTypes, schema])

  const search = useMemo(() => {
    if (searchableTypes.length === 0) {
      return null
    }

    return createSearch(searchableTypes, client, {
      tag: 'search.link-picker',
      unique: true,
      strategy,
      maxDepth: maxFieldDepth,
      ...(filter ? {filter, params: filterParams} : {}),
    })
  }, [client, filter, filterParams, maxFieldDepth, searchableTypes, strategy])

  const [hits, setHits] = useState<SearchDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const requestIdRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const loadMoreSubscriptionRef = useRef<{unsubscribe: () => void} | null>(null)

  const canSearch = Boolean(search && (allowEmptyQuery || query))

  const searchOptions = useMemo(
    () => ({
      comments: [
        allowEmptyQuery
          ? 'findability-source: link-picker-folder'
          : 'findability-source: link-picker',
      ],
      limit: SEARCH_PAGE_SIZE,
      perspective: 'raw' as const,
      ...(allowEmptyQuery
        ? {
            skipSortByScore: true,
            sort: [{field: '_updatedAt', direction: 'desc' as const}],
          }
        : {}),
    }),
    [allowEmptyQuery],
  )

  const searchTerms = useMemo(
    () => ({
      query: allowEmptyQuery ? '' : query,
      types: searchableTypes,
    }),
    [allowEmptyQuery, query, searchableTypes],
  )

  useEffect(() => {
    loadMoreSubscriptionRef.current?.unsubscribe()
    loadMoreSubscriptionRef.current = null

    if (!canSearch) {
      requestIdRef.current += 1
      setHits([])
      setNextCursor(undefined)
      setLoading(false)
      setLoadingMore(false)
      loadingMoreRef.current = false
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)
    setLoadingMore(false)
    loadingMoreRef.current = false
    setNextCursor(undefined)

    let subscription: {unsubscribe: () => void} | undefined
    const run = () => {
      subscription = search!(searchTerms, searchOptions).subscribe({
        next: (result) => {
          if (requestId !== requestIdRef.current) {
            return
          }

          setHits(removeDupes(result.hits.map(({hit}) => hit)) as SearchDocument[])
          setNextCursor(result.nextCursor)
          setLoading(false)
        },
        error: () => {
          if (requestId !== requestIdRef.current) {
            return
          }

          setHits([])
          setNextCursor(undefined)
          setLoading(false)
        },
      })
    }

    const timer = debounceMs > 0 ? window.setTimeout(run, debounceMs) : (run(), undefined)

    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer)
      }
      subscription?.unsubscribe()
    }
  }, [canSearch, debounceMs, search, searchOptions, searchTerms])

  useEffect(() => {
    return () => {
      loadMoreSubscriptionRef.current?.unsubscribe()
      loadMoreSubscriptionRef.current = null
    }
  }, [])

  const loadMore = useCallback(() => {
    if (!search || !canSearch || !nextCursor || loading || loadingMoreRef.current) {
      return
    }

    const requestId = requestIdRef.current
    const cursor = nextCursor
    loadingMoreRef.current = true
    setLoadingMore(true)

    loadMoreSubscriptionRef.current?.unsubscribe()
    loadMoreSubscriptionRef.current = search(searchTerms, {
      ...searchOptions,
      cursor,
    }).subscribe({
      next: (result) => {
        if (requestId !== requestIdRef.current) {
          return
        }

        setHits(
          (previous) =>
            removeDupes([...previous, ...result.hits.map(({hit}) => hit)]) as SearchDocument[],
        )
        setNextCursor(result.nextCursor)
        loadingMoreRef.current = false
        setLoadingMore(false)
      },
      error: () => {
        if (requestId !== requestIdRef.current) {
          return
        }

        loadingMoreRef.current = false
        setLoadingMore(false)
      },
    })
  }, [canSearch, loading, nextCursor, search, searchOptions, searchTerms])

  return {
    hits,
    loading,
    loadingMore,
    hasNextPage: Boolean(nextCursor),
    loadMore,
  }
}

function SearchResults({
  documentTypes,
  query,
  staticRoutes,
}: {
  documentTypes: string[]
  query: string
  staticRoutes: StaticLinkRoute[]
}) {
  const perspective = usePerspective()
  const typedLinkResult = useMemo(() => getTypedLinkResult(query), [query])
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
  } = useDocumentSearch(query, documentTypes)
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
  const resultLabel = loading
    ? 'Searching...'
    : `${results.length}${hasNextPage ? '+' : ''} ${results.length === 1 ? 'result' : 'results'}`
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
        pinnedIndices={[0]}
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
  perspectiveStack?: string[]
}) {
  if (item.type === 'document') {
    return (
      <DocumentItem icon={DefaultIcon} item={item.document} perspectiveStack={perspectiveStack} />
    )
  }

  return (
    <PageItem
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

function PageMenu({menuItems}: {menuItems: MenuItem[]}) {
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

  if (item.type === 'folder') {
    return (
      <Button mode="bleed" padding={1} onClick={() => pushFolder(item)} width="fill">
        <Flex style={{width: '100%'}} align="center" justify="space-between" gap={3}>
          <Box flex={1}>
            <SanityDefaultPreview
              layout="compact"
              title={item.label}
              media={item.icon}
              icon={item.icon ? undefined : false}
            />
          </Box>
          <ChevronRightIcon />
        </Flex>
      </Button>
    )
  }

  if (item.type === 'group') {
    return <Group item={item} />
  }

  return <PageItem item={item} />
}

function Folder({item}: {item: MenuItem}) {
  const {popFolder} = useNavigation()
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
  const resultLabel = `${items.length}${hasNextPage ? '+' : ''} ${items.length === 1 ? 'result' : 'results'}`

  return (
    <Flex gap={1} justify="flex-start" direction="column">
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
        pinnedIndices={[0]}
        renderItem={(row) => {
          if (row.type === 'back') {
            return (
              <Button mode="bleed" paddingX={2} paddingY={3} width="fill" onClick={popFolder}>
                <Flex align="center" justify="space-between" style={{width: '100%'}}>
                  <Flex align="center" gap={3}>
                    <ChevronLeftIcon />
                    <Text size={1} weight="medium">
                      Back
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
            return <EmptyFolderState />
          }

          return (
            <DocumentItem
              icon={item.icon}
              item={row.document}
              perspectiveStack={perspective.perspectiveStack}
            />
          )
        }}
      />
    </Flex>
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

function ScrollableList<T>({
  estimateSize = () => VIRTUAL_ROW_ESTIMATE_SIZE,
  getKey,
  items,
  maxHeight,
  onEndReached,
  overscan = VIRTUAL_LIST_OVERSCAN,
  pinnedIndices = [],
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
        <Box
          key={getKey(items[index], index)}
          paddingX={1}
          style={{
            background: STICKY_ROW_BACKGROUND,
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        >
          {renderItem(items[index], index)}
        </Box>
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

function PageItem({item}: {item: MenuItem}) {
  const {onSelect} = useNavigation()

  return (
    <Button
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
        <SanityDefaultPreview
          layout="compact"
          title={item.label}
          media={item.icon}
          icon={item.icon ? undefined : false}
        />
      </Box>
    </Button>
  )
}

function DocumentItem({
  icon,
  item,
  perspectiveStack,
}: {
  icon?: () => React.ReactNode
  item: {
    title?: string
    label?: string
    _type?: string
    _id?: string
  }
  perspectiveStack?: string[]
}) {
  const {onSelect} = useNavigation()
  const schema = useSchema()
  const schemaType = item._type ? schema.get(item._type) : undefined
  const fallbackMedia = item._id === 'default' ? DefaultIcon : icon
  const preview = useValuePreview({
    enabled: Boolean(schemaType && item._id && item._type),
    schemaType: schemaType as SchemaType | undefined,
    value: item._id && item._type ? {_id: item._id, _type: item._type} : undefined,
    perspectiveStack,
  })
  const previewTitle = typeof preview?.value?.title === 'string' ? preview.value.title : undefined
  const label = item.label || item.title || previewTitle

  return (
    <Button
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
      {schemaType && item._id && item._type ? (
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
          <SanityDefaultPreview
            layout="compact"
            title={label}
            media={fallbackMedia}
            icon={fallbackMedia ? undefined : false}
          />
        </Box>
      )}
    </Button>
  )
}

function SkeletonItem() {
  return (
    <Button mode="bleed" width="fill" padding={1} disabled>
      <Box style={{width: '100%'}}>
        <SanityDefaultPreview isPlaceholder layout="compact" />
      </Box>
    </Button>
  )
}

function EmptyFolderState() {
  const {onClose} = useNavigation()

  return (
    <Button mode="bleed" width="fill" padding={1} onClick={onClose}>
      <Box style={{width: '100%'}}>
        <SanityDefaultPreview
          icon={false}
          layout="compact"
          title={
            <Text muted size={1}>
              No results
            </Text>
          }
        />
      </Box>
    </Button>
  )
}
