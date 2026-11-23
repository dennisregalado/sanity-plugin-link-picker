import {CloseIcon} from '@sanity/icons/Close'
import {EditIcon} from '@sanity/icons/Edit'
import {Box, Button, Card, Flex, Grid, Stack, Text, useClickOutsideEvent} from '@sanity/ui'
import {Popover} from '@sanity/ui/popover'
import {Tooltip} from '@sanity/ui/tooltip'
import {
  type ComponentType,
  createContext,
  type ReactNode,
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

import {AnchorBreadcrumb} from './anchor-breadcrumb'
import {SECTION_ANCHOR_TYPE} from './anchors'
import {normalizeLinkHref} from './href'
import {linkPickerLocaleNamespace} from './i18n'
import {
  type BaseNavigatorProps,
  VisualEditorNavigator,
  getOptionId,
  getSystemLinkIcon,
  normalizeLinkIcon,
} from './navigator'
import {buildSelectionPatches, type LinkSelection} from './patches'
import {
  applyReferenceTypes,
  getFlattenedLinkRoutes,
  getReferenceTypesFromRoutes,
  getReferenceTypesFromSchemaType,
  isProduction,
  type LinkRouteDefinition,
  type LinksPluginProps,
} from './routes'
import type {LinkInputProps} from './types'

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
export function getMemberFieldName(member: ObjectMember): string | undefined {
  if (member.kind === 'field') return member.name
  if (member.kind === 'error') return member.fieldName
  return undefined
}

export function withInputComponent(
  member: ObjectMember,
  input: ComponentType<InputProps>,
  options: {hideTitle?: boolean} = {},
): ObjectMember {
  if (member.kind !== 'field') {
    return member
  }

  return {
    ...member,
    field: {
      ...member.field,
      schemaType: {
        ...member.field.schemaType,
        // Studio labels a field with its schema type's title
        ...(options.hideTitle ? {title: undefined} : {}),
        components: {input},
      },
    },
  }
}

type PickerContextValue = {
  openPopover: () => void
  closePopover: () => void
  canOpenPopover: boolean
  popoverOpen: boolean
  popoverId: string
  searchQuery: string
  setSearchQuery: (query: string) => void
  replaceReference: (inputProps: InputProps) => void
  /** Turns typed text into the stored `url`, or `null` when it isn't a valid value. */
  normalizeHref: (value: string) => string | null
  /** Icon shown in the URL input for the typed text. */
  getIcon: (value: string) => ReactNode
  /** Whether focusing the input with this text should browse instead of searching for it. */
  isBrowseValue: (value: string) => boolean
  /** The document the surrounding link points to; a selected section on it omits the page. */
  linkedDocumentId?: string
  /** Element id of the keyboard-highlighted option, for aria-activedescendant */
  activeOptionId: string | undefined
  moveActiveOption: (delta: number) => void
  /** Selects the keyboard-highlighted option. Returns false when nothing is highlighted. */
  selectActiveOption: () => boolean
}

const PickerContext = createContext<PickerContextValue | null>(null)

function usePickerContext(): PickerContextValue {
  const context = useContext(PickerContext)
  if (!context) {
    throw new Error('Link picker inputs must be rendered inside a PickerField')
  }
  return context
}

/** Props the picker passes to its navigator. */
export type PickerNavigatorProps = Required<
  Pick<BaseNavigatorProps, 'onSelect' | 'onClose' | 'onNavigate' | 'optionIdPrefix'>
> & {activeOption: string | null; searchQuery: string}

type PickerFieldProps = {
  canOpenPopover: boolean
  readOnly?: boolean
  /** Moves focus to the `url` field after a reference is replaced. */
  onPathFocus: (path: ['url']) => void
  /** Called after the selected reference is cleared with the Replace button. */
  onReplaceReference?: () => void
  onSelect: (selection: LinkSelection) => void
  renderNavigator: (props: PickerNavigatorProps) => ReactNode
  normalizeHref: PickerContextValue['normalizeHref']
  getIcon: PickerContextValue['getIcon']
  isBrowseValue: PickerContextValue['isBrowseValue']
  /** The document the surrounding link points to, if any. */
  linkedDocumentId?: string
  /** Renders the field; attach `setAnchorElement` to the element the popover is placed against. */
  children: (setAnchorElement: (element: HTMLDivElement | null) => void) => ReactNode
}

/**
 * The combobox behaviour shared by the link and anchor inputs: a popover listbox anchored to the
 * field, keyboard navigation and selection. The `url` and `reference` members rendered inside it
 * use {@link URLInputComponent} and {@link ReferencePreviewInput}.
 */
export function PickerField({
  canOpenPopover,
  readOnly,
  onPathFocus,
  onReplaceReference,
  onSelect,
  renderNavigator,
  normalizeHref,
  getIcon,
  isBrowseValue,
  linkedDocumentId,
  children,
}: PickerFieldProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [searchQuery, setSearchQueryState] = useState('')
  const [activeOption, setActiveOption] = useState<string | null>(null)
  const [anchorElement, setAnchorElement] = useState<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()

  useClickOutsideEvent(
    () => {
      if (popoverOpen) {
        setPopoverOpen(false)
      }
    },
    () => [popoverRef.current, anchorElement],
  )

  const openPopover = useCallback(() => {
    if (canOpenPopover) setPopoverOpen(true)
  }, [canOpenPopover])

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query)
    setActiveOption(null)
  }, [])

  const closePopover = useCallback(() => {
    setPopoverOpen(false)
    setSearchQuery('')
  }, [setSearchQuery])

  const clearActiveOption = useCallback(() => setActiveOption(null), [])

  const getOptionElements = useCallback(
    () => [...(popoverRef.current?.querySelectorAll<HTMLElement>('[data-option-key]') ?? [])],
    [],
  )

  const moveActiveOption = useCallback(
    (delta: number) => {
      const options = getOptionElements()
      if (options.length === 0) return
      const current = options.findIndex((option) => option.dataset.optionKey === activeOption)
      let next = Math.min(options.length - 1, Math.max(0, current + delta))
      if (current === -1) next = delta > 0 ? 0 : options.length - 1
      const option = options[next]
      if (!option) return
      setActiveOption(option.dataset.optionKey ?? null)
      option.scrollIntoView({block: 'nearest'})
    },
    [activeOption, getOptionElements],
  )

  const selectActiveOption = useCallback(() => {
    const option = getOptionElements().find((element) => element.dataset.optionKey === activeOption)
    if (!option) return false
    option.click()
    return true
  }, [activeOption, getOptionElements])

  // Moving the mouse hands the highlight back to hover
  const handleMouseMove = useCallback(() => {
    if (activeOption !== null) setActiveOption(null)
  }, [activeOption])

  const replaceReference = useCallback(
    (inputProps: InputProps) => {
      if (readOnly || inputProps.readOnly) return
      inputProps.onChange(unset())
      onReplaceReference?.()
      setSearchQuery('')
      if (canOpenPopover) setPopoverOpen(true)
      onPathFocus(['url'])
    },
    [canOpenPopover, onPathFocus, onReplaceReference, readOnly, setSearchQuery],
  )

  const handleSelect = useCallback(
    (selected: LinkSelection) => {
      if (readOnly) return
      onSelect(selected)
      closePopover()
    },
    [closePopover, onSelect, readOnly],
  )

  const preventBlur = useCallback((event: {preventDefault: () => void}) => {
    // Keep focus in the URL input while clicking inside the picker
    event.preventDefault()
  }, [])

  const contextValue = useMemo<PickerContextValue>(
    () => ({
      openPopover,
      closePopover,
      canOpenPopover,
      popoverOpen,
      popoverId,
      searchQuery,
      setSearchQuery,
      replaceReference,
      normalizeHref,
      getIcon,
      isBrowseValue,
      linkedDocumentId,
      activeOptionId: activeOption ? getOptionId(popoverId, activeOption) : undefined,
      moveActiveOption,
      selectActiveOption,
    }),
    [
      activeOption,
      moveActiveOption,
      selectActiveOption,
      setSearchQuery,
      canOpenPopover,
      closePopover,
      getIcon,
      isBrowseValue,
      linkedDocumentId,
      normalizeHref,
      openPopover,
      popoverId,
      popoverOpen,
      replaceReference,
      searchQuery,
    ],
  )

  return (
    <PickerContext.Provider value={contextValue}>
      <Popover
        referenceElement={anchorElement}
        portal
        matchReferenceWidth
        content={
          // Rich, virtualised rows can't be native <select>/<datalist> options, so this follows
          // the ARIA combobox + listbox pattern
          <Box
            id={popoverId}
            ref={popoverRef}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
            role="listbox"
            onMouseDown={preventBlur}
            onMouseMove={handleMouseMove}
          >
            {renderNavigator({
              activeOption,
              optionIdPrefix: popoverId,
              onNavigate: clearActiveOption,
              searchQuery,
              onClose: closePopover,
              onSelect: handleSelect,
            })}
          </Box>
        }
        padding={0}
        placement="top"
        animate
        open={canOpenPopover && popoverOpen}
      />
      {children(setAnchorElement)}
    </PickerContext.Provider>
  )
}

