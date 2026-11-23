import {ChevronRightIcon} from '@sanity/icons/ChevronRight'
import {DocumentIcon} from '@sanity/icons/Document'
import {Box, Text} from '@sanity/ui'
import type React from 'react'
import {useEffect, useState} from 'react'
import {SanityDefaultPreview, useClient, usePerspective, useSchema, useTranslation} from 'sanity'

import {linkPickerLocaleNamespace} from './i18n'
import {API_VERSION, usePreviewTitle} from './navigator'

export type AnchorSummary = {
  sectionKey?: string
  title?: string
  slug?: string
  parentId?: string
  parentType?: string
}

const ANCHOR_SUMMARY_QUERY = `*[_id == $id][0]{
  title,
  "slug": slug.current,
  sectionKey,
  "parentId": parent._ref,
  "parentType": parent->_type
}`

/**
 * The anchor document's title, slug, section key and parent, in the current perspective.
 * `undefined` while loading (or without an id), `null` when the anchor doesn't exist.
 */
export function useAnchorSummary(anchorId: string | undefined): AnchorSummary | null | undefined {
  const client = useClient({apiVersion: API_VERSION})
  const {perspectiveStack} = usePerspective()
  const [resolved, setResolved] = useState<{id: string; summary: AnchorSummary | null} | null>(null)

  useEffect(() => {
    if (!anchorId) return undefined
    const subscription = client.observable
      .fetch<AnchorSummary | null>(
        ANCHOR_SUMMARY_QUERY,
        {id: anchorId},
        {perspective: perspectiveStack, tag: 'link-picker.anchor'},
      )
      .subscribe({
        next: (summary) => setResolved({id: anchorId, summary}),
        error: () => setResolved({id: anchorId, summary: null}),
      })
    return () => subscription.unsubscribe()
  }, [anchorId, client, perspectiveStack])

  // undefined while loading, null when the anchor doesn't exist
  return anchorId && resolved?.id === anchorId ? resolved.summary : undefined
}

const MUTED: React.CSSProperties = {color: 'var(--card-muted-fg-color)'}

const SEPARATOR: React.CSSProperties = {...MUTED, margin: '0 0.25em', verticalAlign: '-0.15em'}

/**
 * A selected section shown as a breadcrumb: `[page icon] Page › Section #slug`.
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

  const sectionLabel = (
    <>
      {summary.title || t('anchor.untitled')}
      {summary.slug ? <span style={{...MUTED, marginLeft: '0.5em'}}>#{summary.slug}</span> : null}
    </>
  )

  if (linkedDocumentId && summary.parentId === linkedDocumentId) {
    return (
      <Box style={{width: '100%'}}>
        <SanityDefaultPreview icon={false} layout="compact" title={<span>{sectionLabel}</span>} />
      </Box>
    )
  }

  // Rendered as Studio's compact preview so it lines up with other references; the breadcrumb
  // is one line of inline text that truncates as a whole
  return (
    <Box style={{width: '100%'}}>
      <SanityDefaultPreview
        layout="compact"
        icon={parentSchemaType?.icon ?? DocumentIcon}
        title={
          <span title={summary.slug ? `#${summary.slug}` : undefined}>
            <span style={MUTED}>{parentTitle || t('anchor.untitled')}</span>
            <span style={SEPARATOR}>
              <ChevronRightIcon />
            </span>
            {sectionLabel}
          </span>
        }
      />
    </Box>
  )
}
