import React, {type ComponentType} from 'react'
import {
  type FormPatch,
  getPublishedId,
  type InputProps,
  type ObjectInputProps,
  type ObjectMember,
  type SchemaType,
  set,
  setIfMissing,
  unset,
  useClient,
} from 'sanity'
import {Button, Text, Flex, Grid, useClickOutsideEvent, Box, Card} from '@sanity/ui'
import {Popover} from '@sanity/ui/popover'
import {Tooltip} from '@sanity/ui/tooltip'
import {CloseIcon} from '@sanity/icons/Close'
import {EditIcon} from '@sanity/icons/Edit'
import {useState, useMemo, useRef, createContext, useContext, useEffect} from 'react'
import {
  VisualEditorNavigator,
  getFlattenedLinkRoutes,
  getReferenceTypesFromRoutes,
  getReferenceTypesFromSchemaType,
  getSystemLinkIcon,
  normalizeLinkIcon,
  normalizeLinkHref,
} from './navigator'
import {SanityDefaultPreview, SearchResultItemPreview, usePerspective} from 'sanity'
import {usePaneRouter} from 'sanity/structure'
import type {LinkInputProps} from './types'
import type {LinkRouteDefinition, LinksPluginProps, StaticLinkRoute} from './navigator'
const SmallEditIcon = (props: React.ComponentProps<typeof EditIcon>) => (
  <EditIcon {...props} style={{...props.style, display: 'block'}} />
)
const sanityApiVersion = '2025-02-27'
type RouteConfig = LinkRouteDefinition[] | LinksPluginProps | undefined

function resolveRoutes(routes: RouteConfig): LinkRouteDefinition[] {
  if (!routes) {
    return []
  }

  return Array.isArray(routes) ? routes : routes.routes
}

const BUILT_IN_FIELD_NAMES = new Set(['label', 'url', 'reference'])

/** Field name a member belongs to, including `error` members for invalid field values. */
function getMemberFieldName(member: ObjectMember): string | undefined {
  if (member.kind === 'field') return member.name
  if (member.kind === 'error') return member.fieldName
  return undefined
}

function withInputComponent(member: ObjectMember, input: ComponentType<InputProps>): ObjectMember {
  if (member.kind !== 'field') {
    return member
  }

  return {
    ...member,
    field: {
      ...member.field,
      schemaType: {
        ...member.field.schemaType,
        components: {input},
      },
    },
  } as ObjectMember
}

const LinkContext = createContext<{
  onChange: ObjectInputProps['onChange']
  openPopover: () => void
  closePopover: () => void
  canOpenPopover: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
  flattenedRoutes: StaticLinkRoute[]
  replaceReference?: (inputProps: InputProps) => void
} | null>(null)

