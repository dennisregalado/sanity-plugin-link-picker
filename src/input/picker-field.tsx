import {Box, useClickOutsideEvent} from '@sanity/ui'
import {Popover} from '@sanity/ui/popover'
import {
  createContext,
  type ElementType,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import {type InputProps, unset} from 'sanity'

import {type BaseNavigatorProps, getOptionId} from '../navigator'
import {type LinkSelection} from '../patches'

/** A preset route a link value matches: `route('Home', '/')`. */
export type LinkPreset = {
  title: string
  /** Muted text after the title. Defaults to the URL. */
  detail?: string
  icon?: ElementType
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
  /** Whether focusing the input with this text should browse instead of searching for it. */
  isBrowseValue: (value: string) => boolean
  /** The document the surrounding link points to; a selected section on it omits the page. */
  linkedDocumentId?: string
  /** The array field holding a document's sections, used to open a page at a section. */
  sectionsField?: string
  /** The preset route a saved value matches, shown as a card instead of the text input. */
  getPreset?: (value: string) => LinkPreset | null
  /** Element id of the keyboard-highlighted option, for aria-activedescendant */
  activeOptionId: string | undefined
  moveActiveOption: (delta: number) => void
  /** Selects the keyboard-highlighted option. Returns false when nothing is highlighted. */
  selectActiveOption: () => boolean
}

const PickerContext = createContext<PickerContextValue | null>(null)

export function usePickerContext(): PickerContextValue {
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
  isBrowseValue: PickerContextValue['isBrowseValue']
  /** The document the surrounding link points to, if any. */
  linkedDocumentId?: string
  /** The array field holding a document's sections, used to open a page at a section. */
  sectionsField?: string
  getPreset?: PickerContextValue['getPreset']
  /** Renders the field; attach `setAnchorElement` to the element the popover is placed against. */
  children: (setAnchorElement: (element: HTMLDivElement | null) => void) => ReactNode
}

/**
 * The combobox behaviour shared by the link and anchor inputs: a popover listbox anchored to the
 * field, keyboard navigation and selection. The `url` and `reference` members rendered inside it
 * use `URLInputComponent` and `ReferencePreviewInput`.
 */
export function PickerField({
  canOpenPopover,
  readOnly,
  onPathFocus,
  onReplaceReference,
  onSelect,
  renderNavigator,
  normalizeHref,
  isBrowseValue,
  linkedDocumentId,
  sectionsField,
  getPreset,
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
      isBrowseValue,
      linkedDocumentId,
      sectionsField,
      getPreset,
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
      getPreset,
      isBrowseValue,
      linkedDocumentId,
      normalizeHref,
      sectionsField,
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
