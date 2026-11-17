import {CloseIcon} from '@sanity/icons/Close'
import {EditIcon} from '@sanity/icons/Edit'
import {Box, Button, Card, Flex, Grid, Stack, Text, useClickOutsideEvent} from '@sanity/ui'
import {Popover} from '@sanity/ui/popover'
import {Tooltip} from '@sanity/ui/tooltip'
import {
  type ComponentProps,
  type ComponentType,
  createContext,
  type FocusEvent,
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type InputProps,
  type ObjectMember,
  type ReferenceSchemaType,
  type ReferenceValue,
  SanityDefaultPreview,
  type SchemaType,
  SearchResultItemPreview,
  set,
  type StringInputProps,
  unset,
  useDocumentPreviewStore,
  usePerspective,
  useTranslation,
} from 'sanity'
import {type RouterPanes, usePaneRouter} from 'sanity/structure'

import {normalizeLinkHref} from './href'
import {linkPickerLocaleNamespace} from './i18n'
import {VisualEditorNavigator, getSystemLinkIcon, normalizeLinkIcon} from './navigator'
import {buildSelectionPatches, type LinkSelection} from './patches'
import {
  applyReferenceTypes,
  getFlattenedLinkRoutes,
  getReferenceTypesFromRoutes,
  getReferenceTypesFromSchemaType,
  isProduction,
  type LinkRouteDefinition,
  type LinksPluginProps,
  type StaticLinkRoute,
} from './routes'
import type {LinkInputProps} from './types'

const SmallEditIcon = (props: ComponentProps<typeof EditIcon>) => (
  <EditIcon {...props} style={{...props.style, display: 'block'}} />
)

type RouteConfig = LinkRouteDefinition[] | LinksPluginProps | undefined

const NO_ROUTES: LinkRouteDefinition[] = []

const NO_TYPES: SchemaType[] = []

function resolveRoutes(routes: RouteConfig): LinkRouteDefinition[] {
  if (!routes) {
    return NO_ROUTES
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
  }
}

type LinkContextValue = {
  openPopover: () => void
  closePopover: () => void
  canOpenPopover: boolean
  popoverOpen: boolean
  popoverId: string
  searchQuery: string
  setSearchQuery: (query: string) => void
  flattenedRoutes: StaticLinkRoute[]
  replaceReference: (inputProps: InputProps) => void
}

const LinkContext = createContext<LinkContextValue | null>(null)

function useLinkContext(): LinkContextValue {
  const context = useContext(LinkContext)
  if (!context) {
    throw new Error('Link picker inputs must be rendered inside LinkInput')
  }
  return context
}