export function LinkInput(props: LinkInputProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const routes = resolveRoutes(props.schemaType.options?.routes || props.pluginOptions?.routes)
  const menu = useMemo(() => ({routes}), [routes])
  const flattenedRoutes = useMemo(() => getFlattenedLinkRoutes(menu.routes), [menu])
  const linkReferenceTypes = useMemo(() => getReferenceTypesFromRoutes(menu.routes), [menu])
  const canOpenPopover =
    !props.readOnly && (flattenedRoutes.length > 0 || linkReferenceTypes.length > 0)

  useClickOutsideEvent(
    () => {
      if (popoverOpen) {
        setPopoverOpen(false)
      }
    },
    () => [popoverRef.current, containerRef.current],
  )

  const hasReference = useMemo(() => {
    return Boolean((props.value as {reference?: unknown} | undefined)?.reference)
  }, [props.value])

  const referenceTypes = useMemo(() => {
    const schemaReferenceTypes = getReferenceTypesFromSchemaType(props.schemaType)
    return schemaReferenceTypes.length ? schemaReferenceTypes : linkReferenceTypes
  }, [linkReferenceTypes, props.schemaType])

  const labelField = useMemo(() => {
    return props.members.filter((member) => getMemberFieldName(member) === 'label')
  }, [props.members])

  const referenceField = useMemo(() => {
    return props.members
      .filter((member) => getMemberFieldName(member) === 'reference')
      .map((member) => withInputComponent(member, ReferencePreviewInput))
  }, [props.members])

  const urlField = useMemo(() => {
    return props.members
      .filter((member) => getMemberFieldName(member) === 'url')
      .map((member) => withInputComponent(member, URLInput))
  }, [props.members])

  // Fields added through `linkPicker(routes, {fields})`, plus any fieldsets/decorations.
  const extraMembers = useMemo(() => {
    return props.members.filter((member) => {
      const fieldName = getMemberFieldName(member)
      return !fieldName || !BUILT_IN_FIELD_NAMES.has(fieldName)
    })
  }, [props.members])

  return (
    <LinkContext.Provider
      value={{
        onChange: props.onChange,
        openPopover: () => {
          if (canOpenPopover) setPopoverOpen(true)
        },
        closePopover: () => {
          setPopoverOpen(false)
          setSearchQuery('')
        },
        canOpenPopover,
        searchQuery,
        setSearchQuery,
        flattenedRoutes,
        replaceReference: (inputProps) => {
          if (props.readOnly || inputProps.readOnly) return
          inputProps.onChange(unset())
          setSearchQuery('')
          if (canOpenPopover) setPopoverOpen(true)
          props.onPathFocus?.(['url'])
        },
      }}
    >
      <Popover
        referenceElement={containerRef.current}
        portal
        matchReferenceWidth
        content={
          <Box
            ref={popoverRef}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
          >
            <VisualEditorNavigator
              {...menu}
              referenceTypes={referenceTypes}
              searchQuery={searchQuery}
              onClose={() => {
                setSearchQuery('')
                setPopoverOpen(false)
              }}
              onSelect={(selected) => {
                if (props.readOnly) return

                // Patch individual fields rather than replacing the whole object, so that
                // custom `fields`, the array `_key` and concurrent edits are preserved.
                const patches: FormPatch[] = [setIfMissing({_type: props.schemaType.name})]

                if (selected.label) {
                  patches.push(set(selected.label, ['label']))
                }

                if (selected._id) {
                  patches.push(
                    set(
                      {
                        _type: 'reference',
                        // Search hits can be draft (`drafts.`) or release (`versions.`) ids;
                        // references must always point at the published id.
                        _ref: getPublishedId(selected._id),
                        _weak: true,
                      },
                      ['reference'],
                    ),
                    unset(['url']),
                  )
                } else if (selected.href) {
                  patches.push(set(selected.href, ['url']), unset(['reference']))
                }

                props.onChange(patches)
                setSearchQuery('')
                setPopoverOpen(false)
              }}
            />
          </Box>
        }
        padding={0}
        placement="top"
        animate
        open={canOpenPopover && popoverOpen}
      />
      <Grid gridTemplateColumns={2} gapX={1} gapY={3}>
        <Box>
          {props.renderDefault({
            ...props,
            members: labelField,
          })}
        </Box>
        <Box ref={containerRef}>
          {hasReference
            ? props.renderDefault({
                ...props,
                members: referenceField,
              })
            : props.renderDefault({
                ...props,
                members: urlField,
              })}
        </Box>
        {extraMembers.length > 0 ? (
          <Box gridColumn="full">
            {props.renderDefault({
              ...props,
              members: extraMembers,
            })}
          </Box>
        ) : null}
      </Grid>
    </LinkContext.Provider>
  )
}

function ReferencePreviewInput(props: InputProps) {
  const linkContext = useContext(LinkContext)
  const client = useClient({apiVersion: sanityApiVersion})
  const perspective = usePerspective()
  const {ReferenceChildLink, groupIndex, routerPanesState} = usePaneRouter()
  const documentId = (props.value as {_ref?: string} | undefined)?._ref
  const referenceSchemaType = props.schemaType as typeof props.schemaType & {
    to?: SchemaType[]
  }
  const allowedTypes = referenceSchemaType.to || []
  const allowedTypeNames = allowedTypes
    .map((type) => type.name)
    .filter(Boolean)
    .join('|')
  const [documentType, setDocumentType] = useState<string | null>(
    allowedTypes.length === 1 && allowedTypes[0]?.name ? allowedTypes[0].name : null,
  )
  const refType = documentType
    ? allowedTypes.find((toType) => toType.name === documentType)
    : undefined
  const linkTarget =
    documentId && documentType && refType ? {documentId, documentType, refType} : null
  const referencePaneOpen = linkTarget
    ? isReferencePaneOpen(routerPanesState, groupIndex, linkTarget)
    : false
  const preview = linkTarget ? (
    <SearchResultItemPreview
      documentId={linkTarget.documentId}
      documentType={linkTarget.documentType}
      layout="compact"
      perspective={perspective.perspectiveStack}
      schemaType={linkTarget.refType}
      showBadge={false}
    />
  ) : documentId ? (
    <Box style={{width: '100%'}}>
      <SanityDefaultPreview isPlaceholder layout="compact" />
    </Box>
  ) : null

  useEffect(() => {
    if (!documentId) {
      setDocumentType(null)
      return
    }

    if (allowedTypes.length === 1 && allowedTypes[0]?.name) {
      setDocumentType(allowedTypes[0].name)
      return
    }

    let cancelled = false

    client
      .fetch<string | null>('*[_id == $documentId][0]._type', {documentId})
      .then((type) => {
        if (!cancelled) setDocumentType(type)
      })
      .catch(() => {
        if (!cancelled) setDocumentType(null)
      })

    return () => {
      cancelled = true
    }
  }, [allowedTypeNames, client, documentId])

  return (
    <Card border radius={2} overflow="hidden">
      <Flex align="center" style={{height: 33}}>
        <Box flex={1} style={{minWidth: 0}}>
          {linkTarget ? (
            <ReferenceChildLink
              documentId={linkTarget.documentId}
              documentType={linkTarget.documentType}
              parentRefPath={props.path}
            >
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
            </ReferenceChildLink>
          ) : (
            <Button
              disabled
              mode="bleed"
              padding={0}
              width="fill"
              style={{clipPath: 'inset(3px round 2px)'}}
            >
              {preview}
            </Button>
          )}
        </Box>
        <Tooltip
          animate
          content={
            <Text size={1} weight="medium">
              Replace reference
            </Text>
          }
          placement="top"
        >
          <Button
            style={{clipPath: 'inset(3px round 2px)'}}
            disabled={props.readOnly}
            icon={EditIcon}
            mode="bleed"
            onClick={() => linkContext?.replaceReference?.(props)}
          />
        </Tooltip>
      </Flex>
    </Card>
  )
}

