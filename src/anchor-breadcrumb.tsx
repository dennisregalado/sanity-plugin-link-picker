import {ChevronRightIcon} from '@sanity/icons/ChevronRight'
import {HashIcon} from '@sanity/icons/Hash'
import {Box, Text} from '@sanity/ui'
import type React from 'react'
import {useEffect, useState} from 'react'
import {SanityDefaultPreview, useClient, usePerspective, useSchema, useTranslation} from 'sanity'

import {linkPickerLocaleNamespace} from './i18n'
import {API_VERSION, usePreviewTitle} from './navigator'
import {getSectionFields, useSectionPreview} from './section-preview'

export type AnchorSummary = {
  sectionKey?: string
  title?: string
  slug?: string
  parentId?: string
  parentType?: string
  /** The section object on its page */
  section?: unknown
  sectionsField?: string
}

function getAnchorSummaryQuery(sectionsField: string | undefined): string {
  return `*[_id == $id][0]{
    title,
    "slug": slug.current,
    sectionKey,
    "parentId": parent._ref,
    ${getSectionFields(sectionsField)}
  }`
}

/**
 * The anchor document's title, slug, section key and parent, in the current perspective.
 * `undefined` while loading (or without an id), `null` when the anchor doesn't exist.
 */
export function useAnchorSummary(
  anchorId: string | undefined,
  sectionsField?: string,
): AnchorSummary | null | undefined {
  const client = useClient({apiVersion: API_VERSION})
  const {perspectiveStack} = usePerspective()
  const [resolved, setResolved] = useState<{id: string; summary: AnchorSummary | null} | null>(null)

  useEffect(() => {
    if (!anchorId) return undefined
    const subscription = client.observable
      .fetch<AnchorSummary | null>(
        getAnchorSummaryQuery(sectionsField),
        {id: anchorId},
        {perspective: perspectiveStack, tag: 'link-picker.anchor'},
      )
      .subscribe({
        next: (summary) => setResolved({id: anchorId, summary}),
        error: () => setResolved({id: anchorId, summary: null}),
      })
    return () => subscription.unsubscribe()
  }, [anchorId, client, perspectiveStack, sectionsField])

  // undefined while loading, null when the anchor doesn't exist
  return anchorId && resolved?.id === anchorId ? resolved.summary : undefined
}

const MUTED: React.CSSProperties = {color: 'var(--card-muted-fg-color)'}

const SEPARATOR: React.CSSProperties = {...MUTED, margin: '0 0.25em', verticalAlign: '-0.15em'}

/**
 * A selected section in one compact row: its section's icon and title, then `#slug`, preceded by
 * `Page ›` outside a link to that page.
 */
export function AnchorBreadcrumb({
  summary,
  linkedDocumentId,
}: {
  /** From {@link useAnchorSummary} */
  summary: AnchorSummary | null | undefined
  /**
   * The document the surrounding link points to. When the section is on it, the page name is
   * already shown next to the field, so only `Section #slug` is shown.
   */
  linkedDocumentId?: string
}) {
  const {t} = useTranslation(linkPickerLocaleNamespace)
  const schema = useSchema()
  const {perspectiveStack} = usePerspective()
  const parentSchemaType = summary?.parentType ? schema.get(summary.parentType) : undefined
  const parentTitle = usePreviewTitle(summary?.parentId, parentSchemaType, perspectiveStack)
  const {schemaType: sectionType, preview: sectionPreview} = useSectionPreview({
    section: summary?.section,
    parentType: summary?.parentType,
    sectionsField: summary?.sectionsField,
  })

  if (summary === undefined) {
    return (
      <Box style={{width: '100%'}}>
        <SanityDefaultPreview isPlaceholder layout="compact" />
      </Box>
    )
  }

  if (summary === null) {
    return (
      <Box paddingX={2}>
        <Text muted size={1}>
          {t('anchor.missing')}
        </Text>
      </Box>
    )
  }

  const hash = summary.slug ? `#${summary.slug}` : undefined
  const onLinkedPage = Boolean(linkedDocumentId && summary.parentId === linkedDocumentId)

  // One compact row, like other references: the section's own icon and title, then `#slug`.
  // Outside a link to the section's page, the page comes first: `Page › Section #slug`.
  return (
    <Box style={{width: '100%'}}>
      <SanityDefaultPreview
        icon={sectionType?.icon ?? HashIcon}
        layout="compact"
        media={sectionPreview?.media}
        title={
          <span title={hash}>
            {onLinkedPage ? null : (
              <>
                <span style={MUTED}>{parentTitle || t('anchor.untitled')}</span>
                <span style={SEPARATOR}>
                  <ChevronRightIcon />
                </span>
              </>
            )}
            {sectionPreview?.title || summary.title || t('anchor.untitled')}
            {hash ? <span style={{...MUTED, marginLeft: '0.5em'}}>{hash}</span> : null}
          </span>
        }
      />
    </Box>
  )
}