export function LinkInput(props: LinkInputProps) {
  const {members, onChange, onPathFocus, readOnly, renderDefault, schemaType, value} = props
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [anchorElement, setAnchorElement] = useState<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()

  const routeConfig = schemaType.options?.routes || props.pluginOptions?.routes
  const configuredRoutes = useMemo(() => resolveRoutes(routeConfig), [routeConfig])

  // Only offer document folders the schema's `reference` field can store. A field-level route
  // for an undeclared type would otherwise write a `reference` the schema doesn't accept.
  const schemaReferenceTypes = useMemo(
    () => getReferenceTypesFromSchemaType(schemaType),
    [schemaType],
  )
  const routes = useMemo(
    () => applyReferenceTypes(configuredRoutes, schemaReferenceTypes),
    [configuredRoutes, schemaReferenceTypes],
  )
  useWarnAboutUndeclaredDocumentTypes(configuredRoutes, schemaReferenceTypes)

  const flattenedRoutes = useMemo(() => getFlattenedLinkRoutes(routes), [routes])
  const hasDocumentRoutes = useMemo(() => getReferenceTypesFromRoutes(routes).length > 0, [routes])
  const canOpenPopover = !readOnly && (flattenedRoutes.length > 0 || hasDocumentRoutes)

  useClickOutsideEvent(
    () => {
      if (popoverOpen) {
        setPopoverOpen(false)
      }
    },
    () => [popoverRef.current, anchorElement],
  )

  const hasReference = Boolean(value?.reference)

  const labelField = useMemo(() => {
    return members.filter((member) => getMemberFieldName(member) === 'label')
  }, [members])

  const referenceField = useMemo(() => {
    return members
      .filter((member) => getMemberFieldName(member) === 'reference')
      .map((member) => withInputComponent(member, ReferencePreviewInput))
  }, [members])

  const urlField = useMemo(() => {
    return members
      .filter((member) => getMemberFieldName(member) === 'url')
      .map((member) => withInputComponent(member, URLInputComponent))
  }, [members])

  // Fields added through `linkPicker(routes, {fields})`, plus any fieldsets/decorations.
  const extraMembers = useMemo(() => {
    return members.filter((member) => {
      const fieldName = getMemberFieldName(member)
      return !fieldName || !BUILT_IN_FIELD_NAMES.has(fieldName)
    })
  }, [members])

  const openPopover = useCallback(() => {
    if (canOpenPopover) setPopoverOpen(true)
  }, [canOpenPopover])

  const closePopover = useCallback(() => {
    setPopoverOpen(false)
    setSearchQuery('')
  }, [])

  const replaceReference = useCallback(
    (inputProps: InputProps) => {
      if (readOnly || inputProps.readOnly) return
      inputProps.onChange(unset())
      setSearchQuery('')
      if (canOpenPopover) setPopoverOpen(true)
      onPathFocus(['url'])
    },
    [canOpenPopover, onPathFocus, readOnly],
  )

  const handleSelect = useCallback(
    (selected: LinkSelection) => {
      if (readOnly) return
      onChange(buildSelectionPatches(schemaType.name, selected))
      closePopover()
    },
    [closePopover, onChange, readOnly, schemaType.name],
  )

  const preventBlur = useCallback((event: {preventDefault: () => void}) => {
    // Keep focus in the URL input while clicking inside the picker
    event.preventDefault()
  }, [])

  const contextValue = useMemo<LinkContextValue>(
    () => ({
      openPopover,
      closePopover,
      canOpenPopover,
      popoverOpen,
      popoverId,
      searchQuery,
      setSearchQuery,
      flattenedRoutes,
      replaceReference,
    }),
    [
      canOpenPopover,
      closePopover,
      flattenedRoutes,
      openPopover,
      popoverId,
      popoverOpen,
      replaceReference,
      searchQuery,
    ],
  )

  return (
    <LinkContext.Provider value={contextValue}>
      <Popover
        referenceElement={anchorElement}
        portal
        matchReferenceWidth
        content={
          <Box id={popoverId} ref={popoverRef} onMouseDown={preventBlur}>
            <VisualEditorNavigator
              routes={routes}
              searchQuery={searchQuery}
              onClose={closePopover}
              onSelect={handleSelect}
            />
          </Box>
        }
        padding={0}
        placement="top"
        animate
        open={canOpenPopover && popoverOpen}
      />
      <Stack gap={6}>
        <Grid gridTemplateColumns={2} gapX={1} gapY={3}>
          <Box>
            {renderDefault({
              ...props,
              members: labelField,
            })}
          </Box>
          <Box ref={setAnchorElement}>
            {renderDefault({
              ...props,
              members: hasReference ? referenceField : urlField,
            })}
          </Box>
        </Grid>
        {/* Same spacing Studio uses between fields */}
        {extraMembers.length > 0
          ? renderDefault({
              ...props,
              members: extraMembers,
            })
          : null}
      </Stack>
    </LinkContext.Provider>
  )
}

const warnedConfigs = new WeakSet<LinkRouteDefinition[]>()

/** Development warning for document folders the field's schema can't store. */
function useWarnAboutUndeclaredDocumentTypes(
  routes: LinkRouteDefinition[],
  schemaReferenceTypes: string[],
) {
  useEffect(() => {
    if (isProduction() || warnedConfigs.has(routes)) return
    const undeclared = getReferenceTypesFromRoutes(routes).filter(
      (type) => !schemaReferenceTypes.includes(type),
    )
    if (undeclared.length === 0) return
    warnedConfigs.add(routes)
    console.warn(
      `[sanity-plugin-link-picker] Hiding document routes for ${undeclared.map((type) => `"${type}"`).join(', ')}: ` +
        'pass them to linkPicker() so the link schema can reference them.',
    )
  }, [routes, schemaReferenceTypes])
}

function isReferenceType(schemaType: SchemaType): schemaType is ReferenceSchemaType {
  return 'to' in schemaType && Array.isArray(schemaType.to)
}

/** Resolves the referenced document's type, live and in the current perspective. */
function useReferencedDocumentType(
  documentId: string | undefined,
  allowedTypes: SchemaType[],
): string | null {
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
  return resolved?.id === documentId ? resolved.type : null
}