function isReferencePaneOpen(
  routerPanesState: unknown,
  groupIndex: number,
  target: {
    documentId: string
    documentType: string
  },
) {
  const nextPaneGroup = Array.isArray(routerPanesState) ? routerPanesState[groupIndex + 1] : null
  const siblings = Array.isArray(nextPaneGroup)
    ? nextPaneGroup
    : nextPaneGroup
      ? [nextPaneGroup]
      : []

  return siblings.some((sibling) => {
    const pane = sibling as {
      id?: string
      params?: {
        id?: string
        type?: string
      }
      payload?: {
        id?: string
        type?: string
      }
    }
    const id = pane.id || pane.params?.id || pane.payload?.id
    const type = pane.params?.type || pane.payload?.type

    return id === target.documentId && (!type || type === target.documentType)
  })
}

function URLInput(props: InputProps) {
  const linkContext = useContext(LinkContext)
  const [draftValue, setDraftValue] = useState(typeof props.value === 'string' ? props.value : '')
  const [isFocused, setFocused] = useState(false)
  const previousValueRef = useRef(typeof props.value === 'string' ? props.value : '')
  const flattenedItems = linkContext?.flattenedRoutes || []
  const matchedMenuItem = useMemo(() => {
    if (!draftValue) return null
    return flattenedItems.find((item) => item.path === draftValue)
  }, [draftValue, flattenedItems])

  useEffect(() => {
    const nextValue = typeof props.value === 'string' ? props.value : ''
    const valueChanged = previousValueRef.current !== nextValue

    previousValueRef.current = nextValue

    if (
      !isFocused ||
      (valueChanged && (!linkContext?.searchQuery || normalizeLinkHref(draftValue) === nextValue))
    ) {
      setDraftValue(nextValue)
    }
  }, [draftValue, isFocused, linkContext?.searchQuery, props.value])

  if (!linkContext) {
    throw new Error('URLInput must be used within LinkContext')
  }

  const commitDraftValue = () => {
    const nextValue = draftValue.trim()
    const nextHref = normalizeLinkHref(nextValue) || nextValue
    const currentValue = typeof props.value === 'string' ? props.value : ''

    linkContext.setSearchQuery('')

    if (nextHref === currentValue) {
      return
    }

    props.onChange(nextValue ? set(nextHref) : set(null))
  }

  function getIcon() {
    const normalizedHref = normalizeLinkHref(draftValue)
    const matchedRoute = normalizedHref
      ? flattenedItems.find((item) => item.path === normalizedHref)
      : null

    if (matchedRoute?.icon) {
      return normalizeLinkIcon(matchedRoute.icon, {shift: true})?.()
    }

    if (normalizedHref) {
      return getSystemLinkIcon(normalizedHref, {shift: true})()
    }

    return undefined
  }

  return props.renderDefault({
    ...props,
    elementProps: {
      ...(props.elementProps as any),
      icon: getIcon(),
      value: draftValue,
      clearButton:
        draftValue && !props.readOnly
          ? {
              icon: isValidLink(draftValue) ? SmallEditIcon : CloseIcon,
            }
          : false,
      onBlur: (event: any) => {
        props.elementProps?.onBlur?.(event)
        setFocused(false)
        commitDraftValue()
      },
      onChange: (event: any) => {
        const nextValue = event.currentTarget.value
        setDraftValue(nextValue)
        if (linkContext.canOpenPopover) {
          linkContext.setSearchQuery(nextValue)
        }
      },
      onClear: () => {
        if (props.readOnly) return
        linkContext.closePopover()
        setDraftValue('')
        linkContext.setSearchQuery('')
        props.onChange(set(null))
      },
      onKeyDown: (event: any) => {
        ;(props.elementProps as any)?.onKeyDown?.(event)

        if (event.key === 'Enter') {
          event.preventDefault()
          commitDraftValue()
          linkContext.closePopover()
        }
      },
      onFocus: () => {
        setFocused(true)
        if (!linkContext.canOpenPopover || props.readOnly) {
          return
        }

        const normalizedHref = normalizeLinkHref(draftValue)
        const isSavedHref = normalizedHref === draftValue.trim()

        linkContext.setSearchQuery(matchedMenuItem || isSavedHref ? '' : draftValue)
        linkContext.openPopover()
      },
    } as any,
  })
}

export function isValidLink(url: string | null | undefined): boolean {
  return Boolean(normalizeLinkHref(url))
}
