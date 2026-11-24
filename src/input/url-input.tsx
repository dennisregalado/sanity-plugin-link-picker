import {CloseIcon} from '@sanity/icons/Close'
import {EditIcon} from '@sanity/icons/Edit'
import {Box, Button, Card, Flex, Text} from '@sanity/ui'
import {Tooltip} from '@sanity/ui/tooltip'
import {type FocusEvent, type ChangeEvent, type KeyboardEvent, useEffect, useState} from 'react'
import {
  type InputProps,
  SanityDefaultPreview,
  set,
  type StringInputProps,
  unset,
  useTranslation,
} from 'sanity'

import {linkPickerLocaleNamespace} from '../i18n'
import {LinkPreset, usePickerContext} from './picker-field'

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
  // Set when the preset card is clicked: show the text input and move focus into it
  const [editing, setEditing] = useState(false)
  const {normalizeHref} = linkContext
  const inputId = elementProps.id

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
    'value': draftValue,
    'clearButton': draftValue && !readOnly ? {icon: CloseIcon} : false,
    'onBlur': (event: FocusEvent<HTMLInputElement>) => {
      elementProps.onBlur(event)
      setFocused(false)
      setEditing(false)
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

  const preset = linkContext.getPreset?.(savedValue) ?? null
  const showPreset = Boolean(preset) && !isFocused && !editing && !props.focused

  // The text input mounts on the render after the card is clicked; focus it once it's there
  useEffect(() => {
    if (editing && !isFocused) document.getElementById(inputId)?.focus()
  }, [editing, inputId, isFocused])

  if (preset && showPreset) {
    return (
      <PresetLinkPreview
        href={savedValue}
        preset={preset}
        readOnly={readOnly}
        onEdit={() => setEditing(true)}
        onReplace={() => {
          setEditing(true)
          linkContext.replaceReference(props)
        }}
      />
    )
  }

  return renderDefault({...props, elementProps: urlElementProps})
}

/** `mailto:hello@example.com?subject=Hi` → `hello@example.com?subject=Hi`; `tel:+1555` → `+1555`. */
export function getContactText(href: string): string {
  const text = href.replace(/^(mailto|tel):/i, '')
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

const MUTED_TEXT: React.CSSProperties = {color: 'var(--card-muted-fg-color)', marginLeft: '0.5em'}

const SINGLE_LINE: React.CSSProperties = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/**
 * A URL that matches a preset route, shown like a selected reference: the route's icon, title and
 * path. Clicking it edits the URL; the pencil clears it and opens the picker.
 */
function PresetLinkPreview({
  href,
  preset,
  readOnly,
  onEdit,
  onReplace,
}: {
  href: string
  preset: LinkPreset
  readOnly?: boolean
  onEdit: () => void
  onReplace: () => void
}) {
  const {t} = useTranslation(linkPickerLocaleNamespace)

  return (
    <Card border radius={2} overflow="hidden">
      <Flex align="center" style={{height: 33}}>
        <Box flex={1} style={{minWidth: 0}}>
          <Button
            aria-label={t('link.edit')}
            disabled={readOnly}
            mode="bleed"
            padding={0}
            width="fill"
            style={{clipPath: 'inset(3px round 2px)'}}
            onClick={onEdit}
          >
            <Box style={{width: '100%'}}>
              <SanityDefaultPreview
                icon={preset.icon ?? false}
                layout="compact"
                title={
                  <span style={SINGLE_LINE} title={href}>
                    {preset.title}
                    <span style={MUTED_TEXT}>{preset.detail ?? href}</span>
                  </span>
                }
              />
            </Box>
          </Button>
        </Box>
        <Tooltip
          animate
          content={
            <Text size={1} weight="medium">
              {t('link.replace')}
            </Text>
          }
          placement="top"
        >
          <Button
            aria-label={t('link.replace')}
            style={{clipPath: 'inset(3px round 2px)'}}
            disabled={readOnly}
            icon={EditIcon}
            mode="bleed"
            onClick={onReplace}
          />
        </Tooltip>
      </Flex>
    </Card>
  )
}
