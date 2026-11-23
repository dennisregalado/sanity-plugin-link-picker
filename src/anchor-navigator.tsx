/**
 * Picker for `anchor` fields: documents with sections are folders, and opening one lists its
 * sections (`sectionAnchor` documents) in page order. Typing searches every section and offers
 * the typed text as a custom `#fragment`.
 */

import {ChevronRightIcon} from '@sanity/icons/ChevronRight'
import {HashIcon} from '@sanity/icons/Hash'
import {Box, Button, Flex, Text} from '@sanity/ui'
import {useCallback, useMemo} from 'react'
import {
  SanityDefaultPreview,
  SearchResultItemPreview,
  usePerspective,
  useSchema,
  useTranslation,
} from 'sanity'

import {SECTION_ANCHOR_TYPE} from './anchors'
import {normalizeAnchorHref} from './href'
import {linkPickerLocaleNamespace} from './i18n'
import {getPublishedDocumentId} from './ids'
import {
  type BaseNavigatorProps,
  EmptyFolderState,
  Folder,
  formatResultCount,
  type MenuItem,
  NAVIGATOR_MAX_HEIGHT,
  NavigationProvider,
  NavigatorFrame,
  ResultAnnouncement,
  ScrollableList,
  type SearchDocument,
  type SearchResultItem,
  SearchResults,
  SkeletonItem,
  useDocumentSearch,
  useNavigation,
  useOptionProps,
} from './navigator'

/** The document whose sections are listed first. */
export type AnchorContextDocument = {
  _id: string
  _type: string
  /** `current`: the document being edited. `linked`: the page the surrounding link points to. */
  kind: 'current' | 'linked'
}

type AnchorNavigatorProps = BaseNavigatorProps & {
  /** Document types that have sections. */
  documentTypes: string[]
  contextDocument?: AnchorContextDocument | null
}

const ANCHOR_TYPES = [SECTION_ANCHOR_TYPE]

const NO_STATIC_ROUTES: never[] = []

const NO_ACTIVE_OPTION = null

// Only list documents the anchors Function has written sections for
const HAS_ANCHORS_FILTER = `_id in *[_type == "${SECTION_ANCHOR_TYPE}"].parent._ref`

const ICON_SIZE = 21

function AnchorIcon() {
  return <HashIcon style={{fontSize: ICON_SIZE}} />
}

/** The custom `#fragment` option for typed text. */
export function getTypedAnchorResult(query: string): SearchResultItem | null {
  const href = normalizeAnchorHref(query)
  if (!href) return null
  return {type: 'link', href, icon: AnchorIcon, label: href, title: href}
}

/** A folder listing one document's sections, in page order. */
export function getSectionsFolder(document: {_id: string; label?: string}): MenuItem {
  return {
    type: 'folder',
    label: document.label ?? document._id,
    documentType: SECTION_ANCHOR_TYPE,
    filter: 'parent._ref == $anchorParentId',
    filterParams: {anchorParentId: getPublishedDocumentId(document._id)},
    sort: 'order',
  }
}

export function AnchorNavigator({
  onClose,
  onSelect,
  searchQuery,
  activeOption = NO_ACTIVE_OPTION,
  optionIdPrefix = 'anchor-picker',
  onNavigate,
  documentTypes,
  contextDocument,
}: AnchorNavigatorProps) {
  return (
    <NavigationProvider
      onClose={onClose}
      onSelect={onSelect}
      onNavigate={onNavigate}
      activeOption={activeOption}
      optionIdPrefix={optionIdPrefix}
    >
      <AnchorNavigatorContent
        contextDocument={contextDocument}
        documentTypes={documentTypes}
        searchQuery={searchQuery}
      />
    </NavigationProvider>
  )
}

function AnchorNavigatorContent({
  contextDocument,
  documentTypes,
  searchQuery,
}: {
  contextDocument?: AnchorContextDocument | null
  documentTypes: string[]
  searchQuery?: string
}) {
  const {navigationStack} = useNavigation()
  const currentFolder = navigationStack[navigationStack.length - 1]
  const query = searchQuery?.trim() || ''

  return (
    <NavigatorFrame>
      {query ? (
        <SearchResults
          documentTypes={ANCHOR_TYPES}
          getTypedResult={getTypedAnchorResult}
          query={query}
          staticRoutes={NO_STATIC_ROUTES}
        />
      ) : currentFolder ? (
        <Folder item={currentFolder} />
      ) : (
        <DocumentsWithSections contextDocument={contextDocument} documentTypes={documentTypes} />
      )}
    </NavigatorFrame>
  )
}

