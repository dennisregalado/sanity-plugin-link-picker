import {EditIcon} from '@sanity/icons/Edit'
import {Box, Button, Card, Flex, Text} from '@sanity/ui'
import {Tooltip} from '@sanity/ui/tooltip'
import {useCallback, useEffect, useState} from 'react'
import {
  type InputProps,
  type ReferenceSchemaType,
  type ReferenceValue,
  SanityDefaultPreview,
  type SchemaType,
  SearchResultItemPreview,
  useDocumentPreviewStore,
  usePerspective,
  useTranslation,
} from 'sanity'
import {type RouterPanes, usePaneRouter} from 'sanity/structure'

import {AnchorBreadcrumb, useAnchorSummary} from '../anchor-breadcrumb'
import {DEFAULT_SECTIONS_FIELD, SECTION_ANCHOR_TYPE} from '../anchors'
import {linkPickerLocaleNamespace} from '../i18n'
import {MutedPreview} from '../navigator'
import {usePickerContext} from './picker-field'

const NO_TYPES: SchemaType[] = []

function isReferenceType(schemaType: SchemaType): schemaType is ReferenceSchemaType {
  return 'to' in schemaType && Array.isArray(schemaType.to)
}

/**
 * Resolves the referenced document's type, live and in the current perspective: `undefined`
 * while loading, `null` without a reference or when the document doesn't exist.
 */
function useReferencedDocumentType(
  documentId: string | undefined,
  allowedTypes: SchemaType[],
): string | null | undefined {
  const documentPreviewStore = useDocumentPreviewStore()
  const {perspectiveStack} = usePerspective()
  const onlyType = allowedTypes.length === 1 ? (allowedTypes[0]?.name ?? null) : null
  const [resolved, setResolved] = useState<{id: string; type: string | null} | null>(null)

  useEffect(() => {
    if (!documentId || onlyType) return undefined
    const subscription = documentPreviewStore
      .observeDocumentTypeFromId(documentId, undefined, perspectiveStack)
      .subscribe((type) => setResolved({id: documentId, type: type ?? null}))
    return () => subscription.unsubscribe()
  }, [documentId, documentPreviewStore, onlyType, perspectiveStack])

  if (!documentId) return null
  if (onlyType) return onlyType
  return resolved?.id === documentId ? resolved.type : undefined
}