function ReferencePreviewInput(props: InputProps) {
  const linkContext = useLinkContext()
  const {t} = useTranslation(linkPickerLocaleNamespace)
  const perspective = usePerspective()
  const {ReferenceChildLink, groupIndex, groupLength, routerPanesState} = usePaneRouter()
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
  const referencePaneOpen =
    linkTarget && hasPaneRouter
      ? isReferencePaneOpen(routerPanesState, groupIndex, linkTarget)
      : false

  let preview = null
  if (linkTarget) {
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
  if (linkTarget && hasPaneRouter) {
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

function URLInputComponent(props: InputProps) {
  // The `url` field is always a string field
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return <URLInput {...(props as StringInputProps)} />
}

function URLInput(props: StringInputProps) {
  const linkContext = useLinkContext()
  const {elementProps, onChange, readOnly, renderDefault, value} = props
  const savedValue = typeof value === 'string' ? value : ''
  const [draftValue, setDraftValue] = useState(savedValue)
  const [isFocused, setFocused] = useState(false)
  const [previousValue, setPreviousValue] = useState(savedValue)
  const {flattenedRoutes} = linkContext

  // Follow external changes to the saved value (selection in the picker, other editors), unless
  // the user is in the middle of typing a search.
  if (previousValue !== savedValue) {
    setPreviousValue(savedValue)
    if (!isFocused || !linkContext.searchQuery || normalizeLinkHref(draftValue) === savedValue) {
      setDraftValue(savedValue)
    }
  } else if (!isFocused && draftValue !== savedValue) {
    setDraftValue(savedValue)
  }

  const commitDraftValue = () => {
    const nextValue = draftValue.trim()
    const nextHref = normalizeLinkHref(nextValue) || nextValue

    linkContext.setSearchQuery('')

    if (nextHref === savedValue) {
      return
    }

    onChange(nextValue ? set(nextHref) : unset())
  }

  function getIcon() {
    const normalizedHref = normalizeLinkHref(draftValue)
    const matchedRoute = normalizedHref
      ? flattenedRoutes.find((item) => item.path === normalizedHref)
      : null

    if (matchedRoute?.icon) {
      return normalizeLinkIcon(matchedRoute.icon, {shift: true})?.()
    }

    if (normalizedHref) {
      return getSystemLinkIcon(normalizedHref, {shift: true})()
    }

    return undefined
  }

  const pickerOpen = linkContext.canOpenPopover && linkContext.popoverOpen
  const urlElementProps = {
    ...elementProps,
    'aria-expanded': linkContext.canOpenPopover ? pickerOpen : undefined,
    'aria-controls': pickerOpen ? linkContext.popoverId : undefined,
    'icon': getIcon(),
    'value': draftValue,
    'clearButton':
      draftValue && !readOnly
        ? {
            icon: isValidLink(draftValue) ? SmallEditIcon : CloseIcon,
          }
        : false,
    'onBlur': (event: FocusEvent<HTMLInputElement>) => {
      elementProps.onBlur(event)
      setFocused(false)
      commitDraftValue()
      linkContext.closePopover()
    },
    'onChange': (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.currentTarget.value
      setDraftValue(nextValue)
      if (linkContext.canOpenPopover) {
        linkContext.setSearchQuery(nextValue)
      }
    },
    'onClear': () => {
      if (readOnly) return
      linkContext.closePopover()
      setDraftValue('')
      onChange(unset())
    },
    'onKeyDown': (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        commitDraftValue()
        linkContext.closePopover()
      }

      if (event.key === 'Escape' && linkContext.popoverOpen) {
        // Close the picker without also closing the surrounding dialog or pane
        event.preventDefault()
        event.stopPropagation()
        linkContext.closePopover()
      }
    },
    'onFocus': (event: FocusEvent<HTMLInputElement>) => {
      // Lets Studio track focus and presence for this field
      elementProps.onFocus(event)
      setFocused(true)
      if (!linkContext.canOpenPopover || readOnly) {
        return
      }

      const normalizedHref = normalizeLinkHref(draftValue)
      const isSavedHref = normalizedHref === draftValue.trim()
      const matchesRoute = flattenedRoutes.some((item) => item.path === draftValue)

      linkContext.setSearchQuery(matchesRoute || isSavedHref ? '' : draftValue)
      linkContext.openPopover()
    },
  }

  return renderDefault({...props, elementProps: urlElementProps})
}

export function isValidLink(url: string | null | undefined): boolean {
  return Boolean(normalizeLinkHref(url))
}