type DocumentRow =
  | {type: 'header'; label: string}
  | {type: 'document'; document: SearchDocument}
  | {type: 'empty'}
  | {type: 'skeleton'; index: number}

function DocumentsWithSections({
  contextDocument,
  documentTypes,
}: {
  contextDocument?: AnchorContextDocument | null
  documentTypes: string[]
}) {
  const {t} = useTranslation(linkPickerLocaleNamespace)
  const {hits, loading, loadingMore, hasNextPage, loadMore} = useDocumentSearch('', documentTypes, {
    debounceMs: 0,
    filter: HAS_ANCHORS_FILTER,
    mode: 'browse',
  })

  const pinned =
    contextDocument && documentTypes.includes(contextDocument._type) ? contextDocument : null
  const pinnedId = pinned ? getPublishedDocumentId(pinned._id) : null

  const rows = useMemo<DocumentRow[]>(() => {
    const others = hits.filter((document) => document._id !== pinnedId)
    const result: DocumentRow[] = []

    if (pinned) {
      result.push(
        {
          type: 'header',
          label: t(pinned.kind === 'linked' ? 'anchor.linked-document' : 'anchor.current-document'),
        },
        {type: 'document', document: {_id: pinnedId ?? pinned._id, _type: pinned._type}},
        {type: 'header', label: t('anchor.documents')},
      )
    }

    if (loading && others.length === 0) {
      result.push(...Array.from({length: 6}, (_, index) => ({type: 'skeleton' as const, index})))
    } else if (others.length === 0) {
      result.push({type: 'empty'})
    } else {
      result.push(...others.map((document) => ({type: 'document' as const, document})))
      if (loadingMore) {
        result.push(
          ...Array.from({length: 3}, (_, index) => ({
            type: 'skeleton' as const,
            index: others.length + index,
          })),
        )
      }
    }

    return result
  }, [hits, loading, loadingMore, pinned, pinnedId, t])

  return (
    <Flex gap={1} justify="flex-start" direction="column">
      <ResultAnnouncement>
        {loading ? '' : formatResultCount(t, hits.length, hasNextPage)}
      </ResultAnnouncement>
      <ScrollableList
        getKey={(row, index) => {
          if (row.type === 'header') return `header-${index}`
          if (row.type === 'empty') return 'empty'
          if (row.type === 'skeleton') return `skeleton-${row.index}`
          return `document-${row.document._id}`
        }}
        items={rows}
        maxHeight={NAVIGATOR_MAX_HEIGHT}
        onEndReached={hasNextPage ? loadMore : undefined}
        renderItem={(row) => {
          if (row.type === 'header') {
            return (
              <Box paddingX={2} paddingTop={3} paddingBottom={2}>
                <Text size={1} weight="medium">
                  {row.label}
                </Text>
              </Box>
            )
          }
          if (row.type === 'skeleton') return <SkeletonItem />
          if (row.type === 'empty') return <EmptyFolderState />
          return <DocumentFolderRow document={row.document} />
        }}
      />
    </Flex>
  )
}

/** A document with sections; opening it lists the sections. */
function DocumentFolderRow({document}: {document: SearchDocument}) {
  const {pushFolder} = useNavigation()
  const schema = useSchema()
  const {perspectiveStack} = usePerspective()
  const optionProps = useOptionProps(`sections:${document._id}`)
  const schemaType = schema.get(document._type)
  const open = useCallback(() => pushFolder(getSectionsFolder(document)), [document, pushFolder])

  return (
    <Button {...optionProps} mode="bleed" padding={1} width="fill" onClick={open}>
      <Flex align="center" gap={3} justify="space-between" style={{width: '100%'}}>
        <Box flex={1} style={{minWidth: 0}}>
          {schemaType ? (
            <SearchResultItemPreview
              documentId={document._id}
              documentType={document._type}
              layout="compact"
              perspective={perspectiveStack}
              schemaType={schemaType}
              showBadge={false}
            />
          ) : (
            <SanityDefaultPreview icon={false} layout="compact" title={document._id} />
          )}
        </Box>
        <ChevronRightIcon />
      </Flex>
    </Button>
  )
}