export function ReferencePreviewInput(props: InputProps) {
  const linkContext = usePickerContext()
  const {t} = useTranslation(linkPickerLocaleNamespace)
  const perspective = usePerspective()
  const {ChildLink, ReferenceChildLink, groupIndex, groupLength, routerPanesState} = usePaneRouter()
  // Outside the Structure and Presentation tools there is no pane router to open references in
  const hasPaneRouter = groupLength > 0
  const reference: Partial<ReferenceValue> | undefined =
    props.value && typeof props.value === 'object' && '_ref' in props.value
      ? props.value
      : undefined
  const documentId = reference?._ref
  const allowedTypes = isReferenceType(props.schemaType) ? props.schemaType.to : NO_TYPES
  const documentType = useReferencedDocumentType(documentId, allowedTypes)
  const refType = documentType
    ? allowedTypes.find((toType) => toType.name === documentType)
    : undefined
  const linkTarget =
    documentId && documentType && refType ? {documentId, documentType, refType} : null

  // A section opens the page it's on, at the section, rather than its read-only anchor document
  const isSection = linkTarget?.documentType === SECTION_ANCHOR_TYPE
  const anchorSummary = useAnchorSummary(
    isSection ? documentId : undefined,
    linkContext.sectionsField,
  )
  const sectionTarget =
    isSection && anchorSummary?.parentId && anchorSummary.parentType
      ? {
          documentId: anchorSummary.parentId,
          documentType: anchorSummary.parentType,
          path: anchorSummary.sectionKey
            ? `${linkContext.sectionsField ?? DEFAULT_SECTIONS_FIELD}[_key==${JSON.stringify(anchorSummary.sectionKey)}]`
            : undefined,
        }
      : null
  const paneTarget = isSection ? sectionTarget : linkTarget
  const referencePaneOpen =
    paneTarget && hasPaneRouter
      ? isReferencePaneOpen(routerPanesState, groupIndex, paneTarget)
      : false

  let preview = null
  if (isSection) {
    // Sections show where they live: Page › Section
    preview = (
      <AnchorBreadcrumb summary={anchorSummary} linkedDocumentId={linkContext.linkedDocumentId} />
    )
  } else if (linkTarget) {
    preview = (
      <SearchResultItemPreview
        documentId={linkTarget.documentId}
        documentType={linkTarget.documentType}
        layout="compact"
        perspective={perspective.perspectiveStack}
        schemaType={linkTarget.refType}
        showBadge={false}
      />
    )
  } else if (documentId && documentType === null) {
    // A weak reference to a deleted document (validation warns about it too)
    preview = (
      <Box style={{width: '100%'}}>
        <MutedPreview>{t('reference.missing')}</MutedPreview>
      </Box>
    )
  } else if (documentId) {
    preview = (
      <Box style={{width: '100%'}}>
        <SanityDefaultPreview isPlaceholder layout="compact" />
      </Box>
    )
  }

  const previewButton = (
    <Button
      as="span"
      mode={referencePaneOpen ? 'default' : 'bleed'}
      padding={0}
      tone={referencePaneOpen ? 'primary' : 'default'}
      width="fill"
      style={{clipPath: 'inset(3px round 2px)'}}
    >
      {preview}
    </Button>
  )

  let target = (
    <Button
      disabled
      mode="bleed"
      padding={0}
      width="fill"
      style={{clipPath: 'inset(3px round 2px)'}}
    >
      {preview}
    </Button>
  )
  if (isSection && sectionTarget && hasPaneRouter) {
    target = (
      <ChildLink
        childId={sectionTarget.documentId}
        // No parentRefPath: Studio would compare the page with the anchor reference and report
        // that the reference changed. The row's highlight comes from isReferencePaneOpen instead.
        childParameters={{
          type: sectionTarget.documentType,
          ...(sectionTarget.path ? {path: sectionTarget.path} : {}),
        }}
      >
        {previewButton}
      </ChildLink>
    )
  } else if (isSection) {
    target = sectionTarget ? previewButton : target
  } else if (linkTarget && hasPaneRouter) {
    target = (
      <ReferenceChildLink
        documentId={linkTarget.documentId}
        documentType={linkTarget.documentType}
        parentRefPath={props.path}
      >
        {previewButton}
      </ReferenceChildLink>
    )
  } else if (linkTarget) {
    target = previewButton
  }

  const handleReplace = useCallback(() => linkContext.replaceReference(props), [linkContext, props])

  return (
    <Card border radius={2} overflow="hidden">
      <Flex align="center" style={{height: 33}}>
        <Box flex={1} style={{minWidth: 0}}>
          {target}
        </Box>
        <Tooltip
          animate
          content={
            <Text size={1} weight="medium">
              {t('reference.replace')}
            </Text>
          }
          placement="top"
        >
          <Button
            aria-label={t('reference.replace')}
            style={{clipPath: 'inset(3px round 2px)'}}
            disabled={props.readOnly}
            icon={EditIcon}
            mode="bleed"
            onClick={handleReplace}
          />
        </Tooltip>
      </Flex>
    </Card>
  )
}

function isReferencePaneOpen(
  routerPanesState: RouterPanes,
  groupIndex: number,
  target: {
    documentId: string
    documentType: string
  },
) {
  const siblings = routerPanesState[groupIndex + 1] ?? []

  return siblings.some((pane) => {
    const payload: {id?: unknown; type?: unknown} =
      pane.payload && typeof pane.payload === 'object' ? pane.payload : {}
    const id = pane.id || pane.params?.id || payload.id
    const type = pane.params?.type || payload.type

    return id === target.documentId && (!type || type === target.documentType)
  })
}
