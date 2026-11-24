/**
 * Shopify-style link picker for Sanity fields.
 *
 * Groups render section labels, routes select URL values immediately, and
 * document folders drill into Sanity query results to select references.
 */
import {useMemo} from 'react'

import {
  getFlattenedLinkRoutes,
  getReferenceTypesFromRoutes,
  type LinkRouteDefinition,
  type StaticLinkRoute,
} from '../routes'
import {NavigationProvider, useNavigation} from './context'
import {normalizeLinkIcon} from './icons'
import {Folder, PageMenu} from './items'
import {NavigatorFrame} from './list'
import {SearchResults} from './search-results'
import type {MenuItem, NavigatorSelection} from './types'

const NO_ROUTES: LinkRouteDefinition[] = []

type NavigatorProps = {
  onSelect?: (item: NavigatorSelection) => void
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
    <NavigatorFrame>
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
    </NavigatorFrame>
  )
}

export {NAVIGATOR_MAX_HEIGHT} from './constants'
export {getOptionId, NavigationProvider, useNavigation, useOptionProps} from './context'
export {formatResultCount, useDocumentSearch} from './document-search'
export {getSystemLinkIcon, normalizeLinkIcon} from './icons'
export {Folder, usePreviewTitle} from './items'
export {
  EmptyFolderState,
  MutedPreview,
  NavigatorFrame,
  PickerHint,
  ResultAnnouncement,
  ScrollableList,
  SkeletonItem,
} from './list'
export {SearchResults} from './search-results'
export type {
  BaseNavigatorProps,
  MenuItem,
  NavigatorSelection,
  SearchDocument,
  SearchResultItem,
} from './types'
