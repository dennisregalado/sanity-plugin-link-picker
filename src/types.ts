import type {BaseSchemaDefinition, ObjectInputProps, ObjectSchemaType, PreviewConfig} from 'sanity'

import type {LinkRouteDefinition, LinksPluginProps} from './routes'

/**
 * The weak reference stored for document links.
 *
 * @public
 */
export type LinkReferenceValue = {
  _type: 'reference'
  _ref: string
  _weak?: boolean
}

/**
 * The stored value of a `link` field.
 *
 * @public
 */
export type LinkValue = {
  _key?: string
  _type?: 'link'
  label?: string | null
  url?: string | null
  reference?: LinkReferenceValue | null
}

/**
 * Options for the link picker plugin (second argument to `linkPicker`).
 *
 * @public
 */
export interface LinkFieldPluginOptions {
  /** Additional schema fields appended to the built-in link fields. */
  fields?: any[]

  icon?: BaseSchemaDefinition['icon']

  preview?: PreviewConfig
}

/**
 * Options for an individual link field.
 *
 * @public
 */
export interface LinkFieldOptions {
  /**
   * Per-field link picker route configuration.
   * If provided, this replaces the plugin-level routes for this field.
   */
  routes?: LinkRouteDefinition[] | LinksPluginProps
}

/**
 * The compiled schema type of a `link` field.
 *
 * @public
 */
export type LinkSchemaType = Omit<ObjectSchemaType, 'options'> & {
  options?: LinkFieldOptions
}

/**
 * Props for the link field's input component.
 *
 * @public
 */
export type LinkInputProps = ObjectInputProps<LinkValue, LinkSchemaType> & {
  pluginOptions?: {
    routes?: LinkRouteDefinition[] | LinksPluginProps
  }
}
