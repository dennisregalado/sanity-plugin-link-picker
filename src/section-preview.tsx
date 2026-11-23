import {HashIcon} from '@sanity/icons/Hash'
import type React from 'react'
import {useEffect, useMemo, useState} from 'react'
import {
  type PreviewValue,
  SanityDefaultPreview,
  type SchemaType,
  useDocumentPreviewStore,
  usePerspective,
  useSchema,
} from 'sanity'

import {DEFAULT_SECTIONS_FIELD} from './anchors'

// The sections field name is interpolated into GROQ, so only allow plain identifiers
const SAFE_FIELD = /^[A-Za-z_]\w*$/

/** A section object as stored on its page. */
export type SectionValue = {_key?: string; _type: string; [field: string]: unknown}

/** The configured sections field, or `sections` when it isn't a plain identifier. */
export function getSectionsField(field: string | undefined): string {
  return field && SAFE_FIELD.test(field) ? field : DEFAULT_SECTIONS_FIELD
}

/**
 * GROQ for a section anchor's section object, looked up on its page so it's always current:
 * `parent->sections[_key == ^.sectionKey][0]`.
 */
export function getSectionExpression(field: string | undefined): string {
  return `parent->${getSectionsField(field)}[_key == ^.sectionKey][0]`
}

/**
 * GROQ fields that describe a section anchor's section: the section object, its page's type and
 * the sections field name, which together resolve the section's schema type.
 */
export function getSectionFields(field: string | undefined): string {
  return [
    `"section": ${getSectionExpression(field)}`,
    '"parentType": parent->_type',
    `"sectionsField": ${JSON.stringify(getSectionsField(field))}`,
  ].join(', ')
}

/** Projection for `sectionAnchor` rows in the picker. */
export function getSectionAnchorProjection(field: string | undefined): string {
  return `{_id, _type, _originalId, title, "slug": slug.current, ${getSectionFields(field)}}`
}

/** Where a section lives, to find its schema type. */
export type SectionSource = {
  /** The section object on its page */
  section?: unknown
  /** The page's document type */
  parentType?: string
  /** The page's sections array field */
  sectionsField?: string
}

/**
 * A section's schema type. Section types are often declared inline in the page's sections array
 * (`of: [{name: 'hero', type: 'object', ...}]`), where `schema.get()` can't see them, so the
 * array's own member types are checked first.
 */
function resolveSectionType(
  schema: ReturnType<typeof useSchema>,
  sectionType: string,
  parentType: string | undefined,
  sectionsField: string | undefined,
): SchemaType | undefined {
  const parent = parentType ? schema.get(parentType) : undefined
  const arrayType =
    parent && 'fields' in parent
      ? parent.fields.find((field) => field.name === getSectionsField(sectionsField))?.type
      : undefined
  const member =
    arrayType && 'of' in arrayType && Array.isArray(arrayType.of)
      ? arrayType.of.find((type: SchemaType) => type.name === sectionType)
      : undefined
  return member ?? schema.get(sectionType)
}

function isSectionValue(value: unknown): value is SectionValue {
  return Boolean(
    value && typeof value === 'object' && '_type' in value && typeof value._type === 'string',
  )
}

/**
 * A section's own preview (its type's `preview.select`/`prepare`, or Studio's default), the same
 * one its page's sections list shows. Falls back to the type's icon for media.
 */
export function useSectionPreview({section, parentType, sectionsField}: SectionSource): {
  schemaType: SchemaType | undefined
  preview: PreviewValue | null | undefined
} {
  const schema = useSchema()
  const documentPreviewStore = useDocumentPreviewStore()
  const {perspectiveStack} = usePerspective()
  const value = isSectionValue(section) ? section : undefined
  const schemaType = useMemo(
    () => (value ? resolveSectionType(schema, value._type, parentType, sectionsField) : undefined),
    [parentType, schema, sectionsField, value],
  )
  const [resolved, setResolved] = useState<{
    value: SectionValue
    preview: PreviewValue | null | undefined
  } | null>(null)

  useEffect(() => {
    if (!value || !schemaType) return undefined
    const subscription = documentPreviewStore
      .observeForPreview(value, schemaType, {perspective: perspectiveStack})
      .subscribe(({snapshot}) => setResolved({value, preview: snapshot}))
    return () => subscription.unsubscribe()
  }, [documentPreviewStore, perspectiveStack, schemaType, value])

  return {schemaType, preview: resolved && resolved.value === value ? resolved.preview : undefined}
}

type SectionPreviewProps = SectionSource & {
  /** The anchor's heading, used until the section's preview resolves */
  title?: string
  /** The anchor's slug, shown as `#slug` */
  slug?: string
  /** Replaces the `#slug` subtitle */
  subtitle?: React.ReactNode
  layout?: 'default' | 'compact'
}

/**
 * A section shown like its page's sections list shows it: same media and title, with `#slug`
 * as the subtitle.
 */
export function SectionPreview({
  section,
  parentType,
  sectionsField,
  title,
  slug,
  subtitle,
  layout = 'default',
}: SectionPreviewProps) {
  const {schemaType, preview} = useSectionPreview({section, parentType, sectionsField})
  return (
    <SanityDefaultPreview
      // The section's own media, else its type's icon (as its sections list shows), else `#`
      icon={schemaType?.icon ?? HashIcon}
      layout={layout}
      media={preview?.media}
      subtitle={subtitle ?? (slug ? `#${slug}` : undefined)}
      title={preview?.title || title}
    />
  )
}
