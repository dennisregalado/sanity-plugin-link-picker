/**
 * Picker for `anchor` fields: documents with sections are folders, and opening one lists its
 * sections (`sectionAnchor` documents) in page order. Typing searches every section and offers
 * the typed text as a custom `#fragment`.
 */

import {ChevronRightIcon} from '@sanity/icons/ChevronRight'
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
  PickerHint,
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
import {getSectionAnchorProjection} from './section-preview'

/** Where the anchor field is, which decides what the picker offers. */
export type AnchorContext =
  | {
      /**
       * `current`: the document being edited, listed first. `linked`: the document the
       * surrounding link points to; the picker only offers its sections.
       */
      kind: 'current' | 'linked'
      _id: string
      _type: string
    }
  | {
      /**
       * Only a custom `#fragment` can be used: the surrounding link goes to a URL (`url`), or to
       * a document without sections (`no-sections`).
       */
      kind: 'fragment-only'
      reason: 'url' | 'no-sections'
    }
  /** The linked document's type is loading. */
  | {kind: 'loading'}

type AnchorNavigatorProps = BaseNavigatorProps & {
  /** Document types that have sections. */
  documentTypes: string[]
  /** The sections array field, for looking up each section's type (its icon) */
  sectionsField?: string
  context?: AnchorContext | null
}

const ANCHOR_TYPES = [SECTION_ANCHOR_TYPE]

const NO_STATIC_ROUTES: never[] = []

const NO_DOCUMENT_TYPES: string[] = []

const NO_ACTIVE_OPTION = null

// Only list documents the anchors Function has written sections for
const HAS_ANCHORS_FILTER = `_id in *[_type == "${SECTION_ANCHOR_TYPE}"].parent._ref`

/** The option for using the typed text as a custom fragment: `Use "#team"`, without an icon. */
export function getTypedAnchorResult(
  query: string,
  formatLabel: (fragment: string) => string,
): SearchResultItem | null {
  const href = normalizeAnchorHref(query)
  if (!href) return null
  const label = formatLabel(href)
  return {type: 'link', href, label, title: label}
}

/** A folder listing one document's sections, in page order. */
export function getSectionsFolder(
  document: {_id: string; label?: string},
  sectionsField?: string,
): MenuItem {
  return {
    type: 'folder',
    label: document.label ?? document._id,
    documentType: SECTION_ANCHOR_TYPE,
    filter: 'parent._ref == $anchorParentId',
    filterParams: {anchorParentId: getPublishedDocumentId(document._id)},
    sort: 'order',
    projection: getSectionAnchorProjection(sectionsField),
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
  context,
  sectionsField,
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
        context={context}
        documentTypes={documentTypes}
        searchQuery={searchQuery}
        sectionsField={sectionsField}
      />
    </NavigationProvider>
  )
}

function AnchorNavigatorContent({
  context,
  documentTypes,
  searchQuery,
  sectionsField,
}: {
  context?: AnchorContext | null
  documentTypes: string[]
  searchQuery?: string
  sectionsField?: string
}) {
  const {t} = useTranslation(linkPickerLocaleNamespace)
  const {navigationStack} = useNavigation()
  const currentFolder = navigationStack[navigationStack.length - 1]
  const query = searchQuery?.trim() || ''
  const getTypedResult = useCallback(
    (text: string) =>
      getTypedAnchorResult(text, (fragment) => t('anchor.use-fragment', {fragment})),
    [t],
  )

  // Inside a link to a document, the anchor can only be one of that document's sections, so the
  // picker skips choosing a document
  const linkedFolder = useMemo(
    () =>
      context?.kind === 'linked' && documentTypes.includes(context._type)
        ? getSectionsFolder(context, sectionsField)
        : null,
    [context, documentTypes, sectionsField],
  )
  const noSections = t('anchor.no-sections')

  if (context?.kind === 'fragment-only') {
    // Nothing to pick, only the typed fragment to use
    return (
      <NavigatorFrame>
        {query ? (
          <SearchResults
            documentTypes={NO_DOCUMENT_TYPES}
            getTypedResult={getTypedResult}
            query={query}
            staticRoutes={NO_STATIC_ROUTES}
          />
        ) : (
          <PickerHint>
            {t(
              context.reason === 'url'
                ? 'anchor.fragment-only.url'
                : 'anchor.fragment-only.no-sections',
            )}
          </PickerHint>
        )}
      </NavigatorFrame>
    )
  }

  if (context?.kind === 'loading') {
    return (
      <NavigatorFrame>
        {Array.from({length: 3}, (_, index) => (
          <SkeletonItem key={index} />
        ))}
      </NavigatorFrame>
    )
  }

  return (
    <NavigatorFrame>
      {query ? (
        <SearchResults
          documentTypes={ANCHOR_TYPES}
          filter={linkedFolder?.filter}
          filterParams={linkedFolder?.filterParams}
          getTypedResult={getTypedResult}
          projection={getSectionAnchorProjection(sectionsField)}
          query={query}
          staticRoutes={NO_STATIC_ROUTES}
        />
      ) : linkedFolder ? (
        <Folder emptyMessage={noSections} item={linkedFolder} title={t('anchor.linked-sections')} />
      ) : currentFolder ? (
        <Folder emptyMessage={noSections} item={currentFolder} />
      ) : (
        <DocumentsWithSections
          contextDocument={context}
          documentTypes={documentTypes}
          sectionsField={sectionsField}
        />
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
  sectionsField,
}: {
  contextDocument?: AnchorContext | null
  documentTypes: string[]
  sectionsField?: string
}) {
  const {t} = useTranslation(linkPickerLocaleNamespace)
  const {hits, loading, loadingMore, hasNextPage, loadMore} = useDocumentSearch('', documentTypes, {
    debounceMs: 0,
    filter: HAS_ANCHORS_FILTER,
    mode: 'browse',
  })

  const pinned =
    contextDocument?.kind === 'current' && documentTypes.includes(contextDocument._type)
      ? contextDocument
      : null
  const pinnedId = pinned ? getPublishedDocumentId(pinned._id) : null

  const rows = useMemo<DocumentRow[]>(() => {
    const others = hits.filter((document) => document._id !== pinnedId)
    const result: DocumentRow[] = []

    if (pinned) {
      result.push(
        {
          type: 'header',
          label: t('anchor.current-document'),
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
          return <DocumentFolderRow document={row.document} sectionsField={sectionsField} />
        }}
      />
    </Flex>
  )
}

/** A document with sections; opening it lists the sections. */
function DocumentFolderRow({
  document,
  sectionsField,
}: {
  document: SearchDocument
  sectionsField?: string
}) {
  const {pushFolder} = useNavigation()
  const schema = useSchema()
  const {perspectiveStack} = usePerspective()
  const optionProps = useOptionProps(`sections:${document._id}`)
  const schemaType = schema.get(document._type)
  const open = useCallback(
    () => pushFolder(getSectionsFolder(document, sectionsField)),
    [document, pushFolder, sectionsField],
  )

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
