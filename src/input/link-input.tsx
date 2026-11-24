import {Box, Grid, Stack} from '@sanity/ui'
import {useCallback, useEffect, useMemo} from 'react'
import {unset, useTranslation} from 'sanity'

import {getSystemLinkType, normalizeLinkHref} from '../href'
import {linkPickerLocaleNamespace} from '../i18n'
import {VisualEditorNavigator, getSystemLinkIcon, normalizeLinkIcon} from '../navigator'
import {buildSelectionPatches, type LinkSelection} from '../patches'
import {
  applyReferenceTypes,
  getFlattenedLinkRoutes,
  getReferenceTypesFromRoutes,
  getReferenceTypesFromSchemaType,
  isProduction,
  type LinkRouteDefinition,
  type LinksPluginProps,
} from '../routes'
import type {LinkInputProps} from '../types'
import {getMemberFieldName, withInputComponent} from './members'
import {LinkPreset, PickerField, PickerNavigatorProps} from './picker-field'
import {ReferencePreviewInput} from './reference-preview-input'
import {URLInputComponent, getContactText} from './url-input'

type RouteConfig = LinkRouteDefinition[] | LinksPluginProps | undefined

const NO_ROUTES: LinkRouteDefinition[] = []

function resolveRoutes(routes: RouteConfig): LinkRouteDefinition[] {
  if (!routes) {
    return NO_ROUTES
  }

  return Array.isArray(routes) ? routes : routes.routes
}

const BUILT_IN_FIELD_NAMES = new Set(['label', 'url', 'reference'])

export function LinkInput(props: LinkInputProps) {
  const {members, onChange, onPathFocus, readOnly, renderDefault, schemaType, value} = props
  const {t} = useTranslation(linkPickerLocaleNamespace)

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

  // Shown as a card instead of the text input when not editing: a preset route's path shows as
  // that route; any other valid email or phone link shows its address or number
  const getPreset = useCallback(
    (href: string): LinkPreset | null => {
      if (!href) return null
      const route = flattenedRoutes.find((item) => item.path === href)
      if (route) {
        return {
          title: route.title,
          icon: normalizeLinkIcon(route.icon) ?? getSystemLinkIcon(route.path),
        }
      }
      const type = getSystemLinkType(href)
      if ((type === 'email' || type === 'phone') && normalizeLinkHref(href) === href) {
        return {
          title: getContactText(href),
          detail: t(type === 'email' ? 'link.email' : 'link.phone'),
          icon: getSystemLinkIcon(href),
        }
      }
      return null
    },
    [flattenedRoutes, t],
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
      getPreset={getPreset}
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
