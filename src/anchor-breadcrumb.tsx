import {ChevronRightIcon} from '@sanity/icons/ChevronRight'
import {DocumentIcon} from '@sanity/icons/Document'
import {HashIcon} from '@sanity/icons/Hash'
import {Box} from '@sanity/ui'
import type React from 'react'
import {useEffect, useState} from 'react'
import {SanityDefaultPreview, useClient, usePerspective, useSchema, useTranslation} from 'sanity'

import {API_VERSION} from './constants'
import {linkPickerLocaleNamespace} from './i18n'
import {MutedPreview, usePreviewTitle} from './navigator'
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

const ROW: React.CSSProperties = {
  alignItems: 'baseline',
  display: 'flex',
  gap: '0.5em',
  minWidth: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
}

/** Section and slug: a row of its own that doesn't shrink for the page. */
const GROUP: React.CSSProperties = {
  alignItems: 'baseline',
  display: 'flex',
  flexShrink: 0,
  gap: '0.5em',
  minWidth: 0,
  overflow: 'hidden',
}

/** A part of the path that truncates on its own. */
const PART: React.CSSProperties = {minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis'}

const SEPARATOR: React.CSSProperties = {
  ...MUTED,
  alignSelf: 'center',
  display: 'inline-flex',
  flexShrink: 0,
  margin: '0 -0.25em',
}

/**
 * A selected section as a one-line path: `[page] Page › Section #slug`, or `[section] Section #slug`
 * inside a link to that page. Long paths shrink the page first and the section last.
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
      <Box style={{width: '100%'}}>
        <MutedPreview>{t('anchor.missing')}</MutedPreview>
      </Box>
    )
  }

  const hash = summary.slug ? `#${summary.slug}` : undefined
  const onLinkedPage = Boolean(linkedDocumentId && summary.parentId === linkedDocumentId)
  const sectionTitle = sectionPreview?.title || summary.title || t('anchor.untitled')

  // One line that never wraps. Full path when it fits; when it doesn't, the page shrinks first
  // (down to "…"), then the slug, and last the section, the part that was picked.
  // The icon marks the start of the path: the page's, or the section's inside a link to its page.
  return (
    <Box style={{width: '100%'}}>
      <SanityDefaultPreview
        icon={
          onLinkedPage ? (sectionType?.icon ?? HashIcon) : (parentSchemaType?.icon ?? DocumentIcon)
        }
        layout="compact"
        media={onLinkedPage ? sectionPreview?.media : undefined}
        title={
          <span
            style={ROW}
            title={[onLinkedPage ? null : parentTitle, sectionTitle, hash]
              .filter(Boolean)
              .join(' › ')}
          >
            {onLinkedPage ? null : (
              <>
                <span style={{...PART, ...MUTED, flexShrink: 1, minWidth: '1.5em'}}>
                  {parentTitle || t('anchor.untitled')}
                </span>
                <span style={SEPARATOR}>
                  <ChevronRightIcon />
                </span>
              </>
            )}
            {/* Section and slug never shrink for the page. The group is capped so the page keeps
                room for "…", and only then does the slug, and last the section, truncate. */}
            <span style={{...GROUP, maxWidth: onLinkedPage ? '100%' : 'calc(100% - 3em)'}}>
              <span style={{...PART, flexShrink: 0, maxWidth: '100%'}}>{sectionTitle}</span>
              {hash ? <span style={{...PART, ...MUTED, flexShrink: 1}}>{hash}</span> : null}
            </span>
          </span>
        }
      />
    </Box>
  )
}
