/**
 * Shopify-style link picker for Sanity fields.
 *
 * Groups render section labels, routes select URL values immediately, and
 * document folders drill into Sanity query results to select references.
 */

import {ChevronLeftIcon} from '@sanity/icons/ChevronLeft'
import {ChevronRightIcon} from '@sanity/icons/ChevronRight'
import {EarthGlobeIcon} from '@sanity/icons/EarthGlobe'
import {EnvelopeIcon} from '@sanity/icons/Envelope'
import {LinkIcon} from '@sanity/icons/Link'
import {MobileDeviceIcon} from '@sanity/icons/MobileDevice'
import {Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'
import {useVirtualizer} from '@tanstack/react-virtual'
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
  useClient,
  usePerspective,
  useSchema,
  useTranslation,
  useDocumentPreviewStore,
  type PerspectiveStack,
  type QueryParams,
  type SchemaType,
} from 'sanity'

import {getSystemLinkType, normalizeLinkHref, type SystemLinkType} from './href'
import {linkPickerLocaleNamespace} from './i18n'
import {
  getFlattenedLinkRoutes,
  getReferenceTypesFromRoutes,
  type LinkIconInput,
  type LinkRouteDefinition,
  type StaticLinkRoute,
} from './routes'
import {buildDocumentSearchQuery, SEARCH_PAGE_SIZE} from './search'

const DefaultIcon = () => <Text>✨</Text>

const NAVIGATOR_MAX_HEIGHT = 390

// @sanity/icons are drawn on a 25px grid with padding; 21px matches the old 16px glyphs
const ICON_SIZE = 21

const VIRTUAL_LIST_OVERSCAN = 5

const VIRTUAL_ROW_ESTIMATE_SIZE = 52

const SEARCH_DEBOUNCE_MS = 300

const API_VERSION = '2025-02-19'

const NO_ROUTES: LinkRouteDefinition[] = []

type RenderLinkIcon = () => React.ReactNode

const defaultLinkTypeIcons: Record<SystemLinkType, typeof LinkIcon> = {
  internal: LinkIcon,
  external: EarthGlobeIcon,
  email: EnvelopeIcon,
  phone: MobileDeviceIcon,
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
  searchQuery?: string
  /** Key of the option highlighted with the keyboard */
  activeOption?: string | null
  /** Prefix for option element ids, referenced by the input's aria-activedescendant */
  optionIdPrefix?: string
  /** Called when the visible options change because a folder was opened or closed */
  onNavigate?: () => void
}

