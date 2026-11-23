import {ChevronRightIcon} from '@sanity/icons/ChevronRight'
import {Box, Flex, Text} from '@sanity/ui'
import React, {useEffect, useState} from 'react'
import {SanityDefaultPreview, useClient, usePerspective, useSchema, useTranslation} from 'sanity'

import {linkPickerLocaleNamespace} from './i18n'
import {API_VERSION, usePreviewTitle} from './navigator'

type AnchorSummary = {
  title?: string
  slug?: string
  parentId?: string
  parentType?: string
}

const ANCHOR_SUMMARY_QUERY = `*[_id == $id][0]{
  title,
  "slug": slug.current,
  "parentId": parent._ref,
  "parentType": parent->_type
}`

/** The anchor document's title, slug and parent, in the current perspective. */
function useAnchorSummary(anchorId: string): AnchorSummary | null | undefined {
  const client = useClient({apiVersion: API_VERSION})
  const {perspectiveStack} = usePerspective()
  const [resolved, setResolved] = useState<{id: string; summary: AnchorSummary | null} | null>(null)

  useEffect(() => {
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
  return resolved?.id === anchorId ? resolved.summary : undefined
}

/**
 * A selected section shown as a breadcrumb: `[page icon] Page › Section #slug`.
 */
export function AnchorBreadcrumb({anchorId}: {anchorId: string}) {
  const {t} = useTranslation(linkPickerLocaleNamespace)
  const schema = useSchema()
  const {perspectiveStack} = usePerspective()
  const summary = useAnchorSummary(anchorId)
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

  const ParentIcon = parentSchemaType?.icon

  return (
    <Flex align="center" gap={2} paddingX={2} style={{minWidth: 0, width: '100%'}}>
      {ParentIcon ? (
        <Text muted size={1}>
          {React.createElement(ParentIcon)}
        </Text>
      ) : null}
      <Box style={{flexShrink: 2, minWidth: 0}}>
        <Text muted size={1} textOverflow="ellipsis">
          {parentTitle || t('anchor.untitled')}
        </Text>
      </Box>
      <Text muted size={1}>
        <ChevronRightIcon />
      </Text>
      <Box style={{flexShrink: 1, minWidth: 0}}>
        <Text size={1} textOverflow="ellipsis" weight="medium">
          {summary.title || t('anchor.untitled')}
        </Text>
      </Box>
      {summary.slug ? (
        <Box style={{flexShrink: 3, minWidth: 0}}>
          <Text muted size={1} textOverflow="ellipsis">
            #{summary.slug}
          </Text>
        </Box>
      ) : null}
    </Flex>
  )
}
