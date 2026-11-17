import type {ElementType, ReactNode} from 'react'
import type {QueryParams} from 'sanity'

/**
 * An icon for a route, group or document folder: a component (such as one from `@sanity/icons`),
 * a React element, or a string such as an emoji.
 *
 * @public
 */
export type LinkIconInput = ElementType | ReactNode | string

/**
 * A static path shown in the picker. Selecting it stores `path` in the link's `url`. Create with {@link route}.
 *
 * @public
 */
export type StaticLinkRoute = {
  type: 'route'
  title: string
  path: string
  icon?: LinkIconInput
}

/**
 * A labelled section of routes in the picker. Create with {@link group}.
 *
 * @public
 */
export type LinkRouteGroup = {
  type: 'group'
  title: string
  icon?: LinkIconInput
  routes: LinkRouteDefinition[]
}

/**
 * A browsable folder of documents of one type. Selecting a document stores a weak reference. Create with {@link documents}.
 *
 * @public
 */
export type LinkDocumentFolder = {
  type: 'documents'
  title: string
  documentType: string
  icon?: LinkIconInput
  filter?: string
  filterParams?: QueryParams
}

/**
 * Any entry in the link picker menu.
 *
 * @public
 */
export type LinkRouteDefinition = StaticLinkRoute | LinkRouteGroup | LinkDocumentFolder

/**
 * A link picker menu, as returned by {@link defineLinkMenu}.
 *
 * @public
 */
export type LinksPluginProps = {
  routes: LinkRouteDefinition[]
}

/**
 * Defines a link picker menu and warns in development about malformed routes (for example paths that don't start with `/`).
 *
 * @public
 */
export function defineLinkMenu(routes: LinkRouteDefinition[]): LinksPluginProps {
  const config = {routes}
  validateLinksConfig(config)
  return config
}

export function getFlattenedLinkRoutes(routes: LinkRouteDefinition[]): StaticLinkRoute[] {
  const result: StaticLinkRoute[] = []

  for (const route of routes) {
    if (route.type === 'group') {
      result.push(...getFlattenedLinkRoutes(route.routes))
    } else if (route.type === 'route') {
      result.push(route)
    }
  }

  return result
}

export function getReferenceTypesFromRoutes(routes: LinkRouteDefinition[]): string[] {
  const documentTypes = new Set<string>()

  for (const route of routes) {
    if (route.type === 'group') {
      for (const type of getReferenceTypesFromRoutes(route.routes)) {
        documentTypes.add(type)
      }
    }

    if (route.type === 'documents') {
      documentTypes.add(route.documentType)
    }
  }

  return Array.from(documentTypes)
}

export function getReferenceTypesFromSchemaType(
  schemaType: unknown,
  fieldName = 'reference',
): string[] {
  const fields = (schemaType as any)?.fields
  const referenceField = Array.isArray(fields)
    ? fields.find((field) => field?.name === fieldName)
    : undefined
  const to = referenceField?.type?.to || referenceField?.to

  if (!Array.isArray(to)) {
    return []
  }

  return to
    .map((target) => target?.name || target?.type)
    .filter((type): type is string => typeof type === 'string')
}

/**
 * Creates a static route.
 *
 * @param title - Label shown in the picker, and used as the link label when selected
 * @param path - Stored in the link's `url` when selected
 *
 * @public
 */
export function route(
  title: string,
  path: string,
  options?: Omit<StaticLinkRoute, 'type' | 'title' | 'path'>,
): StaticLinkRoute {
  return {type: 'route', title, path, ...options}
}

/**
 * Creates a labelled group of routes.
 *
 * @param title - Section heading shown in the picker
 * @param routes - Routes, groups or document folders in the group
 *
 * @public
 */
export function group(
  title: string,
  routes: LinkRouteDefinition[],
  options?: Omit<LinkRouteGroup, 'type' | 'title' | 'routes'>,
): LinkRouteGroup {
  return {
    type: 'group',
    title,
    routes,
    ...options,
  }
}

/**
 * Creates a folder of documents of one type. Document types used here must also be passed to
 * `linkPicker()` so the link schema's `reference` field accepts them.
 *
 * @param title - Folder label shown in the picker
 * @param documentType - The document type to list and search
 *
 * @public
 */
export function documents(
  title: string,
  documentType: string,
  options?: Omit<LinkDocumentFolder, 'type' | 'title' | 'documentType'>,
): LinkDocumentFolder {
  return {
    type: 'documents',
    title,
    documentType,
    ...options,
  }
}

// Type definitions

/**
 * Removes document folders whose type isn't in `referenceTypes` (the types the link schema's
 * `reference` field accepts). With no accepted types, every document folder is removed.
 */
export function applyReferenceTypes(
  routes: LinkRouteDefinition[],
  referenceTypes: string[],
): LinkRouteDefinition[] {
  if (getReferenceTypesFromRoutes(routes).every((type) => referenceTypes.includes(type))) {
    return routes
  }

  return routes
    .map((route) => {
      if (route.type === 'group') {
        return {
          ...route,
          routes: applyReferenceTypes(route.routes, referenceTypes),
        }
      }

      return route
    })
    .filter((route) => {
      if (route.type !== 'documents') {
        return true
      }

      return referenceTypes.includes(route.documentType)
    })
}

/** Whether development-only warnings should be skipped. Safe when `process` is undefined. */
export function isProduction(): boolean {
  const env: {process?: {env?: {NODE_ENV?: string}}} = globalThis
  return env.process?.env?.NODE_ENV === 'production'
}

function validateLinksConfig(config: LinksPluginProps) {
  if (isProduction()) {
    return
  }

  for (const warning of getLinkConfigWarnings(config.routes)) {
    console.warn(`[sanity-plugin-link-picker] ${warning}`)
  }
}

function getLinkConfigWarnings(routes: LinkRouteDefinition[], path: string[] = []): string[] {
  const warnings: string[] = []

  for (const route of routes) {
    const label = route.title
    const nextPath = [...path, label]

    if (route.type === 'route' && !route.path.startsWith('/')) {
      warnings.push(`${nextPath.join(' > ')} path should start with "/".`)
    }

    if (route.type === 'group') {
      warnings.push(...getLinkConfigWarnings(route.routes, nextPath))
    }
  }

  return warnings
}