/** Element id of a picker option, referenced by the input's aria-activedescendant. */
export function getOptionId(prefix: string, key: string): string {
  return `${prefix}-option-${encodeURIComponent(key)}`
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
): RenderLinkIcon | undefined {
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

export function getSystemLinkIcon(href: string, options?: {shift?: boolean}): RenderLinkIcon {
  const Icon = defaultLinkTypeIcons[getSystemLinkType(href)]

  return () => (
    <NormalizedLinkIcon shift={options?.shift}>
      <Icon style={{fontSize: ICON_SIZE}} />
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
  activeOption: string | null
  optionIdPrefix: string
}

const NavigationContext = createContext<NavigationContextType | null>(null)

/**
 * Props that make a row a selectable picker option: a stable key for keyboard navigation, the id
 * used by aria-activedescendant, and the highlight when it's active.
 */
function useOptionProps(key: string) {
  const {activeOption, optionIdPrefix} = useNavigation()
  const active = activeOption === key
  return {
    'id': getOptionId(optionIdPrefix, key),
    'role': 'option',
    'aria-selected': active,
    'data-option-key': key,
    'selected': active,
    'style': OPTION_STYLE,
  }
}

/** Keeps options scrolled into view below the pinned header row */
const OPTION_STYLE = {scrollMarginTop: VIRTUAL_ROW_ESTIMATE_SIZE}

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
  onNavigate,
  activeOption,
  optionIdPrefix,
}: {
  children: React.ReactNode
  onClose?: () => void
  onNavigate?: () => void
  activeOption: string | null
  optionIdPrefix: string
  onSelect?: (item: {
    label?: string
    href?: string
    reference?: string
    _type?: string
    _id?: string
  }) => void
}) {
  const [navigationStack, setNavigationStack] = useState<MenuItem[]>([])

  const pushFolder = useCallback(
    (folder: MenuItem) => {
      setNavigationStack((prev) => [...prev, folder])
      onNavigate?.()
    },
    [onNavigate],
  )

  const popFolder = useCallback(() => {
    setNavigationStack((prev) => prev.slice(0, -1))
    onNavigate?.()
  }, [onNavigate])

  const value = useMemo(
    () => ({
      navigationStack,
      pushFolder,
      popFolder,
      onSelect,
      onClose,
      activeOption,
      optionIdPrefix,
    }),
    [activeOption, navigationStack, onClose, onSelect, optionIdPrefix, popFolder, pushFolder],
  )

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

const NO_ACTIVE_OPTION = null

export function VisualEditorNavigator({
  onClose,
  onSelect,
  routes,
  searchQuery,
  activeOption = NO_ACTIVE_OPTION,
  optionIdPrefix = 'link-picker',
  onNavigate,
}: NavigatorProps) {
  const filteredRoutes = routes ?? NO_ROUTES
  const menuItems = useMemo(() => normalizeRoutes(filteredRoutes), [filteredRoutes])
  const documentTypes = useMemo(() => getReferenceTypesFromRoutes(filteredRoutes), [filteredRoutes])
  const staticRoutes = useMemo(() => getFlattenedLinkRoutes(filteredRoutes), [filteredRoutes])

  return (
    <NavigationProvider
      onClose={onClose}
      onSelect={onSelect}
      onNavigate={onNavigate}
      activeOption={activeOption}
      optionIdPrefix={optionIdPrefix}
    >
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
  /** `browse` lists a folder newest-first instead of ranking by a search query. */
  mode?: 'search' | 'browse'
}

type Subscription = {unsubscribe: () => void}

function formatResultCount(
  t: ReturnType<typeof useTranslation>['t'],
  count: number,
  hasMore: boolean,
): string {
  return hasMore ? t('search.result-count-more', {count}) : t('search.result-count', {count})
}

/** Pages fetch one extra row to know whether another page exists. */
function toPage(rows: SearchDocument[]) {
  return {hits: rows.slice(0, SEARCH_PAGE_SIZE), hasNextPage: rows.length > SEARCH_PAGE_SIZE}
}

type DocumentSearchState = {
  /** Identifies the request these results belong to, so stale results are never shown. */
  key: string | null
  hits: SearchDocument[]
  hasNextPage: boolean
  loadingMore: boolean
}

const EMPTY_SEARCH_STATE: DocumentSearchState = {
  key: null,
  hits: [],
  hasNextPage: false,
  loadingMore: false,
}

function useDocumentSearch(
  query: string,
  documentTypes: string[],
  options: DocumentSearchOptions = {},
) {
  const {debounceMs = SEARCH_DEBOUNCE_MS, filter, filterParams, mode = 'search'} = options
  const client = useClient({apiVersion: API_VERSION})
  const schema = useSchema()
  const {perspectiveStack} = usePerspective()

  const request = useMemo(() => {
    if (documentTypes.length === 0 || (mode === 'search' && !query)) return null
    return buildDocumentSearchQuery({
      mode,
      query,
      typeNames: documentTypes,
      schemaTypes: documentTypes.map((name) => schema.get(name)),
      filter,
      filterParams,
    })
  }, [documentTypes, filter, filterParams, mode, query, schema])
  const requestKey = request ? JSON.stringify([request, perspectiveStack]) : null

  const fetchPage = useCallback(
    (start: number) => {
      if (!request) return null
      return client.observable.fetch<SearchDocument[]>(
        request.query,
        {...request.params, __start: start, __end: start + SEARCH_PAGE_SIZE + 1},
        {perspective: perspectiveStack, tag: 'link-picker.search'},
      )
    },
    [client, perspectiveStack, request],
  )

  const [state, setState] = useState<DocumentSearchState>(EMPTY_SEARCH_STATE)
  const loadMoreSubscription = useRef<Subscription | null>(null)

  useEffect(() => {
    const page$ = fetchPage(0)
    if (!page$) return undefined

    let subscription: Subscription | undefined
    const run = () => {
      subscription = page$.subscribe({
        next: (rows) => setState({key: requestKey, ...toPage(rows), loadingMore: false}),
        error: () => setState({...EMPTY_SEARCH_STATE, key: requestKey}),
      })
    }
    const timer = debounceMs > 0 ? window.setTimeout(run, debounceMs) : undefined
    if (timer === undefined) run()

    return () => {
      window.clearTimeout(timer)
      subscription?.unsubscribe()
      loadMoreSubscription.current?.unsubscribe()
    }
  }, [debounceMs, fetchPage, requestKey])

  const isCurrent = requestKey !== null && state.key === requestKey
  const hits = isCurrent ? state.hits : EMPTY_HITS

  const loadMore = useCallback(() => {
    if (!isCurrent || !state.hasNextPage || state.loadingMore) return
    const page$ = fetchPage(state.hits.length)
    if (!page$) return

    setState((previous) => ({...previous, loadingMore: true}))
    loadMoreSubscription.current?.unsubscribe()
    loadMoreSubscription.current = page$.subscribe({
      next: (rows) => {
        const page = toPage(rows)
        setState((previous) =>
          previous.key === requestKey
            ? {
                key: requestKey,
                hits: uniqueById([...previous.hits, ...page.hits]),
                hasNextPage: page.hasNextPage,
                loadingMore: false,
              }
            : previous,
        )
      },
      error: () => setState((previous) => ({...previous, loadingMore: false})),
    })
  }, [fetchPage, isCurrent, requestKey, state.hasNextPage, state.hits.length, state.loadingMore])

  return {
    hits,
    loading: requestKey !== null && !isCurrent,
    loadingMore: isCurrent && state.loadingMore,
    hasNextPage: isCurrent && state.hasNextPage,
    loadMore,
  }
}

const EMPTY_HITS: SearchDocument[] = []

function uniqueById(documents: SearchDocument[]): SearchDocument[] {
  const seen = new Set<string>()
  return documents.filter((document) => !seen.has(document._id) && Boolean(seen.add(document._id)))
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

  return <PageItem item={item} optionKey={`route:${item.href}`} />
}

function Folder({item}: {item: MenuItem}) {
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
            return <EmptyFolderState />
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
const PINNED_FIRST_ROW = [0]

function ScrollableList<T>({
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

function PageItem({item, optionKey}: {item: MenuItem; optionKey: string}) {
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

/** The document's preview title, used as the link label when it's selected. */
function usePreviewTitle(
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

function DocumentItem({
  icon,
  item,
  optionKey,
  perspectiveStack,
}: {
  icon?: () => React.ReactNode
  optionKey: string
  item: {
    title?: string
    label?: string
    _type?: string
    _id?: string
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
function ResultAnnouncement({children}: {children: React.ReactNode}) {
  return (
    <output aria-live="polite" style={VISUALLY_HIDDEN}>
      {children}
    </output>
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
  const {t} = useTranslation(linkPickerLocaleNamespace)

  return (
    <Box padding={1} style={{width: '100%'}}>
      <SanityDefaultPreview
        icon={false}
        layout="compact"
        title={
          <Text muted size={1}>
            {t('search.no-results')}
          </Text>
        }
      />
    </Box>
  )
}
