import {Box, Stack} from '@sanity/ui'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {type Path, useDocumentPreviewStore, useFormValue, usePerspective} from 'sanity'

import {type AnchorContext, AnchorNavigator} from './anchor-navigator'
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

function isBrowseValue(value: string) {
  const trimmed = value.trim()
  return !trimmed || isAnchorHref(trimmed)
}

export function AnchorInput(props: AnchorInputProps) {
  const {members, onChange, onPathFocus, path, readOnly, renderDefault, schemaType, value} = props
  const documentTypes = props.pluginOptions.documentTypes
  const context = useAnchorContext(path, documentTypes)
  const hasReference = Boolean(value?.reference)

  // The anchor field renders without its own wrapper (see createAnchorType), so the inner
  // url/reference field carries the anchor field's title and description instead
  const label = useMemo(
    () => ({title: schemaType.title, description: schemaType.description}),
    [schemaType.description, schemaType.title],
  )
  const referenceField = useMemo(
    () =>
      members
        .filter((member) => getMemberFieldName(member) === 'reference')
        .map((member) => withInputComponent(member, ReferencePreviewInput, {label})),
    [label, members],
  )
  const urlField = useMemo(
    () =>
      members
        .filter((member) => getMemberFieldName(member) === 'url')
        .map((member) => withInputComponent(member, URLInputComponent, {label})),
    [label, members],
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
        context={context}
        documentTypes={documentTypes}
        sectionsField={props.pluginOptions.field}
      />
    ),
    [context, documentTypes, props.pluginOptions.field],
  )

  return (
    <PickerField
      canOpenPopover={!readOnly}
      readOnly={readOnly}
      onPathFocus={onPathFocus}
      onSelect={handleSelect}
      renderNavigator={renderNavigator}
      normalizeHref={normalizeAnchorHref}
      isBrowseValue={isBrowseValue}
      linkedDocumentId={context?.kind === 'linked' ? context._id : undefined}
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
 * What the anchor picker offers:
 * - inside a link that points at a document with sections, that document's sections;
 * - inside a link to a URL, or to a document without sections, only a custom `#fragment`;
 * - otherwise (a standalone field, or a link with no target or a `#hash`), every document with
 *   sections, the one being edited first.
 */
function useAnchorContext(path: Path, documentTypes: string[]): AnchorContext | null {
  // Only a field nested in an object can be part of a link
  const parentValue = useFormValue(path.length > 1 ? path.slice(0, -1) : ['_id'])
  const parent: ParentLinkValue | null =
    path.length > 1 && parentValue && typeof parentValue === 'object' ? parentValue : null
  const currentId = useFormValue(['_id'])
  const currentType = useFormValue(['_type'])

  const linkedId = parent?.reference?._ref
  const linkedType = useDocumentType(linkedId)
  const pointsElsewhere = Boolean(parent?.url && !parent.url.startsWith('#'))

  return useMemo<AnchorContext | null>(() => {
    if (linkedId) {
      if (linkedType === undefined) return {kind: 'loading'}
      return linkedType && documentTypes.includes(linkedType)
        ? {kind: 'linked', _id: linkedId, _type: linkedType}
        : {kind: 'fragment-only', reason: 'no-sections'}
    }
    if (pointsElsewhere) return {kind: 'fragment-only', reason: 'url'}
    if (typeof currentId !== 'string' || typeof currentType !== 'string') return null
    return {kind: 'current', _id: getPublishedDocumentId(currentId), _type: currentType}
  }, [currentId, currentType, documentTypes, linkedId, linkedType, pointsElsewhere])
}

/**
 * A document's type, live and in the current perspective: `undefined` while loading, `null` when
 * the document doesn't exist.
 */
function useDocumentType(documentId: string | undefined): string | null | undefined {
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

  if (!documentId) return null
  return resolved?.id === documentId ? resolved.type : undefined
}
