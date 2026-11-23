import {Box, Stack} from '@sanity/ui'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {type Path, useDocumentPreviewStore, useFormValue, usePerspective} from 'sanity'

import {type AnchorContextDocument, AnchorNavigator} from './anchor-navigator'
import {isAnchorHref, normalizeAnchorHref} from './href'
import {getPublishedDocumentId} from './ids'
import {
  getMemberFieldName,
  PickerField,
  type PickerNavigatorProps,
  ReferencePreviewInput,
  URLInputComponent,
  withInputComponent,
} from './input'
import {buildSelectionPatches, type LinkSelection} from './patches'
import type {AnchorInputProps} from './types'

const BUILT_IN_FIELD_NAMES = new Set(['url', 'reference'])

// A fragment already starts with `#`, so the input shows no icon
function getAnchorIcon() {
  return undefined
}

function isBrowseValue(value: string) {
  const trimmed = value.trim()
  return !trimmed || isAnchorHref(trimmed)
}

const HIDE_TITLE = {hideTitle: true}

export function AnchorInput(props: AnchorInputProps) {
  const {members, onChange, onPathFocus, path, readOnly, renderDefault, schemaType, value} = props
  const documentTypes = props.pluginOptions.documentTypes
  const contextDocument = useAnchorContextDocument(path)
  const hasReference = Boolean(value?.reference)

  // The anchor field's own title labels the input, so the inner url/reference fields don't repeat it
  const referenceField = useMemo(
    () =>
      members
        .filter((member) => getMemberFieldName(member) === 'reference')
        .map((member) => withInputComponent(member, ReferencePreviewInput, HIDE_TITLE)),
    [members],
  )
  const urlField = useMemo(
    () =>
      members
        .filter((member) => getMemberFieldName(member) === 'url')
        .map((member) => withInputComponent(member, URLInputComponent, HIDE_TITLE)),
    [members],
  )
  const extraMembers = useMemo(
    () =>
      members.filter((member) => {
        const fieldName = getMemberFieldName(member)
        return !fieldName || !BUILT_IN_FIELD_NAMES.has(fieldName)
      }),
    [members],
  )

  const handleSelect = useCallback(
    // Anchors have no label: only the fragment or the section reference is stored
    ({href, _id}: LinkSelection) => onChange(buildSelectionPatches(schemaType.name, {href, _id})),
    [onChange, schemaType.name],
  )

  const renderNavigator = useCallback(
    (navigatorProps: PickerNavigatorProps) => (
      <AnchorNavigator
        {...navigatorProps}
        contextDocument={contextDocument}
        documentTypes={documentTypes}
      />
    ),
    [contextDocument, documentTypes],
  )

  return (
    <PickerField
      canOpenPopover={!readOnly}
      readOnly={readOnly}
      onPathFocus={onPathFocus}
      onSelect={handleSelect}
      renderNavigator={renderNavigator}
      normalizeHref={normalizeAnchorHref}
      getIcon={getAnchorIcon}
      isBrowseValue={isBrowseValue}
      linkedDocumentId={contextDocument?.kind === 'linked' ? contextDocument._id : undefined}
      sectionsField={props.pluginOptions.field}
    >
      {(setAnchorElement) => (
        <Stack gap={5}>
          <Box ref={setAnchorElement}>
            {renderDefault({...props, members: hasReference ? referenceField : urlField})}
          </Box>
          {extraMembers.length > 0 ? renderDefault({...props, members: extraMembers}) : null}
        </Stack>
      )}
    </PickerField>
  )
}

type ParentLinkValue = {
  reference?: {_ref?: string} | null
  url?: string | null
}

/**
 * The document whose sections the picker lists first:
 * - inside a link that points at a document, that document;
 * - inside a link with an external URL or path, none;
 * - otherwise (a standalone field, or a link with no target or a `#hash`), the document being
 *   edited.
 */
function useAnchorContextDocument(path: Path): AnchorContextDocument | null {
  // Only a field nested in an object can be part of a link
  const parentValue = useFormValue(path.length > 1 ? path.slice(0, -1) : ['_id'])
  const parent: ParentLinkValue | null =
    path.length > 1 && parentValue && typeof parentValue === 'object' ? parentValue : null
  const currentId = useFormValue(['_id'])
  const currentType = useFormValue(['_type'])

  const linkedId = parent?.reference?._ref
  const linkedType = useDocumentType(linkedId)
  const pointsElsewhere = Boolean(parent?.url && !parent.url.startsWith('#'))

  return useMemo(() => {
    if (linkedId) {
      return linkedType ? {_id: linkedId, _type: linkedType, kind: 'linked'} : null
    }
    if (pointsElsewhere || typeof currentId !== 'string' || typeof currentType !== 'string') {
      return null
    }
    return {_id: getPublishedDocumentId(currentId), _type: currentType, kind: 'current'}
  }, [currentId, currentType, linkedId, linkedType, pointsElsewhere])
}

/** A document's type, live and in the current perspective. */
function useDocumentType(documentId: string | undefined): string | null {
  const documentPreviewStore = useDocumentPreviewStore()
  const {perspectiveStack} = usePerspective()
  const [resolved, setResolved] = useState<{id: string; type: string | null} | null>(null)

  useEffect(() => {
    if (!documentId) return undefined
    const subscription = documentPreviewStore
      .observeDocumentTypeFromId(documentId, undefined, perspectiveStack)
      .subscribe((type) => setResolved({id: documentId, type: type ?? null}))
    return () => subscription.unsubscribe()
  }, [documentId, documentPreviewStore, perspectiveStack])

  return documentId && resolved?.id === documentId ? resolved.type : null
}