export function LinkInput(props: LinkInputProps) {
  const {members, onChange, onPathFocus, readOnly, renderDefault, schemaType, value} = props

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

  // The built-in `anchor` field and fields added through `linkPicker(routes, {fields})`, plus any
  // fieldsets/decorations.
  const extraMembers = useMemo(() => {
    return members.filter((member) => {
      const fieldName = getMemberFieldName(member)
      return !fieldName || !BUILT_IN_FIELD_NAMES.has(fieldName)
    })
  }, [members])

  const handleSelect = useCallback(
    (selected: LinkSelection) => onChange(buildSelectionPatches(schemaType.name, selected, value)),
    [onChange, schemaType.name, value],
  )

  // The link no longer points at the page its section anchor is on
  const hasSectionAnchor = Boolean(value?.anchor?.reference)
  const handleReplaceReference = useCallback(() => {
    if (hasSectionAnchor) onChange(unset(['anchor', 'reference']))
  }, [hasSectionAnchor, onChange])

  const getIcon = useCallback(
    (draftValue: string) => {
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
    },
    [flattenedRoutes],
  )

  const isBrowseValue = useCallback(
    (draftValue: string) =>
      normalizeLinkHref(draftValue) === draftValue.trim() ||
      flattenedRoutes.some((item) => item.path === draftValue),
    [flattenedRoutes],
  )

  const renderNavigator = useCallback(
    (navigatorProps: PickerNavigatorProps) => (
      <VisualEditorNavigator {...navigatorProps} routes={routes} />
    ),
    [routes],
  )

  return (
    <PickerField
      canOpenPopover={canOpenPopover}
      readOnly={readOnly}
      onPathFocus={onPathFocus}
      onReplaceReference={handleReplaceReference}
      onSelect={handleSelect}
      renderNavigator={renderNavigator}
      normalizeHref={normalizeLinkHref}
      getIcon={getIcon}
      isBrowseValue={isBrowseValue}
    >
      {(setAnchorElement) => (
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
      )}
    </PickerField>
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

export function ReferencePreviewInput(props: InputProps) {
  const linkContext = usePickerContext()
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
  if (linkTarget && linkTarget.documentType === SECTION_ANCHOR_TYPE) {
    // Sections show where they live: Page › Section
    preview = (
      <AnchorBreadcrumb
        anchorId={linkTarget.documentId}
        linkedDocumentId={linkContext.linkedDocumentId}
      />
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

export function URLInputComponent(props: InputProps) {
  // The `url` field is always a string field
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return <URLInput {...(props as StringInputProps)} />
}

function URLInput(props: StringInputProps) {
  const linkContext = usePickerContext()
  const {elementProps, onChange, readOnly, renderDefault, value} = props
  const savedValue = typeof value === 'string' ? value : ''
  const [draftValue, setDraftValue] = useState(savedValue)
  const [isFocused, setFocused] = useState(false)
  const [previousValue, setPreviousValue] = useState(savedValue)
  const {normalizeHref} = linkContext

  // Follow external changes to the saved value (selection in the picker, other editors), unless
  // the user is in the middle of typing a search.
  if (previousValue !== savedValue) {
    setPreviousValue(savedValue)
    if (!isFocused || !linkContext.searchQuery || normalizeHref(draftValue) === savedValue) {
      setDraftValue(savedValue)
    }
  } else if (!isFocused && draftValue !== savedValue) {
    setDraftValue(savedValue)
  }

  const commitDraftValue = () => {
    const nextValue = draftValue.trim()
    const nextHref = normalizeHref(nextValue) || nextValue

    linkContext.setSearchQuery('')

    if (nextHref === savedValue) {
      return
    }

    onChange(nextValue ? set(nextHref) : unset())
  }

  const pickerOpen = linkContext.canOpenPopover && linkContext.popoverOpen
  const urlElementProps = {
    ...elementProps,
    'role': linkContext.canOpenPopover ? 'combobox' : undefined,
    'aria-autocomplete': linkContext.canOpenPopover ? ('list' as const) : undefined,
    'aria-expanded': linkContext.canOpenPopover ? pickerOpen : undefined,
    'aria-controls': pickerOpen ? linkContext.popoverId : undefined,
    'aria-activedescendant': pickerOpen ? linkContext.activeOptionId : undefined,
    'icon': linkContext.getIcon(draftValue),
    'value': draftValue,
    'clearButton': draftValue && !readOnly ? {icon: CloseIcon} : false,
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
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && linkContext.canOpenPopover) {
        event.preventDefault()
        if (linkContext.popoverOpen) {
          linkContext.moveActiveOption(event.key === 'ArrowDown' ? 1 : -1)
        } else {
          linkContext.openPopover()
        }
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        // Enter picks the highlighted option (or opens the highlighted folder)
        if (linkContext.popoverOpen && linkContext.selectActiveOption()) return
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

      linkContext.setSearchQuery(linkContext.isBrowseValue(draftValue) ? '' : draftValue)
      linkContext.openPopover()
    },
  }

  return renderDefault({...props, elementProps: urlElementProps})
}
